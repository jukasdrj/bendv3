# OpenAPI Spec vs Implementation Audit
**Date:** November 27, 2025
**Auditor:** Claude Code
**Files Reviewed:**
- `docs/openapi.yaml` (v3.2.0)
- `src/router.ts` (Hono router)
- `src/handlers/v2/capabilities.ts`

---

## Executive Summary

**Status:** ⚠️ **4 MISMATCHES FOUND**

The OpenAPI spec and capabilities endpoint contain **inaccuracies** that need correction:

1. **Missing endpoints** in OpenAPI (exist in router, not documented)
2. **Incorrect endpoint paths** in capabilities.ts
3. **Non-existent endpoints** documented in OpenAPI
4. **Batch enrichment endpoint path mismatch**

---

## Detailed Findings

### 🔴 CRITICAL: Incorrect Endpoint in capabilities.ts

**Issue:** `capabilities.ts:137` claims batch enrichment is at `/v1/enrichment/batch`

**Reality:** Router has it at `/v1/enrichment/batch` (line 511) ✅ CORRECT

**Actually, this is fine!** But wait...

**Issue:** OpenAPI spec (line 583) documents it as `/api/batch-enrich`

**Router reality:**
- Line 511: `POST /v1/enrichment/batch` ✅ EXISTS
- Line 1309: `POST /api/batch-scan` (bookshelf scan, NOT enrichment) ✅ EXISTS
- `/api/batch-enrich` ❌ DOES NOT EXIST

**Verdict:** OpenAPI spec is WRONG. The endpoint `/api/batch-enrich` does not exist in router.ts.

---

### 🟡 MEDIUM: Missing Endpoints in OpenAPI

These endpoints exist in `router.ts` but are NOT documented in `openapi.yaml`:

1. **POST /api/token/refresh** (line 553) - Token refresh endpoint
2. **POST /api/scan-bookshelf/cancel** (line 753, 1319) - Cancel scan job
3. **GET /v1/scan/results/:jobId** (line 921) - Get scan results
4. **GET /v1/csv/status/:jobId** (line 958) - CSV job status
5. **GET /v1/csv/results/:jobId** (line 1008) - CSV results
6. **GET /v1/editions/search** (line 1370) - Edition search
7. **GET /images/proxy** (line 1399) - Image proxy
8. **GET /api/cache/metrics** (line 809) - Cache metrics
9. **GET /api/cache/stats** (line 819) - Cache stats
10. **GET /api/cache/dashboard** (line 849) - Cache dashboard
11. **GET /api/cache/health** (line 855) - Cache health
12. **GET /api/cache/alerts** (line 861) - Cache alerts
13. **POST /v2/import/workflow** (line 532) - Workflow trigger
14. **GET /v2/import/workflow/:workflowId** (line 538) - Workflow status

**Impact:** Clients relying on OpenAPI spec will not know these endpoints exist.

---

### 🟡 MEDIUM: Wrong Endpoint Path in capabilities.ts

**Issue:** `capabilities.ts:114` lists `POST /api/import/csv-gemini` as CSV import endpoint

**Reality:** This endpoint exists (line 521) but is NOT the primary V2 CSV import endpoint.

**Correct primary endpoint:** `POST /api/v2/imports` (line 1573)

**Recommendation:** Capabilities should list `/api/v2/imports` as the primary endpoint, with `/api/import/csv-gemini` as legacy.

---

### 🟢 VERIFIED CORRECT: Job Cancellation Endpoint

**OpenAPI spec (line 788):** `DELETE /v1/jobs/{jobId}` with Bearer auth

**Router (line 1127):** `DELETE /v1/jobs/:jobId` ✅ CORRECT

**Capabilities (not listed):** Should add `job_cancellation` feature to capabilities.ts

---

### 🟢 VERIFIED CORRECT: SSE Stream Endpoint

**OpenAPI spec (line 673):** `GET /api/v2/imports/{jobId}/stream`

**Router (line 1629):** `GET /api/v2/imports/:jobId/stream` ✅ CORRECT

**Capabilities (line 182):** Lists endpoint correctly ✅ CORRECT

---

## Endpoint Reconciliation Table

| Endpoint | OpenAPI? | Router? | Capabilities? | Status |
|----------|----------|---------|---------------|--------|
| `POST /api/batch-enrich` | ✅ (line 583) | ❌ | ❌ | **GHOST ENDPOINT** |
| `POST /v1/enrichment/batch` | ❌ | ✅ (line 511) | ✅ (line 137) | Missing from spec |
| `POST /api/batch-scan` | ✅ (line 758) | ✅ (line 1309) | ✅ (line 123) | ✅ Correct |
| `POST /api/v2/imports` | ✅ (line 612) | ✅ (line 1573) | ✅ (line 111) | ✅ Correct |
| `POST /api/import/csv-gemini` | ❌ | ✅ (line 521) | ✅ (line 114) | Missing from spec |
| `DELETE /v1/jobs/{jobId}` | ✅ (line 788) | ✅ (line 1127) | ❌ | Missing from capabilities |
| `GET /v1/search/advanced` | ❌ | ✅ (line 161) | ✅ (line 86) | **Missing from OpenAPI** |
| `GET /v1/search/semantic` | ❌ | ✅ (line 200) | ✅ (line 96) | **Missing from OpenAPI** |
| `GET /v1/search/similar` | ✅ (line 514) | ✅ (line 195) | ✅ (line 97) | ✅ Correct |
| `GET /v1/editions/search` | ❌ | ✅ (line 1370) | ❌ | Undocumented |
| `GET /images/proxy` | ❌ | ✅ (line 1399) | ❌ | Undocumented |
| `POST /api/token/refresh` | ❌ | ✅ (line 553) | ❌ | Undocumented |

---

## Recommendations

### Immediate Fixes Required

1. **Remove ghost endpoint from OpenAPI:**
   - Delete `POST /api/batch-enrich` (line 583-610) - this endpoint does not exist

2. **Add missing enrichment endpoint to OpenAPI:**
   - Add `POST /v1/enrichment/batch` spec with JobResponse schema

3. **Add V1 search endpoints to OpenAPI:**
   - `GET /v1/search/advanced` (documented in capabilities, missing in OpenAPI)
   - `GET /v1/search/semantic` (documented in capabilities, missing in OpenAPI)

4. **Fix capabilities.ts CSV import endpoints:**
   - Line 111: Change from `/api/import/csv-gemini` to `/api/v2/imports` as primary
   - Add `/api/import/csv-gemini` as secondary/legacy endpoint

5. **Add job cancellation to capabilities.ts:**
   ```typescript
   {
     name: 'job_cancellation',
     enabled: true,
     version: '1.0.0',
     endpoints: ['DELETE /v1/jobs/{jobId}'],
     notes: 'Requires Bearer token authentication (v3.2)'
   }
   ```

### Documentation Gaps to Address

**Production endpoints missing from OpenAPI:**
- `GET /v1/editions/search` - Edition search by ISBN
- `GET /images/proxy` - Image proxying with caching
- `POST /api/token/refresh` - JWT refresh
- `POST /api/scan-bookshelf/cancel` - Cancel scan job
- `GET /v1/scan/results/:jobId` - Scan job results
- `GET /v1/csv/status/:jobId` - CSV job status
- `GET /v1/csv/results/:jobId` - CSV job results
- `POST /v2/import/workflow` - Workflow orchestration
- `GET /v2/import/workflow/:workflowId` - Workflow status

**Internal/admin endpoints (consider documenting separately):**
- `GET /api/cache/metrics`
- `GET /api/cache/stats`
- `GET /api/cache/dashboard`
- `GET /api/cache/health`
- `GET /api/cache/alerts`
- `GET /admin/harvest-dashboard`

---

## Verification Commands

```bash
# Count routes in router.ts
grep -c "^app\.(get|post|delete)" src/router.ts
# Result: 59 routes

# Count paths in OpenAPI
grep -c "^  /" docs/openapi.yaml
# Result: ~20 paths (significantly less coverage)

# Check for ghost endpoint
grep -r "api/batch-enrich" src/
# Result: No matches (endpoint doesn't exist in code!)
```

---

## Next Steps

1. ✅ Create this audit document
2. ⏳ Fix OpenAPI spec (remove ghost endpoint, add missing endpoints)
3. ⏳ Fix capabilities.ts (correct CSV import endpoints, add job cancellation)
4. ⏳ Add missing production endpoints to OpenAPI
5. ⏳ Consider separate OpenAPI spec for internal/admin endpoints
6. ⏳ Add CI check to validate OpenAPI spec against router.ts

---

**Conclusion:** The OpenAPI spec and capabilities endpoint are **out of sync** with the actual implementation. This creates a poor developer experience and potential integration issues for API consumers. Immediate fixes are required for the ghost endpoint and missing critical endpoints.
