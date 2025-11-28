# OpenAPI Discovery Architecture - Migration Plan

**Project:** BooksTrack Backend API
**Version:** 1.0
**Date:** November 27, 2025
**Status:** APPROVED - Full Migration
**Owner:** Backend Team
**Planner:** Zen MCP Planner (Gemini 2.5 Pro)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [Migration Phases](#migration-phases)
5. [Rollback Plan](#rollback-plan)
6. [Testing Strategy](#testing-strategy)
7. [Success Metrics](#success-metrics)
8. [Timeline](#timeline)
9. [Risk Assessment](#risk-assessment)
10. [Open Questions](#open-questions)

---

## Executive Summary

### Current State
BooksTrack backend has **three sources of truth** for API capabilities:
- `docs/openapi.yaml` - Manual YAML documentation (v3.2.0)
- `src/handlers/v2/capabilities.ts` - Feature discovery endpoint
- `src/router.ts` - Actual Hono router (59+ endpoints)

**Problem:** Manual synchronization has caused drift:
- Ghost endpoint: `POST /api/batch-enrich` (documented, doesn't exist)
- Missing endpoints: `GET /v1/search/advanced`, `GET /v1/search/semantic`
- Wrong priorities in capabilities.ts

**Audit Results:** See `OPENAPI_AUDIT.md` for full analysis

### Goal
Migrate to **@hono/zod-openapi** for single source of truth:
- OpenAPI spec auto-generated from code
- Capabilities endpoint reflects actual running routes
- Type safety prevents drift
- Client SDK generation works out-of-box

### Strategy
**6-phase incremental migration** over 12 weeks covering 21 critical routes:
1. Foundation + POC (2 weeks)
2. V2 API migration (3 weeks)
3. V1 Search migration (2 weeks)
4. Jobs/Batch migration (2 weeks)
5. Auto-generated capabilities (1 week)
6. Cleanup + documentation (2 weeks)

### Benefits
**Technical:**
- Zero breaking changes to iOS app
- <5% latency regression
- 100% OpenAPI 3.1 spec validity
- Type safety across all migrated routes

**Developer Experience:**
- Auto-generated client SDKs
- Swagger UI at `/doc`
- No manual OpenAPI maintenance
- Compile-time contract validation

**Operational:**
- Reduced support tickets (better docs)
- Faster onboarding (self-service docs)
- Fewer integration bugs (schema validation)

---

## Problem Statement

### Three Sources of Truth

```
┌─────────────────────────────────────────────────────────────┐
│                  Current Architecture                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  docs/openapi.yaml                                           │
│  ├─ Manual YAML maintenance                                 │
│  ├─ 20 documented paths                                     │
│  └─ PROBLEM: Ghost endpoint /api/batch-enrich               │
│                                                              │
│  src/handlers/v2/capabilities.ts                            │
│  ├─ Feature discovery endpoint                              │
│  ├─ Hardcoded feature list                                  │
│  └─ PROBLEM: Wrong CSV import endpoint priority             │
│                                                              │
│  src/router.ts (Hono)                                       │
│  ├─ 59 actual route handlers                                │
│  ├─ Single source of truth for routing                      │
│  └─ PROBLEM: Missing from OpenAPI spec                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                 │                    │
         │                 │                    │
         ▼                 ▼                    ▼
    MANUAL SYNC      MANUAL SYNC          MANUAL SYNC
         │                 │                    │
         └─────────────────┴────────────────────┘
                           │
                           ▼
                   GUARANTEED DRIFT
```

### Specific Issues Found

**1. Ghost Endpoint (CRITICAL)**
- OpenAPI documents `POST /api/batch-enrich` (line 583)
- This endpoint **does not exist** in router.ts
- Clients following spec get 404 errors

**2. Missing Endpoints (HIGH)**
- `GET /v1/search/advanced` - exists, not documented
- `GET /v1/search/semantic` - exists, not documented
- `POST /v1/enrichment/batch` - real batch enrichment endpoint
- Plus 11 other production endpoints

**3. Wrong Priorities (MEDIUM)**
- capabilities.ts lists `/api/import/csv-gemini` as CSV import
- Should prioritize `/api/v2/imports` as primary V2 endpoint

**4. Missing Features (MEDIUM)**
- Job cancellation (`DELETE /v1/jobs/{jobId}`) exists but not in capabilities

---

## Solution Architecture

### Target Architecture: @hono/zod-openapi

```
┌─────────────────────────────────────────────────────────────┐
│               Target Architecture (Single Source)            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  src/router.ts (@hono/zod-openapi)                          │
│  ├─ Route definitions with Zod schemas                      │
│  ├─ Request/response validation                             │
│  ├─ OpenAPI metadata (tags, descriptions)                   │
│  └─ Custom extensions (x-rateLimit, x-feature)              │
│                                                              │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ AUTO-GENERATE
                   │
         ┌─────────┴──────────┬──────────────────┐
         │                    │                  │
         ▼                    ▼                  ▼
  OpenAPI 3.1 Spec      Capabilities      TypeScript Types
  ├─ /doc/openapi.json  Endpoint          ├─ Request schemas
  ├─ Swagger UI         ├─ Derived from   ├─ Response schemas
  └─ SDK generation     │   OpenAPI       └─ End-to-end safety
                        └─ Always accurate
```

### Core Components

**1. Zod Schema Library**
```typescript
// src/schemas/common.ts
export const ResponseEnvelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    metadata: z.object({
      timestamp: z.string().datetime(),
      cached: z.boolean().optional(),
      source: z.enum(['google_books', 'open_library', 'isbndb', 'kv_cache']).optional()
    }).optional()
  })

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(['NOT_FOUND', 'INVALID_REQUEST', 'RATE_LIMIT_EXCEEDED', 'CIRCUIT_OPEN', ...]),
    message: z.string(),
    details: z.record(z.any()).optional(),
    retryable: z.boolean().optional(),
    retryAfterMs: z.number().optional(),
    provider: z.string().optional()
  })
})

// src/schemas/book.ts
export const BookSchema = z.object({
  isbn: z.string(),
  isbn13: z.string().optional(),
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  pageCount: z.number().optional(),
  categories: z.array(z.string()).optional(),
  language: z.string().optional(),
  coverUrl: z.string().url().optional(),
  averageRating: z.number().optional(),
  ratingsCount: z.number().optional()
})

// src/schemas/job.ts
export const JobResponseSchema = z.object({
  jobId: z.string().uuid(),
  authToken: z.string().uuid(),
  sseUrl: z.string(),
  statusUrl: z.string(),
  websocketUrl: z.string().optional()
})
```

**2. Route Definition Pattern**
```typescript
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'

const app = new OpenAPIHono()

// Example: ISBN Search
app.openapi(
  createRoute({
    method: 'get',
    path: '/v1/search/isbn',
    request: {
      query: z.object({
        isbn: z.string().regex(/^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?$)[\d-]+$/)
      })
    },
    responses: {
      200: {
        description: 'Book found',
        content: {
          'application/json': {
            schema: ResponseEnvelopeSchema(BookSchema)
          }
        }
      },
      404: {
        description: 'Book not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        }
      }
    },
    tags: ['Search'],
    'x-rateLimit': { requests: 100, windowMs: 60000 },
    'x-feature': 'text_search'
  }),
  async (c) => {
    const { isbn } = c.req.valid('query')
    return await handleSearchISBN(isbn, c.env, c.req.raw, c.executionCtx)
  }
)
```

**3. Auto-Generated Capabilities**
```typescript
// src/handlers/v2/capabilities-generated.ts
import { app } from '../../router'

export async function handleCapabilitiesGenerated(request, env) {
  const openAPIDoc = app.getOpenAPIDocument()

  // Transform OpenAPI paths to capabilities format
  const features = deriveFeatures(openAPIDoc.paths, env)
  const limits = deriveLimits(env)
  const deprecations = deriveDeprecations(openAPIDoc.paths)

  return createSuccessResponse({
    apiVersion: openAPIDoc.info.version,
    features,
    limits,
    deprecations
  })
}

function deriveFeatures(paths, env) {
  // Group by tags, extract rate limits from x-rateLimit extension
  // Auto-detect enabled features from route presence
  const features = []

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, spec] of Object.entries(methods)) {
      const tag = spec.tags?.[0]
      const feature = spec['x-feature']
      const rateLimit = spec['x-rateLimit']

      // Group endpoints by feature
      // Check environment bindings for enabled status
      // Extract rate limits from x-rateLimit extension
    }
  }

  return features
}
```

---

## Migration Phases

### Phase 1: Foundation & Proof of Concept (Week 1-2)

#### Objectives
- Install dependencies and configure @hono/zod-openapi
- Create core schema library
- Migrate simplest endpoint as POC
- Validate approach and measure performance

#### Tasks

**1.1 Setup**
```bash
npm install @hono/zod-openapi zod
```

**1.2 Project Structure**
```
src/
├── schemas/
│   ├── common.ts          # ResponseEnvelope, ErrorResponse
│   ├── book.ts            # Book, EnrichedBook
│   ├── job.ts             # JobResponse, JobStatus
│   └── index.ts           # Re-exports
├── openapi/
│   ├── config.ts          # OpenAPI document config
│   └── extensions.ts      # Custom x-* extensions
└── router.ts              # Migrate to OpenAPIHono
```

**1.3 Core Schemas**
- Implement ResponseEnvelopeSchema
- Implement ErrorResponseSchema
- Implement BookSchema
- Implement JobResponseSchema
- Add unit tests for schemas

**1.4 POC: Migrate /api/v2/capabilities**
- Simplest endpoint (GET, no auth, no validation)
- Demonstrates OpenAPI generation
- Tests Swagger UI rendering

**1.5 Configuration**
```typescript
// src/openapi/config.ts
export const openAPIConfig = {
  openapi: '3.1.0',
  info: {
    title: 'BooksTrack API',
    version: '3.3.0',
    description: 'Book search, enrichment, and AI-powered scanning API',
    contact: {
      email: 'api-support@oooefam.net'
    }
  },
  servers: [
    { url: 'https://api.oooefam.net', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local development' }
  ],
  tags: [
    { name: 'Search', description: 'Book and author search operations' },
    { name: 'Enrichment', description: 'Book metadata enrichment' },
    { name: 'Import', description: 'CSV import and batch processing' },
    { name: 'Scanning', description: 'Bookshelf photo scanning' },
    { name: 'Health', description: 'System health and monitoring' }
  ]
}
```

#### Success Criteria
- `/doc` renders Swagger UI
- Capabilities endpoint returns same response format
- OpenAPI JSON available at `/doc/openapi.json`
- Zero iOS app impact (response format unchanged)
- Performance: <5ms overhead from Zod validation

#### Deliverables
- Working POC
- Performance benchmarks
- Schema library foundation
- Decision: Proceed to Phase 2 or iterate

---

### Phase 2: V2 API Migration (Week 3-5)

#### Objectives
- Migrate all 6 V2 API endpoints
- Implement feature flag for gradual rollout
- Add comprehensive schema validation
- Validate iOS app compatibility

#### Routes to Migrate

**2.1 V2 Search Endpoints**
- `GET /api/v2/search` (semantic + text modes)
- `GET /api/v2/recommendations/weekly`

**2.2 V2 Enrichment**
- `POST /api/v2/books/enrich` (single book enrichment)

**2.3 V2 Import System**
- `POST /api/v2/imports` (CSV upload, multipart/form-data)
- `GET /api/v2/imports/:jobId` (status polling)
- `GET /api/v2/imports/:jobId/stream` (SSE progress stream)
- `GET /api/v2/imports/:jobId/results` (final results)

#### Challenges & Solutions

**Challenge 1: Multipart Form Data**
```typescript
// Solution: Use Hono's built-in file handling + Zod
import { zValidator } from '@hono/zod-validator'

const csvImportSchema = z.object({
  file: z.instanceof(File)
})

app.openapi(
  createRoute({
    method: 'post',
    path: '/api/v2/imports',
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: csvImportSchema
          }
        }
      }
    },
    // ... responses
  }),
  async (c) => {
    const { file } = c.req.valid('form')
    return await handleCSVImport(c.req.raw, c.env, c.executionCtx)
  }
)
```

**Challenge 2: SSE Streams**
```typescript
// Solution: Document as text/event-stream, skip response validation
app.openapi(
  createRoute({
    method: 'get',
    path: '/api/v2/imports/{jobId}/stream',
    responses: {
      200: {
        description: 'SSE stream',
        content: {
          'text/event-stream': {
            schema: z.string()  // Skip validation for SSE
          }
        }
      }
    }
  }),
  async (c) => {
    // SSE handler (no response validation)
  }
)
```

**Challenge 3: Path Parameters**
```typescript
// Solution: Validate path params with Zod
const jobIdParamSchema = z.object({
  jobId: z.string().uuid()
})

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/v2/imports/{jobId}',
    request: {
      params: jobIdParamSchema
    },
    // ... responses
  }),
  async (c) => {
    const { jobId } = c.req.valid('param')
    // jobId is validated UUID
  }
)
```

#### Feature Flag Implementation

```typescript
// src/config.ts
export interface OpenAPIConfig {
  enableValidation: boolean      // Feature flag toggle
  strictMode: boolean             // Fail on validation errors vs log-only
  logValidationErrors: boolean    // Log validation failures
}

export function getOpenAPIConfig(env: Env): OpenAPIConfig {
  return {
    enableValidation: env.ENABLE_OPENAPI_VALIDATION === 'true',
    strictMode: env.OPENAPI_STRICT_MODE === 'true',
    logValidationErrors: true
  }
}

// Usage in handlers
const config = getOpenAPIConfig(c.env)
if (config.enableValidation) {
  // Zod validation enabled
} else {
  // Fall back to manual validation
}
```

#### Testing Strategy

**Unit Tests**
- Zod schema validation tests (valid/invalid inputs)
- Request/response contract tests
- Error handling coverage

**Integration Tests**
- Full request lifecycle with validation
- Multipart form upload tests
- SSE stream tests
- iOS app mock API tests

**Performance Tests**
```typescript
// Benchmark Zod overhead
describe('Zod Validation Performance', () => {
  it('should validate book schema in <5ms p95', async () => {
    const book = generateMockBook()
    const iterations = 1000
    const times = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      BookSchema.parse(book)
      times.push(performance.now() - start)
    }

    const p95 = calculatePercentile(times, 0.95)
    expect(p95).toBeLessThan(5)
  })
})
```

#### Success Criteria
- All 6 V2 routes migrated
- OpenAPI spec validates against OpenAPI 3.1
- Response times within 5% of baseline
- 100% test coverage for schemas
- iOS app integration tests pass

#### Deliverables
- V2 API fully on @hono/zod-openapi
- Feature flag implementation
- Comprehensive test suite
- Performance benchmarks

---

### Phase 3: V1 Core Search (Week 6-7)

#### Objectives
- Migrate 5 V1 search endpoints
- Reuse schemas from Phase 2
- Maintain backward compatibility
- Validate performance parity

#### Routes to Migrate

**3.1 Search Routes**
- `GET /v1/search/isbn` (ISBN lookup)
- `GET /v1/search/title` (title search)
- `GET /v1/search/advanced` (title + author search)
- `GET /v1/search/similar` (Vectorize similarity)
- `GET /v1/search/semantic` (natural language search)

#### Schema Reuse

```typescript
// Leverage existing schemas
import { BookSchema } from '../schemas/book'

// Add pagination schemas
const PaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
})

// Search result schemas
const SearchResultSchema = z.object({
  books: z.array(BookSchema),
  totalResults: z.number(),
  query: z.string()
})

// Advanced search schema
const AdvancedSearchQuerySchema = z.object({
  title: z.string().max(200).optional(),
  author: z.string().max(200).optional()
}).refine(
  (data) => data.title || data.author,
  'At least one search parameter required'
)
```

#### Backward Compatibility

**Strategy:** Zod validation adds type safety without changing response format

```typescript
// Before (manual validation)
app.get('/v1/search/isbn', async (c) => {
  const isbn = c.req.query('isbn')
  if (!isbn || !isbnRegex.test(isbn)) {
    return createErrorResponse(...)
  }
  // ...
})

// After (@hono/zod-openapi)
app.openapi(
  createRoute({
    request: {
      query: z.object({
        isbn: z.string().regex(isbnRegex)
      })
    },
    // ...
  }),
  async (c) => {
    const { isbn } = c.req.valid('query')  // Already validated
    // ...
  }
)
```

#### Success Criteria
- 5 search routes migrated
- Legacy `/search/*` routes remain on old system (deprecated, sunset March 2026)
- Performance parity with manual validation
- No response format changes
- Test coverage maintained

#### Deliverables
- V1 search on OpenAPI
- Pagination schemas
- Search result schemas
- Performance comparison report

---

### Phase 4: Job Management & Batch Operations (Week 8-9)

#### Objectives
- Migrate 9 job and batch endpoints
- Add Bearer token authentication schemas
- Implement WebSocket route documentation
- Validate circuit breaker error responses

#### Routes to Migrate

**4.1 Job Status Endpoints**
- `GET /v1/jobs/:jobId/status` (job status polling)
- `GET /v1/jobs/:jobId/results` (unified results endpoint)
- `DELETE /v1/jobs/:jobId` (cancel job + cleanup, requires Bearer auth)

**4.2 Batch Operations**
- `POST /v1/enrichment/batch` (batch book enrichment)
- `POST /api/batch-scan` (bookshelf photo scan)
- `POST /api/scan-bookshelf/batch` (alias for batch-scan)

**4.3 Legacy Job Endpoints (for backward compatibility)**
- `GET /v1/scan/results/:jobId`
- `GET /v1/csv/status/:jobId`
- `GET /v1/csv/results/:jobId`

#### Authentication Schemas

```typescript
// src/schemas/auth.ts
export const BearerAuthSchema = z.object({
  authorization: z.string().regex(/^Bearer [a-f0-9-]{36}$/)
})

// Usage in routes
app.openapi(
  createRoute({
    method: 'delete',
    path: '/v1/jobs/{jobId}',
    security: [
      { bearerAuth: [] }
    ],
    request: {
      headers: BearerAuthSchema,
      params: z.object({
        jobId: z.string().uuid()
      })
    },
    responses: {
      200: { /* success */ },
      401: {
        description: 'Unauthorized - missing or invalid Bearer token',
        content: {
          'application/json': { schema: ErrorResponseSchema }
        }
      }
    }
  }),
  async (c) => {
    const { jobId } = c.req.valid('param')
    const { authorization } = c.req.valid('header')
    // Token already validated by Zod
  }
)

// OpenAPI security schemes definition
app.doc('/doc/openapi.json', {
  // ...
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token authentication required for job cancellation (v3.2)'
      }
    }
  }
})
```

#### WebSocket Routes

**Challenge:** OpenAPI 3.1 doesn't natively support WebSocket protocol

**Solution:** Document as HTTP upgrade with custom extension

```typescript
// src/schemas/websocket.ts
app.openapi(
  createRoute({
    method: 'get',
    path: '/ws/progress',
    request: {
      query: z.object({
        jobId: z.string().uuid(),
        token: z.string().uuid()
      })
    },
    responses: {
      101: {
        description: 'Switching Protocols (WebSocket upgrade)',
        headers: z.object({
          'Upgrade': z.literal('websocket'),
          'Connection': z.literal('Upgrade')
        })
      },
      400: {
        description: 'Invalid WebSocket upgrade',
        content: { 'application/json': { schema: ErrorResponseSchema } }
      }
    },
    'x-websocket': {
      protocol: 'progress-updates',
      messageTypes: [
        { type: 'ready', description: 'Client ready signal' },
        { type: 'progress', description: 'Job progress update' },
        { type: 'completed', description: 'Job completed' },
        { type: 'failed', description: 'Job failed' }
      ]
    }
  }),
  async (c) => {
    // WebSocket upgrade handler
  }
)
```

#### Circuit Breaker Error Schemas

```typescript
// src/schemas/errors.ts
export const CircuitBreakerErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('CIRCUIT_OPEN'),
    message: z.string(),
    provider: z.enum(['google-books', 'open-library', 'isbndb']),
    retryable: z.literal(true),
    retryAfterMs: z.number().min(0),
    details: z.object({
      failureCount: z.number(),
      lastFailureTime: z.string().datetime()
    }).optional()
  })
})
```

#### Success Criteria
- All 9 job management routes migrated
- Bearer token validation via Zod
- OpenAPI security schemes documented
- WebSocket routes documented (even if non-standard)
- Circuit breaker errors properly typed

#### Deliverables
- Async job system on OpenAPI
- Authentication schemas
- WebSocket documentation approach
- Circuit breaker error types

---

### Phase 5: Capabilities Endpoint Auto-Generation (Week 10)

#### Objectives
- Replace hardcoded capabilities.ts with generated version
- Derive features from OpenAPI registry at runtime
- Eliminate manual maintenance
- Validate iOS app compatibility

#### Implementation

**5.1 OpenAPI Registry Introspection**

```typescript
// src/handlers/v2/capabilities-generated.ts
import { app } from '../../router'
import type { Env } from '../../types/env'

export async function handleCapabilitiesGenerated(
  request: Request,
  env: Env
): Promise<Response> {
  const openAPIDoc = app.getOpenAPIDocument()

  // Transform OpenAPI paths to capabilities format
  const features = deriveFeatures(openAPIDoc.paths, env)
  const limits = deriveLimits(env)
  const deprecations = deriveDeprecations(openAPIDoc.paths)

  return createSuccessResponse({
    apiVersion: openAPIDoc.info.version,
    features,
    limits,
    deprecations
  }, {
    timestamp: new Date().toISOString(),
    source: 'capabilities-generated'
  })
}

interface Feature {
  name: string
  enabled: boolean
  version: string
  endpoints: string[]
  rateLimit?: { requests: number; windowMs: number }
  notes?: string
}

function deriveFeatures(paths: any, env: Env): Feature[] {
  const featureMap = new Map<string, Feature>()

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, spec] of Object.entries(methods as any)) {
      const tag = spec.tags?.[0]
      const featureName = spec['x-feature'] || tag?.toLowerCase()
      const rateLimit = spec['x-rateLimit']

      if (!featureName) continue

      // Get or create feature
      let feature = featureMap.get(featureName)
      if (!feature) {
        feature = {
          name: featureName,
          enabled: checkFeatureEnabled(featureName, env),
          version: spec['x-version'] || '1.0.0',
          endpoints: [],
          rateLimit,
          notes: spec['x-notes']
        }
        featureMap.set(featureName, feature)
      }

      // Add endpoint
      feature.endpoints.push(`${method.toUpperCase()} ${path}`)

      // Merge rate limits (take most restrictive)
      if (rateLimit && feature.rateLimit) {
        feature.rateLimit.requests = Math.min(
          feature.rateLimit.requests,
          rateLimit.requests
        )
      }
    }
  }

  return Array.from(featureMap.values())
}

function checkFeatureEnabled(featureName: string, env: Env): boolean {
  // Check environment bindings to determine if feature is available
  switch (featureName) {
    case 'semantic_search':
    case 'weekly_recommendations':
      return !!(env as any).BOOK_VECTORS && !!env.AI
    case 'async_enrichment':
      return !!(env as any).ENRICHMENT_QUEUE
    default:
      return true
  }
}

function deriveLimits(env: Env) {
  return {
    maxBatchSize: 50,
    maxCsvRows: 5000,
    maxImageSizeMb: parseInt(env.MAX_IMAGE_SIZE_MB || '10', 10),
    maxConcurrentJobs: 3
  }
}

function deriveDeprecations(paths: any) {
  const deprecations = []

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, spec] of Object.entries(methods as any)) {
      if (spec.deprecated) {
        deprecations.push({
          endpoint: `${method.toUpperCase()} ${path}`,
          sunsetDate: spec['x-sunset-date'] || '2026-03-01',
          replacement: spec['x-replacement'] || 'See documentation'
        })
      }
    }
  }

  return deprecations
}
```

**5.2 Custom OpenAPI Extensions**

Add custom `x-*` fields to route definitions for capabilities metadata:

```typescript
// Example route with custom extensions
app.openapi(
  createRoute({
    method: 'get',
    path: '/api/v2/search',
    tags: ['Search'],
    'x-feature': 'text_search',              // Feature name
    'x-version': '2.0.0',                     // Feature version
    'x-rateLimit': {                          // Rate limit config
      requests: 100,
      windowMs: 60000
    },
    'x-notes': 'Powered by Google Books API', // Human-readable notes
    // ... rest of route definition
  }),
  handler
)

// Deprecated route with sunset metadata
app.openapi(
  createRoute({
    method: 'get',
    path: '/search/title',
    deprecated: true,
    'x-sunset-date': '2026-03-01',
    'x-replacement': 'GET /v1/search/title',
    // ... rest of route definition
  }),
  handler
)
```

**5.3 Migration Strategy**

```typescript
// Phase 5.1: Dual implementation
// Keep old capabilities.ts, add new capabilities-generated.ts
// Use feature flag to switch between them

app.get('/api/v2/capabilities', async (c) => {
  const useGenerated = c.env.USE_GENERATED_CAPABILITIES === 'true'

  if (useGenerated) {
    return handleCapabilitiesGenerated(c.req.raw, c.env)
  } else {
    return handleCapabilities(c.req.raw, c.env)  // Old implementation
  }
})

// Phase 5.2: A/B test (10% traffic to generated)
// Phase 5.3: Validate responses match
// Phase 5.4: Switch to 100% generated
// Phase 5.5: Remove old capabilities.ts
```

#### Success Criteria
- Capabilities endpoint reflects actual routes (no manual maintenance)
- Feature flags derived from environment bindings
- Rate limits from OpenAPI extensions
- Deprecations from OpenAPI metadata
- Response format matches old implementation (backward compatible)
- iOS app integration tests pass

#### Deliverables
- Self-documenting capabilities endpoint
- Custom OpenAPI extensions documented
- Migration completed from old capabilities.ts
- Validation tests (old vs generated responses)

---

### Phase 6: Deprecation & Cleanup (Week 11-12)

#### Objectives
- Document legacy routes (no migration)
- Create separate OpenAPI spec for internal/admin routes
- Archive old manual OpenAPI YAML
- Update all documentation
- Final validation and polish

#### Tasks

**6.1 Legacy Routes Documentation**

Leave `/search/*` routes on manual validation (sunset March 1, 2026):
- `GET /search/title` → `GET /v1/search/title`
- `GET /search/isbn` → `GET /v1/search/isbn`
- `GET /search/author` → `GET /v1/search/advanced`
- `POST /search/advanced` → `GET /v1/search/advanced`

**Strategy:** Document in OpenAPI with deprecation flags, but don't migrate code

```typescript
// Minimal OpenAPI documentation for legacy routes
app.openapi(
  createRoute({
    method: 'get',
    path: '/search/title',
    deprecated: true,
    'x-sunset-date': '2026-03-01',
    'x-replacement': 'GET /v1/search/title',
    responses: {
      200: {
        description: 'DEPRECATED - Use /v1/search/title instead',
        headers: z.object({
          'Deprecation': z.literal('true'),
          'Sunset': z.literal('Sat, 1 Mar 2026 00:00:00 GMT')
        })
      }
    }
  }),
  handler  // Keep existing handler, no changes
)
```

**6.2 Internal/Admin Routes**

Create separate OpenAPI spec for internal endpoints:

```typescript
// src/openapi/internal.ts
import { OpenAPIHono } from '@hono/zod-openapi'

const internalApp = new OpenAPIHono()

// Internal routes (not public API)
const internalRoutes = [
  'GET /admin/harvest-dashboard',
  'GET /api/cache/metrics',
  'GET /api/cache/stats',
  'GET /api/cache/dashboard',
  'GET /api/cache/health',
  'GET /api/cache/alerts'
]

// Document separately, accessible only from internal origin
internalApp.doc('/internal/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'BooksTrack Internal API',
    version: '1.0.0',
    description: 'Internal monitoring and admin endpoints'
  }
})
```

**6.3 Documentation Updates**

**Archive old files:**
```bash
mkdir -p docs/archive/
mv docs/openapi.yaml docs/archive/openapi-legacy-2025-11-27.yaml
```

**Update README.md:**
```markdown
## API Documentation

**Production API:** https://api.oooefam.net
**Interactive Docs:** https://api.oooefam.net/doc (Swagger UI)
**OpenAPI Spec:** https://api.oooefam.net/doc/openapi.json

### Auto-Generated Documentation

This API uses [@hono/zod-openapi](https://hono.dev/snippets/zod-openapi) for automatic OpenAPI spec generation.

**Key Benefits:**
- Always up-to-date (generated from code)
- Type-safe request/response validation
- Auto-generated client SDKs
- Interactive API explorer at /doc

**Legacy Documentation:**
- See `docs/archive/` for historical OpenAPI YAML files
```

**Update docs/API_CONTRACT.md:**
```markdown
# BooksTrack API Contract

**PRIMARY SOURCE:** OpenAPI 3.1 Spec (auto-generated)
- **Canonical spec:** https://api.oooefam.net/doc/openapi.json
- **Interactive docs:** https://api.oooefam.net/doc

This document provides human-readable context and examples.
For machine-readable contract, always refer to the OpenAPI spec.

## Migration Notice (Nov 2025)

The BooksTrack API now uses auto-generated OpenAPI documentation.
The previous manual YAML spec has been archived.

**What changed:**
- OpenAPI spec is now generated from TypeScript code
- Capabilities endpoint is auto-generated
- No more manual documentation drift

**What stayed the same:**
- All response formats (backward compatible)
- All endpoint paths
- Authentication mechanisms
```

**6.4 CI/CD Integration**

Add OpenAPI spec validation to CI pipeline:

```yaml
# .github/workflows/openapi-validation.yml
name: OpenAPI Validation

on: [push, pull_request]

jobs:
  validate-spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      # Generate OpenAPI spec
      - name: Generate OpenAPI spec
        run: |
          npm ci
          npm run generate-openapi

      # Validate with Spectral
      - name: Validate OpenAPI spec
        run: |
          npm install -g @stoplight/spectral-cli
          spectral lint docs/openapi.json

      # Check for breaking changes
      - name: Detect breaking changes
        if: github.event_name == 'pull_request'
        run: |
          npm install -g openapi-diff
          openapi-diff ${{ github.base_ref }} ${{ github.head_ref }}
```

**6.5 Client SDK Generation**

Document SDK generation for clients:

```bash
# TypeScript SDK
npx openapi-typescript https://api.oooefam.net/doc/openapi.json -o src/api-types.ts

# Swift SDK (for iOS)
brew install openapi-generator
openapi-generator generate \
  -i https://api.oooefam.net/doc/openapi.json \
  -g swift5 \
  -o BooksTrackAPI

# Python SDK
openapi-generator generate \
  -i https://api.oooefam.net/doc/openapi.json \
  -g python \
  -o bookstrack-python-sdk
```

#### Success Criteria
- Single generated OpenAPI spec for public API (21+ routes)
- Separate spec for internal APIs (6+ routes)
- Legacy routes documented but not migrated
- All documentation updated
- CI/CD validates OpenAPI spec
- Client SDK generation documented

#### Deliverables
- Complete migration finished
- Documentation updated
- Old YAML archived
- CI/CD pipeline updated
- SDK generation guide

---

## Rollback Plan

### Rollback Triggers

**Automatically rollback if:**
- Error rate increase > 1% (compared to baseline)
- P95 latency regression > 10%
- iOS app integration failures
- Schema validation blocking valid requests

**Consider rollback if:**
- Cold start time increases > 20%
- Memory usage increases > 15%
- Customer complaints about API errors

### Rollback Procedures

#### Level 1: Feature Flag Rollback (< 1 minute)

```bash
# Disable OpenAPI validation via Workers secret
wrangler secret put ENABLE_OPENAPI_VALIDATION
# Enter: false

# Verification
curl https://api.oooefam.net/health | jq '.data.features.openapi_validation'
# Should return: false or null
```

**Impact:** Immediate reversion to manual validation
**Risk:** None (feature flag designed for this)

#### Level 2: Code Rollback (< 5 minutes)

```bash
# Identify last known good deployment
wrangler deployments list

# Rollback to previous version
wrangler rollback --message "Rolling back OpenAPI migration due to [reason]"

# Verify rollback
curl https://api.oooefam.net/health
```

**Impact:** Full reversion to pre-migration code
**Risk:** Low (tested rollback procedure)

#### Level 3: Gradual Traffic Shift (A/B Testing)

```typescript
// Route traffic based on percentage
const OPENAPI_TRAFFIC_PERCENTAGE = 10  // Start with 10%

app.use('*', async (c, next) => {
  const random = Math.random() * 100
  const useOpenAPI = random < OPENAPI_TRAFFIC_PERCENTAGE

  c.set('useOpenAPI', useOpenAPI)
  return await next()
})

// In route handler
if (c.get('useOpenAPI')) {
  // New OpenAPI route
} else {
  // Old manual validation route
}
```

**Rollout Plan:**
- Day 1: 10% traffic to OpenAPI routes
- Day 3: 25% traffic (if metrics look good)
- Day 5: 50% traffic
- Day 7: 100% traffic
- Rollback to 0% if issues arise

**Monitoring:**
```bash
# Watch error rates
wrangler tail --format=json | jq 'select(.outcome == "exception")'

# Watch latency
wrangler tail --format=json | jq '.performance.responseTime'
```

### Rollback Communication

**Internal notification (Slack):**
```
🔴 ROLLBACK: OpenAPI migration Phase X
Reason: [Specific issue]
Action: [Feature flag disabled / Code rollback]
Impact: [None expected / User-facing]
ETA: Service restored in <5 minutes
```

**External communication (if needed):**
```
We've temporarily reverted a recent API update to ensure service stability.
No action required on your end. API functionality is unchanged.
```

---

## Testing Strategy

### Unit Tests

**Schema Validation Tests**
```typescript
// tests/schemas/book.test.ts
import { describe, it, expect } from 'vitest'
import { BookSchema } from '../src/schemas/book'

describe('BookSchema', () => {
  it('should validate valid book object', () => {
    const validBook = {
      isbn: '9780439708180',
      title: 'Harry Potter',
      authors: ['J.K. Rowling'],
      publisher: 'Scholastic',
      publishedDate: '1998-09-01'
    }

    expect(() => BookSchema.parse(validBook)).not.toThrow()
  })

  it('should reject invalid ISBN', () => {
    const invalidBook = {
      isbn: '123',  // Too short
      title: 'Test',
      authors: []
    }

    expect(() => BookSchema.parse(invalidBook)).toThrow()
  })

  it('should handle optional fields', () => {
    const minimalBook = {
      isbn: '9780439708180',
      title: 'Test',
      authors: ['Author']
    }

    const result = BookSchema.parse(minimalBook)
    expect(result.publisher).toBeUndefined()
  })
})
```

**Request/Response Contract Tests**
```typescript
// tests/contracts/search.test.ts
describe('ISBN Search Contract', () => {
  it('should return ResponseEnvelope format', async () => {
    const response = await app.request('/v1/search/isbn?isbn=9780439708180')
    const data = await response.json()

    // Validate response shape
    expect(data).toHaveProperty('success', true)
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('metadata')

    // Validate book data
    expect(data.data).toHaveProperty('isbn')
    expect(data.data).toHaveProperty('title')
    expect(data.data.authors).toBeInstanceOf(Array)
  })

  it('should return ErrorResponse for invalid ISBN', async () => {
    const response = await app.request('/v1/search/isbn?isbn=invalid')
    const data = await response.json()

    expect(data).toHaveProperty('success', false)
    expect(data).toHaveProperty('error')
    expect(data.error).toHaveProperty('code', 'INVALID_ISBN')
  })
})
```

**Error Handling Coverage**
```typescript
describe('Circuit Breaker Errors', () => {
  it('should return CIRCUIT_OPEN error', async () => {
    // Mock circuit breaker in OPEN state
    mockCircuitBreaker('google-books', 'OPEN')

    const response = await app.request('/v1/search/isbn?isbn=9780439708180')
    const data = await response.json()

    expect(data.success).toBe(false)
    expect(data.error.code).toBe('CIRCUIT_OPEN')
    expect(data.error.provider).toBe('google-books')
    expect(data.error.retryAfterMs).toBeGreaterThan(0)
  })
})
```

### Integration Tests

**Full Request Lifecycle**
```typescript
describe('CSV Import Integration', () => {
  it('should handle full import workflow', async () => {
    // 1. Upload CSV
    const formData = new FormData()
    formData.append('file', csvFile)

    const initResponse = await app.request('/api/v2/imports', {
      method: 'POST',
      body: formData
    })
    const { jobId, authToken, sseUrl } = await initResponse.json()

    expect(jobId).toMatch(/^[a-f0-9-]{36}$/)
    expect(sseUrl).toBe(`/api/v2/imports/${jobId}/stream`)

    // 2. Poll status
    const statusResponse = await app.request(`/api/v2/imports/${jobId}`)
    const status = await statusResponse.json()

    expect(status.data.status).toMatch(/initialized|processing/)

    // 3. Get results (after completion)
    await waitForCompletion(jobId)

    const resultsResponse = await app.request(`/api/v2/imports/${jobId}/results`)
    const results = await resultsResponse.json()

    expect(results.data).toHaveProperty('booksCreated')
    expect(results.data).toHaveProperty('enrichmentSucceeded')
  })
})
```

**Multipart Form Tests**
```typescript
describe('Multipart Form Validation', () => {
  it('should validate CSV file upload', async () => {
    const formData = new FormData()
    formData.append('file', new File([''], 'test.csv', { type: 'text/csv' }))

    const response = await app.request('/api/v2/imports', {
      method: 'POST',
      body: formData
    })

    expect(response.status).toBe(202)
  })

  it('should reject non-CSV files', async () => {
    const formData = new FormData()
    formData.append('file', new File([''], 'test.txt', { type: 'text/plain' }))

    const response = await app.request('/api/v2/imports', {
      method: 'POST',
      body: formData
    })

    expect(response.status).toBe(400)
  })
})
```

**SSE Stream Tests**
```typescript
describe('SSE Progress Stream', () => {
  it('should stream job progress events', async () => {
    const jobId = await createTestJob()

    const stream = await app.request(`/api/v2/imports/${jobId}/stream`)
    const reader = stream.body.getReader()

    const events = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const event = parseSSEEvent(value)
      events.push(event)
    }

    expect(events).toContainEqual({ type: 'initialized' })
    expect(events).toContainEqual({ type: 'processing' })
    expect(events).toContainEqual({ type: 'completed' })
  })
})
```

### Performance Tests

**Zod Validation Overhead**
```typescript
describe('Zod Validation Performance', () => {
  it('should validate BookSchema in <5ms p95', async () => {
    const book = generateMockBook()
    const iterations = 1000
    const times = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      BookSchema.parse(book)
      times.push(performance.now() - start)
    }

    const p50 = calculatePercentile(times, 0.50)
    const p95 = calculatePercentile(times, 0.95)
    const p99 = calculatePercentile(times, 0.99)

    expect(p50).toBeLessThan(2)
    expect(p95).toBeLessThan(5)
    expect(p99).toBeLessThan(10)
  })
})
```

**Load Testing**
```bash
# Use k6 for load testing
npm install -g k6

# test-openapi-load.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 RPS
    { duration: '5m', target: 1000 },  // Sustained 1000 RPS
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p95<500', 'p99<1000'],
    'http_req_failed': ['rate<0.01']
  }
}

export default function() {
  const res = http.get('https://api.oooefam.net/v1/search/isbn?isbn=9780439708180')
  check(res, {
    'status 200': (r) => r.status === 200,
    'has book data': (r) => JSON.parse(r.body).data.title
  })
}

# Run load test
k6 run test-openapi-load.js
```

**Cold Start Impact**
```typescript
describe('Cold Start Performance', () => {
  it('should measure Zod import overhead', async () => {
    // Measure time to import Zod schemas
    const start = performance.now()
    await import('../src/schemas')
    const duration = performance.now() - start

    // Zod schemas should add <50ms to cold start
    expect(duration).toBeLessThan(50)
  })
})
```

### Contract Tests

**OpenAPI Spec Validation**
```bash
# Install Spectral (OpenAPI linter)
npm install -g @stoplight/spectral-cli

# Create .spectral.yaml ruleset
extends: spectral:oas
rules:
  operation-description: error
  operation-tags: error
  operation-operationId: error

# Validate generated spec
spectral lint docs/openapi.json
```

**Breaking Change Detection**
```bash
# Install openapi-diff
npm install -g openapi-diff

# Compare current spec with previous version
openapi-diff \
  https://api.oooefam.net/doc/openapi.json \
  docs/archive/openapi-legacy-2025-11-27.yaml \
  --format markdown \
  > docs/OPENAPI_DIFF.md

# Fail CI if breaking changes detected
if grep -q "BREAKING" docs/OPENAPI_DIFF.md; then
  echo "❌ Breaking changes detected!"
  exit 1
fi
```

**iOS App Mock Tests**
```typescript
// iOS team provides mock API expectations
import { iosApiExpectations } from './ios-mocks'

describe('iOS App Compatibility', () => {
  it('should match iOS CSV import expectations', async () => {
    const formData = new FormData()
    formData.append('file', mockCSVFile)

    const response = await app.request('/api/v2/imports', {
      method: 'POST',
      body: formData
    })

    const actual = await response.json()
    const expected = iosApiExpectations.csvImportInit

    // Validate exact structure iOS app expects
    expect(actual).toMatchObject(expected)
  })
})
```

---

## Success Metrics

### Technical Metrics

**Performance (must maintain):**
- P50 latency: <100ms (baseline: 85ms)
- P95 latency: <500ms (baseline: 450ms)
- P99 latency: <1000ms (baseline: 900ms)
- Cold start: <200ms (baseline: 150ms)
- Zod validation overhead: <5ms p95

**Reliability (must maintain):**
- Error rate: <0.5% (baseline: 0.2%)
- Availability: >99.9% (no change)
- Circuit breaker effectiveness: >95% (no change)

**Type Safety (new metrics):**
- OpenAPI spec validity: 100% (validates against OpenAPI 3.1)
- Schema coverage: 100% (all request/response types)
- Compile-time validation: 100% (TypeScript strict mode)

**Documentation (new metrics):**
- OpenAPI paths documented: 21+ routes (up from 20)
- Capabilities accuracy: 100% (auto-generated, can't drift)
- Swagger UI availability: 100% uptime

### Developer Experience Metrics

**Before Migration:**
- Manual OpenAPI updates: ~2 hours per endpoint
- Documentation drift incidents: 4+ per quarter
- Client integration issues: ~3 per month (outdated specs)
- Onboarding time: ~2 days (read manual docs)

**After Migration:**
- OpenAPI updates: 0 hours (auto-generated)
- Documentation drift: 0 (impossible to drift)
- Client integration issues: <1 per month (accurate specs)
- Onboarding time: <1 day (interactive Swagger UI)

**New Capabilities:**
- Auto-generated client SDKs: TypeScript, Swift, Python
- Interactive API explorer: /doc endpoint
- Breaking change detection: CI/CD pipeline
- Contract testing: Automated in CI

### Operational Metrics

**Support Tickets (expected reduction):**
- "API docs are wrong": -100% (auto-generated)
- "Endpoint doesn't match spec": -100% (validated)
- "What features are available?": -50% (capabilities endpoint)

**Developer Productivity (expected improvement):**
- Time to add new endpoint: -30% (schema-first design)
- Time to debug API issues: -40% (Swagger UI testing)
- Time to onboard new client: -50% (SDK generation)

**Code Quality (expected improvement):**
- Type safety: +100% (Zod validation)
- Test coverage: +20% (schema tests)
- Runtime validation bugs: -80% (Zod catches at request time)

---

## Timeline

### Phase Overview

| Phase | Duration | Routes | Key Deliverable |
|-------|----------|--------|-----------------|
| Phase 1: Foundation | Week 1-2 | 1 (POC) | Working OpenAPI setup |
| Phase 2: V2 API | Week 3-5 | 6 | V2 fully migrated |
| Phase 3: V1 Search | Week 6-7 | 5 | Search on OpenAPI |
| Phase 4: Jobs/Batch | Week 8-9 | 9 | Async ops migrated |
| Phase 5: Capabilities | Week 10 | 0 | Auto-generated endpoint |
| Phase 6: Cleanup | Week 11-12 | 0 | Documentation complete |
| **TOTAL** | **12 weeks** | **21 routes** | **Production-ready** |

**Remaining 38 routes:** Legacy (4), Internal (8), Infrastructure (3), Low-priority (23)

### Detailed Schedule

**Week 1-2: Foundation & POC**
- Day 1-2: Install dependencies, create project structure
- Day 3-5: Implement core schema library (ResponseEnvelope, Book, Job)
- Day 6-7: Migrate /api/v2/capabilities as POC
- Day 8-9: Performance benchmarks, validation
- Day 10: Decision: Proceed or iterate

**Week 3-5: V2 API Migration**
- Day 11-13: Migrate search endpoints (v2/search, recommendations)
- Day 14-16: Migrate enrichment endpoint (v2/books/enrich)
- Day 17-20: Migrate CSV import system (4 endpoints)
- Day 21-23: Feature flag implementation, A/B testing
- Day 24-25: iOS app integration tests

**Week 6-7: V1 Search Migration**
- Day 26-27: Migrate ISBN + title search
- Day 28-29: Migrate advanced search
- Day 30-31: Migrate similar + semantic search
- Day 32-35: Testing, performance validation

**Week 8-9: Jobs/Batch Migration**
- Day 36-38: Migrate job status endpoints (3 routes)
- Day 39-42: Migrate batch operations (3 routes)
- Day 43-44: Migrate legacy job endpoints (3 routes)
- Day 45-49: Bearer auth schemas, WebSocket docs, testing

**Week 10: Auto-Generated Capabilities**
- Day 50-52: Implement capabilities-generated.ts
- Day 53-54: Add custom OpenAPI extensions
- Day 55-56: A/B test old vs generated
- Day 57: Switch to 100% generated

**Week 11-12: Cleanup & Documentation**
- Day 58-60: Document legacy routes (no migration)
- Day 61-63: Create internal API spec
- Day 64-66: Update all documentation
- Day 67-69: CI/CD integration
- Day 70-71: Final validation and polish
- Day 72: Migration complete!

### Milestones

**Milestone 1 (Week 2):** POC validated, proceed decision made
**Milestone 2 (Week 5):** V2 API complete, feature flag live
**Milestone 3 (Week 7):** V1 Search complete, performance validated
**Milestone 4 (Week 9):** Jobs/Batch complete, auth schemas done
**Milestone 5 (Week 10):** Capabilities auto-generated
**Milestone 6 (Week 12):** Migration complete, docs updated

---

## Risk Assessment

### High Risk Items

**Risk 1: Zod Validation Performance Overhead**
- **Impact:** HIGH (affects all requests)
- **Likelihood:** MEDIUM
- **Mitigation:**
  - Benchmark Zod overhead in Phase 1 POC
  - Feature flag for gradual rollout
  - Cache parsed schemas (Zod caches internally)
  - Use `.passthrough()` for non-critical fields
- **Contingency:** Rollback via feature flag if >5% latency regression

**Risk 2: iOS App Breaking Changes**
- **Impact:** CRITICAL (blocks iOS users)
- **Likelihood:** LOW (backward compatibility enforced)
- **Mitigation:**
  - Contract tests with iOS mock expectations
  - Feature flag for A/B testing
  - iOS team reviews Phase 2 before proceeding
  - OpenAPI diff validation in CI
- **Contingency:** Immediate rollback, iOS team notified

**Risk 3: Multipart Form Data Handling**
- **Impact:** MEDIUM (affects CSV import, photo scan)
- **Likelihood:** MEDIUM (complex use case)
- **Mitigation:**
  - Test multipart handling in Phase 1 POC
  - Extensive integration tests
  - Monitor file upload success rates
- **Contingency:** Keep manual validation for multipart endpoints

### Medium Risk Items

**Risk 4: SSE Stream Documentation**
- **Impact:** MEDIUM (affects real-time progress)
- **Likelihood:** LOW (OpenAPI supports text/event-stream)
- **Mitigation:**
  - Document as text/event-stream content type
  - Skip response validation for SSE
  - Add custom x-sse extension for docs
- **Contingency:** Document SSE separately if OpenAPI insufficient

**Risk 5: WebSocket Route Documentation**
- **Impact:** MEDIUM (affects real-time updates)
- **Likelihood:** MEDIUM (OpenAPI 3.1 doesn't support WebSocket natively)
- **Mitigation:**
  - Document as HTTP 101 Upgrade
  - Custom x-websocket extension
  - Separate WebSocket docs if needed
- **Contingency:** Keep WebSocket docs in markdown

**Risk 6: Legacy Route Migration Effort**
- **Impact:** LOW (deprecated routes, sunset March 2026)
- **Likelihood:** HIGH (59 routes, only migrating 21)
- **Mitigation:**
  - Explicitly scope out legacy routes
  - Document but don't migrate
  - Remove after sunset date
- **Contingency:** None needed (intentional decision)

### Low Risk Items

**Risk 7: Custom OpenAPI Extensions**
- **Impact:** LOW (affects capabilities auto-generation)
- **Likelihood:** LOW (OpenAPI allows x-* extensions)
- **Mitigation:**
  - Document custom extensions
  - Validate with Spectral
- **Contingency:** Fallback to notes field

**Risk 8: CI/CD Pipeline Integration**
- **Impact:** LOW (affects developer workflow)
- **Likelihood:** LOW (standard tooling)
- **Mitigation:**
  - Use well-tested tools (Spectral, openapi-diff)
  - Test locally before CI integration
- **Contingency:** Run validation manually if CI fails

**Risk 9: Client SDK Generation**
- **Impact:** LOW (nice-to-have feature)
- **Likelihood:** MEDIUM (openapi-generator quirks)
- **Mitigation:**
  - Test SDK generation early
  - Document manual fixes if needed
- **Contingency:** Manual API client code if SDKs don't generate well

### Risk Matrix

```
         Impact
       L   M   H   C
     ┌───┬───┬───┬───┐
  L  │ 7 │ 4 │   │   │
     ├───┼───┼───┼───┤
  M  │ 6 │ 3 │ 1 │   │
     ├───┼───┼───┼───┤
  H  │   │ 5 │   │ 2 │
     ├───┼───┼───┼───┤
  C  │   │   │   │   │
     └───┴───┴───┴───┘
   Likelihood

Legend:
  1. Zod validation overhead
  2. iOS app breaking changes
  3. Multipart form handling
  4. SSE stream documentation
  5. WebSocket documentation
  6. Legacy route scope
  7. Custom extensions
```

---

## Open Questions

### For Stakeholder Review

**1. Route Prioritization**
- **Question:** Should we migrate all 59 routes or stop at 21 critical routes?
- **Options:**
  - A) Stop at 21 (public API only)
  - B) Add internal routes (29 total)
  - C) Migrate everything except legacy (55 total)
- **Recommendation:** Option A (21 critical routes)
- **Rationale:** Internal routes don't benefit from OpenAPI docs, legacy routes are sunset soon

**2. Performance Budget**
- **Question:** What latency regression is acceptable for validation?
- **Options:**
  - A) 0% (strict, may require optimization)
  - B) <5% (reasonable, expected for validation)
  - C) <10% (permissive, may degrade UX)
- **Recommendation:** Option B (<5% p95 latency increase)
- **Rationale:** Zod validation typically adds <5ms, worth the type safety

**3. iOS App Testing Timeline**
- **Question:** When can iOS team test schema validation against their app?
- **Options:**
  - A) Week 3 (after Phase 1 POC)
  - B) Week 5 (after Phase 2 V2 API)
  - C) Week 12 (final validation)
- **Recommendation:** Option B (Week 5, after V2 API migration)
- **Rationale:** V2 API is newest, cleanest contracts to validate first

**4. Legacy Route Migration**
- **Question:** Migrate deprecated routes or leave until sunset?
- **Options:**
  - A) Migrate all (consistency)
  - B) Document only (minimize effort)
  - C) Remove now (aggressive cleanup)
- **Recommendation:** Option B (document only, no migration)
- **Rationale:** Sunset date is March 2026 (4 months), not worth migration effort

**5. Internal API Documentation**
- **Question:** Separate OpenAPI spec or single unified spec?
- **Options:**
  - A) Single spec (simpler)
  - B) Separate specs (security through obscurity)
  - C) No internal API docs (manual docs only)
- **Recommendation:** Option B (separate specs)
- **Rationale:** Internal endpoints shouldn't be in public API docs

---

## Recommended Next Steps

### Immediate Actions (This Week)

**1. Approve This Plan**
- Review open questions
- Address stakeholder concerns
- Finalize scope (21 routes vs more)

**2. Fix Immediate Lies (2 hours)**
- Remove ghost endpoint from openapi.yaml
- Fix capabilities.ts endpoint priorities
- Add missing endpoints to OpenAPI
- Commit and deploy fixes
- See `OPENAPI_AUDIT.md` for details

**3. Prepare for Phase 1 (1 day)**
- Create `OPENAPI_MIGRATION_PLAN.md` (this document)
- Create tracking issue/board
- Assign team members
- Schedule kickoff meeting

### Phase 1 Start (Next Week)

**4. Install Dependencies**
```bash
npm install @hono/zod-openapi zod
npm install -D @stoplight/spectral-cli openapi-diff
```

**5. Create Project Structure**
```bash
mkdir -p src/schemas src/openapi
touch src/schemas/{common,book,job,index}.ts
touch src/openapi/{config,extensions}.ts
```

**6. Implement POC**
- Migrate /api/v2/capabilities
- Validate Swagger UI renders
- Measure performance
- Decision: Proceed or iterate

### Success Criteria for Proceeding

**Phase 1 → Phase 2 decision criteria:**
- ✅ Swagger UI renders at /doc
- ✅ OpenAPI JSON validates
- ✅ Zod overhead <5ms p95
- ✅ Response format unchanged
- ✅ Team comfortable with approach

**If criteria met:** Proceed to Phase 2 (V2 API migration)
**If criteria not met:** Iterate on POC or reconsider approach

---

## Conclusion

This migration plan balances **pragmatism** (incremental, reversible) with **ambition** (single source of truth, type safety).

**Key Benefits:**
- Eliminates three sources of truth
- Auto-generated OpenAPI spec (can't drift)
- Type-safe request/response validation
- Interactive API docs at /doc
- Auto-generated client SDKs
- Zero manual OpenAPI maintenance

**Key Safeguards:**
- Incremental 6-phase rollout
- Feature flags for safe rollback
- Comprehensive testing strategy
- Performance budgets enforced
- iOS app compatibility validated

**Timeline:** 12 weeks to migrate 21 critical routes

**Next Steps:**
1. Approve plan (address open questions)
2. Fix immediate OpenAPI lies (2 hours)
3. Start Phase 1 POC (next week)

**Ready to execute when approved.**

---

**Document Version:** 1.0
**Last Updated:** November 27, 2025
**Authors:** Backend Team, Zen MCP Planner (Gemini 2.5 Pro)
**Status:** APPROVED - Ready for Phase 1
