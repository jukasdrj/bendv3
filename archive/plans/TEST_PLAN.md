# BooksTrack Backend - Comprehensive Test Plan

**Generated:** November 13, 2025
**Status:** Implementation Ready
**Total Test Cases:** 240+
**Estimated Coverage:** 75%+ for critical paths

---

## Executive Summary

This document outlines a comprehensive test suite for the BooksTrack Cloudflare Workers backend. The system is a sophisticated monolith with:
- **40+ production files** and **50+ API endpoints**
- **Multi-tier caching** (Edge → KV → External APIs)
- **Real-time WebSocket** via Durable Objects
- **AI integration** with Gemini 2.0 Flash
- **Existing test infrastructure:** 29 test files with 4,199 lines

### Current State
- ✅ Good test culture and infrastructure
- ❌ **Critical gaps:** Router coverage, WebSocket state management, error scenarios
- ❌ External API chains not thoroughly tested
- ❌ Concurrency/race condition testing missing

---

## Priority 1: Critical Foundation Components

### 1. Main Router (`src/index.js` - 1,146 lines)

**Scope:** 50+ API routes, request routing, middleware integration

**Functionality to Test:**
- Route dispatch to all 50+ handlers
- WebSocket upgrade handling with jobId validation
- Token refresh endpoint (POST /api/token/refresh)
- OPTIONS preflight CORS handling
- Rate limiting middleware integration
- Request size validation
- Unified envelope feature flag

**Test Count:** 55+ tests

**Key Test Cases:**
```
✓ WebSocket upgrade with missing jobId → 400 response
✓ WebSocket upgrade with invalid token → 401 response
✓ Token expired verification → 401 response
✓ CORS OPTIONS preflight handling
✓ Rate limit integration (1000/hour global)
✓ Router dispatch to all 50+ handlers
✓ Request size validation (POST /api/token/refresh)
✓ Malformed JSON in token refresh → 400
✓ Custom domain routing (harvest.oooefam.net)
✓ Unified envelope feature flag (ENABLE_UNIFIED_ENVELOPE)
```

**Edge Cases:**
- Concurrent WebSocket connections to same jobId
- Token refresh race conditions
- Very large request bodies (>100KB)
- Requests from blocked origins
- Missing Content-Type header

---

### 2. External APIs Service (`src/services/external-apis.js` - 1,820 lines)

**Scope:** Google Books, OpenLibrary, ISBNdb integrations with fallback chains

**Functionality to Test:**
- Google Books search by title/ISBN/volume ID
- OpenLibrary search as primary fallback
- ISBNdb cover image harvesting
- Canonical response normalization (to WorkDTO, EditionDTO, AuthorDTO)
- API key handling (both secrets store and direct env vars)
- Error recovery and logging

**Test Count:** 40 tests

**Provider-Specific Tests:**
```
Google Books:
✓ Title search with results
✓ ISBN search with results
✓ Volume ID search
✓ Search with no results
✓ API rate limit (429) response
✓ Missing API key handling
✓ Malformed JSON response
✓ Timeout (>5000ms)

OpenLibrary:
✓ Title search with results
✓ ISBN search with results
✓ Author search with results
✓ No results handling
✓ Incomplete author data handling
✓ Missing edition fields

ISBNdb:
✓ Cover image search
✓ Rate limit handling
✓ ISBN format validation

Fallback Chains:
✓ Google Books success → no fallback
✓ Google Books fail → OpenLibrary fallback
✓ All providers fail → error response
✓ Partial results from secondary provider
✓ Concurrent requests to multiple providers
✓ Provider response normalization to canonical format
```

**Edge Cases:**
- Empty search results from all providers
- Missing required fields (title, author, isbn)
- Malformed JSON in provider response
- API keys with special characters
- Network timeout during provider call
- Partial/truncated responses

---

### 3. Enrichment Pipeline (`src/services/enrichment.ts` - 14,232 bytes)

**Scope:** Multi-provider book enrichment with quality-based selection

**Functionality to Test:**
- Single book enrichment (Google → OpenLibrary fallback)
- Multiple book batch enrichment
- Quality-based provider selection
- Author data merging and deduplication
- Cache metadata generation
- Error recovery

**Test Count:** 39 tests

**Key Test Cases:**
```
Single Book Enrichment:
✓ Enrichment with all providers successful
✓ Google Books success, OpenLibrary unused
✓ Google Books fail → OpenLibrary fallback
✓ All providers fail → error response
✓ Partial data from primary provider, complete from secondary
✓ Author data resolution and merging
✓ ISBN format variations (10 vs 13 digit)

Multiple Book Batch:
✓ Batch enrichment in parallel (5 books)
✓ Mixed success/failure in batch
✓ Author deduplication across batch
✓ Concurrent enrichment requests
✓ Batch cancellation handling
✓ Batch progress tracking via WebSocket DO

Cache Operations:
✓ Cache metadata generation
✓ Cache TTL assignment (7 days for search, 365 for ISBN)
✓ Cache invalidation on enrichment
✓ Cache miss recovery
```

**Edge Cases:**
- All providers fail for single book
- Books with no authors
- Books with 10+ authors (performance)
- Very long titles (>500 chars)
- Special characters in author names (é, ñ, etc.)
- Concurrent enrichment of same ISBN

---

### 4. WebSocket Durable Object (`src/durable-objects/progress-socket.js` - 1,223 lines)

**Scope:** WebSocket lifecycle, auth, state persistence, batch tracking

**Functionality to Test:**
- WebSocket upgrade with auth token validation (lines 41-206)
- Auth token validation and expiration (lines 84-104)
- Token refresh with 30-minute window enforcement (lines 257-268)
- Job state persistence with throttling (lines 331-387)
- Ready signal handling (lines 157-166)
- Batch state initialization (lines 1012-1055)
- Photo status updates (lines 1061-1116)
- Job cancellation (lines 583-594, 1175-1195)
- Storage cleanup alarm (lines 945-960)
- Message serialization and delivery

**Test Count:** 53 tests (MOST COMPLEX)

**Auth & Token Tests:**
```
✓ WebSocket upgrade with valid token
✓ WebSocket upgrade with invalid token → 401
✓ WebSocket upgrade with expired token → 401
✓ Token validation at exact expiration boundary
✓ setAuthToken() stores token and expiration (2 hours)
✓ Token refresh before 30-minute window → error
✓ Token refresh within 30-minute window → success
✓ Token refresh generates new UUID
✓ Token refresh extends expiration by 2 hours
✓ Concurrent token refresh attempts (race condition)
✓ Token refresh after expiration → error
```

**Job State Management:**
```
✓ initializeJobState() creates state for pipeline
✓ updateJobState() with throttling (config-based)
✓ updateJobState() batches updates correctly
✓ updateJobState() persists at update count threshold
✓ updateJobState() persists at time threshold (seconds)
✓ getJobState() retrieves stored state
✓ getJobStateAndAuth() returns state + auth
✓ completeJobState() marks job complete and schedules cleanup
✓ failJobState() marks job failed and schedules cleanup
✓ Job state versioning increments correctly
```

**Batch Operations:**
```
✓ initBatch() initializes batch with photo array
✓ initBatch() with invalid totalPhotos → error
✓ updatePhoto() updates single photo status
✓ updatePhoto() with invalid index → error
✓ updatePhoto() recalculates total books found
✓ completeBatch() finalizes batch state
✓ getState() retrieves current batch state
✓ isBatchCanceled() checks cancel status
✓ cancelBatch() sets cancel flag and broadcasts
```

**Message Handling:**
```
✓ Client sends 'ready' message
✓ Server responds with 'ready_ack'
✓ Ready promise resolves on client ready
✓ waitForReady() times out after 5000ms
✓ waitForReady() detects WebSocket disconnect
✓ pushProgress() sends progress to client
✓ pushProgress() throws if WebSocket missing
✓ updateProgress() sends progress with status
✓ complete() sends completion message and closes
✓ fail() sends error message and closes
✓ Message JSON parsing failures handled
```

**Cleanup & Alarms:**
```
✓ Cleanup alarm scheduled 24h after completion
✓ Cleanup alarm scheduled 24h after failure
✓ Alarm cleanup deletes jobState
✓ Alarm cleanup deletes authToken
✓ CSV processing alarm scheduled at 2s
✓ CSV processing alarm triggers processor
✓ CSV processing error handled gracefully
```

**Edge Cases:**
- Token expired at exact millisecond boundary
- Concurrent updateJobState() calls (throttling race)
- WebSocket close during message send
- Batch state with photo index = totalPhotos (boundary)
- Storage get/put failures
- Message queue overflow (many pending messages)
- Client reconnection with old token
- Job state recovery after DO eviction

---

### 5. AI Scanner (`src/services/ai-scanner.js` - 8,928 bytes)

**Scope:** 3-stage bookshelf image processing pipeline

**Functionality to Test:**
- Stage 1: Image quality analysis
- Stage 2: Gemini 2.0 Flash AI processing
- Stage 3: Book enrichment
- Real-time progress updates via WebSocket DO
- Model metadata extraction (defensive programming)
- Error handling at each stage

**Test Count:** 30 tests

**Pipeline Tests:**
```
Stage 1 - Image Quality:
✓ Valid image → progress update to 10%
✓ Image size validation
✓ Unsupported format detection
✓ Corrupted image handling

Stage 2 - Gemini Processing:
✓ Gemini API success → progress 30%
✓ Gemini API timeout handling
✓ Gemini API rate limit (429)
✓ Model metadata extraction
✓ Missing model metadata → fallback to 'unknown'
✓ Partial Gemini response handling

Stage 3 - Enrichment:
✓ Enrichment of scanned books in parallel
✓ Enrichment failure recovery
✓ Progress update to 100% on completion
✓ Results aggregation

End-to-End:
✓ Full pipeline success (image → scan → enrich → complete)
✓ Pipeline with enrichment failure
✓ Pipeline with Gemini timeout
✓ Pipeline cancellation mid-processing
✓ WebSocket progress updates for all stages
✓ Error messages sent via WebSocket
✓ Large image handling (>10MB)
✓ Concurrent scans (different jobIds)
```

**Defensive Programming:**
```
✓ Model metadata missing → 'unknown' fallback
✓ Provider metadata structure change → no crash
✓ Partial response handling
✓ Network interruption recovery
```

---

## Priority 2: High Reliability Components

### 6. Cache Layer (`src/services/cache-unified.js`)

**Test Count:** 14 tests

**Functionality:**
- Multi-tier cache (Edge → KV)
- TTL management (7-365 days)
- Cache invalidation
- Cold start handling
- Cache hit/miss tracking

**Key Tests:**
```
✓ Cache hit (Edge) → return immediately
✓ Cache hit (KV) → return after 30-50ms
✓ Cache miss → fetch from provider
✓ TTL expiration (7 days for search)
✓ TTL expiration (365 days for ISBN)
✓ Cache invalidation on new data
✓ Concurrent cache reads (same key)
✓ Cache cleanup on eviction
```

---

### 7. Rate Limiter (`src/middleware/rate-limiter.js`)

**Test Count:** 9 tests

**Functionality:**
- Per-IP tracking via KV
- Global rate limit (1000/hour)
- Endpoint-specific limits (100/min search, 10/min batch, 5/min AI)
- Rate limit headers

**Key Tests:**
```
✓ Request within limit → allow
✓ Request exceeds limit → 429 response
✓ Rate limit headers present
✓ Per-IP isolation
✓ Concurrent requests at limit boundary
✓ IP cleanup after expiration
✓ Rate limit reset on hour boundary
```

---

## Priority 3: Integration & E2E Tests

### 8. Search Handlers (`src/handlers/v1/search-*.js`)

**Test Count:** 40 tests

**Endpoints:**
- `GET /v1/search/title?q={query}` (7-day cache)
- `GET /v1/search/isbn?isbn={isbn}` (365-day cache)
- `GET /v1/search/advanced?title={title}&author={author}` (7-day cache)

**Key Tests:**
```
✓ Title search with results
✓ ISBN search with results
✓ Advanced search with multiple filters
✓ Missing query parameter → 400
✓ Rate limit exceeded → 429
✓ Unified envelope response format
✓ Legacy envelope response format (feature flag)
✓ Cache headers (7 or 365 days)
✓ Concurrent searches (same ISBN)
✓ Search timeout (>5000ms)
```

---

### 9. Batch Processing Handlers

**Test Count:** 30 tests

**Endpoints:**
- `POST /api/enrichment/batch` - Batch book enrichment
- `POST /api/scan-bookshelf?jobId={uuid}` - Bookshelf scan
- `POST /api/import/csv-gemini` - CSV import

**Key Tests:**
```
✓ Batch upload with 5 books
✓ Batch progress WebSocket
✓ Batch completion
✓ Batch cancellation mid-processing
✓ Batch error recovery
✓ CSV parsing and enrichment
✓ CSV with invalid rows
✓ Bookshelf scan with photo upload
✓ Photo processing in parallel
✓ Scan cancellation
```

---

### 10. End-to-End Workflows

**Test Count:** 26 tests

**Workflow 1: Bookshelf Scan**
```
1. Client sends photo → receives jobId
2. Client opens WebSocket with jobId + token
3. Server sends 'ready' signal
4. Processing: Image quality → Gemini AI → Enrichment
5. Real-time progress updates via WebSocket
6. Completion message with results
7. WebSocket closes
```

**Workflow 2: Batch Enrichment**
```
1. Client uploads 5 books → receives jobId
2. Opens WebSocket (jobId + token)
3. Server initializes batch state (5 photos)
4. Enriches each book with parallel providers
5. Progress updates: batch + photo level
6. Completion with enrichment results
7. WebSocket closes
```

**Workflow 3: CSV Import**
```
1. Client uploads CSV → receives jobId
2. Opens WebSocket (jobId + token)
3. Server schedules CSV processing alarm (2s)
4. Alarm triggers: parse CSV → enrich books
5. Real-time progress for each row
6. Completion with parsed/enriched books
```

---

## Priority 4: Error Scenarios & Resilience

### 11. Network Failures (12 tests)

```
✓ Google Books API timeout (>5000ms)
✓ OpenLibrary connection refused
✓ ISBNdb rate limit exceeded (429)
✓ Partial response (truncated JSON)
✓ Connection reset mid-response
✓ DNS resolution failure
✓ SSL certificate error
✓ Provider response with wrong content-type
✓ Rate limit retry-after header
✓ Exponential backoff strategy
✓ Fallback provider on timeout
✓ Circuit breaker pattern
```

---

### 12. State Machine Violations (15 tests)

```
✓ Token refresh before token set → error
✓ Job update before initialization → error
✓ Batch operation on non-batch job → error
✓ Update on completed job → error
✓ Cancel already canceled job → idempotent
✓ Multiple concurrent cancellations
✓ State transitions logged correctly
✓ Invalid state recovery
✓ Storage corruption handling
✓ DO eviction during processing
✓ DO restart (state recovery)
✓ Multiple DO instances (same jobId) → isolation
```

---

### 13. Concurrency & Race Conditions (20 tests)

```
✓ Concurrent token refreshes (race condition)
✓ Concurrent job state updates (throttling collision)
✓ Multiple WebSocket connections (same jobId)
✓ Concurrent photo updates (same index)
✓ Batch + job operations (same DO)
✓ Reader-writer conflicts in KV cache
✓ Concurrent enrichment (same ISBN)
✓ Rate limiter concurrent check-increment
✓ Storage put-get race
✓ Alarm + active DO (cleanup race)
✓ WebSocket message ordering
✓ Progress update ordering
✓ Batch state consistency under concurrency
✓ Photo index collision handling
```

---

## Test File Organization

```
tests/
├── unit/
│   ├── validators.test.js (5 tests)
│   │   └── ISBN validation, query sanitization, jobId format
│   ├── normalizers.test.js (8 tests)
│   │   └── Google/OpenLibrary/ISBNdb → canonical DTOs
│   ├── auth.test.js (10 tests)
│   │   └── Token generation, expiration, refresh window
│   └── cache.test.js (4 tests)
│       └── TTL assignment, cache miss recovery
│
├── integration/
│   ├── external-apis.test.js (15 tests)
│   │   └── Provider chains, fallback logic
│   ├── enrichment.test.js (12 tests)
│   │   └── Single/batch enrichment, quality selection
│   ├── websocket-do.test.js (15 tests)
│   │   └── Auth, state management, batch operations
│   └── batch-processing.test.js (8 tests)
│       └── Concurrent operations, cancellation
│
├── handlers/
│   ├── search-handlers.test.js (40 tests)
│   │   └── /v1/search/title, /v1/search/isbn, /v1/search/advanced
│   ├── websocket-handlers.test.js (5 tests)
│   │   └── /ws/progress WebSocket upgrade validation
│   ├── token-refresh.test.js (5 tests)
│   │   └── /api/token/refresh endpoint
│   └── batch-scan.test.js (5 tests)
│       └── /api/scan-bookshelf, /api/enrichment/batch
│
├── e2e/
│   ├── bookshelf-scan.test.js (8 tests)
│   │   └── Photo upload → WebSocket → AI processing → enrichment → completion
│   ├── batch-enrichment.test.js (8 tests)
│   │   └── Book batch → initialization → enrichment → progress → completion
│   └── csv-import.test.js (10 tests)
│       └── CSV upload → parsing → enrichment → completion
│
└── error-scenarios/
    ├── network-failures.test.js (12 tests)
    │   └── Timeouts, connection errors, rate limits
    ├── state-violations.test.js (15 tests)
    │   └── Invalid state transitions, recovery
    └── concurrency.test.js (20 tests)
        └── Race conditions, concurrent operations
```

---

## Test Execution Strategy

### Phase 1: Foundation (Week 1)
- Run unit tests: `npm test unit/`
- Setup mocking for external APIs
- Establish baseline coverage

### Phase 2: Integration (Week 2)
- Run integration tests: `npm test integration/`
- Test provider chains and fallbacks
- Test state management patterns

### Phase 3: Handler Tests (Week 2-3)
- Run handler tests: `npm test handlers/`
- Test all 50+ routes
- Validate response formats

### Phase 4: E2E & Error (Week 3-4)
- Run E2E tests: `npm test e2e/`
- Run error scenario tests: `npm test error-scenarios/`
- Verify resilience patterns

### Running All Tests
```bash
npm test                    # Run all tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Coverage report
npm run test:ci           # CI/CD mode (strict)
```

---

## Mocking Strategy

### External APIs
```javascript
// Mock Google Books
vi.mock('../providers/google-books', () => ({
  searchGoogleBooks: vi.fn()
}))

// Mock Gemini
vi.mock('../providers/gemini-provider', () => ({
  scanImageWithGemini: vi.fn()
}))

// Mock KV Cache
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}
```

### Durable Objects
```javascript
// Mock DO storage
const mockStorage = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  setAlarm: vi.fn()
}

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  accept: vi.fn(),
  addEventListener: vi.fn()
}
```

---

## Coverage Targets

| Component | Current | Target | Critical |
|-----------|---------|--------|----------|
| Router | Low | 75% | YES |
| External APIs | Medium | 85% | YES |
| Enrichment | Medium | 80% | YES |
| WebSocket DO | Low | 80% | YES |
| AI Scanner | Low | 75% | YES |
| Cache | High | 85% | NO |
| Rate Limiter | Medium | 75% | NO |

**Critical Path Target:** 75%+ coverage
**Overall Target:** 70%+ coverage

---

## Success Metrics

✅ All 240+ tests passing
✅ Critical path coverage > 75%
✅ Error scenario coverage > 80%
✅ No flaky tests (all deterministic)
✅ Test execution < 5 minutes
✅ Clear test names and documentation
✅ Mock/stub patterns consistent

---

## Next Steps

1. **Create test scaffold files** (see separate files)
2. **Setup test infrastructure**
   ```bash
   npm install --save-dev vitest @vitest/ui
   ```
3. **Configure vitest.config.js**
4. **Implement mocks for external APIs**
5. **Phase 1: Unit tests** (Week 1)
6. **Phase 2-4:** Integration → Handlers → E2E

---

**Test Plan Prepared:** November 13, 2025
**Maintainer:** Claude Code
**Next Review:** After Phase 1 completion
