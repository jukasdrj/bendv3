/**
 * Cache Routes
 *
 * Cache performance monitoring, metrics, and dashboard endpoints.
 *
 * Routes:
 * - GET /api/cache/metrics - Cache performance metrics (from handler)
 * - GET /api/cache/stats - Real-time stats from CacheMetricsDO
 * - GET /api/cache/dashboard - Full cache dashboard with health, alerts, and stats
 * - GET /api/cache/health - Lightweight cache health check
 * - GET /api/cache/alerts - Alert history
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { handleCacheMetrics } from '../handlers/cache-metrics.js'
import type { Env } from '../types/env'
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'

// DO stub interface for CacheMetricsDO
interface CacheMetricsStub {
  getStats(): Promise<unknown>
}

export function createCacheRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // GET /metrics - Cache performance metrics (from handler)
  router.get('/metrics', async (c) => {
    return await handleCacheMetrics(c.req.raw, c.env)
  })

  // GET /stats - Real-time cache performance statistics from CacheMetricsDO
  router.get('/stats', async (c) => {
    try {
      const id = c.env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub = c.env.CACHE_METRICS_DO.get(id) as unknown as CacheMetricsStub

      // RPC: Direct method call (no HTTP overhead)
      const stats = await stub.getStats()
      return c.json(stats)
    } catch (error) {
      console.error('Error fetching cache stats:', error)
      return createErrorResponse(
        'Internal server error while fetching cache statistics',
        500,
        ErrorCodes.INTERNAL_ERROR,
        { details: (error as Error).message },
        c.req.raw,
      )
    }
  })

  // GET /dashboard - Full cache dashboard with health, alerts, and stats
  router.get('/dashboard', async (c) => {
    const { handleCacheDashboard } = await import('../handlers/cache-dashboard')
    return await handleCacheDashboard(c)
  })

  // GET /health - Cache health check only (lightweight)
  router.get('/health', async (c) => {
    const { handleCacheHealth } = await import('../handlers/cache-dashboard')
    return await handleCacheHealth(c)
  })

  // GET /alerts - Alert history with optional limit parameter
  router.get('/alerts', async (c) => {
    const { handleCacheAlerts } = await import('../handlers/cache-dashboard')
    return await handleCacheAlerts(c)
  })

  return router
}
