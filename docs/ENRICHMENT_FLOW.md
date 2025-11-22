# Batch Enrichment Flow - Complete Guide

**Version:** 2.1.0
**Last Updated:** November 22, 2025
**Deployment:** `aaeeb8bb-d9b4-402c-a2de-9ac5e97da267`

---

## Overview

Batch enrichment is an asynchronous background job that enriches book metadata (covers, descriptions, ISBNs) from external providers (Google Books, OpenLibrary).

**Key Characteristics:**
- **Async Processing:** Jobs run in background via `ctx.waitUntil()`
- **WebSocket Progress:** Real-time updates pushed to client
- **KV Storage:** Results stored with 1-hour TTL
- **Multi-Provider:** Google Books (primary) → OpenLibrary (fallback)

---

## Flow Diagram

```
iOS Client                Backend Worker           Durable Object         KV Cache
    |                          |                        |                    |
    |-- POST /v1/enrichment/batch                       |                    |
    |   { books: [...], jobId }|                        |                    |
    |                          |                        |                    |
    |                          |-- setAuthToken() ----->|                    |
    |                          |<- token ---------------+                    |
    |                          |                        |                    |
    |                          |-- initializeJobState ->|                    |
    |                          |                        |                    |
    |<- 202 Accepted ----------|                        |                    |
    |   { jobId, token, ... }  |                        |                    |
    |                          |                        |                    |
    |                          |-- ctx.waitUntil() ---->|                    |
    |                          |   (background job)     |                    |
    |                          |                        |                    |
    |-- WebSocket Connect ---->|                        |                    |
    |   ?jobId=X&token=Y       |                        |                    |
    |                          |                        |                    |
    |                          |-- authenticate() ----->|                    |
    |                          |<- WebSocket upgrade ---+                    |
    |<- WebSocket Connected ---|                        |                    |
    |                          |                        |                    |
    |                          |  [Background Processing]                    |
    |                          |                        |                    |
    |                          |-- updateProgress() --->|                    |
    |<- { type: "progress" } --+<-----------------------+                    |
    |   { progress: 0.1 }      |                        |                    |
    |                          |                        |                    |
    |                          |-- updateProgress() --->|                    |
    |<- { type: "progress" } --+<-----------------------+                    |
    |   { progress: 0.2 }      |                        |                    |
    |                          |                        |                    |
    |                          |   ... (repeat) ...     |                    |
    |                          |                        |                    |
    |                          |-- KV.put() ---------------------------->   |
    |                          |   key: job-results:X   |                   |
    |                          |   value: [enriched books]                  |
    |                          |   ttl: 3600s           |                   |
    |                          |                        |                   |
    |                          |-- complete() --------->|                   |
    |<- { type: "complete" } --+<-----------------------+                   |
    |   { resourceId }         |                        |                   |
    |                          |                        |                   |
    |-- GET /v1/jobs/{jobId}/results                    |                   |
    |                          |                        |                   |
    |                          |-- KV.get() ---------------------------->   |
    |                          |<- [enriched books] ---------------------   |
    |<- 200 OK ----------------|                        |                   |
    |   { data: [...] }        |                        |                   |
```

---

## 1. Job Initialization (HTTP POST)

**Endpoint:** `POST /v1/enrichment/batch`

**Request:**
```json
{
  "books": [
    { "title": "Harry Potter", "author": "J.K. Rowling", "isbn": "9780439708180" },
    { "title": "The Hobbit", "author": "J.R.R. Tolkien" }
  ],
  "jobId": "9FFBB845-2261-480C-9C4D-49233883FB90"
}
```

**Response (202 Accepted):**
```json
{
  "data": {
    "jobId": "9FFBB845-2261-480C-9C4D-49233883FB90",
    "success": true,
    "processedCount": 0,
    "totalCount": 2,
    "token": "auth-token-uuid"
  },
  "metadata": {
    "timestamp": "2025-11-22T21:00:00Z"
  }
}
```

**Backend Actions:**
1. Validate request (max 100 books, title required, length limits)
2. Get Durable Object stub: `getProgressDOStub(jobId, env)`
3. Generate auth token: `crypto.randomUUID()`
4. Store token in DO: `await doStub.setAuthToken(authToken)`
5. Initialize job state: `await doStub.initializeJobState("batch_enrichment", books.length)`
6. Start background job: `ctx.waitUntil(processBatchEnrichment(...))`
7. Return 202 response immediately

**Code:** `src/handlers/batch-enrichment.ts:39-176`

---

## 2. WebSocket Connection

**Endpoint:** `GET /ws/progress?jobId=X&token=Y`

**iOS Connection Code:**
```swift
let urlString = "wss://api.oooefam.net/ws/progress?jobId=\(jobId)&token=\(token)"
let request = URLRequest(url: URL(string: urlString)!)
let webSocketTask = URLSession.shared.webSocketTask(with: request)
webSocketTask.resume()
```

**Backend WebSocket Upgrade:**
1. Parse query params: `jobId`, `token`
2. Get DO stub: `getProgressDOStub(jobId, env)`
3. Authenticate: `await doStub.fetch(request)` → DO validates token
4. Upgrade connection: `101 Switching Protocols` + `Connection: Upgrade` headers
5. DO stores WebSocket connection for progress updates

**Code:**
- `src/router.ts:757-786` (WebSocket upgrade)
- `src/durable-objects/progress-socket.js:68-124` (Token auth + connection storage)

---

## 3. Background Processing

**Function:** `processBatchEnrichment(books, doStub, env, jobId)`

**Process:**
1. **Parallel Enrichment:**
   - `enrichBooksParallel(books, enrichFn, progressFn, concurrency=10)`
   - For each book: `enrichSingleBook({ title, author, isbn }, env)`
   - Google Books API → OpenLibrary API (fallback)
   - Returns `{ work, edition, authors }` or `null`

2. **Progress Updates:**
   - After each book: `doStub.updateProgress("batch_enrichment", { progress, status, processedCount, currentItem })`
   - DO broadcasts to WebSocket: `{ type: "progress", pipeline: "batch_enrichment", data: {...} }`

3. **Result Storage:**
   - All books processed → `enrichedBooks` array
   - Store in KV: `env.KV_CACHE.put("job-results:{jobId}", JSON.stringify(enrichedBooks), { expirationTtl: 3600 })`
   - Key format: `job-results:9FFBB845-2261-480C-9C4D-49233883FB90`

4. **Completion:**
   - `doStub.complete("batch_enrichment", { summary: { totalProcessed, successCount, failureCount, duration, resourceId } })`
   - DO broadcasts: `{ type: "complete", pipeline: "batch_enrichment", data: { summary: {...} } }`

**Code:** `src/handlers/batch-enrichment.ts:186-275`

---

## 4. Progress Updates (WebSocket Messages)

**Message Types:**

### Ready Acknowledgement
```json
{
  "type": "ready_ack",
  "pipeline": "batch_enrichment",
  "timestamp": "2025-11-22T21:00:01Z"
}
```

### Progress Update
```json
{
  "type": "progress",
  "pipeline": "batch_enrichment",
  "data": {
    "progress": 0.5,
    "status": "Enriching (5/10): Harry Potter",
    "processedCount": 5,
    "currentItem": "Harry Potter"
  },
  "timestamp": "2025-11-22T21:00:15Z"
}
```

### Completion
```json
{
  "type": "complete",
  "pipeline": "batch_enrichment",
  "data": {
    "summary": {
      "totalProcessed": 10,
      "successCount": 8,
      "failureCount": 2,
      "duration": 12500,
      "resourceId": "job-results:9FFBB845-2261-480C-9C4D-49233883FB90"
    }
  },
  "timestamp": "2025-11-22T21:00:25Z"
}
```

### Error
```json
{
  "type": "error",
  "pipeline": "batch_enrichment",
  "error": {
    "code": "E_BATCH_PROCESSING_FAILED",
    "message": "Provider API timeout",
    "retryable": true
  },
  "timestamp": "2025-11-22T21:00:10Z"
}
```

**Code:** `src/durable-objects/progress-socket.js:232-329`

---

## 5. Results Retrieval (HTTP GET)

**Endpoint:** `GET /v1/jobs/{jobId}/results`

**Request:**
```bash
curl https://api.oooefam.net/v1/jobs/9FFBB845-2261-480C-9C4D-49233883FB90/results
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "title": "Harry Potter and the Sorcerer's Stone",
      "author": "J.K. Rowling",
      "isbn": "9780439708180",
      "success": true,
      "enriched": {
        "work": {
          "id": "google-books:abc123",
          "title": "Harry Potter and the Sorcerer's Stone",
          "description": "...",
          "genres": ["Fantasy", "Young Adult"]
        },
        "edition": {
          "id": "google-books:abc123",
          "isbn13": "9780439708180",
          "coverUrl": "https://...",
          "publisher": "Scholastic",
          "publicationYear": 1998
        },
        "authors": [
          {
            "id": "google-books:jk-rowling",
            "name": "J.K. Rowling",
            "bioShort": "British author"
          }
        ]
      }
    },
    {
      "title": "The Hobbit",
      "author": "J.R.R. Tolkien",
      "success": false,
      "error": "Book not found in any provider"
    }
  ],
  "metadata": {
    "timestamp": "2025-11-22T21:00:30Z",
    "cached": true,
    "provider": "kv_cache",
    "resourceId": "job-results:9FFBB845-2261-480C-9C4D-49233883FB90"
  }
}
```

**Response (404 Not Found):**
```json
{
  "data": null,
  "metadata": {
    "timestamp": "2025-11-22T21:00:30Z"
  },
  "error": {
    "message": "Job results not found or expired",
    "code": "NOT_FOUND"
  }
}
```

**Backend Logic:**
1. Extract `jobId` from URL path (max 100 chars)
2. Try multiple KV keys:
   - `csv-results:{jobId}`
   - `scan-results:{jobId}`
   - `job-results:{jobId}` ← **Batch enrichment uses this**
3. Return first found result
4. If none found → 404 Not Found

**Code:** `src/router.ts:895-960`

---

## Critical Fix: ExecutionContext in Hono

**Problem:** Background jobs weren't running because `ctx.waitUntil()` received `undefined`

**Root Cause:** Hono router didn't expose ExecutionContext from `fetch(request, env, ctx)`

**Solution:** Access `c.executionCtx` directly (Hono v4+ native support)

**Before (Broken):**
```typescript
const getCtx = (c: any): ExecutionContext | undefined => (c as any).executionCtx as ExecutionContext | undefined;

// This middleware did nothing
app.use("*", async (c, next) => {
  await next();
});

// Line 486: ctx could be undefined
handleBatchEnrichment(c.req.raw, c.env, getCtx(c));
```

**After (Fixed):**
```typescript
// Hono v4+ automatically exposes ctx when passed to fetch()
const getCtx = (c: any): ExecutionContext | undefined => c.executionCtx as ExecutionContext | undefined;

// Middleware removed (not needed - Hono handles it natively)
```

**Verification:**
```typescript
// src/index.js:41
return honoRouter.fetch(request, env, ctx); // ✅ ctx is passed to Hono

// src/router.ts:486
handleBatchEnrichment(c.req.raw, c.env, getCtx(c)); // ✅ getCtx(c) now returns valid ctx

// src/handlers/batch-enrichment.ts:153
ctx.waitUntil(processBatchEnrichment(books, doStub, env, jobId)); // ✅ ctx is valid, job runs
```

**Deployment:** `aaeeb8bb-d9b4-402c-a2de-9ac5e97da267` (Nov 22, 2025)

---

## Testing the Full Flow

### 1. Prepare Test Data
```bash
cat > test-books.json <<EOF
{
  "books": [
    { "title": "Harry Potter and the Sorcerer's Stone", "author": "J.K. Rowling", "isbn": "9780439708180" },
    { "title": "The Hobbit", "author": "J.R.R. Tolkien", "isbn": "9780547928227" }
  ],
  "jobId": "test-$(uuidgen)"
}
EOF
```

### 2. Start Enrichment Job
```bash
curl -X POST https://api.oooefam.net/v1/enrichment/batch \
  -H "Content-Type: application/json" \
  -d @test-books.json | jq
```

**Expected Response:**
```json
{
  "data": {
    "jobId": "test-ABC123",
    "success": true,
    "processedCount": 0,
    "totalCount": 2,
    "token": "auth-token-uuid"
  },
  "metadata": {
    "timestamp": "2025-11-22T21:00:00Z"
  }
}
```

### 3. Connect WebSocket (Terminal Test)
```bash
websocat "wss://api.oooefam.net/ws/progress?jobId=test-ABC123&token=auth-token-uuid"
```

**Expected Messages:**
```json
{"type":"ready_ack","pipeline":"batch_enrichment","timestamp":"..."}
{"type":"progress","pipeline":"batch_enrichment","data":{"progress":0.5,"status":"Enriching (1/2): Harry Potter..."},"timestamp":"..."}
{"type":"progress","pipeline":"batch_enrichment","data":{"progress":1.0,"status":"Enriching (2/2): The Hobbit"},"timestamp":"..."}
{"type":"complete","pipeline":"batch_enrichment","data":{"summary":{"totalProcessed":2,"successCount":2,"failureCount":0,"duration":5000,"resourceId":"job-results:test-ABC123"}},"timestamp":"..."}
```

### 4. Retrieve Results
```bash
curl https://api.oooefam.net/v1/jobs/test-ABC123/results | jq
```

**Expected Response:**
```json
{
  "data": [
    {
      "title": "Harry Potter and the Sorcerer's Stone",
      "success": true,
      "enriched": {
        "work": {...},
        "edition": {...},
        "authors": [...]
      }
    },
    {
      "title": "The Hobbit",
      "success": true,
      "enriched": {...}
    }
  ],
  "metadata": {
    "timestamp": "...",
    "cached": true,
    "provider": "kv_cache",
    "resourceId": "job-results:test-ABC123"
  }
}
```

---

## Common Issues

### Issue 1: WebSocket Connection Fails
**Symptoms:** `NSURLErrorDomain Code=-1011` or `WebSocket upgrade failed`

**Causes:**
1. Invalid `jobId` or `token`
2. Token not set before WebSocket connection
3. CORS blocking connection (iOS native apps should bypass this)

**Debug:**
```bash
# Check DO state
wrangler tail --format=json | jq 'select(.logs[].message | contains("WebSocket"))'

# Verify token was set
# Look for: "[ProgressWebSocketDO] Token set for job: X"
```

**Fix:**
- Ensure `setAuthToken()` is called before returning 202 response
- Verify token is passed correctly in WebSocket URL

### Issue 2: No Progress Updates
**Symptoms:** WebSocket connects but no messages received

**Causes:**
1. Background job not running (ExecutionContext issue) ✅ **FIXED**
2. DO not broadcasting messages
3. WebSocket connection lost

**Debug:**
```bash
# Check if background job started
wrangler tail | grep "processBatchEnrichment"

# Check if DO is sending messages
wrangler tail | grep "updateProgress"
```

**Fix:**
- Verify ExecutionContext is valid: `console.log("ctx defined:", !!ctx)`
- Check DO connection count: `wss.getWebSockets().length`

### Issue 3: Results Not Found (404)
**Symptoms:** `/v1/jobs/{jobId}/results` returns 404

**Causes:**
1. Results expired (1-hour TTL)
2. Job failed before storing results
3. Wrong KV key prefix

**Debug:**
```bash
# Check KV storage
wrangler kv:key list --binding=KV_CACHE | grep "job-results"

# Check completion message
wrangler tail | grep "complete"
```

**Fix:**
- Ensure `resourceId` in completion message matches KV key
- Check KV TTL: `{ expirationTtl: 3600 }`
- Verify job completed successfully (no errors in logs)

### Issue 4: Background Job Silent Failure
**Symptoms:** 202 response but no processing

**Cause:** `ctx.waitUntil()` called with undefined ctx ✅ **FIXED**

**Debug:**
```typescript
// src/handlers/batch-enrichment.ts:153
console.log("ctx defined:", !!ctx);
console.log("ctx type:", typeof ctx);
ctx.waitUntil(processBatchEnrichment(...));
```

**Fix:** Use `c.executionCtx` from Hono context (see "Critical Fix" section above)

---

## Performance Characteristics

- **Concurrency:** 10 parallel enrichment calls
- **Provider Timeout:** 5 seconds per book
- **Batch Size Limit:** 100 books max
- **Average Time:** ~500ms per book (cached), ~2s per book (uncached)
- **KV Storage TTL:** 1 hour (3600 seconds)
- **WebSocket Idle Timeout:** 15 minutes (Cloudflare default)

---

## Related Documentation

- **API Contract:** `docs/API_CONTRACT.md:939-1006` (ResponseEnvelope format)
- **WebSocket Protocol:** `docs/API_CONTRACT.md:1162-1303` (Message types)
- **OpenAPI Spec:** `docs/openapi.yaml:493-587` (Unified results endpoint)
- **ExecutionContext Fix:** `src/router.ts:32-37` (Hono native support)
- **Background Processing:** `src/handlers/batch-enrichment.ts:186-275`

---

**Version:** 2.1.0
**Last Updated:** November 22, 2025
**Maintained by:** AI Team (Claude Code, cf-ops-monitor)
**Deployment:** `aaeeb8bb-d9b4-402c-a2de-9ac5e97da267`
