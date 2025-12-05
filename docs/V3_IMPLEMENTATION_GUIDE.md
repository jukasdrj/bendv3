# V3 API Implementation Guide

**Quick Reference for Phase 2 Development**
**Target:** Enable frontend teams to migrate from V2 → V3

---

## Priority 1: Job Framework

### File Structure
```
src/api-v3/
  jobs/
    schema.ts          # Shared Zod schemas for all job types
    imports.ts         # CSV import routes (POST, GET status, GET stream, GET results)
    scans.ts           # Bookshelf scan routes
    enrichment.ts      # Batch enrichment async mode
    common.ts          # Shared job utilities (auth, DO access)
```

### Shared Schema (src/api-v3/jobs/schema.ts)
```typescript
import { z } from '@hono/zod-openapi'
import { SuccessResponseSchema, ErrorResponseSchema } from '@bookstrack/schemas'

// Job Types
export const JobTypeSchema = z.enum(['csv_import', 'bookshelf_scan', 'batch_enrichment'])
  .openapi({ description: 'Type of background job', example: 'csv_import' })

// Job Status
export const JobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed', 'canceled'])
  .openapi({ description: 'Current job status', example: 'processing' })

// Job Base Schema
export const JobSchema = z.object({
  jobId: z.string().uuid().openapi({ description: 'Unique job identifier', example: '550e8400-e29b-41d4-a716-446655440000' }),
  type: JobTypeSchema,
  status: JobStatusSchema,
  progress: z.number().min(0).max(1).openapi({ description: 'Completion progress (0.0 to 1.0)', example: 0.65 }),
  processedCount: z.number().int().min(0).openapi({ description: 'Number of items processed', example: 65 }),
  totalCount: z.number().int().min(0).openapi({ description: 'Total items to process', example: 100 }),
  startTime: z.string().datetime().openapi({ description: 'ISO 8601 start timestamp', example: '2025-12-05T10:00:00Z' }),
  completedTime: z.string().datetime().optional().openapi({ description: 'ISO 8601 completion timestamp' }),
  error: z.object({
    code: z.string().openapi({ example: 'INTERNAL_ERROR' }),
    message: z.string().openapi({ example: 'Gemini API rate limit exceeded' })
  }).optional()
}).openapi('Job')

// Job Initiation Response
export const JobInitResponseSchema = SuccessResponseSchema(z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  streamUrl: z.string().url().openapi({ description: 'SSE stream endpoint for real-time updates', example: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream' })
}))

// Job Status Response
export const JobStatusResponseSchema = SuccessResponseSchema(JobSchema)

// Job Results Response (generic, specific types override)
export const JobResultsResponseSchema = SuccessResponseSchema(z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  results: z.array(z.unknown()).openapi({ description: 'Job-specific result data' })
}))
```

### CSV Import Routes (src/api-v3/jobs/imports.ts)
```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { JobInitResponseSchema, JobStatusResponseSchema, JobResultsResponseSchema } from './schema'
import { createProblemDetails } from '@bookstrack/schemas/errors'
import { getJobStateManagerDO, generateAuthToken } from './common'

// POST /v3/jobs/imports - Initiate CSV import
export const createImportRoute = createRoute({
  method: 'post',
  path: '/v3/jobs/imports',
  tags: ['Jobs'],
  summary: 'Import books from CSV',
  description: 'Upload CSV file for background processing. Returns immediately with jobId for progress tracking.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.instanceof(File).openapi({ description: 'CSV file (max 8MB)', format: 'binary' })
          })
        }
      }
    }
  },
  responses: {
    202: {
      description: 'Import job accepted',
      content: { 'application/json': { schema: JobInitResponseSchema } }
    },
    400: {
      description: 'Invalid file',
      content: { 'application/problem+json': { schema: ErrorResponseSchema } }
    },
    413: {
      description: 'File too large (>8MB)',
      content: { 'application/problem+json': { schema: ErrorResponseSchema } }
    }
  }
})

export function registerImportRoutes(app: OpenAPIHono) {
  app.openapi(createImportRoute, async (c) => {
    const ctx = c.get('ctx')

    try {
      const formData = await c.req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return c.json(
          createProblemDetails('INVALID_REQUEST', 'Missing file in multipart form data', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          400
        )
      }

      // Validate file size (8MB limit for Gemini 2M token context)
      const MAX_FILE_SIZE = 8 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        return c.json(
          createProblemDetails('FILE_TOO_LARGE', `CSV file exceeds 8MB limit (${file.size} bytes)`, {
            requestId: ctx.requestId,
            instance: c.req.url,
            maxSize: MAX_FILE_SIZE,
            actualSize: file.size
          }),
          413
        )
      }

      // Generate job ID and auth token
      const jobId = crypto.randomUUID()
      const authToken = generateAuthToken()

      // Get JobStateManagerDO stub
      const doStub = getJobStateManagerDO(jobId, c.env)

      // Initialize job state
      await doStub.initializeJobState(jobId, 'csv_import', 0) // totalCount unknown until parsed

      // Store auth token in DO
      await doStub.setAuthToken(authToken, Date.now() + 3600000) // 1 hour expiry

      // Schedule CSV processing via DO alarm (avoids Worker CPU limits)
      const csvText = await file.text()
      c.executionCtx.waitUntil(
        doStub.scheduleCSVProcessing(csvText, jobId)
      )

      const streamUrl = `https://${new URL(c.req.url).host}/v3/jobs/imports/${jobId}/stream`

      return c.json({
        success: true,
        data: {
          jobId,
          status: 'queued' as const,
          streamUrl,
          token: authToken // SECURITY: Return token for SSE auth
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId
        },
        _links: {
          self: { href: `/v3/jobs/imports/${jobId}`, rel: 'self', method: 'GET' },
          stream: { href: streamUrl, rel: 'related', method: 'GET' },
          cancel: { href: `/v3/jobs/imports/${jobId}`, rel: 'related', method: 'DELETE' }
        }
      }, 202)

    } catch (error: any) {
      console.error('[V3 Import] Error:', error)
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // GET /v3/jobs/imports/:jobId - Get job status
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
            instance: c.req.url
          }),
          404
        )
      }

      return c.json({
        success: true,
        data: state,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId
        }
      }, 200)

    } catch (error: any) {
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // GET /v3/jobs/imports/:jobId/stream - SSE progress stream
  app.openapi(streamImportRoute, async (c) => {
    const { jobId } = c.req.valid('param')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')

    // Validate token
    const doStub = getJobStateManagerDO(jobId, c.env)
    const authResult = await doStub.validateAuthToken(token)

    if (!authResult.valid) {
      return c.json(
        createProblemDetails('UNAUTHORIZED', 'Invalid or expired token', {
          instance: c.req.url
        }),
        401
      )
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        // Helper to send SSE event
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Poll job state every 2 seconds
          const pollInterval = setInterval(async () => {
            const state = await doStub.getJobState()

            if (!state) {
              clearInterval(pollInterval)
              sendEvent('error', { message: 'Job not found' })
              controller.close()
              return
            }

            // Send progress event
            sendEvent('progress', {
              jobId: state.jobId,
              status: state.status,
              progress: state.progress,
              processedCount: state.processedCount,
              totalCount: state.totalCount
            })

            // Send completion event with results
            if (state.status === 'completed') {
              clearInterval(pollInterval)

              // Fetch results from KV
              const resultsKey = `csv-results:${jobId}`
              const results = await c.env.CACHE.get(resultsKey, 'json')

              sendEvent('complete', {
                jobId: state.jobId,
                status: 'completed',
                results: results || [] // iOS expects books array
              })

              controller.close()
            }

            // Send error event
            if (state.status === 'failed') {
              clearInterval(pollInterval)
              sendEvent('error', {
                jobId: state.jobId,
                error: state.error
              })
              controller.close()
            }
          }, 2000)

          // Cleanup on stream close
          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(pollInterval)
            controller.close()
          })

        } catch (error) {
          sendEvent('error', { message: (error as Error).message })
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      }
    })
  })
}
```

### Common Utilities (src/api-v3/jobs/common.ts)
```typescript
import type { Env } from '../../types'

export function getJobStateManagerDO(jobId: string, env: Env) {
  const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  return env.JOB_STATE_MANAGER_DO.get(doId)
}

export function generateAuthToken(): string {
  // Generate cryptographically secure token
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
```

---

## Priority 2: SSE Streaming

### Key Requirements
1. **Browser-native reconnection** with `Last-Event-ID`
2. **Books array in completion event** (iOS persistence requirement)
3. **Token-based auth** (Bearer token from job creation)
4. **Graceful cleanup** on client disconnect

### SSE Event Types
```typescript
// Progress update (every 2 seconds while processing)
event: progress
data: {"jobId": "uuid", "status": "processing", "progress": 0.5, "processedCount": 50, "totalCount": 100}

// Completion (includes full results for iOS)
event: complete
data: {"jobId": "uuid", "status": "completed", "results": [{...}, {...}]}

// Error (includes retryable flag)
event: error
data: {"jobId": "uuid", "error": {"code": "INTERNAL_ERROR", "message": "..."}}

// Heartbeat (every 30 seconds to keep connection alive)
event: ping
data: {"timestamp": "2025-12-05T10:00:00Z"}
```

### Client Example (iOS/JavaScript)
```swift
// iOS SSE client with reconnection
let eventSource = EventSource(url: streamUrl, headers: ["Authorization": "Bearer \(token)"])

eventSource.addEventListener("progress") { event in
    let data = try? JSONDecoder().decode(ProgressEvent.self, from: event.data)
    updateUI(progress: data.progress)
}

eventSource.addEventListener("complete") { event in
    let data = try? JSONDecoder().decode(CompleteEvent.self, from: event.data)
    saveBooks(data.results) // Persist books locally
    eventSource.close()
}

eventSource.addEventListener("error") { event in
    let data = try? JSONDecoder().decode(ErrorEvent.self, from: event.data)
    showError(data.error.message)
    eventSource.close()
}
```

---

## Priority 3: Migration Path for Handlers

### CSV Import Migration
**From:** `src/handlers/csv-import.ts` (V2)
**To:** `src/api-v3/jobs/imports.ts` (V3)

**Key Changes:**
1. Replace `createSuccessResponse` → RFC 9457 Problem Details
2. Replace `getProgressDOStub` → `getJobStateManagerDO`
3. Add HATEOAS links to response
4. Return 202 Accepted (not 200 OK)
5. Include auth token in response

**Code Reuse:**
- `processCSVCore` utility (no changes needed)
- Gemini API integration (no changes needed)
- Durable Object alarm scheduling (no changes needed)

### Bookshelf Scan Migration
**From:** `src/handlers/batch-scan-handler.ts` (V2)
**To:** `src/api-v3/jobs/scans.ts` (V3)

**Key Changes:**
1. Multipart parsing stays the same
2. R2 storage logic stays the same
3. Add job lifecycle management
4. Include SSE stream URL in response
5. Add bounding box validation (clamp to [0, 1])

**Code Reuse:**
- `scanImageWithGemini` (no changes needed)
- `enrichBooksParallel` (no changes needed)
- `deleteR2Objects` cleanup (no changes needed)

### Batch Enrichment Migration
**From:** `src/handlers/batch-enrichment.ts` (V2)
**To:** Extend `src/api-v3/index.ts` enrichment route

**Key Changes:**
1. Add `async` boolean flag to request body
2. When `async=false` (default), keep sync behavior
3. When `async=true`, create job and return job object
4. Backward compatible (no breaking changes for existing clients)

**Example:**
```typescript
// Sync mode (existing behavior)
POST /v3/books/enrich
{
  "isbns": ["978..."],
  "includeEmbedding": true
}
// Returns: { "success": true, "data": { "books": [...] } }

// Async mode (NEW)
POST /v3/books/enrich
{
  "isbns": ["978..."],
  "includeEmbedding": true,
  "async": true  // Trigger background job
}
// Returns: { "success": true, "data": { "jobId": "uuid", "streamUrl": "..." } }
```

---

## Testing Strategy

### Unit Tests
```typescript
// tests/v3/jobs.test.ts
import { describe, it, expect } from 'vitest'
import { createV3Router } from '../../src/api-v3/index'

describe('V3 Jobs API', () => {
  it('should create CSV import job', async () => {
    const app = createV3Router()
    const formData = new FormData()
    formData.append('file', new File(['isbn,title\n978...'], 'books.csv'))

    const res = await app.request('/v3/jobs/imports', {
      method: 'POST',
      body: formData
    })

    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.data.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(json.data.streamUrl).toContain('/stream')
  })

  it('should stream progress via SSE', async () => {
    // ... SSE stream test
  })
})
```

### Integration Tests
```bash
# Test CSV import end-to-end
curl -X POST https://api.oooefam.net/v3/jobs/imports \
  -F 'file=@books.csv' \
  | jq '.data.jobId'

# Test SSE stream (with auth token)
curl -N -H "Authorization: Bearer TOKEN" \
  https://api.oooefam.net/v3/jobs/imports/JOB_ID/stream
```

---

## Performance Targets

| Endpoint | P95 Latency | Notes |
|----------|-------------|-------|
| `POST /v3/jobs/imports` | <200ms | Job creation only (async processing) |
| `GET /v3/jobs/{type}/{id}` | <100ms | Cached DO state |
| `GET /v3/jobs/{type}/{id}/stream` | <50ms | SSE connection establishment |
| SSE event interval | 2s | Balance between real-time and efficiency |

---

## Rollout Plan

### Week 1: Job Framework
- [ ] Implement shared schemas
- [ ] Create common utilities
- [ ] Add CSV import routes
- [ ] Unit tests for job lifecycle

### Week 2: SSE Streaming
- [ ] Implement SSE endpoint
- [ ] Add reconnection support (Last-Event-ID)
- [ ] Test with iOS app
- [ ] Load test (1000 concurrent streams)

### Week 3: Remaining Jobs
- [ ] Bookshelf scan routes
- [ ] Batch enrichment async mode
- [ ] Integration tests
- [ ] Documentation updates

### Week 4: Production Validation
- [ ] Canary deployment (10% traffic)
- [ ] Monitor error rates
- [ ] Gather frontend feedback
- [ ] Fix blockers

---

## Success Criteria

- [ ] All V3 job endpoints pass contract tests
- [ ] SSE reconnection success rate >95%
- [ ] iOS app successfully migrates to V3
- [ ] No performance regressions vs V2
- [ ] Zero P0 bugs in production

---

**Next Steps:** Start with Priority 1 (Job Framework), then move to Priority 2 (SSE Streaming).
