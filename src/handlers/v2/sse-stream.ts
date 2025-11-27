/**
 * V2 SSE Streaming Handler
 *
 * Sprint 3: Server-Sent Events for Import Progress (API_CONTRACT_V2_PROPOSAL.md)
 *
 * GET /api/v2/imports/{jobId}/stream - Real-time progress via SSE
 *
 * SSE provides automatic reconnection (browser native) and is firewall-friendly
 * compared to WebSocket. Uses Durable Object for state management.
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md § 2c
 */

import type { Env } from '../../types/env'

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
  error?: string
  canceled?: boolean
  cancelReason?: string
  canceledTime?: number
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

// ============================================================================
// Handler
// ============================================================================

/**
 * GET /api/v2/imports/{jobId}/stream
 *
 * Server-Sent Events stream for real-time import progress.
 *
 * Client connects and receives progress events as the job processes.
 * On disconnect, client can reconnect with Last-Event-ID header to resume.
 *
 * @example
 * const eventSource = new EventSource('/api/v2/imports/abc123/stream')
 * eventSource.onmessage = (e) => console.log(JSON.parse(e.data))
 * eventSource.addEventListener('progress', (e) => updateProgress(JSON.parse(e.data)))
 * eventSource.addEventListener('complete', (e) => showComplete(JSON.parse(e.data)))
 */
export async function handleSSEStream(
  request: Request,
  env: Env,
  jobId: string
): Promise<Response> {
  // Validate Accept header (should be text/event-stream for proper SSE)
  const acceptHeader = request.headers.get('Accept')
  const isSSERequest = acceptHeader?.includes('text/event-stream')

  if (!isSSERequest) {
    // Return helpful error for non-SSE clients
    return new Response(JSON.stringify({
      error: {
        code: 'INVALID_ACCEPT_HEADER',
        message: 'This endpoint requires Accept: text/event-stream header',
        hint: 'Use EventSource API or set Accept header to text/event-stream'
      }
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Format': 'v2.0'
      }
    })
  }

  // Last-Event-ID support for reconnection (SSE standard)
  const lastEventId = request.headers.get('Last-Event-ID')
  const skipToEventId = lastEventId ? parseInt(lastEventId.split('-')[0], 10) : null

  // Create readable/writable stream pair for SSE
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Helper to write SSE event
  const writeEvent = async (event: SSEEvent) => {
    const formatted = formatSSE(event)
    await writer.write(encoder.encode(formatted))
  }

  // Start the SSE stream in background
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    try {
      // Send connection established comment and retry interval
      if (skipToEventId) {
        await writer.write(encoder.encode(`: reconnected from event ${lastEventId}\n`))
      } else {
        await writer.write(encoder.encode(': connection established\n'))
      }
      await writer.write(encoder.encode('retry: 5000\n\n'))

      // Get JobStateManagerDO stub for this job
      // Type cast to access RPC methods (same pattern as router.ts)
      const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
      const doStub = env.JOB_STATE_MANAGER_DO.get(doId) as unknown as {
        getJobState(): Promise<JobState | null>
      }

      // Initial state fetch
      let state: JobState | null = await doStub.getJobState()

      if (!state) {
        await writeEvent({
          event: 'error',
          data: JSON.stringify({
            error: 'job_not_found',
            message: 'Import job not found or not initialized',
            jobId
          })
        })
        await writer.close()
        return
      }

      // Skip initial event if reconnecting and event is old
      const currentTimestamp = Date.now()
      const shouldSkipInitial = skipToEventId && currentTimestamp - skipToEventId < 10000

      if (!shouldSkipInitial) {
        // Send initial status event
        const eventId = `${currentTimestamp}-initial`
        await writeEvent({
          id: eventId,
          event: state.status,
          data: JSON.stringify({
            jobId: state.jobId,
            status: state.status,
            progress: state.progress,
            processedCount: state.processedCount,
            totalCount: state.totalCount,
            ...(state.startTime && { startedAt: new Date(state.startTime).toISOString() })
          })
        })
      }

      // If job already complete, send complete event and close
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'canceled') {
        await writeEvent({
          id: `${Date.now()}-final`,
          event: state.status,
          data: JSON.stringify({
            jobId: state.jobId,
            status: state.status,
            progress: state.progress,
            processedCount: state.processedCount,
            totalCount: state.totalCount,
            ...(state.completedTime && { completedAt: new Date(state.completedTime).toISOString() }),
            ...(state.error && { error: state.error })
          })
        })
        await writer.close()
        return
      }

      // Poll for updates (Durable Object doesn't support push to external SSE)
      // In a full implementation, the DO would have a list of connected clients
      // For now, we poll every 2 seconds
      let lastProgress = state.progress
      let consecutiveNoChange = 0
      const maxNoChange = 150 // 5 minutes of no change = timeout

      while (state && state.status !== 'completed' && state.status !== 'failed' && state.status !== 'canceled') {
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Fetch updated state
        state = await doStub.getJobState()

        if (!state) {
          await writeEvent({
            event: 'error',
            data: JSON.stringify({
              error: 'job_state_lost',
              message: 'Job state was lost unexpectedly',
              jobId
            })
          })
          break
        }

        // Check if progress changed
        if (state.progress !== lastProgress) {
          consecutiveNoChange = 0
          lastProgress = state.progress

          // Send progress event
          await writeEvent({
            id: `${Date.now()}-progress`,
            event: state.status === 'processing' ? 'progress' : state.status,
            data: JSON.stringify({
              jobId: state.jobId,
              status: state.status,
              progress: state.progress,
              processedCount: state.processedCount,
              totalCount: state.totalCount,
              ...(state.error && { error: state.error })
            })
          })
        } else {
          consecutiveNoChange++

          // Send heartbeat every 30 seconds even if no progress
          if (consecutiveNoChange % 15 === 0) {
            await writer.write(encoder.encode(': heartbeat\n\n'))
          }

          // Timeout after 5 minutes of no progress change
          if (consecutiveNoChange >= maxNoChange) {
            await writeEvent({
              event: 'timeout',
              data: JSON.stringify({
                error: 'stream_timeout',
                message: 'No progress for 5 minutes. Use polling endpoint to check status.',
                jobId,
                lastStatus: state.status,
                lastProgress: state.progress
              })
            })
            break
          }
        }
      }

      // Send final event if job completed
      if (state && (state.status === 'completed' || state.status === 'failed' || state.status === 'canceled')) {
        await writeEvent({
          id: `${Date.now()}-final`,
          event: state.status,
          data: JSON.stringify({
            jobId: state.jobId,
            status: state.status,
            progress: state.progress,
            processedCount: state.processedCount,
            totalCount: state.totalCount,
            ...(state.completedTime && { completedAt: new Date(state.completedTime).toISOString() }),
            ...(state.error && { error: state.error })
          })
        })
      }

    } catch (error) {
      console.error('[SSE Stream] Error:', error)
      try {
        await writeEvent({
          event: 'error',
          data: JSON.stringify({
            error: 'stream_error',
            message: 'An error occurred while streaming progress',
            details: (error as Error).message
          })
        })
      } catch {
        // Writer may already be closed
      }
    } finally {
      try {
        await writer.close()
      } catch {
        // Writer may already be closed
      }
    }
  })()

  // Don't await the promise - let it run in background
  // The readable stream will close when the writer closes

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*', // SSE needs CORS
    }
  })
}
