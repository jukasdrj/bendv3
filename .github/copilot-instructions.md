# GitHub Copilot Instructions - BooksTrack Backend

**Project:** Cloudflare Workers API (Node.js + TypeScript)
**Stack:** Hono Router, Durable Objects, KV Cache, R2 Storage
**Production:** https://api.oooefam.net

---

## Architecture Overview

### Monolith Design
- Single Cloudflare Worker with direct function calls (no RPC service bindings)
- All logic in one deployable unit for simplicity
- Durable Objects for WebSocket state management only
- KV namespace for distributed caching (24h TTL for book metadata)
- R2 storage for temporary image uploads during batch processing

### Code Organization
```
src/
├── index.js              # Main entry point
├── router.ts             # Hono router - ALL ROUTES HERE
├── handlers/             # Request handlers (one per route)
├── services/             # Business logic (reusable functions)
├── providers/            # External API integrations (Google Books, ISBNdb, etc.)
├── middleware/           # CORS, rate limiting, analytics
├── utils/                # Shared utilities (validation, formatting)
├── types/                # TypeScript type definitions
└── durable-objects/      # WebSocket Durable Object
```

**CRITICAL:** All HTTP routes are defined in `src/router.ts` (Hono router ONLY). The manual router was removed on Nov 21, 2025.

---

## Code Style

### TypeScript/JavaScript Patterns
```javascript
// ✅ CORRECT: Modern ES6+ patterns
const bookData = await searchService.findByISBN(isbn)
const { title, author } = bookData

// ✅ CORRECT: No semicolons (ASI)
const result = await handler(request, env)
return jsonResponse(result)

// ✅ CORRECT: Single quotes for strings
const message = 'Book not found'

// ✅ CORRECT: 2-space indentation
if (cached) {
  return cached
}

// ❌ AVOID: var, unnecessary semicolons, double quotes
var bookData = await searchService.findByISBN(isbn);
const title = bookData.title;
```

### Error Handling Pattern
```javascript
// ✅ ALWAYS wrap async operations in try-catch
export async function handleSearch(request, env) {
  try {
    const isbn = new URL(request.url).searchParams.get('isbn')

    if (!isbn) {
      return createErrorResponse('INVALID_REQUEST', 'ISBN parameter required', 400)
    }

    const book = await searchService.findByISBN(isbn, env)
    return createSuccessResponse(book)

  } catch (error) {
    console.error('Search failed:', error)
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}
```

---

## Cloudflare Workers Patterns

### Environment Bindings
```javascript
// ✅ Access secrets and bindings via env parameter
export async function fetch(request, env, ctx) {
  const apiKey = env.GOOGLE_BOOKS_API_KEY  // Secret
  const cache = env.BOOK_CACHE              // KV namespace
  const r2Bucket = env.BOOKSHELF_IMAGES     // R2 bucket
  const doStub = env.PROGRESS_TRACKER       // Durable Object
}
```

### KV Caching (Standard Pattern)
```javascript
// ✅ Check cache first, then fetch and cache
const cacheKey = `book:isbn:${isbn}`
let cached = await env.BOOK_CACHE.get(cacheKey, 'json')

if (cached) {
  return { ...cached, metadata: { cached: true } }
}

const book = await fetchFromProvider(isbn)

// Cache with 24-hour TTL
await env.BOOK_CACHE.put(cacheKey, JSON.stringify(book), {
  expirationTtl: 86400
})

return book
```

### Durable Objects (WebSocket)
```javascript
// ✅ Get Durable Object stub by ID
const id = env.PROGRESS_TRACKER.idFromName(jobId)
const stub = env.PROGRESS_TRACKER.get(id)

// Send progress update
await stub.sendProgress({
  jobId,
  progress: 0.5,
  message: 'Processing batch 5 of 10'
})
```

### CPU Time Limits (CRITICAL)
```javascript
// ❌ WRONG: Long operations in Worker context (may timeout)
ctx.waitUntil(
  processLargeCSV(data)  // May exceed 5-minute CPU limit
)

// ✅ CORRECT: Use Durable Object alarm for long operations
await doStub.scheduleProcessing(data)  // Alarm runs independently
```

---

## API Response Format (ResponseEnvelope v2.0)

### Success Response
```javascript
// ✅ Use response-builder utilities
import { createSuccessResponse } from './utils/response-builder'

return createSuccessResponse(data, {
  provider: 'google-books',
  cached: false
})

// Produces:
{
  data: { /* payload */ },
  metadata: {
    timestamp: '2025-11-21T12:00:00.000Z',
    processingTime: 145,
    provider: 'google-books',
    cached: false
  }
}
```

### Error Response
```javascript
// ✅ Use ErrorCodes enum for consistency
import { createErrorResponse } from './utils/response-builder'
import { ErrorCodes } from './utils/error-status'

return createErrorResponse(
  ErrorCodes.NOT_FOUND,
  'Book not found for ISBN 9780000000000',
  404,
  { isbn: '9780000000000' }
)

// Produces:
{
  data: null,
  metadata: { timestamp: '2025-11-21T12:00:00.000Z' },
  error: {
    code: 'NOT_FOUND',
    message: 'Book not found for ISBN 9780000000000',
    details: { isbn: '9780000000000' }
  }
}
```

**CRITICAL:** All responses MUST include `X-Response-Format: v2.0` header.

---

## Routing (Hono Router)

### Adding New Routes
```typescript
// ✅ Add ALL new routes to src/router.ts
router.get('/v1/new-endpoint', async (c) => {
  const result = await handler(c.req, c.env)
  return c.json(result)
})

// ✅ With rate limiting middleware
router.post('/api/new-job', rateLimitMiddleware, async (c) => {
  return handleNewJob(c.req.raw, c.env, getCtx(c))
})
```

**Route Organization:**
- `/health` - Health check
- `/metrics` - Prometheus metrics
- `/v1/*` - V1 API endpoints (canonical ResponseEnvelope format)
- `/api/*` - Batch operations, background jobs
- `/ws/progress` - WebSocket connections

---

## Security Patterns

### Input Validation
```javascript
// ✅ Validate ALL user inputs
function validateISBN(isbn) {
  const cleaned = isbn.replace(/-/g, '')
  if (!/^\d{10}$|^\d{13}$/.test(cleaned)) return false
  return verifyChecksum(cleaned)
}

// ✅ Sanitize query strings
function sanitizeQuery(query) {
  return query.trim().substring(0, 200) // Max 200 chars (DoS prevention)
}
```

### CORS Policy
```typescript
// ✅ Specific origins ONLY (NOT wildcard *)
const ALLOWED_ORIGINS = [
  'https://bookstrack.oooefam.net',  // Production web
  'capacitor://localhost',            // iOS/Android Capacitor apps
  'http://localhost:8787'             // Local dev
]

// Allow requests without Origin header (native iOS/Android apps)
origin: (origin) => origin ? ALLOWED_ORIGINS.includes(origin) : true
```

### Secrets Management
```javascript
// ✅ NEVER log or expose secrets
console.error('API call failed')  // Generic message

// ❌ NEVER do this
throw new Error(`API call failed with key: ${env.GOOGLE_BOOKS_API_KEY}`)
```

---

## Common Anti-Patterns to Avoid

### ❌ Blocking Event Loop
```javascript
// ❌ BAD: Synchronous blocking
const books = []
for (let i = 0; i < 1000; i++) {
  books.push(await fetchBook(i))  // Blocks each iteration
}

// ✅ GOOD: Parallel processing
const books = await Promise.all(
  Array.from({ length: 1000 }, (_, i) => fetchBook(i))
)
```

### ❌ Ignoring Cache
```javascript
// ❌ BAD: Always fetch from external API
const book = await googleBooksAPI.search(isbn)

// ✅ GOOD: Check cache first
const cached = await env.BOOK_CACHE.get(`book:${isbn}`, 'json')
if (cached) return cached

const book = await googleBooksAPI.search(isbn)
await env.BOOK_CACHE.put(`book:${isbn}`, JSON.stringify(book))
```

### ❌ Adding Routes Outside Hono Router
```typescript
// ❌ WRONG: Manual routing (deprecated Nov 21, 2025)
if (pathname === '/v1/new-endpoint') {
  return handleNewEndpoint(request, env)
}

// ✅ CORRECT: Use Hono router in src/router.ts
router.get('/v1/new-endpoint', async (c) => {
  return handleNewEndpoint(c.req, c.env)
})
```

---

## Testing Conventions

### Vitest Framework
```javascript
import { describe, it, expect } from 'vitest'

describe('ISBN Validation', () => {
  it('should validate ISBN-13', () => {
    expect(validateISBN('9780439708180')).toBe(true)
  })

  it('should reject invalid ISBN', () => {
    expect(validateISBN('123')).toBe(false)
  })
})
```

### Mock External APIs (ALWAYS)
```javascript
// ✅ Mock external calls - NO real API calls in tests
vi.mock('./providers/google-books', () => ({
  searchByISBN: vi.fn().mockResolvedValue({ title: 'Test Book' })
}))
```

**Coverage Targets:**
- Validators: 100%
- Normalizers: 100%
- Handlers: 75%+
- Services: 70%+
- Overall: 75%+

---

## Key Type Definitions

### Canonical DTOs (from src/types/canonical.ts)
```typescript
interface WorkDTO {
  // Required fields
  title: string
  subjectTags: string[]
  goodreadsWorkIDs: string[]
  amazonASINs: string[]
  isbndbQuality: number  // 0-100
  reviewStatus: ReviewStatus

  // Optional fields
  originalLanguage?: string
  firstPublicationYear?: number
  description?: string
  coverImageURL?: string
  searchLinks?: SearchLinksDTO
}

interface EditionDTO {
  // Required fields
  isbns: string[]
  format: EditionFormat
  amazonASINs: string[]
  isbndbQuality: number

  // Optional fields
  title?: string
  publisher?: string
  publicationDate?: string
  pageCount?: number
  coverImageURL?: string
}

interface AuthorDTO {
  // Required fields
  name: string
  gender: AuthorGender

  // Optional fields (Wikidata enrichment)
  culturalRegion?: CulturalRegion
  nationality?: string
  birthYear?: number
}
```

### Enums (from src/types/enums.ts)
```typescript
type EditionFormat = 'Hardcover' | 'Paperback' | 'E-book' | 'Audiobook' | 'Mass Market'
type AuthorGender = 'Female' | 'Male' | 'Non-binary' | 'Other' | 'Unknown'
type ReviewStatus = 'verified' | 'needsReview' | 'userEdited'
```

---

## External API Integrations

### Google Books API
```javascript
// Base: https://www.googleapis.com/books/v1/volumes
// Rate: 1000 requests/day
// Cache: 24 hours
// Fallback: OpenLibrary if Google Books fails
```

### ISBNdb API
```javascript
// Base: https://api2.isbndb.com
// Rate: 5000 requests/day (Premium)
// Usage: Cover image harvest ONLY
// Cache: 7 days (covers don't change)
```

### Gemini 2.0 Flash
```javascript
// Model: gemini-2.0-flash-exp
// Context: 2M tokens
// Use: Bookshelf scanning, CSV parsing
// Optimization: Use caching for repeated prompts
```

---

## Performance Requirements

### Response Time Targets (P95)
- Search endpoints: < 500ms (uncached)
- Cached responses: < 50ms
- WebSocket latency: < 50ms

### Caching Strategy
1. **KV Cache:** Primary cache for book metadata (24h TTL)
2. **Response Cache:** Cloudflare CDN for static responses (1h TTL)
3. **Provider Cache:** Cache external API responses before transformation

### Rate Limiting
- Global: 1000 requests/hour per IP
- Search endpoints: 100/minute per IP
- Batch enrichment: 10/minute per IP
- AI scanning: 5/minute per IP (5 photos × 10s = 50s processing time)

---

## Documentation References

**Primary Sources:**
- **API Contract (Source of Truth):** `docs/openapi.yaml` (OpenAPI 3.1 specification)
- **Claude Code Guide:** `.claude/CLAUDE.md`
- **Architecture:** `ARCHITECTURE_OVERVIEW.md`

**Key Files:**
- Router: `src/router.ts` (ALL routes here)
- Response Builder: `src/utils/response-builder.ts`
- Error Codes: `src/utils/error-status.ts`
- Canonical Types: `src/types/canonical.ts`
- WebSocket DO: `src/durable-objects/progress-socket.js`

---

## Comments and Documentation

### When to Add Comments
```javascript
// ✅ GOOD: Explain WHY, not WHAT
// Wikidata enrichment may fail; default to "Unknown" to prevent UI errors
const gender = wikidataGender ?? 'Unknown'

// ✅ GOOD: JSDoc for public APIs
/**
 * Search for book by ISBN
 * @param {string} isbn - 10 or 13 digit ISBN
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object>} Canonical book object
 */
export async function findByISBN(isbn, env) {
  // implementation
}

// ❌ AVOID: Stating the obvious
// Increment counter by 1
counter++
```

---

## Quick Reference

### Common Imports
```typescript
// Response builders
import { createSuccessResponse, createErrorResponse } from './utils/response-builder'

// Error codes
import { ErrorCodes } from './utils/error-status'

// Types
import type { Env } from './types/env'
import type { WorkDTO, EditionDTO, AuthorDTO } from './types/canonical'

// Durable Object helpers
import { getProgressDOStub } from './utils/durable-object-helpers'
```

### Common Patterns
```javascript
// Cache key format
const cacheKey = `book:isbn:${isbn}`
const cacheKey = `author:${authorId}`
const cacheKey = `scan-results:${jobId}`

// TTLs
const BOOK_TTL = 86400        // 24 hours
const COVER_TTL = 604800      // 7 days
const RESULTS_TTL = 3600      // 1 hour

// Rate limits
const SEARCH_LIMIT = 100      // per minute
const BATCH_LIMIT = 10        // per minute
const AI_SCAN_LIMIT = 5       // per minute
```

---

**Last Updated:** November 21, 2025
**Version:** 1.0.0
**Maintained By:** Backend Team (@jukasdrj)
