/**
 * V3 Discovery Endpoints - Capabilities & Recommendations
 *
 * Provides API discovery and curated content endpoints:
 * - GET /v3/capabilities - API feature discovery
 * - GET /v3/recommendations/weekly - Weekly book recommendations
 *
 * @module api-v3/discovery
 */

import { SuccessResponseSchema } from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createRoute, z } from '@hono/zod-openapi'
import type { RequestContext } from '../middleware/request-context'
import type { Env } from '../types/env.js'
import { sanitizeErrorMessage } from '../utils/error-sanitizer'

// ============================================================================
// Capabilities Schemas (iOS-compatible flat format)
// ============================================================================

// iOS app expects this exact flat structure - no wrapper
// Exported for contract testing
export const CapabilitiesFeaturesSchema = z
  .object({
    semantic_search: z.boolean().describe('Semantic search enabled'),
    similar_books: z.boolean().describe('Similar books search enabled'),
    weekly_recommendations: z.boolean().describe('Weekly recommendations enabled'),
    sse_streaming: z.boolean().describe('SSE streaming enabled'),
    batch_enrichment: z.boolean().describe('Batch enrichment enabled'),
    csv_import: z.boolean().describe('CSV import enabled'),
  })
  .openapi('CapabilitiesFeatures')

export const CapabilitiesLimitsSchema = z
  .object({
    semantic_search_rpm: z.number().int().describe('Semantic search requests per minute'),
    text_search_rpm: z.number().int().describe('Text search requests per minute'),
    csv_max_rows: z.number().int().describe('Maximum rows in CSV import'),
    batch_max_photos: z.number().int().describe('Maximum photos in batch scan'),
  })
  .openapi('CapabilitiesLimits')

// Direct response schema (no wrapper) for iOS compatibility
// Exported for contract testing
export const CapabilitiesResponseSchema = z
  .object({
    features: CapabilitiesFeaturesSchema.describe('Available API features'),
    limits: CapabilitiesLimitsSchema.describe('API limits and quotas'),
    version: z.string().describe('API version'),
  })
  .openapi('CapabilitiesResponse')

// ============================================================================
// Recommendations Schemas
// ============================================================================

// Exported for contract testing
export const RecommendationSchema = z
  .object({
    isbn: z.string().describe('Book ISBN'),
    title: z.string().describe('Book title'),
    author: z.string().describe('Primary author'),
    coverUrl: z.string().url().optional().describe('Cover image URL'),
    reason: z.string().describe('Why this book is recommended'),
  })
  .openapi('Recommendation')

export const RecommendationsDataSchema = z
  .object({
    weekOf: z.string().describe('Week start date (ISO 8601)'),
    recommendations: z.array(RecommendationSchema).describe('Recommended books'),
    count: z.number().int().describe('Number of recommendations returned'),
    totalAvailable: z.number().int().describe('Total recommendations available'),
  })
  .openapi('RecommendationsData')

export const RecommendationsResponseSchema = SuccessResponseSchema(RecommendationsDataSchema)

// ============================================================================
// Route Definitions
// ============================================================================

const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/v3/capabilities',
  tags: ['Discovery'],
  summary: 'Get API capabilities',
  description: `Returns API feature availability, limits, and deprecation notices.

Clients should call this on app startup to:
- Discover available features
- Check API version compatibility
- Learn rate limits before hitting them
- Prepare for deprecated endpoint sunset`,
  responses: {
    200: {
      description: 'API capabilities',
      content: { 'application/json': { schema: CapabilitiesResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/problem+json': { schema: z.any() } },
    },
  },
})

const recommendationsRoute = createRoute({
  method: 'get',
  path: '/v3/recommendations/weekly',
  tags: ['Discovery'],
  summary: 'Get weekly book recommendations',
  description: `Returns global weekly book recommendations.

Non-personalized curated picks generated every Sunday at midnight UTC.
Recommendations are cached for performance and updated weekly.`,
  request: {
    query: z.object({
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
      description: 'Weekly recommendations',
      content: { 'application/json': { schema: RecommendationsResponseSchema } },
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
// Route Handlers
// ============================================================================

/**
 * Register discovery routes on the V3 router
 */
export function registerDiscoveryRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>,
) {
  // GET /v3/capabilities
  // Returns iOS-compatible flat format (no wrapper)
  app.openapi(capabilitiesRoute, async (c) => {
    const ctx = c.get('ctx')

    try {
      // iOS app expects this exact flat structure
      const capabilities = {
        features: {
          semantic_search: true,
          similar_books: true,
          weekly_recommendations: true,
          sse_streaming: true,
          batch_enrichment: true,
          csv_import: true,
        },
        limits: {
          semantic_search_rpm: 10,
          text_search_rpm: 60,
          csv_max_rows: 1000,
          batch_max_photos: 50,
        },
        version: '3.4.3',
      }

      // Add edge caching for static capabilities response
      // Cache for 5 minutes (300s) on Cloudflare edge
      c.header('Cache-Control', 'public, max-age=300, s-maxage=300')

      return c.json(capabilities, 200)
    } catch (error: any) {
      console.error('[V3 Capabilities] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', sanitizeErrorMessage(error, c.req.url), {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  // GET /v3/recommendations/weekly
  app.openapi(recommendationsRoute, async (c) => {
    const ctx = c.get('ctx')
    const validatedQuery = c.req.valid('query')
    // Query param is typed as number after z.coerce.number() validation
    const limit = (validatedQuery.limit ?? 10) as number

    try {
      // Calculate current week start (Sunday)
      const now = new Date()
      const dayOfWeek = now.getUTCDay()
      const weekStart = new Date(now)
      weekStart.setUTCDate(now.getUTCDate() - dayOfWeek)
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekOf = weekStart.toISOString().split('T')[0]

      // Try KV cache first
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
              weekOf: cached.weekOf,
              recommendations,
              count: recommendations.length,
              totalAvailable: cached.recommendations.length,
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
                href: `/v3/recommendations/weekly?limit=${limit}`,
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
          const recommendations = JSON.parse(result.recommendations_json).slice(0, limit)

          return c.json(
            {
              success: true as const,
              data: {
                weekOf: result.week_of,
                recommendations,
                count: recommendations.length,
                totalAvailable: JSON.parse(result.recommendations_json).length,
              },
              metadata: {
                timestamp: new Date().toISOString(),
                requestId: ctx.requestId,
                source: 'alexandria' as const, // D1 storage
                cached: false,
                processingTime: Date.now() - ctx.startTime,
              },
              _links: {
                self: {
                  href: `/v3/recommendations/weekly?limit=${limit}`,
                  rel: 'self',
                  method: 'GET',
                },
              },
            },
            200,
          )
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
                weekOf,
                recommendations: fallbackRecommendations,
                count: fallbackRecommendations.length,
                totalAvailable: fallbackRecommendations.length,
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
                  href: `/v3/recommendations/weekly?limit=${limit}`,
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
        createProblemDetails('NOT_FOUND', 'No recommendations available for this week', {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        404,
      )
    } catch (error: any) {
      console.error('[V3 Recommendations] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', sanitizeErrorMessage(error, c.req.url), {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  console.log('[V3 API] Discovery Routes: GET /v3/capabilities, GET /v3/recommendations/weekly')
}
