# BooksTrack API Versioning Strategy

**Version:** 1.0
**Last Updated:** January 3, 2026
**Status:** Active
**Owner:** Backend Platform Team

---

## Table of Contents

1. [Overview](#overview)
2. [Versioning Philosophy](#versioning-philosophy)
3. [Version Lifecycle](#version-lifecycle)
4. [Breaking vs Non-Breaking Changes](#breaking-vs-non-breaking-changes)
5. [Deprecation Policy](#deprecation-policy)
6. [Version History](#version-history)
7. [Introducing a New Version](#introducing-a-new-version)
8. [Client Migration Guide](#client-migration-guide)
9. [OpenAPI Spec Versioning](#openapi-spec-versioning)
10. [Changelog Maintenance](#changelog-maintenance)
11. [Examples](#examples)

---

## Overview

BooksTrack uses **URL-based API versioning** to provide clear, predictable API evolution while maintaining backward compatibility for existing clients. This document outlines our versioning strategy, deprecation policies, and migration procedures.

**Current Production Version:** V3 (Native Hono OpenAPI)
**Previous Versions:** V1 (sunset Dec 2025), V2 (sunset March 2026)

---

## Versioning Philosophy

### Core Principles

1. **Explicit Versioning**: Version is part of the URL path (`/v3/books/search`)
2. **Backward Compatibility**: Existing versions remain stable during their lifecycle
3. **Predictable Deprecation**: Clear timelines and migration paths
4. **Contract-First**: OpenAPI specs define the source of truth
5. **Progressive Enhancement**: New versions add capabilities, don't just fix old ones

### Why URL-Based Versioning?

| Approach | Pros | Cons | BooksTrack Decision |
|----------|------|------|---------------------|
| **URL Path** (`/v3/books`) | Clear, cacheable, simple routing | Multiple endpoints | ✅ **CHOSEN** |
| Header-based | Clean URLs | Hidden complexity, caching issues | ❌ |
| Query param | Flexible | Non-standard, routing complexity | ❌ |
| Content negotiation | REST-compliant | Complex, tooling issues | ❌ |

**Rationale**: URL-based versioning is:
- **Discoverable**: Version is visible in browser, logs, and documentation
- **Cacheable**: CDN/Edge cache can route based on URL
- **Simple**: Clients specify version explicitly, no hidden headers
- **Tooling-friendly**: Works with all HTTP clients and API explorers

---

## Version Lifecycle

Each API version goes through five phases:

```
┌─────────────┐
│   PREVIEW   │  Alpha/Beta testing, breaking changes allowed
└─────────────┘
      ↓
┌─────────────┐
│   STABLE    │  Production-ready, no breaking changes
└─────────────┘
      ↓
┌─────────────┐
│ MAINTENANCE │  Bug fixes only, new features go to next version
└─────────────┘
      ↓
┌─────────────┐
│ DEPRECATED  │  Sunset announced, migration guide published
└─────────────┘
      ↓
┌─────────────┐
│   REMOVED   │  Endpoints return 410 Gone, redirect to docs
└─────────────┘
```

### Phase Duration Guidelines

| Phase | Duration | Example (V3) |
|-------|----------|--------------|
| Preview | 4-8 weeks | Nov 2025 - Dec 2025 |
| Stable | 12-18 months | Dec 2025 - June 2027 |
| Maintenance | 3-6 months | June 2027 - Sept 2027 |
| Deprecated | 3-6 months | Sept 2027 - Dec 2027 |
| Removed | N/A (permanent) | Jan 2028+ |

**Total Lifecycle**: 18-30 months from stable release to removal

---

## Breaking vs Non-Breaking Changes

### Breaking Changes (Require New Version)

Changes that **break existing clients** and require a version bump:

| Category | Examples |
|----------|----------|
| **Removed Fields** | Deleting `book.isbn13` from response |
| **Renamed Fields** | `authorName` → `authors[]` |
| **Type Changes** | `pageCount: string` → `pageCount: number` |
| **New Required Params** | Making `userId` required in request |
| **Removed Endpoints** | Deleting `GET /v2/books/similar` |
| **Changed Behavior** | Search now requires exact ISBN match |
| **Error Format Changes** | Switching from custom to RFC 9457 |

**Examples from V2 → V3:**
```diff
- GET /api/v2/search?query=harry
+ GET /v3/books/search?q=harry

- Response: { results: [...] }
+ Response: { success: true, data: { books: [...] } }

- Error: { error: "Not found" }
+ Error: { type: "...", title: "...", status: 404 }
```

### Non-Breaking Changes (Safe Within Version)

Changes that are **backward compatible** and don't require a version bump:

| Category | Examples |
|----------|----------|
| **New Optional Fields** | Adding `book.awards[]` to response |
| **New Endpoints** | Adding `GET /v3/books/:isbn/reviews` |
| **New Query Params** | Adding optional `?includeEmbedding=true` |
| **Bug Fixes** | Fixing incorrect date formatting |
| **Performance Improvements** | Optimizing cache strategy |
| **Documentation Updates** | Clarifying field descriptions |

**Examples (safe for V3):**
```diff
  GET /v3/books/search?q=harry

  Response: {
    success: true,
    data: {
      books: [...],
+     recommendations: [...]  // NEW optional field
    }
  }
```

---

## Deprecation Policy

### Timeline

1. **Announcement** (T-0): Deprecation notice published
   - Update API docs with deprecation warnings
   - Add `Sunset` header to deprecated endpoints
   - Publish migration guide

2. **Warning Period** (T+0 to T+3 months):
   - Endpoints work normally
   - Clients receive `Warning` headers with sunset date
   - Email notifications to known API consumers

3. **Deprecation Period** (T+3 to T+6 months):
   - Endpoints return `299 Deprecation` warning
   - Rate limits may be reduced
   - Support focuses on migration assistance

4. **Removal** (T+6 months):
   - Endpoints return `410 Gone`
   - Response includes link to migration guide
   - Requests logged for analytics

### Communication Channels

| Method | Audience | Timing |
|--------|----------|--------|
| **OpenAPI Spec** | All developers | Immediate (`deprecated: true`) |
| **HTTP Headers** | Active clients | Immediate (`Sunset`, `Warning`) |
| **Email** | Registered users | T-0, T+3mo, T+5mo |
| **Docs Site** | All visitors | Immediate (banner + docs) |
| **Changelog** | All developers | Immediate |
| **GitHub Release** | Contributors | T-0, T+6mo |

### HTTP Headers for Deprecation

```http
GET /v2/books/search?q=harry
HTTP/1.1 200 OK
Sunset: Sat, 01 Mar 2026 00:00:00 GMT
Warning: 299 api.oooefam.net "This API version is deprecated. Migrate to /v3/books/search. See https://api.oooefam.net/docs/migration/v2-to-v3"
Link: </docs/migration/v2-to-v3>; rel="deprecation"
```

After removal:
```http
GET /v2/books/search?q=harry
HTTP/1.1 410 Gone
Content-Type: application/problem+json

{
  "type": "https://api.oooefam.net/errors/version-removed",
  "title": "API Version No Longer Available",
  "status": 410,
  "detail": "API v2 was removed on March 1, 2026. Please migrate to v3.",
  "instance": "/v2/books/search",
  "migrationGuide": "https://api.oooefam.net/docs/migration/v2-to-v3"
}
```

---

## Version History

### V3 (Current - December 2025)

**Status**: ✅ Stable (Production)
**Released**: December 2025
**Planned Sunset**: TBD (no earlier than June 2027)

**Key Features**:
- Native Hono + `@hono/zod-openapi` integration
- Auto-generated OpenAPI spec at `/v3/openapi.json`
- RFC 9457 Problem Details for errors
- SSE (Server-Sent Events) for job progress
- Batch enrichment with async mode
- Alexandria-first provider architecture
- HATEOAS links (`_links`) for discoverability

**Breaking Changes from V2**:
- Response envelope: `{ success, data, metadata }` format enforced
- Error format: RFC 9457 instead of custom format
- Field renames: `results` → `books`, `query` → `q`
- Progress monitoring: SSE instead of WebSocket
- Rate limits: Per-endpoint instead of global

**Documentation**:
- OpenAPI Spec: https://api.oooefam.net/v3/openapi.json
- Swagger UI: https://api.oooefam.net/v3/docs
- Migration Guide: [docs/migration/v2-to-v3.md](migration/v2-to-v3.md)

---

### V2 (Sunset - March 2026)

**Status**: ⛔ Removed
**Released**: June 2024
**Deprecated**: September 2025
**Sunset**: March 1, 2026
**Removed**: March 2026

**Key Features**:
- `ResponseEnvelope` format with `success` discriminator
- WebSocket progress for batch jobs
- Multi-provider search (Google Books, OpenLibrary)
- Basic enrichment endpoint

**Why Sunset**:
- Custom error format incompatible with tooling
- WebSocket complexity vs SSE simplicity
- Limited type safety (manual TypeScript definitions)
- No auto-generated docs

**Removal Details**:
- All `/api/v2/*` endpoints return `410 Gone`
- Archived docs: `docs/archive/v2-api/`
- Support ended: February 2026

---

### V1 (Sunset - December 2025)

**Status**: ⛔ Removed
**Released**: January 2024
**Deprecated**: June 2025
**Sunset**: December 1, 2025
**Removed**: December 2025

**Key Features**:
- Basic search endpoints
- ISBN lookup
- CSV import (manual parsing)

**Why Sunset**:
- No standardized response format
- Limited error handling
- No batch operations
- No AI features

**Removal Details**:
- All `/v1/*` and `/search/*` endpoints return `410 Gone`
- Archived docs: `docs/archive/v1-api/`
- Support ended: November 2025

---

## Introducing a New Version

### When to Create a New Version

Create a new major version (V4) when:

1. **Multiple breaking changes** accumulate in backlog
2. **Architecture shift** requires new contracts (e.g., gRPC, GraphQL)
3. **Security requirements** mandate incompatible changes
4. **Client feedback** indicates current design is problematic
5. **Scheduled cadence** (e.g., annual major versions)

**Don't create new version for**:
- Single breaking change (deprecate field instead)
- Performance improvements
- Bug fixes
- New optional features

### V4 Introduction Checklist

#### Phase 1: Planning (4-8 weeks)

- [ ] **Document breaking changes** in RFC or design doc
- [ ] **Stakeholder review** with iOS team, dashboard team
- [ ] **Migration complexity assessment** (client changes required)
- [ ] **Cost-benefit analysis** (maintenance vs new features)
- [ ] **Timeline proposal** with overlap period

#### Phase 2: Implementation (6-12 weeks)

- [ ] **Create new route namespace** (`src/api-v4/`)
- [ ] **Define Zod schemas** in `packages/schemas/src/v4/`
- [ ] **Implement endpoints** with OpenAPI annotations
- [ ] **Write tests** (unit, integration, contract)
- [ ] **Generate OpenAPI spec** at `/v4/openapi.json`
- [ ] **Set up Swagger UI** at `/v4/docs`

#### Phase 3: Preview Release (4-8 weeks)

- [ ] **Deploy to staging** with feature flag `V4_ENABLED=true`
- [ ] **Document preview status** in all specs and docs
- [ ] **Invite early adopters** (iOS team, trusted users)
- [ ] **Gather feedback** via GitHub Discussions
- [ ] **Iterate on breaking changes** (preview allows changes)

#### Phase 4: Stable Release

- [ ] **Production deployment** with monitoring
- [ ] **Announce stable** via changelog, email, docs
- [ ] **Publish migration guide** (V3 → V4)
- [ ] **Update client SDKs** (TypeScript, Swift if applicable)
- [ ] **Mark V3 as maintenance** (feature freeze)

#### Phase 5: V3 Deprecation (3-6 months later)

- [ ] **Announce V3 sunset** with timeline
- [ ] **Add deprecation headers** to V3 endpoints
- [ ] **Send migration reminders** at T+3mo, T+5mo
- [ ] **Monitor V3 usage** via analytics
- [ ] **Remove V3** after 6-month sunset period

### Code Structure for V4

```typescript
// src/api-v4/index.ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { bookRoutes } from './books'
import { searchRoutes } from './search'

const v4App = new OpenAPIHono()

// Register routes
v4App.route('/books', bookRoutes)
v4App.route('/search', searchRoutes)

// OpenAPI spec
v4App.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'BooksTrack API',
    version: '4.0.0',
  },
})

// Swagger UI
v4App.get('/docs', swaggerUI({ url: '/v4/openapi.json' }))

export default v4App
```

```typescript
// src/router.ts (main router)
import v3App from './api-v3'
import v4App from './api-v4'

router.route('/v3', v3App)
router.route('/v4', v4App)

// V3 deprecation headers (when time comes)
router.use('/v3/*', async (c, next) => {
  await next()
  c.header('Sunset', 'Sat, 01 Jun 2027 00:00:00 GMT')
  c.header('Warning', '299 - "API v3 is deprecated. Migrate to /v4"')
})
```

---

## Client Migration Guide

### For TypeScript/JavaScript Clients

**Step 1: Install Updated Types**
```bash
# Option A: Use shared schema package
npm install @bookstrack/schemas@latest

# Option B: Generate from OpenAPI spec
npx openapi-typescript https://api.oooefam.net/v3/openapi.json -o src/types/api.ts
```

**Step 2: Update Base URL**
```diff
- const BASE_URL = 'https://api.oooefam.net/api/v2'
+ const BASE_URL = 'https://api.oooefam.net/v3'
```

**Step 3: Update Endpoint Paths**
```diff
- GET /api/v2/search?query=harry
+ GET /v3/books/search?q=harry

- POST /api/v2/books/enrich
+ POST /v3/books/enrich
```

**Step 4: Update Response Handling**
```diff
  const response = await fetch('/v3/books/search?q=harry')
  const json = await response.json()

- const books = json.results
+ const books = json.data.books

- if (json.error) { ... }
+ if (!json.success) { ... }
```

**Step 5: Update Error Handling**
```diff
- if (json.error) {
-   console.error(json.error.message)
- }
+ if (!json.success) {
+   console.error(`${json.title}: ${json.detail}`)
+ }
```

**Step 6: Update Progress Monitoring**
```diff
- // V2: WebSocket
- const ws = new WebSocket('wss://api.oooefam.net/ws/progress?jobId=...')
- ws.onmessage = (e) => { ... }

+ // V3: SSE (Server-Sent Events)
+ const eventSource = new EventSource('/v3/jobs/imports/123/stream?token=...')
+ eventSource.addEventListener('progress', (e) => { ... })
```

### For iOS/Swift Clients

**Step 1: Update URLSession Requests**
```swift
// Before (V2)
let url = URL(string: "https://api.oooefam.net/api/v2/search?query=harry")!

// After (V3)
let url = URL(string: "https://api.oooefam.net/v3/books/search?q=harry")!
```

**Step 2: Update Codable Models**
```swift
// Before (V2)
struct SearchResponse: Codable {
    let results: [Book]
}

// After (V3)
struct SearchResponse: Codable {
    let success: Bool
    let data: SearchData

    struct SearchData: Codable {
        let books: [Book]
        let total: Int
        let pagination: Pagination
    }
}
```

**Step 3: Update Error Handling**
```swift
// V3 Error (RFC 9457)
struct APIError: Codable {
    let type: String
    let title: String
    let status: Int
    let detail: String
    let code: String?
}

// Usage
if let error = try? JSONDecoder().decode(APIError.self, from: data) {
    print("\(error.title): \(error.detail)")
}
```

### Testing Your Migration

**Parallel Testing Strategy**:
```typescript
// Run both versions side-by-side during migration
const v2Response = await fetch('/api/v2/search?query=harry')
const v3Response = await fetch('/v3/books/search?q=harry')

// Compare results
const v2Books = (await v2Response.json()).results
const v3Books = (await v3Response.json()).data.books

console.assert(v2Books.length === v3Books.length, 'Book count mismatch')
```

**Gradual Rollout**:
```typescript
// Feature flag for controlled migration
const USE_V3_API = localStorage.getItem('useV3API') === 'true'

const endpoint = USE_V3_API
  ? '/v3/books/search?q='
  : '/api/v2/search?query='
```

---

## OpenAPI Spec Versioning

### Auto-Generated Specs

BooksTrack uses **code-first OpenAPI** via `@hono/zod-openapi`:

```typescript
// Schemas define the spec
export const BookSchema = z.object({
  isbn: z.string().regex(/^97[89]\d{10}$/),
  title: z.string(),
  authors: z.array(z.string()),
})

// Route definitions generate OpenAPI
bookRoutes.openapi({
  method: 'get',
  path: '/books/{isbn}',
  request: {
    params: z.object({ isbn: z.string() }),
  },
  responses: {
    200: {
      description: 'Book found',
      content: {
        'application/json': {
          schema: BookSchema,
        },
      },
    },
  },
})
```

**Spec is always in sync with code** - no manual YAML editing required.

### Spec Versioning Strategy

| Version | Spec URL | Source of Truth |
|---------|----------|-----------------|
| V3 | `/v3/openapi.json` | `src/api-v3/*.ts` + `packages/schemas/src/v3/` |
| V4 (future) | `/v4/openapi.json` | `src/api-v4/*.ts` + `packages/schemas/src/v4/` |

**Archived Specs**:
- V2: `docs/archive/v2-openapi.json` (snapshot at sunset)
- V1: Not available (predates OpenAPI)

### Semantic Versioning for Specs

OpenAPI `info.version` follows [semver](https://semver.org/):

```json
{
  "info": {
    "title": "BooksTrack API",
    "version": "3.1.2"
  }
}
```

**Version Bumping Rules**:
- **Major** (3.x.x → 4.0.0): Breaking changes (requires new API version)
- **Minor** (3.1.x → 3.2.0): New endpoints or optional fields
- **Patch** (3.1.1 → 3.1.2): Bug fixes, documentation updates

**Example**:
- V3.0.0: Initial V3 release (Dec 2025)
- V3.1.0: Added `/v3/recommendations` endpoint (Dec 2025)
- V3.1.1: Fixed typo in `/v3/books/search` description
- V3.2.0: Added `?includeReviews=true` optional param

### Spec Change Detection

**Contract Testing** ensures spec stability:

```bash
# Capture baseline on stable release
npm run test:contract:baseline

# Detect breaking changes in PRs
npm run test:contract:check
```

**CI/CD Integration**:
```yaml
# .github/workflows/ci.yml
- name: Contract Tests
  run: npm run test:contract:check

- name: Fail on Breaking Changes
  if: failure()
  run: |
    echo "Breaking changes detected! Increment major version or revert."
    exit 1
```

See [docs/V3_CONTRACT_TESTING.md](V3_CONTRACT_TESTING.md) for details.

---

## Changelog Maintenance

### Changelog Format

Follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to the BooksTrack API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `/v3/books/:isbn/reviews` endpoint for book reviews

### Changed
- Improved search relevance scoring

### Deprecated
- None

### Removed
- None

### Fixed
- Fixed date formatting in `/v3/books/:isbn` response

## [3.1.0] - 2025-12-15

### Added
- `/v3/recommendations` endpoint for weekly book recommendations
- `quality` score in book responses (0-100)

### Changed
- Upgraded to Alexandria RPC for primary provider
- Improved cache hit ratio (65% → 73%)

## [3.0.0] - 2025-12-01

### Added
- Native Hono + Zod OpenAPI integration
- Auto-generated OpenAPI spec at `/v3/openapi.json`
- RFC 9457 Problem Details error format
- SSE for job progress (replaces WebSocket)

### Changed
- Response envelope: `{ success, data, metadata }`
- Field renames: `results` → `books`, `query` → `q`

### Deprecated
- V2 API (sunset March 2026)

### Removed
- V1 API (sunset December 2025)

## [2.0.0] - 2024-06-15
...
```

### Automation

**Auto-generate changelog from commits**:
```bash
# Use conventional commits
git commit -m "feat(v3): add book reviews endpoint"
git commit -m "fix(v3): correct date formatting in book response"

# Generate changelog
npx conventional-changelog-cli -p angular -i CHANGELOG.md -s
```

**Commit Message Convention**:
```
<type>(<scope>): <subject>

Types:
- feat: New feature (minor version bump)
- fix: Bug fix (patch version bump)
- docs: Documentation only
- refactor: Code refactoring
- test: Adding tests
- chore: Maintenance

Scopes:
- v3: V3 API changes
- v4: V4 API changes
- docs: Documentation
- ci: CI/CD

Examples:
feat(v3): add semantic search mode
fix(v3): handle null ISBN in enrichment
docs(v3): update migration guide for iOS
```

---

## Examples

### Example: V2 → V3 Transition Timeline

```
2025-09-01: V3 Preview Released
├─ V3 available at /v3/* (preview status)
├─ OpenAPI spec published
├─ Migration guide published
└─ Email to early adopters

2025-12-01: V3 Stable, V2 Deprecated
├─ V3 marked stable in docs
├─ V2 deprecation announced (6-month sunset)
├─ V2 endpoints return Sunset header
└─ Email to all V2 users

2025-12-15: V2 Warning Period Starts
├─ V2 endpoints return 299 Deprecation warning
├─ Rate limits reduced to 50% of V3
└─ Support tickets reference V3 migration

2026-02-01: 3-Month Reminder
├─ Email to remaining V2 users
└─ Dashboard shows V2 usage metrics

2026-03-01: V2 Removed
├─ All /api/v2/* endpoints return 410 Gone
├─ Archived docs published
├─ V2 code moved to archive/
└─ Final email to V2 users
```

### Example: Breaking Change Handling

**Scenario**: Need to change `pageCount` from `string` to `number`

**Option 1: New Version (Recommended for Multiple Changes)**
```typescript
// V3 (old)
{ pageCount: "309" }

// V4 (new)
{ pageCount: 309 }
```

**Option 2: Deprecate-Then-Remove (Single Field)**
```typescript
// V3.1 (deprecation period)
{
  pageCount: "309",          // Deprecated
  pageCountNumber: 309,      // New field
  _deprecated: {
    pageCount: "Use pageCountNumber instead. Will be removed in V4."
  }
}

// V4 (removal)
{
  pageCount: 309  // Type changed, old field removed
}
```

### Example: Non-Breaking Addition

**Scenario**: Add optional `reviews` field to book response

```typescript
// V3.1 (before)
{
  isbn: "9780439708180",
  title: "Harry Potter",
  authors: ["J.K. Rowling"]
}

// V3.2 (after - backward compatible)
{
  isbn: "9780439708180",
  title: "Harry Potter",
  authors: ["J.K. Rowling"],
  reviews: [...]  // NEW optional field
}
```

**Why non-breaking?**
- Existing clients ignore unknown fields
- No fields removed or changed
- No new required parameters

---

## Quick Reference

### Version Decision Tree

```
Need to make a change?
├─ Does it break existing clients?
│  ├─ YES → Breaking change
│  │  ├─ Multiple breaking changes pending?
│  │  │  ├─ YES → Create new version (V4)
│  │  │  └─ NO → Deprecate field, add new one
│  │  └─ Architecture change required?
│  │     ├─ YES → Create new version (V4)
│  │     └─ NO → Deprecate field, add new one
│  └─ NO → Non-breaking change
│     └─ Safe to add to current version (V3.x)
```

### Key URLs

| Resource | URL |
|----------|-----|
| **V3 OpenAPI Spec** | https://api.oooefam.net/v3/openapi.json |
| **V3 Swagger UI** | https://api.oooefam.net/v3/docs |
| **V3 Migration Guide** | https://api.oooefam.net/docs/migration/v2-to-v3 |
| **Changelog** | https://api.oooefam.net/CHANGELOG.md |
| **Deprecation Policy** | This document |

### Support Contacts

| Topic | Contact |
|-------|---------|
| **Migration Questions** | GitHub Discussions |
| **Bug Reports** | GitHub Issues |
| **Feature Requests** | GitHub Issues (label: enhancement) |
| **Security Issues** | security@oooefam.net |

---

## Related Documentation

- **[Frontend Integration Guide](V3_FRONTEND_HANDOFF.md)**: Complete V3 API integration guide
- **[Contract Testing](V3_CONTRACT_TESTING.md)**: OpenAPI spec validation
- **[Cache Architecture](CACHE_ARCHITECTURE.md)**: Caching strategy and TTLs
- **[System Architecture](SYSTEM_ARCHITECTURE.md)**: Cross-repo system overview
- **[PRD](PRD.md)**: Product requirements and goals

---

**Version**: 1.0
**Last Updated**: January 3, 2026
**Maintained By**: Backend Platform Team (@jukasdrj)
**Review Cycle**: Quarterly (or before major version releases)
