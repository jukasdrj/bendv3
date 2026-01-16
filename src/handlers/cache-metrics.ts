/**
 * GET /api/cache/metrics - Cache performance and cost metrics
 *
 * Returns real-time cache statistics from CacheMetricsDO
 *
 * Query params:
 * - window: 'minute' | 'hour' | 'day' | 'total' (default: 'hour')
 *
 * @param c - Hono context with Bindings
 * @returns Cache metrics response with hit rates and per-prefix breakdown
 */

import type { Context } from 'hono'
import type { Env } from '../types/env.js'
import { createProblemResponse, ErrorCodes } from '../utils/http/response-builder'

/**
 * Window statistics for cache metrics
 */
interface WindowStats {
  total: {
    reads?: number
    hits?: number
    misses?: number
    writes?: number
    churns?: number
    ttl_effective_hits?: number
  }
  prefixes?: Record<string, PrefixStats>
}

/**
 * Per-prefix cache statistics
 */
interface PrefixStats {
  hits?: number
  misses?: number
  reads?: number
  writes?: number
  churns?: number
  ttl_effective_hits?: number
}

/**
 * Prefix breakdown in response
 */
interface PrefixBreakdown {
  hits?: number
  misses?: number
  reads?: number
  writes?: number
  churns?: number
  hitRate: number
  ttlEffectiveHits?: number
}

/**
 * Overall cache metrics response
 */
interface CacheMetricsResponse {
  window: string
  timestamp: string
  lastUpdated: string
  overall: {
    hits: number
    misses: number
    reads: number
    writes: number
    churns: number
    hitRate: number
    ttlEffectiveHits: number
  }
  byPrefix: Record<string, PrefixBreakdown>
}

/**
 * Statistics object from CacheMetricsDO
 */
interface CacheMetricsStats {
  currentMinute: WindowStats
  currentHour: WindowStats
  currentDay: WindowStats
  total: WindowStats
  lastUpdated: number
}

export async function handleCacheMetrics(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const url = new URL(c.req.url)
    const window = url.searchParams.get('window') || 'hour'

    // Validate window parameter
    const validWindows = ['minute', 'hour', 'day', 'total']
    if (!validWindows.includes(window)) {
      return createProblemResponse(ErrorCodes.INVALID_REQUEST, {
        detail: `window must be one of: ${validWindows.join(', ')}`,
        instance: c.req.url,
        requestId: c.get('ctx')?.requestId,
        details: { validWindows },
        corsRequest: null,
      })
    }

    // Get CacheMetricsDO singleton
    const id = c.env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
    const stub = c.env.CACHE_METRICS_DO.get(id)

    // RPC MIGRATION: Direct method call (no HTTP overhead)
    const stats = (await (
      stub as unknown as { getStats: () => Promise<CacheMetricsStats> }
    ).getStats()) as CacheMetricsStats

    // Extract requested window
    const windowMap: Record<string, WindowStats> = {
      minute: stats.currentMinute,
      hour: stats.currentHour,
      day: stats.currentDay,
      total: stats.total,
    }

    const windowStats = windowMap[window]
    if (!windowStats) {
      return new Response(JSON.stringify({ error: `No stats available for window: ${window}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Calculate hit rate
    const totalReads = windowStats.total?.reads || 0
    const hits = windowStats.total?.hits || 0
    const misses = windowStats.total?.misses || 0
    const hitRate = totalReads > 0 ? (hits / totalReads) * 100 : 0

    // Build per-prefix breakdown
    const prefixBreakdown: Record<string, PrefixBreakdown> = {}
    for (const [prefix, prefixStats] of Object.entries(windowStats.prefixes || {})) {
      const prefixReads = prefixStats.reads || 0
      const prefixHits = prefixStats.hits || 0
      const prefixHitRate = prefixReads > 0 ? (prefixHits / prefixReads) * 100 : 0

      prefixBreakdown[prefix] = {
        hits: prefixStats.hits,
        misses: prefixStats.misses,
        reads: prefixStats.reads,
        writes: prefixStats.writes,
        churns: prefixStats.churns,
        hitRate: Math.round(prefixHitRate * 100) / 100,
        ttlEffectiveHits: prefixStats.ttl_effective_hits || 0,
      }
    }

    // Return canonical response format
    const response: CacheMetricsResponse = {
      window,
      timestamp: new Date().toISOString(),
      lastUpdated: new Date(stats.lastUpdated).toISOString(),
      overall: {
        hits,
        misses,
        reads: totalReads,
        writes: windowStats.total?.writes || 0,
        churns: windowStats.total?.churns || 0,
        hitRate: Math.round(hitRate * 100) / 100,
        ttlEffectiveHits: windowStats.total?.ttl_effective_hits || 0,
      },
      byPrefix: prefixBreakdown,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Failed to fetch cache metrics:', error)
    return createProblemResponse(ErrorCodes.INTERNAL_ERROR, {
      detail: 'Failed to fetch cache metrics',
      instance: c.req.url,
      requestId: c.get('ctx')?.requestId,
      details: { errorMessage: error instanceof Error ? error.message : String(error) },
      corsRequest: null,
    })
  }
}
