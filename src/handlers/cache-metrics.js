/**
 * GET /api/cache/metrics - Cache performance and cost metrics
 *
 * Returns real-time cache statistics from CacheMetricsDO
 *
 * Query params:
 * - window: 'minute' | 'hour' | 'day' | 'total' (default: 'hour')
 *
 * @param {Request} request
 * @param {Object} env
 * @returns {Response} Metrics summary with hit rates and per-prefix breakdown
 */
export async function handleCacheMetrics(request, env) {
  try {
    const url = new URL(request.url);
    const window = url.searchParams.get("window") || "hour";

    // Validate window parameter
    const validWindows = ["minute", "hour", "day", "total"];
    if (!validWindows.includes(window)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INVALID_PARAM",
            message: `window must be one of: ${validWindows.join(", ")}`,
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get CacheMetricsDO singleton
    const id = env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = env.CACHE_METRICS_DO.get(id);

    // Fetch stats from DO
    const response = await stub.fetch("http://do/stats", { method: "GET" });

    if (!response.ok) {
      console.error(
        "Failed to fetch cache stats from DO:",
        response.status,
        response.statusText,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to retrieve cache statistics",
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const stats = await response.json();

    // Extract requested window
    const windowMap = {
      minute: stats.currentMinute,
      hour: stats.currentHour,
      day: stats.currentDay,
      total: stats.total,
    };

    const windowStats = windowMap[window];

    // Calculate hit rate
    const totalReads = windowStats.total.reads || 0;
    const hits = windowStats.total.hits || 0;
    const misses = windowStats.total.misses || 0;
    const hitRate = totalReads > 0 ? (hits / totalReads) * 100 : 0;

    // Build per-prefix breakdown
    const prefixBreakdown = {};
    for (const [prefix, prefixStats] of Object.entries(
      windowStats.prefixes || {},
    )) {
      const prefixReads = prefixStats.reads || 0;
      const prefixHits = prefixStats.hits || 0;
      const prefixHitRate = prefixReads > 0 ? (prefixHits / prefixReads) * 100 : 0;

      prefixBreakdown[prefix] = {
        hits: prefixStats.hits,
        misses: prefixStats.misses,
        reads: prefixStats.reads,
        writes: prefixStats.writes,
        churns: prefixStats.churns,
        hitRate: Math.round(prefixHitRate * 100) / 100,
        ttlEffectiveHits: prefixStats.ttl_effective_hits || 0,
      };
    }

    // Return canonical response format
    return new Response(
      JSON.stringify(
        {
          success: true,
          data: {
            window,
            timestamp: new Date().toISOString(),
            lastUpdated: new Date(stats.lastUpdated).toISOString(),
            overall: {
              hits,
              misses,
              reads: totalReads,
              writes: windowStats.total.writes || 0,
              churns: windowStats.total.churns || 0,
              hitRate: Math.round(hitRate * 100) / 100,
              ttlEffectiveHits: windowStats.total.ttl_effective_hits || 0,
            },
            byPrefix: prefixBreakdown,
          },
          metadata: {
            source: "cache_metrics_do",
            cached: false,
            timestamp: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache", // Real-time data, don't cache
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch cache metrics:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch cache metrics",
          details: error.message,
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
