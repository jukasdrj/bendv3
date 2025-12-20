/**
 * GET /v3/library - List user's library (PROTECTED)
 *
 * Demonstrates authenticated list endpoint with filtering and pagination:
 * - Automatic JWT authentication via AuthenticatedRoute
 * - Query parameter filtering (status filter)
 * - Pagination support
 * - D1 query with timeout protection
 * - JOIN with book metadata (optional)
 */

import { z } from 'zod'
import { type AppContext, AuthenticatedRoute } from '../../base'

// Library item schema
const LibraryItemSchema = z.object({
  isbn: z.string(),
  status: z.enum(['to-read', 'reading', 'read']),
  rating: z.number().int().min(1).max(5).nullable(),
  notes: z.string().nullable(),
  addedAt: z.string(),
  updatedAt: z.string(),
})

export class ListUserLibrary extends AuthenticatedRoute {
  schema = {
    tags: ['Library'],
    summary: 'List user library (Protected)',
    description: "Get all books in the authenticated user's library with optional filtering",
    request: {
      query: z.object({
        status: z
          .enum(['to-read', 'reading', 'read', 'all'])
          .default('all')
          .describe('Filter by reading status (example: reading)'),
        page: z.coerce.number().int().min(1).default(1).describe('Page number (example: 1)'),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe('Results per page, max 100 (example: 50)'),
      }),
    },
    responses: {
      '200': {
        description: 'Library list retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              data: z.object({
                books: z.array(LibraryItemSchema),
                total: z.number().int(),
                page: z.number().int(),
                limit: z.number().int(),
                hasMore: z.boolean(),
              }),
              metadata: z.object({
                userId: z.string(),
                filter: z.string(),
                timestamp: z.string(),
              }),
            }),
          },
        },
      },
      '401': {
        description: 'Unauthorized',
      },
    },
  }

  protected async handleAuthenticated(c: AppContext) {
    const startTime = Date.now()

    try {
      // Get validated query params
      const data = await this.getValidatedData<typeof this.schema>()
      const { status, page, limit } = data.query

      // Get authenticated user ID
      const userId = this.getUserId(c)

      console.log(
        `[V3 Library] GET /v3/library - User: ${userId}, Status: ${status}, Page: ${page}`,
      )

      // Access D1 database
      const services = this.getServices(c)
      const db = services.db

      // Build query based on status filter
      const offset = (page - 1) * limit
      let query: string
      let countQuery: string
      let params: any[]

      if (status === 'all') {
        query = `
          SELECT isbn, status, rating, notes, added_at, updated_at
          FROM user_library
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `
        countQuery = 'SELECT COUNT(*) as total FROM user_library WHERE user_id = ?'
        params = [userId, limit, offset]
      } else {
        query = `
          SELECT isbn, status, rating, notes, added_at, updated_at
          FROM user_library
          WHERE user_id = ? AND status = ?
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `
        countQuery = 'SELECT COUNT(*) as total FROM user_library WHERE user_id = ? AND status = ?'
        params = status === 'all' ? [userId, limit, offset] : [userId, status, limit, offset]
      }

      // Execute queries with timeout protection
      const [booksResult, countResult] = await Promise.all([
        this.withTimeout(
          db
            .prepare(query)
            .bind(...params)
            .all(),
          5000,
          'D1 library list query',
        ),
        this.withTimeout(
          db
            .prepare(countQuery)
            .bind(userId, ...(status !== 'all' ? [status] : []))
            .first(),
          5000,
          'D1 library count query',
        ),
      ])

      const books =
        booksResult.results?.map((row: any) => ({
          isbn: row.isbn,
          status: row.status,
          rating: row.rating,
          notes: row.notes,
          addedAt: row.added_at,
          updatedAt: row.updated_at,
        })) || []

      const total = (countResult as any)?.total || 0
      const hasMore = page * limit < total

      const duration = Date.now() - startTime

      // Log analytics
      await this.logAnalytics(c, 'v3_library_list', {
        duration,
        statusCode: 200,
        provider: 'd1',
      })

      console.log(`[V3 Library] Found ${books.length} books (total: ${total}) in ${duration}ms`)

      return c.json(
        {
          success: true,
          data: {
            books,
            total,
            page,
            limit,
            hasMore,
          },
          metadata: {
            userId,
            filter: status,
            timestamp: new Date().toISOString(),
          },
        },
        200,
      )
    } catch (error: any) {
      console.error(`[V3 Library] List error:`, error)
      return this.handleError(c, error, 500)
    }
  }
}
