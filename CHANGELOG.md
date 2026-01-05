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
