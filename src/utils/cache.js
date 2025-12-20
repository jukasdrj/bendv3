/**
 * KV caching utilities
 * Migrated from books-api-proxy caching logic
 */

/**
 * Track cache event in CacheMetricsDO (fire-and-forget)
 * This function dispatches events without blocking or requiring ctx
 */
function trackCacheEvent(env, ctx, event) {
  if (!env.CACHE_METRICS_DO) {
    return // Skip if DO not available
  }

  const doFetch = async () => {
    try {
      const id = env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub = env.CACHE_METRICS_DO.get(id)
      // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
      await stub.recordEvent(event)
    } catch (error) {
      console.error('Failed to track cache event:', error)
    }
  }

  // Use ctx.waitUntil if available, otherwise fire-and-forget
  if (ctx?.waitUntil) {
    ctx.waitUntil(doFetch())
  } else {
    // Fire-and-forget (best effort) - don't await
    doFetch()
  }
}

/**
 * Extract prefix from cache key (e.g., "book:isbn:123" -> "book")
 */
function extractPrefix(key) {
  const parts = key.split(':')
  return parts[0] || 'unknown'
}

/**
 * Get cached data from KV store with metadata
 * @param {string} key - Cache key
 * @param {Object} env - Worker environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil (optional)
 * @returns {Promise<Object|null>} Cached data with metadata or null if not found
 */
export async function getCached(key, env, ctx = null) {
  const timestamp = Date.now()
  const prefix = extractPrefix(key)

  try {
    const { value, metadata } = await env.CACHE.getWithMetadata(key, 'json')
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
 * @param {string} key - Cache key
 * @param {Object} value - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @param {Object} env - Worker environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil (optional)
 * @param {number} hotTtl - Hot TTL in seconds for effectiveness tracking (optional)
 * @returns {Promise<void>}
 */
export async function setCached(key, value, ttl, env, ctx = null, hotTtl = null) {
  const timestamp = Date.now()
  const prefix = extractPrefix(key)

  try {
    const cachedWithMeta = {
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
