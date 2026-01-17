/**
 * Hono Router - Main Application Router
 *
 * Primary HTTP router for BooksTrack backend API.
 * Uses OpenAPIHono for automatic OpenAPI spec generation.
 *
 * Route Organization:
 * - /health - Health check (OpenAPI)
 * - /metrics - Prometheus metrics
 * - /admin/* - Admin routes (harvest, recommendations)
 * - /api/* - Job state and token routes
 * - /api/cache/* - Cache monitoring routes
 * - /ws/* - WebSocket routes
 * - /images/* - Image proxy
 * - /test/* - Debug routes (DEBUG mode only)
 * - /v3/* - V3 API (see src/api-v3/)
 *
 * Documentation:
 * - /v3/docs - V3 Swagger UI
 * - /v3/openapi.json - V3 OpenAPI spec
 * - /doc - Legacy Swagger UI (core routes only)
 */

import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { handleMetricsRequest } from './handlers/metrics-handler'
import { analyticsMiddleware } from './middleware/hono-analytics'
import { openAPIConfig } from './openapi/config'
import { healthRoute } from './openapi/routes/health'
import {
  createAdminRoutes,
  createCacheRoutes,
  createImageRoutes,
  createJobApiRoutes,
  createTestRoutes,
  createWebSocketRoutes,
} from './routes'
import type { Env } from './types/env'
import { createErrorResponse, ErrorCodes } from './utils/http/response-builder'

// OpenAPI-enabled Hono app with Bindings and ExecutionContext support
const app = new OpenAPIHono<{ Bindings: Env; Variables: { executionCtx?: ExecutionContext } }>()

// ============================================================================
// Global Middleware
// ============================================================================

// Analytics middleware (adds X-Router and X-Response-Time headers)
app.use('*', analyticsMiddleware())

// CORS middleware (secure with iOS compatibility)
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        'https://bookstrack.oooefam.net',
        'https://harvest.oooefam.net',
        'https://books.oooefam.net',
        'https://bookstrack-web.pages.dev',
        'https://ca2dc966.bookstrack-web.pages.dev',
        'https://a6b28bf9.bookstrack-web.pages.dev', // Current deployment (Jan 2026)
        'capacitor://localhost',
        'http://localhost:3000',
        'http://localhost:8787',
      ]
      if (!origin) return '*' // No Origin header = native app
      return allowedOrigins.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Sec-WebSocket-Protocol',
      'Sec-WebSocket-Version',
      'Upgrade',
      'Connection',
    ],
    exposeHeaders: ['X-Router', 'X-Response-Time'],
    maxAge: 86400,
  }),
)

// ============================================================================
// Core Routes
// ============================================================================

// Health check (OpenAPI)
app.openapi(healthRoute, (c) => {
  c.header('Cache-Control', 'public, max-age=60, s-maxage=60')
  return c.json(
    {
      data: {
        status: 'ok',
        worker: 'api-worker',
        version: '3.4.3',
        router: 'hono',
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    },
    200,
  )
})

// Metrics endpoint
app.get('/metrics', async (c) => {
  return await handleMetricsRequest(c)
})

// ============================================================================
// Route Modules
// ============================================================================

// Admin routes: /admin/*
app.route('/admin', createAdminRoutes())

// Cache routes: /api/cache/*
app.route('/api/cache', createCacheRoutes())

// Job API routes: /api/*
app.route('/api', createJobApiRoutes())

// WebSocket routes: /ws/*
app.route('/ws', createWebSocketRoutes())

// Image routes: /images/*
app.route('/images', createImageRoutes())

// Legacy /api/recommendations removed - migrated to /v3/recommendations/personalized
// Personalized recommendations now available via V3 API discovery
// See: src/api-v3/discovery.ts for weekly recommendations (global/non-personalized)
// See: src/routes/recommendations.ts for future personalized recommendations implementation

// Test routes: /test/* (DEBUG mode only - middleware handles auth)
app.route('/test', createTestRoutes())

// ============================================================================
// OpenAPI Documentation (Core Routes)
// ============================================================================

app.get('/doc', swaggerUI({ url: '/doc/openapi.json' }))
app.doc('/doc/openapi.json', openAPIConfig)

// ============================================================================
// V3 API - Native @hono/zod-openapi
// ============================================================================

import { createV3Router } from './api-v3/index'
import openapiSpec from './api-v3/openapi-static.json'

try {
  const v3Router = createV3Router()
  app.route('/', v3Router)

  // Serve static OpenAPI spec (workaround for OpenAPIHono sub-router limitation)
  app.get('/v3/openapi.json', (c) => {
    return c.json(openapiSpec, 200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    })
  })

  console.log('[V3 API] Successfully mounted native @hono/zod-openapi routes')
} catch (error) {
  console.error('[V3 API] Failed to mount v3 routes:', error)
}

// ============================================================================
// Error Handlers
// ============================================================================

// 404 Handler
app.notFound((c) => {
  return createErrorResponse(
    `Endpoint not found: ${c.req.method} ${c.req.path}`,
    404,
    ErrorCodes.NOT_FOUND,
    { method: c.req.method, path: c.req.path },
    c.req.raw,
  )
})

// Global error handler
app.onError((err, c) => {
  console.error('[Hono] Unhandled error:', err)

  // Log to Analytics Engine asynchronously
  if (c.env.PERFORMANCE_ANALYTICS?.writeDataPoint) {
    try {
      // writeDataPoint returns void, just call it directly
      c.env.PERFORMANCE_ANALYTICS.writeDataPoint({
        blobs: ['router_error', err.message, c.req.path, c.req.method],
        doubles: [1],
        indexes: ['hono'],
      })
    } catch (syncError) {
      console.error('[Hono] Synchronous error logging to Analytics:', syncError)
    }
  }

  return createErrorResponse(
    'An unexpected error occurred',
    500,
    ErrorCodes.INTERNAL_ERROR,
    c.env.LOG_LEVEL === 'DEBUG' ? { details: err.message } : undefined,
    c.req.raw,
  )
})

export default app
