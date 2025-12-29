/**
 * V3 SSE Streaming for Job Progress
 *
 * GET /v3/jobs/{type}/{jobId}/stream
 *
 * Server-Sent Events (SSE) for real-time job progress updates.
 * Replaces WebSocket-based progress tracking from V1/V2.
 *
 * @module api-v3/jobs/stream
 */

import type {
  SSECompleteEvent,
  SSEErrorEvent,
  SSEPingEvent,
  SSEProgressEvent,
} from '@bookstrack/schemas'
import type { Context } from 'hono'
import type { Env } from '../../types/env'
import { fetchJobResults, parseLastEventId, validateTokenFormat } from './common'

// ============================================================================
// Types
// ============================================================================

interface SSEEvent {
  id?: string
  event?: string
  data: string
  retry?: number
}

interface JobState {
  jobId: string
  pipeline: string
  status: 'initialized' | 'processing' | 'completed' | 'failed' | 'canceled'
  progress: number
  processedCount: number
  totalCount: number
  startTime?: number
  lastUpdateTime?: number
  completedTime?: number
  failedTime?: number
  error?: {
    code: string
    message: string
    details?: any
    retryable?: boolean
  }
  result?: {
    books?: unknown[]
  }
  canceled?: boolean
  cancelReason?: string
  canceledTime?: number
}

interface JobStateManagerDO {
  getJobState(): Promise<JobState | null>
  registerSSEClient(clientId: string): Promise<{ success: boolean }>
  unregisterSSEClient(clientId: string): Promise<{ success: boolean }>
  getUpdates(afterTimestamp?: number): Promise<
    Array<{
      timestamp: number
      eventType: string
      data: any
    }>
  >
}

interface WebSocketConnectionDO {
  validateAuthToken(token: string | undefined): Promise<{ valid: boolean; expired?: boolean }>
}

// ============================================================================
// SSE Formatter
// ============================================================================

function formatSSE(event: SSEEvent): string {
  let message = ''

  if (event.id) {
    message += `id: ${event.id}\n`
  }

  if (event.event) {
    message += `event: ${event.event}\n`
  }

  if (event.retry !== undefined) {
    message += `retry: ${event.retry}\n`
  }

  // Data must be last, and each line prefixed with "data: "
  const dataLines = event.data.split('\n')
  for (const line of dataLines) {
    message += `data: ${line}\n`
  }

  // Double newline to end the event
  message += '\n'

  return message
}

/**
 * Send final event (completed/failed) to SSE stream
 *
 * Extracted helper to avoid code duplication in two places
 */
async function sendFinalEvent(
  state: JobState,
  writeEvent: (event: SSEEvent) => Promise<void>,
  env: Env,
): Promise<void> {
  if (state.status === 'completed') {
    // Fix: If books were stripped from DO storage, fetch from KV
    let books = state.result?.books || []
    if (
      (!books || (Array.isArray(books) && books.length === 0)) &&
      (state.totalCount > 0 || state.processedCount > 0)
    ) {
      const fetchedBooks = await fetchJobResults(state.jobId, state.pipeline, env)
      if (fetchedBooks.length > 0) {
        books = fetchedBooks
      }
    }

    const completeEvent: SSECompleteEvent = {
      jobId: state.jobId,
      status: 'completed',
      results: books,
      timestamp: new Date(state.completedTime || Date.now()).toISOString(),
    }
    await writeEvent({
      id: `${Date.now()}-final`,
      event: 'completed',
      data: JSON.stringify(completeEvent),
    })
  } else if (state.status === 'failed') {
    const errorEvent: SSEErrorEvent = {
      jobId: state.jobId,
      error: state.error || {
        code: 'UNKNOWN_ERROR',
        message: 'Job failed',
        retryable: false,
      },
      timestamp: new Date(state.failedTime || Date.now()).toISOString(),
    }
    await writeEvent({
      id: `${Date.now()}-final`,
      event: 'failed',
      data: JSON.stringify(errorEvent),
    })
  }
}

// ============================================================================
// Handler
// ============================================================================

/**
 * GET /v3/jobs/{type}/{jobId}/stream
 *
 * Server-Sent Events stream for real-time job progress.
 *
 * **Authentication:**
 * - Bearer token required (from job initiation response)
 * - Token validated via JobStateManagerDO
 *
 * **Reconnection:**
 * - Browser-native with Last-Event-ID header
 * - Resumes from last received event
 *
 * **Event Types:**
 * - `progress` - Every 2s while processing
 * - `completed` - Includes full books array for iOS persistence
 * - `failed` - Includes error details with retryable flag
 * - `ping` - Heartbeat every 30s
 *
 * @example
 * const eventSource = new EventSource('/v3/jobs/imports/abc123/stream', {
 *   headers: { 'Authorization': 'Bearer token123...' }
 * })
 * eventSource.addEventListener('progress', (e) => updateProgress(JSON.parse(e.data)))
 * eventSource.addEventListener('completed', (e) => saveBooks(JSON.parse(e.data).books))
 */
export async function handleSSEStream(
  c: Context<{ Bindings: Env }>,
  jobType: string,
  jobId: string,
): Promise<Response> {
  const request = c.req.raw
  const env = c.env

  // Validate Accept header (should be text/event-stream for proper SSE)
  const acceptHeader = request.headers.get('Accept')
  const isSSERequest = acceptHeader?.includes('text/event-stream')

  if (!isSSERequest) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_ACCEPT_HEADER',
          message: 'This endpoint requires Accept: text/event-stream header',
          hint: 'Use EventSource API or set Accept header to text/event-stream',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      },
      400,
    )
  }

  // Extract and validate Bearer token
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!validateTokenFormat(token)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Valid Bearer token required. Obtain from job initiation response.',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      },
      401,
    )
  }

  // Get WebSocketConnectionDO stub for token validation (tokens are stored here)
  const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
  const wsDoStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId) as unknown as WebSocketConnectionDO

  // Validate token with WebSocketConnectionDO (where tokens are stored)
  const tokenValidation = await wsDoStub.validateAuthToken(token)
  if (!tokenValidation.valid) {
    return c.json(
      {
        success: false,
        error: {
          code: tokenValidation.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: tokenValidation.expired
            ? 'Auth token expired. Tokens are valid for 1 hour.'
            : 'Invalid auth token. Token does not match this job.',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      },
      401,
    )
  }

  // Get JobStateManagerDO stub for job state operations
  const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  const doStub = env.JOB_STATE_MANAGER_DO.get(doId) as unknown as JobStateManagerDO

  // Last-Event-ID support for reconnection (SSE standard)
  const lastEventId = request.headers.get('Last-Event-ID')
  const resumeFromTimestamp = parseLastEventId(lastEventId)

  // Create readable/writable stream pair for SSE
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Helper to write SSE event
  const writeEvent = async (event: SSEEvent) => {
    const formatted = formatSSE(event)
    await writer.write(encoder.encode(formatted))
  }

  // Generate unique client ID for registration
  const clientId = crypto.randomUUID()

  // Cleanup function for unregistering client
  const cleanup = async () => {
    try {
      await doStub.unregisterSSEClient(clientId)
      console.log(`[SSE V3] Unregistered client ${clientId} for job ${jobId}`)
    } catch (error) {
      console.error('[SSE V3] Cleanup error:', error)
    }
  }

  // Start the SSE stream in background
  void (async () => {
    try {
      // Send connection established comment and retry interval
      if (resumeFromTimestamp !== null) {
        await writer.write(encoder.encode(`: reconnected from event ${lastEventId}\n`))
      } else {
        await writer.write(encoder.encode(': connection established\n'))
      }
      await writer.write(encoder.encode('retry: 5000\n\n'))

      // Register client with DO
      await doStub.registerSSEClient(clientId)
      console.log(`[SSE V3] Registered client ${clientId} for job ${jobId} (type: ${jobType})`)

      // Initial state fetch
      let state: JobState | null = await doStub.getJobState()

      if (!state) {
        const errorEvent: SSEErrorEvent = {
          jobId,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found or not initialized',
          },
          timestamp: new Date().toISOString(),
        }
        await writeEvent({
          event: 'error',
          data: JSON.stringify(errorEvent),
        })
        await cleanup()
        await writer.close()
        return
      }

      // Send initial status event (unless resuming from recent event)
      const currentTimestamp = Date.now()
      const shouldSkipInitial =
        resumeFromTimestamp !== null && currentTimestamp - resumeFromTimestamp < 10000

      if (!shouldSkipInitial) {
        // FIX: Use proper SSE event type ('progress', 'completed', 'failed', 'ping') per JSDoc
        // state.status is now always the enum value, state.statusMessage has the human-readable text

        // Always use 'progress' event type for SSEProgressEvent payloads (regardless of job status).
        // The actual terminal event (SSECompleteEvent/SSEErrorEvent) is sent by sendFinalEvent immediately after.
        const eventType = 'progress'
        const progressEvent: SSEProgressEvent = {
          jobId: state.jobId,
          status: state.status,
          progress: state.progress,
          processedCount: state.processedCount,
          totalCount: state.totalCount,
          timestamp: new Date().toISOString(),
        }
        await writeEvent({
          id: `${currentTimestamp}-initial`,
          event: eventType,
          data: JSON.stringify(progressEvent),
        })
      }

      // If job already complete, send final event and close
      if (
        state.status === 'completed' ||
        state.status === 'failed' ||
        state.status === 'canceled'
      ) {
        await sendFinalEvent(state, writeEvent, env)
        await cleanup()
        await writer.close()
        return
      }

      // Push-based updates with adaptive backoff
      let lastTimestamp = resumeFromTimestamp || state.lastUpdateTime || state.startTime || 0
      let lastHeartbeat = Date.now()
      let lastUpdateTime = Date.now()
      let lastStateRefresh = Date.now()

      // Adaptive polling backoff to reduce DO contention
      const MIN_POLL_INTERVAL = 500 // Start fast for responsive updates
      const MAX_POLL_INTERVAL = 3000 // Cap at 3s to prevent staleness
      const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
      let pollInterval = MIN_POLL_INTERVAL

      while (
        state &&
        state.status !== 'completed' &&
        state.status !== 'failed' &&
        state.status !== 'canceled'
      ) {
        // Wait with adaptive interval
        await new Promise((resolve) => setTimeout(resolve, pollInterval))

        // Check for new updates from DO (timestamp-based)
        const updates = await doStub.getUpdates(lastTimestamp)

        if (updates && updates.length > 0) {
          for (let i = 0; i < updates.length; i++) {
            let update = updates[i]
            // Fix: If update is 'completed' and books were stripped, fetch from KV
            if (
              update.eventType === 'completed' &&
              (!update.data.books || update.data.books.length === 0)
            ) {
              const fetchedBooks = await fetchJobResults(state.jobId, state.pipeline, env)
              if (fetchedBooks.length > 0) {
                // Create new object instead of mutating the original
                update = {
                  ...update,
                  data: { ...update.data, books: fetchedBooks },
                }
                updates[i] = update
              }
            }

            await writeEvent({
              id: `${update.timestamp}-${update.eventType}`,
              event: update.eventType,
              data: JSON.stringify(update.data),
            })
            lastTimestamp = Math.max(lastTimestamp, update.timestamp)
          }
          // Reset to fast polling when updates arrive
          lastUpdateTime = Date.now()
          pollInterval = MIN_POLL_INTERVAL
        } else {
          // No updates - back off gradually
          pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL)
        }

        // Send heartbeat every 30 seconds
        if (Date.now() - lastHeartbeat > 30000) {
          const pingEvent: SSEPingEvent = {
            timestamp: new Date().toISOString(),
          }
          await writeEvent({
            event: 'ping',
            data: JSON.stringify(pingEvent),
          })
          lastHeartbeat = Date.now()
        }

        // Timeout after 5 minutes of no updates
        if (Date.now() - lastUpdateTime > TIMEOUT_MS) {
          const errorEvent: SSEErrorEvent = {
            jobId,
            error: {
              code: 'STREAM_TIMEOUT',
              message: 'No progress for 5 minutes. Use polling endpoint to check status.',
              retryable: true,
            },
            timestamp: new Date().toISOString(),
          }
          await writeEvent({
            event: 'timeout',
            data: JSON.stringify(errorEvent),
          })
          break
        }

        // Refresh state periodically (every 10 seconds)
        if (Date.now() - lastStateRefresh > 10000) {
          state = await doStub.getJobState()
          lastStateRefresh = Date.now()
        }
      }

      // Send final event if job completed
      if (
        state &&
        (state.status === 'completed' || state.status === 'failed' || state.status === 'canceled')
      ) {
        await sendFinalEvent(state, writeEvent, env)
      }

      // Cleanup on normal completion
      await cleanup()
    } catch (error) {
      console.error('[SSE V3 Stream] Error:', error)
      try {
        const errorEvent: SSEErrorEvent = {
          jobId,
          error: {
            code: 'STREAM_ERROR',
            message: 'An error occurred while streaming progress',
            retryable: true,
          },
          timestamp: new Date().toISOString(),
        }
        await writeEvent({
          event: 'error',
          data: JSON.stringify(errorEvent),
        })
      } catch {
        // Writer may already be closed
      }
      await cleanup()
    } finally {
      try {
        await writer.close()
      } catch {
        // Writer may already be closed
      }
    }
  })()

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*', // SSE needs CORS
    },
  })
}
