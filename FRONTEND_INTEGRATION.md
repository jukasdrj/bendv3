# BooksTrack API - Frontend Integration Guide

**Last Updated:** December 5, 2025
**API Version:** 4.0.0
**Production URL:** https://api.oooefam.net

> Quick reference for frontend teams integrating with the BooksTrack API

---

## 🚀 Quick Start

### 1. API Base URL

```typescript
const API_BASE = 'https://api.oooefam.net'
```

### 2. Health Check

```bash
curl https://api.oooefam.net/health
```

**Response:**
```json
{
  "data": {
    "status": "ok",
    "worker": "api-worker",
    "version": "2.1.0"
  },
  "metadata": {
    "timestamp": "2025-12-05T17:30:21Z"
  }
}
```

### 3. No Authentication Required

All endpoints are public and rate-limited by IP. No API keys needed.

---

## 📖 API Documentation

### Interactive Documentation

**V3 API (Current - Recommended):**
- **Swagger UI:** https://api.oooefam.net/v3/docs - Interactive API explorer
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json - Auto-generated from Zod schemas
- **Response Envelope:** Documented below (see "Response Format" section)
- ⚠️ **Note:** Schema definitions in OpenAPI spec are currently incomplete - refer to the "Response Format" section for accurate envelope structure

**V2 API (Stable):**
- **OpenAPI Spec:** [`docs/openapi.yaml`](docs/openapi.yaml) - Hand-maintained, complete schemas
- **Status:** Maintained until V3 GA (TBD)

**V1 API:**
- ⚠️ **Deprecated** - Sunset March 1, 2026

---

## 🔑 Key Endpoints

### V3 API (Recommended)

```typescript
// Get book by ISBN
GET /v3/books/:isbn
GET /v3/books/9780439708180

// Search books
GET /v3/books/search?q=harry+potter&limit=20

// Enrich book metadata
POST /v3/books/enrich
Body: { isbn: "9780439708180", generateEmbedding: false }
```

### V2 API (Stable)

```typescript
// Unified search (supports text, semantic, hybrid modes)
GET /api/v2/search?q=query&mode=text&limit=20

// Single book enrichment
POST /api/v2/books/enrich
Body: { isbn: "9780439708180" }

// CSV import with SSE streaming
POST /api/v2/imports
Body: FormData with 'file' field

// SSE progress stream
GET /api/v2/imports/:id/stream
```

---

## 📦 Response Format

### V3 API Response Envelope

All V3 endpoints use a **discriminated union** with `success` field:

**Success Response:**
```typescript
{
  "success": true,  // Discriminator - always present
  "data": {
    // Your data here (book object, search results, etc.)
  },
  "metadata": {
    "timestamp": "2025-12-05T17:30:21Z",
    "requestId": "123e4567-e89b-12d3-a456-426614174000",  // X-Request-ID
    "source": "alexandria",  // Data provider
    "cached": true,
    "processingTimeMs": 45
  }
}
```

**Error Response (RFC 9457 Problem Details):**
```typescript
{
  "success": false,  // Discriminator
  "type": "about:blank",  // URI identifying error type
  "title": "Not Found",
  "status": 404,
  "detail": "Book with ISBN 9780000000000 not found",
  "code": "NOT_FOUND",  // Machine-readable code
  "retryable": false,
  "metadata": {
    "timestamp": "2025-12-05T17:30:21Z",
    "requestId": "123e4567-e89b-12d3-a456-426614174000"
  }
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

### V2 API Response Envelope

V2 endpoints use a different structure (deprecated pattern):

**Success:**
```typescript
{
  "data": { /* book or result data */ },
  "metadata": {
    "timestamp": "2025-12-05T17:30:21Z",
    "source": "google_books",
    "cached": true
  },
  "error": null
}
```

**Error:**
```typescript
{
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Book not found",
    "statusCode": 404,
    "retryable": false
  },
  "metadata": { "timestamp": "2025-12-05T17:30:21Z" }
}
```

### Book Object Schema

```typescript
interface Book {
  isbn: string
  title: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  coverImage?: string
  language?: string
  workId?: string  // OpenLibrary work ID for enrichment
}
```

---

## 🛡️ Error Handling

### Common Error Codes

| Code | Status | Description | Retryable |
|------|--------|-------------|-----------|
| `NOT_FOUND` | 404 | Resource not found | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Yes (after delay) |
| `CIRCUIT_OPEN` | 503 | External provider down | Yes (after 60s) |
| `API_ERROR` | 502 | External API failure | Yes |
| `VALIDATION_ERROR` | 400 | Invalid request | No |
| `INTERNAL_ERROR` | 500 | Server error | Maybe |

### Retry Logic

**V3 API (using `success` discriminator):**
```typescript
async function fetchV3WithRetry(url: string, options = {}) {
  const response = await fetch(url, options)
  const json = await response.json()

  if (!json.success) {
    // Error response
    if (json.code === 'CIRCUIT_OPEN') {
      throw new Error('Service unavailable, try again in 60 seconds')
    }

    if (json.retryable && json.retryAfterMs) {
      await new Promise(resolve => setTimeout(resolve, json.retryAfterMs))
      return fetchV3WithRetry(url, options)
    }

    throw new Error(json.title || json.detail)
  }

  return json.data  // Success - return just the data
}
```

**V2 API (using `error` field):**
```typescript
async function fetchV2WithRetry(url: string, options = {}) {
  const response = await fetch(url, options)
  const { data, error } = await response.json()

  if (error) {
    if (error.code === 'CIRCUIT_OPEN') {
      throw new Error('Service unavailable, try again in 60 seconds')
    }

    if (error.retryable && error.retryAfterMs) {
      await new Promise(resolve => setTimeout(resolve, error.retryAfterMs))
      return fetchV2WithRetry(url, options)
    }

    throw new Error(error.message)
  }

  return data
}
```

---

## 🔄 Real-Time Progress (SSE)

For long-running operations like CSV imports:

```typescript
// 1. Start import job
const formData = new FormData()
formData.append('file', csvFile)

const response = await fetch('https://api.oooefam.net/api/v2/imports', {
  method: 'POST',
  body: formData
})
const { data } = await response.json()
const importId = data.id

// 2. Connect to SSE stream
const eventSource = new EventSource(
  `https://api.oooefam.net/api/v2/imports/${importId}/stream`
)

eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data)

  console.log(`Progress: ${progress.progress}%`)
  console.log(`Status: ${progress.status}`)

  if (progress.status === 'completed') {
    console.log('Books:', progress.books)  // Final results
    eventSource.close()
  }
}

eventSource.onerror = () => {
  console.error('SSE connection failed, falling back to polling')
  eventSource.close()
  // Fall back to polling: GET /api/v2/imports/:id
}
```

---

## 🌐 CORS Configuration

**Allowed Origins:**
- `https://bookstrack.oooefam.net` (production frontend)
- `capacitor://localhost` (iOS app)
- `http://localhost:*` (local development)

**Need to add an origin?** Open an issue in the backend repo.

---

## 🚦 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Search endpoints | 100 req | 1 minute |
| Enrichment | 30 req | 1 minute |
| CSV imports | 10 req | 1 minute |
| Global | 1000 req | 1 hour |

Rate limits are per IP address. Use the `X-RateLimit-*` headers for tracking.

---

## 📊 Performance

**Expected Response Times:**

| Operation | Cached | Uncached |
|-----------|--------|----------|
| Book lookup (ISBN) | <50ms | <500ms |
| Search | <100ms | <800ms |
| Enrichment | <200ms | <1200ms |

**Cache hit ratio:** ~73% (continuously improving)

---

## 🧪 Testing

### Local Development

```bash
# Point to local backend
const API_BASE = 'http://localhost:8787'

# Start backend locally (in backend repo)
cd bendv3
npm run dev
```

### Production Testing

```bash
# Test search
curl "https://api.oooefam.net/v3/books/search?q=harry+potter&limit=5"

# Test ISBN lookup
curl "https://api.oooefam.net/v3/books/9780439708180"

# Test health
curl "https://api.oooefam.net/health"
```

---

## 📚 Additional Resources

**Documentation:**
- [Full API Specification](docs/openapi.yaml) - OpenAPI 3.1 spec
- [Architecture Overview](ARCHITECTURE_OVERVIEW.md) - System design
- [V3 Migration Guide](docs/V3_MIGRATION_COMPLETE.md) - V2 → V3 migration

**Interactive Docs:**
- V3 Swagger UI: https://api.oooefam.net/v3/docs
- V3 OpenAPI JSON: https://api.oooefam.net/v3/openapi.json

**Support:**
- GitHub Issues: https://github.com/jukasdrj/bendv3/issues
- Repository: https://github.com/jukasdrj/bendv3

---

## 🎯 Best Practices

1. **Always check `data.error` before accessing `data.data`**
2. **Implement exponential backoff for retryable errors**
3. **Use SSE for real-time progress (falls back gracefully)**
4. **Cache responses client-side (5-10 minutes)**
5. **Monitor `metadata.cached` for debugging cache issues**
6. **Use V3 endpoints for new features** (V2 will sunset eventually)

---

## 📞 Getting Help

**API Issues:**
- Check https://api.oooefam.net/health for system status
- Review error codes in response
- Open GitHub issue with request/response details

**Integration Questions:**
- See interactive docs at /v3/docs
- Check openapi.yaml for contract details
- Contact: @jukasdrj

---

**Production Status:** ✅ Stable
**Uptime:** 99.9%+
**Error Rate:** <0.1%
**Avg Response Time:** 145ms (P95)
