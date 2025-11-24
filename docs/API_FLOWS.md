# API Endpoint Flows

This document visualizes the control flow for all API endpoints in the BooksTrack system. It is generated based on the codebase as of November 2025.

**Legend:**
- **Router:** Hono Router (`src/router.ts`)
- **Handler:** Logic in `src/handlers/`
- **Service:** Business logic in `src/services/`
- **KV:** Cloudflare KV Storage
- **DO:** Durable Object
- **External API:** Google Books, OpenLibrary, ISBNdb, Gemini

## Table of Contents

1. [Search Endpoints (V1)](#search-endpoints-v1)
2. [Batch Operations](#batch-operations)
3. [WebSocket & Job Management](#websocket--job-management)
4. [Results Retrieval](#results-retrieval)
5. [Metrics & Admin](#metrics--admin)
6. [Critical Issues & Findings](#critical-issues--findings)

---

## Search Endpoints (V1)

### GET /v1/search/isbn

Canonical ISBN search with multi-provider fallback and enrichment.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleSearchISBN
    participant Service as findBookByISBN
    participant Repo as BookRepository
    participant ISBNdb as ISBNdbAPI
    participant Enrichement as ResponseTransformer
    participant Analytics

    Client->>Router: GET /v1/search/isbn?isbn=...
    Router->>Handler: Validate & Normalize ISBN
    Handler->>Service: findBookByISBN(isbn)
    Service->>Repo: Check KV/D1 Cache
    alt Cache Hit
        Repo-->>Service: Return cached work
    else Cache Miss
        Service-->>Repo: Return null
    end

    Service-->>Handler: Result (or null)

    alt No Result from Primary Sources
        Handler->>ISBNdb: fetchBook(isbn)
        alt ISBNdb Found
            ISBNdb-->>Handler: Return structured book data
        else ISBNdb Failed/Not Found
            Handler-->>Handler: Result remains empty
        end
    end

    alt Book Found
        Handler->>Enrichement: extractUniqueAuthors()
        Handler->>Enrichement: enrichAuthorsWithCulturalData(Wikidata)
        Handler->>Enrichement: removeAuthorsFromWorks()
        Handler->>Analytics: writeCacheMetrics()
        Handler-->>Router: Return SuccessResponse (Works, Editions, Authors)
    else No Book Found
        Handler->>Analytics: writeCacheMetrics(miss)
        Handler-->>Router: Return Empty SuccessResponse
    end

    Router-->>Client: 200 OK
```

### GET /v1/search/title

Title search optimized for iOS search UI (max 20 results).

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleSearchTitle
    participant Service as findBooksByTitle
    participant External as ExternalAPIs
    participant Enrichement as ResponseTransformer

    Client->>Router: GET /v1/search/title?q=...
    Router->>Handler: Validate Query
    Handler->>Service: findBooksByTitle(query)
    Service->>External: Search Google/OpenLibrary (Parallel)
    External-->>Service: Raw Results
    Service->>Service: Deduplicate & Normalize
    Service-->>Handler: Normalized Results

    alt Books Found
        Handler->>Enrichement: extractUniqueAuthors()
        Handler->>Enrichement: enrichAuthorsWithCulturalData()
        Handler-->>Router: Return SuccessResponse
    else No Books Found
        Handler-->>Router: Return Empty SuccessResponse
    end

    Router-->>Client: 200 OK
```

### GET /v1/search/advanced

Advanced search by title and/or author with caching.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleSearchAdvanced
    participant Cache as UnifiedCacheService
    participant Service as enrichMultipleBooks
    participant Enrichement as ResponseTransformer

    Client->>Router: GET /v1/search/advanced?title=...&author=...
    Router->>Handler: Validate & Normalize

    Handler->>Cache: get(v1:advanced:...)
    alt Cache Hit
        Cache-->>Handler: Return Cached Result
        Handler-->>Router: Return SuccessResponse
        Router-->>Client: 200 OK
    else Cache Miss
        Handler->>Service: enrichMultipleBooks()
        Service-->>Handler: Normalized Results

        alt Books Found
            Handler->>Enrichement: enrichAuthorsWithCulturalData()
            Handler->>Cache: setCached(7 days)
            Handler-->>Router: Return SuccessResponse
        else No Books Found
            Handler-->>Router: Return Empty SuccessResponse
        end

        Router-->>Client: 200 OK
    end
```

### GET /v1/editions/search

**⚠️ CRITICAL ISSUE:** Argument mismatch in implementation (see Findings).

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleSearchEditions
    participant Cache as UnifiedCacheService
    participant ISBNdb as ExternalAPIs.getISBNdbEditions
    participant Google as ExternalAPIs.searchGoogleBooks

    Client->>Router: GET /v1/editions/search?isbn=...

    Note right of Router: Router passes (isbn, env, req)<br/>Handler expects (title, author, limit...)

    Router->>Handler: CALL WITH WRONG ARGUMENTS
    Handler->>Handler: Normalize 'workTitle' (actually isbn)
    Handler->>Cache: Check Cache

    alt Cache Miss
        Handler->>ISBNdb: getISBNdbEditionsForWork(title, author)
        Note right of Handler: 'author' is actually env object -> CRASH/ERROR
        Handler->>Google: searchGoogleBooks(title, author)
    end

    Handler-->>Router: Return Response (Likely 500/Error)
    Router-->>Client: 500 Internal Error
```

---

## Batch Operations

### POST /v1/enrichment/batch

Asynchronous batch enrichment using Durable Objects for progress tracking.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleBatchEnrichment
    participant DO as ProgressWebSocketDO
    participant Worker as processBatchEnrichment (Async)
    participant KV

    Client->>Router: POST /v1/enrichment/batch { books: [...], jobId }
    Router->>Handler: Validate Batch
    Handler->>DO: getStub(jobId)
    Handler->>DO: setAuthToken()
    Handler->>DO: initializeJobState()

    rect rgb(240, 248, 255)
        Note right of Handler: Background Process
        Handler->>Worker: ctx.waitUntil(processBatchEnrichment)
    end

    Handler-->>Router: Return 202 Accepted { token, ... }
    Router-->>Client: 202 Accepted

    Worker->>Worker: Loop Books (Parallel)
    Worker->>DO: updateProgress()
    Worker->>KV: Store Results (job-results:{jobId})
    Worker->>DO: complete()
```

### POST /api/scan-bookshelf/batch

Batch photo scanning with Gemini AI.

**⚠️ CRITICAL ISSUE:** Broken error handling logic (see Findings).

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleBatchScan
    participant DO as ProgressWebSocketDO
    participant Worker as processBatchPhotos (Async)
    participant R2 as BOOKSHELF_IMAGES
    participant Gemini as scanImageWithGemini
    participant Search as handleSearchAdvanced
    participant KV

    Client->>Router: POST /api/batch-scan (Multipart)
    Router->>Handler: Validate & Parse FormData
    Handler->>DO: getStub(jobId)
    Handler->>DO: setAuthToken()
    Handler->>DO: initializeJobState()

    rect rgb(240, 248, 255)
        Note right of Handler: Background Process
        Handler->>Worker: ctx.waitUntil(processBatchPhotos)
    end

    Handler-->>Router: Return 202 Accepted { token, ... }
    Router-->>Client: 202 Accepted

    Worker->>R2: Upload Images
    Worker->>DO: updateProgress(uploaded)

    loop Each Photo
        Worker->>Gemini: scanImageWithGemini(buffer)
        Gemini-->>Worker: Books List
        Worker->>DO: updateProgress(photo complete)
    end

    Worker->>Worker: Deduplicate Books

    loop Each Book (Enrichment)
        Worker->>Search: handleSearchAdvanced(title, author)
        Search-->>Worker: Promise<Response> Object

        Note right of Worker: CRITICAL BUG: Checks if (response.success)<br/>Response object has no 'success' property.<br/>Always goes to else block.

        Worker->>Worker: Enters Error Block
        Note right of Worker: CRASH: Accessing response.error.message (undefined)
    end

    Worker-->>DO: sendError("E_BATCH_SCAN_FAILED")
```

### POST /api/import/csv-gemini

CSV import using Gemini for parsing.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleCSVImport
    participant DO as ProgressWebSocketDO
    participant Alarm as DO Alarm

    Client->>Router: POST /api/import/csv-gemini (Multipart)
    Router->>Handler: Validate File
    Handler->>DO: getStub(jobId)
    Handler->>DO: setAuthToken()
    Handler->>DO: scheduleCSVProcessing(csvText)
    DO->>DO: Store CSV & Schedule Alarm (2s)

    Handler-->>Router: Return 202 Accepted
    Router-->>Client: 202 Accepted

    Note right of DO: Alarm Triggers
    DO->>Alarm: processCSVImportAlarm()
    Alarm->>Alarm: Process CSV with Gemini
    Alarm->>DO: updateProgress()
    Alarm->>KV: Store Results
    Alarm->>DO: complete()
```

---

## WebSocket & Job Management

### GET /ws/progress

WebSocket upgrade and connection handling.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant DO as ProgressWebSocketDO

    Client->>Router: GET /ws/progress?jobId=...
    Router->>DO: fetch(request)

    DO->>DO: Validate Upgrade Header
    DO->>DO: Extract Token (Header or Query)
    DO->>DO: Validate Token (Storage)

    alt Invalid Token
        DO-->>Router: 401 Unauthorized
        Router-->>Client: 401 Unauthorized
    else Valid Token
        DO-->>Router: 101 Switching Protocols
        Router-->>Client: 101 Switching Protocols (WebSocket Open)

        Client->>DO: "ready"
        DO-->>Client: "ready_ack"
        DO-->>Client: "job_progress" stream...
    end
```

### POST /api/token/refresh

Refresh authentication token for long-running jobs.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler (Router)
    participant DO as ProgressWebSocketDO

    Client->>Router: POST /api/token/refresh { jobId, oldToken }
    Router->>Handler: Rate Limit Check
    Handler->>DO: refreshAuthToken(oldToken)
    DO->>DO: Validate & Extend Expiration
    DO-->>Handler: New Token
    Handler-->>Router: JSON Response
    Router-->>Client: 200 OK { token, expiresIn }
```

### GET /api/job-state/:jobId

Retrieve current job state (for reconnection).

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant DO as ProgressWebSocketDO

    Client->>Router: GET /api/job-state/:jobId
    Router->>Router: Validate Bearer Token
    Router->>DO: getJobStateAndAuth()
    DO-->>Router: State & Auth Info
    Router->>Router: Validate Token Match
    Router-->>Client: 200 OK { jobState }
```

---

## Results Retrieval

### GET /v1/jobs/:jobId/results

Unified results endpoint (fallback for specific result types).

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant KV

    Client->>Router: GET /v1/jobs/:jobId/results
    Router->>KV: Parallel Lookup keys:
    Note right of Router: csv-results:{id}<br/>scan-results:{id}<br/>job-results:{id}

    KV-->>Router: Result Found (or null)

    alt Result Found
        Router-->>Client: 200 OK { data, metadata }
    else Not Found
        Router-->>Client: 404 Not Found
    end
```

---

## Metrics & Admin

### GET /metrics

Prometheus metrics endpoint.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant Handler as handleMetricsRequest
    participant KV

    Client->>Router: GET /metrics
    Router->>Handler: Collect Metrics
    Handler->>KV: Get System Stats
    Handler-->>Router: Plain Text Metrics
    Router-->>Client: 200 OK
```

### GET /api/cache/stats

Real-time cache statistics via RPC.

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant DO as CacheMetricsDO

    Client->>Router: GET /api/cache/stats
    Router->>DO: getStub("singleton")
    Router->>DO: getStats() (RPC Call)
    DO-->>Router: Stats Object
    Router-->>Client: 200 OK { stats }
```

---

## Critical Issues & Findings

During the analysis of the API flows, the following critical issues were identified which require immediate attention.

### 1. `handleSearchEditions` Argument Mismatch
**Severity: ~~Critical~~ RESOLVED - False Positive**
- **Endpoint:** `GET /v1/editions/search`
- **Location:** `src/router.ts` vs `src/handlers/v1/search-editions.ts`
- **Status:** ✅ **VERIFIED CORRECT** (Nov 24, 2025)
- **Resolution:** The router correctly extracts `workTitle`, `author`, and `limit` from query parameters before calling the handler. No mismatch exists.
  ```typescript
  // router.ts:1087-1115
  const workTitle = c.req.query("workTitle") || c.req.query("title") || "";
  const author = c.req.query("author") || "";
  const limit = parseInt(c.req.query("limit") || "20");
  return await handleSearchEditions(workTitle, author, limit, c.env, getCtx(c), c.req.raw);
  ```

### 2. `handleBatchScan` Logic Error
**Severity: ~~Critical~~ RESOLVED**
- **Endpoint:** `POST /api/batch-scan`
- **Location:** `src/handlers/batch-scan-handler.ts:300-307, 486-509`
- **Status:** ✅ **FIXED** (Nov 24, 2025, commit 3b5027c)
- **Original Issue:**
    - The handler called `await handleSearchAdvanced(...)` which returns a `Response` object.
    - The code checked `if (apiResponse.success)` treating it as a parsed JSON object.
    - The `Response` object does not have a `success` property (it has `ok` and `status`).
- **Fix Applied:**
    1. Parse Response before accessing properties: `const apiResponse = await response.json()`
    2. Added missing `ctx` parameter for proper cache operations
    3. Added try-catch error handling around JSON parsing to prevent unhandled crashes
- **Grok-4 Verified:** Fix correctly handles Response → JSON parsing with proper error resilience

### 3. Duplicate ISBN Validation Logic
**Severity: Minor (Code Smell)**
- **Location:** `src/handlers/v1/search-isbn.ts` defines `isValidISBN`, `isValidISBN10Checksum`, etc. locally.
- **Issue:** This logic likely duplicates `src/utils/normalization.js` or other shared validators. It should be centralized.

### 4. Deprecated Endpoints
**Severity: Informational**
- The legacy endpoints (`/search/title`, `/search/isbn`, etc.) are correctly marked with `Deprecation` and `Sunset` headers, pointing to the V1 equivalents.
