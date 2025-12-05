# V3 API Migration Guide for Frontend Teams

**Created:** December 4, 2025
**API Version:** V3.0.0 (Live in Production)
**Status:** V3 Ready | V1 Sunsets March 1, 2026

---

## TL;DR

**V3 is live at:** `https://api.oooefam.net/v3/*`

**Get the OpenAPI spec:**
- **Live spec:** https://api.oooefam.net/v3/openapi.json (auto-generated)
- **Interactive docs:** https://api.oooefam.net/v3/docs (Swagger UI)

**No npm package yet** - V3 uses auto-generated OpenAPI spec from code. The existing `@jukasdrj/bookstrack-api-client` package is for V2/V1 only.

---

## What Changed in V3?

### Architecture
- **Code-first API** using `@hono/zod-openapi` (Zod schemas → OpenAPI spec)
- **Auto-generated OpenAPI spec** at `/v3/openapi.json`
- **RFC 9457 Problem Details** for structured errors
- **Request correlation** with `X-Request-ID` headers
- **Rate limit headers** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)
- **Alexandria RPC integration** (49M+ ISBNs, <100ms response)

### Endpoints

| V1/V2 Endpoint | V3 Endpoint | Notes |
|----------------|-------------|-------|
| `GET /v1/search/isbn?isbn=X` | `GET /v3/books/:isbn` | Path param instead of query |
| `GET /v1/search/title?q=X` | `GET /v3/books/search?q=X` | Same query param |
| `POST /api/v2/books/enrich` | `POST /v3/books/enrich` | Supports batch (array) |
| N/A | `GET /v3/openapi.json` | NEW - Live spec |
| N/A | `GET /v3/docs` | NEW - Swagger UI |

---

## How to Integrate V3

### Option 1: Generate Your Own Client (Recommended)

Use the live OpenAPI spec to generate a type-safe client:

```bash
# Install openapi-typescript
npm install -D openapi-typescript openapi-fetch

# Generate types from live V3 spec
npx openapi-typescript https://api.oooefam.net/v3/openapi.json -o src/api-v3.ts

# Use in your code
import createClient from 'openapi-fetch'
import type { paths } from './api-v3'

const client = createClient<paths>({
  baseUrl: 'https://api.oooefam.net'
})

// Search by ISBN
const { data, error } = await client.GET('/v3/books/{isbn}', {
  params: { path: { isbn: '9780439708180' } }
})
```

### Option 2: Use Fetch Directly

```typescript
const response = await fetch('https://api.oooefam.net/v3/books/9780439708180')
const data = await response.json()

if (response.ok) {
  console.log('Book:', data.data)
} else {
  console.error('Error:', data.error)
}
```

### Option 3: Wait for npm Package (Coming Soon)

We're working on an updated npm package that includes V3 endpoints. Check back soon!

---

## Response Format

V3 uses the same `ResponseEnvelope` format as V2:

**Success:**
```json
{
  "success": true,
  "data": {
    "isbn": "9780439708180",
    "title": "Harry Potter and the Sorcerer's Stone",
    "authors": ["J.K. Rowling"],
    "publisher": "Scholastic",
    "publishedDate": "1998-09-01",
    "pageCount": 309,
    "coverUrl": "https://...",
    "description": "...",
    "subjects": ["Fantasy", "Magic"],
    "language": "en"
  },
  "metadata": {
    "source": "alexandria",
    "cached": true,
    "timestamp": "2025-12-04T12:00:00Z",
    "requestId": "req_abc123"
  }
}
```

**Error (RFC 9457):**
```json
{
  "success": false,
  "error": {
    "type": "https://api.oooefam.net/problems/not-found",
    "title": "Book Not Found",
    "status": 404,
    "detail": "No book found with ISBN 9999999999",
    "instance": "/v3/books/9999999999",
    "requestId": "req_xyz789"
  }
}
```

---

## Key Differences from V1/V2

### 1. ISBN Lookup (Path Param)

**V1/V2:**
```typescript
GET /v1/search/isbn?isbn=9780439708180
```

**V3:**
```typescript
GET /v3/books/9780439708180
```

### 2. Batch Enrichment (Array in Body)

**V2:**
```typescript
POST /api/v2/books/enrich
Body: { isbn: "9780439708180", includeEmbedding: true }
```

**V3:**
```typescript
POST /v3/books/enrich
Body: {
  books: ["9780439708180", "9780141439518"],
  includeEmbedding: true
}
```

### 3. Error Handling (RFC 9457)

**V1/V2:**
```typescript
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "Book not found",
    statusCode: 404
  }
}
```

**V3:**
```typescript
{
  success: false,
  error: {
    type: "https://api.oooefam.net/problems/not-found",
    title: "Book Not Found",
    status: 404,
    detail: "No book found with ISBN 9999999999",
    instance: "/v3/books/9999999999"
  }
}
```

### 4. Rate Limiting (New Headers)

V3 includes rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1638360000
X-Request-ID: req_abc123
```

---

## Migration Checklist

- [ ] Review V3 OpenAPI spec at https://api.oooefam.net/v3/docs
- [ ] Test V3 endpoints with your use cases
- [ ] Update ISBN lookups from query param to path param
- [ ] Handle RFC 9457 error format
- [ ] Use rate limit headers for client-side throttling
- [ ] Store `X-Request-ID` for debugging/support
- [ ] Migrate batch enrichment to array format (if used)
- [ ] Update to V3 before March 1, 2026 (V1 sunset)

---

## Timeline

| Date | Event |
|------|-------|
| Dec 3, 2025 | V3 live in production |
| **Dec 4, 2025** | **This migration guide published** |
| Jan 2026 | V1 deprecation warnings intensify |
| Feb 2026 | Final 30-day warning for V1 sunset |
| **Mar 1, 2026** | **V1 endpoints removed** |
| TBD (90 days after V3 GA) | V2 sunset date announced |

---

## Questions?

**API Status:** https://api.oooefam.net/health
**OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
**Interactive Docs:** https://api.oooefam.net/v3/docs
**Issues:** https://github.com/jukasdrj/bendv3/issues
**Maintainer:** @jukasdrj

---

**Last Updated:** December 4, 2025
