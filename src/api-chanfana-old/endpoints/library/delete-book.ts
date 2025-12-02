/**
 * DELETE /v3/library/:isbn - Remove book from library (PROTECTED)
 *
 * Demonstrates authenticated DELETE endpoint:
 * - Automatic JWT authentication
 * - Path parameter validation
 * - D1 DELETE with timeout protection
 * - Idempotent deletion (204 even if not found)
 */

import { AuthenticatedRoute, type AppContext } from '../../base'
import { z } from 'zod'
import { createErrorResponse, ErrorCodes } from '../../../utils/response-builder'

export class RemoveBookFromLibrary extends AuthenticatedRoute {
  schema = {
    tags: ['Library'],
    summary: 'Remove book from library (Protected)',
    description: 'Remove a book from the authenticated user\'s library',
    request: {
      params: z.object({
        isbn: z.string()
          .regex(/^\d{13}$/, 'Must be 13-digit ISBN')
          .describe('13-digit ISBN (example: 9780439708180)'),
      }),
    },
    responses: {
      '204': {
        description: 'Book removed successfully (or was not in library)',
      },
      '401': {
        description: 'Unauthorized',
      },
      '400': {
        description: 'Invalid ISBN format',
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

  protected async handleAuthenticated(c: AppContext) {
    try {
      // Get validated params
      const data = await this.getValidatedData<typeof this.schema>()
      const { isbn } = data.params

      // Get authenticated user ID
      const userId = this.getUserId(c)

      console.log(`[V3 Library] DELETE /v3/library/${isbn} - User: ${userId}`)

      // Access D1 database
      const services = this.getServices(c)
      const db = services.db

      // Delete from library (with timeout protection)
      // Note: D1 doesn't return affected rows count, so we can't tell if it existed
      // This is fine - DELETE is idempotent
      await this.withTimeout(
        db.prepare('DELETE FROM user_library WHERE user_id = ? AND isbn = ?')
          .bind(userId, isbn)
          .run(),
        5000,
        'D1 delete query'
      )

      // Log analytics
      await this.logAnalytics(c, 'v3_library_delete', {
        duration: 0,
        statusCode: 204,
        provider: 'd1',
      })

      console.log(`[V3 Library] Book ${isbn} removed for user ${userId}`)

      // Return 204 No Content (standard for successful DELETE)
      return new Response(null, { status: 204 })

    } catch (error: any) {
      console.error(`[V3 Library] Delete error:`, error)
      return this.handleError(c, error, 500)
    }
  }
}
