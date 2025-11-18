/**
 * Hono Router - Phase 1 MVP
 *
 * This router coexists with the manual routing in src/index.js
 * Feature flag: ENABLE_HONO_ROUTER (default: false)
 *
 * MVP Routes:
 * - GET /health - Health check (baseline test)
 * - GET /v1/search/isbn - ISBN search (full stack integration test)
 * - GET /metrics - Metrics endpoint (analytics integration test)
 * - GET /ws/progress - WebSocket upgrade (WebSocket routing test)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types/env'
import { handleSearchISBN } from './handlers/v1/search-isbn'
import { handleMetricsRequest } from './handlers/metrics-handler'
import { getProgressDOStub } from './utils/durable-object-helpers'
import { analyticsMiddleware } from './middleware/hono-analytics'

const app = new Hono<{ Bindings: Env }>()

// Global analytics middleware (adds X-Router and X-Response-Time headers)
app.use('*', analyticsMiddleware())

// Global CORS middleware (using Hono's built-in for simplicity)
app.use('*', cors({
  origin: '*', // Permissive for iOS app (doesn't send Origin header)
  allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Router', 'X-Response-Time'],
  maxAge: 86400 // 24 hours
}))

// ============================================================================
// MVP Route 1: Health Check (Baseline Test)
// ============================================================================
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    worker: 'api-worker',
    version: '2.1.0',
    router: 'hono', // Key field for A/B testing
    timestamp: new Date().toISOString()
  })
})

// ============================================================================
// MVP Route 2: ISBN Search (Full Stack Integration Test)
// ============================================================================
app.get('/v1/search/isbn', async (c) => {
  const isbn = c.req.query('isbn')

  if (!isbn) {
    return c.json({
      error: {
        code: 'INVALID_ISBN',
        message: 'ISBN query parameter is required'
      }
    }, 400)
  }

  return await handleSearchISBN(isbn, c.env, c.req.raw)
})

// ============================================================================
// MVP Route 3: Metrics (Analytics Integration Test)
// ============================================================================
app.get('/metrics', async (c) => {
  return await handleMetricsRequest(c.req.raw, c.env, c.executionCtx)
})

// ============================================================================
// MVP Route 4: WebSocket Progress (WebSocket Routing Test)
// ============================================================================
app.get('/ws/progress', async (c) => {
  const jobId = c.req.query('jobId')

  if (!jobId) {
    return c.json({
      error: {
        code: 'MISSING_PARAM',
        message: 'Missing jobId parameter'
      }
    }, 400)
  }

  // Note: Token validation happens in the Durable Object (progress-socket.js:172-175)
  // This maintains parity with manual router and follows Workers architecture:
  // - Router: validates required params and routes to correct DO
  // - DO: handles authentication, session management, and business logic
  //
  // IMPORTANT: WebSocket upgrade validation is NOT performed here to maintain
  // behavioral parity with the manual router (src/index.js:94-109).
  // The Durable Object will handle upgrade validation if needed.
  // See API_CONTRACT.md § 7.5 for WebSocket authentication flow

  // Get Durable Object instance for this specific jobId
  const doStub = getProgressDOStub(jobId, c.env)

  // Forward the request to the Durable Object
  // The DO will handle the WebSocket upgrade and lifecycle
  return doStub.fetch(c.req.raw)
})

// ============================================================================
// Global 404 Handler
// ============================================================================
app.notFound((c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${c.req.method} ${c.req.path}`
    }
  }, 404)
})

// ============================================================================
// Global Error Handler
// ============================================================================
app.onError((err, c) => {
  console.error('[Hono] Unhandled error:', err)

  // Log to Analytics Engine asynchronously (doesn't block response)
  c.executionCtx.waitUntil(
    c.env.PERFORMANCE_ANALYTICS?.writeDataPoint({
      blobs: [
        'router_error',
        err.message,
        c.req.path,
        c.req.method
      ],
      doubles: [1], // Error count
      indexes: ['hono'] // Router type
    }).catch(analyticsErr => {
      console.error('[Hono] Failed to log error to Analytics Engine:', analyticsErr)
    })
  )

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: c.env.LOG_LEVEL === 'DEBUG' ? err.message : undefined
    }
  }, 500)
})

export default app
