# Changelog

All notable changes to the BooksTrack API Client will be documented in this file.

## [3.4.0] - 2026-01-07

### Added

- **Multi-Size Cover URLs** - Support for responsive cover images (#237)
  - New `coverUrls` field with `original`, `large`, `medium`, `small` sizes
  - New `coverSource` enum: `r2`, `external`, `external-fallback`, `enriched-cached`
  - Deprecated: `coverUrl` and `thumbnailUrl` (still present for backward compatibility)

### Changed

- **Schema Update** - Regenerated from OpenAPI spec with Sprint 2 enhancements
- **API Version** - Aligned with API v3.3.0 production release
- **Type Safety** - Improved TypeScript definitions for book metadata

### Improved

- Durable Object test coverage with real Workers runtime validation
- Alarm resilience and continuity patterns
- D1 concurrency optimization analysis

## [2.0.0] - 2025-12-10

### BREAKING CHANGES

- **V3 API Only** - SDK now targets V3 API exclusively
  - All V1 and V2 endpoints have been removed
  - Schema regenerated from `/v3/openapi.json`
  - Update all endpoint paths from `/api/v2/*` to `/v3/*`

### Added

- **Discovery Endpoints** - New V3 discovery routes
  - `GET /v3/capabilities` - API feature discovery, limits, deprecations
  - `GET /v3/recommendations/weekly` - Weekly curated book recommendations

### Changed

- **Schema Source** - Now generated from `src/api-v3/openapi-static.json`
- **Version Bump** - Major version to indicate breaking API changes

### Removed

- All V2 endpoints (sunset March 2026):
  - `/api/v2/capabilities` → Use `/v3/capabilities`
  - `/api/v2/recommendations/weekly` → Use `/v3/recommendations/weekly`
  - `/api/v2/search` → Use `/v3/books/search`
  - `/api/v2/imports/*` → Use `/v3/jobs/imports/*`
  - `/api/v2/books/enrich` → Use `/v3/books/enrich`

### Migration Guide (1.x → 2.0)

```typescript
// Before (V2)
const response = await client.GET('/api/v2/capabilities')
const search = await client.GET('/api/v2/search', { params: { query: { q: 'harry potter' } } })

// After (V3)
const response = await client.GET('/v3/capabilities')
const search = await client.GET('/v3/books/search', { params: { query: { q: 'harry potter' } } })
```

## [1.2.0] - 2025-12-03

### Added

- **Shared Response Schemas** - Created `SuccessResponse` and updated `ErrorResponse`
  - All responses now properly document the `success: boolean` discriminator
  - Provides foundation for consistent response handling across all endpoints

### Fixed

- **Capabilities Endpoint Decoding** - Added missing `success` field to OpenAPI spec
  - Fixes iOS error: "The data couldn't be read because it is missing"
  - OpenAPI spec now matches actual backend response format
  - SDK auto-generated with correct schema including `success: boolean`

### Known Issues

- **Incomplete Response Schema Migration** - Not all endpoints reference `SuccessResponse` yet
  - Shared schemas created but full endpoint migration is in progress
  - Priority endpoints (capabilities, imports, search) are fixed
  - Complete migration tracked in backend issue tracker

## [1.1.2] - 2025-12-03 (Deprecated - use 1.2.0)

### Fixed

- **Capabilities Endpoint Decoding** - Added missing `success` field to OpenAPI spec
  - Fixes iOS error: "The data couldn't be read because it is missing"
  - OpenAPI spec now matches actual backend response format
  - SDK auto-generated with correct schema including `success: boolean`

## [1.1.1] - 2025-12-03

### Added

- **Job Cancellation Endpoint** - `DELETE /api/v2/jobs/{jobId}/cancel`
  - Properly documented with Bearer token authentication requirement
  - SDK now includes typed cancel endpoint with auth headers
  - Fixes 401 errors when iOS app attempts to cancel completed jobs

### Fixed

- OpenAPI spec now documents cancel endpoint authentication requirements
- Added `securitySchemes.BearerAuth` for job operation authentication

## [1.1.0] - 2025-12-03

### Added

- **Streaming Utilities** - Helper functions for SSE and WebSocket progress tracking
  - `createSSEStream()` - Easy SSE connection with typed callbacks
  - `createWebSocketStream()` - WebSocket wrapper with auth and cancel support
  - `useSSEStream_Example()` - React hook example for SSE
  - `useWebSocketStream_Example()` - React hook example for WebSocket

- **Comprehensive Streaming Documentation**
  - `STREAMING_GUIDE.md` - Complete guide to SSE vs WebSocket architecture
  - Explains when to use each protocol (SSE for imports, WebSocket for batch ops)
  - Framework examples for React, Vue, and Svelte
  - Troubleshooting guide for common issues

### Changed

- Updated README with streaming architecture overview
- Clarified hybrid SSE/WebSocket approach in documentation
- Version bump from 1.0.1 → 1.1.0

### Documentation

- Added detailed SSE event types and payload structures
- Added WebSocket message types and authentication methods
- Included React hooks examples for both streaming protocols
- Documented automatic reconnection behavior for SSE
- Explained bidirectional communication patterns for WebSocket

## [1.0.1] - 2025-11-28

### Initial Release

- Auto-generated TypeScript SDK from OpenAPI specification
- Full type safety with `openapi-fetch`
- Support for all V1, V2, and V3 endpoints
- Basic error handling and circuit breaker error codes
- ResponseEnvelope format support

## Migration Guide

### From 1.0.1 to 1.1.0

No breaking changes! The 1.1.0 release is backward compatible.

**New Features You Can Use:**

```typescript
// Before (manual SSE setup)
const eventSource = new EventSource(sseUrl)
eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data)
  console.log(data.progress)
}

// After (helper function)
import { createSSEStream } from '@bookstrack/api-client'

const stream = createSSEStream({
  sseUrl,
  onProgress: (event) => console.log(event.progress),
  onComplete: (event) => console.log('Done!', event.books)
})
```

**React Developers:**

Copy the `useSSEStream_Example` or `useWebSocketStream_Example` from `src/streaming.ts` into your React project for typed hooks.

---

**Full Changelog:** https://github.com/yourusername/bendv3/compare/v1.0.1...v1.1.0
