# V1/V2 API Deprecation & V3 Migration Plan

**Status:** DRAFT - December 5, 2025
**Owner:** Backend Team
**Stakeholders:** iOS Team, Web Team, API Consumers

---

## Executive Summary

Frontend consumers are migrating to V3-only support. This document outlines the deprecation strategy for V1/V2 APIs, identifies feature gaps in V3, and provides a timeline for safe migration.

**Key Decisions:**
- V1 API: Already deprecated (sunset March 1, 2026) ✅
- V2 API: Deprecate after V3 feature parity achieved (90-day notice required)
- V3 API: Current focus - native @hono/zod-openapi with RFC 9457 error handling

---

## Current API Landscape

### V3 API (Current - December 2025)
**Status:** Production-ready, native @hono/zod-openapi
**Documentation:** `/v3/openapi.json` (auto-generated), `/v3/docs` (Swagger UI)
**Features:**
- ✅ Book search (GET `/v3/books/search`)
- ✅ ISBN lookup (GET `/v3/books/:isbn`)
- ✅ Batch enrichment (POST `/v3/books/enrich`)
- ❌ CSV import (MISSING)
- ❌ Bookshelf scanning (MISSING)
- ❌ Job management (MISSING)
- ❌ SSE streaming (MISSING)

**Strengths:**
- RFC 9457 Problem Details for errors
- Request correlation (X-Request-ID)
- Rate limit headers (X-RateLimit-*)
- HATEOAS links for discoverability
- ETag support for conditional requests
- Contract-first with shared Zod schemas (@bookstrack/schemas)

**Limitations:**
- No async workflow support (CSV import, batch scan)
- No progress streaming (SSE/WebSocket)
- No job lifecycle management

### V2 API (Stable - Maintained)
**Status:** Stable, manual OpenAPI spec
**Documentation:** `docs/openapi.yaml` (hand-maintained)
**Features:**
- ✅ Unified search (GET `/api/v2/search`)
- ✅ CSV import (POST `/api/v2/imports`)
- ✅ Job status polling (GET `/api/v2/imports/:id`)
- ✅ SSE streaming (GET `/api/v2/imports/:id/stream`)
- ✅ Book enrichment (POST `/api/v2/books/enrich`)
- ✅ Trending/recommendations (GET `/api/v2/trending/*`)

**Weaknesses:**
- Manual spec maintenance (drift risk)
- No native Hono OpenAPI support
- Mixed response formats (ResponseEnvelope vs. RFC 9457)

### V1 API (Deprecated - Sunset March 1, 2026)
**Status:** Deprecated with headers (RFC 8594)
**Deprecation Headers:**
```http
Deprecation: true
Sunset: Sat, 01 Mar 2026 00:00:00 GMT
Link: <https://api.oooefam.net/v3>; rel="successor-version"
X-Deprecation-Notice: V1 API deprecated. Migrate to V2/V3. Sunset: March 1, 2026
```

**Critical Dependencies:**
- `/v1/enrichment/batch` - Used by iOS CSV import (MUST migrate)
- `/ws/progress` - WebSocket progress (MUST migrate to SSE)
- `/v1/jobs/:id/status` - Job polling (MUST migrate)

---

## Feature Gap Analysis

### CRITICAL GAPS - Block V2 Deprecation

#### 1. CSV Import Workflow
**V2 Implementation:**
- Endpoint: `POST /api/v2/imports`
- Progress: `GET /api/v2/imports/:id/stream` (SSE)
- Status: `GET /api/v2/imports/:id`
- Results: `GET /api/v2/imports/:id/results`

**V3 Needed:**
```typescript
// POST /v3/jobs/imports
{
  "type": "csv_import",
  "file": <multipart/form-data>
}
// Response:
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "processing",
    "streamUrl": "/v3/jobs/imports/{jobId}/stream"
  },
  "_links": {
    "self": { "href": "/v3/jobs/imports/{jobId}", "method": "GET" },
    "stream": { "href": "/v3/jobs/imports/{jobId}/stream", "method": "GET" },
    "cancel": { "href": "/v3/jobs/imports/{jobId}", "method": "DELETE" }
  }
}
```

**Dependencies:**
- `handleCSVImport` (src/handlers/csv-import.ts)
- `processCSVCore` (src/utils/csv-processor-core.js)
- Gemini 2.0 Flash API for parsing
- Durable Object alarms (avoid Worker CPU limits)
- KV cache for results (24h TTL)

#### 2. Bookshelf Scanning (AI Photo Analysis)
**V2 Implementation:**
- Endpoint: `POST /api/scan-bookshelf/batch`
- Progress: WebSocket `/ws/progress?jobId=xxx`
- Results: `GET /v1/scan/results/:jobId`

**V3 Needed:**
```typescript
// POST /v3/jobs/scans
{
  "type": "bookshelf_scan",
  "photos": [<multipart/form-data>]
}
// Response: Same job structure as CSV import
```

**Dependencies:**
- `handleBatchScan` (src/handlers/batch-scan-handler.ts)
- `scanImageWithGemini` (src/providers/gemini-provider.js)
- R2 storage for images (BOOKSHELF_IMAGES bucket)
- Parallel enrichment service
- Advanced search for fuzzy matching

#### 3. Batch Enrichment (Background Jobs)
**V2 Implementation:**
- Endpoint: `POST /v1/enrichment/batch`
- Progress: WebSocket `/ws/progress?jobId=xxx`
- iOS uses for background sync (up to 500 books)

**V3 Needed:**
```typescript
// POST /v3/books/enrich (already exists but sync-only)
// Add async mode:
{
  "isbns": ["978...", "..."],
  "includeEmbedding": true,
  "async": true  // NEW: trigger background job
}
// Response when async=true:
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "streamUrl": "/v3/jobs/enrichment/{jobId}/stream"
  }
}
```

#### 4. SSE Streaming (Replace WebSocket)
**Why SSE over WebSocket:**
- Browser-native reconnection with `Last-Event-ID`
- Firewall-friendly (HTTP/1.1)
- Simpler client implementation
- Books array included in completion event (iOS persistence)

**V3 Needed:**
```typescript
// GET /v3/jobs/{type}/{jobId}/stream
// Server-Sent Events with:
event: progress
data: {"jobId": "...", "progress": 0.5, "processedCount": 50, "totalCount": 100}

event: complete
data: {"jobId": "...", "status": "completed", "results": [...]}

event: error
data: {"jobId": "...", "error": {...}}
```

**Dependencies:**
- `handleSSEStream` (src/handlers/v2/sse-stream.ts) - port to V3
- JobStateManagerDO for state management
- KV cache for result persistence

#### 5. Job Management (Unified Lifecycle)
**V3 Needed:**
```typescript
// GET /v3/jobs/{type}/{jobId} - Unified status endpoint
// DELETE /v3/jobs/{type}/{jobId} - Cancel job
// GET /v3/jobs/{type}/{jobId}/results - Fetch results
```

**Security:**
- Bearer token auth (required for all job operations)
- Token validation against DO state
- Auto-expiration after 1 hour

---

## V3 Migration Roadmap

### Phase 1: Foundation (Week 1-2) ✅ COMPLETE
- [x] V3 router with @hono/zod-openapi
- [x] Book search endpoint
- [x] ISBN lookup endpoint
- [x] Batch enrichment (sync mode)
- [x] RFC 9457 error handling
- [x] Request correlation (X-Request-ID)

### Phase 2: Async Workflows (Week 3-4) 🚧 IN PROGRESS
**Target:** Enable frontend to drop V2 dependencies

#### 2.1 Job Framework (Days 1-3)
- [ ] Create `src/api-v3/jobs/` directory structure
- [ ] Design unified `JobSchema` (csv_import, bookshelf_scan, batch_enrichment)
- [ ] Implement `POST /v3/jobs/{type}` (job initiation)
- [ ] Implement `GET /v3/jobs/{type}/{jobId}` (status polling)
- [ ] Implement `DELETE /v3/jobs/{type}/{jobId}` (cancellation)
- [ ] Implement `GET /v3/jobs/{type}/{jobId}/results` (result retrieval)

**Schema Design:**
```typescript
// @bookstrack/schemas/src/v3/jobs.ts
export const JobTypeSchema = z.enum(['csv_import', 'bookshelf_scan', 'batch_enrichment'])

export const JobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed', 'canceled'])

export const JobSchema = z.object({
  jobId: z.string().uuid(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  progress: z.number().min(0).max(1),
  processedCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  startTime: z.string().datetime(),
  completedTime: z.string().datetime().optional(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).optional()
})

export const JobInitResponseSchema = SuccessResponseSchema(z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  streamUrl: z.string().url()
}))
```

#### 2.2 SSE Streaming (Days 4-5)
- [ ] Implement `GET /v3/jobs/{type}/{jobId}/stream`
- [ ] Port SSE logic from `src/handlers/v2/sse-stream.ts`
- [ ] Add `Last-Event-ID` support for reconnection
- [ ] Include books array in completion event (iOS requirement)
- [ ] Test with iOS app (verify reconnection behavior)

**Implementation:**
```typescript
// src/api-v3/jobs/stream.ts
export const streamRoute = createRoute({
  method: 'get',
  path: '/v3/jobs/{type}/{jobId}/stream',
  tags: ['Jobs'],
  summary: 'Stream job progress (SSE)',
  description: 'Server-Sent Events stream for real-time job updates',
  // ... schema definitions
})

app.openapi(streamRoute, async (c) => {
  const { type, jobId } = c.req.valid('param')
  const lastEventId = c.req.header('Last-Event-ID')

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      // ... SSE implementation
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
})
```

#### 2.3 CSV Import (Days 6-8)
- [ ] Implement `POST /v3/jobs/imports`
- [ ] Port CSV processing from `src/handlers/csv-import.ts`
- [ ] Integrate with JobStateManagerDO
- [ ] Add multipart/form-data parsing
- [ ] Test with 8MB CSV files (Gemini 2M token limit)
- [ ] Validate SSE progress updates

**Key Changes:**
- Use V3 response format (RFC 9457 errors)
- HATEOAS links to stream/status/cancel endpoints
- Zod validation for file size limits

#### 2.4 Bookshelf Scanning (Days 9-11)
- [ ] Implement `POST /v3/jobs/scans`
- [ ] Port scanning logic from `src/handlers/batch-scan-handler.ts`
- [ ] Handle multipart/form-data with binary images
- [ ] Integrate R2 storage for photos
- [ ] Add confidence threshold filtering
- [ ] Test with 5 photos (10MB each, 50MB total limit)

**Key Changes:**
- Clamp bounding box coordinates [0, 1]
- R2 cleanup on job cancellation
- DetectedBookDTO → V3 Book schema mapping

#### 2.5 Batch Enrichment Async Mode (Days 12-14)
- [ ] Add `async` flag to `POST /v3/books/enrich`
- [ ] Create background job when `async=true`
- [ ] Port parallel enrichment from `src/handlers/batch-enrichment.ts`
- [ ] Support both barcodes and book objects (iOS compatibility)
- [ ] Test with 500 ISBNs (iOS max)

**Backward Compatibility:**
- Default `async=false` (sync behavior, existing clients unaffected)
- When `async=true`, return job object instead of books array

### Phase 3: V2 Deprecation (Week 5-6)
**Prerequisites:**
- [ ] All V3 async workflows production-tested
- [ ] iOS app updated to V3-only
- [ ] Web app updated to V3-only
- [ ] 90-day deprecation notice sent to API consumers

#### 3.1 Deprecation Headers (Day 1)
```typescript
// Add to src/router.ts
app.use("/api/v2/*", async (c, next) => {
  await next()
  const baseUrl = new URL(c.req.url).origin
  c.header("Deprecation", "true")
  c.header("Sunset", "Sat, 07 Mar 2026 00:00:00 GMT") // 90 days from Week 6
  c.header("Link", `<${baseUrl}/v3>; rel="successor-version"`)
  c.header("X-Deprecation-Notice", "V2 API deprecated. Migrate to V3. Sunset: March 7, 2026")
})
```

#### 3.2 Migration Guide (Days 2-3)
- [ ] Create `docs/V2_TO_V3_MIGRATION.md`
- [ ] Document endpoint mappings (table format)
- [ ] Provide code examples for each breaking change
- [ ] Highlight SSE vs WebSocket differences
- [ ] Add troubleshooting section

#### 3.3 Deprecation Announcement (Day 4)
- [ ] Email to API consumers (from api-support@oooefam.net)
- [ ] Update API documentation home page
- [ ] Add banner to Swagger UI (`/v3/docs`)
- [ ] GitHub issue for public discussion

#### 3.4 Monitoring (Days 5-6)
- [ ] Analytics for V2 usage (track decline)
- [ ] Error spike detection (migration issues)
- [ ] Performance regression checks
- [ ] Client feedback review

### Phase 4: Code Cleanup (Week 7-8)
**After V2 sunset (March 7, 2026 + grace period)**

#### 4.1 Remove V1 API (Day 1)
- [ ] Delete all `/v1/*` routes from `src/router.ts`
- [ ] Remove `src/handlers/v1/` directory
- [ ] Archive `docs/openapi-v1.yaml` → `docs/archive/`
- [ ] Update `CLAUDE.md` and `README.md`

#### 4.2 Remove V2 API (Day 2)
- [ ] Delete all `/api/v2/*` routes from `src/router.ts`
- [ ] Remove `src/handlers/v2/` directory
- [ ] Archive `docs/openapi.yaml` → `docs/archive/`
- [ ] Update `CLAUDE.md` and `README.md`

#### 4.3 Remove Legacy Handlers (Day 3)
- [ ] Delete `src/handlers/csv-import.ts` (V2 version)
- [ ] Delete `src/handlers/batch-scan-handler.ts` (V2 version)
- [ ] Delete `src/handlers/batch-enrichment.ts` (V2 version)
- [ ] Delete `src/handlers/v2/sse-stream.ts` (moved to V3)

#### 4.4 Simplify Durable Objects (Day 4)
- [ ] Remove `ENABLE_REFACTORED_DOS` feature flag
- [ ] Delete legacy `ProgressWebSocketDO` (use JobStateManagerDO only)
- [ ] Remove WebSocket upgrade logic (SSE-only)
- [ ] Clean up `src/utils/durable-object-helpers.js`

#### 4.5 Update Dependencies (Day 5)
- [ ] Remove unused response DTOs (ResponseEnvelope v1/v2)
- [ ] Consolidate error handling (RFC 9457 only)
- [ ] Remove backward compatibility shims
- [ ] Update test suite (delete V1/V2 tests)

#### 4.6 Documentation Cleanup (Day 6)
- [ ] Remove V1/V2 sections from `CLAUDE.md`
- [ ] Update `ARCHITECTURE_OVERVIEW.md`
- [ ] Archive migration guides to `docs/archive/`
- [ ] Update production deployment docs

#### 4.7 Performance Optimizations (Days 7-8)
**Now that we're V3-only, optimize aggressively:**

- [ ] **Remove response format conversions**
  - All endpoints use RFC 9457 errors natively
  - No need for ResponseEnvelope → Problem Details mapping

- [ ] **Simplify middleware stack**
  - Remove V1/V2 contract validation middleware
  - Single error handler (no version-specific logic)

- [ ] **Consolidate cache keys**
  - V3-only cache format (no backward compat)
  - Shorter cache keys (remove version prefix)

- [ ] **Reduce bundle size**
  - Delete unused Zod schemas (V1/V2 DTOs)
  - Tree-shake legacy providers
  - Estimate: ~15-20% bundle reduction

- [ ] **Database cleanup**
  - Drop V1/V2 job records from JobStateManagerDO
  - Archive old analytics data (>90 days)
  - Compress KV namespaces

---

## V3-Only Optimization Opportunities

### 1. Native Zod Validation Everywhere
**Current:** Mixed validation (manual checks + Zod)
**V3-Only:** Full Zod validation via @hono/zod-openapi

**Benefits:**
- Eliminate manual validation code
- Auto-generated OpenAPI spec (zero drift)
- Type-safe request/response handling
- 30-40% reduction in handler boilerplate

**Example Cleanup:**
```typescript
// BEFORE (V1/V2 - manual validation)
const isbn = c.req.query("isbn")?.substring(0, 200)
if (!isbn || isbn.trim().length === 0) {
  return createErrorResponse("Missing ISBN", 400, ErrorCodes.MISSING_PARAMETER)
}

// AFTER (V3 - Zod auto-validation)
const { isbn } = c.req.valid('query') // Already validated, typed, and sanitized
```

### 2. Unified Error Handling (RFC 9457)
**Current:** ResponseEnvelope + Problem Details + custom errors
**V3-Only:** RFC 9457 Problem Details exclusively

**Benefits:**
- Standard-compliant error format
- Automatic client library support (OpenAPI generators)
- Consistent error codes across all endpoints
- Remove 500+ lines of error mapping code

**Schema:**
```typescript
// All errors use this format (no special cases)
{
  "type": "https://api.oooefam.net/errors#NOT_FOUND",
  "title": "Book not found",
  "status": 404,
  "detail": "No book found with ISBN 9780123456789",
  "instance": "/v3/books/9780123456789",
  "requestId": "uuid",
  "retryAfterMs": 60000  // Optional, for 503 errors
}
```

### 3. Remove Backward Compatibility Layers
**Delete:**
- iOS compatibility shims (barcodes → books conversion)
- Multiple response formats (flat vs. nested DTOs)
- Alias endpoints (`/api/batch-enrich` → `/v1/enrichment/batch`)
- Feature flags (ENABLE_REFACTORED_DOS, ENABLE_HONO_ROUTER)

**Impact:**
- ~800 lines of code removed
- Simplified testing matrix
- Faster onboarding for new developers

### 4. Aggressive Caching
**Current:** Conservative TTLs for backward compatibility
**V3-Only:** Optimized TTLs with ETag support

**New Strategy:**
- Book metadata: 24h → 7d (with ETag for freshness)
- Search results: 1h → 6h (stable Alexandria data)
- Cover images: 7d → 30d (immutable resources)
- Job results: 1h → 24h (longer retention)

**Benefits:**
- 70% → 85% cache hit ratio (estimated)
- Reduced Alexandria RPC calls
- Lower latency for repeated queries

### 5. Simplified Routing
**Current:** 3 routing layers (manual + Hono + OpenAPI)
**V3-Only:** Single OpenAPIHono app

**Remove:**
- Manual router (`src/index.js` compatibility layer)
- Route duplication checks
- Version-based middleware forking

**File Reduction:**
```
src/
  router.ts (1743 lines) → DELETED
  index.js (legacy) → DELETED
  api-v3/
    index.ts → RENAME to router.ts (single source of truth)
```

### 6. Monorepo Consolidation
**Current:** Separate packages for schemas (@bookstrack/schemas)
**V3-Only:** Inline schemas (faster iteration)

**Consideration:**
- Schemas currently in separate npm package
- V3-only allows co-location with routes
- Faster development (no publish step)
- Trade-off: Lose external client SDK generation

**Decision:** Keep @bookstrack/schemas for now (external consumers may exist)

### 7. Durable Object Simplification
**Current:** Dual architecture (legacy + refactored)
**V3-Only:** Single JobStateManagerDO + WebSocketConnectionDO

**Remove:**
- `ProgressWebSocketDO` (legacy monolithic DO)
- `getProgressDOStub` helper (no version forking)
- Feature flag checks in every handler

**Benefits:**
- Clearer separation of concerns
- Easier to test (single DO per responsibility)
- Better alignment with Workers RPC patterns

---

## Migration Checklist for Frontend Teams

### iOS Team
- [ ] Update to V3 endpoints (see mapping table below)
- [ ] Replace WebSocket progress with SSE
- [ ] Handle RFC 9457 error format
- [ ] Update barcode scanning to use `/v3/jobs/scans`
- [ ] Update CSV import to use `/v3/jobs/imports`
- [ ] Test SSE reconnection on poor networks
- [ ] Verify books array in SSE completion event

### Web Team
- [ ] Update search to `/v3/books/search`
- [ ] Update enrichment to `/v3/books/enrich`
- [ ] Implement ETag-based caching for `/v3/books/:isbn`
- [ ] Handle HATEOAS links for pagination
- [ ] Update error handling to RFC 9457
- [ ] Test rate limiting (X-RateLimit-* headers)

---

## Endpoint Mapping Table

| V1/V2 Endpoint | V3 Replacement | Method | Breaking Changes |
|----------------|----------------|--------|------------------|
| `GET /v1/search/isbn?isbn=X` | `GET /v3/books/:isbn` | GET | Path param instead of query param |
| `GET /v1/search/title?q=X` | `GET /v3/books/search?q=X&mode=text` | GET | Added mode parameter |
| `POST /api/batch-enrich` | `POST /v3/books/enrich` | POST | Request body format changed (Zod schema) |
| `POST /api/import/csv-gemini` | `POST /v3/jobs/imports` | POST | Returns job object, not direct results |
| `GET /api/v2/imports/:id` | `GET /v3/jobs/imports/:id` | GET | Response format changed (RFC 9457) |
| `GET /api/v2/imports/:id/stream` | `GET /v3/jobs/imports/:id/stream` | GET | No changes (SSE) |
| `POST /api/scan-bookshelf/batch` | `POST /v3/jobs/scans` | POST | Returns job object, not direct results |
| `GET /v1/scan/results/:id` | `GET /v3/jobs/scans/:id/results` | GET | Unified results endpoint |
| `GET /ws/progress?jobId=X` | `GET /v3/jobs/{type}/{jobId}/stream` | GET | **SSE replaces WebSocket** |
| `DELETE /v1/jobs/:id` | `DELETE /v3/jobs/{type}/{jobId}` | DELETE | Added type path param |

---

## Risk Mitigation

### Risk 1: iOS App Breaks on V2 Shutdown
**Likelihood:** Low (if migration plan followed)
**Impact:** High (users unable to scan/import)

**Mitigation:**
- Require iOS app update BEFORE V2 sunset
- Keep V2 alive for 30 days after iOS v3.0 release
- Monitor V2 usage (alert if >5% of traffic after deadline)
- Emergency rollback plan (re-enable V2 routes)

### Risk 2: Performance Regression
**Likelihood:** Medium (V3 uses different middleware)
**Impact:** Medium (slower responses)

**Mitigation:**
- Load test V3 endpoints before V2 shutdown
- Compare P95 latency (target: <10% regression)
- Keep optimized Alexandria RPC integration
- Monitor cache hit rates (should improve with longer TTLs)

### Risk 3: Frontend Teams Miss Deadline
**Likelihood:** Medium (coordination required)
**Impact:** High (delayed deprecation)

**Mitigation:**
- Weekly sync meetings (Weeks 3-6)
- Shared migration tracker (GitHub Project)
- Staging environment with V3-only mode
- Dedicated Slack channel for blockers

### Risk 4: Undiscovered V1/V2 Dependencies
**Likelihood:** Low (good test coverage)
**Impact:** Medium (unexpected errors)

**Mitigation:**
- Audit all API consumers (analytics data)
- Comprehensive integration tests for V3
- Canary deployment (10% traffic to V3-only for 7 days)
- Rollback script (re-enable V2 in <5 minutes)

---

## Success Metrics

### Phase 2 (Async Workflows)
- [ ] All V3 job endpoints return <500ms P95
- [ ] SSE reconnection success rate >95%
- [ ] CSV import handles 8MB files without timeout
- [ ] Bookshelf scan processes 5 photos in <60s
- [ ] Zero frontend blockers reported

### Phase 3 (V2 Deprecation)
- [ ] V2 traffic drops to <10% within 30 days
- [ ] V1 traffic drops to 0% by March 1, 2026
- [ ] Zero critical bugs in V3 migration
- [ ] Frontend satisfaction score >8/10

### Phase 4 (Code Cleanup)
- [ ] Bundle size reduced by 15-20%
- [ ] Test suite runtime reduced by 30%
- [ ] Code coverage maintained at 75%+
- [ ] Zero V1/V2 references in codebase

---

## Open Questions

1. **Q:** Should we keep `/api/v2/search` as an alias to `/v3/books/search` for transition period?
   **A:** TBD - discuss with frontend teams (Week 3)

2. **Q:** Do we need WebSocket fallback for SSE (browsers without SSE support)?
   **A:** No - all modern browsers (iOS 13+, Chrome 80+) support SSE

3. **Q:** Should V3 support cursor-based pagination for search?
   **A:** Yes - spec already includes cursor option, implement in Phase 2.5

4. **Q:** How to handle clients still on V1 after March 1, 2026?
   **A:** Return 410 Gone with migration guide link

5. **Q:** Should we version the shared schemas package (@bookstrack/schemas)?
   **A:** Yes - use semantic versioning, major bump for breaking changes

---

## Timeline Summary

| Phase | Duration | Key Milestones | Blockers |
|-------|----------|----------------|----------|
| Phase 1 | ✅ Complete | V3 foundation, basic endpoints | None |
| Phase 2 | 4 weeks | Async workflows, SSE, job mgmt | Frontend coordination |
| Phase 3 | 2 weeks | V2 deprecation notice, monitoring | Frontend migration complete |
| Phase 4 | 2 weeks | Code cleanup, optimization | V2 sunset date passed |

**Total Timeline:** 8 weeks (assuming no delays)
**Target Completion:** February 2026
**V2 Sunset Date:** March 7, 2026 (90 days after Phase 3 start)

---

## Appendix

### A. Reference Documents
- [V3 API OpenAPI Spec](/v3/openapi.json)
- [V2 API OpenAPI Spec](docs/openapi.yaml)
- [Alexandria RPC Migration](docs/archive/alexandria-migration-2025-12/)
- [CLAUDE.md](CLAUDE.md) - Full architectural guidelines

### B. Code References
- V3 Router: `src/api-v3/index.ts`
- Job Handlers: `src/handlers/csv-import.ts`, `src/handlers/batch-scan-handler.ts`
- SSE Stream: `src/handlers/v2/sse-stream.ts`
- Schemas: `packages/api-client/` (@bookstrack/schemas)

### C. Deployment Checklist
- [ ] Update wrangler.jsonc (remove V2 environment variables)
- [ ] Clear KV cache namespaces (invalidate V1/V2 keys)
- [ ] Update Cloudflare Workers secrets (rotate API keys)
- [ ] Test rollback procedure (V2 re-enable in <5 minutes)

---

**Document Version:** 1.0
**Last Updated:** December 5, 2025
**Next Review:** Weekly during Phase 2-3
