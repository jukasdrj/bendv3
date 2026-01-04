/**
 * WebSocket & Job State Routes
 *
 * Handles WebSocket connections for real-time progress tracking and job state management.
 *
 * Routes:
 * - GET /ws/progress - WebSocket connection for job progress
 * - POST /api/token/refresh - Refresh WebSocket authentication token
 * - GET /api/job-state/:jobId - Get current job state for reconnection
 * - POST /api/scan-bookshelf/cancel - Cancel bookshelf scanning job
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { checkRateLimit } from '../middleware/rate-limiter.ts'
import type { Env } from '../types/env'
import { createErrorResponse, ErrorCodes } from '../utils/http/response-builder'

// DO stub interfaces for RPC calls
interface WebSocketConnectionStub {
  fetch(request: Request): Promise<Response>
  refreshAuthToken(
    oldToken: string,
  ): Promise<{ token?: string; expiresIn?: number; error?: string }>
  getAuthToken(): Promise<{ token: string; expiresAt: number } | null>
}

interface JobStateManagerStub {
  getJobState(): Promise<unknown>
  cancelJob(reason: string): Promise<unknown>
}

// Rate limiting middleware for Hono
const rateLimitMiddleware = async (c: any, next: any) => {
  const rateLimitResponse = await checkRateLimit(c.req.raw, c.env)
  if (rateLimitResponse) return rateLimitResponse
  return await next()
}

// Rate limiting middleware with custom limit
const createRateLimitMiddleware = (maxRequests: number) => {
  return async (c: any, next: any) => {
    const rateLimitResponse = await checkRateLimit(c.req.raw, c.env, maxRequests)
    if (rateLimitResponse) return rateLimitResponse
    return await next()
  }
}

export function createWebSocketRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // GET /ws/progress - WebSocket connection for job progress
  router.get('/progress', async (c) => {
    // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
    const jobId = c.req.query('jobId')?.substring(0, 100)

    if (!jobId || jobId.trim().length === 0) {
      return createErrorResponse(
        'Missing jobId parameter',
        400,
        ErrorCodes.MISSING_PARAMETER,
        { parameter: 'jobId' },
        c.req.raw,
      )
    }

    // SECURITY: Token authentication uses WebSocket Subprotocol
    // Token passed via Sec-WebSocket-Protocol header: new WebSocket(url, ['bookstrack-auth.TOKEN'])
    // Token validation happens in the Durable Object (websocket-connection.js)

    const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
    const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(wsDoId) as unknown as WebSocketConnectionStub

    // Forward the request to the WebSocket DO for auth, upgrade, and lifecycle
    return await wsDoStub.fetch(c.req.raw)
  })

  return router
}

export function createJobApiRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // POST /token/refresh - Refresh WebSocket authentication token
  router.post('/token/refresh', rateLimitMiddleware, async (c) => {
    try {
      const { jobId, oldToken } = await c.req.json()

      if (!jobId || !oldToken) {
        return createErrorResponse(
          'Invalid request: jobId and oldToken required',
          400,
          ErrorCodes.INVALID_REQUEST,
          { required: ['jobId', 'oldToken'] },
          c.req.raw,
        )
      }

      const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
      const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(
        wsDoId,
      ) as unknown as WebSocketConnectionStub
      const result = await wsDoStub.refreshAuthToken(oldToken)

      if (result.error) {
        return createErrorResponse(result.error, 401, ErrorCodes.UNAUTHORIZED, { jobId }, c.req.raw)
      }

      return c.json({
        jobId,
        token: result.token,
        expiresIn: result.expiresIn,
      })
    } catch (error) {
      console.error('Failed to refresh token:', error)
      return createErrorResponse(
        `Failed to refresh token: ${(error as Error).message}`,
        500,
        ErrorCodes.INTERNAL_ERROR,
        undefined,
        c.req.raw,
      )
    }
  })

  // GET /job-state/:jobId - Get current job state for WebSocket reconnection
  router.get('/job-state/:jobId', createRateLimitMiddleware(30), async (c) => {
    try {
      const jobId = c.req.param('jobId')

      if (!jobId) {
        return createErrorResponse(
          'Invalid request: jobId required',
          400,
          ErrorCodes.INVALID_REQUEST,
          { jobId },
          c.req.raw,
        )
      }

      // Validate Bearer token (REQUIRED for auth)
      const authHeader = c.req.header('Authorization')
      const providedToken = authHeader?.replace('Bearer ', '')
      if (!providedToken) {
        return createErrorResponse(
          'Missing authorization token',
          401,
          ErrorCodes.UNAUTHORIZED,
          { endpoint: '/api/job-state/:jobId' },
          c.req.raw,
        )
      }

      // Query JOB_STATE_MANAGER_DO and WEBSOCKET_CONNECTION_DO separately
      const stateDoId = c.env.JOB_STATE_MANAGER_DO.idFromName(jobId)
      const stateDoStub = c.env.JOB_STATE_MANAGER_DO.get(
        stateDoId,
      ) as unknown as JobStateManagerStub

      const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
      const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(
        wsDoId,
      ) as unknown as WebSocketConnectionStub

      // Fetch job state and auth details separately
      const jobState = await stateDoStub.getJobState()
      const authResult = await wsDoStub.getAuthToken()

      if (!jobState) {
        return createErrorResponse(
          'Job not found or state not initialized',
          404,
          ErrorCodes.NOT_FOUND,
          { jobId },
          c.req.raw,
        )
      }

      if (!authResult) {
        return createErrorResponse(
          'Job authentication not found',
          404,
          ErrorCodes.NOT_FOUND,
          { jobId },
          c.req.raw,
        )
      }

      const { token: authToken, expiresAt: authTokenExpiration } = authResult

      // Validate token matches and is not expired
      if (!authToken || providedToken !== authToken || Date.now() > authTokenExpiration) {
        return createErrorResponse(
          'Invalid or expired token',
          401,
          ErrorCodes.UNAUTHORIZED,
          { jobId, tokenExpired: Date.now() > authTokenExpiration },
          c.req.raw,
        )
      }

      return c.json(jobState)
    } catch (error) {
      console.error('Failed to get job state:', error)
      return createErrorResponse(
        `Failed to get job state: ${(error as Error).message}`,
        500,
        ErrorCodes.INTERNAL_ERROR,
        { jobId: c.req.param('jobId') },
        c.req.raw,
      )
    }
  })

  // POST /scan-bookshelf/cancel - Cancel bookshelf scanning job
  router.post('/scan-bookshelf/cancel', async (c) => {
    try {
      const { jobId } = await c.req.json()

      if (!jobId) {
        return createErrorResponse(
          'jobId required',
          400,
          ErrorCodes.MISSING_PARAMETER,
          { parameter: 'jobId' },
          c.req.raw,
        )
      }

      const stateDoId = c.env.JOB_STATE_MANAGER_DO.idFromName(jobId)
      const stateDoStub = c.env.JOB_STATE_MANAGER_DO.get(
        stateDoId,
      ) as unknown as JobStateManagerStub
      const result = await stateDoStub.cancelJob('User canceled bookshelf scan')

      return c.json(result)
    } catch (error) {
      console.error('Cancel batch error:', error)
      return createErrorResponse(
        'Failed to cancel batch',
        500,
        ErrorCodes.INTERNAL_ERROR,
        { details: (error as Error).message },
        c.req.raw,
      )
    }
  })

  return router
}
