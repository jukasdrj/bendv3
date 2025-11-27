# Shelf Scan Process - Fixes Implementation Plan

**Created:** November 27, 2025
**Source:** Multi-Model Consensus Analysis (Gemini Pro, Grok-4, Gemini Flash)
**Confidence:** 8-9/10 across all models

---

## Executive Summary

Multi-model analysis identified critical issues in the bookshelf scan flow requiring backend and iOS coordination. This plan addresses security vulnerabilities, concurrency race conditions, data consistency problems, and reliability gaps.

**Total Effort:** ~6 days backend + iOS coordination

---

## Issues Identified

### Critical (P0)

| Issue | Severity | Description |
|-------|----------|-------------|
| Token in Query Params | CRITICAL | Still supported despite deprecation - exposes tokens in logs, browser history, referrer headers |
| WebSocket Race Condition | HIGH | Job may complete before client connects - misses `job_complete` message; DO has no state replay |
| TTL Mismatch | HIGH | KV results expire at 1h, token valid for 2h - valid token returns 404 for expired results |

### High Priority (P1)

| Issue | Severity | Description |
|-------|----------|-------------|
| R2 Storage Leak | HIGH | No cleanup on job failure/cancellation - orphaned objects are billable |
| Dangling enrichmentStatus | HIGH | Circuit breaker mid-enrichment leaves books stuck at `pending` forever |
| No Cancel Endpoint | MEDIUM | Users cannot abort long-running scans |

### Medium Priority (P2)

| Issue | Severity | Description |
|-------|----------|-------------|
| Dual-Write Drift | MEDIUM | KV + D1 writes can diverge on partial failure - inconsistent data |
| Count Semantics | MEDIUM | `successCount` ambiguous: photos processed or books detected? |

---

## Architecture Context

```
POST /api/batch-scan (1-5 photos)
         |
         v
+------------------+
| HTTP 202         |
| {jobId, token,   |
|  totalPhotos}    |
+------------------+
         |
         v
ctx.waitUntil(processBatchPhotos)
         |
         v
+----------------------------------------+
| Phase 1: Upload photos to R2           |
| Phase 2: Gemini Vision (per photo)     |
| Phase 3: Deduplicate detected books    |
| Phase 4: Parallel enrichment (max 10)  |  <-- Circuit breaker here
| Phase 5: Save to D1 + KV (1h TTL)      |  <-- Dual-write issue
| Phase 6: WebSocket job_complete        |  <-- Race condition here
+----------------------------------------+
         |
         v
GET /v1/scan/results/{jobId}
         |
         v
DetectedBookDTO[]
```

---

## Implementation Phases

### Phase 1: Critical Security & UX Fixes (P0)

#### 1.1 Remove Query Param Token Support

**File:** `src/durable-objects/progress-socket.js` (lines 142-257)

**Current behavior:**
```javascript
// DEPRECATED - Still working
const token = url.searchParams.get('token')
```

**Target behavior:**
```javascript
// Subprotocol ONLY
const protocol = request.headers.get('Sec-WebSocket-Protocol')
// Format: bookstrack-auth.{token}
const token = protocol?.split('.')[1]
if (!token) {
  return new Response('Unauthorized', { status: 401 })
}
```

**Feature Flag:** `REQUIRE_SUBPROTOCOL_AUTH=true/false`

**Client Impact:** iOS MUST use subprotocol header - breaking change

---

#### 1.2 Persist job_complete for Late WebSocket Connects

**File:** `src/durable-objects/job-state-manager.js`

**Problem:** Client connects after job completes, never receives `job_complete`

**Solution:**
```javascript
// On job completion, persist the payload
async complete(pipeline, payload) {
  this.state.completionPayload = {
    type: 'job_complete',
    payload,
    timestamp: Date.now()
  }
  await this.state.storage.put('completionPayload', this.state.completionPayload)
  // Also broadcast to connected clients
  await this.broadcast(this.state.completionPayload)
}

// On WebSocket connect, check for stored completion
async handleWebSocket(request) {
  // ... auth logic ...

  const stored = await this.state.storage.get('completionPayload')
  if (stored) {
    // Job already complete - send immediately
    ws.send(JSON.stringify(stored))
    ws.close(1000, 'Job already complete')
    return
  }
  // ... continue normal flow ...
}
```

---

#### 1.3 Align TTL: KV Results >= Token Expiry

**File:** `src/handlers/batch-scan-handler.ts` (lines 614-619)

**Current:**
```typescript
await env.KV_CACHE.put(`scan-results:${jobId}`, JSON.stringify(results), {
  expirationTtl: 3600  // 1 hour - PROBLEM
})
```

**Fix:**
```typescript
const RESULTS_TTL = 7200  // 2 hours - matches token expiry

await env.KV_CACHE.put(`scan-results:${jobId}`, JSON.stringify(results), {
  expirationTtl: RESULTS_TTL
})

// Also update expiresAt in job_complete payload
const expiresAt = new Date(Date.now() + RESULTS_TTL * 1000).toISOString()
```

---

### Phase 2: Reliability Fixes (P1)

#### 2.1 R2 Cleanup on Failure

**File:** `src/handlers/batch-scan-handler.ts` (lines 229-662)

**Problem:** Failed jobs leave orphaned R2 objects (billable storage)

**Solution:**
```typescript
async function processBatchPhotos(jobId, photos, env, doStub) {
  const uploadedR2Keys: string[] = []

  try {
    // Phase 1: Upload - track keys
    for (const photo of photos) {
      const key = `scans/${jobId}/${photo.name}`
      await env.BOOKSHELF_IMAGES.put(key, photo.data)
      uploadedR2Keys.push(key)
    }

    // ... Phases 2-6 ...

  } catch (error) {
    await doStub.sendError('ai_scan', {
      code: 'E_BATCH_SCAN_FAILED',
      message: error.message,
      retryable: true
    })
    throw error

  } finally {
    // ALWAYS cleanup R2 - success or failure
    await deleteR2Objects(env.BOOKSHELF_IMAGES, uploadedR2Keys)
  }
}

async function deleteR2Objects(bucket, keys: string[]) {
  await Promise.allSettled(
    keys.map(key => bucket.delete(key))
  )
}
```

---

#### 2.2 Handle Circuit Breaker Mid-Enrichment

**File:** `src/handlers/batch-scan-handler.ts` (lines 482-540)

**Problem:** Circuit breaker throws, `enrichmentStatus` stays `pending` forever

**Solution:**
```typescript
import { CircuitBreakerOpenError } from '../services/circuit-breaker'

async function enrichBook(book, env) {
  try {
    const enrichment = await handleSearchAdvanced(book.title, book.author, env)
    return {
      ...book,
      enrichmentStatus: 'success',
      enrichment
    }
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return {
        ...book,
        enrichmentStatus: 'circuit_open',  // NEW STATUS
        retryable: true,
        retryAfterMs: error.cooldownRemaining,
        error: {
          code: 'CIRCUIT_OPEN',
          provider: error.provider,
          message: `Provider ${error.provider} temporarily unavailable`
        }
      }
    }
    return {
      ...book,
      enrichmentStatus: 'error',
      retryable: false,
      error: { code: 'ENRICHMENT_FAILED', message: error.message }
    }
  }
}
```

**Update types:** `src/types/responses.ts`
```typescript
type EnrichmentStatus =
  | 'pending'
  | 'success'
  | 'error'
  | 'not_found'
  | 'circuit_open'  // NEW
```

---

#### 2.3 Cancel Endpoint with Rollback

**File:** `src/router.ts` - Add new endpoint

```typescript
router.delete('/v1/jobs/:jobId', async (c) => {
  const { jobId } = c.req.param()
  const env = c.env

  // 1. Get DO stub
  const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  const doStub = env.JOB_STATE_MANAGER_DO.get(doId)

  // 2. Mark as canceled in DO
  const state = await doStub.cancelJob()
  if (state.status === 'not_found') {
    return c.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
  }

  // 3. Cleanup R2 objects
  const r2Keys = await listR2Objects(env.BOOKSHELF_IMAGES, `scans/${jobId}/`)
  await deleteR2Objects(env.BOOKSHELF_IMAGES, r2Keys)

  // 4. Clear KV cache
  await env.KV_CACHE.delete(`scan-results:${jobId}`)

  // 5. Return partial results if any
  return c.json({
    success: true,
    data: {
      jobId,
      status: 'canceled',
      partialResults: state.partialResults || [],
      cleanedUp: {
        r2Objects: r2Keys.length,
        kvCache: true
      }
    }
  })
})
```

**Add to DO:** `src/durable-objects/job-state-manager.js`
```javascript
async cancelJob() {
  const currentState = await this.getJobState()
  if (!currentState) {
    return { status: 'not_found' }
  }

  this.state.status = 'canceled'
  this.state.canceledAt = Date.now()
  await this.state.storage.put('status', 'canceled')

  // Broadcast cancellation to connected WS clients
  await this.broadcast({
    type: 'job_canceled',
    jobId: this.jobId,
    partialResults: this.state.partialResults
  })

  return {
    status: 'canceled',
    partialResults: this.state.partialResults
  }
}
```

---

### Phase 3: Data Consistency (P2)

#### 3.1 Simplify to D1 Primary, KV Cache

**Current flow (problematic):**
```
D1.insert() --+--> KV.put()   // Parallel - can diverge
              |
              +--> (if KV fails, D1 still has data - inconsistent)
```

**New flow:**
```
D1.insert()
    |
    v
(on success)
    |
    v
KV.put()  // Write-through cache
    |
    v
(on KV failure - log warning, don't fail job)
```

**Implementation:**
```typescript
// Save results - D1 is source of truth
async function saveResults(jobId, results, env) {
  // 1. Write to D1 first (source of truth)
  await env.DB.prepare(`
    INSERT INTO scan_results (job_id, results, created_at)
    VALUES (?, ?, ?)
  `).bind(jobId, JSON.stringify(results), Date.now()).run()

  // 2. Write-through to KV cache (best effort)
  try {
    await env.KV_CACHE.put(`scan-results:${jobId}`, JSON.stringify(results), {
      expirationTtl: 7200
    })
  } catch (error) {
    console.warn(`KV cache write failed for ${jobId}:`, error.message)
    // Don't fail the job - D1 has the data
  }
}

// Read results - KV first, D1 fallback
async function getResults(jobId, env) {
  // 1. Try KV cache first (fast)
  const cached = await env.KV_CACHE.get(`scan-results:${jobId}`, 'json')
  if (cached) {
    return { data: cached, cached: true }
  }

  // 2. Fallback to D1 (source of truth)
  const row = await env.DB.prepare(`
    SELECT results FROM scan_results WHERE job_id = ?
  `).bind(jobId).first()

  if (!row) {
    return null
  }

  // 3. Repopulate cache for next request
  const results = JSON.parse(row.results)
  await env.KV_CACHE.put(`scan-results:${jobId}`, JSON.stringify(results), {
    expirationTtl: 7200
  }).catch(() => {}) // Ignore cache write failures

  return { data: results, cached: false }
}
```

---

#### 3.2 Clarify Count Semantics

**Current (ambiguous):**
```json
{
  "summary": {
    "totalProcessed": 45,
    "successCount": 38,
    "failureCount": 7
  }
}
```

**New (explicit):**
```json
{
  "summary": {
    "photosProcessed": 4,
    "booksDetected": 45,
    "booksEnriched": 38,
    "enrichmentFailed": 5,
    "enrichmentCircuitOpen": 2,
    "duration": 15000,
    "resourceId": "scan-results:abc-123"
  }
}
```

**Update type:** `src/types/websocket-messages.ts`
```typescript
interface ScanSummary {
  photosProcessed: number      // Photos successfully analyzed by Gemini
  booksDetected: number        // Total books found across all photos
  booksEnriched: number        // Books with successful metadata enrichment
  enrichmentFailed: number     // Books where enrichment failed
  enrichmentCircuitOpen: number // Books skipped due to circuit breaker
  duration: number             // Total processing time in ms
  resourceId: string           // KV key for results retrieval
}
```

---

### Phase 4: Documentation & Testing (P3)

#### 4.1 Update API Contract

**File:** `docs/API_CONTRACT.md`

Add sections:
1. Cancel endpoint documentation
2. WebSocket auth (subprotocol only, remove query param docs)
3. New `enrichmentStatus: "circuit_open"` value
4. Updated summary field semantics
5. Breaking change notice for token removal

#### 4.2 Add Integration Tests

```typescript
// tests/integration/shelf-scan.test.ts

describe('Shelf Scan - Edge Cases', () => {
  it('late WebSocket connect receives completion', async () => {
    // 1. Start scan
    const { jobId, token } = await startScan(photos)

    // 2. Wait for completion (poll status)
    await waitForJobComplete(jobId)

    // 3. Connect WebSocket AFTER completion
    const ws = await connectWebSocket(jobId, token)

    // 4. Should immediately receive job_complete
    const message = await ws.nextMessage()
    expect(message.type).toBe('job_complete')
  })

  it('circuit breaker sets correct enrichmentStatus', async () => {
    // 1. Force circuit open for google-books
    await forceCircuitOpen('google-books')

    // 2. Start scan
    const { jobId } = await startScan(photos)
    await waitForJobComplete(jobId)

    // 3. Check results
    const results = await getResults(jobId)
    const circuitOpenBooks = results.filter(
      b => b.enrichmentStatus === 'circuit_open'
    )
    expect(circuitOpenBooks.length).toBeGreaterThan(0)
    expect(circuitOpenBooks[0].retryable).toBe(true)
  })

  it('job cancellation cleans up R2', async () => {
    // 1. Start scan
    const { jobId } = await startScan(photos)

    // 2. Cancel mid-processing
    await fetch(`/v1/jobs/${jobId}`, { method: 'DELETE' })

    // 3. Verify R2 cleanup
    const r2Objects = await listR2Objects(`scans/${jobId}/`)
    expect(r2Objects.length).toBe(0)
  })

  it('KV failure does not fail job', async () => {
    // 1. Mock KV to fail
    mockKVFailure()

    // 2. Start scan
    const { jobId } = await startScan(photos)
    await waitForJobComplete(jobId)

    // 3. Results should still be in D1
    const results = await getResultsFromD1(jobId)
    expect(results).not.toBeNull()
  })
})
```

---

## iOS Client Requirements

### Required Changes

#### 1. WebSocket Auth Migration

**File:** `Services/WebSocketManager.swift`

```swift
// OLD (remove)
let url = URL(string: "wss://api.oooefam.net/ws/progress?jobId=\(jobId)&token=\(token)")

// NEW (required)
var request = URLRequest(url: URL(string: "wss://api.oooefam.net/ws/progress?jobId=\(jobId)")!)
request.setValue("bookstrack-auth.\(token)", forHTTPHeaderField: "Sec-WebSocket-Protocol")
```

#### 2. Handle New enrichmentStatus Values

**File:** `Models/DetectedBook.swift`

```swift
enum EnrichmentStatus: String, Codable {
    case pending
    case success
    case error
    case notFound = "not_found"
    case circuitOpen = "circuit_open"  // NEW
}
```

**File:** `Views/BookDetailView.swift`

```swift
switch book.enrichmentStatus {
case .circuitOpen:
    // Show retry UI with countdown
    RetryView(
        message: "Provider temporarily unavailable",
        retryAfterMs: book.retryAfterMs ?? 60000
    )
// ... other cases
}
```

#### 3. Support Cancel Endpoint

**File:** `ViewModels/ScanViewModel.swift`

```swift
func cancelScan() async throws {
    guard let jobId = currentJobId else { return }

    let response = try await apiClient.delete("/v1/jobs/\(jobId)")

    if response.success {
        // Show partial results if any
        if let partial = response.data?.partialResults {
            self.books = partial
        }
        self.status = .canceled
    }
}
```

---

## Rollout Strategy

```
Week 1: Backend Preparation
+----------------------------------+
| - Deploy all fixes with flags    |
| - REQUIRE_SUBPROTOCOL_AUTH=false |
| - Log warnings for query params  |
| - Monitor error rates            |
+----------------------------------+
            |
            v
Week 2: iOS Update
+----------------------------------+
| - Release iOS with subprotocol   |
| - Add circuit_open handling      |
| - Add cancel button              |
| - TestFlight -> App Store        |
+----------------------------------+
            |
            v
Week 3: Full Rollout
+----------------------------------+
| - REQUIRE_SUBPROTOCOL_AUTH=true  |
| - Remove query param code path   |
| - Monitor for 401 errors         |
| - Cleanup old code               |
+----------------------------------+
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| iOS breaks on token removal | High | High | Feature flag, phased rollout, TestFlight first |
| R2 cleanup misses edge cases | Medium | Low | Add metrics dashboard, manual cleanup script |
| D1/KV migration data loss | Low | High | Dual-read during transition period |
| Circuit breaker false positives | Medium | Medium | Tune thresholds, add monitoring alerts |

---

## Success Metrics

- [ ] Zero tokens appearing in access logs (security)
- [ ] Late WS connects receive completion within 100ms
- [ ] R2 orphaned objects: 0 (daily audit via metrics)
- [ ] No `enrichmentStatus: "pending"` after job complete
- [ ] KV/D1 consistency: 100% match on spot checks
- [ ] Cancel endpoint latency < 500ms p95

---

## Files to Modify

### Backend

| File | Changes |
|------|---------|
| `src/durable-objects/progress-socket.js` | Remove query param token support |
| `src/durable-objects/job-state-manager.js` | Add completion persistence, cancelJob() |
| `src/handlers/batch-scan-handler.ts` | R2 cleanup, TTL fix, circuit breaker handling |
| `src/services/parallel-enrichment.js` | Atomic status updates |
| `src/router.ts` | Add DELETE /v1/jobs/:jobId |
| `src/types/responses.ts` | Add circuit_open status |
| `src/types/websocket-messages.ts` | Update summary fields |
| `docs/API_CONTRACT.md` | Document all changes |

### iOS

| File | Changes |
|------|---------|
| `Services/WebSocketManager.swift` | Subprotocol auth |
| `Models/DetectedBook.swift` | New enrichmentStatus values |
| `ViewModels/ScanViewModel.swift` | Cancel support |
| `Views/ScanProgressView.swift` | Cancel button, circuit breaker retry UI |

---

## Open Questions for iOS Team

1. What is the current iOS app version supporting subprotocol auth?
2. Can we do phased rollout (TestFlight first)?
3. Expected timeline for iOS update approval (~1-2 weeks)?
4. Do we need graceful fallback if user is on old app version?

---

## Appendix: Consensus Model Analysis

This plan was generated from multi-model consensus analysis:

- **Gemini 2.5 Pro** (9/10 confidence): Architecture sound, implementation risks manageable
- **Grok-4** (8/10 confidence): Critical bugs identified, cleanup essential
- **Gemini 2.5 Flash** (8/10 confidence): Edge cases need hardening

All three models unanimously agreed on the critical issues and recommended fixes.
