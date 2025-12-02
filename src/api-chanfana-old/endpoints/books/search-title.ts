/**
 * GET /v3/books/search - Search books by title
 *
 * Demonstrates query parameter validation and pagination patterns:
 * - Query string validation with Zod
 * - Pagination support (page, limit)
 * - Integration with existing search service
 * - List response format
 */

import { z } from 'zod'
import { BendRoute, type AppContext } from '../../base'
import { BookSchema } from '../../schemas/book'
import { createErrorResponse, ErrorCodes } from '../../../utils/response-builder'

export class SearchBooksByTitle extends BendRoute {
  schema = {
    tags: ['Books'],
    summary: 'Search books by title',
    description: 'Search for books using title query with pagination support',
    request: {
      query: z.object({
        q: z.string()
          .min(1)
          .max(200)
          .describe('Search query for book title (example: Harry Potter)'),
        page: z.coerce.number()
          .int()
          .min(1)
          .default(1)
          .describe('Page number (example: 1)'),
        limit: z.coerce.number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Results per page, max 100 (example: 20)'),
      }),
    },
    responses: {
      '200': {
        description: 'Search results',
        schema: z.object({
          success: z.literal(true),
          data: z.object({
            books: z.array(BookSchema),
            total: z.number().int(),
            page: z.number().int(),
            limit: z.number().int(),
            hasMore: z.boolean(),
          }),
          metadata: z.object({
            query: z.string(),
            cached: z.boolean(),
            timestamp: z.string(),
          }),
        }),
      },
      '400': {
        description: 'Invalid query parameters',
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

  async handle(c: AppContext) {
    const startTime = Date.now()

    try {
      // Get validated query params
      const data = await this.getValidatedData<typeof this.schema>()
      const { q: query, page, limit } = data.query

      console.log(`[V3 Books] GET /v3/books/search?q=${query}&page=${page}&limit=${limit}`)

      // Access service layer
      const services = this.getServices(c)

      // Import book search service dynamically
      const { searchBooksByTitle } = await import('../../../handlers/book-search')

      // Use existing search handler (reuses v1/v2 logic)
      // Note: This returns a Response object, so we need to extract the data
      const response = await searchBooksByTitle(
        new Request(`http://localhost?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),
        services.env
      )

      const result = await response.json()

      if (!result.success) {
        console.warn(`[V3 Books] Search failed: ${query}`)
        return c.json(result, response.status)
      }

      // Transform to v3 format with pagination metadata
      const books = result.data || []
      const total = result.metadata?.total || books.length
      const hasMore = page * limit < total

      // Log analytics
      const duration = Date.now() - startTime
      await this.logAnalytics(c, 'v3_book_search', {
        duration,
        statusCode: 200,
        provider: 'search',
      })

      console.log(`[V3 Books] Found ${books.length} books in ${duration}ms`)

      return c.json({
        success: true,
        data: {
          books,
          total,
          page,
          limit,
          hasMore,
        },
        metadata: {
          query,
          cached: result.metadata?.cached || false,
          timestamp: new Date().toISOString(),
        },
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Search error:`, error)
      return this.handleError(c, error, 500)
    }
  }
}
