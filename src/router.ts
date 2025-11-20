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
import { handleSearchTitle } from './handlers/v1/search-title'
import { handleSearchAdvanced } from './handlers/v1/search-advanced'
import { handleBatchEnrichment } from './handlers/batch-enrichment'
import { handleBatchScan } from './handlers/batch-scan-handler'
import { handleCSVImport } from './handlers/csv-import'
import { handleMetricsRequest } from './handlers/metrics-handler'
import { handleCacheMetrics } from './handlers/cache-metrics.js'
import { getProgressDOStub } from './utils/durable-object-helpers'
import { analyticsMiddleware } from './middleware/hono-analytics'
import { checkRateLimit } from './middleware/rate-limiter'

const app = new Hono<{ Bindings: Env }>()

// Global analytics middleware (adds X-Router and X-Response-Time headers)
app.use('*', analyticsMiddleware())

// Global CORS middleware (secure with iOS compatibility)
app.use('*', cors({
  origin: (origin) => {
    // Allow specific origins for web clients
    const allowedOrigins = [
      'https://bookstrack.oooefam.net',   // Production web app
      'https://harvest.oooefam.net',       // Harvest dashboard
      'capacitor://localhost',              // iOS app (Capacitor)
      'http://localhost:3000',              // Local dev (web)
      'http://localhost:8787'               // Local dev (wrangler)
    ]
    // Allow requests without Origin header (native iOS/Android apps)
    return origin ? allowedOrigins.includes(origin) : true
  },
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

  // Validation: ISBN format (10 or 13 digits, hyphens allowed)
  const isbnRegex = /^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?$)[\d-]+$/

  if (!isbn || !isbnRegex.test(isbn)) {
    return c.json({
      error: {
        code: 'INVALID_ISBN',
        message: 'A valid ISBN-10 or ISBN-13 is required'
      }
    }, 400)
  }

  return await handleSearchISBN(isbn, c.env, c.req.raw)
})

// ============================================================================
// V1 Search API - Additional Routes (Week 1 Migration)
// ============================================================================

// GET /v1/search/title - Search books by title
app.get('/v1/search/title', async (c) => {
  const rawQuery = c.req.query('q')

  // Validation: Limit length to prevent DoS and ensure data quality
  const query = rawQuery?.substring(0, 200)

  if (!query || query.trim().length === 0) {
    return c.json({
      error: {
        code: 'MISSING_PARAM',
        message: 'Query parameter "q" is required (max 200 characters)'
      }
    }, 400)
  }

  return await handleSearchTitle(query, c.env, c.req.raw)
})

// GET /v1/search/advanced - Advanced search by title and/or author
app.get('/v1/search/advanced', async (c) => {
  // Validation: Limit length to prevent DoS (max 200 chars each)
  const title = c.req.query('title')?.substring(0, 200) || ''
  const author = c.req.query('author')?.substring(0, 200) || ''

  if (!title && !author) {
    return c.json({
      error: {
        code: 'MISSING_PARAM',
        message: 'At least one search parameter required (title or author, max 200 characters each)'
      }
    }, 400)
  }

  return await handleSearchAdvanced(title, author, c.env, c.executionCtx, c.req.raw)
})

// ============================================================================
// Batch Endpoints (Week 1 Migration - With Rate Limiting)
// ============================================================================

// Rate limiting middleware for Hono
const rateLimitMiddleware = async (c, next) => {
  const rateLimitResponse = await checkRateLimit(c.req.raw, c.env)
  if (rateLimitResponse) return rateLimitResponse
  await next()
}

// POST /v1/enrichment/batch - Canonical batch enrichment endpoint
app.post('/v1/enrichment/batch', rateLimitMiddleware, async (c) => {
  return await handleBatchEnrichment(c.req.raw, c.env, c.executionCtx)
})

// POST /api/scan-bookshelf/batch - Batch AI bookshelf scanner
app.post('/api/scan-bookshelf/batch', rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, c.executionCtx)
})

// POST /api/import/csv-gemini - Gemini-powered CSV import
app.post('/api/import/csv-gemini', rateLimitMiddleware, async (c) => {
  return await handleCSVImport(c.req.raw, c.env, c.executionCtx)
})

// ============================================================================
// MVP Route 3: Metrics (Analytics Integration Test)
// ============================================================================
app.get('/metrics', async (c) => {
  return await handleMetricsRequest(c.req.raw, c.env, c.executionCtx)
})

// GET /api/cache/metrics - Cache performance metrics
app.get('/api/cache/metrics', async (c) => {
  return await handleCacheMetrics(c.req.raw, c.env)
})

// ============================================================================
// MVP Route 4: WebSocket Progress (WebSocket Routing Test)
// ============================================================================
app.get('/ws/progress', async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.query('jobId')?.substring(0, 100)

  if (!jobId || jobId.trim().length === 0) {
    return c.json({
      error: {
        code: 'MISSING_PARAM',
        message: 'Missing jobId parameter'
      }
    }, 400)
  }

  // SECURITY FIX (Issue #163): Token authentication now uses WebSocket Subprotocol
  // NEW METHOD (secure): Token passed via Sec-WebSocket-Protocol header
  //   Example: new WebSocket(url, ['bookstrack-auth.TOKEN_HERE'])
  //
  // OLD METHOD (deprecated): Token via URL query param (backward compatible)
  //   Example: wss://api.oooefam.net/ws/progress?jobId=xxx&token=yyy
  //   ⚠️ WARNING: Leaks tokens in logs, browser history, and network traffic
  //
  // Token validation happens in the Durable Object (progress-socket.js:133-178)
  // This maintains parity with manual router and follows Workers architecture:
  // - Router: validates required params and routes to correct DO
  // - DO: handles authentication, session management, and business logic
  //
  // See API_CONTRACT.md § 7.5 for complete WebSocket authentication flow

  // Get Durable Object instance for this specific jobId
  const doStub = getProgressDOStub(jobId, c.env)

  // Forward the request to the Durable Object
  // The DO will handle the WebSocket upgrade and lifecycle
  return doStub.fetch(c.req.raw)
})

// ============================================================================
// Results Retrieval Endpoints (Week 2 Migration)
// ============================================================================

// GET /v1/scan/results/{jobId} - Retrieve AI scan results after WebSocket completion
app.get('/v1/scan/results/:jobId', async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.param('jobId')?.substring(0, 100)

  if (!jobId || jobId.trim().length === 0) {
    return c.json({
      data: null,
      metadata: {
        timestamp: new Date().toISOString()
      },
      error: {
        code: 'MISSING_PARAM',
        message: 'Missing jobId parameter'
      }
    }, 400)
  }

  // Retrieve from KV cache (24-hour TTL)
  const resultsKey = `scan-results:${jobId}`
  const results = await c.env.KV_CACHE.get(resultsKey, 'json')

  if (!results) {
    return c.json({
      data: null,
      metadata: {
        timestamp: new Date().toISOString()
      },
      error: {
        message: 'Scan results not found or expired. Results are stored for 24 hours after job completion.',
        code: 'NOT_FOUND',
        details: {
          jobId,
          resultsKey,
          ttl: '24 hours'
        }
      }
    }, 404)
  }

  return c.json({
    data: results,
    metadata: {
      timestamp: new Date().toISOString(),
      cached: true,
      provider: 'kv_cache'
    }
  })
})

// GET /v1/csv/results/{jobId} - Retrieve CSV import results after WebSocket completion
app.get('/v1/csv/results/:jobId', async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.param('jobId')?.substring(0, 100)

  if (!jobId || jobId.trim().length === 0) {
    return c.json({
      data: null,
      metadata: {
        timestamp: new Date().toISOString()
      },
      error: {
        code: 'MISSING_PARAM',
        message: 'Missing jobId parameter'
      }
    }, 400)
  }

  // Retrieve from KV cache (24-hour TTL)
  const resultsKey = `csv-results:${jobId}`
  const results = await c.env.KV_CACHE.get(resultsKey, 'json')

  if (!results) {
    return c.json({
      data: null,
      metadata: {
        timestamp: new Date().toISOString()
      },
      error: {
        message: 'CSV import results not found or expired. Results are stored for 24 hours after job completion.',
        code: 'NOT_FOUND',
        details: {
          jobId,
          resultsKey,
          ttl: '24 hours'
        }
      }
    }, 404)
  }

  return c.json({
    data: results,
    metadata: {
      timestamp: new Date().toISOString(),
      cached: true,
      provider: 'kv_cache'
    }
  })
})

// POST /api/batch-scan - Batch photo scanning (1-5 photos)
app.post('/api/batch-scan', rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, c.executionCtx)
})

// ============================================================================
// Test Route (DEBUG mode only - for testing error handler)
// ============================================================================
app.get('/test/error', (c) => {
  // Only available in DEBUG mode for testing onError handler
  if (c.env.LOG_LEVEL !== 'DEBUG') {
    return c.json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found: GET /test/error'
      }
    }, 404)
  }

  throw new Error('Test error for onError handler validation')
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
  if (c.env.PERFORMANCE_ANALYTICS) {
    c.executionCtx.waitUntil(
      c.env.PERFORMANCE_ANALYTICS.writeDataPoint({
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
  }

  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: c.env.LOG_LEVEL === 'DEBUG' ? err.message : undefined
    }
  }, 500)
})

export default app
