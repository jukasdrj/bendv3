# API Sync V2 - Contract Alignment

**Date:** December 1, 2025  
**Goal:** V2 Priority with Aggressive Deprecation  
**Sunset Date:** March 1, 2026

---

## Executive Summary

The bendv3 backend has ~45 endpoints. The iOS app (books-v3) is using a mix of V1/V2 endpoints. 
This document establishes the **canonical V2 API contract** that iOS must migrate to.

### Key Decision: V2 is the ONLY supported path forward

| Category | Status | iOS Action Required |
|----------|--------|---------------------|
| `/api/v2/*` | ✅ CURRENT | Use these |
| `/v1/*` | ⚠️ DEPRECATED | Migrate away |
| `/search/*`, `/api/batch-*` | ⛔ LEGACY | Remove immediately |

---

## Part 1: V2 API Contract (iOS MUST Use)

### 1.1 Search API

#### `GET /api/v2/search`
Unified search with multiple modes.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `q` | string | ✅ | Search query |
| `mode` | enum | ❌ | `text` (default), `semantic`, `hybrid` |
| `limit` | int | ❌ | Max results (default: 20, max: 50) |
| `offset` | int | ❌ | Pagination offset |

**Response:**
```json
{
  "data": {
    "results": [...BookDTO],
    "total": 42,
    "mode": "text",
    "query": "harry potter"
  },
  "metadata": {
    "timestamp": "2025-12-01T00:00:00Z",
    "source": "vectorize|text-search",
    "cached": false,
    "processingTime": 127
  }
}
```

**iOS Migration:**
```swift
// OLD (deprecated)
func search(isbn: String) // /v1/search/isbn
func search(title: String) // /v1/search/title
func searchSemantic(query: String) // already V2 ✅

// NEW (required)
func unifiedSearch(query: String, mode: SearchMode = .text, limit: Int = 20)
```

---

### 1.2 Enrichment API

#### `POST /api/v2/books/enrich`
Single book enrichment by barcode/ISBN.

**Request:**
```json
{
  "barcode": "9780439064873",
  "idempotencyKey": "scan_9780439064873"  // Optional, auto-generated
}
```

**Response (Flat - Default):**
```json
{
  "data": {
    "isbn": "9780439064873",
    "title": "Harry Potter and the Sorcerer's Stone",
    "authors": ["J.K. Rowling"],
    "publisher": "Scholastic",
    "publishedDate": "1998-09-01",
    "description": "...",
    "pageCount": 309,
    "categories": ["Fantasy", "Young Adult"],
    "coverUrl": "https://...",
    "provider": "google_books",
    "enrichedAt": "2025-12-01T00:00:00Z",
    "vectorized": true
  },
  "metadata": {...}
}
```

#### `POST /api/v2/books/enrich/detailed`
Same as above but returns nested canonical DTOs.

**Response (Nested DTOs):**
```json
{
  "data": {
    "work": { ...WorkDTO },
    "edition": { ...EditionDTO },
    "authors": [ ...AuthorDTO ]
  },
  "metadata": {...}
}
```

**iOS Migration:**
```swift
// OLD (deprecated)
func enrichBatch(barcodes: [String]) // /api/batch-enrich
// Fallback to /api/enrichment/batch - REMOVE THIS

// NEW (required)
func enrichBook(barcode: String) async throws -> EnrichedBookDTO
// Already using /api/v2/books/enrich ✅
```

---

### 1.3 Import Workflow API

#### `POST /api/v2/imports`
Create a new import job (CSV, batch scan, etc.)

**Request (multipart/form-data):**
- `file`: CSV file

**Response:**
```json
{
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "authToken": "job_token_xxx",
    "status": "initialized",
    "sseUrl": "/api/v2/imports/550e.../stream"
  },
  "metadata": {...}
}
```

#### `GET /api/v2/imports/:jobId`
Poll job status.

**Response:**
```json
{
  "data": {
    "jobId": "550e...",
    "status": "processing|completed|failed|canceled",
    "progress": 0.67,
    "processedCount": 20,
    "totalCount": 30,
    "pipeline": "csv_import",
    "startTime": "...",
    "completedTime": "...",
    "error": null
  },
  "metadata": {...}
}
```

#### `GET /api/v2/imports/:jobId/stream`
SSE progress stream (REPLACES WebSocket).

**Event Stream:**
```
event: progress
data: {"processedCount":5,"totalCount":30,"progress":0.17}

event: book_enriched
data: {"isbn":"978...","title":"...","status":"success"}

event: complete
data: {"status":"completed","booksCreated":28,"booksUpdated":2}
```

#### `GET /api/v2/imports/:jobId/results`
Get final import results.

**Response:**
```json
{
  "data": {
    "booksCreated": 28,
    "booksUpdated": 2,
    "duplicatesSkipped": 0,
    "enrichmentSucceeded": 27,
    "enrichmentFailed": 1,
    "errors": [...],
    "books": [...BookDTO]
  },
  "metadata": {...}
}
```

**iOS Migration:**
```swift
// OLD (deprecated)
// WebSocket at /ws/progress - REMOVE
// Token refresh at /api/token/refresh - REMOVE

// NEW (required)
func importCSV(data: Data) -> (jobId: String, authToken: String) // ✅
func getJobStatus(jobId: String) -> ImportJobStatus // ✅ 
func getImportResults(jobId: String) -> ImportResults // ✅
// ADD: SSEClient for /api/v2/imports/:jobId/stream
```

---

### 1.4 Discovery API

#### `GET /api/v2/capabilities`
Feature discovery endpoint.

**Response:**
```json
{
  "data": {
    "features": {
      "semanticSearch": true,
      "batchImport": true,
      "sseStreaming": true,
      "vectorization": true
    },
    "limits": {
      "maxBatchSize": 10,
      "maxSearchResults": 50,
      "rateLimitPerMinute": 100
    },
    "version": "2.1.0"
  },
  "metadata": {...}
}
```

#### `GET /api/v2/recommendations/weekly`
Weekly book picks.

#### `GET /api/v2/trending/searches`
Popular search queries.

#### `GET /api/v2/trending/books`
Trending books.

---

## Part 2: Deprecation Timeline

### Phase 1: NOW (December 2025)
- Document all V2 endpoints ✅
- iOS team starts migration
- Add deprecation warnings to V1 responses

### Phase 2: January 2026
- V1 endpoints return `Deprecation: true` header
- Log all V1 usage for tracking
- iOS should have V2 migration complete

### Phase 3: March 1, 2026 (SUNSET)
- V1 and legacy endpoints return `410 Gone`
- All V1/legacy code removed from bendv3

---

## Part 3: iOS Current Endpoint Usage (Audit)

| iOS File | Current Endpoint | V2 Replacement | Status |
|----------|------------------|----------------|--------|
| `BooksTrackAPI+Search.swift` | `/v1/search/isbn` | `/api/v2/search?mode=text&q=isbn:XXX` | 🔴 Migrate |
| `BooksTrackAPI+Search.swift` | `/v1/search/title` | `/api/v2/search?q=XXX` | 🔴 Migrate |
| `BooksTrackAPI+Search.swift` | `/api/v2/search` (semantic) | ✅ Already V2 | ✅ Keep |
| `BooksTrackAPI+Search.swift` | `/v1/search/similar` | `/api/v2/search?mode=similar&isbn=XXX` | 🔴 Migrate |
| `BooksTrackAPI+Search.swift` | `/v1/search/advanced` | `/api/v2/search?title=X&author=Y` | 🔴 Migrate |
| `BooksTrackAPI+Enrichment.swift` | `/api/v2/books/enrich` | ✅ Already V2 | ✅ Keep |
| `BooksTrackAPI+Enrichment.swift` | `/api/batch-enrich` | `/api/v2/imports` (batch workflow) | 🔴 Remove |
| `BooksTrackAPI+Enrichment.swift` | `/v1/jobs/:id` (DELETE) | `/api/v2/jobs/:id/cancel` | 🔴 Migrate |
| `BooksTrackAPI+Import.swift` | `/api/v2/imports` | ✅ Already V2 | ✅ Keep |
| `BooksTrackAPI+Import.swift` | `/api/v2/imports/:id` | ✅ Already V2 | ✅ Keep |
| `BooksTrackAPI+Import.swift` | `/api/v2/imports/:id/results` | ✅ Already V2 | ✅ Keep |
| `BooksTrackAPI.swift` | `/api/v2/jobs/:id/cancel` | ✅ Already V2 | ✅ Keep |

---

## Part 4: ResponseEnvelope Contract

ALL V2 endpoints use the unified ResponseEnvelope format.

```typescript
interface ResponseEnvelope<T> {
  success: boolean;          // Discriminator
  data: T | null;            // Payload (null on error)
  metadata: {
    timestamp: string;       // ISO 8601
    source?: string;         // Provider that served data
    cached?: boolean;        // From cache?
    processingTime?: number; // Milliseconds
  };
  error: {                   // null on success
    code: string;            // Machine-readable code
    message: string;         // Human-readable message
    details?: object;        // Additional context
    retryable?: boolean;     // Can retry?
    retryAfterMs?: number;   // Wait time for retry
  } | null;
}
```

**Error Codes:**
- `NOT_FOUND`
- `INVALID_REQUEST`
- `INVALID_ISBN`
- `MISSING_PARAMETER`
- `UNAUTHORIZED`
- `RATE_LIMIT_EXCEEDED`
- `CIRCUIT_OPEN`
- `PROVIDER_ERROR`
- `INTERNAL_ERROR`

---

## Part 5: Alexandria Integration

Alexandria (alex worker) is the book metadata enrichment hub. bendv3 calls Alexandria internally.

**Alexandria Endpoints (Internal Use Only):**
- `GET /api/search` - Query OpenLibrary database
- `POST /api/enrich/edition` - Store enriched edition
- `POST /api/enrich/work` - Store enriched work
- `POST /api/enrich/author` - Store enriched author
- `GET /api/covers/:work_key/:size` - Serve cover images

**iOS does NOT call Alexandria directly.** All book data flows through bendv3:
```
iOS → bendv3 (/api/v2/*) → Alexandria → PostgreSQL
                        ↓
              External APIs (Google Books, ISBNdb)
```

---

## Part 6: Next Steps

### For bendv3 Team
1. [ ] Update OpenAPI spec with all V2 endpoints
2. [ ] Add deprecation headers to V1 endpoints
3. [ ] Create `/api/v2/jobs/:id/cancel` endpoint
4. [ ] Implement `/api/v2/search?mode=similar` parameter
5. [ ] Add usage logging for deprecated endpoints

### For iOS Team
1. [ ] Create unified `V2SearchService` using `/api/v2/search`
2. [ ] Remove `/api/batch-enrich` fallback logic
3. [ ] Replace WebSocket progress with SSE client
4. [ ] Update job cancellation to V2 endpoint
5. [ ] Test all V2 endpoints before removing V1 code

---

**Last Updated:** December 1, 2025  
**Next Review:** January 15, 2026
