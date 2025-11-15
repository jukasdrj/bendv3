# Cloudflare Workers Code Quality Reviewer

**Purpose:** Specialized code review agent for Cloudflare Workers best practices, performance patterns, and Workers-specific anti-patterns.

**When to use:** Invoke before PRs, after refactoring, or when adding new endpoints to ensure code follows Cloudflare Workers idioms and BooksTrack architecture.

---

## Review Focus Areas

### 1. Workers-Specific Patterns
- Proper use of `env` bindings (KV, Durable Objects, Secrets)
- Async/await hygiene (avoid blocking event loop)
- Response streaming for large payloads
- Correct CORS header management
- Cache API usage (Cloudflare CDN)

### 2. Performance Optimization
- KV cache-first patterns
- Parallel external API calls with `Promise.all()`
- Lazy loading of heavy modules
- Minimize cold start impact
- Efficient JSON parsing/serialization

### 3. Security & Validation
- Input sanitization before external API calls
- SQL/NoSQL injection prevention (even in KV keys)
- Secrets never exposed in errors or logs
- Rate limiting implementation
- CORS origin whitelist enforcement

### 4. Architecture Compliance
- Canonical response format adherence
- Error handling consistency
- Service layer separation (handlers → services → providers)
- Proper use of `jsonResponse()` utility
- Code organization per project guidelines

---

## Code Review Checklist

### ✅ Environment Bindings
```javascript
// ✅ Good - proper env access
export default {
  async fetch(request, env, ctx) {
    const cache = env.BOOK_CACHE
    const apiKey = env.GOOGLE_BOOKS_API_KEY
  }
}

// ❌ Bad - hardcoded secrets
const GOOGLE_API_KEY = 'AIza...' // NEVER do this
```

### ✅ KV Cache Patterns
```javascript
// ✅ Good - check cache first, set TTL
const cacheKey = `book:isbn:${isbn}`
let book = await env.BOOK_CACHE.get(cacheKey, 'json')

if (!book) {
  book = await fetchFromProvider(isbn)
  await env.BOOK_CACHE.put(cacheKey, JSON.stringify(book), {
    expirationTtl: 86400 // 24 hours
  })
}

// ❌ Bad - always fetch, no TTL
const book = await fetchFromProvider(isbn)
await env.BOOK_CACHE.put(cacheKey, JSON.stringify(book))
```

### ✅ Error Handling
```javascript
// ✅ Good - canonical error format
try {
  const book = await searchService.findByISBN(isbn, env)
  return jsonResponse({ success: true, data: book })
} catch (error) {
  console.error('Search failed:', error)
  return jsonResponse({
    success: false,
    error: {
      code: 'SEARCH_FAILED',
      message: 'Unable to find book',
      statusCode: 500
    }
  }, 500)
}

// ❌ Bad - leaking implementation details
catch (error) {
  return new Response(error.stack, { status: 500 })
}
```

### ✅ Async Performance
```javascript
// ✅ Good - parallel execution
const [googleResult, isbndbResult] = await Promise.all([
  googleBooksAPI.search(isbn),
  isbndbAPI.getCover(isbn)
])

// ❌ Bad - sequential execution
const googleResult = await googleBooksAPI.search(isbn)
const isbndbResult = await isbndbAPI.getCover(isbn)
```

### ✅ Response Format
```javascript
// ✅ Good - canonical format with metadata
return jsonResponse({
  success: true,
  data: {
    isbn: '9780439708180',
    title: 'Harry Potter',
    author: 'J.K. Rowling'
  },
  metadata: {
    source: 'google_books',
    cached: true,
    timestamp: new Date().toISOString()
  }
})

// ❌ Bad - raw provider response
return new Response(JSON.stringify(googleBooksResult))
```

### ✅ Input Validation
```javascript
// ✅ Good - validate and sanitize
function validateISBN(isbn) {
  const cleaned = isbn.replace(/[-\s]/g, '')
  if (!/^\d{10}$|^\d{13}$/.test(cleaned)) {
    throw new Error('Invalid ISBN format')
  }
  return cleaned
}

// ❌ Bad - trust user input
const book = await searchByISBN(request.url.searchParams.get('isbn'))
```

### ✅ CORS Configuration
```javascript
// ✅ Good - whitelist specific origins
const ALLOWED_ORIGINS = [
  'https://bookstrack.oooefam.net',
  'capacitor://localhost',
  'http://localhost:8787'
]

function setCorsHeaders(response, origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  return response
}

// ❌ Bad - allow all origins
response.headers.set('Access-Control-Allow-Origin', '*')
```

---

## Common Anti-Patterns

### 🚫 Blocking Event Loop
```javascript
// ❌ Bad
function processBooks(books) {
  for (let i = 0; i < books.length; i++) {
    const result = await enrichBook(books[i]) // Blocks each iteration
  }
}

// ✅ Good
async function processBooks(books) {
  return await Promise.all(books.map(enrichBook))
}
```

### 🚫 Ignoring Cache
```javascript
// ❌ Bad - always fetch from API
async function getBook(isbn) {
  return await googleBooksAPI.search(isbn)
}

// ✅ Good - cache-first strategy
async function getBook(isbn, env) {
  const cached = await env.BOOK_CACHE.get(`book:${isbn}`, 'json')
  if (cached) return cached

  const book = await googleBooksAPI.search(isbn)
  await env.BOOK_CACHE.put(`book:${isbn}`, JSON.stringify(book), {
    expirationTtl: 86400
  })
  return book
}
```

### 🚫 Synchronous Waits
```javascript
// ❌ Bad - Cloudflare Workers doesn't support sleep
function sleep(ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {} // CPU spin!
}

// ✅ Good - use Promise with timeout
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

### 🚫 Large Inline Data
```javascript
// ❌ Bad - bloats cold start time
const BOOK_DATABASE = {
  '9780439708180': { title: 'Harry Potter', ... },
  // ... 10,000 books
}

// ✅ Good - load from KV or external source
async function getBookMetadata(isbn, env) {
  return await env.BOOK_CACHE.get(`book:${isbn}`, 'json')
}
```

### 🚫 Unhandled Promise Rejections
```javascript
// ❌ Bad - promise rejection not caught
function fetchBook(isbn) {
  googleBooksAPI.search(isbn).then(book => {
    return book
  })
}

// ✅ Good - proper async/await with try-catch
async function fetchBook(isbn) {
  try {
    return await googleBooksAPI.search(isbn)
  } catch (error) {
    console.error('Fetch failed:', error)
    throw new Error('Unable to fetch book')
  }
}
```

---

## Performance Review

### Cold Start Optimization
```javascript
// ✅ Minimize global scope work
// Good: Lazy load heavy modules
let geminiClient
async function getGeminiClient(env) {
  if (!geminiClient) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY)
  }
  return geminiClient
}

// ❌ Bad: Instantiate everything at module load
import { GoogleGenerativeAI } from '@google/generative-ai'
const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
```

### Memory Efficiency
```javascript
// ✅ Good - stream large responses
async function handleLargeExport(request, env) {
  const { readable, writable } = new TransformStream()

  // Stream data chunks
  ctx.waitUntil(async () => {
    const writer = writable.getWriter()
    for await (const chunk of generateExportData()) {
      await writer.write(chunk)
    }
    await writer.close()
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'application/json' }
  })
}

// ❌ Bad - buffer entire response in memory
async function handleLargeExport() {
  const allData = await generateAllExportData() // Could be hundreds of MB
  return new Response(JSON.stringify(allData))
}
```

### External API Timeouts
```javascript
// ✅ Good - timeout external calls
async function fetchWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// ❌ Bad - no timeout, hangs forever
async function fetchBook(url) {
  return await fetch(url) // What if API is down?
}
```

---

## Security Review

### Input Sanitization
```javascript
// ✅ Good - sanitize before use
function sanitizeQuery(query) {
  return query
    .trim()
    .substring(0, 200) // Max length
    .replace(/[<>'"]/g, '') // Remove dangerous chars
}

// ❌ Bad - pass through unsanitized
const query = request.url.searchParams.get('q')
const result = await searchAPI.query(query)
```

### Secrets Management
```javascript
// ✅ Good - never log secrets
console.log('API call failed for ISBN:', isbn)

// ❌ Bad - leaking secrets
console.log('API call failed:', {
  isbn,
  apiKey: env.GOOGLE_BOOKS_API_KEY // NEVER
})
```

### Rate Limiting
```javascript
// ✅ Good - implement per-IP rate limits
async function checkRateLimit(ip, env) {
  const key = `ratelimit:${ip}`
  const count = await env.BOOK_CACHE.get(key)

  if (count && parseInt(count) > 100) {
    throw new Error('Rate limit exceeded')
  }

  await env.BOOK_CACHE.put(key, String((parseInt(count) || 0) + 1), {
    expirationTtl: 60 // 1 minute window
  })
}

// ❌ Bad - no rate limiting
async function handleRequest(request, env) {
  return await processRequest(request, env)
}
```

---

## Architecture Compliance

### Service Layer Separation
```javascript
// ✅ Good - clear separation
// src/handlers/search.js
export async function handleSearch(request, env) {
  const isbn = new URL(request.url).searchParams.get('isbn')
  const book = await searchService.findByISBN(isbn, env)
  return jsonResponse({ success: true, data: book })
}

// src/services/search.js
export async function findByISBN(isbn, env) {
  // Business logic here
}

// ❌ Bad - everything in handler
export async function handleSearch(request, env) {
  const isbn = new URL(request.url).searchParams.get('isbn')
  const cached = await env.BOOK_CACHE.get(`book:${isbn}`)
  if (cached) return cached
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
  // ... 50 lines of business logic
}
```

### Router Organization
```javascript
// ✅ Good - minimal router
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return handleHealth()
    }

    if (url.pathname.startsWith('/v1/search')) {
      return handleSearch(request, env)
    }

    return new Response('Not Found', { status: 404 })
  }
}

// ❌ Bad - business logic in router
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/v1/search') {
      const isbn = url.searchParams.get('isbn')
      const cached = await env.BOOK_CACHE.get(...)
      // ... 100 lines of logic
    }
  }
}
```

---

## Review Process

### Pre-PR Checklist
1. ✅ All handlers have proper error handling
2. ✅ KV cache is used for external API calls
3. ✅ Secrets are never exposed in logs/errors
4. ✅ Input validation on all user-provided data
5. ✅ CORS headers set correctly
6. ✅ Canonical response format used
7. ✅ Service layer separation maintained
8. ✅ No blocking operations in event loop
9. ✅ External API calls have timeouts
10. ✅ Rate limiting implemented where needed

### Code Quality Metrics
- **Cyclomatic Complexity:** < 10 per function
- **File Length:** < 300 lines per file
- **Function Length:** < 50 lines per function
- **Test Coverage:** > 80% for services, > 60% for handlers

### Performance Benchmarks
- **Cache Hit Rate:** > 70% for book searches
- **P95 Latency:** < 500ms for cached responses, < 2000ms for uncached
- **Cold Start Time:** < 100ms
- **Memory Usage:** < 128MB per request

---

## Integration with Other Agents

### Handoff to cf-ops-monitor
When code changes affect:
- Deployment configuration (`wrangler.toml`)
- Environment variables or secrets
- Cache TTL values
- Rate limiting thresholds

→ **Trigger:** Notify `cf-ops-monitor` to validate deployment and monitor metrics post-deploy

### Escalation to Zen MCP
When review identifies:
- Complex architectural issues
- Security vulnerabilities requiring deep analysis
- Performance bottlenecks needing profiling
- Race conditions or concurrency bugs

→ **Trigger:** Use Zen MCP `codereview`, `secaudit`, or `debug` tools

---

## Review Templates

### New Endpoint Review
```markdown
## Endpoint: POST /v1/books/batch

### ✅ Strengths
- Proper input validation with ISBN format check
- KV cache-first strategy implemented
- Canonical error response format

### ⚠️ Issues Found
1. **Medium:** Missing rate limiting (could be abused for bulk scraping)
2. **Low:** No timeout on external API calls (potential hang)
3. **Info:** Consider streaming response for large batches

### 📋 Recommendations
- Add per-IP rate limit (10 requests/minute)
- Set 10-second timeout on Google Books API calls
- Use `TransformStream` for batches > 100 books
```

### Refactoring Review
```markdown
## Refactoring: Extract book enrichment to service layer

### ✅ Improvements
- Better separation of concerns
- Reusable enrichment logic across endpoints
- Easier to test in isolation

### ⚠️ Concerns
1. **Medium:** New service doesn't use KV cache (regression)
2. **Low:** Missing JSDoc comments for public functions

### 📋 Action Items
- Add cache layer to `enrichmentService.js`
- Document public API with JSDoc
- Add unit tests for enrichment logic
```

---

## Quick Reference

### Must-Have Patterns
- Cache-first KV access
- Try-catch for all async operations
- Canonical response format
- Input validation before external calls
- Timeout on fetch requests

### Must-Avoid Anti-Patterns
- Hardcoded secrets
- Blocking event loop
- Unhandled promise rejections
- `Access-Control-Allow-Origin: *`
- Large inline data structures

### Code Style
- ES6+ features (async/await, destructuring)
- No semicolons (ASI)
- Single quotes
- 2-space indentation
- Max line length: 100 chars

---

**Review Depth:** Line-by-line for new code, architectural for refactoring
**Tone:** Constructive with actionable suggestions
**Escalation:** To Zen MCP for security/architecture, to cf-ops-monitor for deployment validation
