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
├── index.js              # Main router - keep minimal
├── handlers/             # Request handlers - one per route
├── services/             # Business logic - reusable functions
├── providers/            # External API integrations
├── utils/                # Shared utilities (validation, formatting)
└── durable-objects/      # WebSocket Durable Object
```

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
**Environment variables:**
```javascript
// Access secrets and bindings through env parameter
export default {
  async fetch(request, env, ctx) {
    const apiKey = env.GOOGLE_BOOKS_API_KEY
    const cache = env.BOOK_CACHE // KV namespace
    const durableObject = env.PROGRESS_TRACKER // Durable Object
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
- **Never commit secrets** to version control
- Use `wrangler secret put` for production secrets
- Use `.dev.vars` for local development (gitignored)
- Rotate API keys quarterly

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

### Autonomous Project Agents

#### 🚀 cf-ops-monitor (Deployment & Observability)
**Location:** `.claude/agents/cf-ops-monitor/`
**Invoke with:** `@cf-ops-monitor` or automatically via hooks
**Slash commands:** `/deploy`, `/logs`, `/rollback`, `/cache-check`

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

**Autonomy:** High - can deploy, monitor, and rollback without human intervention

---

#### ✅ cf-code-reviewer (Code Quality & Best Practices)
**Location:** `.claude/agents/cf-code-reviewer/`
**Invoke with:** `@cf-code-reviewer` or automatically on code changes
**Slash commands:** `/review`

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
- Modifying `wrangler.toml`
- Reviewing external API integrations

**Autonomy:** Medium - provides detailed reviews and recommendations

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
- `wrangler.toml` modifications → Both agents
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

### By Phase (API v2.0 Migration)

#### Phase 1: Backend Implementation ✅ COMPLETE
- ~~#116: Refactor WebSocket payloads to summary-only~~
- ~~#117: Deploy native v2 handlers~~  
- ~~#118: All tests passing (42 tests)~~

#### Phase 2: Environment & Documentation (Pre-Notification)
- #119: Update API_README.md to v2 contract
- #120: Add deprecation headers to legacy endpoints (`Warning: 299`)
- #121: Deploy and verify staging environment

#### Phase 3: Client Migration (The Waiting Game)
- #122: Distribute v2 migration guide to iOS and Flutter teams
- #123: Client implementation window - monitor staging (4 weeks)

#### Phase 4: Production Launch
- #124: Final Go/No-Go decision for production
- #125: Production deployment - zero downtime launch
- #126: Post-launch monitoring (4-hour critical window)
- #93: Configure monitoring dashboard for v2.0 rollout

#### API Documentation & Testing
- #138: Generate OpenAPI/Swagger specification from API_CONTRACT.md
- #139: Create Postman collection for API_CONTRACT.md endpoints
- #140: Set up contract testing with Pact for API compliance
- #129: Update WebSocket testing instructions with `wrangler dev --remote`

---

### By Priority

#### P0 - Critical (Blocking)
_No critical blockers_

#### P1 - High Priority
- #124: Final Go/No-Go decision (pre-production gate)
- #125: Production deployment
- #126: Post-launch monitoring
- #93: Monitoring dashboard configuration
- #91: iOS WebSocket migration documentation

#### P2 - Medium Priority  
- #67: Standardize API contracts and DTOs (Phase 2 in progress)
- #119-#123: v2 migration workflow
- #138-#140: API documentation tooling
- #100: Performance - dynamic imports optimization

#### P3 - Low Priority
- #137: Feature request - diversity fields from Gemini
- #114: Refactor - debug flag guard for logging
- #113: Test - error handling coverage for WebSocket
- #112-#115: Code quality enhancements from Phase 1 review

---

### By Component

#### API / Handlers
- #67: API contract standardization
- #119: API_README.md v2 update
- #120: Deprecation headers
- #138: OpenAPI specification
- #139: Postman collection
- #140: Contract testing (Pact)
- #100: Dynamic import optimization

#### WebSocket / Durable Objects
- #67: WebSocket schema consolidation (Phase 1 ✅)
- #91: iOS WebSocket migration docs
- #113: Error handling test coverage
- #129: WebSocket testing with `wrangler dev --remote`

#### CI/CD / Deployment
- #121: Staging environment
- #124: Go/No-Go checklist
- #125: Production deployment
- #126: Post-launch monitoring
- #87: Configure staging environment
- #93: Monitoring dashboard

#### Documentation
- #122: v2 migration guide distribution
- #88: iOS WebSocket migration documentation
- #89: Notify API subscribers
- #91: iOS WebSocket migration docs (duplicate of #88?)
- #129: WebSocket testing instructions

#### AI / Gemini Integration
- #137: Diversity fields from author names
- #114: Debug logging in AI scanner

#### Testing
- #140: Contract testing (Pact)
- #113: WebSocket error handling tests
- #12: Test suite overview (sprint-4)
- #9: Phase 4 E2E tests
- #47: Phase 2 test refactoring
- #40: Sprint-based PR consolidation

#### Code Quality / Refactoring  
- #67: API/DTO standardization
- #17: Extract router into modules
- #18: Standardize analytics logging
- #100: Dynamic imports performance
- #114: Debug flag guards
- #115: Mock payload validation (from #67 review)

---

### By Sprint

#### Sprint 1 (Nov 13-27): Security + iOS Feature
- #93: Monitoring dashboard

#### Sprint 4 (Dec 29-Jan 8): E2E + Refactoring + Docs
- #12: Test suite overview
- #9: Phase 4 E2E tests  
- #47: Phase 2 test refactoring
- #40: Sprint-based PR consolidation
- #2: Sync docs to iOS/Flutter repos
- #17: Router extraction
- #18: Analytics standardization

---

### Deprecated / Superseded Issues

#### Closed or Archived
- #21-#39: Individual PRs consolidated into sprint-based workflow (#40)
- #87: Staging config (merged into #121)
- #88: iOS WebSocket docs (duplicate of #91)
- #89: Notify subscribers (covered by #122)

---

### Quick Issue Lookup

**Need to deploy?** → #125 (Production deployment), #121 (Staging)  
**Need API docs?** → #138 (OpenAPI), #139 (Postman), #119 (API_README)  
**Mobile team integration?** → #122 (Migration guide), #91 (iOS WebSocket), #129 (Testing)  
**Pre-launch checklist?** → #124 (Go/No-Go decision)  
**Post-launch monitoring?** → #126 (4-hour window), #93 (Dashboard)  
**Testing infrastructure?** → #12 (Overview), #9 (E2E), #140 (Contract tests)  
**Code quality?** → #67 (API standardization), #17 (Router), #18 (Analytics)  
**Performance?** → #100 (Dynamic imports), #93 (Monitoring)

---

**Last Updated:** November 16, 2025
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer, Jules, Zen MCP)
**Human Owner:** @jukasdrj
