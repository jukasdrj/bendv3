# Hono Router Migration Guide

**Status:** Phase 2 - Migration Documentation Complete
**Last Updated:** November 21, 2025
**Issue:** #243

---

## Overview

The BooksTrack API has migrated from a manual routing system in `src/index.js` to the Hono web framework router in `src/router.ts`. This document provides the complete migration path and identifies routes that need attention.

**Current Status:**
- ✅ Hono router is DEFAULT (`ENABLE_HONO_ROUTER=true`)
- ✅ Phase 1 complete: Deprecation warnings added (Nov 21, 2025)
- 📋 Phase 2 complete: Migration documentation (this file)
- 🎯 Phase 3: Remove manual router (target: March 1, 2026)

---

## Migration Status

### Route Parity Analysis

**Manual Router Routes:** 41 routes in `src/index.js`
**Hono Router Routes:** 25 routes in `src/router.ts`

### ✅ Migrated Routes (Core API)

These routes exist in both routers and are ready for manual router removal:

```
/health                     - Health check
/metrics                    - Prometheus metrics
/ws/progress                - WebSocket upgrade
/v1/search/isbn             - ISBN search
/v1/search/title            - Title search
/v1/search/advanced         - Advanced search
/v1/enrichment/batch        - Batch enrichment (POST)
/api/batch-scan             - Batch bookshelf scan (POST)
/api/import/csv-gemini      - CSV import (POST)
/api/token/refresh          - Token refresh (POST)
/api/cache/metrics          - Cache metrics
/admin/harvest-dashboard    - Harvest dashboard
```

### ❌ Missing Routes (Need Migration)

These routes exist in manual router but NOT in Hono router:

#### External API Test Routes (34 routes)
```
/external/google-books
/external/google-books-isbn
/external/openlibrary
/external/openlibrary-author
/external/isbndb
/external/isbndb-isbn
/external/isbndb-editions
```
**Status:** ⚠️ **Test/debug endpoints** - Consider removing entirely instead of migrating

#### Legacy Search API Routes
```
/search/isbn               - Superseded by /v1/search/isbn
/search/title              - Superseded by /v1/search/title
/search/advanced           - Superseded by /v1/search/advanced
/search/author             - Superseded by /search/author (Hono)
```
**Status:** ✅ **Deprecated routes** - Already marked for sunset (March 1, 2026)

#### Batch Operations
```
/api/enrichment/start      - Superseded by /v1/enrichment/batch
/api/enrichment/cancel     - Cancel enrichment job
/api/scan-bookshelf        - Single photo scan
/api/scan-bookshelf/batch  - Batch scan (already in Hono)
/api/scan-bookshelf/cancel - Cancel batch scan
```
**Status:** ⚠️ **Partial migration** - Cancel endpoints missing from Hono

#### Other
```
/api/warming/upload        - Cover warming upload
/api/warming/dlq           - DLQ monitor
/api/harvest-covers        - Scheduled cover harvest
/api/test-multi-edition    - Test endpoint
/v1/editions/search        - Edition search
/images/proxy              - Image proxy
```
**Status:** 🔍 **Needs investigation** - Production usage unclear

#### Durable Object Test Routes (6 routes)
```
/test/do/init-batch
/test/do/update-photo
/test/do/complete-batch
/test/do/cancel-batch
/test/do/is-canceled
/test/do/get-state
```
**Status:** ⚠️ **Test endpoints** - Consider removing entirely

### ✨ New Routes (Hono Only)

These routes exist ONLY in Hono router (added after manual router freeze):

```
/v1/scan/results/:jobId    - Retrieve scan results
/v1/csv/results/:jobId     - Retrieve CSV results
/api/cache/stats           - Cache statistics
/api/job-state/:jobId      - Job state retrieval
/test/error                - Error testing
/test/cache-event          - Cache event testing
```

---

## Phase 3: Manual Router Removal Plan

### Decision Matrix

| Route Category | Action | Rationale |
|---------------|--------|-----------|
| **Core API routes** | ✅ Remove | Fully migrated to Hono |
| **Legacy search routes** | ✅ Remove | Already deprecated, sunset March 2026 |
| **External API test routes** | ❌ Remove | Debug-only, not production |
| **DO test routes** | ❌ Remove | Test-only, not production |
| **Cancel endpoints** | 🔧 Migrate to Hono first | Needed for production |
| **Warming/DLQ endpoints** | 🔍 Investigate usage | Check logs before removing |
| **Edition search** | 🔧 Migrate to Hono first | Needed for iOS app |
| **Image proxy** | 🔧 Migrate to Hono first | Needed for production |

### Routes Requiring Hono Migration

**Priority 1 (Production Critical):**
```typescript
// src/router.ts additions needed

// Cancel operations
app.post("/api/enrichment/cancel", async (c) => {
  // Implement cancel logic
})

app.post("/api/scan-bookshelf/cancel", async (c) => {
  // Already exists in Hono (line 182)
})

// Edition search
app.get("/v1/editions/search", async (c) => {
  const isbn = c.req.query("isbn")
  return await handleSearchEditions(isbn, c.env, c.req.raw)
})

// Image proxy
app.get("/images/proxy", async (c) => {
  const imageUrl = c.req.query("url")
  return await handleImageProxy(imageUrl, c.env)
})
```

**Priority 2 (Investigate First):**
```typescript
// Warming endpoints (check production usage)
app.post("/api/warming/upload", ...)
app.get("/api/warming/dlq", ...)
app.post("/api/harvest-covers", ...)  // Scheduled job trigger
```

**Priority 3 (Remove):**
```typescript
// External API test routes - DELETE (not production)
// /external/*

// DO test routes - DELETE (not production)
// /test/do/*

// Single photo scan - DELETE (superseded by batch)
// /api/scan-bookshelf (single)
```

---

## Migration Checklist

### Pre-Removal Steps

- [ ] **Verify production usage** - Check logs for manual router usage
  ```bash
  wrangler tail --format pretty | grep "Using manual router"
  ```

- [ ] **Add missing Hono routes** - Implement Priority 1 routes above
  - [ ] `/api/enrichment/cancel`
  - [ ] `/v1/editions/search`
  - [ ] `/images/proxy`

- [ ] **Investigate Priority 2 routes** - Check if warming/DLQ endpoints are used
  ```bash
  wrangler tail --format pretty | grep -E "(warming|dlq|harvest-covers)"
  ```

- [ ] **Update tests** - Ensure all tests use Hono router
  ```bash
  npm test -- --grep "manual router"
  ```

- [ ] **Monitor for 30 days** - Validate Hono stability (Phase 2 requirement)
  - Zero production incidents requiring manual router fallback
  - Error rates < 1%
  - P95 latency < 500ms

### Removal Steps

- [ ] **Remove manual router code** - Delete lines 76-1468 from `src/index.js`
- [ ] **Remove feature flag** - Delete `ENABLE_HONO_ROUTER` checks
- [ ] **Update entry point** - Simplify `src/index.js` to just export Hono router
- [ ] **Clean up imports** - Remove unused handler imports
- [ ] **Update tests** - Remove manual router test coverage
- [ ] **Archive manual router** - Save to `docs/archive/manual-router-legacy.md`

### Post-Removal Validation

- [ ] **Deploy to staging** - Test Hono-only deployment
- [ ] **Run integration tests** - Full test suite pass
- [ ] **Monitor production** - Watch for errors after deployment
- [ ] **Update documentation**
  - [ ] Remove manual router references from `CLAUDE.md`
  - [ ] Update `API_CONTRACT.md` if needed
  - [ ] Close Issue #243

---

## Rollback Plan

If critical issues are discovered after manual router removal:

1. **Immediate rollback** (< 5 minutes):
   ```bash
   wrangler rollback --message "Reverting Hono-only deployment"
   ```

2. **Code revert** (< 30 minutes):
   ```bash
   git revert <commit-hash>
   git push origin main
   wrangler deploy
   ```

3. **Emergency restore** (< 1 hour):
   - Restore `manual-router-legacy.md` code back to `src/index.js`
   - Re-add `ENABLE_HONO_ROUTER` feature flag
   - Deploy with flag set to `false`

---

## Timeline

| Phase | Date | Status |
|-------|------|--------|
| **Phase 1: Deprecation** | Nov 21, 2025 | ✅ Complete |
| **Phase 2: Documentation** | Nov 21, 2025 | ✅ Complete |
| **Phase 2.5: Add missing routes** | Dec 2025 | 🔨 In Progress |
| **Phase 3: 30-day monitoring** | Dec 2025 - Jan 2026 | ⏳ Pending |
| **Phase 4: Manual router removal** | March 1, 2026 | 📅 Scheduled |

---

## Estimated Effort

- **Add missing Hono routes:** 4 hours
- **Production usage investigation:** 2 hours
- **Manual router removal:** 2 hours
- **Testing and validation:** 4 hours
- **Documentation updates:** 1 hour

**Total:** ~13 hours (~2 days)

---

## Related Issues

- #243 - Deprecate manual router (this issue)
- #238 - Router parity achieved (WebSocket reconnection routes)
- #242 - ResponseEnvelope migration ✅ Complete
- #68 - Hono router migration (original implementation)

---

**Last Updated:** November 21, 2025
**Maintained By:** Backend Team (@jukasdrj)
**Next Review:** December 1, 2025 (Phase 2.5 kickoff)
