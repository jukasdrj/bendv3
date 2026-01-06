/**
 * V3 CSV Import Job Routes
 *
 * Async CSV import workflow with SSE progress streaming
 *
 * Routes:
 * - POST /v3/jobs/imports - Initiate CSV import
 * - GET /v3/jobs/imports/:jobId - Get job status
 * - GET /v3/jobs/imports/:jobId/stream - SSE progress stream
 * - GET /v3/jobs/imports/:jobId/results - Get job results
 * - DELETE /v3/jobs/imports/:jobId - Cancel job
 *
 * @module api-v3/jobs/imports
 */

import {
  createProblemDetails,
  type JobInitData,
  JobInitResponseSchema,
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
import {
  buildStreamUrl,
  createJobLinks,
  generateAuthToken,
  getJobStateManagerDO,
  getWebSocketConnectionDO,
  mapDOStateToJob,
} from './common'
import { handleSSEStream } from './stream'

/**
 * Register CSV import routes
 *
 * @param app - V3 OpenAPIHono router instance
 */
export function registerImportRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>,
) {
  // ========================================================================
  // POST /v3/jobs/imports - Initiate CSV import
  // ========================================================================
  const createImportRoute = createRoute({
    method: 'post',
    path: '/v3/jobs/imports',
    tags: ['Jobs'],
    summary: 'Import books from CSV',
    description: `Upload CSV file for background processing with Gemini 2.0 Flash.

Returns immediately with jobId for progress tracking via SSE stream.

**CSV Format:**
- Supported columns: isbn, title, author, publisher, publishedDate
- Max file size: 8MB (fits in Gemini 2M token context)
- Max rows: ~5000 books

**Authentication:**
- Bearer token returned in response (valid 1 hour)
- Use token for SSE stream and status queries`,
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.instanceof(File).openapi({
                description: 'CSV file (max 8MB)',
                format: 'binary',
                type: 'string',
              }),
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Import job accepted',
        content: { 'application/json': { schema: JobInitResponseSchema } },
      },
      400: {
        description: 'Invalid file (missing, wrong format)',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      413: {
        description: 'File too large (>8MB)',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(createImportRoute, async (c) => {
    const ctx = c.get('ctx')

    try {
      // Validate Content-Type before parsing
      const contentType = c.req.header('content-type') || ''
      if (!contentType.includes('multipart/form-data')) {
        return c.json(
          createProblemDetails(
            'INVALID_REQUEST',
            `Expected Content-Type: multipart/form-data with file field. Received: ${contentType || 'none'}. Hint: Use FormData with file field containing CSV data.`,
            {
              requestId: ctx.requestId,
              instance: c.req.url,
            },
          ),
          400,
        )
      }

      const formData = await c.req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return c.json(
          createProblemDetails('INVALID_REQUEST', 'Missing file in multipart form data', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          400,
        )
      }

      // Validate file size (8MB limit for Gemini 2M token context)
      const MAX_FILE_SIZE = 8 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        return c.json(
          createProblemDetails(
            'FILE_TOO_LARGE',
            `CSV file exceeds 8MB limit. File size: ${file.size} bytes, max allowed: ${MAX_FILE_SIZE} bytes.`,
            {
              requestId: ctx.requestId,
              instance: c.req.url,
            },
          ),
          413,
        )
      }

      // Generate job ID and auth token
      const jobId = crypto.randomUUID()
      const authToken = generateAuthToken()

      console.log(`[V3 Import] Creating job ${jobId} for ${file.name} (${file.size} bytes)`)

      // Get JobStateManagerDO stub
      const doStub = getJobStateManagerDO(jobId, c.env)

      // Initialize job state (totalCount unknown until parsed)
      await doStub.initializeJobState(jobId, 'csv_import', 0)

      // Store auth token in WebSocketConnectionDO (handles SSE/WebSocket auth)
      const wsDoStub = getWebSocketConnectionDO(jobId, c.env)
      await wsDoStub.setAuthToken(authToken, 'csv_import')

      // Schedule CSV processing via DO alarm (avoids Worker CPU limits)
      const csvText = await file.text()
      const csvProcessingPromise = doStub.scheduleCSVProcessing?.(csvText, jobId)
      if (csvProcessingPromise) {
        c.executionCtx.waitUntil(csvProcessingPromise)
      }

      const streamUrl = buildStreamUrl(c.req.url, 'imports', jobId)

      const data: JobInitData = {
        jobId,
        status: 'queued',
        streamUrl,
        token: authToken,
      }

      return c.json(
        {
          success: true as const,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
          _links: createJobLinks('imports', jobId, streamUrl),
        },
        202,
      )
    } catch (error: any) {
      console.error('[V3 Import] Error:', error)
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
  // GET /v3/jobs/imports/:jobId - Get job status
  // ========================================================================
  const getImportStatusRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/imports/:jobId',
    tags: ['Jobs'],
    summary: 'Get import job status',
    description: `Query current status of CSV import job.

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

  app.openapi(getImportStatusRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Import job not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      const job = mapDOStateToJob(state)

      return c.json(
        {
          success: true as const,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Import Status] Error:', error)
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
  // GET /v3/jobs/imports/:jobId/stream - SSE progress stream
  // ========================================================================
  const streamImportRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/imports/:jobId/stream',
    tags: ['Jobs'],
    summary: 'Stream import progress (SSE)',
    description: `Real-time progress updates via Server-Sent Events.

**Authentication:**
- Bearer token (from job creation response)
- Token valid for 1 hour
- Include in Authorization header: "Bearer {token}"

**Event Types:**
- progress: Periodic updates during processing
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

  app.openapi(streamImportRoute, async (c) => {
    const { jobId } = c.req.valid('param')
    // Cast context to satisfy handleSSEStream signature (Variables optional in stream handler)
    return handleSSEStream(c as any, 'imports', jobId)
  })

  // ========================================================================
  // GET /v3/jobs/imports/:jobId/results - Get job results
  // ========================================================================
  const getImportResultsRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/imports/:jobId/results',
    tags: ['Jobs'],
    summary: 'Get import job results',
    description: `Fetch enriched books from completed import job.

Results cached in KV for 1 hour after completion.`,
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

  app.openapi(getImportResultsRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Import job not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      if (state.status !== 'completed') {
        return c.json(
          createProblemDetails('NOT_FOUND', `Job not completed. Current status: ${state.status}`, {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      // Fetch results from KV
      const resultsKey = `csv-results:${jobId}`
      const results = await c.env.CACHE.get(resultsKey, 'json')

      if (!results) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Results not found (may have expired)', {
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
          success: true as const,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Import Results] Error:', error)
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
  // DELETE /v3/jobs/imports/:jobId - Cancel job
  // ========================================================================
  const cancelImportRoute = createRoute({
    method: 'delete',
    path: '/v3/jobs/imports/:jobId',
    tags: ['Jobs'],
    summary: 'Cancel import job',
    description: `Cancel in-progress import job.

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

  app.openapi(cancelImportRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Import job not found', {
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
      const job = mapDOStateToJob(canceledState)

      return c.json(
        {
          success: true as const,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error('[V3 Import Cancel] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  console.log('[V3 Jobs] CSV import routes registered')
}
