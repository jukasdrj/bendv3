/**
 * V3 Discovery Endpoints - Capabilities & Recommendations
 *
 * Provides API discovery and curated content endpoints:
 * - GET /v3/capabilities - API feature discovery
 * - GET /v3/recommendations/weekly - Weekly book recommendations
 *
 * @module api-v3/discovery
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from '../types/env'
import type { RequestContext } from '../middleware/request-context'
import { SuccessResponseSchema } from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'

// ============================================================================
// Capabilities Schemas
// ============================================================================

const FeatureSchema = z.object({
  name: z.string().describe('Feature identifier'),
  enabled: z.boolean().describe('Whether feature is available'),
  version: z.string().describe('Feature version'),
  endpoints: z.array(z.string()).describe('Related API endpoints'),
  rateLimit: z.object({
    requests: z.number().int().describe('Max requests per window'),
    windowMs: z.number().int().describe('Rate limit window in milliseconds')
  }).optional().describe('Rate limit configuration'),
  notes: z.string().optional().describe('Additional notes or warnings')
}).openapi('Feature')

const LimitsSchema = z.object({
  maxBatchSize: z.number().int().describe('Maximum items per batch request'),
  maxCsvRows: z.number().int().describe('Maximum rows in CSV import'),
  maxImageSizeMb: z.number().int().describe('Maximum image size for scans'),
  maxConcurrentJobs: z.number().int().describe('Max concurrent async jobs per user')
}).openapi('Limits')

const DeprecationSchema = z.object({
  endpoint: z.string().describe('Deprecated endpoint path'),
  sunsetDate: z.string().describe('Sunset date (ISO 8601)'),
  replacement: z.string().describe('Replacement endpoint or migration guide')
}).openapi('Deprecation')

const CapabilitiesDataSchema = z.object({
  apiVersion: z.string().describe('Current API version'),
  features: z.array(FeatureSchema).describe('Available API features'),
  limits: LimitsSchema.describe('API limits and quotas'),
  deprecations: z.array(DeprecationSchema).describe('Deprecated endpoints')
}).openapi('CapabilitiesData')

const CapabilitiesResponseSchema = SuccessResponseSchema(CapabilitiesDataSchema)

// ============================================================================
// Recommendations Schemas
// ============================================================================

const RecommendationSchema = z.object({
  isbn: z.string().describe('Book ISBN'),
  title: z.string().describe('Book title'),
  author: z.string().describe('Primary author'),
  coverUrl: z.string().url().optional().describe('Cover image URL'),
  reason: z.string().describe('Why this book is recommended')
}).openapi('Recommendation')

const RecommendationsDataSchema = z.object({
  weekOf: z.string().describe('Week start date (ISO 8601)'),
  recommendations: z.array(RecommendationSchema).describe('Recommended books'),
  count: z.number().int().describe('Number of recommendations returned'),
  totalAvailable: z.number().int().describe('Total recommendations available')
}).openapi('RecommendationsData')

const RecommendationsResponseSchema = SuccessResponseSchema(RecommendationsDataSchema)

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
      content: { 'application/json': { schema: CapabilitiesResponseSchema } }
    },
    500: {
      description: 'Server error',
      content: { 'application/problem+json': { schema: z.any() } }
    }
  }
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
      limit: z.coerce.number().int().min(1).max(20).default(10)
        .describe('Number of recommendations (1-20)')
    })
  },
  responses: {
    200: {
      description: 'Weekly recommendations',
      content: { 'application/json': { schema: RecommendationsResponseSchema } }
    },
    404: {
      description: 'No recommendations available',
      content: { 'application/problem+json': { schema: z.any() } }
    },
    500: {
      description: 'Server error',
      content: { 'application/problem+json': { schema: z.any() } }
    }
  }
})

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register discovery routes on the V3 router
 */
export function registerDiscoveryRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>
) {
  // GET /v3/capabilities
  app.openapi(capabilitiesRoute, async (c) => {
    const ctx = c.get('ctx')

    try {
      const capabilities = {
        apiVersion: '3.0.0',
        features: [
          {
            name: 'book-search',
            enabled: true,
            version: '3.0',
            endpoints: ['/v3/books/search', '/v3/books/:isbn'],
            rateLimit: { requests: 100, windowMs: 60000 },
            notes: 'Supports text, semantic, and similar search modes'
          },
          {
            name: 'book-enrichment',
            enabled: true,
            version: '3.0',
            endpoints: ['/v3/books/enrich'],
            rateLimit: { requests: 50, windowMs: 60000 },
            notes: 'Supports sync and async modes with optional embedding generation'
          },
          {
            name: 'csv-import',
            enabled: true,
            version: '3.0',
            endpoints: [
              '/v3/jobs/imports',
              '/v3/jobs/imports/:jobId',
              '/v3/jobs/imports/:jobId/stream'
            ],
            rateLimit: { requests: 10, windowMs: 60000 },
            notes: 'SSE streaming for real-time progress'
          },
          {
            name: 'bookshelf-scan',
            enabled: true,
            version: '3.0',
            endpoints: [
              '/v3/jobs/scans',
              '/v3/jobs/scans/:jobId',
              '/v3/jobs/scans/:jobId/stream'
            ],
            rateLimit: { requests: 5, windowMs: 60000 },
            notes: 'Powered by Gemini 2.0 Flash vision model'
          },
          {
            name: 'batch-enrichment',
            enabled: true,
            version: '3.0',
            endpoints: [
              '/v3/jobs/enrichment/:jobId',
              '/v3/jobs/enrichment/:jobId/stream',
              '/v3/jobs/enrichment/:jobId/results'
            ],
            rateLimit: { requests: 10, windowMs: 60000 },
            notes: 'Async enrichment with SSE progress updates'
          },
          {
            name: 'recommendations',
            enabled: true,
            version: '3.0',
            endpoints: ['/v3/recommendations/weekly'],
            notes: 'Global weekly recommendations, updated Sundays'
          }
        ],
        limits: {
          maxBatchSize: 50,
          maxCsvRows: 5000,
          maxImageSizeMb: 10,
          maxConcurrentJobs: 3
        },
        deprecations: [
          // No active deprecations - V1 and V2 already sunset
        ]
      }

      return c.json({
        success: true,
        data: capabilities,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          cached: false,
          processingTimeMs: Date.now() - ctx.startTime
        },
        _links: {
          self: { href: '/v3/capabilities', rel: 'self', method: 'GET' },
          docs: { href: '/v3/docs', rel: 'related', method: 'GET' },
          openapi: { href: '/v3/openapi.json', rel: 'describedby', method: 'GET' }
        }
      }, 200)
    } catch (error: any) {
      console.error('[V3 Capabilities] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // GET /v3/recommendations/weekly
  app.openapi(recommendationsRoute, async (c) => {
    const ctx = c.get('ctx')
    const { limit } = c.req.valid('query')

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
      const cached = await c.env.CACHE.get(cacheKey, 'json') as {
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

      if (cached && cached.recommendations && cached.recommendations.length > 0) {
        const recommendations = cached.recommendations.slice(0, limit)

        return c.json({
          success: true,
          data: {
            weekOf: cached.weekOf,
            recommendations,
            count: recommendations.length,
            totalAvailable: cached.recommendations.length
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            source: 'kv-cache' as const,
            cached: true,
            processingTimeMs: Date.now() - ctx.startTime
          },
          _links: {
            self: { href: `/v3/recommendations/weekly?limit=${limit}`, rel: 'self', method: 'GET' }
          }
        }, 200)
      }

      // Try D1 database
      if (c.env.DB) {
        const result = await c.env.DB.prepare(
          `SELECT week_of, recommendations_json, generated_at
           FROM recommendations
           WHERE week_of = ?
           ORDER BY generated_at DESC
           LIMIT 1`
        ).bind(weekOf).first<{
          week_of: string
          recommendations_json: string
          generated_at: string
        }>()

        if (result && result.recommendations_json) {
          const recommendations = JSON.parse(result.recommendations_json).slice(0, limit)

          return c.json({
            success: true,
            data: {
              weekOf: result.week_of,
              recommendations,
              count: recommendations.length,
              totalAvailable: JSON.parse(result.recommendations_json).length
            },
            metadata: {
              timestamp: new Date().toISOString(),
              requestId: ctx.requestId,
              source: 'alexandria' as const, // D1 storage
              cached: false,
              processingTimeMs: Date.now() - ctx.startTime
            },
            _links: {
              self: { href: `/v3/recommendations/weekly?limit=${limit}`, rel: 'self', method: 'GET' }
            }
          }, 200)
        }
      }

      // No recommendations available
      return c.json(
        createProblemDetails('NOT_FOUND', 'No recommendations available for this week', {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        404
      )
    } catch (error: any) {
      console.error('[V3 Recommendations] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  console.log('[V3 API] Discovery Routes: GET /v3/capabilities, GET /v3/recommendations/weekly')
}
