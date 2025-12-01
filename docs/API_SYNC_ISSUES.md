# API Sync Issues - V2 Migration

**Created:** December 1, 2025  
**Owner:** Justin  
**Priority:** P0 - Launch Blocker

---

## Summary

The three repos (alex, bendv3, books-v3) have significant API drift. This document
tracks the specific issues that need to be resolved for V2 migration.

---

## Backend (bendv3) Issues

### Issue #001: Missing V2 Cancel Endpoint
**Status:** ✅ Fixed
**Priority:** P0

The iOS code expects `DELETE /api/v2/jobs/{jobId}/cancel` but the backend currently
has it at `DELETE /v1/jobs/{jobId}`.

**Resolution:**
- Added `DELETE /api/v2/jobs/{jobId}/cancel` route in router.ts (line 1665)
- V1 endpoint retained as deprecated alias until sunset

**File:** `src/router.ts`

---

### Issue #002: Search Mode Parameter for Similar Books
**Status:** ✅ Fixed
**Priority:** P1

The `/api/v2/search` endpoint supports `mode=semantic` but doesn't have explicit
`similar:ISBN` query parsing for "find similar" functionality.

**Resolution:**
- Added `similar:ISBN` query pattern parsing (e.g., `q=similar:9780439708180`)
- Added `mode=similar` with `isbn` parameter support
- Added `handleSimilarSearchV2` function to delegate to Vectorize-based similar search

**File:** `src/handlers/v2/search.ts`

---

### Issue #003: SSE Stream Not Returning Books Array
**Status:** ✅ Fixed
**Priority:** P1

The SSE `complete` event should include the full books array for iOS persistence.
Need to verify this is happening in the current implementation.

**Resolution:**
- Updated `JobStateManagerDO.complete()` to include `books` array in SSE broadcast
- Updated `handleSSEStream` to include `books` array in final complete event
- Books are extracted from the stored job result payload

**Files:**
- `src/durable-objects/job-state-manager.js`
- `src/handlers/v2/sse-stream.ts`

---

### Issue #004: OpenAPI Spec Out of Date
**Status:** ✅ Fixed  
**Priority:** P0

Created `docs/openapi-v2.yaml` with V2-only endpoints.

**Files Created:**
- `docs/openapi-v2.yaml` - V2 OpenAPI spec
- `docs/API_SYNC_V2.md` - Contract documentation

---

## iOS (books-v3) Issues

### Issue #101: Multiple Search Endpoints Need Consolidation
**Status:** 🔴 Not Started  
**Priority:** P0

iOS has 4 separate search methods using different V1 endpoints.
All need to migrate to unified `/api/v2/search`.

**Files to Update:**
- `API/BooksTrackAPI+Search.swift`

**Migration Guide:** `docs/V2_MIGRATION_GUIDE.md`

---

### Issue #102: Batch Enrich Fallback Logic
**Status:** 🔴 Not Started  
**Priority:** P1

iOS has fallback logic for `/api/batch-enrich` → `/api/enrichment/batch`.
Both are deprecated. Should use import workflow for batch operations.

**Files to Update:**
- `API/BooksTrackAPI+Enrichment.swift`

---

### Issue #103: WebSocket Progress Manager
**Status:** 🔴 Not Started  
**Priority:** P1

WebSocket is replaced by SSE. Need to either:
1. Deprecate WebSocket code and add SSE client
2. Or: Keep WebSocket temporarily while SSE is implemented

**Files Affected:**
- `Common/WebSocketProgressManager.swift`
- `Common/WebSocketHelpers.swift`
- Need new: `API/SSEClient.swift`

---

### Issue #104: Search Results DTO Missing
**Status:** 🔴 Not Started  
**Priority:** P1

The unified search returns `SearchResults` with `results`, `total`, `mode`, `query`.
This DTO doesn't exist in iOS yet.

**Action Required:**
Add `DTOs/SearchResultsDTO.swift`

---

## Alexandria (alex) Issues

### Issue #201: No Direct iOS Calls
**Status:** ✅ By Design  
**Priority:** Info Only

Alexandria should NOT be called directly by iOS.
All requests flow: iOS → bendv3 → Alexandria

**No action required** - just documentation note.

---

### Issue #202: Cover Image URLs
**Status:** ✅ Verified COMPLIANT
**Priority:** P2

Cover image URLs are correctly returned in all V2 endpoints.

**Field Name Convention:**
- **Internal (canonical DTOs):** `coverImageURL` (WorkDTO, EditionDTO)
- **External (V2 API responses):** `coverUrl` (consistent across all V2 endpoints)

**Compliance Verification:**

| Endpoint | Field | Transformation | Status |
|----------|-------|----------------|--------|
| `/api/v2/search` | `coverUrl` | `transformV1ToV2Books()` converts `coverImageURL` → `coverUrl` | ✅ |
| `/api/v2/books/enrich` | `coverUrl` | `coverImageURL` → `coverUrl` (line 287) | ✅ |
| SSE `complete` event | `books[].coverUrl` | `coverImageURL` → `coverUrl` | ✅ |
| AI Scanner | `books[].coverUrl` | `work.coverImageURL` → `coverUrl` (line 239) | ✅ |
| Batch Scan | `books[].coverUrl` | `work.coverImageURL` → `coverUrl` (line 64) | ✅ |
| CSV Import | `books[].coverUrl` | Set to `undefined` (no covers in CSV) | ✅ |

**Cover URL Sources by Provider:**

| Provider | Source Field | Transformation | Example URL |
|----------|--------------|----------------|-------------|
| Google Books | `imageLinks.thumbnail` | HTTPS + `&zoom=3` | `https://books.google.com/...&zoom=3` |
| OpenLibrary | `cover_i` (ID) | Format to URL | `https://covers.openlibrary.org/b/id/{id}-L.jpg` |
| ISBNdb | `image` (full URL) | Pass-through | Direct URL |
| Alexandria | `openlibrary_edition` | Extract OLID | `https://covers.openlibrary.org/b/olid/{OLID}-L.jpg` |
| Fallback | None | Placeholder | `getPlaceholderCover()` |

**Key Files:**
- `src/services/normalizers/google-books.ts` (lines 17-24, 41, 77)
- `src/services/normalizers/openlibrary.ts` (lines 23-25, 56-58)
- `src/services/normalizers/isbndb.ts` (line 87)
- `src/services/normalizers/alexandria.ts` (lines 46-48, 85-87)
- `src/handlers/v2/enrich.ts` (line 287)
- `src/services/ai-scanner.js` (line 239)
- `src/handlers/batch-scan-handler.ts` (line 64)

**iOS Accessibility:** All cover URLs are publicly accessible:
- Google Books covers: Public CDN
- OpenLibrary covers: Public CDN
- ISBNdb covers: Public CDN
- No Alexandria-specific URLs exposed (transformed to OpenLibrary URLs)

**Critical Fix Applied (Dec 1, 2025):**
The V2 text search was returning empty results because it expected `results` array
but V1 returns `works/editions/authors` structure. Added `transformV1ToV2Books()`
function to properly convert canonical format to flat `BookDTO[]` with `coverUrl`.

**File:** `src/handlers/v2/search.ts` (lines 232-276, 278-319)

---

## Cross-Cutting Issues

### Issue #301: ResponseEnvelope `success` vs `error` Discriminator
**Status:** ✅ Verified
**Priority:** P0

Backend uses `success: true/false` as the discriminator.
iOS decodes using `envelope.success` check.

**Verification:**
1. ✅ All V2 endpoints use `createSuccessResponse` (includes `success: true`)
2. ✅ All V2 error responses use `createErrorResponse` (includes `success: false`)
3. ✅ `X-Response-Format: v2.0` header set on all responses

**File:** `src/utils/response-builder.ts` (lines 106, 160)

---

### Issue #302: Rate Limit Headers
**Status:** ✅ Fixed
**Priority:** P2

iOS needs to handle `429 Too Many Requests` with `Retry-After` header.

**Resolution:**
- Updated `createErrorResponse()` to accept `retryAfterMs` option
- Automatically sets `Retry-After` header (in seconds) for 429 responses
- Added `retryAfterMs` field in response body for iOS client convenience
- Updated V2 search and enrich handlers to use new error format

**Files Updated:**
- `src/utils/response-builder.ts` (lines 127-234)
- `src/handlers/v2/search.ts` (circuit breaker error handling)
- `src/handlers/v2/enrich.ts` (circuit breaker error handling)

**Response Format:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for google-books",
    "retryable": true,
    "retryAfterMs": 60000
  }
}
```
**HTTP Headers:** `Retry-After: 60` (seconds)

---

### Issue #303: Circuit Breaker Error Handling
**Status:** ✅ Fixed
**Priority:** P2

When external providers (Google Books, ISBNdb) are down, bendv3 returns
`CIRCUIT_OPEN` error code. iOS should handle this gracefully with retry.

**Resolution:**
- Added `CIRCUIT_OPEN` to `ErrorCodes` constant
- Added `CIRCUIT_OPEN` to retryable errors set
- V2 handlers now catch `CircuitBreakerOpenError` and return proper 429 response
- Response includes `retryAfterMs` for intelligent retry scheduling

**Response Format:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CIRCUIT_OPEN",
    "message": "Provider google-books temporarily unavailable",
    "retryable": true,
    "retryAfterMs": 45000,
    "details": { "provider": "google-books" }
  }
}
```
**HTTP Headers:** `Retry-After: 45` (seconds)

---

## Progress Tracking

| Issue | Status | Owner | ETA |
|-------|--------|-------|-----|
| #001 V2 Cancel Endpoint | ✅ | Backend | Done |
| #002 Similar Search | ✅ | Backend | Done |
| #003 SSE Books Array | ✅ | Backend | Done |
| #004 OpenAPI Spec | ✅ | Done | - |
| #101 Search Consolidation | 🔴 | iOS | Week 1 |
| #102 Batch Enrich Removal | 🔴 | iOS | Week 1 |
| #103 SSE Client | 🔴 | iOS | Week 2 |
| #104 SearchResults DTO | 🔴 | iOS | Week 1 |
| #201 Alex Direct Calls | ✅ | By Design | - |
| #202 Cover URLs | ✅ | Both | Done |
| #301 Response Envelope | ✅ | Both | Done |
| #302 Rate Limits | ✅ | Backend | Done |
| #303 Circuit Breaker | ✅ | Backend | Done |

---

## Next Steps

1. **Backend Team (Week 1):** ✅ COMPLETE
   - [x] Add V2 cancel endpoint
   - [x] Verify/fix similar search mode
   - [x] Verify SSE complete event has books
   - [x] Add Retry-After header support (Issue #302)
   - [x] Add CIRCUIT_OPEN error handling (Issue #303)

2. **iOS Team (Week 1):**
   - [ ] Consolidate search methods to `/api/v2/search`
   - [ ] Add SearchResults DTO
   - [ ] Remove batch enrich fallback
   - [ ] Handle `Retry-After` header in error responses

3. **iOS Team (Week 2):**
   - [ ] Implement SSE client for `/api/v2/imports/{jobId}/stream`
   - [ ] Deprecate WebSocket code
   - [ ] Handle `CIRCUIT_OPEN` error code with retry logic
   - [ ] End-to-end testing

4. **Both Teams (Week 3):**
   - [ ] Integration testing
   - [ ] Fix any remaining issues
   - [ ] Prepare for production

---

**Last Updated:** December 1, 2025 (Backend #302/#303 fixes)
