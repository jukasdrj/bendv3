# OpenAPI Migration - 3-Phase Implementation Plan

**Project:** BooksTrack Backend OpenAPI Migration
**Owner:** Backend Platform Team
**Created:** November 28, 2025
**Status:** 📋 **READY TO EXECUTE**
**Estimated Duration:** 8-10 weeks (~40-50 days)

---

## Executive Summary

This plan migrates **48 HTTP endpoints** from traditional Hono routes to OpenAPI-enabled routes using `@hono/zod-openapi`. The migration will unlock automatic OpenAPI spec generation, runtime request/response validation, and best-in-class API documentation.

**Key Principles:**
- ✅ **Zero breaking changes** - 100% backward compatibility
- ✅ **Incremental rollout** - Phase-by-phase with validation gates
- ✅ **Production safety** - Each phase tested in production before next begins
- ✅ **Quick rollback** - Feature flag rollback if issues arise

**Current State:**
- **Total Endpoints:** 48 HTTP routes + 1 WebSocket
- **OpenAPI Enabled:** 1 (`GET /api/v2/capabilities` - POC)
- **Infrastructure:** 100% complete (schemas, config, tooling)
- **Progress:** 2% migrated (1/49 endpoints)

**Target State:**
- **Total Endpoints:** 49 (48 HTTP + WebSocket documented)
- **OpenAPI Enabled:** 45 HTTP endpoints (93%)
- **Legacy Routes:** 3 deprecated endpoints (sunset March 2026)
- **Documentation:** Swagger UI with 100% coverage

---

## Table of Contents

1. [Endpoint Inventory](#1-endpoint-inventory)
2. [Phase 1: Core Search API (Weeks 1-3)](#phase-1-core-search-api-weeks-1-3)
3. [Phase 2: V2 API & Job Management (Weeks 4-6)](#phase-2-v2-api--job-management-weeks-4-6)
4. [Phase 3: Admin & Utilities (Weeks 7-8)](#phase-3-admin--utilities-weeks-7-8)
5. [Migration Process](#migration-process)
6. [Success Criteria & Gates](#success-criteria--gates)
7. [Rollback Strategy](#rollback-strategy)
8. [Testing Requirements](#testing-requirements)
9. [Timeline & Resource Planning](#timeline--resource-planning)
10. [Risk Mitigation](#risk-mitigation)

---

## 1. Endpoint Inventory

### Summary by Category

| Category | Total | Migrated | Phase 1 | Phase 2 | Phase 3 | Excluded |
|----------|-------|----------|---------|---------|---------|----------|
| **Core Search (v1)** | 5 | 0 | 5 | 0 | 0 | 0 |
| **Legacy Search** | 4 | 0 | 0 | 0 | 0 | 4 (sunset) |
| **V2 API** | 6 | 1 | 0 | 5 | 0 | 0 |
| **Batch Operations** | 6 | 0 | 0 | 6 | 0 | 0 |
| **Job Management** | 11 | 0 | 0 | 11 | 0 | 0 |
| **Admin & Metrics** | 7 | 0 | 0 | 0 | 7 | 0 |
| **Cache Management** | 5 | 0 | 0 | 0 | 5 | 0 |
| **Utilities** | 3 | 0 | 0 | 0 | 3 | 0 |
| **Test Endpoints** | 4 | 0 | 0 | 0 | 0 | 4 (dev only) |
| **WebSocket** | 1 | 0 | 0 | 0 | 0 | 1 (special) |
| **TOTAL** | **52** | **1** | **5** | **22** | **15** | **9** |

**Net Migration:** 43 endpoints (83% of production endpoints)

---

### Phase 1: Core Search API (5 Endpoints)

**Rationale:** Highest usage, stable schemas, foundational for other endpoints

| Endpoint | Method | Priority | Usage | Complexity | Effort |
|----------|--------|----------|-------|------------|--------|
| `/v1/search/isbn` | GET | P0 | High | Low | 1 day |
| `/v1/search/title` | GET | P0 | High | Low | 1 day |
| `/v1/search/advanced` | GET | P0 | Medium | Medium | 1.5 days |
| `/v1/search/similar` | GET | P1 | Low | Medium | 1.5 days |
| `/v1/search/semantic` | GET | P1 | Low | Medium | 1.5 days |
| `/v1/editions/search` | GET | P1 | Low | Low | 1 day |

**Total Effort:** 6.5 days
**Dependencies:** Book schemas (already exist)

---

### Phase 2: V2 API & Job Management (22 Endpoints)

**Rationale:** New v2 API needs spec, job management is core to async operations

#### V2 API (5 endpoints)
| Endpoint | Method | Priority | Complexity | Effort |
|----------|--------|----------|------------|--------|
| `/api/v2/search` | GET | P0 | Medium | 2 days |
| `/api/v2/books/enrich` | POST | P0 | Medium | 2 days |
| `/api/v2/imports` | POST | P0 | High | 3 days |
| `/api/v2/imports/:jobId/stream` | GET | P1 | High (SSE) | 3 days |
| `/api/v2/recommendations/weekly` | GET | P2 | Medium | 2 days |

#### Batch Operations (6 endpoints)
| Endpoint | Method | Priority | Complexity | Effort |
|----------|--------|----------|------------|--------|
| `/v1/enrichment/batch` | POST | P0 | Medium | 2 days |
| `/api/batch-scan` | POST | P0 | High | 3 days |
| `/api/scan-bookshelf/batch` | POST | P0 | High | 3 days |
| `/api/import/csv-gemini` | POST | P0 | High | 3 days |
| `/api/scan-bookshelf/cancel` | POST | P1 | Low | 1 day |
| `/v2/import/workflow` | POST | P1 | Medium | 2 days |

#### Job Management (11 endpoints)
| Endpoint | Method | Priority | Complexity | Effort |
|----------|--------|----------|------------|--------|
| `/v1/jobs/:jobId/status` | GET | P0 | Low | 1 day |
| `/v1/jobs/:jobId/results` | GET | P0 | Medium | 1.5 days |
| `/v1/jobs/:jobId` | DELETE | P1 | Low | 1 day |
| `/v1/scan/results/:jobId` | GET | P0 | Medium | 1.5 days |
| `/v1/csv/results/:jobId` | GET | P0 | Medium | 1.5 days |
| `/v1/csv/status/:jobId` | GET | P0 | Low | 1 day |
| `/api/v2/imports/:jobId` | GET | P0 | Low | 1 day |
| `/api/v2/imports/:jobId/results` | GET | P0 | Medium | 1.5 days |
| `/v2/import/workflow/:workflowId` | GET | P1 | Low | 1 day |
| `/api/token/refresh` | POST | P1 | Low | 1 day |

**Total Effort:** 35 days

---

### Phase 3: Admin & Utilities (15 Endpoints)

**Rationale:** Lower usage, non-critical, can migrate last

#### Admin & Metrics (7 endpoints)
| Endpoint | Method | Priority | Complexity | Effort |
|----------|--------|----------|------------|--------|
| `/health` | GET | P0 | Low | 0.5 days |
| `/metrics` | GET | P1 | Low | 1 day |
| `/admin/harvest-dashboard` | GET | P2 | Low | 1 day |
| `/images/proxy` | GET | P2 | Low | 1 day |

#### Cache Management (5 endpoints)
| Endpoint | Method | Priority | Complexity | Effort |
|----------|--------|----------|------------|--------|
| `/api/cache/metrics` | GET | P1 | Low | 1 day |
| `/api/cache/stats` | GET | P1 | Low | 1 day |
| `/api/cache/dashboard` | GET | P2 | Low | 1 day |
| `/api/cache/health` | GET | P2 | Low | 1 day |
| `/api/cache/alerts` | GET | P2 | Low | 1 day |

**Total Effort:** 8.5 days

---

### Excluded from Migration

**Legacy Search Endpoints (4)** - **DEPRECATED** (Sunset March 1, 2026)
- `/search/isbn` (use `/v1/search/isbn` instead)
- `/search/title` (use `/v1/search/title` instead)
- `/search/author` (use `/v1/search/title` instead)
- `/search/advanced` (use `/v1/search/advanced` instead)

**Test Endpoints (4)** - **DEV ONLY** (Not for production docs)
- `/test/error`
- `/test/rpc-latency`
- `/test/cache-event`
- `/test/trigger-recommendations-cron`

**WebSocket (1)** - **SPECIAL HANDLING**
- `/ws/progress` - OpenAPI 3.1 has limited WebSocket support, document separately

**Total Excluded:** 9 endpoints

---

## Phase 1: Core Search API (Weeks 1-3)

### Objectives

1. Migrate the 5 most-used search endpoints to OpenAPI
2. Establish repeatable migration pattern
3. Validate production stability with high-traffic endpoints
4. Build developer confidence with schema system

### Scope

**Endpoints (6):**
- ✅ `GET /v1/search/isbn` (P0)
- ✅ `GET /v1/search/title` (P0)
- ✅ `GET /v1/search/advanced` (P0)
- ✅ `GET /v1/search/similar` (P1)
- ✅ `GET /v1/search/semantic` (P1)
- ✅ `GET /v1/editions/search` (P1)

**Schemas to Create:**
- `src/schemas/search.ts` - Search request/response schemas
  - `SearchISBNParams` - ISBN query parameters
  - `SearchTitleParams` - Title/author query parameters
  - `SearchAdvancedParams` - Advanced search filters
  - `SearchResponse` - Unified search response (books array + metadata)
  - `EditionSearchParams` - Edition search parameters
  - `EditionSearchResponse` - Edition-specific response

**OpenAPI Routes to Create:**
- `src/openapi/routes/search-isbn.ts`
- `src/openapi/routes/search-title.ts`
- `src/openapi/routes/search-advanced.ts`
- `src/openapi/routes/search-similar.ts`
- `src/openapi/routes/search-semantic.ts`
- `src/openapi/routes/search-editions.ts`

### Week-by-Week Breakdown

**Week 1: High-Priority Search (P0 Endpoints)**
- Day 1: `/v1/search/isbn` - Most used, simplest schema
- Day 2: `/v1/search/title` - Similar to ISBN
- Day 3-4: `/v1/search/advanced` - Complex params, needs careful validation
- Day 5: Testing, validation, production deploy

**Week 2: Advanced Search (P1 Endpoints)**
- Day 1-2: `/v1/search/semantic` - Vectorize integration
- Day 2-3: `/v1/search/similar` - Similarity algorithm
- Day 4: `/v1/editions/search` - Edition-specific logic
- Day 5: Testing, validation, production deploy

**Week 3: Consolidation & Buffer**
- Day 1-2: Fix any issues from Week 1-2
- Day 3: Update Swagger UI with tags and descriptions
- Day 4: Performance testing (ensure no regression)
- Day 5: Documentation and team training

### Success Criteria (Phase 1 Gate)

**Functional:**
- ✅ All 6 endpoints migrated and deployed to production
- ✅ 100% backward compatibility (existing clients unaffected)
- ✅ Swagger UI renders all 6 endpoints correctly
- ✅ OpenAPI spec validates against OpenAPI 3.1 spec

**Performance:**
- ✅ P95 latency unchanged (±5% tolerance)
- ✅ Error rate unchanged (0% target maintained)
- ✅ Cache hit ratio unchanged (73% target)

**Quality:**
- ✅ 100% test coverage for new schemas
- ✅ All existing tests pass
- ✅ Manual QA on Swagger UI

**Approval Required:** Engineering Lead sign-off before Phase 2 starts

---

## Phase 2: V2 API & Job Management (Weeks 4-6)

### Objectives

1. Complete v2 API migration for full OpenAPI spec
2. Migrate all job management endpoints (async operations)
3. Migrate batch operation endpoints (high complexity)
4. Establish SSE (Server-Sent Events) schema pattern

### Scope

**Endpoints (22):**
- V2 API: 5 endpoints
- Batch Operations: 6 endpoints
- Job Management: 11 endpoints

**Schemas to Create:**
- `src/schemas/v2-search.ts` - V2 search schemas (semantic, recommendations)
- `src/schemas/enrichment.ts` - Batch enrichment schemas
- `src/schemas/batch-scan.ts` - Batch scan schemas
- `src/schemas/csv-import.ts` - CSV import schemas
- `src/schemas/job-status.ts` - Job status/progress schemas
- `src/schemas/job-results.ts` - Job results schemas
- `src/schemas/token.ts` - Token refresh schemas
- `src/schemas/sse.ts` - Server-Sent Events schemas

**OpenAPI Routes to Create:**
- `src/openapi/routes/v2/` (5 files for v2 API)
- `src/openapi/routes/batch/` (6 files for batch ops)
- `src/openapi/routes/jobs/` (11 files for job management)

### Week-by-Week Breakdown

**Week 4: V2 API Core**
- Day 1-2: `/api/v2/search` - Semantic search with Vectorize
- Day 2-3: `/api/v2/books/enrich` - Single book enrichment
- Day 4: `/api/v2/recommendations/weekly` - Recommendation algorithm
- Day 5: Testing, validation, production deploy

**Week 5: Batch Operations**
- Day 1: `/v1/enrichment/batch` - Batch enrichment
- Day 2: `/api/batch-scan` - Batch scanning
- Day 2: `/api/scan-bookshelf/batch` - Bookshelf scanning
- Day 3: `/api/import/csv-gemini` - CSV import with AI
- Day 4: `/api/scan-bookshelf/cancel` - Job cancellation
- Day 4: `/v2/import/workflow` - Workflow trigger
- Day 5: Testing, validation, production deploy

**Week 6: Job Management & SSE**
- Day 1-2: `/api/v2/imports` - Job creation endpoint
- Day 2-3: `/api/v2/imports/:jobId/stream` - SSE progress (COMPLEX)
- Day 3: All `/v1/jobs/*` endpoints (status, results, delete)
- Day 4: All `/v1/scan/results/*` and `/v1/csv/*` endpoints
- Day 5: `/api/token/refresh`, testing, production deploy

### Success Criteria (Phase 2 Gate)

**Functional:**
- ✅ All 22 endpoints migrated and deployed
- ✅ SSE streaming works correctly in OpenAPI spec
- ✅ Job progress/status schemas accurate
- ✅ Batch operations validated with real jobs

**Performance:**
- ✅ Batch operation latency unchanged
- ✅ SSE connection stability maintained
- ✅ Job status polling rate unchanged

**Quality:**
- ✅ 100% test coverage for job schemas
- ✅ Manual QA on complex batch operations
- ✅ Load testing on batch endpoints

**Approval Required:** Product + Engineering sign-off before Phase 3

---

## Phase 3: Admin & Utilities (Weeks 7-8)

### Objectives

1. Complete migration of remaining production endpoints
2. Migrate admin and monitoring endpoints
3. Finalize Swagger UI with 100% coverage
4. Prepare for manual router removal (March 2026)

### Scope

**Endpoints (15):**
- Admin & Metrics: 7 endpoints
- Cache Management: 5 endpoints
- Utilities: 3 endpoints

**Schemas to Create:**
- `src/schemas/health.ts` - Health check schema
- `src/schemas/metrics.ts` - Prometheus metrics schema
- `src/schemas/cache.ts` - Cache metrics schemas
- `src/schemas/harvest.ts` - Harvest dashboard schemas
- `src/schemas/image-proxy.ts` - Image proxy schemas

**OpenAPI Routes to Create:**
- `src/openapi/routes/admin/` (4 files)
- `src/openapi/routes/cache/` (5 files)
- `src/openapi/routes/utils/` (3 files)

### Week-by-Week Breakdown

**Week 7: Admin & Metrics**
- Day 1: `/health` - Simple health check
- Day 1: `/metrics` - Prometheus metrics
- Day 2: `/admin/harvest-dashboard` - Dashboard HTML
- Day 3: `/images/proxy` - Image proxying
- Day 3-4: All `/api/cache/*` endpoints (5 total)
- Day 5: Testing, validation, production deploy

**Week 8: Final Consolidation**
- Day 1-2: Fix any outstanding issues from all phases
- Day 3: Swagger UI final polish (descriptions, tags, examples)
- Day 4: Update all documentation (API_CONTRACT.md, README.md)
- Day 5: Team training and handoff

### Success Criteria (Phase 3 Gate)

**Functional:**
- ✅ All 43 production endpoints migrated
- ✅ Swagger UI 100% coverage
- ✅ OpenAPI spec complete and valid
- ✅ All endpoints documented with examples

**Quality:**
- ✅ 100% test coverage maintained
- ✅ All manual QA passed
- ✅ Load testing on all endpoints

**Documentation:**
- ✅ API_CONTRACT.md updated
- ✅ Swagger UI live at `/doc`
- ✅ Migration guide written
- ✅ Team trained on OpenAPI workflow

**Final Approval:** Full stakeholder sign-off (Engineering, Product, Frontend)

---

## Migration Process

### Standard Migration Checklist

**For Each Endpoint:**

1. **Create Zod Schema** (`src/schemas/`)
   ```typescript
   // Example: src/schemas/search.ts
   import { z } from 'zod'
   import { createResponseEnvelopeSchema } from './common'

   export const SearchISBNParams = z.object({
     isbn: z.string().regex(/^\d{10}(\d{3})?$/),
     includeEditions: z.boolean().optional()
   })

   export const SearchISBNResponse = createResponseEnvelopeSchema(
     z.object({
       books: z.array(BookSchema),
       total: z.number()
     })
   )
   ```

2. **Create OpenAPI Route** (`src/openapi/routes/`)
   ```typescript
   // Example: src/openapi/routes/search-isbn.ts
   import { createRoute } from '@hono/zod-openapi'
   import { SearchISBNParams, SearchISBNResponse } from '../../schemas/search'

   export const searchISBNRoute = createRoute({
     method: 'get',
     path: '/v1/search/isbn',
     tags: ['Search'],
     summary: 'Search books by ISBN',
     request: {
       query: SearchISBNParams
     },
     responses: {
       200: {
         content: {
           'application/json': {
             schema: SearchISBNResponse
           }
         },
         description: 'Book search results'
       }
     }
   })
   ```

3. **Update Router** (`src/router.ts`)
   ```typescript
   // BEFORE
   app.get('/v1/search/isbn', async (c) => {
     return handleSearchISBN(c.req.raw, c.env)
   })

   // AFTER
   import { searchISBNRoute } from './openapi/routes/search-isbn'

   app.openapi(searchISBNRoute, async (c) => {
     const validated = c.req.valid('query')
     return handleSearchISBN(c.req.raw, c.env, validated)
   })
   ```

4. **Update Handler** (if needed)
   ```typescript
   // Add type safety with validated params
   export async function handleSearchISBN(
     request: Request,
     env: Env,
     params?: z.infer<typeof SearchISBNParams>
   ) {
     const isbn = params?.isbn || new URL(request.url).searchParams.get('isbn')
     // ... rest of handler
   }
   ```

5. **Write Tests**
   ```typescript
   // tests/unit/search-isbn.test.ts
   describe('Search ISBN OpenAPI', () => {
     it('validates ISBN format', async () => {
       const response = await app.request('/v1/search/isbn?isbn=invalid')
       expect(response.status).toBe(400)
     })

     it('returns valid response envelope', async () => {
       const response = await app.request('/v1/search/isbn?isbn=9780439708180')
       const data = await response.json()
       expect(SearchISBNResponse.safeParse(data).success).toBe(true)
     })
   })
   ```

6. **Deploy & Monitor**
   - Deploy to production
   - Monitor error rates for 24 hours
   - Check Swagger UI rendering
   - Validate backward compatibility

---

## Success Criteria & Gates

### Phase Gates

**Each phase must meet ALL criteria before proceeding to next phase:**

1. **Functional Completeness**
   - All endpoints in phase migrated
   - 100% backward compatibility
   - Swagger UI accurate
   - OpenAPI spec validates

2. **Performance Stability**
   - P95 latency within ±5%
   - Error rate unchanged (0% target)
   - Cache hit ratio maintained

3. **Quality Assurance**
   - 100% test coverage for new schemas
   - All existing tests pass
   - Manual QA complete

4. **Production Validation**
   - 24-hour soak test in production
   - No user-reported issues
   - Monitoring dashboards green

5. **Stakeholder Approval**
   - Engineering lead sign-off
   - (Phase 3 only) Product + Frontend sign-off

**If ANY criteria not met:** Pause migration, fix issues, re-validate before proceeding

---

## Rollback Strategy

### Rollback Mechanisms

**Level 1: Endpoint Rollback (Per-Endpoint)**
```typescript
// Immediate rollback: Replace app.openapi() with app.get()
// BEFORE ROLLBACK (OpenAPI)
app.openapi(searchISBNRoute, async (c) => { ... })

// AFTER ROLLBACK (Legacy)
app.get('/v1/search/isbn', async (c) => { ... })
```
**Time to Rollback:** <5 minutes
**When to Use:** Single endpoint causing issues

**Level 2: Phase Rollback (All Endpoints in Phase)**
- Revert all changes from current phase
- Deploy previous commit
- Keep previous phase endpoints as OpenAPI
**Time to Rollback:** <15 minutes
**When to Use:** Multiple endpoints in phase failing

**Level 3: Full Rollback (All OpenAPI)**
- Feature flag: Disable OpenAPI router entirely
- Fallback to manual router (still exists until March 2026)
**Time to Rollback:** <5 minutes (feature flag flip)
**When to Use:** Critical system-wide issue

### Rollback Triggers

**Automatic Rollback:**
- Error rate > 0.5% for 5 minutes
- P95 latency > 2x baseline for 10 minutes
- Schema validation failures > 1% of requests

**Manual Rollback:**
- User-reported critical issues
- Data integrity concerns
- Incorrect schema validation

---

## Testing Requirements

### Unit Tests

**For Each Endpoint:**
1. **Request Validation**
   - Valid params pass validation
   - Invalid params rejected with 400
   - Optional params work correctly

2. **Response Validation**
   - Response matches schema
   - Metadata included correctly
   - Error responses follow format

3. **Backward Compatibility**
   - Existing client requests work unchanged
   - Response format identical to legacy

**Example:**
```typescript
describe('GET /v1/search/isbn (OpenAPI)', () => {
  it('validates ISBN-13 format', async () => {
    const res = await app.request('/v1/search/isbn?isbn=9780439708180')
    expect(res.status).toBe(200)
  })

  it('rejects invalid ISBN', async () => {
    const res = await app.request('/v1/search/isbn?isbn=invalid')
    expect(res.status).toBe(400)
  })

  it('returns ResponseEnvelope format', async () => {
    const res = await app.request('/v1/search/isbn?isbn=9780439708180')
    const data = await res.json()
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('metadata')
  })
})
```

### Integration Tests

**For Each Phase:**
1. **End-to-End Flow**
   - Real request → handler → external API → response
   - Schema validation at every step
   - Response time within SLA

2. **Error Handling**
   - External API failures handled gracefully
   - Circuit breaker triggers correctly
   - Error responses follow schema

3. **Performance**
   - Load test with 100 concurrent requests
   - Ensure no memory leaks
   - Cache behavior correct

### Manual QA

**For Each Phase:**
1. **Swagger UI Testing**
   - All endpoints render correctly
   - Try-it-out feature works
   - Examples are accurate

2. **Cross-Browser Testing**
   - Swagger UI works in Chrome, Firefox, Safari
   - OpenAPI spec downloads correctly

3. **Client Integration Testing**
   - iOS app makes successful requests
   - Dashboard makes successful requests
   - No breaking changes detected

---

## Timeline & Resource Planning

### Resource Requirements

**Engineering:**
- **1 Senior Backend Engineer** - Full-time for 8-10 weeks
- **1 QA Engineer** - Part-time (20% capacity) for testing
- **1 Frontend Engineer** - On-call for integration testing

**Non-Engineering:**
- **Product Manager** - Approval gates, stakeholder communication
- **Technical Writer** - Documentation updates (Week 8)

### Timeline

```
Week 1-3:  Phase 1 (Core Search API)
           └─ Gate 1: Stakeholder approval
Week 4-6:  Phase 2 (V2 API & Job Management)
           └─ Gate 2: Stakeholder approval
Week 7-8:  Phase 3 (Admin & Utilities)
           └─ Gate 3: Final approval
Week 9-10: Buffer for issues, documentation, training
```

**Total Duration:** 8-10 weeks (40-50 working days)

### Weekly Effort Breakdown

| Week | Phase | Endpoints | Effort (days) | Buffer (days) | Total |
|------|-------|-----------|---------------|---------------|-------|
| 1 | Phase 1.1 | 3 | 4 | 1 | 5 |
| 2 | Phase 1.2 | 3 | 4 | 1 | 5 |
| 3 | Phase 1.3 | Buffer | 2 | 3 | 5 |
| 4 | Phase 2.1 | 5 | 4 | 1 | 5 |
| 5 | Phase 2.2 | 6 | 4 | 1 | 5 |
| 6 | Phase 2.3 | 11 | 4 | 1 | 5 |
| 7 | Phase 3.1 | 10 | 4 | 1 | 5 |
| 8 | Phase 3.2 | 5 | 3 | 2 | 5 |
| 9-10 | Buffer | - | 0 | 10 | 10 |

**Total Effort:** 29 working days
**Total Buffer:** 21 days (42% buffer for issues/unknowns)
**Total Duration:** 50 days (10 weeks)

---

## Risk Mitigation

### Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Schema validation breaks clients** | Medium | High | 100% backward compat testing, gradual rollout |
| **SSE streaming doesn't work in OpenAPI** | Medium | Medium | POC SSE endpoint before Phase 2, fallback plan |
| **Performance regression** | Low | High | Load testing each phase, rollback if P95 > 2x |
| **Developer learning curve** | High | Low | Training in Week 1, pair programming |
| **Scope creep** | Medium | Medium | Strict phase gates, no new features during migration |
| **Resource availability** | Medium | High | Buffer weeks, backup engineer identified |

### Contingency Plans

**If SSE doesn't work in OpenAPI:**
- Document SSE endpoints separately (not in OpenAPI spec)
- Use custom OpenAPI extension for SSE
- Fallback: Keep SSE endpoints as legacy routes

**If performance regresses:**
- Immediate rollback to previous version
- Investigate root cause (likely schema validation overhead)
- Optimize Zod validation or add caching

**If timeline slips:**
- Re-prioritize: Phase 1 & 2 critical, Phase 3 can defer
- Reduce scope: Skip low-usage endpoints
- Add resources: Bring in second engineer

---

## Deliverables

### Code Deliverables

- ✅ 43 OpenAPI route definitions (`src/openapi/routes/`)
- ✅ 15+ Zod schema files (`src/schemas/`)
- ✅ Updated router with all OpenAPI endpoints
- ✅ 100+ new unit tests for schema validation
- ✅ Integration tests for each phase

### Documentation Deliverables

- ✅ Updated API_CONTRACT.md (v3.0 with OpenAPI)
- ✅ Swagger UI live at `/doc`
- ✅ OpenAPI spec at `/doc/openapi.json`
- ✅ Migration guide for future endpoints
- ✅ Developer training materials

### Process Deliverables

- ✅ Standard migration checklist (reusable)
- ✅ Testing requirements template
- ✅ Rollback runbook
- ✅ Performance baseline documentation

---

## Next Steps

### To Start Phase 1

1. **Stakeholder Alignment**
   - Present this plan to Engineering Lead
   - Get Product Manager buy-in
   - Schedule weekly check-ins

2. **Environment Setup**
   - Create feature branch: `feature/openapi-phase1`
   - Set up monitoring dashboards
   - Prepare rollback scripts

3. **Kick-Off (Week 1, Day 1)**
   - Team training on Zod + OpenAPIHono
   - Create first schema: `src/schemas/search.ts`
   - Migrate first endpoint: `GET /v1/search/isbn`
   - Deploy to production, monitor for 24h

4. **Weekly Cadence**
   - Monday: Plan week's endpoints
   - Tuesday-Thursday: Migrate + test
   - Friday: Deploy, validate, review

---

## Appendix

### A. Schema Naming Conventions

**Request Parameters:**
- Query params: `{Feature}{Action}Params` (e.g., `SearchISBNParams`)
- Body params: `{Feature}{Action}Body` (e.g., `EnrichBookBody`)

**Responses:**
- Success: `{Feature}{Action}Response` (e.g., `SearchISBNResponse`)
- Error: Use `ErrorResponse` from `common.ts`

**Nested Objects:**
- Use descriptive names: `JobProgressUpdate`, `CacheMetric`, `BookMetadata`

### B. OpenAPI Route Naming Conventions

**File Names:**
- Use kebab-case: `search-isbn.ts`, `batch-enrichment.ts`
- Group by feature: `routes/search/`, `routes/jobs/`, `routes/admin/`

**Route Exports:**
- Export const: `export const searchISBNRoute = createRoute(...)`
- Consistent naming: `{feature}{Action}Route`

### C. Useful Resources

**Documentation:**
- Hono OpenAPI: https://hono.dev/guides/zod-openapi
- Zod: https://zod.dev
- OpenAPI 3.1: https://spec.openapis.org/oas/v3.1.0

**Examples:**
- POC: `src/openapi/routes/capabilities.ts`
- Existing schemas: `src/schemas/common.ts`, `src/schemas/book.ts`

---

**Document Version:** 1.0
**Last Updated:** November 28, 2025
**Maintained By:** Backend Platform Team
**Next Review:** After Phase 1 completion
