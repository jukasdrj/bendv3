/**
 * Test & Debug Routes
 *
 * Development and testing endpoints. Only available when LOG_LEVEL=DEBUG.
 *
 * Routes:
 * - GET /test/error - Test error handler
 * - POST /test/cache-event - Send synthetic cache events
 * - GET /test/rpc-latency - Measure RPC performance
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from '../types/env.js'
import { createProblemResponse, ErrorCodes } from '../utils/http/response-builder'

// DO stub interfaces for RPC calls
interface CacheMetricsStub {
  recordEvent(event: {
    type: string
    prefix: string
    key: string
    timestamp: number
  }): Promise<void>
  getStats(): Promise<unknown>
}

interface LatencyTestStub {
  measureLatency(iterations: number): Promise<unknown>
}

export function createTestRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // Middleware: Only allow in DEBUG mode
  router.use('*', async (c, next) => {
    if (c.env.LOG_LEVEL !== 'DEBUG') {
      return createProblemResponse(ErrorCodes.NOT_FOUND, {
        detail: `Endpoint not found: ${c.req.method} ${c.req.path}`,
        instance: c.req.url,
        requestId: c.get('ctx')?.requestId,
        corsRequest: c.req.raw,
      })
    }
    return await next()
  })

  // GET /error - Test error handler
  router.get('/error', () => {
    throw new Error('Test error for onError handler validation')
  })

  // POST /cache-event - Test cache metrics by sending synthetic events
  router.post('/cache-event', async (c) => {
    try {
      const id = c.env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
      const stub = c.env.CACHE_METRICS_DO.get(id) as unknown as CacheMetricsStub

      const timestamp = Date.now()

      // RPC: Direct method calls (no HTTP overhead)

      // Event 1: Edge cache hit
      await stub.recordEvent({
        type: 'hit',
        prefix: 'edge',
        key: 'test:edge:hit',
        timestamp,
      })

      // Event 2: KV cache miss
      await stub.recordEvent({
        type: 'miss',
        prefix: 'book',
        key: 'book:isbn:test123',
        timestamp,
      })

      // Event 3: KV cache write
      await stub.recordEvent({
        type: 'write',
        prefix: 'author',
        key: 'author:search:testauthor',
        timestamp,
      })

      // Get current stats
      const stats = await stub.getStats()

      return c.json({
        message: 'Sent 3 synthetic cache events',
        events: [
          { type: 'hit', prefix: 'edge' },
          { type: 'miss', prefix: 'book' },
          { type: 'write', prefix: 'author' },
        ],
        currentStats: stats,
      })
    } catch (error) {
      console.error('Failed to send test cache events:', error)
      return createProblemResponse(ErrorCodes.INTERNAL_ERROR, {
        detail: 'Failed to send test cache events',
        instance: c.req.url,
        requestId: c.get('ctx')?.requestId,
        details: { details: (error as Error).message },
        corsRequest: c.req.raw,
      })
    }
  })

  // GET /rpc-latency - Measure RPC performance
  router.get('/rpc-latency', async (c) => {
    try {
      const iterationsParam = c.req.query('iterations') || '100'
      const iterations = parseInt(iterationsParam, 10)

      // Validation
      if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) {
        return createProblemResponse(ErrorCodes.INVALID_REQUEST, {
          detail: 'iterations must be an integer between 1 and 10000',
          instance: c.req.url,
          requestId: c.get('ctx')?.requestId,
          details: { parameter: 'iterations', min: 1, max: 10000 },
          corsRequest: c.req.raw,
        })
      }

      // Get LatencyTestDO stub
      const latencyTestId = c.env.LATENCY_TEST_DO.idFromName('default')
      const latencyTestStub = c.env.LATENCY_TEST_DO.get(latencyTestId) as unknown as LatencyTestStub

      // Measure RPC latency
      const result = await latencyTestStub.measureLatency(iterations)

      return c.json(result)
    } catch (error) {
      console.error('[RPC Latency Test] Error:', error)
      return createProblemResponse(ErrorCodes.INTERNAL_ERROR, {
        detail: `Failed to measure RPC latency: ${(error as Error).message}`,
        instance: c.req.url,
        requestId: c.get('ctx')?.requestId,
        details: { details: (error as Error).message },
        corsRequest: c.req.raw,
      })
    }
  })

  return router
}
