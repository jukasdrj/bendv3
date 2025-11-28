# OpenAPI Fast-Track Implementation Plan - 3 Sprints (30 Days)

**Project:** BooksTrack Backend OpenAPI Migration - TypeScript SDK Auto-Generation
**Duration:** 30 working days (6 weeks calendar time)
**Goal:** Eliminate frontend/backend sync issues permanently via TypeScript SDK
**Status:** Ready to Execute
**Created:** November 28, 2025

---

## ⚠️ Critical Blockers - RESOLVED ✅

**Status:** Both blockers resolved as of November 28, 2025

### Blocker 1: Missing SDK Generation Tooling ✅ RESOLVED

**Original Issue:** Plan relied on `openapi-typescript-codegen`, which wasn't installed

**Resolution:**
- **New Approach:** Using `openapi-typescript` + `openapi-fetch` (modern, lightweight stack)
- **Package Created:** `packages/api-client/` with all dependencies installed
- **Benefits:**
  - ~2KB client (vs 50KB+ with old generators)
  - Tree-shakable (unused endpoints excluded from bundle)
  - Better TypeScript support, no runtime overhead
  - Well-maintained, widely adopted in 2025

**Implementation:**
```bash
packages/api-client/
├── package.json          # Dependencies: openapi-typescript, openapi-fetch
├── tsconfig.json         # TypeScript config
├── src/
│   ├── index.ts          # Client wrapper with createBooksTrackClient()
│   └── schema.ts         # Auto-generated from openapi.yaml
├── dist/                 # Build output
└── README.md             # Comprehensive integration guide
```

### Blocker 2: No Frontend Repository Reference ✅ RESOLVED

**Original Issue:** Plan assumed `../frontend/` directory exists (it doesn't)

**Resolution:**
- **New Approach:** Publish SDK as private npm package to GitHub Packages
- **Package Name:** `@bookstrack/api-client`
- **Delivery:** Auto-published via GitHub Actions on every deploy
- **Benefits:**
  - Decoupled frontend/backend release cycles
  - Semantic versioning for breaking changes
  - Standard npm workflow for frontend teams
  - No filesystem coupling required

**Implementation:**
```yaml
# .github/workflows/publish-sdk.yml
- Triggers on: main branch push, openapi.yaml changes, releases
- Generates SDK from docs/openapi.yaml
- Publishes to GitHub Packages
- Creates artifacts for manual download (30-day retention)
```

**Frontend Integration:**
```bash
# frontend/.npmrc
@bookstrack:registry=https://npm.pkg.github.com

# Install SDK
npm install @bookstrack/api-client
```

**No Project Structure Changes Needed** - `packages/api-client/` is self-contained

---

## Executive Summary

### Business Problem
Frontend and backend are constantly out of sync, blocking user feature delivery and preventing user base growth. Breaking changes are discovered in production, causing repeated frontend bugs.

### Solution
Implement OpenAPI + TypeScript SDK auto-generation to create a single source of truth for API contracts. This eliminates manual type definitions in the frontend and prevents sync issues.

### Approach
Fast-track migration focused on **user-facing endpoints** (20 endpoints, not all 48) with TypeScript SDK auto-published on every backend deploy. Skip admin/test endpoints to reduce timeline from 10 weeks to 6 weeks.

### Key Deliverables
- **Sprint 1 (Days 1-10):** Foundation + Critical Search - 6 endpoints migrated, SDK v1.0.0, contract validation active
- **Sprint 2 (Days 11-20):** Complete Job Coverage + Batch Operations - 13 total endpoints, SDK v2.0.0 auto-published
- **Sprint 3 (Days 21-30):** Complete Coverage + Long-Term Sustainability - 20 total endpoints, SDK v3.0.0, team trained

### Success Criteria
- Zero frontend bugs from API changes
- TypeScript SDK auto-published on every deploy
- Frontend team NEVER writes API types manually
- Breaking changes detected in CI/CD before production

---

## Sprint 1: Foundation & Critical Search (Days 1-10)

### Objective
Stop breaking production TODAY with contract validation, migrate critical search endpoints, deliver first TypeScript SDK to frontend team.

### Days 1-2: Emergency Foundation (Contract Enforcement)

**Goal:** Prevent breaking changes from reaching production

**Tasks:**
1. **Enable Contract Validation Middleware** (4 hours)
   ```typescript
   // src/router.ts
   import { validateResponse } from './middleware/api-contract-validator'

   // Add to ALL routes
   app.use('*', validateResponse)
   ```
   - Deploy to production immediately
   - Monitor logs for contract violations
   - Configure strict mode (500 errors on schema mismatch)

2. **Breaking Change Detection Script** (4 hours)
   ```typescript
   // scripts/detect-breaking-changes.ts
   // Compare OpenAPI spec from main branch vs current branch
   // Fail CI if breaking changes without version bump
   ```
   - Implement using `oasdiff` library
   - Test with sample schema changes
   - Document version bump requirements

3. **CI/CD Integration** (2 hours)
   ```yaml
   # .github/workflows/contract-check.yml
   - name: Detect breaking changes
     run: npx oasdiff breaking openapi-main.json openapi-current.json
   - name: Block if breaking without version bump
     run: npm run validate-version-bump
   ```

**Deliverables:**
- ✅ CI/CD blocks breaking changes from deploying
- ✅ Contract validation active in production
- ✅ Breaking change detection script tested

**Testing:**
- Verify CI fails on breaking change without version bump
- Verify contract validation logs violations
- Test rollback procedure (should complete in <5 min)

---

### Days 3-5: First 3 Critical Endpoints

**Goal:** Migrate highest-usage search endpoints, generate first SDK

**Endpoints (Priority Order):**
1. `GET /v1/search/isbn` (Day 3)
2. `GET /v1/search/title` (Day 4)
3. `GET /health` (Day 5 - simple endpoint for testing)

**Migration Process (Per Endpoint):**

**Step 1: Create Zod Schemas** (2 hours)
```typescript
// src/schemas/search.ts
import { z } from 'zod'

export const SearchISBNQuerySchema = z.object({
  isbn: z.string().regex(/^\d{10}$|^\d{13}$/, 'Invalid ISBN format'),
  includeEditions: z.boolean().optional().default(false)
})

export const SearchISBNResponseSchema = ResponseEnvelopeSchema(BookSchema)
```

**Step 2: Define OpenAPI Route** (1 hour)
```typescript
// src/openapi/routes/search.ts
import { createRoute } from '@hono/zod-openapi'

export const searchISBNRoute = createRoute({
  method: 'get',
  path: '/v1/search/isbn',
  request: {
    query: SearchISBNQuerySchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SearchISBNResponseSchema
        }
      },
      description: 'Book found successfully'
    }
  }
})
```

**Step 3: Migrate Handler** (2 hours)
```typescript
// src/router.ts
import { searchISBNRoute } from './openapi/routes/search'

app.openapi(searchISBNRoute, async (c) => {
  const { isbn, includeEditions } = c.req.valid('query')
  const result = await handleSearchISBN(isbn, includeEditions, c.env)
  return c.json(result)
})
```

**Step 4: Testing** (2 hours)
- Run full test suite (`npm run test:safe`)
- Manual testing via Swagger UI (`/doc`)
- Verify backward compatibility (existing clients unaffected)
- Performance check (P95 latency within ±5%)

**Step 5: Deploy & Monitor** (1 hour)
- Deploy to production
- Monitor error rate for 24 hours
- Verify cache hit ratio maintained
- Check contract validation logs

**Deliverables (Day 5 End):**
- ✅ 3 endpoints migrated to OpenAPI
- ✅ Swagger UI shows all 3 endpoints
- ✅ 100% backward compatibility maintained
- ✅ Zero production errors

---

### Days 6-7: Generate & Publish First SDK

**Goal:** Deliver TypeScript SDK v1.0.0 to frontend team

**UPDATED APPROACH:** Using `openapi-typescript` + `openapi-fetch` for lightweight, tree-shakable SDK (~2KB vs bloated generators)

**Tasks:**

**Day 6: SDK Package Setup**

1. **SDK Package Already Created** ✅
   ```bash
   # Located at: packages/api-client/
   # Dependencies installed: openapi-typescript, openapi-fetch
   ```

2. **Generate SDK Types** (1 hour)
   ```bash
   cd packages/api-client
   npm run generate
   # Generates src/schema.ts from docs/openapi.yaml
   ```

3. **Test SDK Locally** (2 hours)
   ```typescript
   // Test in packages/api-client/test.ts
   import { createBooksTrackClient } from './src/index'

   const client = createBooksTrackClient({
     baseUrl: 'http://localhost:8787'
   })

   const { data, error } = await client.GET('/v1/search/isbn', {
     params: { query: { isbn: '9780439708180' } }
   })

   if (!error) {
     console.log(data.data.title) // TypeScript autocomplete works!
   }
   ```

4. **Build SDK** (30 min)
   ```bash
   npm run build
   # Outputs to dist/ with TypeScript declarations
   ```

**Day 7: Publish SDK v1.0.0**

1. **Publish to GitHub Packages** (1 hour)
   ```bash
   cd packages/api-client
   npm publish
   # Auto-publishes to https://npm.pkg.github.com/@bookstrack/api-client
   ```

2. **Frontend Integration Guide** (2 hours)
   - README.md already created with comprehensive examples ✅
   - Includes React, Vue, Svelte framework examples
   - Documents error handling, circuit breakers, WebSocket integration
   - Migration guide from legacy API

3. **Frontend Team Onboarding** (3 hours)
   ```bash
   # Frontend repo setup
   echo "@bookstrack:registry=https://npm.pkg.github.com" >> .npmrc
   npm install @bookstrack/api-client@1.0.0
   ```
   - Replace manual fetch calls with SDK
   - Remove hand-written types
   - Test all 3 migrated endpoints
   - Verify tree-shaking (bundle size check)

4. **Documentation** (2 hours)
   - Update API_CONTRACT.md with SDK usage
   - Link to packages/api-client/README.md for full guide
   - Document version bumping process

**Deliverables:**
- ✅ TypeScript SDK v1.0.0 published to GitHub Packages
- ✅ Frontend team using SDK for search endpoints
- ✅ Comprehensive SDK documentation (README.md) ✅
- ✅ Zero manual API types in frontend
- ✅ ~2KB client (vs 50KB+ with old generators)

---

### Days 8-10: Validation & Buffer

**Goal:** Ensure stability before Sprint 2

**Day 8: End-to-End Testing**
- Frontend team validates SDK integration (4 hours)
- Load testing (500 req/min for 10 minutes)
- Error rate monitoring (target: 0%)
- Performance regression testing (P95 latency)

**Day 9: Documentation Sprint**
- Update OPENAPI_MIGRATION_EXECUTIVE_SUMMARY.md
- Document lessons learned from first 3 endpoints
- Create troubleshooting guide for common issues
- Record demo video of Swagger UI + SDK usage

**Day 10: Sprint Retrospective & Planning**
- Review success metrics (all green?)
- Identify blockers for Sprint 2
- Adjust endpoint priorities based on frontend feedback
- Prepare Sprint 2 Zod schemas in advance

**Sprint 1 Success Criteria:**
- ✅ CI/CD blocks breaking changes
- ✅ Contract validation active in production
- ✅ 3 endpoints migrated (search/isbn, search/title, health)
- ✅ TypeScript SDK v1.0.0 published and in use
- ✅ Frontend team reports zero sync issues
- ✅ 100% backward compatibility maintained
- ✅ Zero production errors from migration

---

## Sprint 2: Complete Job Coverage + Batch Operations (Days 11-20)

### Objective
Cover 80% of user-facing functionality with OpenAPI, focus on async operations (jobs, batches), auto-publish SDK on every deploy.

### Days 11-13: Job Management Endpoints (7 endpoints)

**Goal:** Migrate all job creation, status, and result endpoints

**Endpoints:**
1. `POST /api/v2/imports` - Create CSV/scan job (Day 11)
2. `GET /api/v2/imports/:jobId` - Job status (Day 11)
3. `GET /api/v2/imports/:jobId/results` - Job results (Day 12)
4. `GET /v1/jobs/:jobId/status` - Legacy job status (Day 12)
5. `GET /v1/scan/results/:jobId` - Scan results (Day 13)
6. `GET /v1/csv/results/:jobId` - CSV results (Day 13)
7. `GET /v1/csv/status/:jobId` - CSV status (Day 13)

**Complexity:** HIGH - Job state schemas, progress tracking, error states

**Schemas to Create:**
```typescript
// src/schemas/job.ts
export const JobStateSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['initialized', 'processing', 'completed', 'failed', 'canceled']),
  progress: z.number().min(0).max(1),
  pipeline: z.enum(['csv_import', 'batch_enrichment', 'ai_scan']),
  totalItems: z.number().int().nonnegative(),
  processedItems: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).optional()
})

export const JobResultsSchema = z.object({
  jobId: z.string().uuid(),
  results: z.array(BookSchema),
  errors: z.array(z.object({
    isbn: z.string(),
    error: z.string()
  }))
})
```

**Migration Process (7 endpoints × 1.5 days = ~3 days):**
- Follow same pattern as Sprint 1
- Focus on schema accuracy (job states are complex)
- Test WebSocket integration (jobs send progress updates)
- Verify backward compatibility with existing job polling

**Deliverables (Day 13 End):**
- ✅ 7 job endpoints migrated (10 total)
- ✅ Job state schemas validated
- ✅ WebSocket integration tested
- ✅ SDK updated with job management types

---

### Days 14-16: Batch Operations (3 endpoints)

**Goal:** Migrate high-value batch endpoints

**Endpoints:**
1. `POST /api/batch-scan` - Batch barcode scanning (Day 14)
2. `POST /api/import/csv-gemini` - CSV import with Gemini parsing (Day 15)
3. `POST /v1/enrichment/batch` - Batch book enrichment (Day 16)

**Complexity:** VERY HIGH - Large request bodies, streaming responses, rate limiting

**Schemas to Create:**
```typescript
// src/schemas/batch.ts
export const BatchScanRequestSchema = z.object({
  images: z.array(z.string().url()).max(50), // Max 50 images
  userId: z.string().optional()
})

export const BatchScanResponseSchema = ResponseEnvelopeSchema(
  z.object({
    jobId: z.string().uuid(),
    status: z.literal('initialized'),
    totalImages: z.number().int(),
    estimatedTimeSeconds: z.number().int()
  })
)

export const CSVImportRequestSchema = z.object({
  csvContent: z.string().max(5 * 1024 * 1024), // Max 5MB
  columns: z.array(z.string()),
  userId: z.string().optional()
})
```

**Special Considerations:**
- Request body size limits (max 5MB CSV)
- Streaming response support (SSE for progress)
- Rate limiting (10 req/min per IP)
- Cost monitoring (Gemini API usage)

**Migration Process:**
- Day 14: batch-scan (4 hours schema, 4 hours testing)
- Day 15: csv-gemini (6 hours - complex Gemini integration)
- Day 16: batch enrichment (4 hours)

**Deliverables (Day 16 End):**
- ✅ 3 batch endpoints migrated (13 total)
- ✅ Large request body handling validated
- ✅ Rate limiting tested
- ✅ Cost monitoring enabled

---

### Days 17-18: Auto-Publish SDK Pipeline

**Goal:** SDK auto-publishes on every backend deploy (no manual steps)

**UPDATED APPROACH:** GitHub Actions workflow already created at `.github/workflows/publish-sdk.yml` ✅

**Day 17: Test & Validate GitHub Actions Workflow**

**Workflow Already Configured** ✅
- Located at: `.github/workflows/publish-sdk.yml`
- Triggers on:
  - Push to `main` branch
  - Changes to `docs/openapi.yaml` or `packages/api-client/**`
  - Manual workflow dispatch
  - New releases

**Workflow Steps:**
1. Generate SDK from `docs/openapi.yaml` using `openapi-typescript`
2. Build SDK package
3. Publish to GitHub Packages (using `GITHUB_TOKEN`)
4. Create artifact for manual download (30-day retention)

**Testing Tasks** (4 hours)
```bash
# 1. Test local SDK generation
cd packages/api-client
npm run generate
npm run build

# 2. Make test change to trigger workflow
echo "# Test" >> docs/openapi.yaml
git add docs/openapi.yaml
git commit -m "test: Trigger SDK auto-publish workflow"
git push origin main

# 3. Monitor GitHub Actions
# Navigate to: https://github.com/yourusername/bendv3/actions
# Verify "Publish SDK" workflow runs successfully

# 4. Verify package published
# Check: https://github.com/yourusername/bendv3/packages
```

**Day 18: Frontend Dependabot Integration**

**Create `frontend/.github/dependabot.yml`:**
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: daily
    allow:
      - dependency-name: "@bookstrack/api-client"
```

**Frontend .npmrc Setup:**
```bash
# frontend/.npmrc
@bookstrack:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**Test End-to-End Workflow:**
1. Make trivial backend change (add comment to schema)
2. Push to main → GitHub Actions triggers
3. Verify SDK auto-publishes to GitHub Packages
4. Verify Dependabot detects new version
5. Verify Dependabot creates PR in frontend repo

**Deliverables:**
- ✅ SDK auto-publishes on every backend deploy (GitHub Actions configured)
- ✅ Frontend Dependabot auto-updates SDK
- ✅ Zero manual SDK generation steps
- ✅ Artifacts uploaded for manual access (30-day retention)
- ✅ Uses GITHUB_TOKEN (no external secrets needed)

---

### Days 19-20: Sprint 2 Validation & Buffer

**Day 19: End-to-End Testing**
- Frontend team tests all 13 migrated endpoints
- Load testing (1000 req/min for 20 minutes)
- Batch operation stress testing (50 concurrent jobs)
- WebSocket stress testing (100 concurrent connections)

**Day 20: Documentation & Retrospective**
- Update API_CONTRACT.md with all new endpoints
- Document auto-publish SDK workflow
- Create troubleshooting guide for SDK sync issues
- Sprint 2 retrospective

**Sprint 2 Success Criteria:**
- ✅ 13 endpoints total migrated (job + batch coverage)
- ✅ SDK v2.0.0 auto-published on deploy
- ✅ Frontend team using SDK for all migrated endpoints
- ✅ Zero manual SDK generation or publishing
- ✅ Breaking changes detected in CI before production
- ✅ Dependabot auto-updates SDK in frontend
- ✅ 100% backward compatibility maintained
- ✅ Error rate < 0.1%

---

## Sprint 3: Complete Coverage + Long-Term Sustainability (Days 21-30)

### Objective
Migrate remaining user-facing endpoints, finalize team training, establish long-term SDK maintenance workflow.

### Days 21-23: Advanced Search Endpoints (7 endpoints)

**Goal:** Complete search API coverage

**Endpoints:**
1. `GET /api/v2/search` - Semantic search (Day 21)
2. `POST /api/v2/books/enrich` - Single book enrichment (Day 21)
3. `GET /v1/search/advanced` - Advanced search (Day 22)
4. `GET /v1/search/similar` - Similar books (Day 22)
5. `GET /v1/search/semantic` - Legacy semantic search (Day 23)
6. `GET /v1/editions/search` - Edition search (Day 23)
7. `GET /v1/search/author` - Author search (Day 23)

**Complexity:** MEDIUM - Existing stable endpoints

**Migration Process:**
- 2 endpoints per day
- Focus on query parameter validation
- Test semantic search accuracy (no regressions)
- Verify cache hit ratios maintained

**Deliverables (Day 23 End):**
- ✅ 20 endpoints total migrated
- ✅ 100% search API coverage in OpenAPI
- ✅ SDK v3.0.0 published

---

### Days 24-25: WebSocket Documentation

**Goal:** Document WebSocket separately (not migrated to OpenAPI)

**Why Separate:**
- WebSocket protocol incompatible with OpenAPI 3.1
- Existing implementation works perfectly
- Would require AsyncAPI spec (different standard)

**Documentation Approach:**
```markdown
# WebSocket API Documentation

## Connection
ws://api.oooefam.net/ws/progress?jobId={uuid}&token={auth}

## Message Format
{
  "type": "progress",
  "jobId": "uuid",
  "progress": 0.5,
  "message": "Processing batch 5 of 10"
}

## Client SDK Usage (TypeScript)
const ws = new WebSocket(`wss://api.oooefam.net/ws/progress?jobId=${jobId}`)
ws.onmessage = (event) => {
  const data: ProgressUpdate = JSON.parse(event.data)
  console.log(data.progress)
}
```

**Deliverables:**
- ✅ WebSocket API documented in API_CONTRACT.md
- ✅ TypeScript types provided for WebSocket messages
- ✅ Example client code in SDK docs

---

### Days 26-27: Team Training & Handoff

**Goal:** Ensure team can maintain SDK workflow independently

**Day 26: Developer Training (4 hours)**

**Training Agenda:**
1. **OpenAPI Fundamentals** (1 hour)
   - Zod schema composition
   - Route definition patterns
   - Backward compatibility rules

2. **SDK Workflow** (1 hour)
   - How auto-publish works
   - Version bumping (semver)
   - Breaking change detection

3. **Troubleshooting** (1 hour)
   - SDK generation failures
   - Schema validation errors
   - Rollback procedures

4. **Hands-On Exercise** (1 hour)
   - Add new endpoint from scratch
   - Trigger SDK auto-publish
   - Fix breaking change error

**Day 27: Documentation Finalization**

**Create Comprehensive Guides:**
1. **OPENAPI_DEVELOPER_GUIDE.md** (2 hours)
   - Adding new endpoints
   - Modifying existing schemas
   - Testing checklist
   - Common mistakes

2. **SDK_MAINTENANCE_GUIDE.md** (2 hours)
   - Version bumping strategy
   - Breaking vs non-breaking changes
   - Deprecation workflow
   - Emergency rollback

3. **TROUBLESHOOTING_GUIDE.md** (2 hours)
   - Common SDK generation errors
   - Schema validation failures
   - Frontend integration issues
   - Performance debugging

**Deliverables:**
- ✅ Team trained on OpenAPI + SDK workflow
- ✅ 3 comprehensive maintenance guides
- ✅ Recorded training video
- ✅ Hands-on exercise completed by all team members

---

### Days 28-30: Final Validation & Launch

**Day 28: Full System Testing**
- End-to-end testing (all 20 endpoints)
- Load testing (5000 req/min for 1 hour)
- Chaos testing (random endpoint failures)
- SDK compatibility testing (multiple SDK versions)

**Day 29: Production Hardening**
- Enable contract validation in strict mode
- Configure breaking change alerts (Slack/email)
- Set up SDK health dashboard (npm downloads, error rates)
- Document rollback procedures for all 3 levels

**Day 30: Launch & Celebration**
- Final sprint retrospective
- Measure success metrics (all green?)
- Announce SDK launch to organization
- Document long-term maintenance plan
- **CELEBRATE ZERO SYNC ISSUES** 🎉

**Sprint 3 Success Criteria:**
- ✅ 20 endpoints total migrated (95% user-facing coverage)
- ✅ SDK v3.0.0 published and stable
- ✅ Team fully trained on SDK workflow
- ✅ Contract validation active in strict mode
- ✅ Breaking change detection integrated with CI/CD
- ✅ Frontend team NEVER writes API types manually
- ✅ Zero frontend bugs from API changes
- ✅ Zero sync issues for 30 days

---

## Testing Strategy

### Unit Testing (Per Endpoint)
```typescript
// Example: tests/unit/search-isbn.test.ts
describe('GET /v1/search/isbn OpenAPI', () => {
  it('should validate query parameters', async () => {
    const response = await app.request('/v1/search/isbn?isbn=invalid')
    expect(response.status).toBe(400)
  })

  it('should return canonical response format', async () => {
    const response = await app.request('/v1/search/isbn?isbn=9780439708180')
    const data = await response.json()
    expect(data).toMatchObject({
      success: true,
      data: expect.any(Object),
      metadata: expect.any(Object)
    })
  })

  it('should maintain backward compatibility', async () => {
    const response = await app.request('/v1/search/isbn?isbn=9780439708180')
    const data = await response.json()
    // Verify response matches API_CONTRACT.md schema
  })
})
```

### Integration Testing (Per Sprint)
```typescript
// Example: tests/integration/sdk-generation.test.ts
describe('TypeScript SDK Generation', () => {
  it('should generate valid TypeScript SDK', async () => {
    const spec = await fetch('http://localhost:8787/doc/openapi.json')
    const sdk = await generateSDK(spec)
    expect(sdk).toContain('export class BooksTrackAPI')
  })

  it('should include all migrated endpoints', async () => {
    const sdk = await generateSDK(spec)
    expect(sdk).toContain('searchByIsbn')
    expect(sdk).toContain('searchByTitle')
    // ... all endpoints
  })
})
```

### Contract Testing (CI/CD)
```yaml
# .github/workflows/contract-check.yml
- name: Validate OpenAPI spec
  run: npx swagger-cli validate doc/openapi.json

- name: Detect breaking changes
  run: npx oasdiff breaking openapi-main.json openapi-current.json

- name: Verify backward compatibility
  run: npm run test:compatibility
```

### Performance Testing (End of Sprint)
```bash
# Load testing with autocannon
npx autocannon -c 100 -d 60 https://api.oooefam.net/v1/search/isbn?isbn=9780439708180

# Expected results:
# - P95 latency: < 500ms
# - Error rate: < 0.1%
# - Throughput: > 1000 req/sec
```

---

## Rollback Procedures

### Level 1: Endpoint Rollback (<5 minutes)

**When:** Single endpoint causing issues

**Procedure:**
```typescript
// src/router.ts
// Comment out problematic endpoint
// app.openapi(problematicRoute, handler)  // TEMPORARILY DISABLED

// Add legacy fallback
app.get('/v1/search/isbn', legacyHandler)
```

**Deploy:**
```bash
npx wrangler deploy
# Verify health check
curl -f https://api.oooefam.net/health
```

---

### Level 2: Sprint Rollback (<15 minutes)

**When:** Multiple endpoints causing issues

**Procedure:**
```bash
# Git rollback to previous sprint tag
git checkout sprint-1-stable
npx wrangler deploy

# Verify health check
curl -f https://api.oooefam.net/health
curl -f https://api.oooefam.net/doc/openapi.json
```

**SDK Rollback:**
```bash
# Revert frontend to previous SDK version
cd frontend/
npm install @bookstrack/api-client@1.0.0
```

---

### Level 3: Full Rollback (<5 minutes, Feature Flag)

**When:** Entire OpenAPI system unstable

**Procedure:**
```typescript
// src/router.ts
const OPENAPI_ENABLED = false  // Emergency disable

if (OPENAPI_ENABLED) {
  // OpenAPI routes
} else {
  // Legacy routes (still in codebase)
}
```

**Deploy:**
```bash
npx wrangler deploy --env production
# Immediate rollback, no code changes needed
```

---

## Risk Mitigation

### Risk 1: Breaking Changes Slip Through

**Likelihood:** MEDIUM
**Impact:** HIGH (frontend breaks in production)

**Mitigation:**
- Contract validation middleware (strict mode)
- Breaking change detection in CI/CD
- Pre-deployment testing checklist
- 24-hour monitoring window after deploy

**Contingency:**
- Level 1 rollback (5 min)
- Frontend hotfix (manual type override)
- Post-mortem to improve detection

---

### Risk 2: SDK Generation Failures

**Likelihood:** LOW
**Impact:** MEDIUM (manual SDK publishing required)

**Mitigation:**
- Test SDK generation in CI/CD
- Validate OpenAPI spec before deploy
- Monitor npm publish success rate
- Keep manual SDK generation docs

**Contingency:**
- Manual SDK generation (30 min)
- Skip SDK publish, notify frontend team
- Investigate root cause, fix in next deploy

---

### Risk 3: Performance Regression

**Likelihood:** LOW
**Impact:** HIGH (user-facing latency)

**Mitigation:**
- Performance testing per sprint
- P95 latency monitoring (target: ±5%)
- Cache hit ratio monitoring (target: >70%)
- Load testing before production deploy

**Contingency:**
- Level 2 rollback (15 min)
- Investigate schema validation overhead
- Optimize Zod schema compilation

---

### Risk 4: Team Adoption Resistance

**Likelihood:** MEDIUM
**Impact:** MEDIUM (slow adoption, manual types persist)

**Mitigation:**
- Hands-on training (Day 26)
- Pair programming sessions
- Clear documentation with examples
- Quick wins (show autocomplete benefits)

**Contingency:**
- Extended training sessions
- 1-on-1 support for team members
- Document common mistakes
- Create video tutorials

---

## Success Metrics

### Sprint 1 Metrics
- ✅ CI/CD blocks breaking changes: 100% (0 failures)
- ✅ Contract validation logs violations: >0 (catch issues)
- ✅ Endpoints migrated: 3 (isbn, title, health)
- ✅ SDK published: v1.0.0
- ✅ Frontend using SDK: 100% (for migrated endpoints)
- ✅ Backward compatibility: 100% (0 breaking changes)
- ✅ Production errors: 0% (target: <0.1%)

### Sprint 2 Metrics
- ✅ Endpoints migrated: 13 total
- ✅ SDK auto-published: Yes (GitHub Actions)
- ✅ Dependabot auto-updates: Yes (frontend)
- ✅ Manual SDK steps: 0
- ✅ Breaking changes detected: 100% in CI
- ✅ Job coverage: 100% (all job endpoints)
- ✅ Batch coverage: 100% (all batch endpoints)
- ✅ Error rate: <0.1%

### Sprint 3 Metrics
- ✅ Endpoints migrated: 20 total (95% user-facing)
- ✅ SDK versions: v3.0.0+
- ✅ Team training complete: 100%
- ✅ Contract validation strict mode: Active
- ✅ Frontend manual types: 0 (all deleted)
- ✅ Sync issues: 0 (for 30 days)
- ✅ Developer satisfaction: >80% (survey)

---

## Deployment Approach

### Incremental Rollout
- Deploy 2-3 endpoints per day (not all at once)
- Monitor each endpoint for 24 hours before next deploy
- Use feature flags for gradual rollout

### Blue-Green Strategy
```bash
# Deploy new version to staging first
npx wrangler deploy --env staging

# Run full test suite against staging
npm run test:e2e -- --env staging

# Promote to production after validation
npx wrangler deploy --env production
```

### Monitoring Checklist (Per Deploy)
- [ ] Error rate < 0.1%
- [ ] P95 latency within ±5% of baseline
- [ ] Cache hit ratio > 70%
- [ ] Contract validation logs reviewed
- [ ] Swagger UI renders correctly
- [ ] SDK generation successful
- [ ] Frontend team notified of new SDK version

---

## Team Coordination

### Daily Standup Format
**Backend Team:**
- Endpoints migrated yesterday
- Endpoints planned for today
- Blockers (schema complexity, testing issues)

**Frontend Team:**
- SDK version in use
- Integration issues encountered
- Breaking changes detected

**Action Items:**
- Sync on breaking changes (if any)
- Coordinate SDK version bumps
- Schedule cross-team testing

### Weekly Sync (End of Week)
- Sprint progress review
- Success metrics dashboard
- Risk assessment
- Adjust timeline if needed

### Stakeholder Updates
- End of Sprint 1: Demo Swagger UI + SDK v1.0.0
- End of Sprint 2: Demo auto-publish workflow
- End of Sprint 3: Final launch announcement

---

## Additional Deliverables

### Documentation
1. **OPENAPI_DEVELOPER_GUIDE.md** - How to add/modify endpoints
2. **SDK_MAINTENANCE_GUIDE.md** - Version bumping, deprecation
3. **TROUBLESHOOTING_GUIDE.md** - Common issues and fixes
4. **API_CONTRACT.md** - Updated with all 20 endpoints
5. **FRONTEND_SDK_GUIDE.md** - Frontend team usage guide

### Scripts
1. **scripts/detect-breaking-changes.ts** - CI/CD breaking change detection
2. **scripts/generate-sdk.sh** - Local SDK generation
3. **scripts/validate-openapi.sh** - OpenAPI spec validation
4. **scripts/rollback-endpoint.sh** - Quick endpoint rollback

### CI/CD Workflows
1. **.github/workflows/contract-check.yml** - Breaking change detection
2. **.github/workflows/auto-publish-sdk.yml** - SDK auto-publish
3. **.github/workflows/openapi-validation.yml** - Spec validation

### Monitoring Dashboards
1. **SDK Health Dashboard** - npm downloads, error rates
2. **Contract Validation Dashboard** - Violation logs
3. **Performance Dashboard** - Latency, error rate, cache hit ratio

---

## Timeline Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    Sprint 1 (Days 1-10)                     │
│  Foundation + Critical Search + SDK v1.0.0                  │
│  ✅ Contract validation   ✅ 3 endpoints   ✅ SDK published │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Sprint 2 (Days 11-20)                    │
│  Job Coverage + Batch Ops + Auto-Publish                    │
│  ✅ 13 endpoints total   ✅ SDK v2.0.0   ✅ GitHub Actions  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Sprint 3 (Days 21-30)                    │
│  Complete Coverage + Team Training + Launch                 │
│  ✅ 20 endpoints total   ✅ SDK v3.0.0   ✅ Zero sync issues│
└─────────────────────────────────────────────────────────────┘
                              ↓
                    🎉 ZERO SYNC ISSUES FOREVER 🎉
```

**Total Duration:** 30 working days (6 weeks calendar time)
**Endpoints Migrated:** 20 (95% of user-facing API)
**SDK Versions:** v1.0.0 → v2.0.0 → v3.0.0+
**Breaking Changes:** 0 (100% backward compatibility)
**Frontend Manual Types:** 0 (all deleted, SDK only)
**Sync Issues After Launch:** 0 (validated for 30 days)

---

**Document Version:** 1.0
**Created:** November 28, 2025
**Owner:** Backend Platform Team (@jukasdrj)
**Status:** Ready to Execute
**Next Steps:** Kick off Sprint 1, Day 1 (enable contract validation middleware)
