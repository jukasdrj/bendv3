# BooksTrack V3: Zod Schema Architecture & Contract-First API

**Version:** 1.0
**Date:** December 3, 2025
**Status:** Ready for Implementation
**Goal:** 3 endpoints. Shared Zod schemas. Published contract. Zero spaghetti.

---

## Executive Summary

**Current State:**
- ❌ 12+ V2 endpoints with manual OpenAPI yaml
- ❌ 3 V3 endpoints with inline Zod schemas (DRY violations)
- ❌ Two separate specs (V2 yaml, V3 auto-generated)
- ❌ No shared schema library for frontend teams
- ❌ Endpoint proliferation and code duplication

**Target State:**
- ✅ 3 core V3 endpoints (search, enrich, get)
- ✅ Shared Zod schemas in `@bookstrack/schemas` npm package
- ✅ Published contract for TypeScript/JavaScript frontends
- ✅ Auto-generated OpenAPI 3.1 spec from Zod
- ✅ Type-safe contract shared across backend + frontend

---

## Architecture Overview

### Package Structure

```
packages/
├── schemas/                    # NEW - Published to npm as @bookstrack/schemas
│   ├── src/
│   │   ├── index.ts           # Public exports
│   │   ├── response.ts        # Response envelopes (SuccessResponse, ErrorResponse)
│   │   ├── book.ts            # Book domain schemas
│   │   ├── search.ts          # Search request/response schemas
│   │   ├── enrich.ts          # Enrichment request/response schemas
│   │   └── errors.ts          # Error code enums and types
│   ├── package.json           # @bookstrack/schemas
│   ├── tsconfig.json
│   └── README.md
├── api-client/                # KEEP - Generated SDK (optional, Zod can replace this)
└── (backend code)
```

### The 3 Core Endpoints

**1. Search** - `GET /v3/books/search`
- Unified search endpoint
- Modes: text (title), semantic (vector), similar (by ISBN)
- Query params: `q`, `mode`, `limit`, `page`
- Replaces: `/v1/search/title`, `/v1/search/semantic`, `/v1/search/similar`, `/api/v2/search`

**2. Enrich** - `POST /v3/books/enrich`
- Single or batch ISBN enrichment
- Optional embedding generation
- Body: `{ isbns: string[], includeEmbedding?: boolean }`
- Replaces: `/api/v2/books/enrich`, `/api/v2/books/enrich/detailed`, `/v1/enrichment/batch`

**3. Get** - `GET /v3/books/:isbn`
- Direct ISBN lookup
- Fastest path for known ISBNs
- Params: `isbn`
- Replaces: `/v1/search/isbn`

---

## Phase 1: Create `@bookstrack/schemas` Package

### File: `packages/schemas/package.json`

```json
{
  "name": "@bookstrack/schemas",
  "version": "1.0.0",
  "description": "Shared Zod schemas for BooksTrack API - Backend + Frontend contract",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["bookstrack", "zod", "api", "schema", "validation"],
  "author": "BooksTrack Team",
  "license": "MIT",
  "peerDependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.2",
    "zod": "^3.22.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### File: `packages/schemas/src/response.ts`

```typescript
import { z } from 'zod'

/**
 * Shared response metadata included in all API responses
 */
export const ResponseMetadataSchema = z.object({
  timestamp: z.string().datetime().describe('ISO 8601 timestamp of response'),
  source: z.enum([
    'alexandria',
    'google_books',
    'open_library',
    'isbndb',
    'kv-cache',
    'vectorize',
    'text-search',
    'job-state-manager-do'
  ]).optional().describe('Data source provider'),
  cached: z.boolean().optional().describe('Whether response was served from cache'),
  processingTime: z.number().int().min(0).optional().describe('Processing time in milliseconds')
})

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>

/**
 * Generic success response factory function
 *
 * Usage:
 * ```typescript
 * const BookResponseSchema = SuccessResponseSchema(BookSchema)
 * ```
 */
export function SuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true).describe('Success discriminator (always true for successful responses)'),
    data: dataSchema,
    metadata: ResponseMetadataSchema
  })
}

/**
 * Standard error response used by all endpoints
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false).describe('Success discriminator (always false for error responses)'),
  error: z.object({
    code: z.enum([
      // Request validation errors (4xx)
      'MISSING_PARAMETER',
      'INVALID_REQUEST',
      'INVALID_ISBN',
      'INVALID_QUERY',
      'INVALID_FILE',
      'FILE_TOO_LARGE',
      'BATCH_TOO_LARGE',
      'EMPTY_BATCH',
      // Resource errors (4xx)
      'NOT_FOUND',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'CLIENT_DISCONNECTED',
      // External service errors (5xx or 4xx)
      'RATE_LIMIT_EXCEEDED',
      'CIRCUIT_OPEN',
      'PROVIDER_ERROR',
      'PROVIDER_TIMEOUT',
      'CACHE_ERROR',
      // Internal errors (5xx)
      'INTERNAL_ERROR',
      'API_ERROR',
      'NETWORK_ERROR',
      'TIMEOUT',
      'FEATURE_NOT_AVAILABLE'
    ]).describe('Machine-readable error code'),
    message: z.string().describe('Human-readable error message'),
    details: z.record(z.any()).optional().describe('Additional error context'),
    retryable: z.boolean().optional().describe('Whether the request can be retried'),
    retryAfterMs: z.number().int().min(0).optional().describe('Milliseconds to wait before retry')
  }),
  metadata: ResponseMetadataSchema
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * TypeScript utility type for success responses with inferred data type
 */
export type SuccessResponse<T> = {
  success: true
  data: T
  metadata: ResponseMetadata
}
```

### File: `packages/schemas/src/book.ts`

```typescript
import { z } from 'zod'

/**
 * Core book schema used across all endpoints
 */
export const BookSchema = z.object({
  isbn: z.string().length(13).describe('13-digit ISBN (example: 9780439708180)'),
  isbn10: z.string().length(10).optional().describe('10-digit ISBN if available (example: 0439708184)'),
  title: z.string().min(1).describe('Book title'),
  subtitle: z.string().optional().describe('Book subtitle'),
  authors: z.array(z.string()).describe('List of author names'),
  publisher: z.string().optional().describe('Publisher name'),
  publishedDate: z.string().optional().describe('Publication date (ISO 8601 or partial format)'),
  description: z.string().optional().describe('Book description/synopsis'),
  pageCount: z.number().int().positive().optional().describe('Number of pages'),
  categories: z.array(z.string()).optional().describe('Book categories/genres'),
  language: z.string().optional().describe('ISO 639-1 language code (e.g., "en")'),
  coverUrl: z.string().url().optional().describe('Cover image URL'),
  thumbnailUrl: z.string().url().optional().describe('Thumbnail image URL'),
  workKey: z.string().optional().describe('OpenLibrary work key (e.g., OL82563W)'),
  editionKey: z.string().optional().describe('OpenLibrary edition key (e.g., OL7353617M)'),
  provider: z.enum(['alexandria', 'google_books', 'open_library', 'isbndb']).describe('Data source provider'),
  quality: z.number().min(0).max(100).describe('Data quality score 0-100')
})

export type Book = z.infer<typeof BookSchema>
```

### File: `packages/schemas/src/search.ts`

```typescript
import { z } from 'zod'
import { BookSchema } from './book'
import { SuccessResponseSchema } from './response'

/**
 * Search mode enumeration
 */
export const SearchMode = z.enum(['text', 'semantic', 'similar']).describe('Search mode')

/**
 * Search request query parameters
 */
export const SearchRequestSchema = z.object({
  q: z.string()
    .min(1)
    .max(200)
    .describe('Search query (e.g., "Harry Potter" or "similar:9780439708180")'),
  mode: SearchMode
    .default('text')
    .optional()
    .describe('Search mode: text (title), semantic (vector), similar (by ISBN)'),
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1)
    .optional()
    .describe('Page number (default: 1)'),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe('Results per page (default: 20, max: 100)')
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>

/**
 * Search response data
 */
export const SearchResultDataSchema = z.object({
  books: z.array(BookSchema).describe('Array of book results'),
  total: z.number().int().min(0).describe('Total number of results'),
  page: z.number().int().min(1).describe('Current page number'),
  limit: z.number().int().min(1).max(100).describe('Results per page'),
  query: z.object({
    q: z.string(),
    mode: SearchMode
  }).describe('Original search query')
})

export type SearchResultData = z.infer<typeof SearchResultDataSchema>

/**
 * Complete search response schema
 */
export const SearchResponseSchema = SuccessResponseSchema(SearchResultDataSchema)

export type SearchResponse = z.infer<typeof SearchResponseSchema>
```

### File: `packages/schemas/src/enrich.ts`

```typescript
import { z } from 'zod'
import { BookSchema } from './book'
import { SuccessResponseSchema } from './response'

/**
 * Enrich request body
 */
export const EnrichRequestSchema = z.object({
  isbns: z.array(z.string().regex(/^\d{10}(\d{3})?$/))
    .min(1)
    .max(50)
    .describe('Array of ISBNs to enrich (1-50, supports ISBN-10 and ISBN-13)'),
  includeEmbedding: z.boolean()
    .default(false)
    .optional()
    .describe('Generate semantic embeddings for vector search')
})

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>

/**
 * Enriched book with vectorization status
 */
export const EnrichedBookSchema = BookSchema.extend({
  vectorized: z.boolean().describe('Whether semantic embedding was generated')
})

export type EnrichedBook = z.infer<typeof EnrichedBookSchema>

/**
 * Enrich response data (supports batch)
 */
export const EnrichResultDataSchema = z.object({
  books: z.array(EnrichedBookSchema).describe('Enriched books (may be fewer than requested if some not found)'),
  requested: z.number().int().min(1).describe('Number of ISBNs requested'),
  found: z.number().int().min(0).describe('Number of books found'),
  notFound: z.array(z.string()).optional().describe('ISBNs that were not found')
})

export type EnrichResultData = z.infer<typeof EnrichResultDataSchema>

/**
 * Complete enrich response schema
 */
export const EnrichResponseSchema = SuccessResponseSchema(EnrichResultDataSchema)

export type EnrichResponse = z.infer<typeof EnrichResponseSchema>
```

### File: `packages/schemas/src/index.ts`

```typescript
/**
 * @bookstrack/schemas - Shared Zod schemas for BooksTrack API
 *
 * Contract-first API design with runtime validation and TypeScript types
 */

// Response envelopes
export {
  ResponseMetadataSchema,
  SuccessResponseSchema,
  ErrorResponseSchema,
  type ResponseMetadata,
  type ErrorResponse,
  type SuccessResponse
} from './response'

// Book domain
export {
  BookSchema,
  type Book
} from './book'

// Search endpoint
export {
  SearchMode,
  SearchRequestSchema,
  SearchResultDataSchema,
  SearchResponseSchema,
  type SearchRequest,
  type SearchResultData,
  type SearchResponse
} from './search'

// Enrich endpoint
export {
  EnrichRequestSchema,
  EnrichedBookSchema,
  EnrichResultDataSchema,
  EnrichResponseSchema,
  type EnrichRequest,
  type EnrichedBook,
  type EnrichResultData,
  type EnrichResponse
} from './enrich'
```

---

## Phase 2: Refactor V3 API to Use Shared Schemas

### File: `src/api-v3/index.ts` (Refactored)

```typescript
/**
 * V3 API - Contract-First with Shared Zod Schemas
 *
 * Uses @bookstrack/schemas for DRY, type-safe API definitions
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Env } from '../types'
import {
  SearchRequestSchema,
  SearchResponseSchema,
  EnrichRequestSchema,
  EnrichResponseSchema,
  BookSchema,
  ErrorResponseSchema,
  SuccessResponseSchema
} from '@bookstrack/schemas'

export function createV3Router() {
  const app = new OpenAPIHono<{ Bindings: Env }>()

  // ========================================================================
  // 1. GET /v3/books/search - Unified search endpoint
  // ========================================================================
  const searchRoute = createRoute({
    method: 'get',
    path: '/v3/books/search',
    tags: ['Books'],
    summary: 'Search books',
    description: 'Unified search supporting text (title), semantic (vector), and similar (by ISBN) modes',
    request: {
      query: SearchRequestSchema
    },
    responses: {
      200: {
        description: 'Search results',
        content: { 'application/json': { schema: SearchResponseSchema } }
      },
      400: {
        description: 'Invalid request',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      },
      500: {
        description: 'Server error',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(searchRoute, async (c) => {
    const { q, mode = 'text', page = 1, limit = 20 } = c.req.valid('query')

    // Handler implementation (delegates to existing services)
    // Returns SearchResponse (validated by Zod automatically)
  })

  // ========================================================================
  // 2. POST /v3/books/enrich - Single or batch enrichment
  // ========================================================================
  const enrichRoute = createRoute({
    method: 'post',
    path: '/v3/books/enrich',
    tags: ['Books'],
    summary: 'Enrich book metadata',
    description: 'Enrich single or multiple ISBNs with metadata and optional embeddings',
    request: {
      body: {
        content: {
          'application/json': { schema: EnrichRequestSchema }
        }
      }
    },
    responses: {
      200: {
        description: 'Books enriched',
        content: { 'application/json': { schema: EnrichResponseSchema } }
      },
      400: {
        description: 'Invalid request',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      },
      404: {
        description: 'No books found',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      },
      500: {
        description: 'Server error',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(enrichRoute, async (c) => {
    const { isbns, includeEmbedding = false } = c.req.valid('json')

    // Handler implementation (batch or single)
    // Returns EnrichResponse (validated by Zod automatically)
  })

  // ========================================================================
  // 3. GET /v3/books/:isbn - Direct ISBN lookup
  // ========================================================================
  const getBookRoute = createRoute({
    method: 'get',
    path: '/v3/books/:isbn',
    tags: ['Books'],
    summary: 'Get book by ISBN',
    description: 'Direct lookup by ISBN (fastest path for known ISBNs)',
    request: {
      params: z.object({
        isbn: z.string().regex(/^\d{10}(\d{3})?$/, 'Must be ISBN-10 or ISBN-13')
      })
    },
    responses: {
      200: {
        description: 'Book found',
        content: {
          'application/json': {
            schema: SuccessResponseSchema(BookSchema)
          }
        }
      },
      404: {
        description: 'Book not found',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      },
      500: {
        description: 'Server error',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(getBookRoute, async (c) => {
    const { isbn } = c.req.valid('param')

    // Handler implementation
    // Returns SuccessResponse<Book>
  })

  // OpenAPI documentation
  app.doc('/v3/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'BooksTrack V3 API',
      version: '3.0.0',
      description: 'Contract-first API with shared Zod schemas'
    }
  })

  app.get('/v3/docs', swaggerUI({ url: '/v3/openapi.json' }))

  return app
}
```

---

## Phase 3: Frontend Integration

### TypeScript/React Example

```typescript
// Install: npm install @bookstrack/schemas

import { SearchResponseSchema, type SearchResponse } from '@bookstrack/schemas'

async function searchBooks(query: string) {
  const response = await fetch(`/v3/books/search?q=${encodeURIComponent(query)}`)
  const json = await response.json()

  // Runtime validation with Zod
  const validated = SearchResponseSchema.parse(json)

  // TypeScript knows the exact shape
  if (validated.success) {
    return validated.data.books // Type: Book[]
  }

  throw new Error('Search failed')
}
```

### iOS/Swift Example (via TypeScript Bridge)

```swift
// Generate Swift types from Zod schemas using quicktype or similar tool
// OR: Use TypeScript for API layer, bridge to Swift UI

struct Book: Codable {
    let isbn: String
    let title: String
    let authors: [String]
    // ... (generated from BookSchema)
}

struct SearchResponse: Codable {
    let success: Bool
    let data: SearchResultData
    let metadata: ResponseMetadata
}
```

---

## Phase 4: Migration Strategy

### Timeline

**Week 1: Schema Package**
- [ ] Create `packages/schemas/` structure
- [ ] Implement all schema files (response, book, search, enrich)
- [ ] Setup build pipeline (tsup)
- [ ] Publish to npm as `@bookstrack/schemas@1.0.0`

**Week 2: Backend Refactor**
- [ ] Update `src/api-v3/index.ts` to import from `@bookstrack/schemas`
- [ ] Remove all inline Zod schemas
- [ ] Implement batch support in `/v3/books/enrich`
- [ ] Test all 3 endpoints with Zod validation
- [ ] Verify OpenAPI spec auto-generation

**Week 3: Frontend Migration**
- [ ] iOS team: Install `@bookstrack/schemas`, update API layer
- [ ] Web team: Install `@bookstrack/schemas`, update API layer
- [ ] Test runtime validation on both platforms
- [ ] Remove manual type definitions

**Week 4: V2 Deprecation**
- [ ] Add deprecation headers to all V2 endpoints
- [ ] Set sunset date: 90 days from Week 4 start
- [ ] Update docs: `/v3/docs` becomes primary reference
- [ ] Monitor V2 usage, assist teams with migration

**Week 5+: Cleanup**
- [ ] Remove `docs/openapi.yaml` (replaced by `/v3/openapi.json`)
- [ ] Archive V2 handlers
- [ ] Remove V1 endpoints (already sunset March 2026)

---

## Benefits

### For Backend
- ✅ **DRY:** Zero schema duplication (3 endpoints, 1 source of truth)
- ✅ **Type Safety:** Zod validates requests + infers TypeScript types
- ✅ **Auto-Generated Docs:** OpenAPI spec updates automatically
- ✅ **Reduced Complexity:** 3 endpoints instead of 12+

### For Frontend
- ✅ **Shared Contract:** `@bookstrack/schemas` is single source of truth
- ✅ **Runtime Validation:** Zod parse catches API changes immediately
- ✅ **TypeScript First-Class:** Full autocomplete from shared types
- ✅ **No Manual Codegen:** Direct import of schemas, no SDK generation

### For Everyone
- ✅ **Contract-First Development:** Backend + frontend agree on types upfront
- ✅ **Breaking Changes Caught Early:** Compile-time errors when contract changes
- ✅ **Versioned Contract:** npm semver for schema changes
- ✅ **Documentation as Code:** OpenAPI spec always reflects reality

---

## Testing Strategy

### Backend Tests

```typescript
import { describe, it, expect } from 'vitest'
import { SearchResponseSchema } from '@bookstrack/schemas'

describe('V3 Search Endpoint', () => {
  it('returns valid SearchResponse', async () => {
    const response = await fetch('http://localhost:8787/v3/books/search?q=harry+potter')
    const json = await response.json()

    // Zod validation ensures contract compliance
    expect(() => SearchResponseSchema.parse(json)).not.toThrow()
  })
})
```

### Frontend Tests

```typescript
import { SearchResponseSchema } from '@bookstrack/schemas'

test('API response matches contract', () => {
  const mockResponse = {
    success: true,
    data: {
      books: [{ isbn: '9780439708180', title: 'Harry Potter', /* ... */ }],
      total: 1,
      page: 1,
      limit: 20,
      query: { q: 'harry potter', mode: 'text' }
    },
    metadata: { timestamp: '2025-12-03T00:00:00Z', cached: false }
  }

  // Runtime validation
  expect(() => SearchResponseSchema.parse(mockResponse)).not.toThrow()
})
```

---

## Rollback Plan

**If migration fails:**
1. Revert `src/api-v3/index.ts` to previous version (inline schemas)
2. Keep V2 endpoints running (no disruption to existing clients)
3. Un-publish `@bookstrack/schemas` from npm (or mark deprecated)
4. Root cause analysis before retry

**Emergency Rollback:**
```bash
# Revert backend
git revert <commit-hash>
npm run deploy

# Notify frontend teams
# They can continue using V2 endpoints while V3 is fixed
```

---

## Success Criteria

**Migration is complete when:**
- ✅ `@bookstrack/schemas` published to npm
- ✅ All 3 V3 endpoints use shared schemas (zero inline Zod)
- ✅ OpenAPI spec auto-generates from Zod schemas
- ✅ iOS app uses `@bookstrack/schemas` for API calls
- ✅ Web app uses `@bookstrack/schemas` for API calls
- ✅ V2 endpoints marked deprecated with sunset date
- ✅ Zero runtime validation errors in production (7-day monitoring)

---

## FAQ

**Q: Why Zod instead of TypeScript interfaces?**
A: Zod provides runtime validation + TypeScript types. Interfaces are compile-time only.

**Q: Can frontend teams use schemas without Zod?**
A: Yes, TypeScript types are exported. But they lose runtime validation.

**Q: What about GraphQL?**
A: V3 is REST-first. GraphQL can be added later using same schemas.

**Q: How do we version schema changes?**
A: npm semver on `@bookstrack/schemas`. Breaking changes = MAJOR bump.

**Q: What about backward compatibility?**
A: V2 stays live for 90 days. Clients migrate at their own pace.

---

**Last Updated:** December 3, 2025
**Author:** Backend Team
**Status:** Ready for Week 1 implementation
