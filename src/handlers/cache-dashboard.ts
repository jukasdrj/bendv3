/**
 * Cache Dashboard Handler
 *
 * Provides real-time cache health monitoring and alert history.
 * Part of Issue #99: Add cache dashboard endpoint and integrate CacheMonitor
 *
 * Endpoints:
 * - GET /api/cache/dashboard - Full dashboard (health + alerts + stats)
 * - GET /api/cache/health - Health check only
 * - GET /api/cache/alerts - Alert history only
 */

import type { Context } from 'hono'
import { aggregateMetrics } from '../services/metrics-aggregator.js'
import { checkAlertThresholds } from '../services/alert-monitor.js'
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'

/**
 * Get cache health status
 */
async function getCacheHealth(env: any) {
  try {
    const metrics = await aggregateMetrics(env, '15m')
    const alerts = checkAlertThresholds(metrics)

    const criticalAlerts = alerts.filter(a => a.severity === 'critical')
    const warningAlerts = alerts.filter(a => a.severity === 'warning')

    return {
      healthy: criticalAlerts.length === 0,
      status: criticalAlerts.length > 0 ? 'critical' :
              warningAlerts.length > 0 ? 'degraded' : 'healthy',
      alerts: {
        critical: criticalAlerts.length,
        warning: warningAlerts.length,
        total: alerts.length,
      },
      metrics: {
        hitRate: metrics.hitRates.combined,
        edgeHitRate: metrics.hitRates.edge,
        kvHitRate: metrics.hitRates.kv,
        missRate: 100 - metrics.hitRates.combined,
        totalRequests: metrics.volume.total_requests,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[Cache Dashboard] Health check failed:', error)
    return {
      healthy: false,
      status: 'unknown',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * Get recent alerts from KV storage
 */
async function getRecentAlerts(env: any, limit = 20) {
  try {
    // List alert keys from KV (stored by scheduled-alerts.js)
    const alertKeys = await env.CACHE.list({ prefix: 'alert:stored:', limit: 100 })

    const alerts = []
    for (const key of alertKeys.keys.slice(0, limit)) {
      const alertData = await env.CACHE.get(key.name, 'json')
      if (alertData) {
        alerts.push({
          ...alertData,
          key: key.name,
          storedAt: key.metadata?.timestamp || null,
        })
      }
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => {
      const aTime = a.storedAt || a.timestamp || 0
      const bTime = b.storedAt || b.timestamp || 0
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    return alerts
  } catch (error) {
    console.error('[Cache Dashboard] Failed to fetch recent alerts:', error)
    return []
  }
}

/**
 * Get cache statistics with trend analysis
 */
async function getCacheStats(env: any) {
  try {
    const [now, oneHour, oneDay] = await Promise.all([
      aggregateMetrics(env, '15m'),
      aggregateMetrics(env, '1h'),
      aggregateMetrics(env, '24h'),
    ])

    return {
      current: {
        period: '15m',
        hitRate: now.hitRates.combined,
        edgeHitRate: now.hitRates.edge,
        kvHitRate: now.hitRates.kv,
        r2HitRate: now.hitRates.r2_cold,
        apiMissRate: now.hitRates.api,
        totalRequests: now.volume.total_requests,
        edgeHits: now.volume.edge_hits,
        kvHits: now.volume.kv_hits,
        r2Rehydrations: now.volume.r2_rehydrations,
        apiMisses: now.volume.api_misses,
      },
      trends: {
        oneHour: {
          hitRate: oneHour.hitRates.combined,
          totalRequests: oneHour.volume.total_requests,
        },
        oneDay: {
          hitRate: oneDay.hitRates.combined,
          totalRequests: oneDay.volume.total_requests,
        },
      },
      breakdown: {
        edge: {
          percentage: now.hitRates.edge,
          count: now.volume.edge_hits,
        },
        kv: {
          percentage: now.hitRates.kv,
          count: now.volume.kv_hits,
        },
        r2: {
          percentage: now.hitRates.r2_cold,
          count: now.volume.r2_rehydrations,
        },
        api: {
          percentage: now.hitRates.api,
          count: now.volume.api_misses,
        },
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[Cache Dashboard] Failed to fetch stats:', error)
    throw error
  }
}

/**
 * Handler: GET /api/cache/dashboard
 * Full dashboard with health, alerts, and stats
 */
export async function handleCacheDashboard(c: Context) {
  try {
    const [health, alerts, stats] = await Promise.all([
      getCacheHealth(c.env),
      getRecentAlerts(c.env, 20),
      getCacheStats(c.env),
    ])

    return new Response(JSON.stringify(
      {
        health,
        alerts: {
          recent: alerts,
          count: alerts.length,
        },
        stats,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error('[Cache Dashboard] Dashboard request failed:', error)
    return createErrorResponse(
      `Failed to load cache dashboard: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    )
  }
}

/**
 * Handler: GET /api/cache/health
 * Health check only (lightweight)
 */
export async function handleCacheHealth(c: Context) {
  try {
    const health = await getCacheHealth(c.env)

    return new Response(JSON.stringify(health),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error('[Cache Dashboard] Health check failed:', error)
    return createErrorResponse(
      `Failed to check cache health: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    )
  }
}

/**
 * Handler: GET /api/cache/alerts
 * Alert history only
 */
export async function handleCacheAlerts(c: Context) {
  try {
    const limitParam = c.req.query('limit')
    const limit = limitParam ? parseInt(limitParam) : 20

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return createErrorResponse(
        'Invalid limit parameter (must be 1-100)',
        400,
        ErrorCodes.INVALID_REQUEST,
        { limit: limitParam },
        c.req.raw
      )
    }

    const alerts = await getRecentAlerts(c.env, limit)

    return new Response(JSON.stringify(
      {
        alerts,
        count: alerts.length,
        limit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error('[Cache Dashboard] Alert history request failed:', error)
    return createErrorResponse(
      `Failed to fetch alert history: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    )
  }
}
