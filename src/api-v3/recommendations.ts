/**
 * V3 Personalized Recommendations Endpoint
 *
 * Provides user-personalized book recommendations:
 * - GET /v3/recommendations/personalized - Personalized book recommendations
 *
 * ARCHITECTURE NOTE (Issue #258):
 * Currently returns weekly recommendations with strategy: "weekly_fallback"
 * until Alexandria ratings endpoints become available. Once Alexandria can
 * provide user preference data and rating history, this endpoint will:
 * 1. Fetch user's book ratings and preferences from Alexandria
 * 2. Compute personalized recommendations based on reading history
 * 3. Return strategy: "preference_based" with preference-driven reasons
 *
 * Blocker: Alexandria ratings endpoints not yet available (tracked in Issue #258)
 * When available: Update handler to call alexandria ratings API and compute matches
 *
 * @module api-v3/recommendations
 */

import { PersonalizedRecommendationsResponseSchema } from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute, z } from '@hono/zod-openapi'
import type { RequestContext } from '../middleware/request-context'
import type { Env } from '../types/env.js'
import { sanitizeErrorMessage } from '../utils/error-sanitizer'

// ============================================================================
// Route Definitions
// ============================================================================

const personalizedRecommendationsRoute = createRoute({
  method: 'get',
  path: '/v3/recommendations/personalized',
  tags: ['Discovery'],
  summary: 'Get personalized book recommendations',
  description: `Returns book recommendations tailored to the user.

Currently powered by weekly recommendations (strategy: "weekly_fallback") while
awaiting Alexandria ratings API availability (Issue #258).

Future capability: Will return personalized recommendations based on:
- User's reading history and book ratings
- Similar books to favorites
- Genre preferences and trends

Query Parameters:
- userId: Required (from header or query param, future: used for preference lookup)
- limit: Number of recommendations (1-20, default 10)`,
  request: {
    query: z.object({
      userId: z
        .string()
        .optional()
        .describe('User ID for personalization (optional, for future use)'),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe('Number of recommendations (1-20)'),
    }),
  },
  responses: {
    200: {
      description: 'Personalized recommendations',
      content: { 'application/json': { schema: PersonalizedRecommendationsResponseSchema } },
    },
    400: {
      description: 'Invalid request parameters',
      content: { 'application/problem+json': { schema: z.any() } },
    },
    404: {
      description: 'No recommendations available',
      content: { 'application/problem+json': { schema: z.any() } },
    },
    500: {
      description: 'Server error',
      content: { 'application/problem+json': { schema: z.any() } },
    },
  },
})

// ============================================================================
// Route Handler
// ============================================================================

/**
 * Register personalized recommendations route on the V3 router
 *
 * @param app - Hono OpenAPI application instance
 */
export function registerPersonalizedRecommendationsRoute(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>,
) {
  // GET /v3/recommendations/personalized
  app.openapi(personalizedRecommendationsRoute, async (c) => {
    const ctx = c.get('ctx')
    const validatedQuery = c.req.valid('query')
    const limit = (validatedQuery.limit ?? 10) as number
    const userId = validatedQuery.userId

    try {
      // FUTURE: Use userId for personalization when Alexandria ratings ready
      // Current behavior: Fall through to weekly recommendations
      if (userId) {
        // Reserved for future implementation
        // const userPreferences = await alexandriaClient.getUserPreferences(userId)
        // const personalizedRecs = await computePersonalizedRecommendations(userPreferences)
        // return with strategy: "preference_based"
        console.log(
          `[V3 Personalized Recommendations] userId requested but not yet implemented: ${userId}`,
        )
      }

      // ========================================================================
      // FALLBACK: Weekly Recommendations (Issue #258 blocker)
      // ========================================================================
      // Until Alexandria ratings endpoints available, return weekly recommendations
      // with strategy: "weekly_fallback"

      // Calculate current week start (Sunday)
      const now = new Date()
      const dayOfWeek = now.getUTCDay()
      const weekStart = new Date(now)
      weekStart.setUTCDate(now.getUTCDate() - dayOfWeek)
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekOf = weekStart.toISOString().split('T')[0]

      // Try KV cache first
      // Cache key format: recommendations:weekly:{weekOf}
      // TTL: 7 days (managed by weekly cron job regeneration)
      const cacheKey = `recommendations:weekly:${weekOf}`
      const cached = (await c.env.CACHE.get(cacheKey, 'json')) as {
        weekOf: string
        recommendations: Array<{
          isbn: string
          title: string
          author: string
          coverUrl?: string
          reason: string
        }>
        generatedAt: string
      } | null

      if (cached?.recommendations && cached.recommendations.length > 0) {
        const recommendations = cached.recommendations.slice(0, limit)

        return c.json(
          {
            success: true as const,
            data: {
              recommendations,
              total: recommendations.length,
              strategy: 'weekly_fallback' as const,
              generatedAt: cached.generatedAt,
            },
            metadata: {
              timestamp: new Date().toISOString(),
              requestId: ctx.requestId,
              source: 'kv-cache' as const,
              cached: true,
              processingTime: Date.now() - ctx.startTime,
            },
            _links: {
              self: {
                href: `/v3/recommendations/personalized?limit=${limit}${userId ? `&userId=${userId}` : ''}`,
                rel: 'self',
                method: 'GET',
              },
            },
          },
          200,
        )
      }

      // Try D1 database
      if (c.env.DB) {
        const result = await c.env.DB.prepare(
          `SELECT week_of, recommendations_json, generated_at
           FROM recommendations
           WHERE week_of = ?
           ORDER BY generated_at DESC
           LIMIT 1`,
        )
          .bind(weekOf)
          .first<{
            week_of: string
            recommendations_json: string
            generated_at: string
          }>()

        if (result?.recommendations_json) {
          try {
            const recommendations = JSON.parse(result.recommendations_json).slice(0, limit)

            return c.json(
              {
                success: true as const,
                data: {
                  recommendations,
                  total: recommendations.length,
                  strategy: 'weekly_fallback' as const,
                  generatedAt: result.generated_at,
                },
                metadata: {
                  timestamp: new Date().toISOString(),
                  requestId: ctx.requestId,
                  source: 'alexandria' as const,
                  cached: false,
                  processingTime: Date.now() - ctx.startTime,
                },
                _links: {
                  self: {
                    href: `/v3/recommendations/personalized?limit=${limit}${userId ? `&userId=${userId}` : ''}`,
                    rel: 'self',
                    method: 'GET',
                  },
                },
              },
              200,
            )
          } catch (parseError) {
            console.error('[V3 Personalized Recommendations] Invalid JSON in D1:', parseError)
            // Fall through to next fallback
          }
        }
      }

      // Fallback: fetch recent books with covers as recommendations
      if (c.env.DB) {
        const fallbackResult = await c.env.DB.prepare(`
          SELECT
            b.isbn,
            b.title,
            b.cover_medium_url,
            json_extract(b.canonical_metadata, '$.authors[0].name') as author
          FROM books b
          WHERE b.cover_medium_url IS NOT NULL
          ORDER BY b.updated_at DESC
          LIMIT ?
        `)
          .bind(limit)
          .all<{
            isbn: string
            title: string
            cover_medium_url: string | null
            author: string | null
          }>()

        if (fallbackResult.results && fallbackResult.results.length > 0) {
          const fallbackRecommendations = fallbackResult.results.map((row) => ({
            isbn: row.isbn,
            title: row.title,
            author: row.author || 'Unknown Author',
            coverUrl: row.cover_medium_url || undefined,
            reason: 'Recently added to our collection',
          }))

          return c.json(
            {
              success: true as const,
              data: {
                recommendations: fallbackRecommendations,
                total: fallbackRecommendations.length,
                strategy: 'weekly_fallback' as const,
                generatedAt: new Date().toISOString(),
              },
              metadata: {
                timestamp: new Date().toISOString(),
                requestId: ctx.requestId,
                source: 'fallback' as const,
                cached: false,
                processingTime: Date.now() - ctx.startTime,
              },
              _links: {
                self: {
                  href: `/v3/recommendations/personalized?limit=${limit}${userId ? `&userId=${userId}` : ''}`,
                  rel: 'self',
                  method: 'GET',
                },
              },
            },
            200,
          )
        }
      }

      // No recommendations and no fallback available
      return c.json(
        createProblemDetails('NOT_FOUND', 'No recommendations available at this time', {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        404,
      )
    } catch (error: any) {
      console.error('[V3 Personalized Recommendations] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', sanitizeErrorMessage(error, c.req.url), {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  console.log('[V3 API] Personalized Recommendations Route: GET /v3/recommendations/personalized')
}
