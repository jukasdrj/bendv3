# BooksTrack V3: Zod Schema Architecture & Contract-First API

**Version:** 2.0
**Date:** December 4, 2025
**Status:** Ready for Implementation
**Goal:** 3 endpoints. Shared Zod schemas. Published contract. Zero spaghetti.

---

## Best-in-Class API Improvements (v2.0)

This version incorporates industry best practices for modern API design:

| Improvement | Standard | Description |
|-------------|----------|-------------|
| **RFC 9457 Problem Details** | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) | Standardized error responses with `type`, `title`, `status`, `detail`, `instance` |
| **Zod v4 Schemas** | zod@4.1.13 | Uses project's actual Zod version (not v3) |
| **Request Correlation** | Industry standard | `X-Request-ID` header for distributed tracing |
| **Rate Limit Headers** | Draft IETF | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| **Cursor Pagination** | Best practice | Optional cursor-based pagination for large datasets |
| **OpenAPI 3.1 Security** | OpenAPI 3.1 | Proper security scheme documentation |
| **ETag Support** | HTTP/1.1 | Conditional requests for cache validation |
| **HATEOAS Links** | REST maturity | Optional `_links` for resource discoverability |

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
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./errors": {
      "types": "./dist/errors.d.ts",
      "import": "./dist/errors.mjs",
      "require": "./dist/errors.js"
    }
  },
  "sideEffects": false,
  "scripts": {
    "build": "tsup src/index.ts src/errors.ts --format cjs,esm --dts --clean",
    "prepublishOnly": "npm run build",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["bookstrack", "zod", "api", "schema", "validation", "rfc9457"],
  "author": "BooksTrack Team",
  "license": "MIT",
  "peerDependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.2",
    "zod": "^4.1.13"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

### File: `packages/schemas/src/response.ts`

```typescript
import { z } from 'zod'

/**
 * Data source providers
 */
export const DataSourceSchema = z.enum([
  'alexandria',
  'google_books',
  'open_library',
  'isbndb',
  'kv-cache',
  'vectorize',
  'text-search',
  'job-state-manager-do'
])

export type DataSource = z.infer<typeof DataSourceSchema>

/**
 * Shared response metadata included in all API responses
 */
export const ResponseMetadataSchema = z.object({
  timestamp: z.string().datetime().describe('ISO 8601 timestamp of response'),
  requestId: z.string().uuid().optional().describe('Correlation ID for request tracing (X-Request-ID)'),
  source: DataSourceSchema.optional().describe('Data source provider'),
  cached: z.boolean().optional().describe('Whether response was served from cache'),
  processingTimeMs: z.number().int().min(0).optional().describe('Processing time in milliseconds'),
  // Rate limit info (included when applicable)
  rateLimit: z.object({
    limit: z.number().int().describe('Max requests per window'),
    remaining: z.number().int().describe('Requests remaining in window'),
    reset: z.number().int().describe('Unix timestamp when window resets')
  }).optional().describe('Rate limit status')
})

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>

/**
 * HATEOAS link for resource discoverability (optional)
 */
export const LinkSchema = z.object({
  href: z.string().url().describe('Link URL'),
  rel: z.string().describe('Link relation type'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method')
})

export type Link = z.infer<typeof LinkSchema>

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
    metadata: ResponseMetadataSchema,
    _links: z.record(LinkSchema).optional().describe('HATEOAS links for resource discoverability')
  })
}

/**
 * RFC 9457 Problem Details error codes
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */
export const ErrorCodeSchema = z.enum([
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
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>

/**
 * RFC 9457 Problem Details error response
 *
 * Combines RFC 9457 standard fields with BooksTrack-specific extensions.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 *
 * Standard fields:
 * - type: URI reference identifying the problem type
 * - title: Short, human-readable summary
 * - status: HTTP status code
 * - detail: Human-readable explanation specific to this occurrence
 * - instance: URI reference identifying the specific occurrence
 *
 * Extensions:
 * - code: Machine-readable error code (BooksTrack-specific)
 * - retryable: Whether the client should retry
 * - retryAfterMs: Milliseconds to wait before retry
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false).describe('Success discriminator (always false for error responses)'),
  // RFC 9457 Problem Details standard fields
  type: z.string().url().default('about:blank').describe('URI reference identifying the problem type'),
  title: z.string().describe('Short, human-readable summary of the problem type'),
  status: z.number().int().min(100).max(599).describe('HTTP status code'),
  detail: z.string().optional().describe('Human-readable explanation specific to this occurrence'),
  instance: z.string().optional().describe('URI reference identifying this specific occurrence'),
  // BooksTrack extensions
  code: ErrorCodeSchema.describe('Machine-readable error code'),
  retryable: z.boolean().optional().describe('Whether the request can be retried'),
  retryAfterMs: z.number().int().min(0).optional().describe('Milliseconds to wait before retry'),
  errors: z.array(z.object({
    field: z.string().describe('Field path (e.g., "isbns[0]")'),
    message: z.string().describe('Validation error message'),
    code: z.string().optional().describe('Validation error code')
  })).optional().describe('Field-level validation errors'),
  // Metadata
  metadata: ResponseMetadataSchema.pick({ timestamp: true, requestId: true })
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * TypeScript utility type for success responses with inferred data type
 */
export type SuccessResponse<T> = {
  success: true
  data: T
  metadata: ResponseMetadata
  _links?: Record<string, Link>
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
import { SuccessResponseSchema, LinkSchema } from './response'

/**
 * Search mode enumeration
 */
export const SearchModeSchema = z.enum(['text', 'semantic', 'similar']).describe('Search mode')
export type SearchMode = z.infer<typeof SearchModeSchema>

/**
 * Pagination style - offset (page-based) or cursor (for large datasets)
 */
export const PaginationStyleSchema = z.enum(['offset', 'cursor']).default('offset')
export type PaginationStyle = z.infer<typeof PaginationStyleSchema>

/**
 * Search request query parameters
 *
 * Supports both offset-based (page/limit) and cursor-based pagination.
 * Cursor pagination is recommended for large result sets to avoid
 * inconsistencies when data changes between requests.
 */
export const SearchRequestSchema = z.object({
  q: z.string()
    .min(1)
    .max(200)
    .describe('Search query (e.g., "Harry Potter" or "similar:9780439708180")'),
  mode: SearchModeSchema
    .default('text')
    .optional()
    .describe('Search mode: text (title), semantic (vector), similar (by ISBN)'),
  // Offset-based pagination (default)
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1)
    .optional()
    .describe('Page number for offset pagination (default: 1)'),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe('Results per page (default: 20, max: 100)'),
  // Cursor-based pagination (optional, for large datasets)
  cursor: z.string()
    .optional()
    .describe('Opaque cursor for cursor-based pagination (from previous response)'),
  // Pagination style selector
  paginationStyle: PaginationStyleSchema
    .optional()
    .describe('Pagination style: "offset" (default) or "cursor"')
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>

/**
 * Pagination info for offset-based results
 */
export const OffsetPaginationSchema = z.object({
  page: z.number().int().min(1).describe('Current page number'),
  limit: z.number().int().min(1).max(100).describe('Results per page'),
  totalPages: z.number().int().min(0).describe('Total number of pages'),
  hasNext: z.boolean().describe('Whether there are more pages'),
  hasPrev: z.boolean().describe('Whether there are previous pages')
})

/**
 * Pagination info for cursor-based results
 */
export const CursorPaginationSchema = z.object({
  cursor: z.string().nullable().describe('Cursor for next page (null if no more results)'),
  hasMore: z.boolean().describe('Whether there are more results'),
  limit: z.number().int().min(1).max(100).describe('Results per page')
})

/**
 * Search response data
 */
export const SearchResultDataSchema = z.object({
  books: z.array(BookSchema).describe('Array of book results'),
  total: z.number().int().min(0).describe('Total number of results'),
  query: z.object({
    q: z.string(),
    mode: SearchModeSchema
  }).describe('Original search query'),
  // Pagination (one of these will be present based on paginationStyle)
  pagination: z.union([OffsetPaginationSchema, CursorPaginationSchema])
    .describe('Pagination info (offset or cursor based)')
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
 * Contract-first API design with runtime validation and TypeScript types.
 * Implements RFC 9457 Problem Details for error responses.
 *
 * @packageDocumentation
 */

// Response envelopes and metadata
export {
  DataSourceSchema,
  ResponseMetadataSchema,
  LinkSchema,
  SuccessResponseSchema,
  ErrorCodeSchema,
  ErrorResponseSchema,
  type DataSource,
  type ResponseMetadata,
  type Link,
  type ErrorCode,
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
  SearchModeSchema,
  PaginationStyleSchema,
  SearchRequestSchema,
  OffsetPaginationSchema,
  CursorPaginationSchema,
  SearchResultDataSchema,
  SearchResponseSchema,
  type SearchMode,
  type PaginationStyle,
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

### File: `packages/schemas/src/errors.ts`

```typescript
/**
 * RFC 9457 Problem Details helper functions
 *
 * Utilities for creating standardized error responses.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

import type { ErrorCode, ErrorResponse } from './response'

/**
 * Base URL for error type documentation
 */
const ERROR_TYPE_BASE = 'https://api.oooefam.net/errors'

/**
 * Error code to HTTP status mapping
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  // 4xx Client Errors
  MISSING_PARAMETER: 400,
  INVALID_REQUEST: 400,
  INVALID_ISBN: 400,
  INVALID_QUERY: 400,
  INVALID_FILE: 400,
  FILE_TOO_LARGE: 413,
  BATCH_TOO_LARGE: 413,
  EMPTY_BATCH: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CLIENT_DISCONNECTED: 499,
  RATE_LIMIT_EXCEEDED: 429,
  // 5xx Server Errors
  CIRCUIT_OPEN: 503,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  CACHE_ERROR: 500,
  INTERNAL_ERROR: 500,
  API_ERROR: 500,
  NETWORK_ERROR: 502,
  TIMEOUT: 504,
  FEATURE_NOT_AVAILABLE: 501
}

/**
 * Error code to human-readable title mapping
 */
export const ERROR_TITLE_MAP: Record<ErrorCode, string> = {
  MISSING_PARAMETER: 'Missing Required Parameter',
  INVALID_REQUEST: 'Invalid Request',
  INVALID_ISBN: 'Invalid ISBN Format',
  INVALID_QUERY: 'Invalid Search Query',
  INVALID_FILE: 'Invalid File',
  FILE_TOO_LARGE: 'File Too Large',
  BATCH_TOO_LARGE: 'Batch Size Exceeded',
  EMPTY_BATCH: 'Empty Batch',
  NOT_FOUND: 'Resource Not Found',
  UNAUTHORIZED: 'Authentication Required',
  FORBIDDEN: 'Access Denied',
  CLIENT_DISCONNECTED: 'Client Disconnected',
  RATE_LIMIT_EXCEEDED: 'Rate Limit Exceeded',
  CIRCUIT_OPEN: 'Service Temporarily Unavailable',
  PROVIDER_ERROR: 'External Service Error',
  PROVIDER_TIMEOUT: 'External Service Timeout',
  CACHE_ERROR: 'Cache Error',
  INTERNAL_ERROR: 'Internal Server Error',
  API_ERROR: 'API Error',
  NETWORK_ERROR: 'Network Error',
  TIMEOUT: 'Request Timeout',
  FEATURE_NOT_AVAILABLE: 'Feature Not Available'
}

/**
 * Retryable error codes
 */
export const RETRYABLE_ERRORS: Set<ErrorCode> = new Set([
  'RATE_LIMIT_EXCEEDED',
  'CIRCUIT_OPEN',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'CACHE_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT'
])

/**
 * Create an RFC 9457 Problem Details error response
 */
export function createProblemDetails(
  code: ErrorCode,
  detail?: string,
  options?: {
    instance?: string
    retryAfterMs?: number
    errors?: Array<{ field: string; message: string; code?: string }>
    requestId?: string
  }
): ErrorResponse {
  const status = ERROR_STATUS_MAP[code]
  const title = ERROR_TITLE_MAP[code]
  const retryable = RETRYABLE_ERRORS.has(code)

  return {
    success: false,
    type: `${ERROR_TYPE_BASE}/${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance: options?.instance,
    code,
    retryable,
    retryAfterMs: options?.retryAfterMs,
    errors: options?.errors,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: options?.requestId
    }
  }
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === false
  )
}
```

---

## Phase 2: Refactor V3 API to Use Shared Schemas

### New Middleware: `src/middleware/request-context.ts`

```typescript
/**
 * Request Context Middleware
 *
 * Adds correlation ID, timing, and rate limit context to requests.
 */
import { createMiddleware } from 'hono/factory'
import { v4 as uuidv4 } from 'uuid'

export interface RequestContext {
  requestId: string
  startTime: number
  rateLimit?: {
    limit: number
    remaining: number
    reset: number
  }
}

/**
 * Middleware that adds request context for correlation and timing
 */
export const requestContext = createMiddleware<{
  Variables: { ctx: RequestContext }
}>(async (c, next) => {
  // Get or generate request ID
  const requestId = c.req.header('X-Request-ID') || uuidv4()

  // Set context
  c.set('ctx', {
    requestId,
    startTime: Date.now()
  })

  // Add correlation ID to response
  c.header('X-Request-ID', requestId)

  await next()

  // Add timing header
  const duration = Date.now() - c.get('ctx').startTime
  c.header('X-Response-Time', `${duration}ms`)
})

/**
 * Rate limit headers middleware (applied per-route)
 */
export const rateLimitHeaders = createMiddleware(async (c, next) => {
  await next()

  const ctx = c.get('ctx') as RequestContext
  if (ctx.rateLimit) {
    c.header('X-RateLimit-Limit', String(ctx.rateLimit.limit))
    c.header('X-RateLimit-Remaining', String(ctx.rateLimit.remaining))
    c.header('X-RateLimit-Reset', String(ctx.rateLimit.reset))
  }
})
```

### File: `src/api-v3/index.ts` (Refactored)

```typescript
/**
 * V3 API - Contract-First with Shared Zod Schemas
 *
 * Best-in-class API with:
 * - RFC 9457 Problem Details for errors
 * - Request correlation (X-Request-ID)
 * - Rate limit headers (X-RateLimit-*)
 * - HATEOAS links for discoverability
 * - Cursor-based pagination option
 * - OpenAPI 3.1 with security schemes
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { Env } from '../types'
import { requestContext, rateLimitHeaders } from '../middleware/request-context'
import {
  SearchRequestSchema,
  SearchResponseSchema,
  EnrichRequestSchema,
  EnrichResponseSchema,
  BookSchema,
  ErrorResponseSchema,
  SuccessResponseSchema
} from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'

export function createV3Router() {
  const app = new OpenAPIHono<{
    Bindings: Env
    Variables: { ctx: RequestContext }
  }>()

  // Apply request context middleware to all routes
  app.use('*', requestContext)

  // ========================================================================
  // 1. GET /v3/books/search - Unified search endpoint
  // ========================================================================
  const searchRoute = createRoute({
    method: 'get',
    path: '/v3/books/search',
    tags: ['Books'],
    summary: 'Search books',
    description: `Unified search supporting multiple modes:
- **text**: Full-text search by title (default)
- **semantic**: Vector similarity search using embeddings
- **similar**: Find books similar to a given ISBN

Supports both offset-based (page/limit) and cursor-based pagination.`,
    request: {
      query: SearchRequestSchema
    },
    responses: {
      200: {
        description: 'Search results',
        content: { 'application/json': { schema: SearchResponseSchema } },
        headers: {
          'X-Request-ID': { schema: { type: 'string' }, description: 'Correlation ID' },
          'X-Response-Time': { schema: { type: 'string' }, description: 'Response time' }
        }
      },
      400: {
        description: 'Invalid request (RFC 9457 Problem Details)',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      },
      429: {
        description: 'Rate limit exceeded',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait' },
          'X-RateLimit-Limit': { schema: { type: 'integer' } },
          'X-RateLimit-Remaining': { schema: { type: 'integer' } },
          'X-RateLimit-Reset': { schema: { type: 'integer' } }
        }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(searchRoute, rateLimitHeaders, async (c) => {
    const ctx = c.get('ctx')
    const { q, mode = 'text', page = 1, limit = 20, cursor, paginationStyle = 'offset' } = c.req.valid('query')

    try {
      // Handler implementation with request context
      // ... delegates to existing services ...

      // Return SearchResponse with HATEOAS links
      return c.json({
        success: true,
        data: { /* ... */ },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          processingTimeMs: Date.now() - ctx.startTime
        },
        _links: {
          self: { href: `/v3/books/search?q=${encodeURIComponent(q)}&page=${page}`, rel: 'self' },
          next: { href: `/v3/books/search?q=${encodeURIComponent(q)}&page=${page + 1}`, rel: 'next' }
        }
      })
    } catch (error) {
      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url
        }),
        500
      )
    }
  })

  // ========================================================================
  // 2. POST /v3/books/enrich - Single or batch enrichment
  // ========================================================================
  const enrichRoute = createRoute({
    method: 'post',
    path: '/v3/books/enrich',
    tags: ['Books'],
    summary: 'Enrich book metadata',
    description: `Enrich single or multiple ISBNs with metadata from Alexandria.

Supports batch operations (up to 50 ISBNs) and optional embedding generation
for semantic search.`,
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
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      },
      404: {
        description: 'No books found',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      },
      429: {
        description: 'Rate limit exceeded',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(enrichRoute, rateLimitHeaders, async (c) => {
    const ctx = c.get('ctx')
    const { isbns, includeEmbedding = false } = c.req.valid('json')

    // Handler implementation with RFC 9457 error handling
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
    description: 'Direct lookup by ISBN (fastest path for known ISBNs). Supports conditional requests with ETag.',
    request: {
      params: z.object({
        isbn: z.string().regex(/^\d{10}(\d{3})?$/, 'Must be ISBN-10 or ISBN-13')
      }),
      headers: z.object({
        'If-None-Match': z.string().optional().describe('ETag for conditional request')
      }).optional()
    },
    responses: {
      200: {
        description: 'Book found',
        content: { 'application/json': { schema: SuccessResponseSchema(BookSchema) } },
        headers: {
          'ETag': { schema: { type: 'string' }, description: 'Entity tag for caching' },
          'Cache-Control': { schema: { type: 'string' }, description: 'Caching directives' }
        }
      },
      304: {
        description: 'Not modified (ETag match)'
      },
      404: {
        description: 'Book not found',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } }
      }
    }
  })

  app.openapi(getBookRoute, async (c) => {
    const ctx = c.get('ctx')
    const { isbn } = c.req.valid('param')
    const ifNoneMatch = c.req.header('If-None-Match')

    // Handler implementation with ETag support
    // Returns SuccessResponse<Book> or 304 Not Modified
  })

  // ========================================================================
  // OpenAPI Documentation with Security Schemes
  // ========================================================================
  app.doc('/v3/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'BooksTrack V3 API',
      version: '3.0.0',
      description: `Contract-first API with shared Zod schemas.

## Features
- RFC 9457 Problem Details for errors
- Request correlation via X-Request-ID
- Rate limiting with standard headers
- Cursor and offset pagination
- ETag-based conditional requests
- HATEOAS links for discoverability

## Error Handling
All errors follow [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html).
Error responses use \`application/problem+json\` content type.`,
      contact: {
        name: 'BooksTrack API Support',
        url: 'https://github.com/bookstrack/api/issues'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      { url: 'https://api.oooefam.net', description: 'Production' },
      { url: 'http://localhost:8787', description: 'Local development' }
    ],
    tags: [
      { name: 'Books', description: 'Book metadata operations' }
    ],
    externalDocs: {
      description: 'API Documentation',
      url: 'https://api.oooefam.net/v3/docs'
    }
  })

  // Swagger UI
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
- ✅ **Type Safety:** Zod v4 validates requests + infers TypeScript types
- ✅ **Auto-Generated Docs:** OpenAPI 3.1 spec updates automatically
- ✅ **Reduced Complexity:** 3 endpoints instead of 12+
- ✅ **RFC 9457 Compliance:** Standardized error responses with Problem Details
- ✅ **Request Tracing:** X-Request-ID for distributed debugging

### For Frontend
- ✅ **Shared Contract:** `@bookstrack/schemas` is single source of truth
- ✅ **Runtime Validation:** Zod parse catches API changes immediately
- ✅ **TypeScript First-Class:** Full autocomplete from shared types
- ✅ **No Manual Codegen:** Direct import of schemas, no SDK generation
- ✅ **Error Handling:** Type-safe RFC 9457 error parsing

### For Operations
- ✅ **Observability:** Request correlation IDs across services
- ✅ **Rate Limiting:** Standard X-RateLimit-* headers for client backoff
- ✅ **Caching:** ETag support for conditional requests
- ✅ **Graceful Degradation:** Retryable errors with backoff hints

### For Everyone
- ✅ **Contract-First Development:** Backend + frontend agree on types upfront
- ✅ **Breaking Changes Caught Early:** Compile-time errors when contract changes
- ✅ **Versioned Contract:** npm semver for schema changes
- ✅ **Documentation as Code:** OpenAPI spec always reflects reality
- ✅ **Industry Standards:** RFC 9457, OpenAPI 3.1, IETF rate limiting draft

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
- ✅ `@bookstrack/schemas` published to npm with zod@4 peer dependency
- ✅ All 3 V3 endpoints use shared schemas (zero inline Zod)
- ✅ OpenAPI 3.1 spec auto-generates from Zod schemas
- ✅ RFC 9457 Problem Details for all error responses
- ✅ X-Request-ID correlation headers in all responses
- ✅ Rate limit headers (X-RateLimit-*) on applicable endpoints
- ✅ iOS app uses `@bookstrack/schemas` for API calls
- ✅ Web app uses `@bookstrack/schemas` for API calls
- ✅ V2 endpoints marked deprecated with sunset date
- ✅ Zero runtime validation errors in production (7-day monitoring)

---

## FAQ

**Q: Why Zod v4 instead of v3?**
A: Zod v4 is already in use in the project (zod@4.1.13). It offers better performance and smaller bundle size.

**Q: Why Zod instead of TypeScript interfaces?**
A: Zod provides runtime validation + TypeScript types. Interfaces are compile-time only.

**Q: Can frontend teams use schemas without Zod?**
A: Yes, TypeScript types are exported. But they lose runtime validation.

**Q: What is RFC 9457 Problem Details?**
A: The modern standard (supersedes RFC 7807) for machine-readable HTTP error responses with `type`, `title`, `status`, `detail`, and `instance` fields.

**Q: What about GraphQL?**
A: V3 is REST-first. GraphQL can be added later using same schemas.

**Q: How do we version schema changes?**
A: npm semver on `@bookstrack/schemas`. Breaking changes = MAJOR bump.

**Q: What about backward compatibility?**
A: V2 stays live for 90 days. Clients migrate at their own pace.

**Q: Why both offset and cursor pagination?**
A: Offset is simpler and familiar. Cursor is more scalable for large datasets and prevents issues when data changes between requests.

---

## Changelog

### v2.0 (December 4, 2025)
- **BREAKING:** Updated to zod@4 (was incorrectly specifying zod@3.22.0)
- **Added:** RFC 9457 Problem Details for error responses
- **Added:** Request correlation via X-Request-ID header
- **Added:** Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- **Added:** Cursor-based pagination option for search endpoint
- **Added:** ETag support for conditional requests on GET /v3/books/:isbn
- **Added:** HATEOAS _links for resource discoverability
- **Added:** `errors.ts` helper module with `createProblemDetails()` function
- **Added:** `application/problem+json` content type for error responses
- **Added:** Request context middleware for timing and tracing
- **Improved:** OpenAPI 3.1 documentation with security schemes, servers, contact info
- **Improved:** Package exports with tree-shaking support (`sideEffects: false`)

### v1.0 (December 3, 2025)
- Initial plan with 3 core endpoints
- Shared `@bookstrack/schemas` package structure
- Basic success/error response schemas

---

**Last Updated:** December 4, 2025
**Author:** Backend Team
**Status:** Ready for implementation
