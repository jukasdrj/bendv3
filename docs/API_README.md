# API Documentation

**BooksTrack Backend API v1.0.0**

Complete reference for canonical data contracts, API endpoints, and integration patterns.

## Quick Links

- **[Canonical API Contracts](#canonical-data-contracts)** - TypeScript-first API contracts (v1.0.0)
- **[Canonical Contracts Workflow](workflows/canonical-contracts-workflow.md)** - Visual Mermaid diagram
- **[Implementation Plan](plans/2025-11-11-canonical-api-contract-implementation.md)** - Complete implementation details
- **[Cover Harvest System](COVER_HARVEST_SYSTEM.md)** - ISBNdb cover caching (5000 req/day)

## Canonical Data Contracts

### Overview

TypeScript-first API contracts ensure consistency across all data providers. All `/v1/*` endpoints return structured canonical responses.

**Core DTOs:**
- `WorkDTO` - Abstract creative work (mirrors SwiftData Work model)
- `EditionDTO` - Physical/digital manifestation (multi-ISBN support)
- `AuthorDTO` - Creator with diversity analytics

**Response Envelope:** All `/v1/*` endpoints return discriminated union:
```typescript
{
  "success": true | false,
  "data": { works: WorkDTO[], authors: AuthorDTO[] } | undefined,
  "error": { message: string, code: ApiErrorCode, details?: any } | undefined,
  "meta": { timestamp: string, processingTime: number, provider: string, cached: boolean }
}
```

### V1 Endpoints (Canonical)

**Search Endpoints:**
- `GET /v1/search/title?q={query}` - Title search (canonical response)
- `GET /v1/search/isbn?isbn={isbn}` - ISBN lookup with validation (ISBN-10/ISBN-13)
- `GET /v1/search/advanced?title={title}&author={author}` - Flexible search (title, author, or both)
- `GET /v1/editions/search?workTitle={title}&author={author}&limit={limit}` - Find all editions of a specific work

**Enrichment Endpoints:**
- `POST /v1/enrichment/batch` - Batch enrichment with WebSocket progress

**Error Codes:**
- `INVALID_QUERY` - Empty/invalid search parameters
- `INVALID_ISBN` - Malformed ISBN format
- `NOT_FOUND` - No editions found for the specified work
- `PROVIDER_ERROR` - Upstream API failure (Google Books, ISBNdb, etc.)
- `INTERNAL_ERROR` - Unexpected server error

### Provenance Tracking

Every DTO includes:
- `primaryProvider` - Which API contributed the data ("google-books", "openlibrary", etc.)
- `contributors` - Array of all providers that enriched the data
- `synthetic` - Flag for Works inferred from Edition data (enables iOS deduplication)

### Implementation Status

- ✅ TypeScript types defined (`enums.ts`, `canonical.ts`, `responses.ts`)
- ✅ Google Books normalizers (`normalizeGoogleBooksToWork`, `normalizeGoogleBooksToEdition`)
- ✅ Backend genre normalization service (`genre-normalizer.ts`)
- ✅ All 3 `/v1/*` endpoints deployed with genre normalization active
- ✅ Backend enrichment services migrated to canonical format
- ✅ AI scanner WebSocket messages use canonical DTOs
- ✅ iOS Swift Codable DTOs (`WorkDTO`, `EditionDTO`, `AuthorDTO`)
- ✅ iOS search services migrated to `/v1/*` endpoints with DTOMapper
- ✅ iOS enrichment service migrated to canonical parsing
- ✅ Comprehensive test coverage (CanonicalAPIResponseTests)
- ✅ iOS DTOMapper fully integrated (deduplication active, genre normalization flowing)
- ⏳ Legacy endpoint deprecation (deferred 2-4 weeks)

## Legacy Endpoints (Still Active)

**Search:**
- `GET /search/title?q={query}` - Book search (6h cache)
- `GET /search/isbn?isbn={isbn}` - ISBN lookup (7-day cache)
- `GET /search/advanced?title={title}&author={author}` - Multi-field search (6h cache, supports POST for compatibility)

**Enrichment:**
- `POST /api/enrichment/start` - **DEPRECATED** Use `/v1/enrichment/batch` instead

**AI Scanning:**
- `POST /api/scan-bookshelf?jobId={uuid}` - AI bookshelf scan with Gemini 2.0 Flash
- `POST /api/scan-bookshelf/batch` - Batch scan (max 5 photos, parallel upload → sequential processing)

**CSV Import:**
- `POST /api/import/csv-gemini` - AI-powered CSV import with Gemini parsing (Beta)

**WebSocket:**
- `GET /ws/progress?jobId={uuid}` - WebSocket progress (unified for ALL jobs)

## AI Provider

**Gemini 2.0 Flash:**
- Google's production vision model with 2M token context window
- Processing time: 25-40s (includes AI inference + enrichment)
- Image size: Handles 4-5MB images natively (no resizing needed)
- Accuracy: High (0.7-0.95 confidence scores)
- Optimized for ISBN detection and small text on book spines
- Token tracking: All responses include token usage metrics (Nov 2025+)

**Best Practices (Nov 2025 Audit):**
- ✅ System instructions separated from dynamic content
- ✅ Image-first ordering in prompts
- ✅ Temperature optimization (0.2 CSV, 0.4 bookshelf)
- ✅ JSON output format via `responseMimeType`
- ✅ Token usage logging and metadata
- ✅ Stop sequences for cleaner termination

## Testing

### Health Check

```bash
curl https://api.oooefam.net/health
```

### Search Endpoints

```bash
# Title search (canonical)
curl "https://api.oooefam.net/v1/search/title?q=hamlet"

# ISBN search (canonical)
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780743273565"

# Advanced search (canonical)
curl "https://api.oooefam.net/v1/search/advanced?title=1984&author=Orwell"
```

### WebSocket Flow

1. Connect to WebSocket:
```bash
wscat -c "wss://api.oooefam.net/ws/progress?jobId=test-123"
```

2. Trigger background job:
```bash
curl -X POST https://api.oooefam.net/v1/enrichment/batch \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","workIds":["9780439708180"]}'
```

## Type Definitions

### TypeScript (Backend)

**Location:** `src/types/`

```typescript
// enums.ts
export enum DataProvider { /* ... */ }
export enum ApiErrorCode { /* ... */ }

// canonical.ts
export interface WorkDTO { /* ... */ }
export interface EditionDTO { /* ... */ }
export interface AuthorDTO { /* ... */ }

// responses.ts
export interface ApiResponse<T> { /* ... */ }
```

### Swift (iOS)

**Location:** `BooksTrackerPackage/Sources/BooksTrackerFeature/DTOs/`

```swift
// WorkDTO.swift
public struct WorkDTO: Codable { /* ... */ }

// EditionDTO.swift
public struct EditionDTO: Codable { /* ... */ }

// AuthorDTO.swift
public struct AuthorDTO: Codable { /* ... */ }

// ApiResponse.swift
public struct ApiResponse<T: Codable>: Codable { /* ... */ }
```

## Contract Versioning

**Current Version:** v1.0.0 (November 2025)

**Versioning Strategy:**
- TypeScript types are the source of truth
- iOS Swift types mirror TypeScript structure
- Breaking changes require new API version (`/v2/*`)
- Non-breaking changes (additive fields) maintain backward compatibility

**Contract Changes:**
1. Update TypeScript types in `src/types/`
2. Run backend tests to ensure compatibility
3. Update iOS Swift DTOs to match
4. Update integration tests
5. Deploy backend first (backward compatible)
6. Deploy iOS app second (uses new fields)

## Integration Patterns

### iOS → Backend Flow

1. **Search Flow:**
   ```
   iOS SearchView → EnrichmentConfig.searchTitleURL
                  → Backend /v1/search/title
                  → Google Books API
                  → Normalize to WorkDTO/EditionDTO
                  → Return ApiResponse<SearchResult>
                  → iOS DTOMapper → SwiftData models
   ```

2. **Enrichment Flow:**
   ```
   iOS EnrichmentQueue → EnrichmentConfig.enrichmentStartURL
                       → Backend /v1/enrichment/batch
                       → WebSocket connection (ProgressWebSocketDO)
                       → Background job processing
                       → Real-time progress updates
                       → iOS updates UI
   ```

3. **AI Scanning Flow:**
   ```
   iOS BookshelfScannerView → EnrichmentConfig.scanBookshelfURL
                             → Backend /api/scan-bookshelf
                             → Gemini 2.0 Flash API
                             → ISBN detection + enrichment
                             → WebSocket progress updates
                             → iOS displays results
   ```

## Related Documentation

- **[MONOLITH_ARCHITECTURE.md](../MONOLITH_ARCHITECTURE.md)** - Backend architecture overview
- **[COVER_HARVEST_SYSTEM.md](COVER_HARVEST_SYSTEM.md)** - ISBNdb cover caching system
- **[DEPLOYMENT.md](../DEPLOYMENT.md)** - Deployment guide
- **[iOS DTO Documentation](https://github.com/jukasdrj/books-tracker-v1/tree/main/BooksTrackerPackage/Sources/BooksTrackerFeature/DTOs)** - Swift DTO implementations

## Support

- **Backend Repository:** https://github.com/jukasdrj/bookstrack-backend
- **iOS Repository:** https://github.com/jukasdrj/books-tracker-v1
- **Issues:** https://github.com/jukasdrj/bookstrack-backend/issues

---

**Last Updated:** November 13, 2025
**API Version:** v1.0.0
**Maintainer:** Claude Code

### Editions Search Endpoint

**GET /v1/editions/search**

Find all editions of a specific work by title and author. Useful for the iOS "Find Different Edition" feature.

**Query Parameters:**
- `workTitle` (required) - Exact or approximate title of the work
- `author` (required) - Author name (handles various formats: "First Last" or "Last, First")
- `limit` (optional) - Maximum number of editions to return (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "works": [],     // Empty - not needed for this endpoint
    "editions": [
      {
        "isbn": "9780553418026",
        "isbns": ["9780553418026", "0553418025"],
        "title": "The Martian",
        "format": "Hardcover",
        "publisher": "Crown Publishing",
        "publicationDate": "2014-02-11",
        "pageCount": 369,
        "coverImageURL": "https://...",
        "primaryProvider": "isbndb",
        "isbndbQuality": 95
      },
      {
        "isbn": "9780553418026",
        "format": "Paperback",
        ...
      },
      {
        "isbn": "B00EMXBDMA",
        "format": "E-book",
        ...
      }
    ],
    "authors": []    // Empty - not needed for this endpoint
  },
  "meta": {
    "timestamp": "2025-11-14T23:00:00.000Z",
    "processingTime": 234.5,
    "provider": "orchestrated:isbndb+google-books",
    "cached": false
  }
}
```

**Features:**
- **Fuzzy Title Matching** - Handles variations like "The Martian" vs "Martian, The" (Levenshtein distance)
- **Author Matching** - Supports "Andy Weir" and "Weir, Andy" formats
- **ISBN Deduplication** - Automatically merges ISBN-10/ISBN-13 equivalents
- **Smart Sorting** - Hardcover → Paperback → E-book → Audiobook, then by publication date (newest first)
- **Multi-Provider** - Orchestrates ISBNdb and Google Books for comprehensive coverage
- **Caching** - 7-day TTL for fast repeated queries

**Error Responses:**
```json
// Missing parameters
{
  "success": false,
  "error": {
    "message": "workTitle parameter is required",
    "code": "INVALID_QUERY",
    "details": { "workTitle": "", "author": "Andy Weir" }
  },
  "meta": { ... }
}

// No editions found
{
  "success": false,
  "error": {
    "message": "No editions found for \"Unknown Book\" by Unknown Author",
    "code": "NOT_FOUND",
    "details": { "workTitle": "Unknown Book", "author": "Unknown Author" }
  },
  "meta": { ... }
}

// Provider failure
{
  "success": false,
  "error": {
    "message": "All book data providers failed",
    "code": "PROVIDER_ERROR",
    "details": { "error": "..." }
  },
  "meta": { ... }
}
```

**Example Requests:**
```bash
# Find all editions of The Martian
curl "https://api.bookstrack.app/v1/editions/search?workTitle=The%20Martian&author=Andy%20Weir"

# Limit to 5 editions
curl "https://api.bookstrack.app/v1/editions/search?workTitle=Harry%20Potter&author=J.K.%20Rowling&limit=5"

# Handle special characters
curl "https://api.bookstrack.app/v1/editions/search?workTitle=The%20Lord%20of%20the%20Rings&author=J.R.R.%20Tolkien"
```

**Performance:**
- Cached results: < 50ms
- Fresh searches: < 2s (depends on provider response times)
- Cache TTL: 7 days

**iOS Integration:**
```swift
// BookSearchAPIService.swift
func searchEditions(workTitle: String, author: String, limit: Int = 20) async throws -> [EditionDTO] {
    let response = try await fetch("/v1/editions/search?workTitle=\(workTitle)&author=\(author)&limit=\(limit)")
    return response.data.editions
}
```

