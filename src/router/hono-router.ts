import { Hono } from 'hono'
import { jsonResponse } from '../utils/response-builder.ts'

/**
 * Hono Router Module - Zero-Downtime Coexistence
 *
 * This router runs alongside the existing manual routing in src/index.js
 * when ENABLE_HONO_ROUTER === 'true' (feature flag in wrangler.toml).
 *
 * Phase 1: Health check endpoint only (canary test)
 * Future phases: Incrementally migrate routes from manual routing
 *
 * Pattern: Feature Flag Toggle (HONO_COEXISTENCE_PATTERNS.md #1)
 */

interface Env {
  [key: string]: any
}

const honoRouter = new Hono<{ Bindings: Env }>()

/**
 * GET /health - Health check endpoint (Hono version)
 *
 * Canary route for Phase 1: Tests that Hono router integration works
 * before migrating additional routes.
 *
 * Returns: Standard health check response
 * Status: 200 OK
 */
honoRouter.get('/health', (c) => {
  const response = jsonResponse(
    {
      status: 'ok',
      worker: 'api-worker',
      version: '1.0.0',
      router: 'hono',
      endpoints: [
        'GET /search/title?q={query}&maxResults={n} - Title search with caching (6h TTL)',
        'GET /search/isbn?isbn={isbn}&maxResults={n} - ISBN search with caching (7 day TTL)',
        'GET /search/author?q={author}&limit={n}&offset={n}&sortBy={sort} - Author bibliography (6h TTL)',
        'GET /search/advanced?title={title}&author={author} - Advanced search (primary method, 6h cache)',
        'POST /search/advanced - Advanced search (legacy support, JSON body)',
        'POST /api/enrichment/start - Start batch enrichment job',
        'POST /api/enrichment/cancel - Cancel in-flight enrichment job (body: {jobId})',
        'POST /api/scan-bookshelf?jobId={id} - AI bookshelf scanner (upload image with Content-Type: image/*)',
        'POST /api/scan-bookshelf/batch - Batch AI scanner (body: {jobId, images: [{index, data}]})',
        'GET /ws/progress?jobId={id} - WebSocket progress updates',
        '/external/google-books?q={query}&maxResults={n}',
        '/external/google-books-isbn?isbn={isbn}',
        '/external/openlibrary?q={query}&maxResults={n}',
        '/external/openlibrary-author?author={name}',
        '/external/isbndb?title={title}&author={author}',
        '/external/isbndb-editions?title={title}&author={author}',
        '/external/isbndb-isbn?isbn={isbn}'
      ]
    },
    200,
    null
  )
  return response
})

/**
 * Default 404 handler for Hono router
 */
honoRouter.notFound((c) => {
  const response = jsonResponse(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist. Use /health to see available endpoints.'
      }
    },
    404,
    null
  )
  return response
})

export default honoRouter
