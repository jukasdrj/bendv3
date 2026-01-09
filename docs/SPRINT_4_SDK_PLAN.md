# Sprint 4 - SDK & Developer Experience

**Start Date:** January 7, 2026
**Status:** 🔄 IN PROGRESS - Phase 1
**Goal:** Publish production-ready TypeScript SDK and improve developer experience

---

## Overview

Sprint 4 focuses on making BooksTrack V3 API accessible to external developers through a published npm package and comprehensive documentation.

**Key Deliverables:**
1. ✅ TypeScript SDK published to npm as `@jukasdrj/bookstrack-api-client@3.4.2`
2. ✅ Comprehensive API versioning documentation
3. ✅ RFC 9457 error response audit
4. ⏳ (Optional) Enhanced OpenAPI documentation

---

## Phase 1: SDK Publication (Current)

**Duration:** 2-3 hours
**Priority:** P0 - Critical for external developer adoption

### Task 1.1: SDK Package Audit ✅

**Status:** READY
**Duration:** 15 minutes

**Current State:**
- Package: `@jukasdrj/bookstrack-api-client`
- Version: 3.4.2 (in package.json)
- Build: ✅ Already compiled (`dist/` exists)
- OpenAPI Spec: ✅ `src/api-v3/openapi-static.json` (17 endpoints)

**Verification:**
```bash
cd packages/api-client
npm run build  # Rebuild from latest OpenAPI spec
ls -lah dist/  # Verify output
```

**Files in Package:**
- `dist/index.js` - Main entry point
- `dist/schema.ts` - TypeScript types from OpenAPI
- `dist/streaming.ts` - SSE streaming support
- `README.md` - Usage documentation
- `STREAMING_GUIDE.md` - SSE integration guide
- `CHANGELOG.md` - Version history

---

### Task 1.2: Update CHANGELOG for v3.4.2

**Duration:** 15 minutes
**Status:** TODO

**Changes Since v3.3.0:**
1. 3-tier testing architecture (internal, no API changes)
2. Test pass rate 88.6% → 95.7%
3. Laptop-safe development workflow
4. README_TESTING.md documentation

**CHANGELOG Entry:**
```markdown
## [3.4.2] - 2026-01-07

### Internal
- Implemented 3-tier testing architecture (95.7% pass rate)
- Archived integration tests for CI/CD
- Created comprehensive testing documentation (README_TESTING.md)
- No API changes (fully backward compatible with 3.4.0)

### SDK
- No changes (this is a maintenance release)
```

---

### Task 1.3: Rebuild SDK from Latest Spec

**Duration:** 10 minutes
**Status:** TODO

**Commands:**
```bash
cd packages/api-client

# Regenerate types from OpenAPI spec
npm run generate

# Build TypeScript to JavaScript
npm run build

# Verify dist/ output
ls -lah dist/
```

**Expected Output:**
- `dist/schema.d.ts` - Updated TypeScript definitions
- `dist/index.js` - Compiled SDK entry point
- `dist/streaming.js` - SSE streaming utilities

---

### Task 1.4: Local SDK Testing

**Duration:** 30 minutes
**Status:** TODO

**Test Plan:**
1. **Build Test:**
   ```bash
   cd packages/api-client
   npm run build
   echo $?  # Should be 0 (success)
   ```

2. **Type Check:**
   ```typescript
   // Create test file: packages/api-client/test-local.ts
   import { createBooksTrackClient } from './dist/index.js'

   const client = createBooksTrackClient({
     baseUrl: 'https://api.oooefam.net'
   })

   const { data } = await client.GET('/v3/books/{isbn}', {
     params: { path: { isbn: '9780439708180' } }
   })

   console.log(data?.title)  // Should be "Harry Potter and the Sorcerer's Stone"
   ```

3. **Production API Test:**
   ```bash
   cd packages/api-client
   npx tsx test-local.ts
   ```

**Success Criteria:**
- ✅ Build completes without errors
- ✅ TypeScript types compile
- ✅ Production API returns valid data
- ✅ No runtime errors

---

### Task 1.5: Publish to npm

**Duration:** 15 minutes
**Status:** TODO

**Prerequisites:**
- ✅ npm account (@jukasdrj)
- ✅ Package name available (`@jukasdrj/bookstrack-api-client`)
- ✅ `publishConfig.access: "public"` in package.json

**Commands:**
```bash
# Login to npm (if not already logged in)
npm login

# Navigate to SDK directory
cd packages/api-client

# Dry run (verify what will be published)
npm publish --dry-run

# Publish for real
npm publish
```

**Verification:**
```bash
# Check package is live
npm view @jukasdrj/bookstrack-api-client

# Install in test project
mkdir /tmp/test-sdk && cd /tmp/test-sdk
npm init -y
npm install @jukasdrj/bookstrack-api-client
```

**Success Criteria:**
- ✅ Package published to npm registry
- ✅ Version 3.4.2 visible on npmjs.com
- ✅ Package installable via `npm install`
- ✅ Types work in VS Code

---

## Phase 2: API Documentation (V3 Only)

**Duration:** 30-45 minutes
**Priority:** P1 - Important for API governance

### Task 2.1: Document V3 API Status

**Duration:** 30 minutes
**Status:** TODO

**Document:** `docs/API_V3_OVERVIEW.md`

**Sections:**
1. **Current Status**
   - V3 is the ONLY supported version
   - V1 and V2 have been completely removed (not deprecated, REMOVED)
   - All functionality exists in V3

2. **Semantic Versioning**
   - Major (3.x.x): Breaking changes requiring code updates
   - Minor (x.4.x): New features, backward compatible
   - Patch (x.x.2): Bug fixes, backward compatible

3. **Breaking vs Non-Breaking Changes**
   - Breaking: Require new major version (V4)
   - Non-Breaking: Patch/minor versions OK
   - Deprecation: 6 months notice via CHANGELOG

**Template:**
```markdown
# BooksTrack V3 API - Overview

**Base URL:** `https://api.oooefam.net/v3`
**OpenAPI Spec:** `https://api.oooefam.net/v3/openapi.json`
**TypeScript SDK:** `npm install @jukasdrj/bookstrack-api-client@3.4.2`
**Documentation:** https://api.oooefam.net/v3/docs

---

## Current Status (January 2026)

**V3 is the ONLY supported API version.**

- ✅ **V3:** Production, fully supported, all features available
- ⛔ **V2:** Completely removed (March 2026)
- ⛔ **V1:** Completely removed (December 2025)

**All legacy endpoints return 404.** There are no migration guides because V1 and V2 are gone.

---

## Semantic Versioning

BooksTrack V3 follows semantic versioning:

- **Major (3.x.x)**: Breaking changes requiring client updates
  - Example: Removing endpoints, changing response schemas
  - Advance notice: 6 months via CHANGELOG

- **Minor (x.4.x)**: New features, backward compatible
  - Example: New endpoints, optional fields
  - No client changes required

- **Patch (x.x.2)**: Bug fixes, backward compatible
  - Example: Error handling improvements, performance fixes
  - No client changes required

**Current Version:** 3.4.2

---

## V3 API Endpoints

### Book Operations
- `GET /v3/books/{isbn}` - Get book by ISBN
- `GET /v3/books/search` - Search books (text, semantic, similar)
- `POST /v3/books/enrich` - Enrich book metadata (sync mode)

### Job Management
- `POST /v3/jobs/imports` - Start CSV import job
- `GET /v3/jobs/imports/{jobId}` - Get import job status
- `GET /v3/jobs/imports/{jobId}/stream` - SSE progress stream
- `POST /v3/jobs/scans` - Start bookshelf photo scan
- `GET /v3/jobs/scans/{jobId}` - Get scan job status
- `GET /v3/jobs/scans/{jobId}/stream` - SSE progress stream
- `POST /v3/jobs/enrichment` - Start batch enrichment
- `GET /v3/jobs/enrichment/{jobId}` - Get enrichment status
- `GET /v3/jobs/enrichment/{jobId}/stream` - SSE progress stream
- `GET /v3/jobs/enrichment/{jobId}/results` - Get enriched books (paginated)
- `DELETE /v3/jobs/enrichment/{jobId}` - Cancel enrichment job

### Discovery
- `GET /v3/capabilities` - API feature discovery
- `GET /v3/recommendations/weekly` - Weekly book recommendations

### Documentation
- `GET /v3/openapi.json` - OpenAPI 3.1 specification
- `GET /v3/docs` - Interactive Swagger UI

### Webhooks
- `POST /v3/webhooks/alexandria/enrichment-complete` - Alexandria processing callback

---

## TypeScript SDK

**Installation:**
```bash
npm install @jukasdrj/bookstrack-api-client@3.4.2
```

**Usage:**
```typescript
import { createBooksTrackClient } from '@jukasdrj/bookstrack-api-client'

const client = createBooksTrackClient({
  baseUrl: 'https://api.oooefam.net'
})

// Get book by ISBN
const { data, error } = await client.GET('/v3/books/{isbn}', {
  params: { path: { isbn: '9780439708180' } }
})

if (error) {
  console.error('Error:', error.detail)
} else {
  console.log('Title:', data.title)
}
```

**Features:**
- ✅ Full TypeScript type safety
- ✅ Auto-generated from OpenAPI spec
- ✅ SSE streaming support for long-running jobs
- ✅ Tree-shakeable ESM/CJS builds
- ✅ IntelliSense support in VS Code

---

## Response Format

All V3 endpoints use RFC 9457 Problem Details for errors:

**Success Response:**
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "metadata": {
    "timestamp": "2026-01-09T12:00:00Z",
    "source": "alexandria",
    "cached": true
  }
}
```

**Error Response (RFC 9457):**
```json
{
  "type": "https://api.oooefam.net/errors/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Book with ISBN '1234567890' not found",
  "instance": "/v3/books/1234567890"
}
```

---

## Breaking Changes Policy

When V3 needs breaking changes, we will:

1. **Announce 6 months in advance** via CHANGELOG and GitHub
2. **Release V4 with breaking changes**
3. **Maintain V3 for 6 months** alongside V4
4. **Remove V3 after 6 months** (returns 404)

**No V1/V2 migration guides exist** because those versions are completely removed.

---

## Support

- **Documentation:** https://api.oooefam.net/v3/docs
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **SDK:** https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client
- **Issues:** https://github.com/jukasdrj/bendv3/issues
```

---

### Task 2.2: Update CLAUDE.md with V3-Only Status

**Duration:** 10 minutes
**Status:** TODO

Update `.claude/CLAUDE.md` to clarify V3-only status:

```markdown
## API Status

**Current Version:** V3 (3.4.2)
**Legacy Versions:** V1 and V2 completely removed

**📖 See [docs/API_V3_OVERVIEW.md](../docs/API_V3_OVERVIEW.md) for complete API documentation**

**Breaking Changes Policy:** 6 months notice before V4, migration guides provided
```

---

## Phase 3: RFC 9457 Error Audit (Optional)

**Duration:** 1-2 hours
**Priority:** P2 - Nice to have, non-blocking

### Task 3.1: Audit Current Error Responses

**Duration:** 30 minutes
**Status:** TODO

**Check Points:**
1. All V3 endpoints return RFC 9457 format
2. Error types use standard URI format
3. `status` matches HTTP status code
4. `detail` provides user-friendly message

**Test Command:**
```bash
# Test various error scenarios
curl -s https://api.oooefam.net/v3/books/invalid | jq
curl -s https://api.oooefam.net/v3/books/search | jq  # Missing query param
curl -s https://api.oooefam.net/v3/notfound | jq
```

**Expected Format:**
```json
{
  "type": "https://api.oooefam.net/errors/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Book with ISBN 'invalid' not found",
  "instance": "/v3/books/invalid"
}
```

---

### Task 3.2: Document RFC 9457 Compliance

**Duration:** 30 minutes
**Status:** TODO

**Document:** `docs/RFC_9457_ERRORS.md`

**Sections:**
1. **Standard Error Types**
   - `validation-error` (400)
   - `not-found` (404)
   - `rate-limit` (429)
   - `server-error` (500)

2. **Error Type URI Convention**
   - `https://api.oooefam.net/errors/{error-type}`

3. **Client Error Handling Guide**
   ```typescript
   const { error } = await client.GET('/v3/books/{isbn}', ...)

   if (error) {
     switch (error.status) {
       case 404:
         console.log('Book not found:', error.detail)
         break
       case 429:
         const retryAfter = response.headers.get('Retry-After')
         console.log(`Rate limited, retry after ${retryAfter}s`)
         break
     }
   }
   ```

---

## Phase 4: Enhanced Documentation (Optional)

**Duration:** 2-3 hours
**Priority:** P3 - Future enhancement

### Potential Additions

1. **Interactive API Explorer**
   - Swagger UI at `/v3/docs` (already exists)
   - Add "Try it out" examples

2. **SDK Usage Examples**
   - Common recipes (search, enrich, batch jobs)
   - SSE streaming examples
   - Error handling patterns

3. **Postman Collection**
   - Export OpenAPI → Postman format
   - Pre-configured environments (prod, dev)

4. **Client Library Comparison**
   - When to use SDK vs raw fetch
   - Performance benchmarks
   - Type safety benefits

---

## Success Criteria

### Phase 1 (SDK Publication)
- ✅ Package published to npm
- ✅ Version 3.4.2 installable
- ✅ Types work in VS Code/IDE
- ✅ Production API accessible via SDK

### Phase 2 (Versioning Docs)
- ✅ `docs/API_VERSIONING.md` created
- ✅ V1/V2/V3 lifecycle documented
- ✅ Migration guides provided
- ✅ Deprecation policy defined

### Phase 3 (RFC 9457 Audit)
- ✅ All errors follow RFC 9457 format
- ✅ Error handling guide documented
- ✅ Client examples provided

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: SDK Publication | 2-3 hours | 🔄 IN PROGRESS |
| Phase 2: Versioning Docs | 1-2 hours | ⏳ PENDING |
| Phase 3: RFC 9457 Audit | 1-2 hours | ⏳ OPTIONAL |
| Phase 4: Enhanced Docs | 2-3 hours | ⏳ FUTURE |

**Total Estimated:** 6-10 hours
**Critical Path:** Phases 1-2 (3-5 hours)

---

## Next Steps

**Immediate (Today):**
1. Rebuild SDK from latest OpenAPI spec
2. Test SDK locally
3. Publish to npm
4. Announce to users

**This Week:**
1. Create API versioning documentation
2. Audit RFC 9457 compliance
3. Update CHANGELOG

**Future:**
1. Enhanced Swagger UI
2. More SDK examples
3. Postman collection

---

**Created:** January 7, 2026
**Owner:** @jukasdrj
**Sprint:** Sprint 4 - SDK & Developer Experience
