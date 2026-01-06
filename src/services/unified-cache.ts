// src/services/unified-cache.ts

import type { ExecutionContext } from '@cloudflare/workers-types'
import { getCacheTTL } from '../config/cache-ttl.js'
import type { Env } from '../types/env.js'
import { EdgeCacheService } from './edge-cache.js'
import { KVCacheService } from './kv-cache.js'

/**
 * Cache tier types
 */
export type CacheTier = 'kv' | 'd1' | 'edge'

/**
 * Cache result metadata
 */
export interface CacheMetadata {
  source: string
  cached?: boolean
  timestamp?: string
  age?: number
  stale?: boolean
  latency?: string
}

/**
 * Cached data with metadata
 */
export interface CachedData<T> {
  data: T | null
  source: string
  age?: number
  ttl?: number
  stale?: boolean
  latency?: string
  metadata?: CacheMetadata
}

/**
 * Cache query options
 */
export interface CacheQueryOptions {
  query?: string
  maxResults?: number
  [key: string]: unknown
}

/**
 * Cache event options
 */
interface CacheEventOptions {
  source?: string
  age?: number
  stale?: boolean
  ttl?: number
  [key: string]: unknown
}

/**
 * Unified Cache Service - Single entry point for all cache operations
 *
 * Routes requests intelligently through cache tiers:
 * 1. Edge Cache (caches.default) - 5-10ms, 80% hit rate
 * 2. KV Cache (extended TTLs) - 30-50ms, 15% hit rate
 * 3. External APIs (fallback) - 300-500ms, 5% miss rate
 *
 * Target: 95% overall hit rate, <10ms P50 latency
 */
export class UnifiedCacheService {
  private edgeCache: EdgeCacheService
  private kvCache: KVCacheService
  private env: Env
  private ctx: ExecutionContext

  constructor(env: Env, ctx: ExecutionContext) {
    this.edgeCache = new EdgeCacheService(env, ctx)
    this.kvCache = new KVCacheService(env, ctx)
    this.env = env
    this.ctx = ctx
  }

  /**
   * Get data from cache tiers (Edge → KV → API)
   * @param cacheKey - Cache key
   * @param endpoint - Endpoint type ('title', 'isbn', 'author')
   * @param options - Query options (query, maxResults, etc.)
   * @returns Cached or fresh data with metadata
   */
  async get<T = unknown>(
    cacheKey: string,
    endpoint: string,
    options: CacheQueryOptions = {},
  ): Promise<CachedData<T>> {
    const startTime = Date.now()

    // Tier 1: Edge Cache (fastest, 80% hit rate) with SWR support
    const edgeResult = await this.edgeCache.get<T>(cacheKey, {
      maxAge: getCacheTTL('hot', this.env), // Hot TTL (2h) for freshness
      staleWhileRevalidate: getCacheTTL('cold', this.env), // Cold TTL (14d) for stale
    })

    if (edgeResult) {
      // Track access for popularity analysis (non-blocking)
      this.ctx.waitUntil(this.trackAccess(cacheKey))

      // Fresh hit - return immediately
      if (!edgeResult.stale) {
        this.logMetrics('edge_hit_fresh', cacheKey, Date.now() - startTime)
        return edgeResult as CachedData<T>
      }

      // Stale hit - return stale data but trigger background refresh
      this.logMetrics('edge_hit_stale', cacheKey, Date.now() - startTime)
      console.log(
        `🔄 Serving stale edge cache (age: ${edgeResult.age}s), triggering background refresh`,
      )

      // Background refresh (non-blocking)
      this.ctx.waitUntil(this.refreshStaleCache(cacheKey, endpoint, options))

      return edgeResult as CachedData<T>
    }

    // Tier 2: KV Cache (fast, 15% hit rate)
    const kvResult = await this.kvCache.get(cacheKey, endpoint)
    if (kvResult) {
      // Track access for popularity analysis (non-blocking)
      this.ctx.waitUntil(this.trackAccess(cacheKey))

      // Populate edge cache for next request (async, non-blocking)
      this.ctx.waitUntil(
        this.edgeCache.set(cacheKey, kvResult.data, 6 * 60 * 60), // 6h edge TTL
      )

      this.logMetrics('kv_hit', cacheKey, Date.now() - startTime)
      return kvResult as CachedData<T>
    }

    // Cache miss - fall through to external APIs
    this.logMetrics('api_miss', cacheKey, Date.now() - startTime)
    return { data: null, source: 'MISS', latency: `${Date.now() - startTime}ms` }
  }

  /**
   * Background refresh for stale cache entries
   * Fetches fresh data from API and updates all cache tiers
   *
   * @param cacheKey - Cache key to refresh
   * @param endpoint - Endpoint type
   * @param options - Original query options
   *
   * Strategy:
   * - Parses cache key format (book:isbn:1234567890 or book:title:query)
   * - Fetches fresh data from appropriate service
   * - Updates KV and Edge caches with fresh data
   * - Runs non-blocking via ctx.waitUntil()
   *
   * Non-critical: Failures are logged but don't affect request response
   */
  private async refreshStaleCache(
    cacheKey: string,
    endpoint: string,
    options: CacheQueryOptions,
  ): Promise<void> {
    try {
      console.log(`🔄 Background refresh started for: ${cacheKey}`)

      // Parse cache key to determine refresh strategy
      // Format: book:isbn:1234567890 or book:title:query or author:name:xyz
      const [type, subtype, ...valueParts] = cacheKey.split(':')
      const value = valueParts.join(':')

      let freshData: unknown = null

      if (type === 'book' && subtype === 'isbn') {
        // Use findBookByISBN for ISBN lookups
        const { findBookByISBN } = await import('./book-service.js')
        const result = await findBookByISBN(value, this.env)
        freshData = result
      } else if (type === 'book' && subtype === 'title') {
        // Use findBooksByTitle for title searches
        const { findBooksByTitle } = await import('./book-service.js')
        const result = await findBooksByTitle(value, undefined, this.env, options)
        freshData = result
      } else if (type === 'author') {
        // Use findBooksByAuthor for author searches
        const { findBooksByAuthor } = await import('./book-service.js')
        const result = await findBooksByAuthor(value, this.env)
        freshData = result
      }

      if (
        freshData &&
        typeof freshData === 'object' &&
        'works' in freshData &&
        Array.isArray(freshData.works) &&
        freshData.works.length > 0
      ) {
        // Update KV cache
        await this.kvCache.set(cacheKey, freshData, endpoint)
        // Update Edge cache
        await this.edgeCache.set(cacheKey, freshData, 6 * 60 * 60)
        console.log(`✅ Background refresh completed for: ${cacheKey}`)
      } else {
        console.log(`⚠️ Background refresh found no data for: ${cacheKey}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Background refresh failed for ${cacheKey}:`, message)
      // Don't throw - background refresh failures are non-critical
    }
  }

  /**
   * Track cache access for popularity analysis
   * Used to identify most-accessed books for proactive cache warming
   *
   * NOTE: Uses 1% sampling to reduce KV write volume (Issue #112)
   * - 10,000 req/hour → 100 access tracking writes (99% reduction)
   * - Statistically representative for popularity analysis
   * - Configurable via ACCESS_TRACKING_SAMPLE_RATE (default: 0.01)
   *
   * @param cacheKey - Cache key being accessed
   */
  private async trackAccess(cacheKey: string): Promise<void> {
    try {
      // 1% sampling - only track 1 in 100 accesses to reduce KV writes
      const sampleRate = Number.parseFloat(this.env.ACCESS_TRACKING_SAMPLE_RATE || '0.01')
      if (Math.random() >= sampleRate) {
        return // Skip tracking for 99% of requests
      }

      const accessKey = `access:${cacheKey}`
      const current = (await this.env.CACHE.get<{ count: number; lastAccess: number }>(
        accessKey,
        'json',
      )) || {
        count: 0,
        lastAccess: 0,
      }
      await this.env.CACHE.put(
        accessKey,
        JSON.stringify({
          count: current.count + 1,
          lastAccess: Date.now(),
        }),
        { expirationTtl: getCacheTTL('hot', this.env) }, // Use hot TTL for access tracking
      )
    } catch (error) {
      // Non-critical, don't fail request
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`Failed to track cache access for ${cacheKey}:`, message)
    }
  }

  /**
   * Extract cache key prefix (e.g., "book:isbn:123" → "book")
   * @param cacheKey - Full cache key
   * @returns Prefix
   */
  private extractPrefix(cacheKey: string): string {
    const parts = cacheKey.split(':')
    return parts[0] || 'unknown'
  }

  /**
   * Track cache event to CacheMetricsDO
   * @param type - Event type ('hit', 'miss', 'write')
   * @param cacheKey - Cache key
   * @param options - Additional metadata
   */
  private trackCacheEvent(type: string, cacheKey: string, options: CacheEventOptions = {}): void {
    if (!this.env.CACHE_METRICS_DO) return

    try {
      const prefix = this.extractPrefix(cacheKey)
      const timestamp = Date.now()

      // Get DO singleton
      const id = this.env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub = this.env.CACHE_METRICS_DO.get(id)

      // Send event asynchronously (non-blocking)
      this.ctx.waitUntil(
        stub
          .fetch('http://do/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              prefix,
              key: cacheKey,
              timestamp,
              ...options,
            }),
          })
          .catch((error: unknown) => {
            console.error('Failed to track cache event:', error)
          }),
      )
    } catch (error) {
      console.error('Failed to track cache event:', error)
    }
  }

  /**
   * Log cache metrics to Analytics Engine
   * @param event - Event type (edge_hit, kv_hit, api_miss)
   * @param cacheKey - Cache key
   * @param latency - Latency in milliseconds
   */
  private logMetrics(event: string, cacheKey: string, latency: number): void {
    // Track to CacheMetricsDO
    if (event === 'edge_hit_fresh' || event === 'edge_hit_stale') {
      this.trackCacheEvent('hit', cacheKey, { source: 'edge' })
    } else if (event === 'kv_hit') {
      this.trackCacheEvent('hit', cacheKey, { source: 'kv' })
    } else if (event === 'api_miss') {
      this.trackCacheEvent('miss', cacheKey)
    }

    // Also log to Analytics Engine (legacy)
    if (!this.env.CACHE_ANALYTICS) return

    try {
      this.env.CACHE_ANALYTICS.writeDataPoint({
        blobs: [event, cacheKey],
        doubles: [latency],
        indexes: [event],
      })
    } catch (error) {
      console.error('Failed to log cache metrics:', error)
    }
  }
}
