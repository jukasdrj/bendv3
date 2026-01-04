/**
 * V3 Batch Enrichment Job Routes
 *
 * Async batch enrichment workflow with SSE progress streaming
 *
 * Routes:
 * - GET /v3/jobs/enrichment/:jobId - Get job status
 * - GET /v3/jobs/enrichment/:jobId/stream - SSE progress stream
 * - GET /v3/jobs/enrichment/:jobId/results - Get job results
 * - DELETE /v3/jobs/enrichment/:jobId - Cancel job
 *
 * Note: POST /v3/books/enrich handles async job creation (fork logic in main router)
 *
 * @module api-v3/jobs/enrichment
 */

import {
  createProblemDetails,
  type Job,
  type JobResultsData,
  JobResultsResponseSchema,
  JobStatusResponseSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
  SSEProgressEventSchema,
} from '@bookstrack/schemas'
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { RequestContext } from '../../middleware/request-context'
import type { Env } from '../../types/env'
import { getJobStateManagerDO, mapDOStateToJob } from './common'
import { handleSSEStream } from './stream'

/**
 * Register batch enrichment job routes
 *
 * @param app - V3 OpenAPIHono router instance
 */
export function registerEnrichmentRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>,
) {
  // ========================================================================
  // GET /v3/jobs/enrichment/:jobId - Get job status
  // ========================================================================
  const getEnrichmentStatusRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/enrichment/:jobId',
    tags: ['Jobs'],
    summary: 'Get enrichment job status',
    description: `Query current status of batch enrichment job.

**Polling Guidance:**
- Use SSE stream for real-time updates (recommended)
- Polling fallback: max 1 request every 2 seconds
- Rate limit: 30 requests/minute per job`,
    request: {
      params: z.object({
        jobId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        description: 'Job status',
        content: { 'application/json': { schema: JobStatusResponseSchema } },
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(getEnrichmentStatusRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Enrichment job not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      const job = mapDOStateToJob(state)

      return c.json(
        {
          success: true,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Enrichment Status] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  // ========================================================================
  // GET /v3/jobs/enrichment/:jobId/stream - SSE progress stream
  // ========================================================================
  const streamEnrichmentRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/enrichment/:jobId/stream',
    tags: ['Jobs'],
    summary: 'Stream enrichment progress (SSE)',
    description: `Real-time progress updates via Server-Sent Events.

**Authentication:**
- Bearer token (from job creation response)
- Token valid for 1 hour
- Include in Authorization header: "Bearer {token}"

**Event Types:**
- progress: Periodic updates during processing (every 25 books)
- complete: Final event with full results (for iOS persistence)
- error: Job failed (includes retryable flag)
- ping: Heartbeat every 30 seconds

**Reconnection:**
- Browser-native reconnection with Last-Event-ID
- Automatic retry on connection loss`,
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        jobId: z.string().uuid(),
      }),
      headers: z.object({
        authorization: z.string().optional().openapi({
          description: 'Bearer token from job creation',
          example: 'Bearer a1b2c3d4e5f6...',
        }),
        'last-event-id': z.string().optional().openapi({
          description: 'Last received event ID for reconnection',
          example: '42',
        }),
      }),
    },
    responses: {
      200: {
        description: 'SSE stream',
        content: {
          'text/event-stream': {
            schema: z.object({
              event: z.enum(['progress', 'complete', 'error', 'ping']),
              data: z.union([
                SSEProgressEventSchema,
                SSECompleteEventSchema,
                SSEErrorEventSchema,
                z.object({ timestamp: z.string() }),
              ]),
            }),
          },
        },
      },
      401: {
        description: 'Unauthorized (invalid or expired token)',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(streamEnrichmentRoute, async (c) => {
    const { jobId } = c.req.valid('param')
    return handleSSEStream(c, 'enrichment', jobId)
  })

  // ========================================================================
  // GET /v3/jobs/enrichment/:jobId/results - Get job results
  // ========================================================================
  const getEnrichmentResultsRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/enrichment/:jobId/results',
    tags: ['Jobs'],
    summary: 'Get enrichment job results',
    description: `Fetch enriched books from completed enrichment job.

Results include:
- Enriched book metadata
- Books that were not found (ISBNs)
- Embedding generation status (if requested)

Results cached in KV for 2 hours after completion.`,
    request: {
      params: z.object({
        jobId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        description: 'Job results',
        content: { 'application/json': { schema: JobResultsResponseSchema } },
      },
      404: {
        description: 'Job not found or not completed',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(getEnrichmentResultsRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Enrichment job not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      if (state.status !== 'completed') {
        return c.json(
          createProblemDetails('NOT_FOUND', `Job not completed (status: ${state.status}). Current status: ${state.status}`, {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      // Fetch results from KV
      const resultsKey = `enrichment-results:${jobId}`
      const results = await c.env.CACHE.get(resultsKey, 'json')

      if (!results) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Results not found (may have expired after 2 hours)', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      const data: JobResultsData = {
        jobId: state.jobId,
        status: state.status,
        results: Array.isArray(results) ? results : [],
      }

      return c.json(
        {
          success: true,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Enrichment Results] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  // ========================================================================
  // DELETE /v3/jobs/enrichment/:jobId - Cancel job
  // ========================================================================
  const cancelEnrichmentRoute = createRoute({
    method: 'delete',
    path: '/v3/jobs/enrichment/:jobId',
    tags: ['Jobs'],
    summary: 'Cancel enrichment job',
    description: `Cancel in-progress enrichment job.

**Note:** Jobs may not stop immediately (graceful shutdown).`,
    request: {
      params: z.object({
        jobId: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        description: 'Job canceled',
        content: { 'application/json': { schema: JobStatusResponseSchema } },
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      409: {
        description: 'Job already completed or failed',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(cancelEnrichmentRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Enrichment job not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      // Cannot cancel completed/failed jobs
      if (state.status === 'completed' || state.status === 'failed') {
        return c.json(
          createProblemDetails('INVALID_REQUEST', `Cannot cancel job in ${state.status} status`, {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          409,
        )
      }

      // Cancel job via DO
      await doStub.sendError({
        code: 'CANCELED',
        message: 'Job canceled by user',
      })

      const canceledState = await doStub.getJobState()

      const job: Job = {
        jobId: canceledState.jobId,
        type: canceledState.type,
        status: canceledState.status,
        progress: canceledState.progress,
        processedCount: canceledState.processedCount,
        totalCount: canceledState.totalCount,
        startTime: canceledState.startTime,
        completedTime: canceledState.completedTime,
        error: canceledState.error,
      }

      return c.json(
        {
          success: true,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Enrichment Cancel] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  console.log(
    '[V3 Jobs] Batch enrichment routes registered: GET /v3/jobs/enrichment/:jobId, GET /v3/jobs/enrichment/:jobId/stream, GET /v3/jobs/enrichment/:jobId/results, DELETE /v3/jobs/enrichment/:jobId',
  )
}
