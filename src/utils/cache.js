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
    return; // Skip if DO not available
  }

  const doFetch = async () => {
    try {
      const id = env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
      const stub = env.CACHE_METRICS_DO.get(id);
      // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
      await stub.recordEvent(event);
    } catch (error) {
      console.error("Failed to track cache event:", error);
    }
  };

  // Use ctx.waitUntil if available, otherwise fire-and-forget
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(doFetch());
  } else {
    // Fire-and-forget (best effort) - don't await
    doFetch();
  }
}

/**
 * Extract prefix from cache key (e.g., "book:isbn:123" -> "book")
 */
function extractPrefix(key) {
  const parts = key.split(":");
  return parts[0] || "unknown";
}

/**
 * Get cached data from KV store with metadata
 * @param {string} key - Cache key
 * @param {Object} env - Worker environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil (optional)
 * @returns {Promise<Object|null>} Cached data with metadata or null if not found
 */
export async function getCached(key, env, ctx = null) {
  const timestamp = Date.now();
  const prefix = extractPrefix(key);

  try {
    const { value, metadata } = await env.CACHE.getWithMetadata(key, "json");
    if (value) {
      // Track cache hit (non-blocking)
      trackCacheEvent(env, ctx, {
        type: "hit",
        prefix,
        key,
        timestamp,
        hotTtlExpiry: metadata?.hotTtlExpiry,
      });

      // Handle both old format (direct data) and new format (with metadata)
      if (value.data && value.cachedAt) {
        // New format with metadata
        const age = Math.floor((Date.now() - value.cachedAt) / 1000); // Age in seconds
        const ttl = value.ttl || 0;

        return {
          data: value.data,
          cacheMetadata: {
            hit: true,
            age: age,
            ttl: ttl,
          },
        };
      } else {
        // Old format (direct data) - backward compatibility
        return {
          data: value,
          cacheMetadata: {
            hit: true,
            age: 0,
            ttl: 0,
          },
        };
      }
    }
  } catch (error) {
    console.error("Cache read error:", error);
  }

  // Track cache miss (non-blocking)
  trackCacheEvent(env, ctx, {
    type: "miss",
    prefix,
    key,
    timestamp,
  });

  return null;
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
export async function setCached(
  key,
  value,
  ttl,
  env,
  ctx = null,
  hotTtl = null,
) {
  const timestamp = Date.now();
  const prefix = extractPrefix(key);

  try {
    const cachedWithMeta = {
      data: value,
      cachedAt: timestamp, // Timestamp for age calculation
      ttl: ttl, // Original TTL for headers
    };

    // Calculate hot TTL expiry for effectiveness tracking
    const hotTtlExpiry = hotTtl ? timestamp + hotTtl * 1000 : null;

    await env.CACHE.put(key, JSON.stringify(cachedWithMeta), {
      expirationTtl: ttl,
      metadata: hotTtlExpiry ? { hotTtlExpiry } : {},
    });

    // Track cache write (non-blocking)
    trackCacheEvent(env, ctx, {
      type: "write",
      prefix,
      key,
      timestamp,
    });
  } catch (error) {
    console.error("Cache write error:", error);
  }
}

/**
 *
 * @deprecated Use CacheKeyFactory from '../services/cache-key-factory.js' instead.
 * This function is kept for backward compatibility but should not be used in new code.
 *
 * Generate cache key from prefix and parameters
 * @param {string} prefix - Cache key prefix (e.g., 'search:title', 'search:isbn')
 * @param {Object} params - Key-value pairs to include in cache key
 * @returns {string} Generated cache key
 */
export function generateCacheKey(prefix, params) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${prefix}:${sortedParams}`;
}
