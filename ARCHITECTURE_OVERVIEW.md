# BooksTrack Backend - Codebase Architecture Overview

**Project:** BooksTrack Cloudflare Workers API
**Stack:** Node.js, Cloudflare Workers, Durable Objects, KV Cache, R2 Storage
**Production URL:** https://api.oooefam.net
**Last Updated:** November 13, 2025

---

## 1. Project Structure

```
bookstrack-backend/
├── src/                          # Production code
│   ├── index.js                  # Main router & entry point
│   ├── handlers/                 # Request handlers (v1 & legacy)
│   ├── services/                 # Business logic & data processing
│   ├── providers/                # AI integrations (Gemini)
│   ├── durable-objects/          # WebSocket state management
│   ├── middleware/               # CORS, rate limiting, validation
│   ├── consumers/                # Queue message consumers
│   ├── tasks/                    # Scheduled tasks
│   ├── prompts/                  # AI prompt templates
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Shared utilities & helpers
├── tests/                        # Comprehensive test suite (29 test files)
├── docs/                         # Documentation
├── scripts/                      # Utility & development scripts
├── wrangler.toml                 # Cloudflare Workers configuration
└── package.json                  # Dependencies & scripts
```

---

## 2. Main Entry Point & Routing Logic

**File:** `/src/index.js` (1146 lines)

### Architecture
- **Single Monolith Worker**: Direct function calls (no RPC service bindings)
- **Three Runtime Handlers**: `fetch()`, `queue()`, `scheduled()`
- **No API gateway**: All routing logic embedded in the worker

### Key Routes

#### WebSocket & Real-Time
- `GET /ws/progress?jobId={id}` → ProgressWebSocketDO (Durable Object)
- `POST /api/token/refresh` → Token refresh for long-running jobs
- `GET /api/job-state/{jobId}` → Fetch current job state & sync reconnections

#### Book Search (V1 - Canonical Contracts)
- `GET /v1/search/title?q={query}` → Title search
- `GET /v1/search/isbn?isbn={isbn}` → ISBN lookup
- `GET /v1/search/advanced?title={title}&author={author}` → Advanced search

#### AI & Batch Operations
- `POST /api/scan-bookshelf?jobId={uuid}` → Single image bookshelf scan
- `POST /api/scan-bookshelf/batch` → Batch multi-image scans
- `POST /api/import/csv-gemini` → Gemini-powered CSV parsing
- `POST /api/enrichment/batch` → Book metadata enrichment
- `POST /api/enrichment/start` → Legacy enrichment endpoint (deprecated)

#### Cache & Metrics
- `GET /api/cache/metrics` → Cache performance metrics
- `GET /metrics` → Aggregated metrics with Analytics Engine
- `GET /images/proxy` → Image proxy & caching via R2

#### Background Jobs
- `POST /api/warming/upload` → Cache warming via CSV
- `GET /api/warming/dlq` → Monitor dead-letter queue
- `POST /api/harvest-covers` → Manual ISBNdb harvest trigger

#### Legacy Routes (backward compatibility)
- `GET /search/title`, `/search/isbn`, `/search/author`, `/search/advanced`
- `GET /external/google-books`, `/external/openlibrary`, `/external/isbndb*`

#### Health & Admin
- `GET /health` → Health check & endpoint listing
- `GET /admin/harvest-dashboard` → ISBNdb harvest status

---

## 3. Key Services & Business Logic

### Core Services Architecture

```
Services (src/services/)
├── external-apis.js              # Google Books, OpenLibrary, ISBNdb integrations
├── enrichment.ts                 # Book metadata enrichment (multi-provider fallback)
├── ai-scanner.js                 # Gemini 2.0 Flash bookshelf scanning
├── parallel-enrichment.js         # Concurrent enrichment with Promise.all()
├── unified-cache.js              # Multi-tier cache (Edge → KV)
├── kv-cache.js                   # KV namespace caching with smart TTL
├── edge-cache.js                 # In-memory edge caching
├── alert-monitor.js              # Error tracking & alerting
├── metrics-aggregator.js          # Analytics data aggregation
├── edition-discovery.js           # Multi-edition book discovery
├── isbndb-api.js                 # ISBNdb API wrapper
└── normalizers/                  # Data normalization (TS files)
    ├── google-books.ts           # Google Books → canonical DTOs
    ├── openlibrary.ts            # OpenLibrary → canonical DTOs
    └── isbndb.ts                 # ISBNdb → canonical DTOs
```

### Service Coverage

1. **external-apis.js** (19,999 bytes)
   - `searchGoogleBooks()` - Title/keyword search
   - `searchGoogleBooksById()` - Volume ID lookup
   - `searchGoogleBooksByISBN()` - ISBN search
   - `searchOpenLibrary()` - OpenLibrary title search
   - `getOpenLibraryAuthorWorks()` - Author bibliography
   - `searchISBNdb()` - ISBNdb title search
   - `getISBNdbEditionsForWork()` - Multi-edition discovery
   - `getISBNdbBookByISBN()` - ISBNdb ISBN lookup
   - All functions include normalizers that convert to canonical DTOs

2. **enrichment.ts** (14,232 bytes)
   - `enrichSingleBook()` - Individual book enrichment with provider fallback
   - `enrichMultipleBooks()` - Batch enrichment for search results
   - Multi-provider orchestration (Google Books → OpenLibrary)
   - Used by `/api/enrichment/batch` and `/v1/search/*` endpoints

3. **ai-scanner.js** (8,928 bytes)
   - `processBookshelfScan()` - Main bookshelf scanning pipeline
   - 3-stage AI processing: image quality → AI vision → metadata enrichment
   - Integrates with ProgressWebSocketDO for real-time updates
   - Fallback: Gemini 2.0 Flash (2M token context window)

4. **kv-cache.js** (3,813 bytes)
   - Extended TTLs for Paid Plan KV:
     - Title: 7 days (was 24h)
     - ISBN: 365 days (was 30d)
     - Author: 7 days
     - Enrichment: 180 days
   - Smart TTL adjustment based on data quality metrics
   - `assessDataQuality()` - ISBN, cover, description completeness

5. **unified-cache.js** (6,557 bytes)
   - Multi-tier caching: Edge → KV → External APIs
   - Transparent cache management with source tracking
   - Metadata tracking (age, TTL, source)

---

## 4. External API Integrations

### Google Books API
- **Base URL:** `https://www.googleapis.com/books/v1/volumes`
- **Rate Limit:** 1000 requests/day per API key
- **Cache TTL:** 24h (customizable)
- **Use Cases:** Title search, ISBN lookup, volume ID lookup
- **Fallback:** OpenLibrary if Google Books fails

### OpenLibrary API
- **Base URL:** `https://openlibrary.org/api`
- **Rate Limit:** Unlimited (community service)
- **Cache TTL:** 24h
- **Use Cases:** Title search, author works, fallback provider
- **Cost:** Free (no quota limits)

### ISBNdb API
- **Base URL:** `https://api2.isbndb.com`
- **Rate Limit:** 5000 requests/day (Premium plan)
- **Cache TTL:** 7 days (covers don't change often)
- **Use Cases:** Cover image harvesting, ISBN validation, multi-edition discovery
- **Scheduled Harvest:** Daily at 3:00 AM UTC (cron: `0 3 * * *`)

### Gemini 2.0 Flash AI
- **Model:** `gemini-2.0-flash-exp`
- **Context Window:** 2M tokens (highest available)
- **Rate Limit:** 1000 RPM, 4M TPM
- **Use Cases:**
  - Bookshelf scanning (vision + analysis)
  - CSV import parsing
  - Data extraction & validation
- **Cost Optimization:** Built-in caching for repeated prompts (50% cost reduction)

---

## 5. Database & Storage Patterns

### Durable Objects (Stateful)

#### Legacy Architecture (ProgressWebSocketDO)

**⚠️ DEPRECATED - Being replaced by refactored architecture**

**File:** `/src/durable-objects/progress-socket.js` (1,222 lines - monolithic)

```typescript
class ProgressWebSocketDO {
  // One instance per jobId
  // Persistent storage for:
  // - WebSocket connection state
  // - Job status & progress
  // - Authentication tokens
  // - Batch processing state
  // - Business logic (CSV processing via alarm)
}
```

**Issues:**
- Violates Single Responsibility Principle
- Mixes connection management, state persistence, and business logic
- Hard to test and maintain
- Business logic in Durable Object alarms

---

#### Refactored Architecture (New - Feature Flag: `ENABLE_REFACTORED_DOS`)

**Separation of Concerns - Three focused components:**

##### 1. WebSocketConnectionDO
**File:** `/src/durable-objects/websocket-connection.js` (~300 lines)

**Responsibility:** WebSocket connection management ONLY

```typescript
class WebSocketConnectionDO {
  // WebSocket lifecycle
  async fetch(request)           // Upgrade & authenticate
  async setAuthToken(token)      // Set auth token
  async waitForReady(timeout)    // Wait for client ready signal
  async send(message)            // Send message to client
  async closeConnection(reason)  // Close connection
}
```

**Features:**
- Token-based authentication (2-hour expiration)
- Client ready signal coordination
- Message broadcasting to connected clients
- Clean lifecycle management

**Tests:** 20 unit tests covering authentication, lifecycle, RPC methods

---

##### 2. JobStateManagerDO
**File:** `/src/durable-objects/job-state-manager.js` (~260 lines)

**Responsibility:** Job state persistence ONLY

```typescript
class JobStateManagerDO {
  // State management
  async initializeJobState(jobId, pipeline, totalCount)
  async updateProgress(pipeline, payload)
  async complete(pipeline, payload)
  async sendError(pipeline, payload)
  async cancelJob(reason)
  async isCanceled()
  async getJobState()
  async alarm()  // Cleanup after 24 hours
}
```

**Features:**
- Persistent job state storage
- Throttled writes (configurable per pipeline)
  - CSV import: 20 updates or 30 seconds
  - Batch enrichment: 5 updates or 10 seconds
  - AI scan: 1 update or 60 seconds
- Coordinates with WebSocketConnectionDO for broadcasts
- Automatic cleanup after 24 hours

**Tests:** 22 unit tests covering initialization, progress, completion, errors, throttling

---

##### 3. CSV Processor Service
**File:** `/src/services/csv-processor.js`

**Responsibility:** Business logic ONLY (no DO coupling)

```typescript
async function processCSVImport(csvText, progressReporter, env) {
  // Pure business logic
  // Uses progressReporter interface (adapter pattern)
  // No direct DO dependencies
}
```

**Features:**
- Pure business logic extraction
- Progress reporter interface for decoupling
- Easier to test in isolation
- No Durable Object alarm dependency

---

##### 4. Progress Reporter Adapter
**File:** `/src/utils/progress-reporter.js`

**Responsibility:** Unified interface to new DOs

```typescript
class ProgressReporter {
  constructor(jobId, env)
  async setAuthToken(token)
  async initialize(pipeline, totalCount)
  async waitForReady(timeout)
  async updateProgress(pipeline, payload)
  async complete(pipeline, payload)
  async sendError(pipeline, payload)
  // ... coordinates between WebSocketConnectionDO and JobStateManagerDO
}
```

**Migration:**
- Set `ENABLE_REFACTORED_DOS=true` in wrangler.toml
- Handlers automatically switch to new architecture
- Backward compatible during transition

---

**Key Methods (Legacy ProgressWebSocketDO):**
- `fetch(request)` - WebSocket upgrade handler
- `setAuthToken()` - Store auth token for WebSocket
- `waitForReady()` - Wait for client connection signal
- `updateProgressV2()` - Send progress updates to client
- `initBatch()` - Initialize batch job state
- `updatePhoto()` - Update photo processing status
- `completeBatch()` - Finalize batch with results
- `isBatchCanceled()` - Check cancellation state
- `cancelJob()` - Cancel in-flight job
- `getJobStateAndAuth()` - Fetch current state & auth

**Storage Persistence:**
- Batch state stored in Durable Object storage
- TTL: Until job completes or 24 hours
- Supports reconnection recovery for iOS app

### KV Cache (Key-Value Store)

**Bindings:** `CACHE`, `KV_CACHE` (same namespace)

**Key Patterns:**
```
search:title:{lowercase_title}:{maxResults}
search:isbn:{isbn}
search:author:{author}:{limit}:{offset}
book:isbn:{isbn}
enrichment:{isbn}
```

**TTL Strategy:**
- Title searches: 7 days
- ISBN data: 365 days (never changes)
- Author works: 7 days
- Enrichment metadata: 180 days
- Smart adjustments: 2x for high quality, 0.5x for low quality

**Metrics:** Free up to 10M reads/day, optimized writes with TTL

### R2 Buckets (Object Storage)

**Buckets:**
1. `personal-library-data` - Cold cache archival (via API_CACHE_COLD & LIBRARY_DATA)
2. `bookshelf-images` - User uploaded bookshelf photos (BOOKSHELF_IMAGES)
3. `bookstrack-covers` - Harvested book covers (BOOK_COVERS)

**Use Cases:**
- Cover image caching & CDN delivery via image-proxy
- Long-term cold storage for books data
- Photo retention for batch processing

**Lifecycle:**
- Daily archival at 2:00 AM UTC (scheduled task)
- Images expire after 90 days by default (configurable)

### Analytics Engine (Time-Series)

**Datasets:**
- `books_api_performance` - Request latency, cache hits
- `books_api_cache_metrics` - Cache hit rates, TTL effectiveness
- `books_api_provider_performance` - API provider metrics (Google Books, OpenLibrary, ISBNdb)
- `bookshelf_ai_performance` - AI processing metrics (Gemini token usage, latency)

**Query Interface:**
- Real-time dashboards via `/metrics` endpoint
- Historical analysis via SQL queries
- Cost tracking: Google Books API calls, Gemini token usage, ISBNdb quotas

---

## 6. Test Infrastructure

### Test Framework
- **Framework:** Vitest 4.0.8
- **Test Files:** 29 test files, 4199 total lines
- **Coverage Areas:** Services, handlers, utilities, integrations

### Test Files Organized By Type

#### Unit Tests (10 files)
```
tests/
├── kv-cache.test.js                    # KV cache service (100 lines)
├── unified-cache.test.js               # Multi-tier cache (100 lines)
├── cache-keys.test.js                  # Cache key generation
├── csv-validator.test.js               # CSV validation rules
├── r2-paths.test.js                    # R2 bucket path generation
├── analytics-queries.test.js           # Analytics data queries
├── prompts.test.js                     # AI prompt templates
├── gemini-token-usage.test.js          # Token counting (304 lines)
├── edge-cache.test.js                  # Edge caching logic
└── rate-limiter.test.js                # Rate limiting middleware
```

#### Integration Tests (5 files)
```
├── integration.test.js                 # End-to-end workflows (660 lines)
├── book-search-integration.test.js     # Search provider orchestration
├── cache-warming-integration.test.js   # Cache warming pipeline (310 lines)
├── csv-import-e2e.test.js              # CSV import workflow
└── canonical-enrichment.test.js        # Enrichment contracts
```

#### Handler Tests (7 files)
```
├── batch-enrichment.test.js            # Batch enrichment handler
├── batch-scan.test.js                  # Batch scan handler (464 lines)
├── csv-import.test.js                  # CSV import handler
├── warming-upload.test.js              # Cache warming upload (120 lines)
├── author-search.test.js               # Author search (124 lines)
├── author-search-performance.test.js   # Author search perf (135 lines)
└── ai-scanner-metadata.test.js         # AI scanner metadata (146 lines)
```

#### Service Tests (6 files)
```
├── enrichment.test.js                  # Enrichment service (558 lines)
├── author-warming-consumer.test.js     # Queue consumer (166 lines)
├── archival-worker.test.js             # R2 archival (117 lines)
├── alert-monitor.test.js               # Alert monitoring
└── metrics-aggregator.test.js          # Metrics aggregation
```

### Test Fixtures & Assets
- `tests/assets/` - Test images (JPEG samples)
- Mock environment objects for Cloudflare bindings
- Vitest `beforeEach()` setup patterns

### Running Tests
```bash
npm test                # Single run
npm run test:watch     # Watch mode
```

---

## 7. Middleware & Cross-Cutting Concerns

### Middleware Components

**Rate Limiting** (`src/middleware/rate-limiter.js` + `src/durable-objects/rate-limiter.js`)
- **Architecture:** Durable Object-based with atomic operations (fixes TOCTOU race condition - Issue #41)
- **Per-IP Tracking:** One Durable Object instance per client IP ensures serialization
- **Algorithm:** Fixed window token bucket (10 requests per 60-second window)
- **Atomicity Guarantee:** Single-threaded DO execution prevents concurrent request races
- **Why Durable Objects over KV:**
  - KV lacked atomic compare-and-swap → vulnerable to Time-of-Check-Time-of-Use (TOCTOU) races
  - Concurrent requests could both read same count, both increment, only one write persisted
  - DO guarantees serialization: all requests from same IP processed sequentially
- **Performance:** ~5-10ms per check (acceptable overhead for security)
- **Cost:** ~$0 (DO requests included in Workers plan, ~100 calls/min peak)
- **Fail-Open Design:** Allows requests if rate limiter unavailable (graceful degradation)
- Returns 429 Too Many Requests with `Retry-After` header on limit exceeded
- **Testing:** Comprehensive unit tests (15) + integration tests (4) validate atomic behavior

**CORS** (`src/middleware/cors.js`)
- Current: `Access-Control-Allow-Origin: *` (permissive)
- Rationale: Native iOS app doesn't send Origin header
- Phase 2: Restrict when web interface is added
- Supported origins: Web domain, iOS app scheme, localhost

**Request Validation** (`src/middleware/size-validator.js`)
- Image uploads: 5MB max (per photo)
- CSV imports: 10MB max
- Returns 413 Payload Too Large on violation

---

## 8. Providers & AI Integration

### Gemini Provider
**File:** `src/providers/gemini-provider.js` (9,245 bytes)

```javascript
scanImageWithGemini(imageData, env) {
  // Vision API integration
  // Analyzes bookshelf photos to extract visible books
  // Returns: { books: [...], confidence: 0.95, ... }
}
```

**Prompt:** 2M token context window for high-quality analysis

### Gemini CSV Provider
**File:** `src/providers/gemini-csv-provider.js` (4,057 bytes)

```javascript
parseCSVWithGemini(csvText, env) {
  // Parses unstructured CSV data
  // Handles missing columns, formatting issues, typos
  // Returns: { books: [{title, author, ...}], ... }
}
```

**CSV Prompt:** `src/prompts/csv-parser-prompt.js`
- Handles 10+ column variations
- Error recovery for malformed data
- Returns structured JSON

---

## 9. Major Modules & Components Requiring Test Coverage

### Critical Path (Highest Priority)

1. **Router/Handler Dispatch** (`src/index.js`)
   - 1146 lines, 50+ route handlers
   - Missing: Comprehensive route coverage, error handling paths
   - Test needs: Route matching, parameter validation, CORS

2. **External API Integration** (`src/services/external-apis.js`)
   - 1820 lines, 8+ API methods
   - Partially tested: Some functions have unit tests
   - Test needs: Provider orchestration, error recovery, fallback logic

3. **Enrichment Pipeline** (`src/services/enrichment.ts`)
   - 14,232 bytes, multi-provider orchestration
   - Partially tested: Some test coverage exists
   - Test needs: Provider fallback chains, error handling, data validation

4. **AI Scanner** (`src/services/ai-scanner.js`)
   - 8,928 bytes, 3-stage processing
   - Partially tested: Metadata extraction tested
   - Test needs: Image processing, batch operations, cancellation

5. **ProgressWebSocketDO** (`src/durable-objects/progress-socket.js`)
   - 400+ lines, critical for all background jobs
   - Partially tested: WebSocket upgrade, token auth
   - Test needs: State management, batch operations, cancellation

### Secondary (Medium Priority)

6. **Cache Layer** (`src/services/{kv,unified,edge}-cache.js`)
   - Unit tested: Excellent coverage
   - Integration tested: Some scenarios covered
   - Test needs: Cache invalidation, TTL edge cases, cold start performance

7. **Rate Limiting** (`src/middleware/rate-limiter.js`)
   - Partially tested
   - Test needs: Concurrent requests, IP tracking, cleanup

8. **Normalizers** (`src/services/normalizers/*.ts`)
   - Unit tested: Basic coverage
   - Test needs: Edge cases, missing fields, malformed responses

### Tertiary (Lower Priority)

9. **Handlers** (`src/handlers/{book-search,author-search,*.ts}`)
   - Most have some test coverage
   - Test needs: Error paths, edge cases

10. **Utilities** (`src/utils/{cache,analytics,*.ts}`)
    - Partially tested
    - Test needs: Edge cases, boundary conditions

11. **Scheduled Tasks** (`src/handlers/{scheduled-*,consumers/*.js}`)
    - Minimal test coverage
    - Test needs: Cron timing, queue processing

---

## 10. Key Architectural Patterns

### Error Handling Pattern
```javascript
try {
  // Fetch from multiple providers
  const [google, openlib] = await Promise.allSettled([...])
  // Merge successful results
  // Fall back to secondary provider
} catch (error) {
  return { success: false, error: error.message }
}
```

### Caching Strategy
```javascript
1. Check unified cache (Edge → KV)
2. If miss, fetch from all providers in parallel
3. Merge results, prefer highest quality
4. Store in KV with smart TTL
5. Return with cache metadata
```

### Async Pipeline Pattern
```javascript
// Durable Object waits for WebSocket ready
await doStub.waitForReady(5000)

// Then starts background processing
ctx.waitUntil(aiScanner.processBookshelfScan(...))

// Return 202 Accepted immediately with job ID
return new Response(JSON.stringify({ jobId, ... }), { status: 202 })
```

### Normalizer Pattern
```javascript
// Provider response → canonical DTO
{
  success: true,
  data: { /* canonical WorkDTO */ },
  metadata: {
    source: 'google_books',
    cached: true,
    timestamp: '2025-01-10T12:00:00Z'
  }
}
```

---

## 11. Data Contracts (TypeScript Canonical Types)

**File:** `src/types/canonical.ts`

```typescript
// Core entities
interface WorkDTO {
  id: string
  title: string
  authors: AuthorDTO[]
  description: string
  genres: string[]
  publicationDate: string
  isbn: string[]
  pageCount: number
  cover: string | null
}

interface EditionDTO {
  isbn: string
  publisher: string
  publicationYear: number
  format: 'hardcover' | 'paperback' | 'ebook'
}

interface AuthorDTO {
  id: string
  name: string
  birthDate?: string
  biography?: string
}
```

---

## Summary: Test Coverage Recommendations

### Phase 1: Critical Paths (Immediate)
- [ ] Index router: All 50+ routes with error cases
- [ ] External APIs: All provider methods with network errors
- [ ] Enrichment: Provider fallback chains, data merging
- [ ] ProgressWebSocketDO: WebSocket lifecycle, state management
- [ ] AI Scanner: 3-stage pipeline with error recovery

### Phase 2: Integration (Week 2)
- [ ] End-to-end flows: Search → Enrichment → Client
- [ ] Cache layer: Multi-tier caching scenarios
- [ ] Background jobs: Queue processing, scheduled tasks
- [ ] Normalizers: All provider response formats

### Phase 3: Edge Cases (Week 3)
- [ ] Error recovery: Network timeouts, API rate limits
- [ ] Data validation: Malformed responses, missing fields
- [ ] Performance: Batch operations, concurrent requests
- [ ] Security: Rate limiting, token validation, CORS

---

**Generated:** November 13, 2025
**Repository:** BooksTrack Backend (Cloudflare Workers)
**Production:** https://api.oooefam.net
