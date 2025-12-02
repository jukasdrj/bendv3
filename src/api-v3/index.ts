/**
 * V3 API - Native @hono/zod-openapi Implementation
 *
 * Replaces Chanfana with native Hono OpenAPI support for better zod@4 compatibility
 *
 * Migration from Chanfana (Dec 2, 2025):
 * - Uses OpenAPIHono instead of fromHono()
 * - Uses createRoute() for route definitions
 * - Direct integration with @hono/zod-openapi (no wrapper needed)
 * - Full zod@4 support without version conflicts
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { Env } from '../types'
import { BookSchema } from './schemas/book'
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'

// Constants for V3 API data transformation
const DEFAULT_PROVIDER_QUALITY = 95 // Default quality score for provider data

/**
 * Create and configure V3 OpenAPI router
 */
export function createV3Router() {
  const app = new OpenAPIHono<{ Bindings: Env }>()

  // GET /v3/books/:isbn - Get book by ISBN
  const getBookByISBNRoute = createRoute({
    method: 'get',
    path: '/v3/books/:isbn',
    tags: ['Books'],
    summary: 'Get book by ISBN',
    description: 'Retrieves book metadata from Alexandria → Google Books → ISBNdb chain with circuit breaker protection',
    request: {
      params: z.object({
        isbn: z.string()
          .regex(/^\d{10}(\d{3})?$/, 'Must be 10 or 13 digit ISBN')
          .openapi({
            param: { name: 'isbn', in: 'path' },
            example: '9780439708180'
          })
      })
    },
    responses: {
      200: {
        description: 'Book found',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              data: BookSchema,
              metadata: z.object({
                source: z.string(),
                cached: z.boolean(),
                timestamp: z.string()
              })
            })
          }
        }
      },
      404: {
        description: 'Book not found',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      },
      500: {
        description: 'Server error',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      }
    }
  })

  app.openapi(getBookByISBNRoute, async (c) => {
    const startTime = Date.now()
    const { isbn } = c.req.valid('param')

    console.log(`[V3 Books] GET /v3/books/${isbn}`)

    try {
      // Import book service from existing service layer
      const { findBookByISBN } = await import('../services/book-service')

      // Call service with correct signature: (isbn, env, ctx)
      const enrichmentResult = await findBookByISBN(isbn, c.env, c.executionCtx)

      // Check if we got any results
      if (!enrichmentResult || !enrichmentResult.works || enrichmentResult.works.length === 0) {
        console.warn(`[V3 Books] Book not found: ${isbn}`)
        return c.json(
          createErrorResponse(
            'Book not found',
            404,
            ErrorCodes.NOT_FOUND,
            {},
            c.req.raw
          ),
          404
        )
      }

      const duration = Date.now() - startTime
      console.log(`[V3 Books] Book found in ${duration}ms via ${enrichmentResult.source}`)

      // Convert EnrichmentResult to V3 Book format
      const work = enrichmentResult.works[0]
      const edition = enrichmentResult.editions?.[0]

      const book = {
        isbn: edition?.isbn13 || isbn,
        isbn10: edition?.isbn10,
        title: work.title,
        subtitle: work.subtitle,
        authors: enrichmentResult.authors?.map(a => a.name) || [],
        publisher: edition?.publisher,
        publishedDate: edition?.publicationDate,
        description: work.description,
        pageCount: edition?.pageCount,
        categories: work.subjects,
        language: edition?.language || 'en',
        coverUrl: work.coverImageURL || edition?.coverImageURL,
        thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
        workKey: work.openLibraryWorkID || work.openLibraryID,
        editionKey: edition?.openLibraryEditionID,
        provider: 'alexandria', // All books are served through Alexandria (BooksTrack's unified API)
        quality: DEFAULT_PROVIDER_QUALITY,
      }

      // Wrap in success response
      return c.json({
        success: true,
        data: book,
        metadata: {
          source: enrichmentResult.source || 'external',
          cached: enrichmentResult.cached || false,
          timestamp: new Date().toISOString()
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Error:`, error)

      // Circuit breaker errors
      if (error.code === 'CIRCUIT_OPEN') {
        return c.json(
          createErrorResponse(
            'Service temporarily unavailable',
            503,
            ErrorCodes.CIRCUIT_OPEN,
            { retryAfterMs: 60000 },
            c.req.raw
          ),
          503
        )
      }

      return c.json(
        createErrorResponse(
          error.message || 'Internal server error',
          500,
          ErrorCodes.INTERNAL_ERROR,
          {},
          c.req.raw
        ),
        500
      )
    }
  })

  // OpenAPI documentation endpoints
  app.doc('/v3/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'BooksTrack V3 API',
      version: '3.0.0',
      description: 'Native Hono OpenAPI implementation with full zod@4 support'
    }
  })

  // Swagger UI
  app.get('/v3/docs', swaggerUI({ url: '/v3/openapi.json' }))

  console.log('[V3 API] Native @hono/zod-openapi router created')
  console.log('[V3 API] Documentation: /v3/docs')
  console.log('[V3 API] OpenAPI JSON: /v3/openapi.json')

  return app
}
