// src/services/edge-cache.js

/**
 * Track edge cache event in CacheMetricsDO (fire-and-forget)
 */
function trackEdgeCacheEvent(env, ctx, event) {
  if (!env?.CACHE_METRICS_DO) {
    return; // Skip if DO not available
  }

  const doFetch = async () => {
    try {
      const id = env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
      const stub = env.CACHE_METRICS_DO.get(id);
      await stub.fetch("http://do/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error("Failed to track edge cache event:", error);
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
  constructor(env = null, ctx = null) {
    this.env = env;
    this.ctx = ctx;
  }
  /**
   * Get cached data from edge cache with SWR support
   * @param {string} cacheKey - Unique cache identifier
   * @param {Object} options - Cache options
   * @param {number} options.maxAge - Fresh TTL in seconds (default: 3600)
   * @param {number} options.staleWhileRevalidate - Stale TTL in seconds (default: 86400)
   * @returns {Promise<Object|null>} Cached data with metadata, or null if miss
   */
  async get(cacheKey, options = {}) {
    const maxAge = options.maxAge || 3600; // 1 hour fresh
    const staleWhileRevalidate = options.staleWhileRevalidate || 86400; // 24 hours stale
    const timestamp = Date.now();

    try {
      const cache = caches.default;
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: "GET",
      });

      const response = await cache.match(request);
      if (response) {
        const age = parseInt(response.headers.get("Age") || "0");
        const data = await response.json();

        // Fresh hit
        if (age < maxAge) {
          // Track fresh edge cache hit
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: "hit",
            prefix: "edge",
            key: cacheKey,
            timestamp,
            age,
          });

          return {
            data,
            source: "EDGE_FRESH",
            age,
            latency: "<10ms",
          };
        }

        // Stale hit (serve stale, background refresh handled by caller)
        if (age < maxAge + staleWhileRevalidate) {
          // Track stale edge cache hit (still counts as hit)
          trackEdgeCacheEvent(this.env, this.ctx, {
            type: "hit",
            prefix: "edge",
            key: cacheKey,
            timestamp,
            age,
            stale: true,
          });

          return {
            data,
            source: "EDGE_STALE",
            age,
            stale: true,
            latency: "<10ms",
          };
        }
      }
    } catch (error) {
      console.error(`Edge cache get failed for ${cacheKey}:`, error);
    }

    // Cache miss - track it
    trackEdgeCacheEvent(this.env, this.ctx, {
      type: "miss",
      prefix: "edge",
      key: cacheKey,
      timestamp,
    });

    return null;
  }

  /**
   * Store data in edge cache with TTL and SWR support
   * @param {string} cacheKey - Unique cache identifier
   * @param {Object} data - Data to cache (must be JSON-serializable)
   * @param {number} ttl - Fresh TTL in seconds (max-age)
   * @param {number} staleWhileRevalidate - Stale TTL in seconds (default: 24 hours)
   * @returns {Promise<void>}
   */
  async set(cacheKey, data, ttl, staleWhileRevalidate = 86400) {
    const timestamp = Date.now();

    try {
      const cache = caches.default;
      const request = new Request(`https://cache.internal/${cacheKey}`, {
        method: "GET",
      });

      const response = new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${staleWhileRevalidate}`,
          "X-Cache-Source": "edge",
          "X-Cache-TTL": ttl.toString(),
          "X-Cache-SWR": staleWhileRevalidate.toString(),
        },
      });

      await cache.put(request, response);

      // Track edge cache write
      trackEdgeCacheEvent(this.env, this.ctx, {
        type: "write",
        prefix: "edge",
        key: cacheKey,
        timestamp,
        ttl,
      });
    } catch (error) {
      console.error(`Edge cache set failed for ${cacheKey}:`, error);
      // Don't throw - cache failures shouldn't break user requests
    }
  }
}
