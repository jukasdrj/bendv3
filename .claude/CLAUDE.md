# BooksTrack Backend - Claude Code Guidelines

**Project:** BooksTrack Cloudflare Workers API
**Stack:** Node.js, Cloudflare Workers, Durable Objects, KV Cache
**Production:** https://api.oooefam.net

---

## Architecture Principles

### 1. Monolith Design
- Single worker with direct function calls (no RPC service bindings)
- All logic in one deployable unit for simplicity
- Durable Objects for WebSocket state only
- KV for distributed caching

### 2. API Design Patterns
**Canonical Response Format:**
```javascript
{
  success: true,
  data: { /* canonical book object */ },
  metadata: {
    source: 'google_books',
    cached: true,
    timestamp: '2025-01-10T12:00:00Z'
  }
}
```

**Error Response Format:**
```javascript
{
  success: false,
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests',
    statusCode: 429
  }
}
```

### 3. Code Organization
```
src/
├── index.js              # Main entry point - delegates to Hono router
├── router.ts             # Hono router - ALL ROUTES HERE
├── handlers/             # Request handlers - one per route
├── services/             # Business logic - reusable functions
├── providers/            # External API integrations
├── utils/                # Shared utilities (validation, formatting)
└── durable-objects/      # WebSocket Durable Object
```

**✅ ROUTING:**
- **Hono router ONLY** (as of Nov 21, 2025)
- **Manual router removed:** See `docs/archive/manual-router-legacy-2025-11-21.js` for historical reference
- **All routes in `src/router.ts`** - Single source of truth for HTTP routing
- **Migration guide:** See `docs/HONO_MIGRATION.md` for details on the removal process

### 4. Workflow Architecture (Sprint 2 - Issue #21, #22)

BooksTrack uses a multi-tier job management architecture for async operations:

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Layer                                │
│  POST /v2/import/workflow  →  GET /v1/jobs/:jobId/status        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   JobStateManagerDO                              │
│  - initializeJobState(jobId, pipeline, totalCount)              │
│  - updateProgress(pipeline, payload)                            │
│  - getJobState() → {jobId, status, progress, ...}               │
│  - complete(pipeline, payload) / sendError(pipeline, payload)   │
│  - scheduleCSVProcessing() / scheduleBookshelfScan()            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  WebSocketConnectionDO                           │
│  - Real-time progress broadcasts to connected clients           │
│  - Token-based authentication                                   │
│  - Automatic cleanup after job completion                       │
└─────────────────────────────────────────────────────────────────┘
```

**Pipeline Types:**
- `csv_import` - CSV file import with Gemini parsing
- `batch_enrichment` - OpenLibrary work ID enrichment
- `ai_scan` - Bookshelf photo scanning with Gemini Vision

**Job States:**
- `initialized` - Job created, waiting to start
- `processing` - Actively processing items
- `completed` - Successfully finished (progress: 1.0)
- `failed` - Error occurred (includes error details)
- `canceled` - User canceled job

**Progress Streaming (Hybrid Architecture):**
- **SSE** (`/api/v2/imports/:id/stream`) - CSV imports (one-way, auto-reconnect)
- **WebSocket** (`/ws/progress?jobId=xxx`) - Batch enrichment, scanning (bidirectional, cancel support)
- **HTTP Polling** (`GET /v1/jobs/:jobId/status`) - Fallback, rate-limited to 30 req/min

**Why SSE for CSV imports?**
- Browser-native reconnection with `Last-Event-ID`
- Firewall-friendly (HTTP/1.1)
- Automatic retry on connection loss
- Books array included in completion event (iOS persistence)

**Why WebSocket for batch operations?**
- Bidirectional communication (ready acks, cancel messages)
- Real-time progress during enrichment/scanning
- Client can cancel mid-stream
- Lower latency for interactive operations

**D1 Integration (Issue #22):**
- Dual-write enabled: KV + D1 for durability
- D1_READ_PERCENTAGE controls read routing (0-100%)
- Performance targets: ISBN lookup <500ms p95, author search <1000ms p95

---

## Code Style

### JavaScript Modern Patterns
- **Use ES6+ features:** async/await, destructuring, arrow functions
- **No semicolons** unless required (ASI)
- **Single quotes** for strings
- **2-space indentation**

```javascript
// Good
const bookData = await searchService.findByISBN(isbn)
const { title, author } = bookData

// Bad
var bookData = await searchService.findByISBN(isbn);
const title = bookData.title;
const author = bookData.author;
```

### Error Handling
**Always use try-catch for async operations:**
```javascript
export async function handleSearch(request, env) {
  try {
    const isbn = new URL(request.url).searchParams.get('isbn')

    if (!isbn) {
      return jsonResponse({
        success: false,
        error: { code: 'MISSING_ISBN', message: 'ISBN parameter required' }
      }, 400)
    }

    const book = await searchService.findByISBN(isbn, env)
    return jsonResponse({ success: true, data: book })

  } catch (error) {
    console.error('Search failed:', error)
    return jsonResponse({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    }, 500)
  }
}
```

### Cloudflare Workers Patterns

**Configuration:** `wrangler.jsonc` (JSON with schema, replaces legacy `wrangler.toml`)

BooksTrack uses `wrangler.jsonc` for configuration with JSON schema support for IDE autocomplete and validation. The legacy `wrangler.toml` is kept for historical reference only.

**Local development secrets:** `.env` file (git-ignored, loaded automatically by `npx wrangler dev`)

```bash
# .env (local development only, NEVER commit)
GOOGLE_BOOKS_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
ISBNDB_API_KEY=your_key_here
```

**Production secrets:** Use `wrangler secret put` (never commit to version control)

**Environment variables:**
```javascript
// Access secrets and bindings through env parameter
export default {
  async fetch(request, env, ctx) {
    const apiKey = env.GOOGLE_BOOKS_API_KEY  // From .env (local) or Workers secret (production)
    const cache = env.CACHE // KV namespace (configured in wrangler.jsonc)
    const durableObject = env.PROGRESS_WEBSOCKET_DO // Durable Object binding
  }
}
```

**KV Caching:**
```javascript
// Check cache first
const cacheKey = `book:isbn:${isbn}`
let cached = await env.BOOK_CACHE.get(cacheKey, 'json')

if (cached) {
  return { ...cached, metadata: { cached: true } }
}

// Fetch from provider
const book = await fetchFromProvider(isbn)

// Cache with TTL (24 hours)
await env.BOOK_CACHE.put(cacheKey, JSON.stringify(book), {
  expirationTtl: 86400
})

return book
```

**WebSocket with Durable Objects:**
```javascript
// Get Durable Object stub
const id = env.PROGRESS_TRACKER.idFromName(jobId)
const stub = env.PROGRESS_TRACKER.get(id)

// Send progress update
await stub.sendProgress({
  jobId,
  progress: 50,
  message: 'Processing batch 5 of 10'
})
```

---

## API Conventions

### Routing Architecture

**✅ Hono Router (`src/router.ts`) - Single Source of Truth**

All HTTP routing is handled by the Hono router. The manual router was removed on Nov 21, 2025.

**Adding New Routes:**
```typescript
// ✅ Add all new routes to src/router.ts (Hono)
router.get('/v1/new-endpoint', async (c) => {
  const result = await handler(c.req, c.env)
  return c.json(result)
})
```

**Route Organization:**
- `/health` - Health check
- `/metrics` - Prometheus metrics
- `/v1/*` - V1 API endpoints (canonical ResponseEnvelope format)
- `/api/*` - Batch operations, background jobs
- `/ws/progress` - WebSocket connections
- `/search/*` - Legacy search API (deprecated, sunset March 1, 2026)

### Route Naming
- **Search endpoints:** `/v1/search/{type}?{params}`
- **Background jobs:** `/v1/{feature}/batch`
- **WebSocket:** `/ws/{feature}?jobId={uuid}`
- **Health:** `/health`

### Query Parameters
- Use descriptive names: `?q=query` for search, `?isbn=123` for lookups
- Support pagination: `?page=1&limit=20`
- Use kebab-case: `?job-id=uuid`

### Response Times
- Search endpoints: < 500ms (P95)
- Cached responses: < 50ms (P95)
- WebSocket latency: < 50ms

---

## External Integrations

### Google Books API
- **Base URL:** `https://www.googleapis.com/books/v1/volumes`
- **Rate limit:** 1000 requests/day per API key
- **Cache TTL:** 24 hours
- **Fallback:** OpenLibrary if Google Books fails
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

### ISBNdb API
- **Base URL:** `https://api2.isbndb.com`
- **Rate limit:** 5000 requests/day (Premium plan)
- **Usage:** Cover image harvest only
- **Cache TTL:** 7 days (covers don't change)
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

### Alexandria RPC (Primary Provider)
- **Integration:** Service Binding (internal) or HTTPS (external)
- **Base URL:** `https://alexandria.ooheynerds.com` (fallback)
- **Dataset:** 49M+ ISBNs with OpenLibrary metadata
- **Cost:** $0 (internal data)
- **Latency:** <100ms (typical), sub-millisecond via Service Binding
- **Use case:** Primary book metadata provider (replaces OpenLibrary direct calls)
- **Architecture:** Strictly typed Hono RPC client with Zod validation
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown

### OpenLibrary API (Deprecated - Use Alexandria)
- **Status:** Deprecated in favor of Alexandria RPC
- **Base URL:** `https://openlibrary.org/api`
- **Rate limit:** No official limit (be respectful)
- **Cache TTL:** 24 hours
- **Circuit breaker:** 5 failures → OPEN, 60s cooldown
- **Migration:** All calls should go through Alexandria client instead

### Gemini 2.0 Flash
- **Model:** `gemini-2.0-flash-exp`
- **Context window:** 2M tokens
- **Use case:** Bookshelf scanning, CSV parsing
- **Cost optimization:** Use caching for repeated prompts

### Circuit Breaker Configuration

All external API providers are protected by per-provider circuit breakers:

**Default Configuration:**
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

**KV Storage:**
- State stored at `circuit:{provider}` (e.g., `circuit:google-books`)
- Includes failure count, success count, last failure time
- Automatic expiration after 5 minutes of inactivity

**Analytics:**
- Circuit opened/closed events logged to PERFORMANCE_ANALYTICS
- Includes provider name, failure count, timestamp
- Use for monitoring provider health and circuit breaker effectiveness

---

## Testing Patterns

### Testing Commands (Resource-Aware)

**⚡ RECOMMENDED - Use these to prevent laptop crashes:**

```bash
# Quick validation (5 seconds, minimal resources)
npm run test:smoke

# Full test suite with resource limits (60 seconds, 512MB max)
npm run test:safe

# Unit tests only (skip slow integration tests)
npm run test:unit

# Pre-commit validation
npm run validate
```

**⚠️ USE CAREFULLY - May cause high CPU/memory on 8GB laptops:**

```bash
# Default mode (use only on 16GB+ RAM machines or CI/CD)
npm test

# Coverage analysis (memory-intensive)
npm run test:coverage
```

**See:** `README_TESTING.md` for full guide, `docs/LAPTOP_TESTING.md` for detailed documentation

### Development Workflow

```bash
# Daily workflow (prevents system lockups)
npm run dev              # Start dev server
# ... make code changes ...
npm run test:smoke       # Quick validation (5s)

# Before commits
npm run validate         # Smoke tests + lint

# Full validation (when needed)
npm run test:safe        # Complete suite with constraints
```

### Unit Tests
```javascript
import { describe, it, expect } from 'vitest'
import { isValidISBN } from './utils/isbn-validation'

describe('ISBN Validation', () => {
  it('should validate ISBN-13', () => {
    expect(isValidISBN('9780439708180')).toBe(true)
  })

  it('should reject invalid ISBN', () => {
    expect(isValidISBN('123')).toBe(false)
  })
})
```

### Smoke Tests (Fast Validation)

**Location:** `tests/smoke/` - Lightweight tests for quick sanity checks

```javascript
// tests/smoke/validation.test.js
import { describe, it, expect } from 'vitest'

describe('Validation Smoke Tests', () => {
  it('should validate ISBN format checking works', async () => {
    const { isValidISBN } = await import('../../src/utils/isbn-validation.ts')

    expect(isValidISBN('9780439708180')).toBe(true)
    expect(isValidISBN('123')).toBe(false)
  })
})
```

**When to use smoke tests:**
- Before every commit
- After dependency updates
- Quick sanity checks during development
- Testing in low-resource environments

### Integration Tests
```javascript
// Use npx wrangler dev for local testing
// Test against localhost:8787

describe('Search API', () => {
  it('should return book for valid ISBN', async () => {
    const response = await fetch('http://localhost:8787/v1/search/isbn?isbn=9780439708180')
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.data.isbn).toBe('9780439708180')
  })
})
```

### Resource Constraints

**Vitest Configuration** (vitest.config.js:51-63):
- Pool: `forks` (better isolation than threads)
- Max forks: `2` (reduced from 4 to prevent CPU overload)
- Safe mode: Sequential execution via `TEST_SAFE_MODE=true`

**Memory Limits:**
- Safe mode: 512MB per process (`NODE_OPTIONS='--max-old-space-size=512'`)
- Default mode: No limit (can use 2GB+ per fork on powerful machines)

**Hardware Recommendations:**
- **8GB RAM:** Use `npm run test:safe` or `npm run test:smoke` only
- **16GB+ RAM:** Can use `npm test` (default mode)
- **CI/CD:** Use `npm test` (dedicated resources)

---

## Performance

### Caching Strategy
1. **KV Cache:** Primary cache for book metadata (24h TTL)
2. **Response Cache:** Cloudflare CDN for static responses (1h TTL)
3. **Provider Cache:** Cache external API responses before transformation

### Rate Limiting
- **Global rate limit:** 1000 requests/hour per IP
- **Endpoint-specific limits:**
  - Search: 100/minute per IP
  - Batch enrichment: 10/minute per IP
  - Bookshelf scan: 5/minute per IP (expensive AI calls)

### Cost Optimization
- **KV reads:** Free up to 10M/day
- **KV writes:** Optimize with TTL to reduce writes
- **Gemini API:** Use caching for repeated prompts (50% cost reduction)
- **ISBNdb:** Harvest covers during off-peak hours

---

## Security

### Input Validation
```javascript
// Validate all user inputs
function validateISBN(isbn) {
  // Remove hyphens, check length, verify checksum
  const cleaned = isbn.replace(/-/g, '')
  if (!/^\d{10}$|^\d{13}$/.test(cleaned)) return false
  return verifyChecksum(cleaned)
}

// Sanitize before external API calls
function sanitizeQuery(query) {
  return query.trim().substring(0, 200) // Max 200 chars
}
```

### CORS Configuration
```javascript
// Allow specific origins only
const ALLOWED_ORIGINS = [
  'https://bookstrack.oooefam.net',
  'capacitor://localhost', // iOS app
  'http://localhost:8787' // Local dev
]

function setCorsHeaders(response, origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  return response
}
```

### Secrets Management
- **Never commit secrets** to version control (`.env` is in `.gitignore`)
- **Local development:** Copy `.env.example` to `.env` and add your API keys
- **Production secrets:** Use `wrangler secret put` for production deployment
- **CI/CD:** Set secrets in GitHub repository settings (Actions secrets)
- **Rotate API keys quarterly** as a security best practice

```bash
# Local development setup
cp .env.example .env
# Edit .env with your actual API keys
npx wrangler dev  # Automatically loads .env

# Production secret management
wrangler secret put GOOGLE_BOOKS_API_KEY
# (paste your actual production key when prompted)
```

---

## Deployment

### CI/CD Pipeline
1. **Push to main** → Triggers GitHub Actions
2. **Deploy to production** → `wrangler deploy`
3. **Health check** → Verify `/health` endpoint
4. **Rollback** → `wrangler rollback` if health check fails

### Monitoring
- **Cloudflare Analytics:** Request volume, error rate, latency
- **Console logs:** `wrangler tail` for real-time logs
- **Custom metrics:** WebSocket connection count, cache hit rate

### Rollback Procedure
```bash
# List deployments
npx wrangler deployments list

# Rollback to previous version
npx wrangler rollback --message "Rolling back due to error spike"
```

---

## Documentation

### API Documentation Strategy

**Two-Tier OpenAPI Approach:**

#### V3 API (Code-First, Auto-Generated)
- **Live Spec:** `/v3/openapi.json` - Auto-generated by @hono/zod-openapi
- **Interactive Docs:** `/v3/docs` - Swagger UI
- **Source:** `src/api-v3/index.ts` - Route definitions with Zod schemas
- **When to Update:** Edit Zod schemas in code, spec regenerates automatically

#### V2 API (Spec-First, Manual)
- **Static Spec:** `docs/openapi.yaml` - Hand-maintained OpenAPI 3.1 spec
- **TypeScript SDK:** `packages/api-client/` - Auto-generated from openapi.yaml
- **When to Update:**
  1. Edit `docs/openapi.yaml` directly (this is the V2 contract)
  2. Regenerate SDK: `cd packages/api-client && npm run generate`
  3. Notify frontend teams of breaking changes (90-day notice required)

**Why Two Specs?**
- V3 uses native Hono OpenAPI (code-first, full type safety with zod@4)
- V2 predates Hono migration (spec-first, maintained for backward compatibility)
- Both coexist during V2→V3 migration period

**Migration Strategy:**
- New endpoints: Use V3 (code-first with Zod schemas)
- V2 endpoints: Update `openapi.yaml` until V2 sunset (TBD, 90 days after V3 GA)
- V1 endpoints: Deprecated, sunset March 1, 2026

**See also:** `docs/README.md` for documentation navigation

### Code Comments
- **Explain WHY, not WHAT:** Code should be self-documenting
- **Document complex logic:** Rate limiting, caching strategies, AI prompts
- **Use JSDoc for public APIs:**
```javascript
/**
 * Search for book by ISBN
 * @param {string} isbn - 10 or 13 digit ISBN
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object>} Canonical book object
 */
export async function findByISBN(isbn, env) {
  // implementation
}
```

### Documentation Updates

**When adding V3 endpoints:**
1. Define route with Zod schema in `src/api-v3/index.ts`
2. Spec auto-generates at `/v3/openapi.json`
3. No manual spec updates needed

**When adding V2 endpoints:**
1. Update `docs/openapi.yaml` with new endpoint definition
2. Implement handler in `src/handlers/v2/`
3. Regenerate SDK: `cd packages/api-client && npm run generate`

**Other updates:**
- Document new environment variables in `docs/deployment/SECRETS_SETUP.md`
- Add deployment notes to `docs/deployment/DEPLOYMENT.md`

---

## Common Mistakes to Avoid

### ✅ Always Use Hono Router
```typescript
// ✅ CORRECT - Add routes to src/router.ts (Hono)
router.get('/v1/new-feature', async (c) => {
  return handleNewFeature(c.req, c.env)
})

// Example with rate limiting
router.post('/api/new-job', rateLimitMiddleware, async (c) => {
  return handleNewJob(c.req.raw, c.env, getCtx(c))
})
```

**Why:** Hono router provides type safety, middleware support, better performance, and is the single source of truth for all HTTP routing (as of Nov 21, 2025).

### ❌ Don't Exceed CPU Time Limits
```javascript
// Paid Plan Limits:
// - HTTP Requests: 5 minutes max CPU time (default: 30 seconds)
// - Cron Triggers: 15 minutes max CPU time
// - Queue Consumers: 15 minutes max CPU time

// ❌ BAD - Long CPU-intensive operation in Worker context
ctx.waitUntil(
  processLargeCSV(data)  // May timeout if >5min CPU time
)

// ✅ GOOD - Use Durable Object alarm for long operations
await doStub.scheduleProcessing(data)  // Alarm runs independently
```

### ❌ Don't Block Event Loop
```javascript
// Bad - synchronous blocking
const books = []
for (let i = 0; i < 1000; i++) {
  books.push(await fetchBook(i)) // Blocks each iteration
}

// Good - parallel processing
const books = await Promise.all(
  Array.from({ length: 1000 }, (_, i) => fetchBook(i))
)
```

### ❌ Don't Ignore Cache
```javascript
// Bad - always fetch from external API
const book = await googleBooksAPI.search(isbn)

// Good - check cache first
const cached = await env.BOOK_CACHE.get(`book:${isbn}`, 'json')
if (cached) return cached

const book = await googleBooksAPI.search(isbn)
await env.BOOK_CACHE.put(`book:${isbn}`, JSON.stringify(book))
return book
```

### ❌ Don't Leak Secrets
```javascript
// Bad - exposing API keys in errors
throw new Error(`API call failed with key: ${env.GOOGLE_BOOKS_API_KEY}`)

// Good - generic error messages
throw new Error('External API call failed')
```

---

## AI Collaboration

### Multi-Agent Development Workflow (NEW!)

BooksTrack supports a **Sonnet 4.5 → Haiku → Grok-4** workflow for complex development tasks. See `.claude/skills/multi-agent-dev.md` for the complete guide.

**When to use:**
- Complex feature implementation requiring rapid iteration
- Security-critical code needing expert review
- Performance-sensitive optimizations
- Large refactoring projects with multiple components

**Example:**
```
User: "Add rate limiting to the batch enrichment endpoint"

Sonnet 4.5 (you):
1. Clarify requirements (per-IP? per-user? rate limits?)
2. Design approach (KV-based sliding window)
3. Delegate implementation to Haiku via mcp__pal__chat
4. Review Haiku's output
5. Request Grok-4 security review via mcp__pal__codereview
6. Address critical findings
7. Deliver to user
```

**Available via PAL MCP:**
- `mcp__pal__chat(model="haiku")` - Fast implementation
- `mcp__pal__codereview(model="grok-4")` - Expert review
- `mcp__pal__debug(model="grok-4")` - Deep debugging
- `mcp__pal__secaudit(model="grok-4")` - Security audit

---

### Autonomous Project Agents

#### 🚀 cf-ops-monitor (Deployment & Observability)
**Location:** `.claude/agents/cf-ops-monitor/`
**Invoke with:** `@cf-ops-monitor` or automatically via hooks
**Slash commands:** `/deploy`, `/logs`, `/rollback`, `/cache-check`
**Permission Mode:** `ask` (requires approval for critical ops)

**Capabilities:**
- Execute `wrangler deploy` with health checks
- Stream and analyze logs with `wrangler tail`
- Monitor error rates and auto-rollback on failures
- Track KV cache hit rates and Durable Object metrics
- Cost optimization (billable operations tracking)
- Performance profiling (cold starts, latency)

**Use when:**
- Deploying to production
- Investigating 5xx errors or slow responses
- Analyzing WebSocket disconnections
- Monitoring cache performance
- Tracking API quota usage (Google Books, ISBNdb, Gemini)

**Autonomy:** High - can deploy, monitor, and rollback (with approval)

---

#### ✅ cf-code-reviewer (Code Quality & Best Practices)
**Location:** `.claude/agents/cf-code-reviewer/`
**Invoke with:** `@cf-code-reviewer` or automatically on code changes
**Slash commands:** `/review`
**Permission Mode:** `allow` (auto-runs without approval)

**Capabilities:**
- Review Workers-specific patterns (env bindings, KV cache, Durable Objects)
- Detect anti-patterns (blocking event loop, missing timeouts)
- Enforce security (input validation, secrets management, CORS)
- Validate canonical response format compliance
- Check service layer separation
- Performance analysis (async patterns, memory efficiency)

**Use when:**
- Before creating PRs
- After refactoring handlers or services
- Adding new API endpoints
- Modifying `wrangler.jsonc` (configuration changes)
- Reviewing external API integrations

**Autonomy:** High - auto-runs on code changes without approval

---

### AI Tool Hierarchy

#### Level 1: Inline Assistance
- **GitHub Copilot:** Inline code completion, boilerplate generation

#### Level 2: Project Agents (Autonomous)
- **cf-ops-monitor:** Deployment, monitoring, rollback
- **cf-code-reviewer:** Code quality, Workers best practices

#### Level 3: Orchestration & Architecture
- **Claude Code (you!):** Multi-file refactoring, architecture changes
- **Jules (@jules on GitHub):** PR reviews, code explanations

#### Level 4: Deep Analysis
- **PAL MCP Tools:**
  - `debug` - Complex bug investigation
  - `secaudit` - Security vulnerability assessment
  - `codereview` - Architectural code review
  - `thinkdeep` - Multi-stage reasoning for complex problems
  - `precommit` - Pre-commit validation across repositories

---

### Agent Handoff Patterns

**Code Change Workflow:**
1. **Copilot** generates initial code
2. **cf-code-reviewer** validates Workers patterns and security
3. **Claude Code** refactors to match project architecture
4. **cf-ops-monitor** deploys and monitors health
5. **PAL MCP** performs deep security audit (if sensitive changes)
6. **Jules** reviews PR before human approval

**Incident Response Workflow:**
1. **cf-ops-monitor** detects error spike via `wrangler tail`
2. **cf-ops-monitor** auto-rollback if error rate > 5%
3. **Claude Code** investigates root cause with PAL MCP `debug`
4. **cf-code-reviewer** validates fix before re-deploy
5. **cf-ops-monitor** deploys fix and monitors recovery

**New Feature Workflow:**
1. **Claude Code** implements feature across multiple files
2. **cf-code-reviewer** validates code quality and patterns
3. **PAL MCP** `codereview` for architecture alignment
4. **cf-ops-monitor** deploys to production with monitoring
5. **Jules** documents feature in PR review

---

### Hook-Based Agent Triggers

**Automatic Invocation:**
- Code changes in `src/handlers/` or `src/services/` → `cf-code-reviewer`
- `wrangler deploy` execution → `cf-ops-monitor`
- `wrangler.jsonc` modifications → Both agents
- `wrangler tail` streaming → `cf-ops-monitor`

**Hook Location:** `.claude/hooks/post-tool-use.sh`

### Custom Slash Commands

BooksTrack backend includes productivity slash commands for common operations:

- `/deploy` - Deploy to Cloudflare Workers with health monitoring
- `/review` - Review code for Workers best practices
- `/logs [filter]` - Stream and analyze production logs
- `/rollback` - Rollback to previous deployment
- `/cache-check` - Inspect KV cache performance
- `/rewind` - Undo last change and revert conversation context

All commands are defined in `.claude/commands/` and automatically invoke the appropriate agents.

---

## Current Project Status (Nov 27, 2025)

**Active Issues:** 0 - ALL COMPLETE! 🎉

**Recent Sprint Results:**
- **Sprint 3 Phase 3 (Nov 26-27):** Circuit breaker implementation complete
  - Issues #80, #77, #97, #98, #99, #100, #81 all closed
  - Core CircuitBreaker class with CLOSED/OPEN/HALF_OPEN states
  - All 9 external API functions protected
  - Cache monitoring and alerting integrated
  - 100% production deployment success
- **Sprint 3 Phase 2 (Nov 21):** API contract standardization complete
  - ResponseEnvelope v2.0 migration (#242)
  - CORS policy consolidation (#239)
  - Manual router deprecation (#243)
  - CSV code duplication removal (#180)
  - WebSocket connection limits (#170)
- **Sprint 3 Phase 1 (Nov 20):** Critical reliability fixes complete
  - R2 storage leak prevention (#185)
  - WebSocket race condition elimination (#178)
- **Sprint 2 (Nov 20):** Documentation standardization complete
  - 6 documentation issues resolved

**Production Health:**
- 0% error rate over 7 days
- P95 latency: 145ms (cached), 850ms (cold)
- Cache hit ratio: 73%
- Test coverage: 75%+
- 911+ tests passing

For historical issue tracking, see git commit history and closed GitHub issues.

---

**Last Updated:** December 1, 2025
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer, Jules, PAL MCP)
**Human Owner:** @jukasdrj
