# BooksTrack V3 API - Overview

**Base URL:** `https://api.oooefam.net/v3`
**OpenAPI Spec:** `https://api.oooefam.net/v3/openapi.json`
**TypeScript SDK:** `npm install @jukasdrj/bookstrack-api-client@3.4.2`
**Documentation:** https://api.oooefam.net/v3/docs

---

## Current Status (January 2026)

**V3 is the ONLY supported API version.**

- ✅ **V3:** Production, fully supported, all features available
- ⛔ **V2:** Completely removed (March 2026)
- ⛔ **V1:** Completely removed (December 2025)

**All legacy endpoints return 404.** There are no migration guides because V1 and V2 are gone.

---

## Semantic Versioning

BooksTrack V3 follows semantic versioning:

- **Major (3.x.x)**: Breaking changes requiring client updates
  - Example: Removing endpoints, changing response schemas
  - Advance notice: 6 months via CHANGELOG

- **Minor (x.4.x)**: New features, backward compatible
  - Example: New endpoints, optional fields
  - No client changes required

- **Patch (x.x.2)**: Bug fixes, backward compatible
  - Example: Error handling improvements, performance fixes
  - No client changes required

**Current Version:** 3.4.2

---

## V3 API Endpoints

### Book Operations
- `GET /v3/books/{isbn}` - Get book by ISBN
- `GET /v3/books/search` - Search books (text, semantic, similar)
- `POST /v3/books/enrich` - Enrich book metadata (sync mode)

### Job Management
- `POST /v3/jobs/imports` - Start CSV import job
- `GET /v3/jobs/imports/{jobId}` - Get import job status
- `GET /v3/jobs/imports/{jobId}/stream` - SSE progress stream
- `POST /v3/jobs/scans` - Start bookshelf photo scan
- `GET /v3/jobs/scans/{jobId}` - Get scan job status
- `GET /v3/jobs/scans/{jobId}/stream` - SSE progress stream
- `POST /v3/jobs/enrichment` - Start batch enrichment
- `GET /v3/jobs/enrichment/{jobId}` - Get enrichment status
- `GET /v3/jobs/enrichment/{jobId}/stream` - SSE progress stream
- `GET /v3/jobs/enrichment/{jobId}/results` - Get enriched books (paginated)
- `DELETE /v3/jobs/enrichment/{jobId}` - Cancel enrichment job

### Discovery
- `GET /v3/capabilities` - API feature discovery
- `GET /v3/recommendations/weekly` - Weekly book recommendations

### Documentation
- `GET /v3/openapi.json` - OpenAPI 3.1 specification
- `GET /v3/docs` - Interactive Swagger UI

### Webhooks
- `POST /v3/webhooks/alexandria/enrichment-complete` - Alexandria processing callback

---

## TypeScript SDK

**Installation:**
```bash
npm install @jukasdrj/bookstrack-api-client@3.4.2
```

**Usage:**
```typescript
import { createBooksTrackClient } from '@jukasdrj/bookstrack-api-client'

const client = createBooksTrackClient({
  baseUrl: 'https://api.oooefam.net'
})

// Get book by ISBN
const { data, error } = await client.GET('/v3/books/{isbn}', {
  params: { path: { isbn: '9780439708180' } }
})

if (error) {
  console.error('Error:', error.detail)
} else {
  console.log('Title:', data.title)
}
```

**Features:**
- ✅ Full TypeScript type safety
- ✅ Auto-generated from OpenAPI spec
- ✅ SSE streaming support for long-running jobs
- ✅ Tree-shakeable ESM/CJS builds
- ✅ IntelliSense support in VS Code

---

## Response Format

All V3 endpoints use RFC 9457 Problem Details for errors:

**Success Response:**
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "metadata": {
    "timestamp": "2026-01-09T12:00:00Z",
    "source": "alexandria",
    "cached": true
  }
}
```

**Error Response (RFC 9457):**
```json
{
  "type": "https://api.oooefam.net/errors/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Book with ISBN '1234567890' not found",
  "instance": "/v3/books/1234567890"
}
```

---

## Breaking Changes Policy

When V3 needs breaking changes, we will:

1. **Announce 6 months in advance** via CHANGELOG and GitHub
2. **Release V4 with breaking changes**
3. **Maintain V3 for 6 months** alongside V4
4. **Remove V3 after 6 months** (returns 404)

**No V1/V2 migration guides exist** because those versions are completely removed.

---

## Support

- **Documentation:** https://api.oooefam.net/v3/docs
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **SDK:** https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client
- **Issues:** https://github.com/jukasdrj/bendv3/issues

---

**Last Updated:** January 9, 2026
**Last Reviewed:** January 11, 2026
**Maintained By:** @jukasdrj
**Version:** 3.4.2
