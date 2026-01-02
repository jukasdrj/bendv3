// src/services/edge-cache.ts

import type { ExecutionContext } from '@cloudflare/workers-types'
import type { Env } from '../types/env.ts'

/**
 * Cache event for tracking
 */
interface CacheEvent {
  type: 'hit' | 'miss' | 'write'
  prefix: string
  key: string
  timestamp: number
  age?: number
  stale?: boolean
  ttl?: number
}

/**
 * Edge cache get options
 */
export interface EdgeCacheGetOptions {
  maxAge?: number
  staleWhileRevalidate?: number
}

/**
 * Edge cache result
 */
export interface EdgeCacheResult<T = unknown> {
  data: T
  source: 'EDGE_FRESH' | 'EDGE_STALE'
  age?: number
  stale?: boolean
  latency?: string
}

/**
 * Track edge cache event in CacheMetricsDO (fire-and-forget)
 */
function trackEdgeCacheEvent(env: Env, ctx: ExecutionContext, event: CacheEvent): void {
  if (!env.CACHE_METRICS_DO) {
    return // Skip if DO not available
  }

  const doFetch = async (): Promise<void> => {
    try {
      const id = env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub = env.CACHE_METRICS_DO.get(id)
      // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
      await stub.recordEvent(event)
    } catch (error) {
      console.error('Failed to track edge cache event:', error)
    }
  }

  // Use ctx.waitUntil for non-blocking tracking
  ctx.waitUntil(doFetch())
}

/**
 * Edge Cache Service using Cloudflare's caches.default API
 *
 * Provides ultra-fast caching at Cloudflare edge locations (5-10ms latency).
 * Caches are automatically distributed globally and expire based on TTL.
 *
 * Optimizations:
 * - Stale-While-Revalidate (SWR): Serve stale content while fetching fresh data
 * - Reduces latency during cache misses and upstream failures
 */
export class EdgeCacheService {
  private env: Env
  private ctx: ExecutionContext

  constructor(env: Env, ctx: ExecutionContext) {
    this.env = env
    this.ctx = ctx
  }

  /**
   * Get cached data from edge cache with SWR support
   * @param cacheKey - Unique cache identifier
   * @param options - Cache options
   * @returns Cached data with metadata, or null if miss
   */
  async get<T = unknown>(
    cacheKey: string,
    options: EdgeCacheGetOptions = {},
  ): Promise<EdgeCacheResult<T> | null> {
    const maxAge = options.maxAge || 3600 // 1 hour fresh
    const staleWhileRevalidate = options.staleWhileRevalidate || 86400 // 24 hours stale
    const timestamp = Date.now()

    try {
      const cache = caches.default
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: 'GET',
      })

      const response = await cache.match(request)
      if (response) {
        const age = Number.parseInt(response.headers.get('Age') || '0', 10)
        const data = (await response.json()) as T

        // Fresh hit
        if (age < maxAge) {
          // Track fresh edge cache hit
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: 'hit',
            prefix: 'edge',
            key: cacheKey,
            timestamp,
            age,
          })

          return {
            data,
            source: 'EDGE_FRESH',
            age,
            latency: '<10ms',
          }
        }

        // Stale hit (serve stale, background refresh handled by caller)
        if (age < maxAge + staleWhileRevalidate) {
          // Track stale edge cache hit (still counts as hit)
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: 'hit',
            prefix: 'edge',
            key: cacheKey,
            timestamp,
            age,
            stale: true,
          })

          return {
            data,
            source: 'EDGE_STALE',
            age,
            stale: true,
            latency: '<10ms',
          }
        }
      }
    } catch (error) {
      console.error(`Edge cache get failed for ${cacheKey}:`, error)
    }

    // Cache miss - track it
    trackEdgeCacheEvent(this.env, this.ctx, {
      type: 'miss',
      prefix: 'edge',
      key: cacheKey,
      timestamp,
    })

    return null
  }

  /**
   * Store data in edge cache with TTL and SWR support
   * @param cacheKey - Unique cache identifier
   * @param data - Data to cache (must be JSON-serializable)
   * @param ttl - Fresh TTL in seconds (max-age)
   * @param staleWhileRevalidate - Stale TTL in seconds (default: 24 hours)
   */
  async set(
    cacheKey: string,
    data: unknown,
    ttl: number,
    staleWhileRevalidate = 86400,
  ): Promise<void> {
    const timestamp = Date.now()

    try {
      const cache = caches.default
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: 'GET',
      })

      const response = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${staleWhileRevalidate}`,
          'X-Cache-Source': 'edge',
          'X-Cache-TTL': ttl.toString(),
          'X-Cache-SWR': staleWhileRevalidate.toString(),
        },
      })

      await cache.put(request, response)

      // Track edge cache write
      trackEdgeCacheEvent(this.env, this.ctx, {
        type: 'write',
        prefix: 'edge',
        key: cacheKey,
        timestamp,
        ttl,
      })
    } catch (error) {
      console.error(`Edge cache set failed for ${cacheKey}:`, error)
      // Don't throw - cache failures shouldn't break user requests
    }
  }
}
