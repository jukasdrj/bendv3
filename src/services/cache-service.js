/**
 * Cache Service - KV wrapper with performance tracking
 *
 * Wraps all KV operations and dispatches metrics to CacheMetricsDO
 * Uses ctx.waitUntil() for non-blocking event dispatch (<5ms overhead)
 */

/**
 * Dispatch cache event to CacheMetricsDO (non-blocking)
 */
async function trackCacheEvent(env, event) {
  try {
    const id = env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = env.CACHE_METRICS_DO.get(id);
    // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
    await stub.recordEvent(event);
  } catch (error) {
    console.error("Failed to dispatch cache event:", error);
    // Don't throw - metrics are non-critical
  }
}

/**
 * Create cache service for a specific prefix
 *
 * @param {KVNamespace} kv - KV namespace binding
 * @param {string} prefix - Cache key prefix (e.g., 'book', 'author', 'cover')
 * @param {Object} env - Worker environment
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 * @returns {Object} Cache service with get/put methods
 */
export function createCacheService(kv, prefix, env, ctx) {
  const getFullKey = (key) => `${prefix}:${key}`;

  return {
    /**
     * Get item from cache with hit/miss tracking
     */
    async get(key) {
      const fullKey = getFullKey(key);
      const timestamp = Date.now();

      // Use getWithMetadata to track hotTtlExpiry
      const { value, metadata } = await kv.getWithMetadata(fullKey);

      if (value !== null) {
        // Cache hit
        ctx.waitUntil(
          trackCacheEvent(env, {
            type: "hit",
            prefix,
            key: fullKey,
            timestamp,
            hotTtlExpiry: metadata?.hotTtlExpiry,
          }),
        );
        return value;
      } else {
        // Cache miss
        ctx.waitUntil(
          trackCacheEvent(env, {
            type: "miss",
            prefix,
            key: fullKey,
            timestamp,
          }),
        );
        return null;
      }
    },

    /**
     * Put item into cache with write tracking
     *
     * @param {string} key - Cache key
     * @param {string} value - Value to cache
     * @param {number} hotTtlSeconds - Hot TTL in seconds (for effectiveness tracking)
     * @param {number} coldTtlSeconds - Cold TTL in seconds (actual KV expiration)
     */
    async put(key, value, hotTtlSeconds, coldTtlSeconds) {
      const fullKey = getFullKey(key);
      const timestamp = Date.now();
      const hotTtlExpiry = timestamp + hotTtlSeconds * 1000;

      await kv.put(fullKey, value, {
        expirationTtl: coldTtlSeconds,
        metadata: { hotTtlExpiry },
      });

      ctx.waitUntil(
        trackCacheEvent(env, {
          type: "write",
          prefix,
          key: fullKey,
          timestamp,
        }),
      );
    },
  };
}
