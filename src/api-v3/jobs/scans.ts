/**
 * V3 Bookshelf Scan Job Routes
 *
 * Async bookshelf photo scanning workflow with SSE progress streaming
 *
 * Routes:
 * - POST /v3/jobs/scans - Initiate bookshelf scan
 * - GET /v3/jobs/scans/:jobId - Get job status
 * - GET /v3/jobs/scans/:jobId/stream - SSE progress stream
 * - GET /v3/jobs/scans/:jobId/results - Get job results
 * - DELETE /v3/jobs/scans/:jobId - Cancel job and cleanup R2
 *
 * @module api-v3/jobs/scans
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Env } from '../../types/env'
import type { RequestContext } from '../../middleware/request-context'
import {
  createProblemDetails,
  JobInitResponseSchema,
  JobStatusResponseSchema,
  JobResultsResponseSchema,
  JobStatusSchema,
  SSEProgressEventSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
  type JobInitData,
  type Job,
  type JobResultsData
} from '@bookstrack/schemas'
import {
  getJobStateManagerDO,
  generateAuthToken,
  buildStreamUrl,
  createJobLinks,
  validateTokenFormat
} from './common'
import { deleteR2Objects } from '../../utils/r2-utils'

// Constants from V2 handler
const MAX_PHOTOS_PER_BATCH = 5
const MAX_IMAGE_SIZE = 10_000_000 // 10MB per photo
const MAX_BATCH_SIZE = 50_000_000 // 50MB total

/**
 * Bounding Box Schema
 *
 * Coordinates are normalized to [0, 1] range
 */
const BoundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1).openapi({
      description: 'Normalized X coordinate (0-1)',
      example: 0.1
    }),
    y: z.number().min(0).max(1).openapi({
      description: 'Normalized Y coordinate (0-1)',
      example: 0.2
    }),
    width: z.number().min(0).max(1).openapi({
      description: 'Normalized width (0-1)',
      example: 0.15
    }),
    height: z.number().min(0).max(1).openapi({
      description: 'Normalized height (0-1)',
      example: 0.25
    })
  })
  .openapi('BoundingBox')

/**
 * Detected Book Schema
 *
 * Book detected by Gemini Vision with bounding box
 */
const DetectedBookSchema = z
  .object({
    title: z.string().optional(),
    author: z.string().optional(),
    isbn: z.string().optional(),
    confidence: z.number().min(0).max(1).openapi({
      description: 'Detection confidence (0-1)',
      example: 0.95
    }),
    boundingBox: BoundingBoxSchema.optional(),
    enrichmentStatus: z
      .enum(['pending', 'success', 'not_found', 'error', 'circuit_open'])
      .optional()
      .openapi({
        description: 'Enrichment status from external APIs',
        example: 'success'
      }),
    coverUrl: z.string().url().optional(),
    publisher: z.string().optional(),
    publicationYear: z.number().int().optional(),
    enrichment: z.any().optional() // Full enrichment data
  })
  .openapi('DetectedBook')

/**
 * Register bookshelf scan routes
 *
 * @param app - V3 OpenAPIHono router instance
 */
export function registerScanRoutes(app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>) {
  // ========================================================================
  // POST /v3/jobs/scans - Initiate bookshelf scan
  // ========================================================================
  const createScanRoute = createRoute({
    method: 'post',
    path: '/v3/jobs/scans',
    tags: ['Jobs'],
    summary: 'Scan bookshelf photos',
    description: `Upload 1-5 photos for AI-powered book detection with Gemini Vision.

Returns immediately with jobId for progress tracking via SSE stream.

**Photo Requirements:**
- Format: JPEG, PNG, WebP
- Max size: 10MB per photo
- Max batch: 5 photos (50MB total)
- Min dimensions: 640x480 recommended

**Processing Steps:**
1. Upload photos to R2 storage
2. Gemini Vision detects books with bounding boxes
3. Deduplicate by ISBN
4. Enrich with metadata from external APIs
5. Store results in KV cache (2 hours)

**Confidence Thresholds:**
- ≥0.8: Auto-approved (high confidence)
- <0.8: Needs manual review

**Authentication:**
- Bearer token returned in response (valid 1 hour)
- Use token for SSE stream and status queries`,
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              'photos[]': z.array(z.instanceof(File)).min(1).max(MAX_PHOTOS_PER_BATCH).openapi({
                description: `Array of photo files (1-${MAX_PHOTOS_PER_BATCH} photos)`,
                format: 'binary',
                type: 'array'
              })
            })
          }
        }
      }
    },
    responses: {
      202: {
        description: 'Scan job accepted',
        content: { 'application/json': { schema: JobInitResponseSchema } }
      },
      400: {
        description: 'Invalid request (missing photos, wrong format)',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      413: {
        description: 'File too large (photo >10MB or batch >50MB)',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } }
      }
    }
  })

  app.openapi(createScanRoute, async (c) => {
    const ctx = c.get('ctx')

    try {
      // Parse multipart/form-data
      const formData = await c.req.formData()
      const photoFiles = formData.getAll('photos[]')

      // Validation: Check if photos were provided
      if (!photoFiles || photoFiles.length === 0) {
        const availableKeys = Array.from(formData.keys())
        return c.json(
          createProblemDetails(
            'INVALID_REQUEST',
            `No photos provided. Expected 'photos[]' field with binary images, found: [${availableKeys.join(', ')}]`,
            {
              requestId: ctx.requestId,
              instance: c.req.url,
              availableFields: availableKeys
            }
          ),
          400
        )
      }

      if (photoFiles.length > MAX_PHOTOS_PER_BATCH) {
        return c.json(
          createProblemDetails(
            'BATCH_TOO_LARGE',
            `Batch size exceeds maximum ${MAX_PHOTOS_PER_BATCH} photos (received ${photoFiles.length})`,
            {
              requestId: ctx.requestId,
              instance: c.req.url,
              maxPhotos: MAX_PHOTOS_PER_BATCH,
              receivedPhotos: photoFiles.length
            }
          ),
          400
        )
      }

      // Validate R2 binding
      if (!c.env.BOOKSHELF_IMAGES) {
        console.error('[V3 Scan] R2 binding BOOKSHELF_IMAGES not configured')
        return c.json(
          createProblemDetails('INTERNAL_ERROR', 'Storage not configured', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          500
        )
      }

      // Process and validate image files
      const processedImages: { index: number; buffer: ArrayBuffer; type: string }[] = []
      let totalBatchSize = 0

      for (let i = 0; i < photoFiles.length; i++) {
        const file = photoFiles[i]

        // Validate file is actually a File/Blob object
        if (!(file instanceof File) && !(file instanceof Blob)) {
          return c.json(
            createProblemDetails(
              'INVALID_REQUEST',
              `Photo ${i} is not a valid file (expected binary image data)`,
              {
                requestId: ctx.requestId,
                instance: c.req.url,
                photoIndex: i
              }
            ),
            400
          )
        }

        // Get actual buffer size
        const imageBuffer = await file.arrayBuffer()
        const actualSize = imageBuffer.byteLength

        // Validate individual file size
        if (actualSize > MAX_IMAGE_SIZE) {
          return c.json(
            createProblemDetails(
              'FILE_TOO_LARGE',
              `Photo ${i} exceeds maximum size of ${MAX_IMAGE_SIZE / 1_000_000}MB per photo (actual: ${(actualSize / 1_000_000).toFixed(1)}MB). Please compress or resize the image.`,
              {
                requestId: ctx.requestId,
                instance: c.req.url,
                photoIndex: i,
                maxSize: MAX_IMAGE_SIZE,
                actualSize
              }
            ),
            413
          )
        }

        totalBatchSize += actualSize
        processedImages.push({ index: i, buffer: imageBuffer, type: (file as File).type || 'image/jpeg' })

        console.log(
          `[V3 Scan] Photo ${i}: ${(actualSize / 1_000_000).toFixed(2)}MB, type: ${(file as File).type}`
        )
      }

      // Validate total batch size
      if (totalBatchSize > MAX_BATCH_SIZE) {
        return c.json(
          createProblemDetails(
            'FILE_TOO_LARGE',
            `Total batch size exceeds maximum of ${MAX_BATCH_SIZE / 1_000_000}MB (actual: ${(totalBatchSize / 1_000_000).toFixed(1)}MB). Reduce number of photos or compress images (max ${MAX_PHOTOS_PER_BATCH} photos at 10MB each).`,
            {
              requestId: ctx.requestId,
              instance: c.req.url,
              maxBatchSize: MAX_BATCH_SIZE,
              actualBatchSize: totalBatchSize
            }
          ),
          413
        )
      }

      console.log(
        `[V3 Scan] Processing ${photoFiles.length} photos, total size: ${(totalBatchSize / 1_000_000).toFixed(2)}MB`
      )

      // Generate job ID and auth token
      const jobId = crypto.randomUUID()
      const authToken = generateAuthToken()

      console.log(`[V3 Scan] Creating job ${jobId} for ${photoFiles.length} photos`)

      // Get JobStateManagerDO stub
      const doStub = getJobStateManagerDO(jobId, c.env)

      // Initialize job state
      await doStub.initializeJobState(jobId, 'bookshelf_scan', photoFiles.length)

      // Store auth token in DO (1 hour expiry)
      await doStub.setAuthToken(authToken, Date.now() + 3600000)

      // Schedule bookshelf scan processing via DO alarm
      c.executionCtx.waitUntil(doStub.scheduleBookshelfScan!(processedImages, jobId))

      const streamUrl = buildStreamUrl(c.req.url, 'scans', jobId)

      const data: JobInitData = {
        jobId,
        status: 'queued',
        streamUrl,
        token: authToken
      }

      return c.json(
        {
          success: true,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId
          },
          _links: createJobLinks('scans', jobId, streamUrl)
        },
        202
      )
    } catch (error: any) {
      console.error('[V3 Scan] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // ========================================================================
  // GET /v3/jobs/scans/:jobId - Get job status
  // ========================================================================
  const getScanStatusRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/scans/:jobId',
    tags: ['Jobs'],
    summary: 'Get scan job status',
    description: `Query current status of bookshelf scan job.

**Polling Guidance:**
- Use SSE stream for real-time updates (recommended)
- Polling fallback: max 1 request every 2 seconds
- Rate limit: 30 requests/minute per job`,
    request: {
      params: z.object({
        jobId: z.string().uuid()
      })
    },
    responses: {
      200: {
        description: 'Job status',
        content: { 'application/json': { schema: JobStatusResponseSchema } }
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } }
      }
    }
  })

  app.openapi(getScanStatusRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Scan job not found', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          404
        )
      }

      const job: Job = {
        jobId: state.jobId,
        type: state.type,
        status: state.status,
        progress: state.progress,
        processedCount: state.processedCount,
        totalCount: state.totalCount,
        startTime: state.startTime,
        completedTime: state.completedTime,
        error: state.error
      }

      return c.json(
        {
          success: true,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId
          }
        },
        200
      )
    } catch (error: any) {
      console.error('[V3 Scan Status] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // ========================================================================
  // GET /v3/jobs/scans/:jobId/stream - SSE progress stream
  // ========================================================================
  const streamScanRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/scans/:jobId/stream',
    tags: ['Jobs'],
    summary: 'Stream scan progress (SSE)',
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
        jobId: z.string().uuid()
      }),
      headers: z.object({
        authorization: z.string().optional().openapi({
          description: 'Bearer token from job creation',
          example: 'Bearer a1b2c3d4e5f6...'
        }),
        'last-event-id': z.string().optional().openapi({
          description: 'Last received event ID for reconnection',
          example: '42'
        })
      })
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
                z.object({ timestamp: z.string() })
              ])
            })
          }
        }
      },
      401: {
        description: 'Unauthorized (invalid or expired token)',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } }
      }
    }
  })

  app.openapi(streamScanRoute, async (c) => {
    const { jobId } = c.req.valid('param')
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.replace('Bearer ', '')?.trim()

    // Validate token format
    if (!validateTokenFormat(token)) {
      return c.json(
        createProblemDetails('UNAUTHORIZED', 'Invalid token format', {
          instance: c.req.url
        }),
        401
      )
    }

    // Validate token with DO
    const doStub = getJobStateManagerDO(jobId, c.env)
    const authResult = await doStub.validateAuthToken(token)

    if (!authResult.valid) {
      return c.json(
        createProblemDetails(
          'UNAUTHORIZED',
          authResult.expired ? 'Token expired (1 hour limit)' : 'Invalid token',
          {
            instance: c.req.url
          }
        ),
        401
      )
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let eventId = 0

        // Helper to send SSE event
        const sendEvent = (event: string, data: any) => {
          eventId++
          controller.enqueue(encoder.encode(`id: ${eventId}\n`))
          controller.enqueue(encoder.encode(`event: ${event}\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Poll job state every 2 seconds
          const pollInterval = setInterval(async () => {
            try {
              const state = await doStub.getJobState()

              if (!state) {
                clearInterval(pollInterval)
                sendEvent('error', {
                  jobId,
                  error: {
                    code: 'NOT_FOUND',
                    message: 'Job not found'
                  },
                  timestamp: new Date().toISOString()
                })
                controller.close()
                return
              }

              // Send progress event
              if (state.status === 'processing' || state.status === 'queued') {
                sendEvent('progress', {
                  jobId: state.jobId,
                  status: state.status,
                  progress: state.progress,
                  processedCount: state.processedCount,
                  totalCount: state.totalCount,
                  timestamp: new Date().toISOString()
                })
              }

              // Send completion event with results
              if (state.status === 'completed') {
                clearInterval(pollInterval)

                // Fetch results from KV
                const resultsKey = `scan-results:${jobId}`
                const results = (await c.env.CACHE.get(resultsKey, 'json')) || []

                sendEvent('complete', {
                  jobId: state.jobId,
                  status: 'completed',
                  results, // iOS expects books array
                  timestamp: new Date().toISOString()
                })

                controller.close()
              }

              // Send error event
              if (state.status === 'failed') {
                clearInterval(pollInterval)
                sendEvent('error', {
                  jobId: state.jobId,
                  error: state.error,
                  timestamp: new Date().toISOString()
                })
                controller.close()
              }
            } catch (pollError) {
              console.error('[V3 Scan Stream] Poll error:', pollError)
              clearInterval(pollInterval)
              sendEvent('error', {
                jobId,
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Failed to fetch job state'
                },
                timestamp: new Date().toISOString()
              })
              controller.close()
            }
          }, 2000)

          // Heartbeat ping every 30 seconds
          const pingInterval = setInterval(() => {
            sendEvent('ping', { timestamp: new Date().toISOString() })
          }, 30000)

          // Cleanup on stream close
          c.req.raw.signal.addEventListener('abort', () => {
            console.log(`[V3 Scan Stream] Client disconnected: ${jobId}`)
            clearInterval(pollInterval)
            clearInterval(pingInterval)
            controller.close()
          })
        } catch (error: any) {
          console.error('[V3 Scan Stream] Stream error:', error)
          sendEvent('error', {
            jobId,
            error: {
              code: 'INTERNAL_ERROR',
              message: error.message
            },
            timestamp: new Date().toISOString()
          })
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*', // CORS for SSE
        'Access-Control-Allow-Headers': 'Authorization, Last-Event-ID'
      }
    })
  })

  // ========================================================================
  // GET /v3/jobs/scans/:jobId/results - Get job results
  // ========================================================================
  const getScanResultsRoute = createRoute({
    method: 'get',
    path: '/v3/jobs/scans/:jobId/results',
    tags: ['Jobs'],
    summary: 'Get scan job results',
    description: `Fetch detected books from completed scan job.

Results include:
- Book metadata (title, author, ISBN)
- Bounding boxes (normalized to [0, 1])
- Confidence scores
- Enrichment data from external APIs

Results cached in KV for 2 hours after completion.`,
    request: {
      params: z.object({
        jobId: z.string().uuid()
      })
    },
    responses: {
      200: {
        description: 'Job results',
        content: {
          'application/json': {
            schema: JobResultsResponseSchema.extend({
              data: z.object({
                jobId: z.string().uuid(),
                status: JobStatusSchema,
                results: z.array(DetectedBookSchema)
              })
            })
          }
        }
      },
      404: {
        description: 'Job not found or not completed',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } }
      }
    }
  })

  app.openapi(getScanResultsRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Scan job not found', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          404
        )
      }

      if (state.status !== 'completed') {
        return c.json(
          createProblemDetails('NOT_FOUND', `Job not completed (status: ${state.status})`, {
            requestId: ctx.requestId,
            instance: c.req.url,
            jobStatus: state.status
          }),
          404
        )
      }

      // Fetch results from KV
      const resultsKey = `scan-results:${jobId}`
      const results = await c.env.CACHE.get(resultsKey, 'json')

      if (!results) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Results not found (may have expired after 2 hours)', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          404
        )
      }

      const data: JobResultsData = {
        jobId: state.jobId,
        status: state.status,
        results
      }

      return c.json(
        {
          success: true,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId
          }
        },
        200
      )
    } catch (error: any) {
      console.error('[V3 Scan Results] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // ========================================================================
  // DELETE /v3/jobs/scans/:jobId - Cancel job and cleanup R2
  // ========================================================================
  const cancelScanRoute = createRoute({
    method: 'delete',
    path: '/v3/jobs/scans/:jobId',
    tags: ['Jobs'],
    summary: 'Cancel scan job',
    description: `Cancel in-progress scan job and cleanup R2 storage.

**R2 Cleanup:**
- Deletes all uploaded photos for this job
- Prevents storage leaks
- Safe to call on already-completed jobs (no-op)

**Note:** Jobs may not stop immediately (graceful shutdown).`,
    request: {
      params: z.object({
        jobId: z.string().uuid()
      })
    },
    responses: {
      200: {
        description: 'Job canceled (includes R2 cleanup status)',
        content: { 'application/json': { schema: JobStatusResponseSchema } }
      },
      404: {
        description: 'Job not found',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      409: {
        description: 'Job already completed or failed',
        content: { 'application/problem+json': { schema: z.any() } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } }
      }
    }
  })

  app.openapi(cancelScanRoute, async (c) => {
    const ctx = c.get('ctx')
    const { jobId } = c.req.valid('param')

    try {
      const doStub = getJobStateManagerDO(jobId, c.env)
      const state = await doStub.getJobState()

      if (!state) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'Scan job not found', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          404
        )
      }

      // Cannot cancel completed/failed jobs
      if (state.status === 'completed' || state.status === 'failed') {
        return c.json(
          createProblemDetails('CONFLICT', `Cannot cancel ${state.status} job`, {
            requestId: ctx.requestId,
            instance: c.req.url,
            jobStatus: state.status
          }),
          409
        )
      }

      // Cancel job via DO
      await doStub.sendError({
        code: 'CANCELED',
        message: 'Job canceled by user'
      })

      // Cleanup R2 storage (delete all photos for this job)
      try {
        if (c.env.BOOKSHELF_IMAGES) {
          const r2Keys: string[] = []
          for (let i = 0; i < state.totalCount; i++) {
            r2Keys.push(`bookshelf-scans/${jobId}/photo-${i}.jpg`)
          }

          if (r2Keys.length > 0) {
            console.log(`[V3 Scan Cancel] Cleaning up ${r2Keys.length} R2 objects for job ${jobId}`)
            await deleteR2Objects(c.env.BOOKSHELF_IMAGES, r2Keys)
          }
        }
      } catch (r2Error) {
        console.error('[V3 Scan Cancel] R2 cleanup failed:', r2Error)
        // Don't fail the cancellation if R2 cleanup fails
      }

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
        error: canceledState.error
      }

      return c.json(
        {
          success: true,
          data: job,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId
          }
        },
        200
      )
    } catch (error: any) {
      console.error('[V3 Scan Cancel] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  console.log('[V3 Jobs] Bookshelf scan routes registered')
}
