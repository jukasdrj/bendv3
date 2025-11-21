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

import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js'

export async function handleCacheMetrics(request, env) {
  try {
    const url = new URL(request.url);
    const window = url.searchParams.get("window") || "hour";

    // Validate window parameter
    const validWindows = ["minute", "hour", "day", "total"];
    if (!validWindows.includes(window)) {
      return createErrorResponse(
        `window must be one of: ${validWindows.join(", ")}`,
        400,
        ErrorCodes.INVALID_REQUEST,
        { validWindows },
        request
      )
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
      return createErrorResponse(
        "Failed to retrieve cache statistics",
        500,
        ErrorCodes.INTERNAL_ERROR,
        { doStatus: response.status, doStatusText: response.statusText },
        request
      )
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
    return createSuccessResponse(
      {
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
      {
        source: "cache_metrics_do",
        cached: false,
      },
      200,
      request
    )
  } catch (error) {
    console.error("Failed to fetch cache metrics:", error);
    return createErrorResponse(
      "Failed to fetch cache metrics",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { errorMessage: error.message },
      request
    )
  }
}
