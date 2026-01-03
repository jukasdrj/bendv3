# V2 → V3 Migration Guide

**Migration Status:** Complete
**V2 Sunset Date:** March 1, 2026
**V2 Removal Date:** March 2026
**Recommended Migration Window:** Completed by February 2026

---

## Quick Migration Checklist

- [ ] Review breaking changes below
- [ ] Update base URL paths (`/api/v2` → `/v3`)
- [ ] Install updated types (`@bookstrack/schemas@latest`)
- [ ] Update response handling (new envelope format)
- [ ] Update error handling (RFC 9457 format)
- [ ] Migrate WebSocket to SSE for progress monitoring
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Breaking Changes Summary

### 1. URL Path Changes

**V2 (Old):**
```
GET /api/v2/search?query=harry
POST /api/v2/books/enrich
GET /api/v2/imports/:id/stream
```

**V3 (New):**
```
GET /v3/books/search?q=harry
POST /v3/books/enrich
GET /v3/jobs/imports/:id/stream
```

**Migration Table:**

| V2 Endpoint | V3 Endpoint | Notes |
|-------------|-------------|-------|
| `GET /api/v2/search` | `GET /v3/books/search` | Query param: `query` → `q` |
| `POST /api/v2/books/enrich` | `POST /v3/books/enrich` | Same body format |
| `POST /api/v2/imports` | `POST /v3/jobs/imports` | Returns job object |
| `GET /api/v2/imports/:id/stream` | `GET /v3/jobs/imports/:id/stream` | SSE format |
| N/A | `POST /v3/jobs/scans` | New: bookshelf scanning |
| N/A | `GET /v3/capabilities` | New: API discovery |

---

### 2. Response Format Changes

**V2 Response:**
```json
{
  "success": true,
  "results": [
    {
      "isbn": "9780439708180",
      "title": "Harry Potter"
    }
  ],
  "metadata": {
    "timestamp": "2025-12-01T..."
  }
}
```

**V3 Response:**
```json
{
  "success": true,
  "data": {
    "books": [
      {
        "isbn": "9780439708180",
        "title": "Harry Potter"
      }
    ],
    "total": 1,
    "pagination": {
      "page": 1,
      "limit": 20,
      "hasNext": false,
      "hasPrev": false
    }
  },
  "metadata": {
    "timestamp": "2025-12-01T...",
    "requestId": "req_123",
    "processingTimeMs": 145,
    "source": "alexandria",
    "cached": true
  }
}
```

**Key Changes:**
- `results` → `data.books`
- New `pagination` object with `hasNext`/`hasPrev`
- Enhanced `metadata` with `requestId`, `processingTimeMs`, `source`, `cached`

---

### 3. Error Format Changes (RFC 9457)

**V2 Error:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Book not found"
  }
}
```

**V3 Error (RFC 9457 Problem Details):**
```json
{
  "type": "https://api.oooefam.net/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "No books found for ISBN 9780000000000",
  "instance": "/v3/books/9780000000000",
  "requestId": "req_456",
  "timestamp": "2025-12-01T...",
  "code": "NOT_FOUND",
  "retryable": false
}
```

**Key Changes:**
- No `success` field in error responses
- New `type`, `title`, `instance` fields (RFC 9457)
- Added `retryable` flag for client retry logic

---

### 4. Progress Monitoring: WebSocket → SSE

**V2 (WebSocket):**
```javascript
const ws = new WebSocket('wss://api.oooefam.net/ws/progress?jobId=123')
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log(data.progress)
}
```

**V3 (Server-Sent Events):**
```javascript
const eventSource = new EventSource(
  'https://api.oooefam.net/v3/jobs/imports/123/stream?token=abc...'
)

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data)
  console.log(data.progress)
})

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data)
  console.log(data.books)
  eventSource.close()
})

eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data)
  console.error(data.error)
  eventSource.close()
})
```

**Why SSE?**
- Auto-reconnection built-in
- Simpler API (no ping/pong)
- Better browser support
- Lower memory footprint

---

## Code Migration Examples

### TypeScript/JavaScript

**Before (V2):**
```typescript
// Search
const response = await fetch('/api/v2/search?query=harry')
const json = await response.json()
const books = json.results

// Error handling
if (!json.success) {
  console.error(json.error.message)
}

// WebSocket progress
const ws = new WebSocket('wss://api.oooefam.net/ws/progress?jobId=123')
ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  updateProgress(data.progress)
}
```

**After (V3):**
```typescript
// Search
const response = await fetch('/v3/books/search?q=harry')
const json = await response.json()
const books = json.data.books

// Error handling (RFC 9457)
if (!response.ok) {
  const error = await response.json()
  console.error(`${error.title}: ${error.detail}`)
  if (error.retryable) {
    // Implement retry logic
  }
}

// SSE progress
const eventSource = new EventSource('/v3/jobs/imports/123/stream?token=abc...')
eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data)
  updateProgress(data.progress)
})
```

---

### iOS/Swift

**Before (V2):**
```swift
// Search
let url = URL(string: "https://api.oooefam.net/api/v2/search?query=harry")!
let (data, _) = try await URLSession.shared.data(from: url)

struct V2Response: Codable {
    let success: Bool
    let results: [Book]
}

let response = try JSONDecoder().decode(V2Response.self, from: data)
let books = response.results
```

**After (V3):**
```swift
// Search
let url = URL(string: "https://api.oooefam.net/v3/books/search?q=harry")!
let (data, _) = try await URLSession.shared.data(from: url)

struct V3Response: Codable {
    let success: Bool
    let data: SearchData
    let metadata: Metadata

    struct SearchData: Codable {
        let books: [Book]
        let total: Int
        let pagination: Pagination
    }
}

let response = try JSONDecoder().decode(V3Response.self, from: data)
let books = response.data.books
```

---

## Testing Your Migration

### Parallel Testing

Run V2 and V3 side-by-side to verify equivalence:

```typescript
const v2Response = await fetch('/api/v2/search?query=harry')
const v3Response = await fetch('/v3/books/search?q=harry')

const v2Books = (await v2Response.json()).results
const v3Books = (await v3Response.json()).data.books

console.assert(v2Books.length === v3Books.length, 'Count mismatch!')
```

### Feature Flag Rollout

```typescript
const USE_V3 = process.env.USE_V3_API === 'true'

const endpoint = USE_V3
  ? '/v3/books/search?q='
  : '/api/v2/search?query='

const response = await fetch(endpoint + query)
```

### Integration Tests

```typescript
describe('V3 Migration', () => {
  it('should return same books as V2', async () => {
    const v2 = await searchV2('harry potter')
    const v3 = await searchV3('harry potter')

    expect(v3.data.books).toEqual(v2.results)
  })

  it('should handle errors with RFC 9457', async () => {
    const response = await fetch('/v3/books/invalid')
    const error = await response.json()

    expect(error.type).toBeDefined()
    expect(error.title).toBeDefined()
    expect(error.status).toBe(400)
  })
})
```

---

## Migration Timeline

| Phase | Dates | Actions |
|-------|-------|---------|
| **Planning** | Dec 2025 | Review breaking changes, plan migration |
| **Development** | Dec 2025 - Jan 2026 | Update code, install new types |
| **Testing** | Jan 2026 | Staging environment testing |
| **Deployment** | Jan - Feb 2026 | Gradual rollout with feature flags |
| **V2 Deprecation** | Sept 2025 - March 2026 | Warning period |
| **V2 Removal** | March 1, 2026 | V2 endpoints return 410 Gone |

---

## Common Issues & Solutions

### Issue: "Field 'results' not found"

**Cause:** V3 renamed `results` to `data.books`

**Solution:**
```diff
- const books = response.results
+ const books = response.data.books
```

### Issue: "Error object has no 'message' property"

**Cause:** V3 uses RFC 9457 error format

**Solution:**
```diff
- console.error(error.error.message)
+ console.error(`${error.title}: ${error.detail}`)
```

### Issue: "WebSocket not receiving progress"

**Cause:** V3 uses SSE instead of WebSocket

**Solution:**
```diff
- const ws = new WebSocket('wss://...')
+ const eventSource = new EventSource('https://...')
```

---

## Need Help?

- **Documentation:** https://api.oooefam.net/v3/docs
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **GitHub Issues:** Report bugs or ask questions
- **Support:** Contact backend team

---

**Last Updated:** January 3, 2026
**V2 Sunset:** March 1, 2026
**Migration Support:** Available until February 2026
