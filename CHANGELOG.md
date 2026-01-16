# Changelog

All notable changes to the BooksTrack API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- None

### Changed
- None

### Deprecated
- None

### Removed
- None

### Fixed
- None

---

## [3.4.3] - 2026-01-16

### Added
- **Personalized Recommendations V3**: New `/v3/recommendations/personalized` endpoint
- **Combo Endpoint Strategy**: Returns weekly recommendations with `strategy: "weekly_fallback"` until Alexandria ratings API available (Issue #258)
- **Shared Schemas**: `@bookstrack/schemas/recommendations` for personalized recommendations
- **Test Suite**: 80+ comprehensive tests for personalized recommendations (smoke + unit)
- **Testing Guide**: `docs/guides/V3_PERSONALIZED_RECOMMENDATIONS_TESTING.md`

### Changed
- **BREAKING**: Removed legacy `/api/recommendations` endpoint (migrated to V3)
- **Metadata Standardization**: `processingTimeMs` → `processingTime` for consistency across V3 endpoints
- **Enhanced JSON Parsing**: Added defensive try-catch in recommendations fallback logic
- **Cache Documentation**: Improved TTL documentation (7-day KV cache lifecycle)

### Fixed
- **Import Optimization**: Removed unused schema imports in V3 recommendations route
- **Defensive Error Handling**: Added malformed JSON protection in D1 recommendations data

### Migration
**iOS Clients:**
```swift
// Before (3.4.2)
GET /api/recommendations?limit=10

// After (3.4.3)
GET /v3/recommendations/personalized?limit=10

// Response format changed to V3 envelope:
{
  "success": true,
  "data": {
    "recommendations": [...],
    "total": 10,
    "strategy": "weekly_fallback"
  },
  "metadata": { ... }
}
```

---

## [3.4.0] - 2026-01-16

### Added
- **RFC 9457 Error Schema**: Unified all API routes to RFC 9457 Problem Details format
- **Genre Taxonomy Expansion**: 44 → 92 canonical genres (109% increase, including 2026 trends)
- **Request Correlation**: `requestId` field in all error responses for distributed tracing

### Changed
- **Error Format**: All routes now use `application/problem+json` media type
- **Error Fields**: Added `type`, `title`, `instance`, `code`, `retryable`, `retryAfterMs`, `metadata`
- **Alexandria Worker**: Upgraded to v2.8.0 (Service Provider Framework improvements)
- **Route Documentation**: Clarified non-V3 routes are production infrastructure, not legacy

### Fixed
- **Shelf Scan Validation**: Secrets Store access and results extraction (#253)
- **Test Suite**: 100% pass rate achieved (1,097 tests passing, 0 failures)
- **Rate Limiter Test**: Updated to RFC 9457 `detail` field format

### Migration
```typescript
// Error handling (backward compatible - check HTTP status OR success field)
if (response.status >= 400) {
  // RFC 9457 Problem Details
  const error = await response.json()
  console.error(`${error.title}: ${error.detail}`)
  console.log(`Error code: ${error.code}`) // Machine-readable
  console.log(`Retryable: ${error.retryable}`) // Retry guidance
  console.log(`Request ID: ${error.metadata.requestId}`) // Correlation
}
```

### Deployment
- Version: `abcf68b`
- Health: 🟢 0% error rate, 290 smoke tests passing

---

## [3.3.0] - 2026-01-05

### Added
- **Alexandria Enhanced Types**: Enriched author metadata with bio, gender, nationality, birth/death years, Wikidata ID, photos
- **Multi-Size Covers**: `coverUrls` object with small/medium/large variants for responsive images
- **TypeScript SDK v3.3.0**: Auto-generated types with full IntelliSense support

### Changed
- `Book.authors` now supports both `string[]` and `AuthorReference[]` (backward compatible)
- `Book.coverUrls` added with `{small, medium, large}` sizes
- `thumbnailUrl` deprecated in favor of `coverUrls.small`
- Alexandria worker upgraded to v2.2.4

### Migration
```typescript
// Authors (backward compatible)
const author = book.authors[0]
if (typeof author === 'object') {
  console.log(author.bio, author.nationality) // New fields
}

// Cover images
const thumb = book.coverUrls?.small || book.thumbnailUrl
const cover = book.coverUrls?.large || book.coverUrl
```

---

## [3.2.1] - 2026-01-05

### Changed
- Alexandria Worker upgraded to v2.2.4 (enhanced metadata foundation for v3.3.0)
- Added `AuthorReference` and `PaginationMetadata` type exports

### Fixed
- Gemini API timeout (30s limit via `AbortController`)
- Removed 2 unused interfaces (zero Biome warnings)

### Deployment
- Version: `1d4b5f7f-aaf5-4039-8fde-ef728cc5ce50`
- Health: 🟢 0% error rate, 199/199 tests passing

---

## [3.2.0] - 2026-01-05

### Added
- API versioning strategy documentation ([docs/API_VERSIONING.md](docs/API_VERSIONING.md))

### Changed
- **Version Alignment:** All packages synchronized to v3.2.0 (worker, SDK, OpenAPI)
- **NPM Package:** Published `@jukasdrj/bookstrack-api-client@3.2.0` to npm registry

### Fixed
- Test infrastructure: `env.CACHE.getWithMetadata` mock added (199/199 tests passing)

### Breaking Changes
- TypeScript SDK regenerated (API client 2.1.0 → 3.2.0)

---

## [3.1.0] - 2026-01-03

### Added
- TypeScript migration: 147/149 files (98.7%) complete
- All 5 Durable Objects migrated to TypeScript
- Biome linter and formatter integration

### Changed
- Zero `any` types policy enforced
- Test coverage: 199/199 smoke tests passing

---

## [3.0.0] - 2025-12-01 (MAJOR RELEASE)

### Added
- **V3 API:** Native Hono + `@hono/zod-openapi` with auto-generated OpenAPI 3.1 spec
- **Interactive Docs:** Swagger UI at `/v3/docs`
- **SSE Streaming:** Real-time job progress (replaces WebSocket)
- **Batch Enrichment:** Async mode for 51-500 ISBNs
- **Alexandria Integration:** 49M+ ISBNs, <100ms response time
- **Circuit Breakers:** All external API providers protected
- **RFC 9457 Errors:** Standardized Problem Details format
- **Webhooks:** Alexandria book processing callbacks

### Changed
- Response format: `{ success, data, metadata }` envelope enforced
- Provider chain: Alexandria (primary) → Google Books → OpenLibrary
- Cache hit ratio: 65% → 73%

### Deprecated
- V2 API endpoints (`/api/v2/*`) - Sunset March 2026

### Removed
- V1 API endpoints (`/v1/*`, `/search/*`) - Sunset complete

---

## [2.0.0] - 2024-06-15

### Added
- V2 API with `ResponseEnvelope` format
- WebSocket progress for batch jobs
- Multi-provider search (Google Books, OpenLibrary, ISBNdb)
- CSV import with AI-powered parsing
- Bookshelf scanning with Gemini 2.0 Flash

### Deprecated
- V1 API - Sunset December 2025

---

## [1.0.0] - 2024-01-15

### Added
- Initial release with V1 API
- ISBN lookup and search endpoints
- Google Books + OpenLibrary integration
- KV cache layer

---

**Versioning Policy:** See [docs/API_VERSIONING.md](docs/API_VERSIONING.md) for our versioning strategy, deprecation timeline, and migration guides.

**Migration Guides:**
- [V2 → V3 Migration Guide](docs/migration/v2-to-v3.md) (if available)
- [V1 → V2 Migration Guide](docs/archive/v1-api/migration.md) (archived)

**Live API Documentation:**
- OpenAPI Spec: https://api.oooefam.net/v3/openapi.json
- Swagger UI: https://api.oooefam.net/v3/docs
