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

### ISBNdb API
- **Base URL:** `https://api2.isbndb.com`
- **Rate limit:** 5000 requests/day (Premium plan)
- **Usage:** Cover image harvest only
- **Cache TTL:** 7 days (covers don't change)

### Gemini 2.0 Flash
- **Model:** `gemini-2.0-flash-exp`
- **Context window:** 2M tokens
- **Use case:** Bookshelf scanning, CSV parsing
- **Cost optimization:** Use caching for repeated prompts

---

## Testing Patterns

### Unit Tests
```javascript
import { describe, it, expect } from 'vitest'
import { validateISBN } from './utils/validation'

describe('ISBN Validation', () => {
  it('should validate ISBN-13', () => {
    expect(validateISBN('9780439708180')).toBe(true)
  })

  it('should reject invalid ISBN', () => {
    expect(validateISBN('123')).toBe(false)
  })
})
```

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

### API Contract (Source of Truth)

**PRIMARY DOCUMENTATION:** `docs/API_CONTRACT.md`

This is the **authoritative contract** for the BooksTrack API. All frontend integrations MUST follow this contract.

**When making API changes:**
1. Update `docs/API_CONTRACT.md` first (this is the contract)
2. Implement the changes in code
3. Update OpenAPI spec if available (Issue #138)
4. Notify frontend teams of breaking changes (90-day notice required)

**Deprecated docs:**
- ❌ `docs/API_CONTRACT_CURRENT.md` (superseded)
- ❌ `docs/FRONTEND_INTEGRATION_GUIDE.md` (superseded)

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

### README Updates
- Update `docs/API_CONTRACT.md` when adding new endpoints or changing schemas
- Document new environment variables in `SECRETS_SETUP.md`
- Add deployment notes to `DEPLOYMENT.md`

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
3. Delegate implementation to Haiku via mcp__zen__chat
4. Review Haiku's output
5. Request Grok-4 security review via mcp__zen__codereview
6. Address critical findings
7. Deliver to user
```

**Available via Zen MCP:**
- `mcp__zen__chat(model="haiku")` - Fast implementation
- `mcp__zen__codereview(model="grok-4")` - Expert review
- `mcp__zen__debug(model="grok-4")` - Deep debugging
- `mcp__zen__secaudit(model="grok-4")` - Security audit

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
- **Zen MCP Tools:**
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
5. **Zen MCP** performs deep security audit (if sensitive changes)
6. **Jules** reviews PR before human approval

**Incident Response Workflow:**
1. **cf-ops-monitor** detects error spike via `wrangler tail`
2. **cf-ops-monitor** auto-rollback if error rate > 5%
3. **Claude Code** investigates root cause with Zen MCP `debug`
4. **cf-code-reviewer** validates fix before re-deploy
5. **cf-ops-monitor** deploys fix and monitors recovery

**New Feature Workflow:**
1. **Claude Code** implements feature across multiple files
2. **cf-code-reviewer** validates code quality and patterns
3. **Zen MCP** `codereview` for architecture alignment
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

All commands are defined in `.claude/commands/` and automatically invoke the appropriate agents.

---

---

## Open Issues Organization

**For detailed resolution plans, see [docs/ISSUE_RESOLUTIONS.md](../docs/ISSUE_RESOLUTIONS.md)**

### Current Active Issues: 11 (as of Nov 21, 2025)

**Sprint 2 Completed:** 6 documentation issues resolved (#219, #218, #217, #216, #489, #497)
**Sprint 3 Phase 1 Completed:** 2 critical reliability issues resolved (#185, #178)

### By Priority

#### P1 - High Priority (2 issues)
- #242: Migrate all routes to ResponseEnvelope format (v2.0 API contract) - Breaking change
- #239: CORS policy consolidation - Security issue (credentials mismatch)

#### P2 - Medium Priority (4 issues)
- #243: Deprecate manual router in favor of Hono router - Technical debt (Phase 1 COMPLETE - Nov 21, 2025)
- #240: PRD Alignment Tracking (ideal-state architecture milestones) - Documentation
- #180: Eliminate code duplication in CSV processing
- #170: Add max concurrent WebSocket connections limit

#### P3 - Low Priority (5 issues)
- #241: Content-based recommendations engine (6-phase plan) - Future feature
- #174: Monitoring Dashboard (comprehensive observability) - Future feature
- #161: Set up Copilot instructions
- #147: Phase 4 advanced concurrency & edge case tests
- #47: Phase 2 test refactoring & duplicate removal

---

### By Component

#### API / Handlers (P1)
- #242: Migrate all routes to ResponseEnvelope format (v2.0 API contract)
- #239: CORS policy consolidation (security)

#### Routing / Infrastructure (P2-P3)
- #243: Deprecate manual router → Hono router (P2)
- #174: Monitoring Dashboard (P3, future)

#### WebSocket / Durable Objects (P2)
- #170: Max concurrent WebSocket connections limit

#### AI / CSV Processing (P2)
- #180: Eliminate code duplication in CSV processing

#### Documentation & Planning (P2-P3)
- #240: PRD Alignment Tracking (P2)
- #161: Copilot instructions (P3)

#### Future Features (P3)
- #241: Content-based recommendations engine
- #147: Phase 4 advanced concurrency tests
- #47: Phase 2 test refactoring

---

### Recently Closed Issues

#### Nov 20, 2025 - Sprint 2 Documentation Complete ✅
- ~~#219: CORS policies - DOCUMENTED (API_CONTRACT.md)~~
- ~~#218: HTTP headers documentation - DOCUMENTED (API_CONTRACT.md)~~
- ~~#217: DTO field defaults - DOCUMENTED (API_CONTRACT.md)~~
- ~~#216: WebSocket ping/pong - REMOVED (not needed for Cloudflare Workers)~~
- ~~#489: WebSocket heartbeat clarification - DOCUMENTED (Cloudflare auto-handles)~~
- ~~#497: Token refresh implementation - DOCUMENTED (alarm system details added)~~

#### Nov 19, 2025 - P1 Issues Resolution
- ~~#222: Rate limiter config - CLOSED (already aligned at 5 req/min)~~
- ~~#168: Batch vs single-photo response inconsistency - CLOSED (no inconsistency exists)~~
- ~~#167: HTTP vs WebSocket error handling - IMPLEMENTED (breaking change v2.0.0)~~
- ~~#47: Phase 2 test refactoring - DOWNGRADED to P3 (deferred to later sprint)~~
- ~~#138-140: OpenAPI/Postman/Contract testing - CLOSED (different approach)~~
- ~~#197: Cultural diversity fields not mapped - FIXED (authorsDetailed field added)~~

#### Nov 18, 2025 - Hono Migration Complete
- ~~#21-#39: Individual PRs consolidated into sprint-based workflow~~
- ~~#67: API contract standardization - COMPLETE~~
- ~~#91: iOS WebSocket migration docs - COMPLETE~~
- ~~#93: Monitoring dashboard - COMPLETE~~
- ~~#116-#129: API v2.0 migration issues - COMPLETE~~
- ~~#137: Cultural diversity fields - LIVE~~
- ~~#17: Router extraction - COMPLETE (Hono router)~~
- ~~#18: Analytics logging - COMPLETE (Hono middleware)~~

---

### Quick Issue Lookup

**P1 Critical?** → ✅ ALL COMPLETE!
**P2 Medium?** → #240 (PRD tracking)
**P3 Future?** → #241 (Recommendations), #174 (Monitoring), #161 (Copilot), #147 (Tests), #47 (Refactoring)

---

**Last Updated:** November 21, 2025 (Sprint 3 Phase 2 complete: 6 active issues, 0 P1, 1 P2, 5 P3)
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer, Jules, Zen MCP)
**Human Owner:** @jukasdrj

---

## 📊 Active Issues Summary (Nov 21, 2025)

### Total Active Issues: 6 (down from 11)

**Priority Breakdown:**
- **P1 (High):** 0 issues - ALL COMPLETE ✅
- **P2 (Medium):** 1 issue - PRD tracking (#240)
- **P3 (Low):** 5 issues - Recommendations (#241), monitoring (#174), Copilot (#161), tests (#147, #47)

**Sprint 3 Phase 2 Complete (Nov 21, 2025):**
- ✅ **#245 COMPLETE:** Cache-metrics endpoint migrated to ResponseEnvelope v2.0 (commit c0ba9c7)
  - Imported createSuccessResponse/createErrorResponse from response-builder
  - All responses include X-Response-Format: v2.0 header
  - Updated error codes: INVALID_PARAM → ErrorCodes.INVALID_REQUEST
  - No monitoring/analytics systems affected (internal endpoint only)
- ✅ **#242 COMPLETE:** All routes migrated to ResponseEnvelope format (v2.0 API contract)
- ✅ **#239 COMPLETE:** CORS policy consolidated (security issue resolved)
- ✅ **#243 COMPLETE:** Manual router deprecated, Hono migration complete
- ✅ **#180 COMPLETE:** CSV processing code duplication eliminated
- ✅ **#170 COMPLETE:** WebSocket connection limits with proper error handling

**Sprint 3 Phase 1 Complete (Nov 20, 2025):**
- ✅ **#185 FIXED:** R2 storage leak - comprehensive cleanup strategy (commit 6e3668e)
  - Created `src/utils/r2-utils.ts` for batch deletion
  - Cleanup on job failure and cancellation
  - Proper tracking of uploaded R2 keys
- ✅ **#178 FIXED:** WebSocket race condition eliminated (commit 63f46a8)
  - Removed unnecessary 200ms hardcoded delay
  - Increased waitForReady timeout 10s → 15s
  - Added connection timing logging
  - 61/62 CSV tests passing

**Sprint 2 Complete (Nov 20, 2025):**
- ✅ **#219 DOCUMENTED:** CORS policies added to API_CONTRACT.md
- ✅ **#218 DOCUMENTED:** HTTP headers documentation added
- ✅ **#217 DOCUMENTED:** DTO field defaults documented
- ✅ **#216 REMOVED:** WebSocket ping/pong (not needed for Cloudflare Workers)
- ✅ **#489 CLARIFIED:** Heartbeat handling (Cloudflare auto-manages)
- ✅ **#497 DETAILED:** Token refresh backend implementation (alarm system, blacklist, grace period)
- 📄 **Created:** FRONTEND_QUESTIONS_RESPONSE.md (363 lines of implementation details)

**Previous Progress (Nov 19, 2025):**
- ✅ **#167 IMPLEMENTED:** WebSocket errors now use HTTP canonical format (breaking change v2.0.0)
- ✅ **#222 CLOSED:** Rate limiter already aligned (5 req/min)
- ✅ **#168 CLOSED:** No inconsistency exists - unified `/api/batch-scan` endpoint
- ✅ **#47 DOWNGRADED:** Test refactoring moved to P3
- ✅ 911 tests passing (all WebSocket error tests updated and passing)

**Current Work (Nov 21, 2025):**
- 🎉 **ALL P1 ISSUES COMPLETE!** No critical issues remaining.
- 🎯 **Focus:** P3 future enhancements (recommendations, monitoring, testing)
