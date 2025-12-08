// src/services/unified-cache.js
import { EdgeCacheService } from "./edge-cache.js";
import { KVCacheService } from "./kv-cache.js";
import { getCacheTTL } from "../config/cache-ttl.js";

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
  constructor(env, ctx) {
    this.edgeCache = new EdgeCacheService(env, ctx);
    this.kvCache = new KVCacheService(env, ctx);
    this.env = env;
    this.ctx = ctx;
  }

  /**
   * Get data from cache tiers (Edge → KV → API)
   * @param {string} cacheKey - Cache key
   * @param {string} endpoint - Endpoint type ('title', 'isbn', 'author')
   * @param {Object} options - Query options (query, maxResults, etc.)
   * @returns {Promise<Object>} Cached or fresh data with metadata
   */
  async get(cacheKey, endpoint, options = {}) {
    const startTime = Date.now();

    // Tier 1: Edge Cache (fastest, 80% hit rate) with SWR support
    const edgeResult = await this.edgeCache.get(cacheKey, {
      maxAge: getCacheTTL('hot', this.env), // Hot TTL (2h) for freshness
      staleWhileRevalidate: getCacheTTL('cold', this.env), // Cold TTL (14d) for stale
    });

    if (edgeResult) {
      // Track access for popularity analysis (non-blocking)
      if (this.ctx?.waitUntil) {
        this.ctx.waitUntil(this.trackAccess(cacheKey));
      }

      // Fresh hit - return immediately
      if (!edgeResult.stale) {
        this.logMetrics("edge_hit_fresh", cacheKey, Date.now() - startTime);
        return edgeResult;
      }

      // Stale hit - return stale data but trigger background refresh
      this.logMetrics("edge_hit_stale", cacheKey, Date.now() - startTime);
      console.log(
        `🔄 Serving stale edge cache (age: ${edgeResult.age}s), triggering background refresh`,
      );

      // Background refresh (non-blocking)
      if (this.ctx?.waitUntil) {
        this.ctx.waitUntil(this.refreshStaleCache(cacheKey, endpoint, options));
      }

      return edgeResult;
    }

    // Tier 2: KV Cache (fast, 15% hit rate)
    const kvResult = await this.kvCache.get(cacheKey, endpoint);
    if (kvResult) {
      // Track access for popularity analysis (non-blocking)
      if (this.ctx?.waitUntil) {
        this.ctx.waitUntil(this.trackAccess(cacheKey));
      }

      // Populate edge cache for next request (async, non-blocking)
      if (this.ctx?.waitUntil) {
        this.ctx.waitUntil(
          this.edgeCache.set(cacheKey, kvResult.data, 6 * 60 * 60), // 6h edge TTL
        );
      }

      this.logMetrics("kv_hit", cacheKey, Date.now() - startTime);
      return kvResult;
    }

    // Cache miss - fall through to external APIs
    this.logMetrics("api_miss", cacheKey, Date.now() - startTime);
    return { data: null, source: "MISS", latency: Date.now() - startTime };
  }

  /**
   * Background refresh for stale cache entries
   * Fetches fresh data from API and updates all cache tiers
   *
   * @param {string} cacheKey - Cache key to refresh
   * @param {string} endpoint - Endpoint type
   * @param {Object} options - Original query options
   *
   * Strategy:
   * - Parses cache key format (book:isbn:1234567890 or book:title:query)
   * - Fetches fresh data from appropriate service
   * - Updates KV and Edge caches with fresh data
   * - Runs non-blocking via ctx.waitUntil()
   *
   * Non-critical: Failures are logged but don't affect request response
   */
  async refreshStaleCache(cacheKey, endpoint, options) {
    try {
      console.log(`🔄 Background refresh started for: ${cacheKey}`)

      // Parse cache key to determine refresh strategy
      // Format: book:isbn:1234567890 or book:title:query or author:name:xyz
      const [type, subtype, ...valueParts] = cacheKey.split(':')
      const value = valueParts.join(':')

      let freshData = null

      if (type === 'book' && subtype === 'isbn') {
        // Use findBookByISBN for ISBN lookups
        const { findBookByISBN } = await import('./book-service.ts')
        const result = await findBookByISBN(value, this.env)
        freshData = result
      } else if (type === 'book' && subtype === 'title') {
        // Use findBooksByTitle for title searches
        const { findBooksByTitle } = await import('./book-service.ts')
        const result = await findBooksByTitle(value, undefined, this.env, options)
        freshData = result
      } else if (type === 'author') {
        // Use findBooksByAuthor for author searches
        const { findBooksByAuthor } = await import('./book-service.ts')
        const result = await findBooksByAuthor(value, this.env)
        freshData = result
      }

      if (freshData && freshData.works && freshData.works.length > 0) {
        // Update KV cache
        await this.kvCache.set(cacheKey, freshData, endpoint)
        // Update Edge cache
        await this.edgeCache.set(cacheKey, freshData, 6 * 60 * 60)
        console.log(`✅ Background refresh completed for: ${cacheKey}`)
      } else {
        console.log(`⚠️ Background refresh found no data for: ${cacheKey}`)
      }
    } catch (error) {
      console.error(`❌ Background refresh failed for ${cacheKey}:`, error.message)
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
   * @param {string} cacheKey - Cache key being accessed
   * @private
   */
  async trackAccess(cacheKey) {
    try {
      // 1% sampling - only track 1 in 100 accesses to reduce KV writes
      const sampleRate = this.env.ACCESS_TRACKING_SAMPLE_RATE || 0.01
      if (Math.random() >= sampleRate) {
        return // Skip tracking for 99% of requests
      }

      const accessKey = `access:${cacheKey}`
      const current = await this.env.CACHE.get(accessKey, 'json') || { count: 0, lastAccess: 0 }
      await this.env.CACHE.put(
        accessKey,
        JSON.stringify({
          count: current.count + 1,
          lastAccess: Date.now()
        }),
        { expirationTtl: getCacheTTL('hot', this.env) } // Use hot TTL for access tracking
      )
    } catch (error) {
      // Non-critical, don't fail request
      console.warn(`Failed to track cache access for ${cacheKey}:`, error.message)
    }
  }


  /**
   * Extract cache key prefix (e.g., "book:isbn:123" → "book")
   * @param {string} cacheKey - Full cache key
   * @returns {string} Prefix
   */
  extractPrefix(cacheKey) {
    const parts = cacheKey.split(":");
    return parts[0] || "unknown";
  }

  /**
   * Track cache event to CacheMetricsDO
   * @param {string} type - Event type ('hit', 'miss', 'write')
   * @param {string} cacheKey - Cache key
   * @param {Object} options - Additional metadata
   */
  trackCacheEvent(type, cacheKey, options = {}) {
    if (!this.env.CACHE_METRICS_DO) return;
    if (!this.ctx?.waitUntil) return; // Skip if no ExecutionContext

    try {
      const prefix = this.extractPrefix(cacheKey);
      const timestamp = Date.now();

      // Get DO singleton
      const id = this.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
      const stub = this.env.CACHE_METRICS_DO.get(id);

      // Send event asynchronously (non-blocking)
      this.ctx.waitUntil(
        stub
          .fetch("http://do/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              prefix,
              key: cacheKey,
              timestamp,
              ...options,
            }),
          })
          .catch((error) => {
            console.error("Failed to track cache event:", error);
          }),
      );
    } catch (error) {
      console.error("Failed to track cache event:", error);
    }
  }

  /**
   * Log cache metrics to Analytics Engine
   * @param {string} event - Event type (edge_hit, kv_hit, api_miss)
   * @param {string} cacheKey - Cache key
   * @param {number} latency - Latency in milliseconds
   */
  logMetrics(event, cacheKey, latency) {
    // Track to CacheMetricsDO
    if (event === "edge_hit_fresh" || event === "edge_hit_stale") {
      this.trackCacheEvent("hit", cacheKey, { source: "edge" });
    } else if (event === "kv_hit") {
      this.trackCacheEvent("hit", cacheKey, { source: "kv" });
    } else if (event === "api_miss") {
      this.trackCacheEvent("miss", cacheKey);
    }

    // Also log to Analytics Engine (legacy)
    if (!this.env.CACHE_ANALYTICS) return;

    try {
      this.env.CACHE_ANALYTICS.writeDataPoint({
        blobs: [event, cacheKey],
        doubles: [latency],
        indexes: [event],
      });
    } catch (error) {
      console.error("Failed to log cache metrics:", error);
    }
  }
}
