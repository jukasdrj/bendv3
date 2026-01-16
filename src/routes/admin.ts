/**
 * Admin Routes
 *
 * Administrative endpoints for triggering background jobs and viewing dashboards.
 * These routes should be protected in production (e.g., via Cloudflare Access).
 *
 * Routes:
 * - POST /admin/trigger-recommendations - Trigger weekly recommendations cron
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from '../types/env.js'
import { createProblemResponse, ErrorCodes } from '../utils/http/response-builder'

export function createAdminRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // POST /admin/trigger-recommendations - Trigger weekly recommendations cron
  router.post('/trigger-recommendations', async (c) => {
    try {
      const { handleRecommendationsCron } = await import('../cron/recommendations-cron')
      await handleRecommendationsCron(c.env)

      return c.json({
        message: 'Weekly recommendations cron triggered successfully',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Failed to trigger recommendations cron:', error)
      return createProblemResponse(ErrorCodes.INTERNAL_ERROR, {
        detail: `Failed to trigger recommendations cron: ${(error as Error).message}`,
        instance: c.req.url,
        requestId: c.get('ctx')?.requestId,
        details: { details: (error as Error).message },
        corsRequest: c.req.raw,
      })
    }
  })

  return router
}
