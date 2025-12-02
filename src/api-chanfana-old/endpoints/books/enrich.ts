/**
 * POST /v3/books/enrich - Enrich single book metadata
 *
 * Demonstrates POST body validation and external API integration:
 * - JSON body validation with Zod
 * - Force refresh option
 * - Circuit breaker integration
 * - Cache bypass logic
 */

import { z } from 'zod'
import { BendRoute, type AppContext } from '../../base'
import { BookSchema } from '../../schemas/book'
import { createErrorResponse, ErrorCodes } from '../../../utils/response-builder'

export class EnrichBook extends BendRoute {
  schema = {
    tags: ['Books'],
    summary: 'Enrich book metadata',
    description: 'Fetch enriched metadata for a single book from multiple providers',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              isbn: z.string()
                .regex(/^\d{13}$/, 'Must be 13-digit ISBN')
                .describe('13-digit ISBN (example: 9780439708180)'),
              force: z.boolean()
                .default(false)
                .describe('Force refresh from providers to bypass cache (example: false)'),
            }),
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Book enriched successfully',
        schema: z.object({
          success: z.literal(true),
          data: z.object({
            book: BookSchema,
            enriched: z.boolean().describe('Whether new data was fetched'),
            provider: z.string().describe('Provider used for enrichment'),
            cached: z.boolean().describe('Whether result was cached'),
          }),
          metadata: z.object({
            timestamp: z.string(),
            duration: z.number(),
          }),
        }),
      },
      '404': {
        description: 'Book not found',
        schema: z.object({
          success: z.literal(false),
          error: z.object({
            code: z.string(),
            message: z.string(),
          }),
        }),
      },
      '503': {
        description: 'Service unavailable (circuit breaker open)',
        schema: z.object({
          success: z.literal(false),
          error: z.object({
            code: z.string(),
            message: z.string(),
            retryAfterMs: z.number().optional(),
          }),
        }),
      },
    },
  }

  async handle(c: AppContext) {
    const startTime = Date.now()

    try {
      // Get validated body
      const data = await this.getValidatedData<typeof this.schema>()
      const { isbn, force } = data.body

      console.log(`[V3 Books] POST /v3/books/enrich - ISBN: ${isbn}, Force: ${force}`)

      // Access service layer
      const services = this.getServices(c)
      const bookService = await services.getBookService()

      // If force refresh, we need to bypass cache
      // The existing service checks cache first, so we'd need to clear it
      if (force) {
        const cacheKey = `book:isbn:${isbn}`
        await services.cache.delete(cacheKey)
        console.log(`[V3 Books] Cache cleared for ${isbn} (force refresh)`)
      }

      // Use existing book service for enrichment
      const result = await bookService.getBookByISBN(services.env, isbn)

      if (!result || !result.success) {
        return c.json(
          createErrorResponse(
            'Book not found',
            404,
            ErrorCodes.NOT_FOUND,
            { isbn },
            c.req.raw
          ),
          404
        )
      }

      const duration = Date.now() - startTime

      // Log analytics
      await this.logAnalytics(c, 'v3_book_enrich', {
        duration,
        statusCode: 200,
        provider: result.metadata?.source || 'unknown',
      })

      console.log(`[V3 Books] Enriched ${isbn} in ${duration}ms via ${result.metadata?.source}`)

      return c.json({
        success: true,
        data: {
          book: result.data,
          enriched: !result.metadata?.cached || force,
          provider: result.metadata?.source || 'unknown',
          cached: result.metadata?.cached && !force,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
        },
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Enrich error:`, error)

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

      return this.handleError(c, error, 500)
    }
  }
}
