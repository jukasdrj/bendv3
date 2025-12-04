# Technical Specification: V2 OpenAPI Schema Migration to Shared Response Envelopes

**Version:** 1.1 (Final - Expert Reviewed)
**Date:** December 3, 2025
**Status:** Ready for Implementation
**Impact:** **BREAKING CHANGE** - SDK regeneration required (TypeScript, Swift)

---

## Executive Summary

The V2 API OpenAPI spec (`docs/openapi.yaml`) currently has **12 endpoints** with inconsistent response structures. This migration standardizes all endpoints to use shared `SuccessResponse` and `ErrorResponse` schemas (lines 100-201), ensuring:

1. **SDK compatibility** - iOS Swift decoder requires `success: Bool` discriminator (strict decoding)
2. **Type safety** - Single source of truth for response envelope structure
3. **Maintainability** - Changes require only 2 schema updates (not 48 inline definitions)
4. **API contract consistency** - All endpoints follow identical envelope pattern

**✅ CONFIRMED: Backend handlers already return `success: true/false`** - This is spec-only update (no code changes needed)

---

## Current State Analysis

### Backend Code Verification ✅

**All V2 handlers use `createSuccessResponse()`** which adds `success: true`:
- `/api/v2/search` → `createSuccessResponse()` (line 312, 366, 456 in src/handlers/v2/search.ts)
- `/api/v2/capabilities` → `createSuccessResponse()` (line 238 in src/handlers/v2/capabilities.ts)
- `/api/v2/books/enrich` → `createSuccessResponse()` (line 117, 187 in src/handlers/v2/enrich.ts)

**Response builder confirms** (src/utils/response-builder.ts:107):
```typescript
const envelope: ResponseEnvelope<T> = {
  success: true, // P0: Add success discriminator for iOS client compatibility
  data,
  metadata: { timestamp: new Date().toISOString(), ...metadata },
};
```

**Conclusion:** Backend is already compliant. OpenAPI spec is out of sync with actual responses.

### V2 Endpoints Status Matrix

| Endpoint | Method | Success Code | Spec Has `success` | Backend Returns `success` | Action Required |
|----------|--------|--------------|--------------------|-----------------------------|-----------------|
| `/api/v2/capabilities` | GET | 200 | ✅ Yes (inline) | ✅ Yes | Migrate to shared schema |
| `/api/v2/trending/searches` | GET | 200 | ✅ Yes (inline) | ✅ Yes | Migrate to shared schema |
| `/api/v2/trending/books` | GET | 200 | ✅ Yes (inline) | ✅ Yes | Migrate to shared schema |
| `/api/v2/recommendations/weekly` | GET | 200 | ✅ Yes (inline) | ✅ Yes | Migrate to shared schema |
| `/api/v2/search` | GET | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/imports` | POST | 202 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/imports/{jobId}` | GET | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/imports/{jobId}/stream` | GET | 200 (SSE) | ❌ **SPEC MISSING** | ❌ **N/A (SSE)** | **DO NOT CHANGE (SSE)** |
| `/api/v2/jobs/{jobId}/cancel` | POST | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/imports/{jobId}/results` | GET | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/books/enrich` | POST | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |
| `/api/v2/books/enrich/detailed` | POST | 200 | ❌ **SPEC MISSING** | ✅ Yes | **CRITICAL: Add to spec** |

**Summary:**
- **11 REST endpoints** need spec updates (8 missing `success`, 4 need shared schema migration)
- **1 SSE endpoint** should NOT be changed (`/imports/{jobId}/stream` uses event-based messaging)
- **Backend code:** Already compliant, zero changes needed

---

## Technical Approach: `allOf` Composition (EXPERT VALIDATED ✅)

**Why `allOf`:**
- Preserves endpoint-specific data type information in spec
- OpenAPI generators produce strongly-typed clients
- Standard approach for schema composition in OpenAPI 3.x
- Validated by Gemini 2.5 Pro expert review

**Implementation Pattern:**

```yaml
# Step 1: Create endpoint-specific data schema (if doesn't exist)
components:
  schemas:
    SearchResultData:
      type: object
      properties:
        query: { type: object, properties: {...} }
        results: { type: array, items: { $ref: '#/components/schemas/BookSearchResult' } }
        totalCount: { type: integer }
      required: [query, results, totalCount]

# Step 2: Use allOf to compose SuccessResponse + specific data
paths:
  /api/v2/search:
    get:
      responses:
        '200':
          description: Search results
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/SuccessResponse'
                  - type: object
                    properties:
                      data:
                        $ref: '#/components/schemas/SearchResultData'
```

**TypeScript SDK Generation:**
`openapi-typescript` v7.4.3 generates intersection types:
```typescript
type ComposedResponse = Omit<SuccessResponse, "data"> & {
  data: SearchResultData;
};
```

**✅ Validated:** `swagger-cli` confirms `allOf` composition is valid OpenAPI 3.1.

---

## Migration Plan (4 Phases)

### Phase 1: Create 7 New Component Schemas

**Organization by Domain** (expert-recommended):

**Discovery Schemas** (new section after line 201):
```yaml
# =========================================================================
# DISCOVERY SCHEMAS
# =========================================================================

CapabilitiesData:
  type: object
  properties:
    apiVersion: { type: string }
    features: { type: array, items: {...} }
    limits: { type: object, properties: {...} }
    deprecations: { type: array, items: {...} }
  required: [apiVersion, features, limits, deprecations]

TrendingSearchesData:
  type: object
  properties:
    period: { type: string }
    searches: { type: array, items: {...} }
  required: [period, searches]

TrendingBooksData:
  type: object
  properties:
    period: { type: string }
    books: { type: array, items: { $ref: '#/components/schemas/BookSearchResult' } }
  required: [period, books]

WeeklyRecommendationsData:
  type: object
  properties:
    week: { type: string }
    recommendations: { type: array, items: { $ref: '#/components/schemas/BookSearchResult' } }
  required: [week, recommendations]
```

**Book Schemas** (add to existing section around line 207):
```yaml
SearchResultData:
  type: object
  properties:
    query:
      type: object
      properties:
        q: { type: string }
        mode: { type: string, enum: [text, semantic, hybrid] }
        limit: { type: integer }
        offset: { type: integer }
    results:
      type: array
      items:
        $ref: '#/components/schemas/BookSearchResult'
    totalCount:
      type: integer
  required: [query, results, totalCount]
```

**Job Schemas** (add to existing section around line 485):
```yaml
ImportJobCreatedData:
  type: object
  properties:
    jobId: { type: string, format: uuid }
    authToken: { type: string, format: uuid }
    sseUrl: { type: string }
    statusUrl: { type: string }
  required: [jobId, authToken, sseUrl, statusUrl]

CancelJobData:
  type: object
  properties:
    jobId: { type: string, format: uuid }
    status: { type: string, enum: [canceled] }
    message: { type: string }
  required: [jobId, status, message]
```

### Phase 2: Pilot Migration (2-3 Endpoints)

**Pilot Endpoints** (expert-recommended validation):
1. `/api/v2/capabilities` (already has `success`, test shared schema migration)
2. `/api/v2/search` (missing `success`, test critical iOS fix)
3. `/api/v2/books/enrich` (missing `success`, already has `EnrichedBook` data schema)

**Validation Steps:**
1. Create feature branch: `git checkout -b feat/openapi-shared-schemas-pilot`
2. Migrate 3 pilot endpoints using `allOf` pattern
3. Run `swagger-cli validate docs/openapi.yaml`
4. Regenerate TypeScript SDK: `cd packages/api-client && npm run generate`
5. Inspect generated types in `packages/api-client/src/schema.ts`
6. Share spec with iOS team for trial Swift SDK generation
7. **GATE: Both teams must confirm SDK generation success before proceeding**

### Phase 3: Full Migration (Remaining 8 REST Endpoints)

**After pilot approval**, migrate remaining endpoints:
- `/api/v2/trending/searches`
- `/api/v2/trending/books`
- `/api/v2/recommendations/weekly`
- `/api/v2/imports` POST
- `/api/v2/imports/{jobId}` GET
- `/api/v2/jobs/{jobId}/cancel`
- `/api/v2/imports/{jobId}/results`
- `/api/v2/books/enrich/detailed`

**DO NOT MIGRATE:**
- `/api/v2/imports/{jobId}/stream` - SSE endpoint uses event-based messaging, not envelope pattern

### Phase 4: Coordinated Deployment

**This is a BREAKING CHANGE for iOS (strict decoding)**

**Sequencing:**
1. **Backend:** Merge feature branch, publish updated `docs/openapi.yaml`
2. **TypeScript SDK:** Regenerate, bump version to `1.3.0` (minor version), publish to npm
3. **Swift SDK:** iOS team regenerates from new spec, updates app
4. **Coordinated Release:** Deploy backend spec + client apps in sync

**Client teams MUST update before backend spec is published**, or their apps will break when decoding V2 responses.

---

## Validation & Testing

**OpenAPI Spec Validation:**
```bash
npx swagger-cli validate docs/openapi.yaml
```

**Expected:** Zero errors, confirms `allOf` composition is valid.

**TypeScript SDK Test:**
```bash
cd packages/api-client
npm run generate  # Runs openapi-typescript against docs/openapi.yaml
npm run build
```

**Inspect Generated Types:**
```bash
grep -A 10 "SearchResultData" packages/api-client/src/schema.ts
```

**Expected:** Strongly-typed intersection with `success: true`, `data: SearchResultData`, `metadata: ResponseMetadata`.

---

## Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| iOS app crashes on new `success` field | **HIGH** | **CRITICAL** | Coordinate release, iOS team updates decoder before spec is published |
| TypeScript SDK generation fails | Low | High | Pilot validation on 3 endpoints first, confirm `allOf` works |
| Wrong data schema breaks SDK | Medium | Medium | Inspect generated types after each endpoint migration |
| Backend doesn't return `success` | **NONE** | N/A | ✅ CONFIRMED: All handlers use `createSuccessResponse()` |
| SSE endpoint incorrectly migrated | Low | Medium | **DO NOT CHANGE** SSE endpoint (expert-confirmed) |

---

## Deployment Checklist

**Preparation:**
- [ ] Backup current spec: `cp docs/openapi.yaml docs/openapi.yaml.backup`
- [ ] Create feature branch: `git checkout -b feat/openapi-shared-schemas`
- [ ] Confirm iOS team is ready to regenerate Swift SDK

**Phase 1: Create Component Schemas**
- [ ] Add 4 discovery schemas (after line 201)
- [ ] Add `SearchResultData` to book schemas (around line 207)
- [ ] Add 2 job schemas (`ImportJobCreatedData`, `CancelJobData`) around line 485

**Phase 2: Pilot Migration (3 endpoints)**
- [ ] `/api/v2/capabilities` → `allOf` + `CapabilitiesData`
- [ ] `/api/v2/search` → `allOf` + `SearchResultData`
- [ ] `/api/v2/books/enrich` → `allOf` + `EnrichedBook`
- [ ] Run `swagger-cli validate docs/openapi.yaml`
- [ ] Regenerate TypeScript SDK, inspect types
- [ ] Share spec with iOS team for trial SDK generation
- [ ] **GATE:** Both teams approve before proceeding

**Phase 3: Full Migration (8 remaining REST endpoints)**
- [ ] `/api/v2/trending/searches` → `allOf` + `TrendingSearchesData`
- [ ] `/api/v2/trending/books` → `allOf` + `TrendingBooksData`
- [ ] `/api/v2/recommendations/weekly` → `allOf` + `WeeklyRecommendationsData`
- [ ] `/api/v2/imports` POST → `allOf` + `ImportJobCreatedData`
- [ ] `/api/v2/imports/{jobId}` GET → `allOf` + `JobState`
- [ ] `/api/v2/jobs/{jobId}/cancel` → `allOf` + `CancelJobData`
- [ ] `/api/v2/imports/{jobId}/results` → `allOf` + `JobResults`
- [ ] `/api/v2/books/enrich/detailed` → `allOf` + `EnrichedBookDetailed`
- [ ] Run final `swagger-cli validate`

**Phase 4: Coordinated Deployment**
- [ ] Merge feature branch to main
- [ ] Regenerate TypeScript SDK, publish to npm as v1.3.0
- [ ] iOS team regenerates Swift SDK, updates app
- [ ] **COORDINATE:** Deploy backend spec + client apps in sync

---

## Success Criteria

**Migration is complete when:**
- ✅ 11 REST endpoints use `SuccessResponse` (via `allOf`)
- ✅ SSE endpoint (`/imports/{jobId}/stream`) unchanged
- ✅ All endpoints have `success: boolean` in spec
- ✅ `swagger-cli validate` passes with zero errors
- ✅ TypeScript SDK regenerates successfully, types are strongly-typed
- ✅ iOS team confirms Swift SDK regenerates successfully
- ✅ No client app crashes reported (48-hour monitoring window)

---

## Open Questions - ANSWERED ✅

1. **iOS Decoder Strategy:** STRICT decoding - adding `success` is BREAKING CHANGE
2. **Backend Returns `success`?** ✅ YES - All handlers use `createSuccessResponse()`
3. **SDK Publishing:** Backend controls, publish to npm after migration
4. **Deprecation:** Unrelated to this migration (V1 sunset March 2026)
5. **OpenAPI Generator:** ✅ `openapi-typescript` v7.4.3 supports `allOf`
6. **SSE Endpoint:** ✅ DO NOT CHANGE - Uses event-based messaging, not envelope

---

## References

- **Expert Review:** Gemini 2.5 Pro validation (December 3, 2025)
- **Backend Verification:** `src/utils/response-builder.ts:107`, `src/handlers/v2/*.ts`
- **OpenAPI Spec:** `docs/openapi.yaml` lines 100-201 (SuccessResponse, ErrorResponse)
- **TypeScript SDK:** `packages/api-client/package.json` (openapi-typescript v7.4.3)
- **OpenAPI 3.1 Spec:** https://spec.openapis.org/oas/v3.1.0
- **allOf Composition:** https://swagger.io/docs/specification/data-models/oneof-anyof-allof-not/

---

**Ready for implementation. Next step:** Create pilot branch and migrate 3 endpoints for validation.

**Last Updated:** December 3, 2025
**Author:** Backend Team (AI-assisted analysis)
**Reviewers:** Gemini 2.5 Pro (expert validation)
