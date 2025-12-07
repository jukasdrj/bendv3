/**
 * GET /v3/books/:isbn - Get book by ISBN
 *
 * Retrieves book metadata from Alexandria → Google Books → ISBNdb chain
 * This is the "pilot endpoint" demonstrating the full v3 pattern:
 * - Class-based route with Zod validation
 * - Automatic OpenAPI documentation
 * - Integration with existing service layer
 * - Circuit breaker protection
 * - Standardized error handling
 */

import { z } from 'zod'
import { BendRoute, type AppContext } from '../../base'
import {
  BookSchema,
} from '../../schemas/book'
import {
  createErrorResponse,
  ErrorCodes,
} from '../../../utils/response-builder'

export class GetBookByISBN extends BendRoute {
  // OpenAPI schema definition
  // This generates the /v3/openapi.json automatically
  schema = {
    tags: ['Books'],
    summary: 'Get book by ISBN',
    description: 'Retrieves book metadata from Alexandria → Google Books → ISBNdb chain with circuit breaker protection',
    request: {
      params: z.object({
        isbn: z.string()
          .regex(/^\d{10}(\d{3})?$/)
          .describe('10 or 13 digit ISBN (example: 9780439708180)'),
      }),
    },
    responses: {
      '200': {
        description: 'Book found',
        schema: z.object({
          success: z.literal(true),
          data: BookSchema,
          metadata: z.object({
            source: z.string(),
            cached: z.boolean(),
            timestamp: z.string(),
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
      '500': {
        description: 'Server error',
        schema: z.object({
          success: z.literal(false),
          error: z.object({
            code: z.string(),
            message: z.string(),
          }),
        }),
      },
    },
  }

  /**
   * Handle the request
   * This method receives VALIDATED data from Chanfana
   */
  async handle(c: AppContext) {
    const startTime = Date.now()

    try {
      // Get validated params (already validated by Chanfana!)
      const data = await this.getValidatedData<typeof this.schema>()
      const { isbn } = data.params

      console.log(`[V3 Books] GET /v3/books/${isbn}`)

      // Access service layer
      const services = this.getServices(c)
      const bookService = await services.getBookService()

      // Use existing book-service.ts - NO REWRITE NEEDED
      // This demonstrates how v3 integrates with existing infrastructure
      const result = await bookService.getBookByISBN(services.env, isbn)

      if (!result || !result.success) {
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

      // Log analytics
      const duration = Date.now() - startTime
      await this.logAnalytics(c, 'v3_book_lookup', {
        duration,
        statusCode: 200,
        provider: result.metadata?.source || 'unknown',
      })

      console.log(`[V3 Books] Book found in ${duration}ms via ${result.metadata?.source}`)

      // Return success response
      // Response is automatically validated against BookResponseSchema
      return c.json(result, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Error:`, error)

      // Circuit breaker errors have special handling
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

      // Use standardized error handler
      return this.handleError(c, error, 500)
    }
  }
}
