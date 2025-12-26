# BooksTrack API - Frontend Integration Guide

**Date**: December 6, 2025
**Status**: ✅ Production Ready
**Base URL**: `https://api.oooefam.net`

---

## Quick Start

### 1. Get TypeScript Types (Recommended)

```bash
# Install the shared schema package (contains all V3 types)
npm install @bookstrack/schemas

# Or generate types from OpenAPI spec
npx openapi-typescript https://api.oooefam.net/v3/openapi.json -o src/types/api.ts
```

### 2. Test in Swagger UI
👉 **Interactive API Explorer**: https://api.oooefam.net/v3/docs

### 3. Health Check

```bash
curl https://api.oooefam.net/health
```

**Response:**
```json
{
  "data": {
    "status": "ok",
    "worker": "api-worker",
    "version": "3.0.0"
  },
  "metadata": {
    "timestamp": "2025-12-09T17:30:21Z"
  }
}
```

### 4. No Authentication Required

All endpoints are public and rate-limited by IP. No API keys needed.

---

## V2 → V3 Migration Map

| Feature | V2 Endpoint | V3 Endpoint |
|---------|-------------|-------------|
| Search books | `GET /api/v2/search` | `GET /v3/books/search` |
| Enrich ISBNs (small batch) | `POST /api/v2/books/enrich` | `POST /v3/books/enrich` |
| Enrich ISBNs (large batch) | N/A | `POST /v3/books/enrich` (with `async: true`) |
| CSV import | `POST /api/v2/imports` | `POST /v3/jobs/imports` |
| CSV progress | `GET /api/v2/imports/:id/stream` (SSE) | `GET /v3/jobs/imports/:id/stream` (SSE) |
| Bookshelf scan | N/A (new feature) | `POST /v3/jobs/scans` |

---

## Core Endpoints

### 1. Search Books

```typescript
GET /v3/books/search?q={query}&page=1&limit=20

Response:
{
  "success": true,
  "data": {
    "books": [
      {
        "isbn": "9780439708180",
        "title": "Harry Potter and the Sorcerer's Stone",
        "authors": ["J.K. Rowling"],
        "coverUrl": "https://...",
        "publisher": "Scholastic",
        "publishedDate": "1998-09-01",
        "pageCount": 309,
        "description": "...",
        "categories": ["Fiction", "Fantasy"],
        "provider": "alexandria",
        "quality": 95
      }
    ],
    "total": 100,
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "metadata": {
    "timestamp": "2025-12-06T...",
    "requestId": "req_abc123",
    "processingTimeMs": 145
  }
}
```

**TypeScript:**
```typescript
import type { SearchResponseSchema } from '@bookstrack/schemas'

const response = await fetch('/v3/books/search?q=harry+potter')
const data: SearchResponseSchema = await response.json()
```

---

### 2. Enrich Books (Sync Mode - Small Batches ≤50)

```typescript
POST /v3/books/enrich
Content-Type: application/json

{
  "isbns": ["9780439708180", "9780545010221"],
  "includeEmbedding": false  // Optional: generate embeddings for semantic search
}

Response (200 OK):
{
  "success": true,
  "data": {
    "books": [...],  // Same structure as search results
    "requested": 2,
    "found": 2,
    "notFound": []   // ISBNs that weren't found
  },
  "metadata": {
    "timestamp": "2025-12-06T...",
    "requestId": "req_xyz789",
    "processingTimeMs": 850
  }
}
```

**TypeScript:**
```typescript
import type { EnrichRequestSchema, EnrichResponseSchema } from '@bookstrack/schemas'

const request: EnrichRequestSchema = {
  isbns: ["9780439708180"],
  includeEmbedding: false
}

const response = await fetch('/v3/books/enrich', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request)
})

const data: EnrichResponseSchema = await response.json()
```

---

### 3. Enrich Books (Async Mode - Large Batches 51-500)

```typescript
POST /v3/books/enrich
Content-Type: application/json

{
  "isbns": ["978...", "978...", ...],  // 51-500 ISBNs
  "async": true,                        // 👈 Triggers async mode
  "includeEmbedding": false
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "streamUrl": "https://api.oooefam.net/v3/jobs/enrichment/550e8400.../stream",
    "token": "auth_token_here"  // 👈 Save this for progress monitoring
  },
  "_links": {
    "self": { "href": "/v3/jobs/enrichment/550e8400...", "method": "GET" },
    "stream": { "href": "/v3/jobs/enrichment/550e8400.../stream", "method": "GET" },
    "results": { "href": "/v3/jobs/enrichment/550e8400.../results", "method": "GET" },
    "cancel": { "href": "/v3/jobs/enrichment/550e8400...", "method": "DELETE" }
  }
}
```

**Monitor Progress (SSE):**
```typescript
const eventSource = new EventSource(
  `${streamUrl}?token=${encodeURIComponent(token)}`
)

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data)
  console.log(`Progress: ${data.progress * 100}% (${data.processedCount}/${data.totalCount})`)
})

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data)
  console.log('Books:', data.books)  // Array of enriched books
  eventSource.close()
})

eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data)
  console.error('Error:', data.error)
  eventSource.close()
})
```

---

### 4. CSV Import

```typescript
POST /v3/jobs/imports
Content-Type: multipart/form-data

file=@books.csv

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "csv_job_123",
    "status": "queued",
    "streamUrl": "https://api.oooefam.net/v3/jobs/imports/csv_job_123/stream",
    "token": "auth_token"
  },
  "_links": { ... }
}
```

**JavaScript:**
```javascript
const formData = new FormData()
formData.append('file', fileInput.files[0])

const response = await fetch('/v3/jobs/imports', {
  method: 'POST',
  body: formData
})

const { data } = await response.json()

// Monitor progress via SSE (same pattern as async enrichment)
const eventSource = new EventSource(
  `${data.streamUrl}?token=${encodeURIComponent(data.token)}`
)
```

---

### 5. Bookshelf Scan

```typescript
POST /v3/jobs/scans
Content-Type: multipart/form-data

photos[]=@shelf1.jpg
photos[]=@shelf2.jpg

Response (202 Accepted):
{
  "success": true,
  "data": {
    "jobId": "scan_job_456",
    "status": "queued",
    "streamUrl": "https://api.oooefam.net/v3/jobs/scans/scan_job_456/stream",
    "token": "auth_token"
  },
  "_links": { ... }
}
```

**JavaScript:**
```javascript
const formData = new FormData()
Array.from(imageInputs.files).forEach(file => {
  formData.append('photos[]', file)
})

const response = await fetch('/v3/jobs/scans', {
  method: 'POST',
  body: formData
})

// Monitor progress via SSE (same pattern)
```

**SSE Complete Event:**
```typescript
eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data)
  console.log('Detected books:', data.books)
  // Each book includes bounding box coordinates for UI highlighting
  data.books.forEach(book => {
    console.log(book.isbn, book.boundingBox)  // { x, y, width, height }
  })
})
```

---

## Message Structures

### Success Response (Standard)
```typescript
{
  "success": true,
  "data": { ... },              // Endpoint-specific data
  "metadata": {
    "timestamp": "2025-12-06T...",
    "requestId": "req_123",     // For debugging/support
    "processingTimeMs": 145,
    "source": "alexandria",     // Data provider
    "cached": true
  },
  "_links": { ... }             // Optional HATEOAS navigation links
}
```

### Error Response (RFC 9457 Problem Details)
```typescript
{
  "success": false,
  "type": "https://api.oooefam.net/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "No books found for ISBN 9780000000000",
  "instance": "/v3/books/9780000000000",
  "requestId": "req_456",
  "timestamp": "2025-12-06T...",
  "code": "NOT_FOUND",
  "retryable": false
}
```

### Job Response (Async Operations)
```typescript
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued" | "processing" | "completed" | "failed" | "canceled",
    "streamUrl": "https://...",
    "token": "auth_token"       // Required for SSE stream
  },
  "_links": {
    "self": { "href": "/v3/jobs/:type/:id", "method": "GET" },
    "stream": { "href": "/v3/jobs/:type/:id/stream", "method": "GET" },
    "results": { "href": "/v3/jobs/:type/:id/results", "method": "GET" },
    "cancel": { "href": "/v3/jobs/:type/:id", "method": "DELETE" }
  }
}
```

### SSE Events (Job Progress)
```typescript
// Event: progress
{
  "progress": 0.5,              // 0.0 to 1.0
  "processedCount": 50,
  "totalCount": 100,
  "message": "Processing batch 5 of 10"  // Optional human-readable status
}

// Event: complete
{
  "status": "completed",
  "books": [...],               // Array of enriched books
  "summary": {
    "total": 100,
    "found": 95,
    "notFound": 5
  }
}

// Event: error
{
  "status": "failed",
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Failed to process CSV",
    "details": { ... }
  }
}
```

---

## Error Handling

V3 uses **RFC 9457 Problem Details** for structured errors.

### Common Error Codes

| Code | Status | Description | Retryable |
|------|--------|-------------|-----------|
| `NOT_FOUND` | 404 | Resource not found | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Yes (after delay) |
| `CIRCUIT_OPEN` | 503 | External provider down | Yes (after 60s) |
| `API_ERROR` | 502 | External API failure | Yes |
| `VALIDATION_ERROR` | 400 | Invalid request | No |
| `INTERNAL_ERROR` | 500 | Server error | Maybe |

### Recommended Retry Logic

```typescript
async function fetchWithRetry(url: string, options = {}) {
  const response = await fetch(url, options)
  const json = await response.json()

  if (!json.success) {
    // Error response
    if (json.code === 'CIRCUIT_OPEN') {
      throw new Error('Service unavailable, try again in 60 seconds')
    }

    if (json.retryable && json.retryAfterMs) {
      await new Promise(resolve => setTimeout(resolve, json.retryAfterMs))
      return fetchWithRetry(url, options)
    }

    throw new Error(json.title || json.detail)
  }

  return json.data  // Success - return just the data
}
```

**TypeScript Type Guards:**

```typescript
const response = await fetch('/v3/books/9780439708180')
const json = await response.json()

if (json.success) {
  // TypeScript knows json.data exists
  console.log(json.data.title)
} else {
  // TypeScript knows json.code, json.title exist
  console.error(`${json.code}: ${json.title}`)
}
```

---

## Key Differences from V2

### 1. Response Format
- **V2**: `ResponseEnvelope` with `success` discriminator
- **V3**: Same success format, but errors use RFC 9457 Problem Details

### 2. Field Names
- `isbns` (preferred) or `barcodes` (iOS compatibility)
- Both work, but use `isbns` for consistency

### 3. Async Operations
- **V2**: WebSocket for progress
- **V3**: SSE (Server-Sent Events) - simpler, auto-reconnects

### 4. Pagination
- **V2**: `page`/`limit` (offset-based)
- **V3**: Same, but with `hasNext`/`hasPrev` convenience flags

### 5. Links
- **V3**: Includes `_links` for API discoverability (optional to use)

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Search endpoints | 100 req | 1 minute |
| Enrichment | 30 req | 1 minute |
| CSV imports | 10 req | 1 minute |
| Global | 1000 req | 1 hour |

Rate limits are per IP address. Use the `X-RateLimit-*` headers for tracking.

---

## Testing Checklist

- [ ] Test in Swagger UI: https://api.oooefam.net/v3/docs
- [ ] Install types: `npm install @bookstrack/schemas`
- [ ] Search endpoint: `GET /v3/books/search?q=test`
- [ ] Sync enrich: `POST /v3/books/enrich` (≤50 ISBNs)
- [ ] Async enrich: `POST /v3/books/enrich` (51-500 ISBNs, `async: true`)
- [ ] SSE monitoring: Connect to `streamUrl` with token
- [ ] Error handling: Test 404, 429 (rate limit), 500
- [ ] CSV import workflow
- [ ] Bookshelf scan workflow

---

## Support

**OpenAPI Spec**: https://api.oooefam.net/v3/openapi.json
**Swagger UI**: https://api.oooefam.net/v3/docs
**Schema Package**: `@bookstrack/schemas` (npm)

**Questions?** Check the interactive Swagger UI first - it has examples for every endpoint!

---

**Last Updated**: December 6, 2025
**Backend Team**: @jukasdrj
