# Sprint 4 - SDK & Developer Experience

**Start Date:** January 7, 2026
**Status:** 🔄 IN PROGRESS - Phase 1
**Goal:** Publish production-ready TypeScript SDK and improve developer experience

---

## Overview

Sprint 4 focuses on making BooksTrack V3 API accessible to external developers through a published npm package and comprehensive documentation.

**Key Deliverables:**
1. ✅ TypeScript SDK published to npm as `@jukasdrj/bookstrack-api-client@3.4.1`
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
- Version: 3.4.1 (in package.json)
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

### Task 1.2: Update CHANGELOG for v3.4.1

**Duration:** 15 minutes
**Status:** TODO

**Changes Since v3.3.0:**
1. 3-tier testing architecture (internal, no API changes)
2. Test pass rate 88.6% → 95.7%
3. Laptop-safe development workflow
4. README_TESTING.md documentation

**CHANGELOG Entry:**
```markdown
## [3.4.1] - 2026-01-07

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
- ✅ Version 3.4.1 visible on npmjs.com
- ✅ Package installable via `npm install`
- ✅ Types work in VS Code

---

## Phase 2: API Versioning Documentation

**Duration:** 1-2 hours
**Priority:** P1 - Important for API governance

### Task 2.1: Create API Versioning Policy

**Duration:** 45 minutes
**Status:** TODO

**Document:** `docs/API_VERSIONING.md`

**Sections:**
1. **Versioning Strategy**
   - URL-based versioning (`/v3/...`)
   - Semantic versioning for breaking changes
   - Deprecation timeline (6 months notice)

2. **Version Lifecycle**
   - CURRENT: V3 (production, fully supported)
   - DEPRECATED: V2 (sunset March 2026)
   - REMOVED: V1 (sunset December 2025)

3. **Breaking vs Non-Breaking Changes**
   - Breaking: Require new major version
   - Non-Breaking: Patch/minor versions OK

4. **Deprecation Process**
   - 6 months notice via CHANGELOG
   - Sunset date announcement
   - Migration guide provided
   - Gradual traffic migration

5. **Client Migration Guide**
   - V1 → V3 migration steps
   - V2 → V3 migration steps
   - SDK version compatibility matrix

**Template:**
```markdown
# API Versioning Strategy

## Current Status (January 2026)

| Version | Status | Sunset Date | Support Level |
|---------|--------|-------------|---------------|
| V3      | ✅ CURRENT | N/A | Full support |
| V2      | ⛔ DEPRECATED | March 2026 | Security fixes only |
| V1      | ⛔ REMOVED | December 2025 | No support |

## Version Numbering

We use semantic versioning for the API:
- **Major (3.x.x)**: Breaking changes requiring code updates
- **Minor (x.4.x)**: New features, backward compatible
- **Patch (x.x.1)**: Bug fixes, backward compatible

## Deprecation Policy

1. **6 Months Notice**: Announce deprecation in CHANGELOG
2. **Migration Guide**: Provide comprehensive migration documentation
3. **Gradual Rollout**: Monitor error rates during migration
4. **Sunset Date**: Hard cutoff after 6 months

## Current Version: V3

**Base URL:** `https://api.oooefam.net/v3`
**OpenAPI Spec:** `https://api.oooefam.net/v3/openapi.json`
**SDK:** `npm install @jukasdrj/bookstrack-api-client@3.4.1`

### V3 Endpoints (Production Ready)

- `GET /v3/books/{isbn}` - Get book by ISBN
- `GET /v3/books/search` - Search books (text, semantic, similar)
- `POST /v3/books/enrich` - Enrich book metadata
- `GET /v3/capabilities` - API capabilities discovery
- `GET /v3/recommendations/weekly` - Weekly recommendations
- `POST /v3/jobs/imports` - CSV import workflow
- `POST /v3/jobs/scans` - Bookshelf photo scanning
- `POST /v3/jobs/enrichment` - Batch enrichment
- `POST /v3/webhooks/alexandria/enrichment-complete` - Alexandria callback

## Migration Guides

### V2 → V3 Migration

See [V3_MIGRATION.md](../packages/api-client/V3_MIGRATION.md) for comprehensive guide.

**Key Changes:**
1. **Error Format**: V2 used custom format, V3 uses RFC 9457 Problem Details
2. **Response Envelope**: V3 uses discriminated union (`success: boolean`)
3. **Author Search**: V2 had `/v2/search/author`, V3 uses `/v3/books/search?mode=text`
4. **Streaming**: V3 adds SSE streaming for long-running jobs

### V1 → V3 Migration

V1 was removed December 2025. All V1 clients must migrate to V3.

**Breaking Changes:**
1. **No `/v1/search/isbn`**: Use `/v3/books/{isbn}` instead
2. **No `/v1/enrich`**: Use `/v3/books/enrich` instead
3. **Different response format**: V1 had flat structure, V3 has nested with metadata

## Support Lifecycle

### V3 (Current)
- **Full Support**: All features, bug fixes, security updates
- **Documentation**: Comprehensive OpenAPI spec + SDK
- **Breaking Changes**: New major version (V4) would be announced 6 months in advance

### V2 (Deprecated)
- **Security Fixes Only**: Critical vulnerabilities patched
- **No New Features**: Feature development frozen
- **Sunset**: March 2026 (hard cutoff)

### V1 (Removed)
- **No Support**: Returns 404 for all requests
- **Removed**: December 2025

## Version Compatibility Matrix

| SDK Version | API Version | Status |
|-------------|-------------|--------|
| 3.4.x       | V3          | ✅ Current |
| 3.3.x       | V3          | ✅ Supported |
| 2.x.x       | V2          | ⛔ Deprecated |
| 1.x.x       | V1          | ⛔ Removed |

## Client Upgrade Path

**Recommended:** Always use latest SDK version (3.4.1+)

```bash
# Upgrade to latest SDK
npm install @jukasdrj/bookstrack-api-client@latest
```

## Contact

Questions about API versioning? See [GitHub Issues](https://github.com/jukasdrj/bendv3/issues)
```

---

### Task 2.2: Update CLAUDE.md with Versioning Reference

**Duration:** 15 minutes
**Status:** TODO

Add to `.claude/CLAUDE.md`:

```markdown
## API Versioning

**📖 See [docs/API_VERSIONING.md](../docs/API_VERSIONING.md) for versioning strategy**

**Quick Reference:**
- V3 (Current): Production, full support
- V2 (Deprecated): Sunset March 2026
- V1 (Removed): Sunset December 2025

**Deprecation Policy:** 6 months notice, migration guides provided
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
- ✅ Version 3.4.1 installable
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
