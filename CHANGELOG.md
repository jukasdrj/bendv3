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

## [3.3.0] - 2026-01-05

### Added - V3 API: Alexandria Enhanced Types (FEATURE RELEASE)

**🎉 Alexandria v2.2.4 metadata now fully exposed in V3 API responses!**

This release makes Alexandria's enriched author metadata and multi-size cover images available to all API consumers.

#### Author Metadata (`AuthorReference`)
V3 API now returns full author objects with enriched metadata (when available from Alexandria):

```typescript
{
  "authors": [{
    "name": "J.R.R. Tolkien",
    "key": "/authors/OL26320A",
    "openlibrary": "https://openlibrary.org/authors/OL26320A",
    "bio": "English writer, poet, philologist...",
    "gender": "male",
    "nationality": "British",
    "birth_year": 1892,
    "death_year": 1973,
    "wikidata_id": "Q892",
    "image": "https://covers.openlibrary.org/a/olid/OL26320A-M.jpg"
  }]
}
```

**Backward Compatible:** API still accepts `string[]` for authors, but returns enriched objects when available.

#### Cover Images (`CoverUrls`)
Multiple optimized cover sizes now available:

```typescript
{
  "coverUrls": {
    "large": "https://covers.openlibrary.org/b/id/12345-L.jpg",
    "medium": "https://covers.openlibrary.org/b/id/12345-M.jpg",
    "small": "https://covers.openlibrary.org/b/id/12345-S.jpg"
  },
  "coverUrl": "...",      // Legacy: still available (points to large)
  "thumbnailUrl": "...",  // Deprecated: use coverUrls.small
  "coverSource": "r2"     // NEW: indicates storage source
}
```

**Affected Endpoints:**
- ✅ `GET /v3/books/:isbn` - Direct ISBN lookup
- ✅ `GET /v3/books/search` - Search results
- ✅ `POST /v3/books/enrich` - Enrichment responses

**TypeScript SDK:** `@jukasdrj/bookstrack-api-client` v3.3.0
- Auto-generated types include `AuthorReference` and `CoverUrls`
- Full IntelliSense support for new fields
- Update: `npm install @jukasdrj/bookstrack-api-client@latest`

**OpenAPI Spec:** Updated at `/v3/openapi.json`
- New schemas: `AuthorReference`, `CoverUrls`
- Updated `Book.authors` to support union type: `string | AuthorReference`
- Interactive docs: https://api.oooefam.net/v3/docs

### Changed
- **V3 API Schema:** `Book.authors` now supports both `string[]` and `AuthorReference[]` (backward compatible)
- **V3 API Schema:** Added `Book.coverUrls` object with `{large, medium, small}` sizes
- **V3 API Schema:** Added `Book.coverSource` enum: `r2 | external | external-fallback`
- **V3 API Response:** `thumbnailUrl` now deprecated in favor of `coverUrls.small`
- **V3 API Response:** `coverUrl` description updated to indicate legacy single URL
- **Package Version:** Root package bumped to v3.3.0
- **NPM Package:** `@jukasdrj/bookstrack-api-client` bumped to v3.3.0

### Technical Details
- Updated `src/api-v3/index.ts` to pass through Alexandria's enriched author objects
- Updated `src/api-v3/index.ts` to map Alexandria's `coverUrls` to response format
- Updated `packages/schemas/src/book.ts` with new `AuthorReferenceSchema` and `CoverUrlsSchema`
- Regenerated OpenAPI spec at `src/api-v3/openapi-static.json`
- Regenerated TypeScript SDK in `packages/api-client/`

### Migration Guide (Optional)
Clients using the old `string[]` format will continue to work. To adopt enriched metadata:

```typescript
// Before (still works)
const authorName = book.authors[0] // string

// After (recommended)
const author = book.authors[0]
if (typeof author === 'object') {
  console.log(author.bio, author.image, author.nationality)
} else {
  console.log(author) // fallback to string
}
```

**Cover Images:**
```typescript
// Before
const thumb = book.thumbnailUrl

// After (recommended)
const thumb = book.coverUrls?.small || book.thumbnailUrl
const cover = book.coverUrls?.large || book.coverUrl
```

---

## [3.2.1] - 2026-01-05

### Changed
- **Alexandria Worker:** Updated from v2.2.1 to v2.2.4
  - v2.2.3: Enhanced `AuthorReference` with enriched metadata (bio, gender, nationality, birth/death years, Wikidata ID, author photo)
  - v2.2.4: Enhanced `BookResult.coverUrls` with multiple sizes (large, medium, small) for optimized image delivery
  - v2.2.4: Enhanced `CoverStatus.urls` with original + resized versions
  - All new fields are optional (no breaking changes)
- **Type Exports:** Added `AuthorReference` and `PaginationMetadata` to `src/types/alexandria-types.ts`

### Fixed
- **Gemini API:** Added 30s timeout to prevent hanging on slow API responses using `AbortController`
- **Code Quality:** Removed 2 unused interfaces (0 Biome linting warnings)
  - Removed unused `CacheMetricsPayload` from `src/handlers/author-search.ts`
  - Removed unused `ParsedBook` from `src/handlers/warming-upload.ts`

### Deployment
- **Version ID:** 1d4b5f7f-aaf5-4039-8fde-ef728cc5ce50
- **Deployed:** January 5, 2026
- **Health Status:** 🟢 0% error rate, all endpoints operational
- **Tests:** 199/199 smoke tests passing

---

## [3.2.0] - 2026-01-05

### Added
- API versioning strategy documentation ([docs/API_VERSIONING.md](docs/API_VERSIONING.md))

### Changed
- **Version Alignment:** Synchronized all version numbers to 3.2.0
  - Worker package version: 3.1.0 → 3.2.0
  - API client package: 2.1.0 → 3.2.0
  - OpenAPI specification: 3.0.0 → 3.2.0
  - Production API endpoints now consistently report v3.2.0
- **NPM Package:** Published `@jukasdrj/bookstrack-api-client@3.2.0` to npm registry
- **TypeScript SDK:** Regenerated from updated OpenAPI specification

### Fixed
- **Critical Test Infrastructure:** Fixed `TypeError: env.CACHE.getWithMetadata is not a function`
  - Added missing `getWithMetadata` method to global KV mock
  - Updated 26+ test files with inline CACHE mocks
  - Smoke tests: 199/199 passing ✓
  - Resolved deployment blocker

### Breaking Changes
- API client major version bump (2.1.0 → 3.2.0)
- TypeScript SDK regenerated - may require type updates in consuming applications

---

## [3.1.0] - 2026-01-03

### Added
- TypeScript migration: 147/149 files (98.7%) migrated to TypeScript
- All 5 Durable Objects migrated to TypeScript (Week 3 Phase 6 complete)
- Zero `any` types policy enforced across codebase
- Biome linter and formatter integration

### Changed
- Improved test coverage: 199/199 smoke tests passing
- Enhanced code quality with strict TypeScript types

---

## [3.0.0] - 2025-12-01

### Added
- Native Hono + `@hono/zod-openapi` integration for code-first API design
- Auto-generated OpenAPI 3.1 specification at `/v3/openapi.json`
- Interactive Swagger UI at `/v3/docs`
- RFC 9457 Problem Details for standardized error responses
- SSE (Server-Sent Events) for real-time job progress monitoring
- Batch enrichment with async mode (51-500 ISBNs)
- `POST /v3/jobs/enrichment` - Async batch enrichment endpoint
- `GET /v3/jobs/enrichment/:jobId/stream` - SSE progress stream
- `GET /v3/jobs/enrichment/:jobId/results` - Paginated enrichment results
- `DELETE /v3/jobs/enrichment/:jobId` - Cancel enrichment job
- Alexandria-first provider architecture (49M+ ISBNs, <100ms)
- HATEOAS links (`_links`) for API discoverability
- `GET /v3/capabilities` - API capabilities endpoint
- `GET /v3/recommendations` - Weekly book recommendations
- `POST /v3/webhooks/alexandria/books/:isbn` - Alexandria webhook integration
- Circuit breaker protection for all external API providers

### Changed
- Response envelope: Enforced `{ success, data, metadata }` format
- Error format: RFC 9457 instead of custom error objects
- Field renames: `results` → `books`, `query` → `q`
- Progress monitoring: SSE replaces WebSocket for simplicity
- Rate limits: Per-endpoint limits instead of global only
- Cache architecture: Alexandria-first with simplified KV-only metadata tier
- Provider chain: Alexandria (primary) → Google Books → OpenLibrary

### Deprecated
- V2 API endpoints (`/api/v2/*`) - Sunset scheduled for March 2026

### Removed
- V1 API endpoints (`/v1/*`, `/search/*`) - Sunset completed December 2025

### Fixed
- Improved error handling with RFC 9457 standard format
- Better type safety with Zod schema validation
- Enhanced cache hit ratio (65% → 73%)

---

## [2.0.0] - 2024-06-15

### Added
- `ResponseEnvelope` format with `success` discriminator
- WebSocket progress for batch jobs
- Multi-provider search (Google Books, OpenLibrary, ISBNdb)
- Basic enrichment endpoint (`POST /api/v2/books/enrich`)
- CSV import with AI-powered parsing
- Bookshelf scanning with Gemini 2.0 Flash

### Changed
- Standardized response format across all endpoints
- Improved error messages with structured error codes

### Deprecated
- V1 API endpoints - Sunset scheduled for December 2025

---

## [1.0.0] - 2024-01-15

### Added
- Initial release
- Basic search endpoints (`/v1/search/*`)
- ISBN lookup (`/v1/books/:isbn`)
- Google Books integration
- OpenLibrary fallback
- KV cache layer

---

**Versioning Policy:** See [docs/API_VERSIONING.md](docs/API_VERSIONING.md) for our versioning strategy, deprecation timeline, and migration guides.

**Migration Guides:**
- [V2 → V3 Migration Guide](docs/migration/v2-to-v3.md) (if available)
- [V1 → V2 Migration Guide](docs/archive/v1-api/migration.md) (archived)

**Live API Documentation:**
- OpenAPI Spec: https://api.oooefam.net/v3/openapi.json
- Swagger UI: https://api.oooefam.net/v3/docs
