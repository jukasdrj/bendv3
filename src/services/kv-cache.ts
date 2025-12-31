// src/services/kv-cache.ts

import type { Env } from '../types/env.js'
import type { ExecutionContext } from '@cloudflare/workers-types'
import { getAllCacheTTLs } from '../config/cache-ttl.js'
import { getCached, setCached } from '../utils/cache.js'

/**
 * Cached data with metadata
 */
export interface CachedDataResult {
  data: any
  source: string
  age: number
  latency: string
}

/**
 * Cache set options
 */
export interface CacheSetOptions {
  ttl?: number
}

/**
 * KV Cache Service with centralized TTL configuration
 *
 * TTL values are now managed by src/config/cache-ttl.js and can be
 * overridden via environment variables for production tuning.
 *
 * Default TTL Strategy:
 * - Title: 7 days (new editions occasionally)
 * - ISBN: 365 days (ISBN metadata never changes)
 * - Author: 7 days (new books occasionally)
 * - Enrichment: 180 days (very stable metadata)
 * - Cover: 365 days (cover images don't change)
 */
export class KVCacheService {
  private env: Env
  private ctx: ExecutionContext | null
  private ttls: ReturnType<typeof getAllCacheTTLs>

  constructor(env: Env, ctx: ExecutionContext | null = null) {
    this.env = env
    this.ctx = ctx
    // Get TTLs from centralized configuration
    this.ttls = getAllCacheTTLs(env)
  }

  /**
   * Get cached data from KV
   * @param cacheKey - Cache key
   * @param _endpoint - Endpoint type ('title', 'isbn', 'author')
   * @returns Cached data with metadata or null
   */
  async get(cacheKey: string, _endpoint: string): Promise<CachedDataResult | null> {
    try {
      const result = await getCached(cacheKey, this.env, this.ctx)
      if (result) {
        return {
          data: result.data,
          source: 'KV',
          age: result.cacheMetadata.age,
          latency: '30-50ms',
        }
      }
    } catch (error) {
      console.error(`KV cache get failed for ${cacheKey}:`, error)
    }

    return null
  }

  /**
   * Assess data quality for smart TTL adjustment
   * @param data - Response data with items array
   * @returns Quality score 0.0 to 1.0
   */
  assessDataQuality(data: any): number {
    const items = data.items || []
    if (items.length === 0) return 0

    let score = 0
    for (const item of items) {
      const volumeInfo = item.volumeInfo
      const hasISBN = volumeInfo?.industryIdentifiers?.length > 0
      const hasCover = volumeInfo?.imageLinks?.thumbnail
      const hasDescription = volumeInfo?.description?.length > 100

      if (hasISBN) score += 0.4
      if (hasCover) score += 0.4
      if (hasDescription) score += 0.2
    }

    return score / items.length // Average quality across all items
  }

  /**
   * Adjust TTL based on data quality
   * @param baseTTL - Base TTL in seconds
   * @param quality - Quality score 0.0 to 1.0
   * @returns Adjusted TTL in seconds
   */
  adjustTTLByQuality(baseTTL: number, quality: number): number {
    if (quality > 0.8) return baseTTL * 2 // High quality → 2x TTL
    if (quality < 0.4) return baseTTL * 0.5 // Low quality → 0.5x TTL
    return baseTTL // Medium quality → unchanged
  }

  /**
   * Store data in KV with smart TTL adjustment
   * @param cacheKey - Cache key
   * @param data - Data to cache
   * @param endpoint - Endpoint type ('title', 'isbn', 'author')
   * @param options - Optional overrides
   */
  async set(
    cacheKey: string,
    data: any,
    endpoint: string,
    options: CacheSetOptions = {}
  ): Promise<void> {
    try {
      const baseTTL = options.ttl || (this.ttls as any)[endpoint] || this.ttls.title

      // Smart TTL adjustment based on data quality
      const quality = this.assessDataQuality(data)
      const adjustedTTL = this.adjustTTLByQuality(baseTTL, quality)

      // For TTL effectiveness tracking, use original base TTL as "hot" TTL
      // This allows us to measure if extended TTLs are actually useful
      const hotTTL = baseTTL

      await setCached(cacheKey, data, adjustedTTL, this.env, this.ctx, hotTTL)
    } catch (error) {
      console.error(`KV cache set failed for ${cacheKey}:`, error)
      // Don't throw - cache failures shouldn't break user requests
    }
  }
}
