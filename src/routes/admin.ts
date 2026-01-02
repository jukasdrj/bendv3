/**
 * Admin Routes
 *
 * Administrative endpoints for triggering background jobs and viewing dashboards.
 * These routes should be protected in production (e.g., via Cloudflare Access).
 *
 * Routes:
 * - GET /admin/harvest-dashboard - ISBNdb harvest dashboard
 * - POST /admin/trigger-harvest - Manually trigger author expansion harvest
 * - POST /admin/trigger-recommendations - Trigger weekly recommendations cron
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { handleHarvestDashboard } from '../handlers/harvest-dashboard.js'
import type { Env } from '../types/env'
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'

export function createAdminRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // GET /admin/harvest-dashboard - ISBNdb harvest dashboard
  router.get('/harvest-dashboard', async (c) => {
    return await handleHarvestDashboard(c.req.raw, c.env)
  })

  // POST /admin/trigger-harvest - Manually trigger author expansion harvest
  router.post('/trigger-harvest', async (c) => {
    try {
      console.log('[Admin] Manual harvest trigger requested')
      const { executeAuthorExpansionHarvest } = await import('../handlers/author-expansion-harvest')

      // Get parameters from query string or use defaults
      const authorCount = parseInt(c.req.query('authors') || '10', 10)
      const booksPerAuthor = parseInt(c.req.query('books') || '50', 10)

      console.log(`[Admin] Starting harvest: ${authorCount} authors, ${booksPerAuthor} books each`)

      // Execute harvest (async - don't wait for completion)
      c.executionCtx.waitUntil(
        executeAuthorExpansionHarvest(c.env, authorCount, booksPerAuthor)
          .then((result: unknown) => {
            console.log('[Admin] Harvest completed:', result)
          })
          .catch((error: unknown) => {
            console.error('[Admin] Harvest failed:', error)
          }),
      )

      return c.json({ message: 'Harvest started in background', authorCount, booksPerAuthor }, 202)
    } catch (error) {
      console.error('[Admin] Harvest trigger failed:', error)
      return createErrorResponse(
        'Failed to trigger harvest',
        500,
        ErrorCodes.INTERNAL_ERROR,
        { details: (error as Error).message },
        c.req.raw,
      )
    }
  })

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
      return createErrorResponse(
        `Failed to trigger recommendations cron: ${(error as Error).message}`,
        500,
        ErrorCodes.INTERNAL_ERROR,
        { details: (error as Error).message },
        c.req.raw,
      )
    }
  })

  return router
}
