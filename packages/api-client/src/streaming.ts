/**
 * BooksTrack Streaming Utilities
 *
 * Helper functions for SSE (CSV imports) and WebSocket (batch enrichment) progress tracking.
 *
 * @see STREAMING_GUIDE.md for complete documentation
 */

// ============================================================================
// Types
// ============================================================================

export interface SSEProgressEvent {
  jobId: string
  status: 'initialized' | 'processing' | 'completed' | 'failed' | 'canceled'
  progress: number
  processedCount: number
  totalCount: number
  startedAt?: string
  completedAt?: string
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
  books?: Array<{
    isbn?: string
    title: string
    authors: string[]
    language?: string
    publisher?: string
    publishedDate?: string
  }>
}

export interface WebSocketProgressMessage {
  type: 'ready_ack' | 'progress' | 'book_enriched' | 'job_complete' | 'error'
  jobId: string
  progress?: number
  currentBook?: {
    title: string
    isbn?: string
  }
  book?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

export interface SSEStreamOptions {
  sseUrl: string
  onProgress?: (event: SSEProgressEvent) => void
  onComplete?: (event: SSEProgressEvent) => void
  onFailed?: (event: SSEProgressEvent) => void
  onError?: (error: Error) => void
}

export interface WebSocketStreamOptions {
  websocketUrl: string
  authToken: string
  jobId: string
  onConnected?: () => void
  onProgress?: (message: WebSocketProgressMessage) => void
  onComplete?: (message: WebSocketProgressMessage) => void
  onError?: (error: Error) => void
  onDisconnected?: () => void
}

// ============================================================================
// SSE Stream Helper
// ============================================================================

/**
 * Create an SSE stream for CSV import progress tracking.
 *
 * Handles automatic reconnection via EventSource API and provides
 * typed event callbacks.
 *
 * @example
 * ```typescript
 * const stream = createSSEStream({
 *   sseUrl: '/api/v2/imports/abc123/stream',
 *   onProgress: (event) => console.log(`${event.progress * 100}%`),
 *   onComplete: (event) => console.log('Books:', event.books),
 *   onFailed: (event) => console.error(event.error)
 * })
 *
 * // Later: stream.close()
 * ```
 */
export function createSSEStream(options: SSEStreamOptions): EventSource {
  const { sseUrl, onProgress, onComplete, onFailed, onError } = options

  const eventSource = new EventSource(sseUrl)

  // Progress updates
  if (onProgress) {
    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent
        onProgress(data)
      } catch (err) {
        onError?.(new Error('Failed to parse progress event'))
      }
    })
  }

  // Job completed successfully
  if (onComplete) {
    eventSource.addEventListener('completed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent
        onComplete(data)
        eventSource.close()
      } catch (err) {
        onError?.(new Error('Failed to parse completion event'))
      }
    })
  }

  // Job failed
  if (onFailed) {
    eventSource.addEventListener('failed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent
        onFailed(data)
        eventSource.close()
      } catch (err) {
        onError?.(new Error('Failed to parse failure event'))
      }
    })
  }

  // Connection errors
  if (onError) {
    eventSource.onerror = (e) => {
      onError(new Error('SSE connection error'))
    }
  }

  return eventSource
}

// ============================================================================
// WebSocket Stream Helper
// ============================================================================

/**
 * Create a WebSocket stream for batch enrichment progress tracking.
 *
 * Handles authentication, ready acknowledgment, and provides typed
 * message callbacks.
 *
 * @example
 * ```typescript
 * const { ws, cancel } = createWebSocketStream({
 *   websocketUrl: 'wss://api.oooefam.net/ws/progress?jobId=abc123',
 *   authToken: 'token-uuid',
 *   jobId: 'abc123',
 *   onProgress: (msg) => console.log(`${msg.progress * 100}%`),
 *   onComplete: (msg) => console.log('All books enriched'),
 * })
 *
 * // Later: cancel()
 * ```
 */
export function createWebSocketStream(options: WebSocketStreamOptions): {
  ws: WebSocket
  cancel: () => void
} {
  const {
    websocketUrl,
    authToken,
    jobId,
    onConnected,
    onProgress,
    onComplete,
    onError,
    onDisconnected,
  } = options

  // Use Sec-WebSocket-Protocol for secure auth (recommended)
  const ws = new WebSocket(websocketUrl, [authToken])

  ws.onopen = () => {
    // Send ready acknowledgment
    ws.send(JSON.stringify({ type: 'ready', jobId }))
    onConnected?.()
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WebSocketProgressMessage

      switch (message.type) {
        case 'ready_ack':
          // Backend acknowledged ready signal
          break

        case 'progress':
          onProgress?.(message)
          break

        case 'book_enriched':
          onProgress?.(message)
          break

        case 'job_complete':
          onComplete?.(message)
          ws.close()
          break

        case 'error':
          onError?.(new Error(message.error?.message || 'Unknown error'))
          break
      }
    } catch (err) {
      onError?.(new Error('Failed to parse WebSocket message'))
    }
  }

  ws.onerror = (event) => {
    onError?.(new Error('WebSocket connection error'))
  }

  ws.onclose = () => {
    onDisconnected?.()
  }

  // Cancel function
  const cancel = () => {
    ws.send(JSON.stringify({ type: 'cancel', jobId }))
  }

  return { ws, cancel }
}

// ============================================================================
// React Hooks (Optional - Framework Adapters)
// ============================================================================

/**
 * Example React hook for SSE streaming.
 *
 * Can be copied into your React project or used as reference
 * for other frameworks (Vue, Svelte, etc.)
 *
 * @example
 * ```typescript
 * function CSVImportProgress({ sseUrl }: { sseUrl: string }) {
 *   const { progress, status, result, error } = useSSEStream(sseUrl)
 *
 *   if (error) return <div>Error: {error.message}</div>
 *   if (status === 'completed') return <div>Books: {result?.books.length}</div>
 *
 *   return <div>Progress: {progress * 100}%</div>
 * }
 * ```
 */
export function useSSEStream_Example(sseUrl: string | null) {
  // NOTE: This is a TypeScript-only example. To use in React:
  // 1. Copy this to your React project
  // 2. Import { useEffect, useState } from 'react'
  // 3. Uncomment the implementation below

  /*
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('idle')
  const [result, setResult] = useState<SSEProgressEvent | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!sseUrl) return

    const eventSource = createSSEStream({
      sseUrl,
      onProgress: (event) => {
        setProgress(event.progress)
        setStatus(event.status)
      },
      onComplete: (event) => {
        setResult(event)
        setStatus('completed')
      },
      onFailed: (event) => {
        setError(new Error(event.error?.message || 'Job failed'))
        setStatus('failed')
      },
      onError: (err) => setError(err),
    })

    return () => eventSource.close()
  }, [sseUrl])

  return { progress, status, result, error }
  */

  return {
    progress: 0,
    status: 'idle',
    result: null,
    error: null,
  }
}

/**
 * Example React hook for WebSocket streaming.
 *
 * Can be copied into your React project or used as reference
 * for other frameworks (Vue, Svelte, etc.)
 *
 * @example
 * ```typescript
 * function EnrichmentProgress({ url, token }: { url: string, token: string }) {
 *   const { progress, connected, cancel } = useWebSocketStream(url, token, 'job-id')
 *
 *   return (
 *     <div>
 *       <div>Progress: {progress * 100}%</div>
 *       <button onClick={cancel}>Cancel</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useWebSocketStream_Example(
  url: string | null,
  authToken: string | null,
  jobId: string
) {
  // NOTE: This is a TypeScript-only example. To use in React:
  // 1. Copy this to your React project
  // 2. Import { useEffect, useState, useRef } from 'react'
  // 3. Uncomment the implementation below

  /*
  const [progress, setProgress] = useState(0)
  const [connected, setConnected] = useState(false)
  const [result, setResult] = useState<WebSocketProgressMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!url || !authToken) return

    const { ws, cancel } = createWebSocketStream({
      websocketUrl: url,
      authToken,
      jobId,
      onConnected: () => setConnected(true),
      onProgress: (msg) => {
        if (msg.progress !== undefined) {
          setProgress(msg.progress)
        }
      },
      onComplete: (msg) => {
        setResult(msg)
        setConnected(false)
      },
      onDisconnected: () => setConnected(false),
    })

    wsRef.current = ws

    return () => ws.close()
  }, [url, authToken, jobId])

  const cancel = () => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel', jobId }))
  }

  return { progress, connected, result, cancel }
  */

  return {
    progress: 0,
    connected: false,
    result: null,
    cancel: () => {},
  }
}
