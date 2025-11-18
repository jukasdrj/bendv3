# Hono Router - API Routes Documentation

**Phase 1 MVP Routes**
**Last Updated:** November 17, 2025

This document describes the 4 routes implemented in the Hono router MVP (`src/router.ts`). All routes are accessible when the feature flag `ENABLE_HONO_ROUTER=true` is set.

---

## Overview

| Route | Method | Purpose | Status | Dependencies |
|-------|--------|---------|--------|--------------|
| `/health` | GET | Health check | ✅ Implemented | None |
| `/v1/search/isbn` | GET | ISBN book search | ✅ Implemented | KV Cache, Google Books API, Gemini AI |
| `/metrics` | GET | Performance metrics | ✅ Implemented | Analytics Engine |
| `/ws/progress` | GET | WebSocket upgrade | ✅ Implemented | Durable Object (ProgressWebSocketDO) |

---

## Route Details

### 1. GET /health

**Purpose:** Baseline health check to verify the router is operational.

**Request:**
```http
GET /health HTTP/1.1
Host: api.oooefam.net
```

**Response:**
```json
{
  "status": "ok",
  "worker": "api-worker",
  "version": "2.1.0",
  "router": "hono",
  "timestamp": "2025-11-17T12:00:00.000Z"
}
```

**Headers:**
- `X-Router: hono` - Identifies Hono router for A/B testing
- `X-Response-Time: 5ms` - Response time in milliseconds
- `Access-Control-Allow-Origin: *` - CORS headers

**Status Codes:**
- `200 OK` - Router is healthy

**Implementation:**
- Location: `src/router.ts:40-48`
- Handler: Inline (no external handler)
- Complexity: O(1) - Static response

**Use Cases:**
- Load balancer health checks
- Monitoring/alerting systems
- A/B test baseline (minimal dependencies)

---

### 2. GET /v1/search/isbn

**Purpose:** Search for books by ISBN with canonical response format.

**Request:**
```http
GET /v1/search/isbn?isbn=9780439708180 HTTP/1.1
Host: api.oooefam.net
```

**Query Parameters:**
- `isbn` (required): ISBN-10 or ISBN-13 (with or without hyphens)

**Response (Success):**
```json
{
  "data": {
    "works": [{
      "id": "OL82537W",
      "title": "Harry Potter and the Philosopher's Stone",
      "primaryProvider": "google_books",
      "coverImageURL": "https://...",
      "publicationYear": 1997
    }],
    "editions": [{
      "isbn13": "9780439708180",
      "isbn10": "043970818X",
      "coverURL": "https://...",
      "publisher": "Scholastic"
    }],
    "authors": [{
      "id": "OL23919A",
      "name": "J.K. Rowling",
      "birthYear": 1965,
      "nationality": "British"
    }]
  },
  "metadata": {
    "processingTime": 342,
    "provider": "google_books",
    "cached": false
  }
}
```

**Response (Not Found):**
```json
{
  "data": {
    "works": [],
    "editions": [],
    "authors": []
  },
  "metadata": {
    "processingTime": 156,
    "provider": "none",
    "cached": false
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "code": "INVALID_ISBN",
    "message": "Invalid ISBN format. Must be valid ISBN-10 or ISBN-13",
    "statusCode": 400
  }
}
```

**Headers:**
- `X-Router: hono`
- `X-Response-Time: 342ms`
- `Access-Control-Allow-Origin: *`

**Status Codes:**
- `200 OK` - Book found or valid search (may return empty results)
- `400 Bad Request` - Missing or invalid ISBN
- `500 Internal Server Error` - API failure

**Implementation:**
- Location: `src/router.ts:54-70`
- Handler: `src/handlers/v1/search-isbn.ts:handleSearchISBN()`
- Service: `src/services/enrichment.ts:enrichMultipleBooks()`
- Providers: Google Books API, OpenLibrary, ISBNdb
- Cache: KV Cache (24h TTL)

**Performance:**
- Cached: ~50ms (KV lookup)
- Uncached: ~200-500ms (external API + enrichment)

**Use Cases:**
- Mobile app barcode scanner
- ISBN validation
- Book metadata lookup
- Full-stack integration testing

---

### 3. GET /metrics

**Purpose:** Retrieve aggregated performance metrics for the API worker.

**Request:**
```http
GET /metrics HTTP/1.1
Host: api.oooefam.net
```

**Response:**
```json
{
  "metrics": {
    "requests_total": 12543,
    "cache_hit_rate": 0.78,
    "avg_response_time_ms": 124,
    "error_rate": 0.02,
    "uptime_seconds": 86400
  },
  "timestamp": "2025-11-17T12:00:00.000Z"
}
```

**Headers:**
- `X-Router: hono`
- `X-Response-Time: 12ms`
- `Access-Control-Allow-Origin: *`

**Status Codes:**
- `200 OK` - Metrics retrieved successfully

**Implementation:**
- Location: `src/router.ts:76-80`
- Handler: `src/handlers/metrics-handler.js:handleMetricsRequest()`
- Data Source: Analytics Engine datasets

**Use Cases:**
- Internal dashboards
- Performance monitoring
- A/B test analytics integration

---

### 4. GET /ws/progress

**Purpose:** Upgrade HTTP connection to WebSocket for real-time job progress updates.

**Request:**
```http
GET /ws/progress?jobId=scan-abc123 HTTP/1.1
Host: api.oooefam.net
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

**Query Parameters:**
- `jobId` (required): Unique job identifier (UUID or custom ID)

**Response (Upgrade):**
```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

**WebSocket Messages (Server → Client):**
```json
{
  "type": "progress",
  "jobId": "scan-abc123",
  "progress": 50,
  "total": 100,
  "message": "Processing batch 5 of 10",
  "timestamp": "2025-11-17T12:00:05.000Z"
}
```

**Response (Error - Missing jobId):**
```json
{
  "error": {
    "code": "MISSING_PARAM",
    "message": "Missing jobId parameter",
    "statusCode": 400
  }
}
```

**Response (Error - Not WebSocket):**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Expected WebSocket upgrade",
    "statusCode": 426
  }
}
```

**Headers (Error Responses):**
- `X-Router: hono`
- `Access-Control-Allow-Origin: *`

**Status Codes:**
- `101 Switching Protocols` - WebSocket upgrade successful
- `400 Bad Request` - Missing `jobId` parameter
- `426 Upgrade Required` - Missing `Upgrade: websocket` header

**Implementation:**
- Location: `src/router.ts:86-114`
- Durable Object: `src/durable-objects/progress-socket.js:ProgressWebSocketDO`
- Forwarding: `getProgressDOStub(jobId, env).fetch(request)`

**WebSocket Lifecycle:**
1. Client sends HTTP GET with `Upgrade: websocket` header
2. Hono router validates `jobId` and upgrade header
3. Request forwarded to Durable Object (one instance per `jobId`)
4. Durable Object accepts WebSocket and manages connection lifecycle
5. Progress updates sent via `webSocketMessage` handler

**Use Cases:**
- Batch enrichment jobs
- Bookshelf AI scanning
- CSV import progress
- Long-running operations (>30s)

---

## Global Middleware

All routes are wrapped with the following middleware (in order):

### 1. Analytics Middleware
- **Location:** `src/middleware/hono-analytics.ts`
- **Adds Headers:** `X-Router: hono`, `X-Response-Time: Xms`
- **Logging:** Conditional structured logging (if `ENABLE_PERFORMANCE_LOGGING=true`)

### 2. CORS Middleware
- **Built-in:** Hono's `cors()` middleware
- **Configuration:**
  - `origin: *` (permissive for iOS app)
  - `allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE']`
  - `allowHeaders: ['Content-Type', 'Authorization']`
  - `exposeHeaders: ['X-Router', 'X-Response-Time']`
  - `maxAge: 86400` (24 hours)

---

## Error Handling

### Global 404 Handler
**Location:** `src/router.ts:111-118`

**Response:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found: GET /unknown-route"
  }
}
```

**Status Code:** `404 Not Found`

### Global Error Handler
**Location:** `src/router.ts:124-150`

**Response:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "details": "TypeError: Cannot read property 'x' of undefined"
  }
}
```

**Status Code:** `500 Internal Server Error`

**Analytics Integration:**
- Errors logged asynchronously to `PERFORMANCE_ANALYTICS` dataset
- Includes: error message, route path, HTTP method
- Non-blocking (uses `c.executionCtx.waitUntil()`)

---

## A/B Testing Headers

All Hono responses include these headers for comparison with manual routing:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Router` | `hono` | Identifies router for A/B testing |
| `X-Response-Time` | `123ms` | Response time for performance comparison |

**Manual router responses:**
- Do NOT include `X-Router` header (or set to `manual`)
- Use `X-Response-Time` from `addAnalyticsHeaders()` utility

**Querying Analytics:**
```sql
-- Compare avg response times
SELECT
  router,
  AVG(responseTime) as avg_ms
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY router
```

---

## Testing

**Test File:** `tests/hono-router.test.js`

**Coverage:**
- ✅ Feature flag toggle (manual vs Hono)
- ✅ All 4 route responses
- ✅ CORS preflight handling
- ✅ Analytics headers presence
- ✅ Performance benchmarks (100 iterations)
- ✅ WebSocket upgrade validation
- ✅ Error path testing (404, 500, 426)
- ✅ Response consistency between routers

**Run Tests:**
```bash
npm test tests/hono-router.test.js
```

---

## Performance Benchmarks

**Expected Results (100 iterations):**

| Metric | Manual Router | Hono Router | Improvement |
|--------|---------------|-------------|-------------|
| Avg Response Time | 18-25ms | 8-15ms | ~40-50% faster |
| Min Response Time | 5ms | 3ms | 40% faster |
| Max Response Time | 50ms | 30ms | 40% faster |

**Note:** These are routing-only benchmarks (using `/health` endpoint). Real-world routes with KV cache or external APIs will show smaller percentage improvements due to handler overhead dominating total response time.

---

## Migration Checklist

When migrating a route from manual to Hono:

- [ ] Identify route in `src/index.js` (e.g., `if (url.pathname === '/foo')`)
- [ ] Extract query parameters (e.g., `url.searchParams.get('bar')`)
- [ ] Identify handler function (e.g., `handleFoo(params, env, request)`)
- [ ] Add route to `src/router.ts` with appropriate HTTP method
- [ ] Use Hono context: `c.req.query('bar')`, `c.env`, `c.req.raw`
- [ ] Test with feature flag enabled/disabled
- [ ] Verify identical responses in both routers
- [ ] Update this documentation with new route details

---

## References

- **Hono Documentation:** https://hono.dev/
- **Cloudflare Workers Routing:** https://developers.cloudflare.com/workers/runtime-apis/request/
- **Issue #173:** https://github.com/jukasdrj/bookstrack-backend/issues/173
- **API Contract:** `docs/API_CONTRACT.md`

---

**Maintained By:** AI Team (Claude Code, Grok-4)
**Human Owner:** @jukasdrj
