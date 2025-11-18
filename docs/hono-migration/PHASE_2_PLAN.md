# Hono Migration - Phase 2 Plan

**Status:** 📋 Planned (Not Started)
**Depends On:** Phase 1 MVP (#173)
**Target Date:** TBD (after successful A/B test)

---

## 🎯 Objectives

1. Migrate remaining V1 API routes to Hono router
2. Migrate batch processing endpoints
3. Maintain feature flag safety for gradual rollout
4. Achieve 80% route coverage in Hono

---

## 📊 Current State (Post-Phase 1)

**Hono Routes (4):**
- ✅ GET `/health`
- ✅ GET `/v1/search/isbn`
- ✅ GET `/metrics`
- ✅ GET `/ws/progress`

**Manual Routes Remaining (24):**
- 🔲 V1 Search API (3 routes)
- 🔲 V1 Results Retrieval (2 routes)
- 🔲 Batch Operations (3 routes)
- 🔲 Legacy Search (4 routes)
- 🔲 External Providers (7 routes)
- 🔲 Admin/Utilities (3 routes)
- 🔲 Test Endpoints (3 routes)

---

## 🗺️ Migration Roadmap

### Group 1: V1 Search API (Priority: High)
**Rationale:** Complete the V1 API surface, most-used endpoints

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/v1/search/title` | GET | `handleSearchTitle` | Medium | KV Cache, Google Books |
| `/v1/search/advanced` | GET | `handleSearchAdvanced` | Medium | KV Cache, Multiple providers |
| `/v1/editions/search` | GET | `handleSearchEditions` | Medium | OpenLibrary, ISBNdb |

**Estimated Effort:** 4-6 hours
- Handler calls are already TypeScript-compatible
- Similar patterns to `/v1/search/isbn`
- Query param extraction straightforward

**Implementation Example:**
```typescript
// src/router.ts
app.get('/v1/search/title', async (c) => {
  const title = c.req.query('title')
  const author = c.req.query('author') || ''
  const limit = parseInt(c.req.query('limit') || '20')

  return await handleSearchTitle(title, author, limit, c.env, c.executionCtx, c.req.raw)
})
```

**Success Criteria:**
- All 3 routes return identical JSON to manual router
- Performance within 5% of manual router
- Zero 500 errors in A/B test

---

### Group 2: V1 Results Retrieval (Priority: High)
**Rationale:** Completes V1 API coverage

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/v1/scan/results` | GET | `handleScanResults` | Low | Durable Object (JobStateManagerDO) |
| `/v1/csv/results` | GET | `handleCSVResults` | Low | Durable Object (JobStateManagerDO) |

**Estimated Effort:** 2-3 hours
- Simple GET routes with jobId parameter
- Durable Object forwarding (similar to `/ws/progress`)

**Implementation Example:**
```typescript
app.get('/v1/scan/results', async (c) => {
  const jobId = c.req.query('jobId')

  if (!jobId) {
    return errorResponse('MISSING_PARAM', 'Missing jobId parameter', 400, null)
  }

  return await handleScanResults(jobId, c.env)
})
```

---

### Group 3: Batch Operations (Priority: Medium)
**Rationale:** High-value endpoints, but lower traffic than search

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/api/scan-bookshelf` | POST | `handleBatchScan` | High | Gemini AI, R2, Durable Object |
| `/api/warming/upload` | POST | `handleWarmingUpload` | Medium | Queue (AUTHOR_WARMING_QUEUE) |
| `/api/harvest-covers` | POST | `handleScheduledHarvest` | Medium | ISBNdb API, R2 |

**Estimated Effort:** 6-8 hours
- POST routes require request body parsing
- File upload handling (`/scan-bookshelf`)
- Hono has built-in body parsers: `await c.req.json()`

**Implementation Example:**
```typescript
app.post('/api/scan-bookshelf', async (c) => {
  const contentType = c.req.header('content-type')

  if (!contentType?.startsWith('multipart/form-data')) {
    return errorResponse('INVALID_CONTENT_TYPE', 'Expected multipart/form-data', 400, null)
  }

  const formData = await c.req.formData()
  const file = formData.get('image')

  return await handleBatchScan(c.req.raw, c.env)
})
```

**Challenges:**
- Large request bodies (bookshelf images up to 10MB)
- Validate against `MAX_SCAN_FILE_SIZE` env var
- Ensure Hono doesn't add latency to multipart parsing

---

### Group 4: Legacy Search (Priority: Low)
**Rationale:** Deprecated endpoints, migrate for completeness

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/search/title` | GET | `bookSearch.handleTitleSearch` | Low | Google Books |
| `/search/isbn` | GET | `bookSearch.handleISBNSearch` | Low | Google Books |
| `/search/author` | GET | `authorSearch.handleAuthorSearch` | Low | Google Books |
| `/search/advanced` | GET | `handleAdvancedSearch` | Medium | Multiple providers |

**Estimated Effort:** 3-4 hours
- Similar to V1 routes but with legacy response format
- May add deprecation warnings after migration

**Migration Note:**
Consider adding `Deprecation: true` header to signal clients to migrate to V1 API.

---

### Group 5: External Providers (Priority: Low)
**Rationale:** Internal/debugging endpoints, low traffic

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/external/google-books` | GET | `externalApis.googleBooks` | Low | Google Books API |
| `/external/google-books-isbn` | GET | `externalApis.googleBooksISBN` | Low | Google Books API |
| `/external/openlibrary` | GET | `externalApis.openLibrary` | Low | OpenLibrary API |
| `/external/openlibrary-author` | GET | `externalApis.openLibraryAuthor` | Low | OpenLibrary API |
| `/external/isbndb` | GET | `externalApis.isbndb` | Low | ISBNdb API |
| `/external/isbndb-editions` | GET | `externalApis.isbndbEditions` | Low | ISBNdb API |
| `/external/isbndb-isbn` | GET | `externalApis.isbndbISBN` | Low | ISBNdb API |

**Estimated Effort:** 4-5 hours
- Simple GET routes with query params
- Direct API passthrough (minimal logic)

**Consideration:**
Group all under `/external/*` prefix using Hono's route grouping:
```typescript
const external = app.basePath('/external')
external.get('/google-books', async (c) => { ... })
external.get('/openlibrary', async (c) => { ... })
```

---

### Group 6: Admin & Utilities (Priority: Low)
**Rationale:** Internal endpoints, can migrate last

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/admin/harvest-dashboard` | GET | `handleHarvestDashboard` | Low | R2, Analytics Engine |
| `/api/cache/metrics` | GET | `handleCacheMetrics` | Low | Analytics Engine |
| `/images/proxy` | GET | `handleImageProxy` | Medium | External URLs, caching |

**Estimated Effort:** 3-4 hours

---

### Group 7: Test Endpoints (Priority: Optional)
**Rationale:** Development-only, consider removing instead

| Route | Method | Handler | Complexity | Dependencies |
|-------|--------|---------|------------|--------------|
| `/test/do/init-batch` | POST | Inline | Low | Durable Object |
| `/test/do/get-state` | GET | Inline | Low | Durable Object |
| `/test/do/is-canceled` | GET | Inline | Low | Durable Object |

**Decision Point:**
- **Option A:** Migrate to Hono for consistency
- **Option B:** Remove from production, keep in dev only
- **Option C:** Leave in manual router (exempt from migration)

**Recommendation:** Option B (remove from production)

---

## 🚀 Rollout Strategy

### Phase 2A: V1 API Completion (Groups 1-2)
**Timeline:** Week 1-2
- Migrate 5 routes (3 search + 2 results)
- Enable for 25% traffic via feature flag
- Monitor for 48 hours before increasing

### Phase 2B: Batch Operations (Group 3)
**Timeline:** Week 3
- Migrate 3 POST routes
- Enable for 50% traffic
- Performance-critical: compare response times closely

### Phase 2C: Legacy & Cleanup (Groups 4-7)
**Timeline:** Week 4-5
- Migrate remaining routes
- Enable for 100% traffic
- Prepare for Phase 3 (manual router removal)

---

## 🧪 Testing Strategy

### Unit Tests
For each migrated route group:
- Add Hono-specific route tests to `tests/hono-router.test.js`
- Verify query param extraction
- Validate request body parsing (POST routes)
- Test error cases (400, 404, 500)

### Integration Tests
- Run existing 728+ tests with `ENABLE_HONO_ROUTER=true`
- All tests must pass before merging

### Performance Tests
- Benchmark each route group (100 iterations)
- Compare manual vs Hono avg response times
- Alert if Hono is >10% slower

### A/B Testing
- Use `X-Router` header to track which router handled each request
- Query Analytics Engine for response time percentiles (P50, P95, P99)
- Monitor error rates (should be identical)

---

## 📋 Migration Checklist Template

For each route:
- [ ] Identify route in `src/index.js`
- [ ] Document handler signature (params, env, ctx, request)
- [ ] Add route to `src/router.ts` with proper HTTP method
- [ ] Convert query param extraction to Hono context
- [ ] Convert request body parsing (if POST/PUT)
- [ ] Test with feature flag toggle
- [ ] Verify identical responses (JSON diff)
- [ ] Run performance benchmark
- [ ] Update `docs/hono-migration/API_ROUTES.md`
- [ ] Commit with descriptive message

---

## 🎯 Success Metrics

**Goal:** 80% route coverage by end of Phase 2

| Metric | Target | Measurement |
|--------|--------|-------------|
| Routes Migrated | 20/24 (83%) | Count in `src/router.ts` |
| Performance Parity | Within 5% | Analytics Engine (X-Response-Time) |
| Error Rate | No increase | Analytics Engine (500 errors) |
| Test Coverage | 100% passing | Vitest results |
| Production Traffic | 100% on Hono | Analytics Engine (X-Router) |

---

## 🚨 Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| POST body parsing breaks | High | Low | Test multipart/form-data thoroughly |
| Large file uploads timeout | High | Medium | Monitor `/scan-bookshelf` response times |
| Hono adds latency to batch ops | Medium | Low | Benchmark before/after migration |
| Feature flag fails mid-migration | Medium | Very Low | Instant rollback via deploy |
| WebSocket upgrade changes | High | Very Low | Already tested in Phase 1 |

---

## 💡 Advanced Hono Features to Explore

After core migration completes:

### 1. Route Grouping
```typescript
const v1 = app.basePath('/v1')
v1.get('/search/isbn', handleSearchISBN)
v1.get('/search/title', handleSearchTitle)
```

### 2. Middleware Chains
```typescript
app.use('/api/*', rateLimitMiddleware())
app.use('/api/*', authMiddleware())
app.post('/api/scan-bookshelf', validateImageMiddleware(), handleBatchScan)
```

### 3. Zod Validation
```typescript
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const isbnSchema = z.object({
  isbn: z.string().regex(/^\d{10}$|^\d{13}$/)
})

app.get('/v1/search/isbn', zValidator('query', isbnSchema), async (c) => {
  const { isbn } = c.req.valid('query')
  // isbn is now type-safe and validated
})
```

### 4. OpenAPI Generation
```typescript
import { OpenAPIHono } from '@hono/zod-openapi'

const app = new OpenAPIHono()
// Auto-generate OpenAPI spec from routes
```

---

## 📚 Resources

- **Phase 1 Summary:** `PHASE_1_MVP_SUMMARY.md`
- **API Routes:** `API_ROUTES.md`
- **Hono Middleware:** https://hono.dev/middleware/builtin/
- **Zod Validator:** https://hono.dev/helpers/validation
- **Issue #173:** https://github.com/jukasdrj/bookstrack-backend/issues/173

---

**Maintained By:** AI Team (Claude Code, Grok-4)
**Human Owner:** @jukasdrj
**Last Updated:** November 17, 2025
