# BooksTrack Streaming Guide: SSE vs WebSocket

**Last Updated:** December 3, 2025
**API Version:** V2 (Stable) + V3 (Current)

This guide explains when to use Server-Sent Events (SSE) vs WebSockets for real-time progress tracking in BooksTrack.

---

## TL;DR - Which Protocol Should I Use?

| **Use Case** | **Protocol** | **Endpoint** | **Why?** |
|--------------|--------------|--------------|----------|
| **CSV Import** | SSE | `GET /api/v2/imports/:id/stream` | One-way progress, browser-native reconnect |
| **Batch Enrichment** | WebSocket | `GET /ws/progress?jobId=xxx` | Bidirectional, cancel support, ready acks |
| **Bookshelf Scanning** | WebSocket | `GET /ws/progress?jobId=xxx` | Bidirectional, cancel support, real-time feedback |

---

## Architecture Overview

BooksTrack uses a **hybrid streaming architecture**:

- **SSE** for long-running import jobs (CSV parsing, Gemini processing)
- **WebSocket** for interactive batch operations (enrichment, scanning)

Both protocols coexist to provide optimal UX for different workflows.

---

## Server-Sent Events (SSE)

### When to Use

✅ **CSV Import Progress** - One-way updates from server to client
✅ **Long-running jobs** - Import processing can take 30+ seconds
✅ **Firewall-friendly environments** - SSE uses HTTP/1.1
✅ **Browser-native reconnection** - Automatic retry with `Last-Event-ID`

### Endpoints

```
POST /api/v2/imports         → Returns { jobId, authToken, sseUrl }
GET  /api/v2/imports/:id/stream  → SSE stream
```

### Client Example (EventSource API)

```typescript
import { createBooksTrackClient } from '@bookstrack/api-client'

const client = createBooksTrackClient({ baseUrl: 'https://api.oooefam.net' })

// 1. Upload CSV file
const formData = new FormData()
formData.append('file', csvFile)

const { data } = await client.POST('/api/v2/imports', {
  body: formData
})

const { jobId, sseUrl } = data.data

// 2. Connect to SSE stream
const eventSource = new EventSource(sseUrl)

// Listen for progress events
eventSource.addEventListener('progress', (e) => {
  const update = JSON.parse(e.data)
  console.log(`Progress: ${update.progress * 100}%`)
  console.log(`Status: ${update.status}`)
})

// Listen for completion
eventSource.addEventListener('completed', (e) => {
  const result = JSON.parse(e.data)
  console.log(`✅ Import complete: ${result.processedCount} books`)
  console.log('Books:', result.books)
  eventSource.close()
})

// Listen for errors
eventSource.addEventListener('failed', (e) => {
  const error = JSON.parse(e.data)
  console.error('❌ Import failed:', error.error.message)
  eventSource.close()
})

// Handle connection errors
eventSource.onerror = (e) => {
  console.error('SSE connection error:', e)
  // EventSource will automatically reconnect with Last-Event-ID
}
```

### SSE Event Types

| Event | Description | When Sent |
|-------|-------------|-----------|
| `progress` | Import progress update | Every book processed |
| `completed` | Import finished successfully | Job complete |
| `failed` | Import failed with error | Job failed |
| `timeout` | Stream timeout (5 min no updates) | Connection idle |

### SSE Payload Structure

**Progress Event:**
```json
{
  "jobId": "uuid",
  "status": "processing",
  "progress": 0.65,
  "processedCount": 32,
  "totalCount": 50,
  "startedAt": "2025-12-03T12:00:00Z"
}
```

**Completed Event:**
```json
{
  "jobId": "uuid",
  "status": "completed",
  "progress": 1.0,
  "processedCount": 50,
  "totalCount": 50,
  "completedAt": "2025-12-03T12:05:30Z",
  "books": [
    {
      "isbn": "9780439708180",
      "title": "Harry Potter",
      "authors": ["J.K. Rowling"],
      "language": "en"
    }
  ]
}
```

### SSE Features

- ✅ **Automatic reconnection** - Browser retries with `Last-Event-ID` header
- ✅ **Heartbeat** - Server sends `: heartbeat\n\n` every 30 seconds
- ✅ **Adaptive polling** - Backend uses 500ms → 3s backoff to reduce DO load
- ✅ **Books array on completion** - iOS can persist immediately without separate fetch

---

## WebSocket

### When to Use

✅ **Batch Enrichment** - Bidirectional with cancel support
✅ **Bookshelf Scanning** - Real-time feedback during AI processing
✅ **Ready acknowledgments** - Client signals readiness to receive updates
✅ **Job cancellation** - Client can cancel mid-stream

### Endpoints

```
POST /v1/enrichment/batch       → Returns { jobId, authToken, websocketUrl }
POST /api/batch-enrich          → iOS compatibility alias
GET  /ws/progress?jobId=xxx     → WebSocket upgrade
```

### Client Example (WebSocket API)

```typescript
import { createBooksTrackClient } from '@bookstrack/api-client'

const client = createBooksTrackClient({ baseUrl: 'https://api.oooefam.net' })

// 1. Start batch enrichment
const { data } = await client.POST('/v1/enrichment/batch', {
  body: {
    books: [
      { title: 'Harry Potter', author: 'J.K. Rowling' },
      { isbn: '9780439708180' }
    ],
    jobId: crypto.randomUUID()
  }
})

const { jobId, authToken, websocketUrl } = data.data

// 2. Connect to WebSocket
const ws = new WebSocket(websocketUrl)

// Send auth token via Sec-WebSocket-Protocol header (RECOMMENDED)
// OR include in URL query params (deprecated, leaks in logs)
const wsSecure = new WebSocket(`wss://api.oooefam.net/ws/progress?jobId=${jobId}`, [
  authToken
])

ws.onopen = () => {
  console.log('WebSocket connected')

  // Send ready acknowledgment
  ws.send(JSON.stringify({ type: 'ready', jobId }))
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case 'ready_ack':
      console.log('Server acknowledged ready signal')
      break

    case 'progress':
      console.log(`Progress: ${message.progress * 100}%`)
      console.log(`Book: ${message.currentBook.title}`)
      break

    case 'book_enriched':
      console.log('Book enriched:', message.book)
      break

    case 'job_complete':
      console.log('✅ All books enriched')
      ws.close()
      break

    case 'error':
      console.error('❌ Error:', message.error)
      break
  }
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

ws.onclose = (event) => {
  if (event.wasClean) {
    console.log('WebSocket closed cleanly')
  } else {
    console.error('WebSocket connection lost')
  }
}

// Cancel job mid-stream
function cancelJob() {
  ws.send(JSON.stringify({ type: 'cancel', jobId }))
}
```

### WebSocket Message Types

**Client → Server:**
| Message Type | Description | When to Send |
|--------------|-------------|--------------|
| `ready` | Signal client is ready for updates | On connection |
| `cancel` | Cancel the job | User cancels |

**Server → Client:**
| Message Type | Description | When Sent |
|--------------|-------------|-----------|
| `ready_ack` | Acknowledge ready signal | After client sends `ready` |
| `progress` | Job progress update | Every book enriched |
| `book_enriched` | Single book enriched | Per book completion |
| `job_complete` | Job finished | All books processed |
| `error` | Error occurred | Job failed |

### WebSocket Authentication

**RECOMMENDED: Sec-WebSocket-Protocol Header**
```typescript
const ws = new WebSocket(
  'wss://api.oooefam.net/ws/progress?jobId=xxx',
  [authToken]  // Passed as subprotocol
)
```

**DEPRECATED: URL Query Parameter** ⚠️
```typescript
// ⚠️ Leaks token in browser history, logs, and network traffic
const ws = new WebSocket(
  `wss://api.oooefam.net/ws/progress?jobId=xxx&token=${authToken}`
)
```

**Backward Compatible:** Backend supports both methods until March 1, 2026.

---

## Comparison Matrix

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| **Direction** | Server → Client (one-way) | Bidirectional |
| **Reconnection** | Browser-native with `Last-Event-ID` | Manual retry logic required |
| **Protocol** | HTTP/1.1 (firewall-friendly) | WebSocket (upgrade from HTTP) |
| **Cancel Support** | ❌ Requires separate HTTP DELETE | ✅ Send `cancel` message |
| **Ready Ack** | ❌ Not needed (one-way stream) | ✅ Client signals readiness |
| **Use Case** | CSV imports, long jobs | Batch enrichment, scanning |
| **Complexity** | Low (native `EventSource`) | Medium (manual reconnect) |
| **Browser Support** | 97%+ (all modern browsers) | 98%+ (all modern browsers) |

---

## Fallback: HTTP Polling

If neither SSE nor WebSocket is available (corporate firewalls, legacy browsers), use HTTP polling:

```typescript
const client = createBooksTrackClient({ baseUrl: 'https://api.oooefam.net' })

async function pollJobStatus(jobId: string) {
  const interval = setInterval(async () => {
    const { data } = await client.GET('/api/v2/imports/{jobId}', {
      params: { path: { jobId } }
    })

    const job = data.data
    console.log(`Progress: ${job.progress * 100}%`)

    if (job.status === 'completed' || job.status === 'failed') {
      clearInterval(interval)
      console.log('Job finished:', job.status)
    }
  }, 2000) // Poll every 2 seconds (rate-limited to 30 req/min)
}
```

**Rate Limits:**
- CSV Import Status: 30 requests/minute
- Enrichment Status: 30 requests/minute

---

## Best Practices

### SSE

1. **Always handle reconnection** - `EventSource` auto-reconnects, but handle `onerror`
2. **Close on completion** - Call `eventSource.close()` when job completes
3. **Include Last-Event-ID** - Browser sends automatically for resume support
4. **Handle timeout events** - Stream closes after 5 min of inactivity

### WebSocket

1. **Send ready acknowledgment** - Signal readiness after connection opens
2. **Implement reconnection** - WebSocket doesn't auto-reconnect like SSE
3. **Use secure protocol** - `wss://` in production, `ws://` for local dev
4. **Handle cleanup** - Close connection in `useEffect` cleanup (React)
5. **Prefer Sec-WebSocket-Protocol** - Don't leak tokens in URL query params

### Both

1. **Show progress UI** - Update progress bar on every `progress` event
2. **Handle network failures** - Display "reconnecting..." message
3. **Timeout gracefully** - Fall back to polling if stream fails

---

## React Hooks Example

### SSE Hook

```typescript
import { useEffect, useState } from 'react'

export function useSSEStream(sseUrl: string | null) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>('idle')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!sseUrl) return

    const eventSource = new EventSource(sseUrl)

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      setProgress(data.progress)
      setStatus(data.status)
    })

    eventSource.addEventListener('completed', (e) => {
      const data = JSON.parse(e.data)
      setResult(data)
      setStatus('completed')
      eventSource.close()
    })

    eventSource.addEventListener('failed', (e) => {
      const data = JSON.parse(e.data)
      setError(new Error(data.error.message))
      setStatus('failed')
      eventSource.close()
    })

    return () => eventSource.close()
  }, [sseUrl])

  return { progress, status, result, error }
}
```

### WebSocket Hook

```typescript
import { useEffect, useState, useRef } from 'react'

export function useWebSocket(url: string | null, authToken: string | null) {
  const [progress, setProgress] = useState(0)
  const [connected, setConnected] = useState(false)
  const [result, setResult] = useState<any>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!url || !authToken) return

    const ws = new WebSocket(url, [authToken])
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'ready' }))
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.type === 'progress') {
        setProgress(message.progress)
      } else if (message.type === 'job_complete') {
        setResult(message)
        ws.close()
      }
    }

    ws.onclose = () => setConnected(false)

    return () => ws.close()
  }, [url, authToken])

  const cancel = () => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }))
  }

  return { progress, connected, result, cancel }
}
```

---

## Troubleshooting

### SSE Issues

**EventSource fails to connect:**
- Check CORS headers (`Access-Control-Allow-Origin`)
- Verify `Accept: text/event-stream` header
- Check firewall rules (port 443 for HTTPS)

**No events received:**
- Check backend heartbeat (should see `: heartbeat\n\n` every 30s)
- Verify job is actually processing (check polling endpoint)
- Check browser console for SSE errors

**Reconnection loop:**
- Backend may be rejecting `Last-Event-ID`
- Check if job already completed (SSE closes on completion)

### WebSocket Issues

**Connection refused:**
- Verify WebSocket URL uses `wss://` (secure) in production
- Check auth token is valid (generated within last 5 minutes)
- Ensure `jobId` exists (job was initialized)

**No messages received:**
- Send `ready` message after connection opens
- Check for `ready_ack` response
- Verify job is processing (not already complete)

**Disconnects immediately:**
- Auth token invalid or expired
- Job already completed/failed
- Backend restarted (connection lost)

---

## Migration Notes

**From Legacy `/search/*` API:**
- Old API had no streaming support
- Use new V2 endpoints with SSE/WebSocket

**From V1 to V2:**
- V1 jobs used WebSocket only
- V2 CSV imports use SSE (better UX)
- V2 batch enrichment still uses WebSocket (bidirectional needed)

---

## Support

- **Full API Docs:** [OpenAPI Specification](../../docs/openapi.yaml)
- **Issues:** [GitHub Issues](https://github.com/yourusername/bendv3/issues)
- **Backend Code:** [Router](../../src/router.ts), [SSE Handler](../../src/handlers/v2/sse-stream.ts)

---

**Last Updated:** December 3, 2025
**Maintained By:** BooksTrack Team (@jukasdrj)
