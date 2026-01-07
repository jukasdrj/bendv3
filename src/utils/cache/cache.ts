/**
 * KV caching utilities
 * Migrated from books-api-proxy caching logic
 */

/**
 * Minimal environment interface for cache utilities
 * Both Env and ExternalAPIEnv satisfy this interface
 */
export interface CacheEnv {
  CACHE?: KVNamespace
  // Use any to accept both DurableObjectNamespace and DurableObjectNamespace<CacheMetricsDO>
  CACHE_METRICS_DO?: DurableObjectNamespace<any>
}

/**
 * Cache event types for tracking
 */
type CacheEventType = 'hit' | 'miss' | 'write'

/**
 * Cache event data structure
 */
interface CacheEvent {
  type: CacheEventType
  prefix: string
  key: string
  timestamp: number
  hotTtlExpiry?: number
}

/**
 * Cached data with metadata
 */
interface CachedData<T = unknown> {
  data: T
  cachedAt: number
  ttl: number
}

/**
 * Cache response with metadata
 */
interface CacheResponse<T = unknown> {
  data: T
  cacheMetadata: {
    hit: boolean
    age: number
    ttl: number
  }
}

/**
 * Track cache event in CacheMetricsDO (fire-and-forget)
 * This function dispatches events without blocking
 *
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 * @param event - Cache event to track
 */
function trackCacheEvent(env: CacheEnv, ctx: ExecutionContext, event: CacheEvent): void {
  if (!env.CACHE_METRICS_DO) {
    return // Skip if DO not available
  }

  const doFetch = async (): Promise<void> => {
    try {
      if (!env.CACHE_METRICS_DO) return
      const id = env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub: DurableObjectStub<import('../../durable-objects/cache-metrics').CacheMetricsDO> =
        env.CACHE_METRICS_DO.get(id)
      // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
      await stub.recordEvent(event)
    } catch (error) {
      console.error('Failed to track cache event:', error)
    }
  }

  // Use ctx.waitUntil for non-blocking tracking
  ctx.waitUntil(doFetch())
}

/**
 * Extract prefix from cache key (e.g., "book:isbn:123" -> "book")
 *
 * @param key - Cache key to extract prefix from
 * @returns Prefix portion of the key
 */
function extractPrefix(key: string): string {
  const parts = key.split(':')
  return parts[0] || 'unknown'
}

/**
 * Get cached data from KV store with metadata
 *
 * @param key - Cache key
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 * @returns Cached data with metadata or null if not found
 */
export async function getCached<T = unknown>(
  key: string,
  env: CacheEnv,
  ctx: ExecutionContext,
): Promise<CacheResponse<T> | null> {
  const timestamp = Date.now()
  const prefix = extractPrefix(key)

  if (!env.CACHE) {
    return null // Cache not available
  }

  try {
    const { value, metadata } = await env.CACHE.getWithMetadata<
      CachedData<T>,
      { hotTtlExpiry?: number }
    >(key, 'json')

    if (value) {
      // Verify cache format is valid (v3.0+ format with data and cachedAt)
      if (!value.data || !value.cachedAt) {
        console.warn(`Invalid cache format for key ${key}, treating as miss`)
        trackCacheEvent(env, ctx, {
          type: 'miss',
          prefix,
          key,
          timestamp,
        })
        return null
      }

      // Track cache hit (non-blocking)
      trackCacheEvent(env, ctx, {
        type: 'hit',
        prefix,
        key,
        timestamp,
        hotTtlExpiry: metadata?.hotTtlExpiry,
      })

      // Extract metadata from cached value
      const age = Math.floor((Date.now() - value.cachedAt) / 1000) // Age in seconds
      const ttl = value.ttl || 0

      return {
        data: value.data,
        cacheMetadata: {
          hit: true,
          age: age,
          ttl: ttl,
        },
      }
    }
  } catch (error) {
    console.error('Cache read error:', error)
  }

  // Track cache miss (non-blocking)
  trackCacheEvent(env, ctx, {
    type: 'miss',
    prefix,
    key,
    timestamp,
  })

  return null
}

/**
 * Set cached data in KV store with TTL and metadata
 *
 * @param key - Cache key
 * @param value - Data to cache
 * @param ttl - Time to live in seconds
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 * @param hotTtl - Hot TTL in seconds for effectiveness tracking (optional)
 */
export async function setCached<T = unknown>(
  key: string,
  value: T,
  ttl: number,
  env: CacheEnv,
  ctx: ExecutionContext,
  hotTtl: number | null = null,
): Promise<void> {
  const timestamp = Date.now()
  const prefix = extractPrefix(key)

  if (!env.CACHE) {
    return // Cache not available
  }

  try {
    const cachedWithMeta: CachedData<T> = {
      data: value,
      cachedAt: timestamp, // Timestamp for age calculation
      ttl: ttl, // Original TTL for headers
    }

    // Calculate hot TTL expiry for effectiveness tracking
    const hotTtlExpiry = hotTtl ? timestamp + hotTtl * 1000 : null

    await env.CACHE.put(key, JSON.stringify(cachedWithMeta), {
      expirationTtl: ttl,
      metadata: hotTtlExpiry ? { hotTtlExpiry } : {},
    })

    // Track cache write (non-blocking)
    trackCacheEvent(env, ctx, {
      type: 'write',
      prefix,
      key,
      timestamp,
    })
  } catch (error) {
    console.error('Cache write error:', error)
  }
}
