# BooksTrack Backend - Claude Code Guidelines

**Project:** BooksTrack Cloudflare Workers API
**Stack:** Node.js, Cloudflare Workers, Durable Objects, KV Cache, D1 Database
**Production:** https://api.oooefam.net
**Updated:** December 25, 2025

---

## Architecture Principles

### 1. Thin Client Design
- BooksTrack is a thin client over Alexandria (49M+ books)
- Alexandria handles heavy lifting: metadata, covers, embeddings
- Local services: caching, rate limiting, job orchestration
- Single worker deployment for simplicity

### 2. API Design Patterns
**Canonical Response Format:**
```javascript
{
  success: true,
  data: { /* canonical book object */ },
  metadata: {
    source: 'alexandria',
    cached: true,
    timestamp: '2025-12-25T12:00:00Z'
  }
}
```

**Error Response Format (RFC 9457 Problem Details):**
```javascript
{
  type: 'https://api.oooefam.net/errors/rate-limit',
  title: 'Rate Limit Exceeded',
  status: 429,
  detail: 'You have exceeded the rate limit of 100 requests per minute',
  instance: '/v3/books/search?q=test'
}
```

### 3. Code Organization
```
src/
├── index.js                  # Main entry point - delegates to Hono router
├── router.ts                 # Hono router - ALL ROUTES HERE
├── api-v3/                   # V3 API (code-first OpenAPI)
│   ├── index.ts              # V3 router + book/search endpoints
│   ├── discovery.ts          # Capabilities + recommendations
│   ├── jobs/                 # Job management routes
│   │   ├── imports.ts        # CSV import jobs
│   │   ├── scans.ts          # Bookshelf scan jobs
│   │   └── enrichment.ts     # Batch enrichment jobs
│   ├── webhooks/             # External callbacks
│   │   └── alexandria.ts     # Alexandria integration
│   └── schemas/              # V3-specific Zod schemas
├── handlers/                 # Request handlers - one per route
├── services/                 # Business logic layer
│   ├── book-service.ts       # High-level book data access
│   ├── enrichment.ts         # Multi-provider enrichment orchestration
│   ├── enrichment-queue.ts   # Async enrichment via Queues
│   ├── circuit-breaker.ts    # Provider circuit protection
│   ├── embedding-service.ts  # Workers AI text embeddings
│   ├── alexandria-client.ts  # Hono RPC client for Alexandria
│   ├── alexandria-api.ts     # Alexandria HTTP adapter
│   ├── alexandria-cover-service.ts  # Cover image processing
│   ├── external-apis.ts      # Multi-provider orchestration
│   └── normalizers/          # Provider data normalization
│       ├── alexandria.ts
│       ├── google-books.ts
│       ├── openlibrary.ts
│       └── isbndb.ts
├── repositories/             # Data access abstraction
│   └── book-repository.ts    # KV + D1 dual-read/write
├── middleware/               # HTTP middleware stack
│   ├── request-context.ts    # X-Request-ID correlation
│   ├── hono-analytics.ts     # Request/response timing
│   ├── rate-limiter.js       # Global rate limiting
│   └── cors.js               # CORS configuration
├── workflows/                # Cloudflare Workflows
│   └── import-book.ts        # Book import state machine
├── durable-objects/          # Stateful Workers
│   ├── job-state-manager.js  # Job lifecycle management
│   ├── websocket-connection.js  # WebSocket hibernation
│   ├── cache-metrics.js      # Cache hit/miss tracking
│   ├── rate-limiter.js       # Per-consumer limiting
│   └── latency-test-do.js    # Performance monitoring
├── consumers/                # Queue consumers
│   └── author-warming-consumer.js
├── cron/                     # Scheduled jobs
│   └── recommendations-cron.ts  # Weekly recommendations
├── types/                    # TypeScript definitions
│   ├── env.ts                # Environment bindings
│   ├── canonical.ts          # Canonical data models
│   ├── circuit-breaker.ts    # Circuit breaker types
│   ├── workflow-events.ts    # Workflow event types
│   └── responses.ts          # Response types
├── schemas/                  # Zod validation schemas
├── utils/                    # Shared utilities (30+ files)
│   ├── response-builder.ts   # Response formatting
│   ├── isbn-validation.ts    # ISBN validation
│   ├── analytics-logger.ts   # Structured logging
│   └── quality-scoring.ts    # Data quality metrics
└── config/                   # Runtime configuration
packages/
├── schemas/                  # @bookstrack/schemas (shared)
│   └── src/
│       ├── book.ts           # Book schemas
│       ├── search.ts         # Search request/response
│       ├── enrich.ts         # Enrichment schemas
│       ├── jobs.ts           # Job schemas
│       ├── response.ts       # Response envelope
│       └── errors.ts         # RFC 9457 errors
└── api-client/               # TypeScript SDK
```

**✅ ROUTING:**
- **Hono router ONLY** (as of Nov 21, 2025)
- **All routes in `src/router.ts`** - Single source of truth for HTTP routing
- **V3 API in `src/api-v3/`** - Code-first OpenAPI with Zod schemas

---

## Data Layer Architecture

### BookRepository (`src/repositories/book-repository.ts`)
Abstraction layer for book data access with dual-storage support:

```typescript
// Single entry point for all book data operations
const repo = new BookRepository(env)

// Read with automatic KV→D1 routing
const book = await repo.getByISBN('9780439708180')

// Write to both KV and D1 (dual-write)
await repo.save(book)
```

**Dual-Read Strategy:**
- `D1_READ_PERCENTAGE` (0-100) controls traffic routing
- 0% = All reads from KV (legacy mode)
- 100% = All reads from D1 (current production)
- Feature flag for gradual migration

**Dual-Write:**
- `ENABLE_D1_WRITES=true` enables writes to both stores
- KV: Fast reads, 2h hot TTL
- D1: Durable storage, SQL queries

### BookService (`src/services/book-service.ts`)
High-level data access integrating repository + enrichment:

```typescript
const bookService = new BookService(env)

// Automatic cache check → enrichment → save
const book = await bookService.getOrEnrich('9780439708180')

// Search with pagination
const results = await bookService.search('Harry Potter', { limit: 20 })
```

---

## Async Job Architecture

### Cloudflare Workflows (`src/workflows/import-book.ts`)
State machines with built-in persistence and retries:

```typescript
export class BookImportWorkflow extends Workflow {
  async run(input: BookImportInput) {
    // Step 1: Parse CSV (automatic checkpoint)
    const books = await this.step('parse-csv', async () => {
      return parseCSV(input.csvContent)
    })

    // Step 2: Enrich each book (retries on failure)
    for (const book of books) {
      await this.step(`enrich-${book.isbn}`, async () => {
        return enrichBook(book.isbn)
      })
    }
  }
}
```

**When to use Workflows:**
- Long-running operations (CSV imports, batch enrichment)
- State that must survive Worker restarts
- Operations needing automatic retries

**Configuration:**
- `WORKFLOW_ROLLOUT_PERCENT: 100` (fully enabled)
- `ENABLE_WORKFLOW_IMPORT: true`
- Binding: `BOOK_IMPORT_WORKFLOW`

### Queues (`src/consumers/`)
Async job processing for background tasks:

**Available Queues:**
- `ENRICHMENT_QUEUE` - Batch book enrichment
- `AUTHOR_WARMING_QUEUE` - Author cache warming
- `ALEXANDRIA_COVER_QUEUE` - Cover image processing

```typescript
// Enqueue enrichment job
await env.ENRICHMENT_QUEUE.send({
  isbn: '9780439708180',
  priority: 'high',
  includeEmbedding: true
})
```

### Durable Objects (Job State)
Real-time state management for interactive jobs:

**JobStateManagerDO:**
- Job lifecycle: initialized → processing → completed/failed/canceled
- Progress tracking (0.0 to 1.0)
- Alarm scheduling for long operations

**WebSocketConnectionDO:**
- Real-time progress broadcasts
- Token-based authentication
- Hibernation API support (memory-efficient)

---

## Testing Architecture (Dual Pool)

### Vitest Dual Pool Configuration

BooksTrack uses two test pools for different scenarios:

**Workers Pool** (`vitest.workers.config.ts`):
- Runs in real Cloudflare Workers runtime (workerd)
- Test files: `tests/smoke/**`, `tests/workers/**`, `tests/normalizers/**`, `tests/utils/**`
- NO `vi.spyOn` support (use factory mocks)
- Best for: Pure functions, normalizers, utilities

```javascript
// ✅ Workers pool - use factory pattern
vi.mock('./external-api.ts', () => ({
  fetchFromAPI: vi.fn().mockResolvedValue({ data: 'mocked' })
}))
```

**Node Pool** (`vitest.node.config.ts`):
- Runs in Node.js with full mocking
- Test files: `tests/unit/**`, `tests/integration/**`, `tests/e2e/**`
- Full `vi.spyOn` support
- Best for: Integration tests, handler tests, service tests

```javascript
// ✅ Node pool - vi.spyOn works
vi.spyOn(circuitBreaker, 'isOpen').mockReturnValue(false)
```

### Testing Commands

```bash
# Resource-Aware (recommended for development)
npm run test:smoke      # ⚡ Workers pool (5s, minimal resources)
npm run test:safe       # 🛡️ Both pools (60s, 512MB limit)
npm run test:unit       # 🎯 Node pool unit tests only
npm run validate        # ✅ Pre-commit (smoke + lint)

# Full Suite (CI/CD or 16GB+ RAM)
npm test                # Both pools, parallel
npm run test:coverage   # Coverage analysis
```

### Test File Organization

```
tests/
├── smoke/              # Workers pool - quick validation
├── workers/            # Workers pool - workerd runtime tests
├── normalizers/        # Workers pool - pure data transforms
├── utils/              # Workers pool - utility functions
├── unit/               # Node pool - unit tests
├── integration/        # Node pool - integration tests
├── e2e/                # Node pool - end-to-end tests
├── handlers/           # Node pool - handler tests
├── services/           # Node pool - service tests
├── repositories/       # Node pool - repository tests
├── setup.js            # Node pool setup
└── setup-workers.js    # Workers pool setup
```

---

## Code Style (Biome)

### Configuration (`biome.json`)
```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "style": {
        "noNonNullAssertion": "off"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  }
}
```

### Commands
```bash
npm run lint          # Check code quality
npm run lint:fix      # Auto-fix issues
npm run format        # Format code
```

### Style Guidelines
- **ES6+ features:** async/await, destructuring, arrow functions
- **No semicolons** unless required (ASI)
- **Single quotes** for strings
- **2-space indentation**
- **100-char line width**

```javascript
// Good
const bookData = await searchService.findByISBN(isbn)
const { title, author } = bookData

// Bad
var bookData = await searchService.findByISBN(isbn);
const title = bookData.title;
const author = bookData.author;
```

---

## Middleware Stack

### Request Context (`src/middleware/request-context.ts`)
Adds correlation tracking to all requests:

```typescript
// Automatically adds:
// - X-Request-ID (correlation ID)
// - X-Response-Time (ms)
// - Rate limit context

app.use(requestContext())
```

### Analytics Middleware (`src/middleware/hono-analytics.ts`)
Logs request/response metrics to Analytics Engine:

```typescript
// Logged to PERFORMANCE_ANALYTICS:
// - Route path
// - Response time
// - Status code
// - Cache hit/miss
```

### Middleware Order
1. `analyticsMiddleware` - Request/response timing
2. `cors()` - Origin validation
3. `requestContext` - X-Request-ID
4. `checkRateLimit` - Global rate limiting
5. Route handlers

---

## External Integrations

### Alexandria RPC (Primary Provider)
- **Integration:** Service Binding (internal) or HTTPS (external)
- **Base URL:** `https://alexandria.ooheynerds.com` (fallback)
- **Dataset:** 49M+ ISBNs with OpenLibrary metadata
- **Cost:** $0 (internal data)
- **Latency:** <100ms (typical), sub-millisecond via Service Binding
- **Client:** `src/services/alexandria-client.ts` (Hono RPC)
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

```typescript
import { alexandriaClient } from './services/alexandria-client'

// Service binding (sub-ms latency)
const book = await alexandriaClient.getBook('9780439708180')

// Automatic fallback to HTTPS if binding unavailable
```

### Google Books API (Fallback)
- **Base URL:** `https://www.googleapis.com/books/v1/volumes`
- **Rate limit:** 1000 requests/day per API key
- **Cache TTL:** 24 hours
- **Fallback:** OpenLibrary if Google Books fails
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

### OpenLibrary API (Fallback)
- **Base URL:** `https://openlibrary.org/api`
- **Rate limit:** No official limit (be respectful)
- **Cache TTL:** 24 hours
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown
- **Note:** Use Alexandria for OpenLibrary data (faster, cached)

### ISBNdb API
- **Base URL:** `https://api2.isbndb.com`
- **Rate limit:** 5000 requests/day (Premium plan)
- **Usage:** Cover image harvest only
- **Cache TTL:** 7 days (covers don't change)
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

### Gemini 2.0 Flash
- **Model:** `gemini-2.0-flash-exp`
- **Context window:** 2M tokens
- **Use case:** Bookshelf scanning, CSV parsing
- **Cost optimization:** Use caching for repeated prompts

### Workers AI (Embeddings)
- **Model:** `@cf/baai/bge-m3` (1024 dimensions)
- **Binding:** `AI`
- **Use case:** Semantic search embeddings
- **Storage:** Vectorize index (`BOOK_VECTORS`)

---

## Circuit Breaker Configuration

All external API providers are protected by per-provider circuit breakers:

```typescript
{
  failureThreshold: 5,      // Open after 5 consecutive failures
  successThreshold: 2,      // Close after 2 successes in HALF_OPEN
  cooldownMs: 60000,        // 60 seconds before attempting recovery
  stateExpirationTtl: 300   // 5 minutes KV cache TTL
}
```

**Circuit States:**
- **CLOSED** (Normal): All requests flow through to provider
- **OPEN** (Failing): Requests fail immediately, skip provider
- **HALF_OPEN** (Testing): Allow limited requests to test recovery

**Protected Providers:**
- `alexandria` - Primary book metadata
- `google-books` - Fallback provider
- `open-library` - Fallback provider
- `isbndb` - Cover images

---

## Cache Architecture (v3.0)

### Alexandria-First Strategy
```
Request → KV Cache (hit?) → Alexandria RPC → Fallback Providers → KV Write
                ↓
         Return cached
```

### KV Cache (`CACHE` namespace)
- **Book metadata:** `book:{isbn}` - 2h hot TTL, 14d expiration
- **Author data:** `author:{id}` - 24h TTL
- **Search results:** `search:{hash}` - 1h TTL

### D1 Database (`DB`)
- **Durable storage** for all enriched books
- **SQL queries** for complex searches
- **Dual-write** with KV for consistency

### Vectorize (`BOOK_VECTORS`)
- **Semantic search** embeddings (1024 dimensions)
- **Model:** `@cf/baai/bge-m3`
- **Index:** `book-embeddings`

### Analytics Engine
- `PERFORMANCE_ANALYTICS` - Request/response metrics
- `CACHE_ANALYTICS` - Cache hit/miss rates
- `PROVIDER_ANALYTICS` - Provider performance
- `AI_ANALYTICS` - AI operation metrics
- `SAMPLING_ANALYTICS` - Sampling rate monitoring

---

## V3 API Endpoints

### Book Operations
- `GET /v3/books/:isbn` - Get book by ISBN
- `GET /v3/books/search` - Search books (text, semantic, similar)
- `POST /v3/books/enrich` - Sync enrichment with optional embedding

### Job Management
- `POST /v3/jobs/imports` - Start CSV import
- `GET /v3/jobs/imports/:jobId` - Import status
- `GET /v3/jobs/imports/:jobId/stream` - SSE progress
- `POST /v3/jobs/scans` - Start bookshelf scan
- `GET /v3/jobs/scans/:jobId` - Scan status
- `GET /v3/jobs/scans/:jobId/stream` - SSE progress
- `POST /v3/jobs/enrichment` - Start batch enrichment
- `GET /v3/jobs/enrichment/:jobId` - Enrichment status
- `GET /v3/jobs/enrichment/:jobId/stream` - SSE progress
- `GET /v3/jobs/enrichment/:jobId/results` - Paginated results
- `DELETE /v3/jobs/enrichment/:jobId` - Cancel job

### Discovery
- `GET /v3/capabilities` - API capabilities
- `GET /v3/recommendations` - Weekly recommendations
- `GET /v3/openapi.json` - OpenAPI spec
- `GET /v3/docs` - Swagger UI

### Webhooks
- `POST /v3/webhooks/alexandria/books/:isbn` - Book processing callback

---

## Configuration (`wrangler.jsonc`)

### Key Bindings
```jsonc
{
  // Service Bindings
  "services": [
    { "binding": "ALEXANDRIA", "service": "alexandria-worker" }
  ],

  // KV Namespaces
  "kv_namespaces": [
    { "binding": "CACHE", "id": "..." },
    { "binding": "RECOMMENDATIONS_CACHE", "id": "..." }
  ],

  // D1 Database
  "d1_databases": [
    { "binding": "DB", "database_id": "..." }
  ],

  // Durable Objects
  "durable_objects": {
    "bindings": [
      { "name": "JOB_STATE_MANAGER_DO", "class_name": "JobStateManagerDO" },
      { "name": "WEBSOCKET_DO", "class_name": "WebSocketConnectionDO" },
      { "name": "CACHE_METRICS_DO", "class_name": "CacheMetricsDO" },
      { "name": "RATE_LIMITER_DO", "class_name": "RateLimiterDO" }
    ]
  },

  // Vectorize
  "vectorize": [
    { "binding": "BOOK_VECTORS", "index_name": "book-embeddings" }
  ],

  // Queues
  "queues": {
    "producers": [
      { "binding": "ENRICHMENT_QUEUE", "queue": "alexandria-enrichment-queue" }
    ]
  },

  // Workflows
  "workflows": [
    { "binding": "BOOK_IMPORT_WORKFLOW", "name": "book-import-workflow" }
  ],

  // Feature Flags
  "vars": {
    "ENABLE_ALEXANDRIA_RPC": true,
    "WORKFLOW_ROLLOUT_PERCENT": 100,
    "D1_READ_PERCENTAGE": 100,
    "ENABLE_D1_WRITES": true
  }
}
```

---

## Security

### Input Validation
```javascript
// Validate all user inputs with Zod
import { isbnSchema } from '@bookstrack/schemas'

function validateISBN(isbn: string) {
  const result = isbnSchema.safeParse(isbn)
  if (!result.success) {
    throw new ValidationError(result.error)
  }
  return result.data
}
```

### CORS Configuration
```javascript
const ALLOWED_ORIGINS = [
  'https://bookstrack.oooefam.net',
  'capacitor://localhost', // iOS app
  'http://localhost:8787' // Local dev
]
```

### Secrets Management
- **Local:** `.env` file (git-ignored)
- **Production:** `wrangler secret put`
- **Rotation:** Quarterly for API keys

---

## Deployment

### Commands
```bash
npm run deploy          # Deploy to production
npx wrangler tail       # Stream logs
npx wrangler rollback   # Rollback to previous
```

### CI/CD Pipeline
1. Push to main → GitHub Actions
2. `npm run validate` → Tests + lint
3. `wrangler deploy` → Production
4. Health check → `/health`
5. Auto-rollback on failure

### Monitoring
- **Cloudflare Analytics:** Request volume, error rate, latency
- **Analytics Engine:** Custom metrics (cache, providers)
- **Wrangler tail:** Real-time logs

---

## AI Collaboration

### Autonomous Agents

**cf-ops-monitor** (Deployment & Observability):
- `/deploy` - Deploy with health checks
- `/logs [filter]` - Stream production logs
- `/rollback` - Rollback deployment
- `/cache-check` - Cache performance metrics
- **Permission:** `ask` (requires approval)

**cf-code-reviewer** (Code Quality):
- `/review` - Review code for Workers patterns
- Auto-triggers on code changes
- **Permission:** `allow` (auto-runs)

### MCP Tools (PAL)
- `mcp__pal__debug` - Deep debugging (Grok-4)
- `mcp__pal__codereview` - Architecture review
- `mcp__pal__secaudit` - Security audit
- `mcp__pal__chat` - Collaborative thinking

### Slash Commands
- `/deploy` - Deploy with monitoring
- `/review` - Code quality review
- `/logs [filter]` - Stream logs
- `/rollback` - Rollback deployment
- `/cache-check` - Cache metrics

---

## Common Mistakes to Avoid

### ✅ Always Use Hono Router
```typescript
// ✅ CORRECT - Add routes to src/router.ts
router.get('/v3/new-endpoint', async (c) => {
  return handleNewFeature(c.req, c.env)
})
```

### ✅ Use BookRepository for Data Access
```typescript
// ✅ CORRECT - Use repository abstraction
const repo = new BookRepository(env)
const book = await repo.getByISBN(isbn)

// ❌ WRONG - Direct KV access
const book = await env.CACHE.get(`book:${isbn}`)
```

### ✅ Use Workflows for Long Operations
```typescript
// ✅ CORRECT - Workflow for batch import
await env.BOOK_IMPORT_WORKFLOW.create({
  id: jobId,
  params: { csvContent, userId }
})

// ❌ WRONG - Long operation in request handler
await processLargeCSV(data)  // May timeout
```

### ❌ Don't Block Event Loop
```javascript
// ❌ Bad - sequential blocking
for (const isbn of isbns) {
  await fetchBook(isbn)
}

// ✅ Good - parallel processing
await Promise.all(isbns.map(isbn => fetchBook(isbn)))
```

### ❌ Don't Ignore Circuit Breaker
```typescript
// ❌ Bad - direct provider call
const book = await googleBooksAPI.search(isbn)

// ✅ Good - through circuit breaker
const book = await circuitBreaker.execute('google-books', () =>
  googleBooksAPI.search(isbn)
)
```

---

## Current Project Status (Dec 25, 2025)

**Active Issues:** 0 - ALL COMPLETE! 🎉

**Recent Completions:**
- ✅ **Biome Linter/Formatter** - Code quality tooling
- ✅ **Vitest Workers Pool Migration** - Tests run in real workerd
- ✅ **Gemini Model Upgrades** - Improved AI integration
- ✅ **V2 API Removal** - Cleanup after sunset
- ✅ **Alexandria RPC Migration** - Thin client architecture
- ✅ **Circuit Breaker Chain** - All providers protected

**Production Health:**
- 0% error rate (7 days)
- P95 latency: 145ms (cached), 850ms (cold)
- Cache hit ratio: 73%
- Test coverage: 75%+

---

**Last Updated:** December 25, 2025
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer, Jules, PAL MCP)
**Human Owner:** @jukasdrj
