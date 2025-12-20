/**
 * Request Context Middleware
 *
 * Adds correlation ID, timing, and rate limit context to requests.
 */
import { createMiddleware } from 'hono/factory'
import { v4 as uuidv4 } from 'uuid'

export interface RequestContext {
  requestId: string
  startTime: number
  rateLimit?: {
    limit: number
    remaining: number
    reset: number
  }
}

/**
 * Middleware that adds request context for correlation and timing
 */
export const requestContext = createMiddleware<{
  Variables: { ctx: RequestContext }
}>(async (c, next) => {
  // Get or generate request ID
  const requestId = c.req.header('X-Request-ID') || uuidv4()

  // Set context
  c.set('ctx', {
    requestId,
    startTime: Date.now(),
  })

  // Add correlation ID to response
  c.header('X-Request-ID', requestId)

  await next()

  // Add timing header
  const duration = Date.now() - c.get('ctx').startTime
  c.header('X-Response-Time', `${duration}ms`)
})

/**
 * Rate limit headers middleware (applied per-route)
 */
export const rateLimitHeaders = createMiddleware(async (c, next) => {
  await next()

  const ctx = c.get('ctx') as RequestContext
  if (ctx.rateLimit) {
    c.header('X-RateLimit-Limit', String(ctx.rateLimit.limit))
    c.header('X-RateLimit-Remaining', String(ctx.rateLimit.remaining))
    c.header('X-RateLimit-Reset', String(ctx.rateLimit.reset))
  }
})
