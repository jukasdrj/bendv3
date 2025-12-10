/**
 * Base Route Classes for Chanfana v3 API
 *
 * Provides shared functionality for all v3 endpoints:
 * - Service layer access
 * - Standardized error handling
 * - Analytics logging
 * - Response formatting
 */

import { OpenAPIRoute } from 'chanfana'
import type { Env } from '../types/env'
import type { Context } from 'hono'
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'

// Extend Hono context to include our environment bindings
export type AppContext = Context<{ Bindings: Env }>

/**
 * BendRoute - Base class for all v3 API endpoints
 *
 * Extends OpenAPIRoute with BooksTrack-specific helpers:
 * - Access to service layer (Alexandria, book service, etc.)
 * - Standardized error handling
 * - Analytics logging
 * - Response envelope formatting
 */
export class BendRoute extends OpenAPIRoute {
  /**
   * Get access to all service layer dependencies
   * This provides a clean interface to your existing services
   */
  protected getServices(c: AppContext) {
    return {
      // Environment bindings
      env: c.env,

      // Storage
      cache: c.env.CACHE,
      db: c.env.DB,

      // Durable Objects
      jobManager: c.env.JOB_STATE_MANAGER_DO,
      websocket: c.env.WEBSOCKET_CONNECTION_DO,
      rateLimit: c.env.RATE_LIMITER_DO,

      // Analytics
      analytics: c.env.PERFORMANCE_ANALYTICS,
      cacheAnalytics: c.env.CACHE_ANALYTICS,

      // External APIs (access via circuit-breaker protected functions)
      // Import services dynamically when needed to avoid loading unused code
      getAlexandriaService: async () => {
        const { searchISBN } = await import('../services/alexandria-api')
        return { searchISBN }
      },
      getBookService: async () => {
        return await import('../services/book-service')
      },
    }
  }

  /**
   * Standardized error handling wrapper
   * Logs error and returns formatted error response
   */
  protected handleError(c: AppContext, error: any, statusCode: number = 500) {
    console.error(`[V3 API Error] ${error.message}`, {
      stack: error.stack,
      name: error.name,
    })

    // Determine error code based on error type
    let errorCode = ErrorCodes.INTERNAL_ERROR
    let message = error.message || 'Internal Server Error'

    if (error.name === 'ZodError') {
      errorCode = ErrorCodes.VALIDATION_ERROR
      statusCode = 400
      message = 'Validation failed'
    } else if (statusCode === 404) {
      errorCode = ErrorCodes.NOT_FOUND
    } else if (statusCode === 429) {
      errorCode = ErrorCodes.RATE_LIMIT
    }

    return createErrorResponse(
      message,
      statusCode,
      errorCode,
      { originalError: error.name },
      c.req.raw
    )
  }

  /**
   * Log analytics event
   * Convenience method for tracking API usage
   */
  protected async logAnalytics(
    c: AppContext,
    eventType: string,
    data: Record<string, any>
  ) {
    const analytics = c.env.PERFORMANCE_ANALYTICS
    if (!analytics) return

    try {
      await analytics.writeDataPoint({
        blobs: [
          eventType,
          c.req.path,
          c.req.method,
        ],
        doubles: [
          data.duration || 0,
          data.statusCode || 200,
        ],
        indexes: [
          data.provider || 'unknown',
        ],
      })
    } catch (error) {
      console.error('[Analytics] Failed to log event:', error)
      // Don't throw - analytics failures should not break API
    }
  }

  /**
   * Execute a promise with timeout protection
   * Prevents long-running D1 queries or external API calls from blocking requests
   *
   * @param promise - The promise to execute
   * @param timeoutMs - Timeout in milliseconds (default: 5000ms)
   * @param operation - Description of operation for error messages
   * @returns The promise result if completed before timeout
   * @throws Error if timeout is reached
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 5000,
    operation: string = 'operation'
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout: ${operation} exceeded ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ])
  }
}

/**
 * AuthenticatedRoute - Base class for protected endpoints
 *
 * Uses Cloudflare Access authentication via email header
 * All routes extending this class will require authentication
 */
export class AuthenticatedRoute extends BendRoute {
  /**
   * Override handle to add auth check before endpoint logic
   * Subclasses should implement handleAuthenticated instead of handle
   */
  async handle(c: AppContext) {
    // Extract user email from Cloudflare Access header
    // When behind CF Access, this header contains the authenticated user's email
    const userEmail = c.req.header('Cf-Access-Authenticated-User-Email')

    if (!userEmail) {
      // Fallback: Check for development/testing mode
      const devUserId = c.env.DEV_USER_ID || 'dev-user@example.com'

      // Only allow dev mode in non-production environments
      if (c.env.ENVIRONMENT !== 'production') {
        console.warn('[Auth] Using development user ID (no Cloudflare Access header found)')
        c.set('userId', devUserId)
        return this.handleAuthenticated(c)
      }

      return createErrorResponse(
        'Unauthorized - Missing Cloudflare Access authentication',
        401,
        ErrorCodes.UNAUTHORIZED,
        {
          hint: 'This endpoint requires Cloudflare Access authentication',
        },
        c.req.raw
      )
    }

    // Use email as user ID
    c.set('userId', userEmail)

    // Call the authenticated handler
    return this.handleAuthenticated(c)
  }

  /**
   * Subclasses must implement this instead of handle()
   * This ensures auth check always runs first
   */
  protected async handleAuthenticated(c: AppContext): Promise<Response> {
    throw new Error('handleAuthenticated must be implemented by subclass')
  }

  /**
   * Helper to get authenticated user ID
   */
  protected getUserId(c: AppContext): string {
    return c.get('userId') as string
  }
}
