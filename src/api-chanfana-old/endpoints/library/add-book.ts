/**
 * POST /v3/library - Add book to user library (PROTECTED)
 *
 * Demonstrates the AuthenticatedRoute pattern:
 * - Automatic Bearer token validation
 * - User ID extraction from token
 * - Type-safe request/response handling
 * - Integration with D1 database
 */

import { AuthenticatedRoute, type AppContext } from '../../base'
import { z } from 'zod'
import { createErrorResponse, ErrorCodes } from '../../../utils/response-builder'

// Request body schema
const AddBookRequestSchema = z.object({
  isbn: z.string()
    .regex(/^\d{13}$/, 'Must be 13-digit ISBN')
    .describe('13-digit ISBN (example: 9780439708180)'),
  status: z.enum(['to-read', 'reading', 'read'])
    .default('to-read')
    .describe('Reading status (example: reading)'),
  rating: z.number().int().min(1).max(5)
    .optional()
    .describe('Book rating 1-5 stars (example: 5)'),
  notes: z.string().max(1000)
    .optional()
    .describe('Personal notes, max 1000 chars (example: Great book!)'),
})

// Response schema
const AddBookResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    isbn: z.string(),
    userId: z.string(),
    status: z.string(),
    addedAt: z.string(),
  }),
})

export class AddBookToLibrary extends AuthenticatedRoute {
  schema = {
    tags: ['Library'],
    summary: 'Add book to library (Protected)',
    description: 'Add a book to the authenticated user\'s library',
    request: {
      body: {
        content: {
          'application/json': {
            schema: AddBookRequestSchema,
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'Book added successfully',
        content: {
          'application/json': {
            schema: AddBookResponseSchema,
          },
        },
      },
      '401': {
        description: 'Unauthorized - missing or invalid token',
      },
      '409': {
        description: 'Book already in library',
      },
    },
  }

  /**
   * Handle authenticated request
   * Token validation already done by AuthenticatedRoute.handle()
   */
  protected async handleAuthenticated(c: AppContext) {
    try {
      // Get validated data
      const data = await this.getValidatedData<typeof this.schema>()
      const { isbn, status, rating, notes } = data.body

      // Get authenticated user ID
      const userId = this.getUserId(c)

      console.log(`[V3 Library] Adding book ${isbn} for user ${userId}`)

      // Access D1 database
      const services = this.getServices(c)
      const db = services.db

      // Check if book already in library (with timeout protection)
      const existing = await this.withTimeout(
        db.prepare('SELECT isbn FROM user_library WHERE user_id = ? AND isbn = ?')
          .bind(userId, isbn)
          .first(),
        5000,  // 5 second timeout
        'D1 duplicate check query'
      )

      if (existing) {
        return c.json(
          createErrorResponse(
            'Book already in library',
            409,
            ErrorCodes.DUPLICATE,
            { isbn },
            c.req.raw
          ),
          409
        )
      }

      // Insert into library (with timeout protection)
      const now = new Date().toISOString()
      await this.withTimeout(
        db.prepare(
          `INSERT INTO user_library (user_id, isbn, status, rating, notes, added_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(userId, isbn, status, rating || null, notes || null, now, now)
          .run(),
        5000,  // 5 second timeout
        'D1 insert query'
      )

      // Log analytics
      await this.logAnalytics(c, 'library_add', {
        duration: 0,
        statusCode: 201,
        provider: 'd1',
      })

      // Return success response
      return c.json({
        success: true,
        data: {
          isbn,
          userId,
          status,
          addedAt: now,
        },
      }, 201)

    } catch (error: any) {
      console.error(`[V3 Library] Error adding book:`, error)
      return this.handleError(c, error, 500)
    }
  }
}
