# V3 API Migration - Chanfana Implementation

**Date:** December 1, 2025
**Status:** Phase 1 Complete - Foundation Implemented
**Next Steps:** Test, review, and migrate additional endpoints

---

## Overview

The V3 API represents a strategic rebase of the BooksTrack API layer on Cloudflare's `chanfana` library, providing:

- **Class-based endpoints** with automatic request/response validation
- **Auto-generated OpenAPI documentation** from Zod schemas
- **Type-safe development** with end-to-end TypeScript inference
- **Integration with existing infrastructure** (Alexandria, DOs, Workflows)
- **Separate documentation** at `/v3/docs` (Swagger UI)

**Key Principle:** This is a "Strangler Fig" migration - the v3 API layer sits alongside v1/v2 routes without breaking them, while using the same proven service layer and infrastructure.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    V3: Chanfana Layer                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ /v3/books/* │  │ /v3/library/*│ │ /v3/imports/*   │  │
│  │ BendRoute   │  │ Authenticated│  │ OpenAPIRoute    │  │
│  │ + Zod       │  │ Route        │  │ + Validation    │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                   │           │
│         └────────────────┼───────────────────┘           │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │       REUSED: Service Layer (NO CHANGES)            ││
│  │  book-service.ts, alexandria-api.ts, etc.           ││
│  └──────────────────────┬──────────────────────────────┘│
└─────────────────────────┼───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│         KEEP: Existing Infrastructure                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Alexandria   │ │ D1/KV/R2    │ │ Durable Objects  │ │
│  │ API Client   │ │ Storage     │ │ (WebSocket, Jobs)│ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── api/                           # NEW: V3 API implementation
│   ├── index.ts                  # V3 route mounter (called from router.ts)
│   ├── base.ts                   # Base route classes (BendRoute, AuthenticatedRoute)
│   ├── schemas/                  # Zod schemas for V3
│   │   └── book.ts              # Book metadata schemas
│   └── endpoints/                # Class-based endpoint implementations
│       ├── books/
│       │   └── get-by-isbn.ts   # GET /v3/books/:isbn (pilot endpoint)
│       └── library/
│           └── add-book.ts      # POST /v3/library (auth example)
├── services/                      # UNCHANGED: Existing service layer
│   ├── book-service.ts
│   ├── alexandria-api.ts
│   └── ...
├── router.ts                      # MODIFIED: Calls mountV3API()
└── index.js                       # UNCHANGED: Main entry point
```

---

## Base Classes

### `BendRoute` (src/api/base.ts)

The foundation for all V3 endpoints. Provides:

- **Service layer access** via `getServices(c)` helper
- **Standardized error handling** via `handleError(c, error, statusCode)`
- **Analytics logging** via `logAnalytics(c, eventType, data)`
- **Response formatting** using existing `response-builder.ts`

**Example usage:**
```typescript
export class GetBookByISBN extends BendRoute {
  schema = { /* Zod validation */ }

  async handle(c: AppContext) {
    const services = this.getServices(c)
    const bookService = await services.getBookService()
    const book = await bookService.getBookByISBN(services.env, isbn)
    // ...
  }
}
```

### `AuthenticatedRoute` (src/api/base.ts)

Extends `BendRoute` with automatic Bearer token validation. Provides:

- **Automatic auth check** in `handle()` method
- **User ID extraction** via `getUserId(c)` helper
- **Protected endpoints** that reject requests without valid tokens

**Example usage:**
```typescript
export class AddBookToLibrary extends AuthenticatedRoute {
  schema = { /* Zod validation */ }

  protected async handleAuthenticated(c: AppContext) {
    const userId = this.getUserId(c) // Already validated!
    // ... insert into D1 user_library table
  }
}
```

---

## Implemented Endpoints

### ✅ GET /v3/books/:isbn (Pilot Endpoint)

**File:** `src/api/endpoints/books/get-by-isbn.ts`

**Features:**
- Zod schema validation for ISBN format
- Integration with existing `book-service.ts` (NO REWRITE)
- Circuit breaker error handling
- Analytics logging
- OpenAPI documentation

**Test:**
```bash
curl http://localhost:8787/v3/books/9780439708180
```

### ✅ POST /v3/library (Protected Endpoint Example)

**File:** `src/api/endpoints/library/add-book.ts`

**Features:**
- Bearer token authentication (automatic via `AuthenticatedRoute`)
- D1 database integration
- Duplicate detection
- Input validation (isbn, status, rating, notes)

**Test:**
```bash
curl -X POST http://localhost:8787/v3/library \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"isbn": "9780439708180", "status": "reading"}'
```

---

## OpenAPI Documentation

### Accessing Documentation

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Visit Swagger UI:**
   ```
   http://localhost:8787/v3/docs
   ```

3. **Download OpenAPI JSON:**
   ```bash
   curl http://localhost:8787/v3/openapi.json > docs/openapi-v3.json
   ```

### Generating Static OpenAPI Spec

```bash
npm run generate:openapi
```

This script:
1. Starts dev server on port 8788
2. Fetches `/v3/openapi.json`
3. Saves to `docs/openapi-v3.json`
4. Kills dev server

**Use case:** Share with iOS team for Swift type generation

---

## Schema Pattern

V3 uses Zod schemas for all validation and OpenAPI generation:

```typescript
// Define schema once
const BookSchema = z.object({
  isbn: z.string().length(13).describe('13-digit ISBN').openapi({ example: '9780439708180' }),
  title: z.string().min(1).describe('Book title').openapi({ example: 'Harry Potter' }),
  // ...
}).openapi('Book') // Give it a name for OpenAPI refs

// Use in endpoint
schema = {
  request: {
    params: z.object({
      isbn: z.string().regex(/^\d{10}(\d{3})?$/).openapi({
        param: { name: 'isbn', in: 'path' },
        example: '9780439708180'
      })
    })
  },
  responses: {
    '200': {
      description: 'Book found',
      schema: z.object({
        success: z.literal(true),
        data: BookSchema, // Reuse schema
        metadata: z.object({ /* ... */ })
      })
    }
  }
}
```

**Key points:**
- Use `.openapi({ example: '...' })` for examples
- Use `.openapi({ param: { name, in } })` for path/query params
- Use `.openapi('Name')` on root object for OpenAPI refs
- Use `.describe('...')` for field descriptions

---

## Migration Checklist

### Phase 1: Foundation ✅ COMPLETE

- [x] Install chanfana dependency
- [x] Create `src/api/base.ts` (BendRoute, AuthenticatedRoute)
- [x] Create `src/api/index.ts` (v3 route mounter)
- [x] Mount v3 API in `src/router.ts`
- [x] Create `src/api/schemas/book.ts` (Zod schemas)
- [x] Implement pilot endpoint: GET /v3/books/:isbn
- [x] Implement auth example: POST /v3/library
- [x] Add OpenAPI generation scripts to package.json
- [x] Verify Swagger UI loads at /v3/docs

### Phase 2: Core Endpoints (NEXT)

- [ ] GET /v3/books/search - Title search
- [ ] POST /v3/books/enrich - Single book enrichment
- [ ] GET /v3/library - List user library (D1)
- [ ] DELETE /v3/library/:isbn - Remove from library
- [ ] POST /v3/imports - CSV import workflow
- [ ] GET /v3/imports/:id/status - Import status
- [ ] GET /v3/imports/:id/stream - SSE progress

### Phase 3: iOS Contract (PENDING)

- [ ] Generate `openapi-v3.json` spec
- [ ] Share with iOS team for review
- [ ] Address any contract feedback
- [ ] Finalize deprecation timeline for v1/v2

### Phase 4: Deprecation (FUTURE)

- [ ] Add Sunset headers to v1/v2 endpoints
- [ ] Monitor v3 adoption via analytics
- [ ] Migrate iOS app to v3 endpoints
- [ ] Remove v1/v2 routes (March 2026 target)

---

## Testing

### Manual Testing

```bash
# Start dev server
npm run dev

# Test pilot endpoint
curl http://localhost:8787/v3/books/9780439708180 | jq '.'

# Test protected endpoint (should fail without token)
curl -X POST http://localhost:8787/v3/library \
  -H "Content-Type: application/json" \
  -d '{"isbn": "9780439708180"}'

# Test with token
curl -X POST http://localhost:8787/v3/library \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"isbn": "9780439708180", "status": "reading"}'

# View docs
open http://localhost:8787/v3/docs
```

### Automated Tests (TODO)

```typescript
// tests/v3/books.test.ts
describe('V3 Books API', () => {
  it('should return book by ISBN', async () => {
    const res = await fetch('http://localhost:8787/v3/books/9780439708180')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.isbn).toBe('9780439708180')
  })
})
```

---

## Known Issues & TODOs

### OpenAPI Generation

- ⚠️ **Issue:** Need to add `.openapi({ param: { name, in } })` to all path/query params
- **Fix:** Update schema definitions with proper param metadata
- **Status:** Ongoing as new endpoints are added

### Token Validation

- ⚠️ **Issue:** `AuthenticatedRoute.extractUserIdFromToken()` is a placeholder
- **Fix:** Implement actual JWT parsing or session lookup
- **Status:** TODO - depends on auth system design

### D1 Schema

- ⚠️ **Issue:** `user_library` table schema not documented
- **Fix:** Add D1 schema to `docs/database/schema.sql`
- **Status:** TODO

---

## Benefits Over V1/V2

| Feature | V1/V2 | V3 (Chanfana) |
|---------|-------|---------------|
| **Validation** | Manual, inconsistent | Automatic via Zod |
| **OpenAPI Docs** | Manual, stale | Auto-generated, always current |
| **Type Safety** | Partial (TS only) | End-to-end (Zod → TS → Runtime) |
| **Auth Patterns** | Inconsistent | Standardized via `AuthenticatedRoute` |
| **Error Handling** | Manual, repetitive | Centralized in base classes |
| **iOS Contract** | Outdated OpenAPI file | Always-current `/v3/openapi.json` |
| **Code Organization** | 1857-line router.ts | Class-based, one file per endpoint |
| **Service Reuse** | ✅ Direct calls | ✅ Same (via `getServices()`) |
| **Infrastructure** | ✅ DOs, Workflows, KV | ✅ Same (no changes needed) |

---

## Next Steps

1. **Test the pilot endpoint** in local dev
2. **Request code review** from @cf-code-reviewer agent
3. **Migrate GET /v3/books/search** (second endpoint)
4. **Generate OpenAPI spec** and share with iOS team
5. **Add smoke tests** for v3 endpoints
6. **Document D1 schema** for library endpoints

---

**Last Updated:** December 1, 2025
**Maintained By:** @jukasdrj
**Related Docs:** See `CLAUDE.md`, `ARCHITECTURE_OVERVIEW.md`
