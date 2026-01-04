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

import {
  BookSchema,
  type EnrichedBook,
  EnrichRequestSchema,
  EnrichResponseSchema,
  ErrorResponseSchema,
  ISBNSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  SuccessResponseSchema,
} from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'
import { swaggerUI } from '@hono/swagger-ui'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { type RequestContext, requestContext } from '../middleware/request-context'
import { findBookByISBN, findBooksByTitle } from '../services/book-service'
import { generateBookEmbedding, storeEmbedding } from '../services/embedding-service'
// Note: extractUniqueAuthors, removeAuthorsFromWorks, enrichAuthorsWithCulturalData removed
// Alexandria now returns per-work embedded authors array, no client-side matching needed
import { enrichMultipleBooks } from '../services/enrichment'
import type { Env } from '../types/env'
import { isValidEnrichedBookCacheEntry } from '../utils/validation/book-validation'
import { normalizeTitle } from '../utils/transform/normalization'
import { registerDiscoveryRoutes } from './discovery'
import {
  buildStreamUrl,
  createJobLinks,
  generateAuthToken,
  getJobStateManagerDO,
  getWebSocketConnectionDO,
} from './jobs/common'
import { registerEnrichmentRoutes } from './jobs/enrichment'
import { registerImportRoutes } from './jobs/imports'
import { registerScanRoutes } from './jobs/scans'
import { registerAlexandriaWebhookRoutes } from './webhooks/alexandria'

// Constants for V3 API data transformation
const DEFAULT_PROVIDER_QUALITY = 95 // Default quality score for provider data

export function createV3Router() {
  const app = new OpenAPIHono<{
    Bindings: Env
    Variables: { ctx: RequestContext }
  }>({
    // Transform Zod validation errors to RFC 9457 Problem Details format
    defaultHook: (result, c) => {
      if (!result.success) {
        const ctx = c.get('ctx')
        const zodError = result.error

        // Extract field-level errors from Zod issues (RFC 9457 format)
        const errors = zodError.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }))

        // Return RFC 9457 Problem Details response
        return c.json(
          createProblemDetails('INVALID_REQUEST', 'Validation failed', {
            requestId: ctx?.requestId,
            instance: c.req.url,
            errors,
          }),
          400,
        )
      }
    },
  })

  // Initialize OpenAPI metadata BEFORE defining routes
  // This is required for getOpenAPIDocument() to work properly
  // Note: We don't provide a path here - the endpoint is created in parent router
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
  })

  // Apply request context middleware to all routes
  app.use('*', requestContext)

  // ========================================================================
  // Discovery Routes (Capabilities, Recommendations)
  // ========================================================================
  registerDiscoveryRoutes(app)

  // ========================================================================
  // Job Management Routes
  // ========================================================================
  registerImportRoutes(app)
  registerScanRoutes(app)
  registerEnrichmentRoutes(app)
  registerAlexandriaWebhookRoutes(app)

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
      query: SearchRequestSchema,
    },
    responses: {
      200: {
        description: 'Search results',
        content: { 'application/json': { schema: SearchResponseSchema } },
        headers: {
          'X-Request-ID': { schema: { type: 'string' }, description: 'Correlation ID' },
          'X-Response-Time': { schema: { type: 'string' }, description: 'Response time' },
        },
      },
      400: {
        description: 'Invalid request (RFC 9457 Problem Details)',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
      429: {
        description: 'Rate limit exceeded',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait' },
          'X-RateLimit-Limit': { schema: { type: 'integer' } },
          'X-RateLimit-Remaining': { schema: { type: 'integer' } },
          'X-RateLimit-Reset': { schema: { type: 'integer' } },
        },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
    },
  })

  app.openapi(searchRoute, async (c) => {
    const ctx = c.get('ctx')
    const { q, mode = 'text', page = 1, limit = 20 } = c.req.valid('query')

    console.log(`[V3 Search] Query: "${q}", mode: ${mode}, page: ${page}, limit: ${limit}`)

    try {
      // Get configurable max search results from env (default: 100)
      const maxSearchResults = Number.parseInt(c.env.V3_MAX_SEARCH_RESULTS || '100', 10)

      // Normalize title for consistent cache keys
      const normalizedTitle = normalizeTitle(q)

      // Fetch results from Alexandria (no server-side pagination support yet)
      // LIMITATION: Client-side pagination limited to first maxSearchResults
      // For queries with >maxSearchResults results, only first N are accessible
      const result = await findBooksByTitle(normalizedTitle, undefined, c.env, {
        maxResults: maxSearchResults,
      })

      if (!result || !result.works || result.works.length === 0) {
        // No books found - iOS-compatible response format
        const offset = (page - 1) * limit
        return c.json(
          {
            success: true,
            data: {
              results: [],
              totalCount: 0,
              query: { q, mode, limit, offset },
            },
            metadata: {
              timestamp: new Date().toISOString(),
              requestId: ctx.requestId,
              cached: false,
              processingTime: Date.now() - ctx.startTime,
            },
            error: null,
          },
          200,
        )
      }

      // Convert results to V3 Book format
      // Alexandria now returns per-work embedded authors array
      const allBooks = result.works
        .map((work: any, idx: number) => {
          const edition = result.editions?.[idx]

          // Use embedded authors from Alexandria (per-work array)
          // Falls back to result-level authors for backward compatibility
          const workAuthors = work.authors || result.authors || []

          return {
            isbn: edition?.isbn || edition?.isbns?.[0] || '',
            isbn10: undefined, // Not available in canonical EditionDTO
            title: work.title,
            subtitle: undefined, // Not available in canonical WorkDTO
            authors: workAuthors.map((a: any) => a.name),
            publisher: edition?.publisher,
            publishedDate: edition?.publicationDate,
            description: work.description,
            pageCount: edition?.pageCount,
            categories: work.subjectTags, // Fixed: use subjectTags instead of subjects
            language: edition?.language || 'en',
            coverUrl: work.coverImageURL || edition?.coverImageURL,
            coverSource: work.coverSource || edition?.coverSource || undefined,
            thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
            workKey: work.openLibraryWorkID || work.openLibraryID,
            editionKey: edition?.openLibraryEditionID,
            provider: 'alexandria' as const,
            quality: DEFAULT_PROVIDER_QUALITY,
          }
        })
        .filter((book) => book.isbn) // Only include books with ISBNs

      // Calculate true pagination from ALL results (limited to MAX_SEARCH_RESULTS)
      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit) || 0

      // Client-side pagination: slice the results for the requested page
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      // Calculate offset for iOS-compatible response
      const offset = (page - 1) * limit

      console.log(
        `[V3 Search] Found ${totalResults} total books, returning page ${page} (offset ${offset}, ${paginatedBooks.length} books) in ${Date.now() - ctx.startTime}ms`,
      )

      // iOS-compatible response format with results/totalCount/query.offset
      return c.json(
        {
          success: true,
          data: {
            results: paginatedBooks,
            totalCount: totalResults,
            query: { q, mode, limit, offset },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            cached: false,
            processingTime: Date.now() - ctx.startTime,
          },
          error: null,
          _links: {
            self: {
              href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&limit=${limit}&offset=${offset}`,
              rel: 'self',
              method: 'GET',
            },
            ...(page < totalPages
              ? {
                  next: {
                    href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&limit=${limit}&offset=${offset + limit}`,
                    rel: 'next',
                    method: 'GET',
                  },
                }
              : {}),
            ...(offset > 0
              ? {
                  prev: {
                    href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&limit=${limit}&offset=${Math.max(0, offset - limit)}`,
                    rel: 'prev',
                    method: 'GET',
                  },
                }
              : {}),
          },
        },
        200,
      )
    } catch (error: any) {
      console.error(`[V3 Search] Error:`, error)

      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
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
          'application/json': { schema: EnrichRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Books enriched',
        content: { 'application/json': { schema: EnrichResponseSchema } },
      },
      400: {
        description: 'Invalid request',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'No books found',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
      429: {
        description: 'Rate limit exceeded',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
    },
  })

  app.openapi(enrichRoute, async (c) => {
    const ctx = c.get('ctx')
    const body = c.req.valid('json')

    // Handle both isbns and barcodes (iOS compatibility)
    const isbns = ('isbns' in body ? body.isbns : body.barcodes) as string[]
    const includeEmbedding = body.includeEmbedding ?? false
    const async = body.async ?? false

    console.log(
      `[V3 Enrich] ISBNs: ${isbns.length}, includeEmbedding: ${includeEmbedding}, async: ${async}`,
    )

    // ========================================================================
    // ASYNC MODE: Create background job and return immediately
    // ========================================================================
    if (async) {
      const jobId = crypto.randomUUID()
      const authToken = generateAuthToken()

      console.log(`[V3 Enrich Async] Creating job ${jobId} for ${isbns.length} ISBNs`)

      // Get JobStateManagerDO stub
      const doStub = getJobStateManagerDO(jobId, c.env)

      // Initialize job state
      await doStub.initializeJobState(jobId, 'enrichment', isbns.length)

      // Store auth token in WebSocketConnectionDO (handles SSE/WebSocket auth)
      const wsDoStub = getWebSocketConnectionDO(jobId, c.env)
      await wsDoStub.setAuthToken(authToken, 'enrichment')

      // Schedule enrichment processing via DO alarm
      c.executionCtx.waitUntil(doStub.scheduleEnrichment?.(isbns, includeEmbedding, jobId))

      const streamUrl = buildStreamUrl(c.req.url, 'enrichment', jobId)

      return c.json(
        {
          success: true,
          data: {
            jobId,
            status: 'queued' as const,
            streamUrl,
            token: authToken,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
          },
          _links: createJobLinks('enrichment', jobId, streamUrl),
        },
        202,
      )
    }

    // ========================================================================
    // STREAMING MODE: For large batches to prevent OOM and improve UX
    // ========================================================================
    const streamingThreshold = Number.parseInt(c.env.V3_ENRICH_STREAMING_THRESHOLD || '50', 10)

    if (isbns.length > streamingThreshold && !includeEmbedding) {
      // Import streaming utilities
      const { createStreamingResponse, createBookEnrichmentStream } = await import(
        '../utils/streaming-response'
      )

      console.log(`[V3 Enrich] Using streaming mode for ${isbns.length} ISBNs`)

      // Create the enrichment function for streaming
      const enrichFunction = async (isbn: string) => {
        try {
          // Use the same cache check logic as sync mode
          const cacheKey = `book:isbn:${isbn}`
          const cached = await c.env.CACHE.get<any>(cacheKey, 'json')

          // Validate cached data using shared utility
          if (cached && isValidEnrichedBookCacheEntry(cached)) {
            return { success: true, book: cached, isbn }
          }

          // Fetch from external APIs (using top-level import)
          const result = await enrichMultipleBooks(
            { isbn },
            c.env,
            { maxResults: 1 },
            c.executionCtx,
          )

          if (!result || !result.works || result.works.length === 0) {
            return { success: false, isbn, error: 'Book not found' }
          }

          // Convert to V3 format (same logic as sync mode)
          const work = result.works[0]!
          const edition = result.editions?.[0]
          const authors = result.authors || []

          const book = {
            isbn: edition?.isbn || isbn,
            title: work.title,
            authors: authors.map((a) => a.name),
            publisher: edition?.publisher,
            publishedDate: edition?.publicationDate,
            description: work.description,
            pageCount: edition?.pageCount,
            categories: work.subjectTags,
            language: edition?.language || 'en',
            coverUrl: work.coverImageURL || edition?.coverImageURL,
            coverSource: work.coverSource || edition?.coverSource || undefined,
            thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
            workKey: work.openLibraryWorkID || work.openLibraryID,
            editionKey: edition?.openLibraryEditionID,
            provider: 'alexandria' as const,
            quality: DEFAULT_PROVIDER_QUALITY,
            vectorized: false,
          }

          // Cache the result (24 hours TTL for consistency with sync enrichment)
          c.executionCtx.waitUntil(
            c.env.CACHE.put(cacheKey, JSON.stringify(book), { expirationTtl: 86400 }),
          )

          return { success: true, book, isbn }
        } catch (error: any) {
          console.error(`[V3 Enrich Stream] Error processing ${isbn}:`, error)
          return { success: false, isbn, error: error.message || 'Processing error' }
        }
      }

      // Create streaming generator
      const generator = () => createBookEnrichmentStream(isbns, enrichFunction, 25)

      // Return streaming response
      return createStreamingResponse(generator, {
        batchSize: 25,
        flushThreshold: 10,
        contentType: 'application/x-ndjson',
        headers: {
          'X-Request-ID': ctx.requestId,
          'X-Processing-Mode': 'streaming',
        },
      })
    }

    // ========================================================================
    // SYNC MODE: Existing behavior (unchanged)
    // ========================================================================

    try {
      const enrichedBooks: EnrichedBook[] = []
      const notFound: string[] = []

      // Process ISBNs in parallel batches to prevent timeout
      const concurrency = Number.parseInt(c.env.V3_ENRICH_CONCURRENCY || '50', 10)

      const processSingleISBN = async (isbn: string) => {
        try {
          // Check cache first
          const cacheKey = `book:isbn:${isbn}`
          const cached = await c.env.CACHE.get<EnrichedBook>(cacheKey, 'json')

          // Validate cached data has correct V3 structure (not stale nested format)
          if (
            cached &&
            isValidEnrichedBookCacheEntry(cached) &&
            (!includeEmbedding || cached.vectorized)
          ) {
            return { success: true, book: cached }
          }

          // If cache had invalid format, log and proactively delete stale entry
          if (cached && !isValidEnrichedBookCacheEntry(cached)) {
            console.warn(`[V3 Enrich] Stale cache format detected for ${isbn}, refreshing`)
            // Non-blocking deletion of stale cache entry
            c.executionCtx.waitUntil(c.env.CACHE.delete(cacheKey))
          }

          // Fetch from external APIs
          const result = await enrichMultipleBooks(
            { isbn },
            c.env,
            { maxResults: 1 },
            c.executionCtx,
          )

          if (!result || !result.works || result.works.length === 0) {
            return { success: false, isbn }
          }

          // Convert to V3 format
          // Safe: we already checked result.works.length > 0 above
          const work = result.works[0]!
          const edition = result.editions?.[0]
          const authors = result.authors || []

          const book = {
            isbn: edition?.isbn || isbn,
            isbn10: undefined, // Not available in canonical EditionDTO
            title: work.title,
            subtitle: undefined, // Not available in canonical WorkDTO
            authors: authors.map((a) => a.name),
            publisher: edition?.publisher,
            publishedDate: edition?.publicationDate,
            description: work.description,
            pageCount: edition?.pageCount,
            categories: work.subjectTags, // Fixed: use subjectTags instead of subjects
            language: edition?.language || 'en',
            coverUrl: work.coverImageURL || edition?.coverImageURL,
            coverSource: work.coverSource || edition?.coverSource || undefined,
            thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
            workKey: work.openLibraryWorkID || work.openLibraryID,
            editionKey: edition?.openLibraryEditionID,
            provider: 'alexandria' as const,
            quality: DEFAULT_PROVIDER_QUALITY,
            vectorized: false,
          }

          // Generate embedding if requested
          if (includeEmbedding && c.env.AI) {
            try {
              const embedding = await generateBookEmbedding(
                {
                  isbn: book.isbn,
                  title: book.title,
                  author: book.authors.join(', '),
                  description: book.description,
                  categories: book.categories,
                },
                c.env,
              )

              if (embedding) {
                const stored = await storeEmbedding(
                  embedding,
                  {
                    isbn: book.isbn,
                    title: book.title,
                    author: book.authors.join(', '),
                    categories: book.categories?.join(', '),
                  },
                  c.env,
                )
                book.vectorized = stored
              }
            } catch (embError) {
              console.warn(`[V3 Enrich] Embedding generation failed for ${isbn}:`, embError)
            }
          }

          // Cache the result
          await c.env.CACHE.put(cacheKey, JSON.stringify(book), {
            expirationTtl: 86400, // 24 hours
          })

          return { success: true, book }
        } catch (error) {
          console.error(`[V3 Enrich] Error processing ${isbn}:`, error)
          return { success: false, isbn }
        }
      }

      // Process in parallel batches with controlled concurrency
      for (let i = 0; i < isbns.length; i += concurrency) {
        const batch = isbns.slice(i, i + concurrency)
        const results = await Promise.allSettled(batch.map((isbn) => processSingleISBN(isbn)))

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            enrichedBooks.push(result.value.book)
          } else if (result.status === 'fulfilled' && !result.value.success) {
            notFound.push(result.value.isbn)
          } else if (result.status === 'rejected') {
            // Should not happen due to error handling in processSingleISBN
            console.error('[V3 Enrich] Unexpected rejection:', result.reason)
          }
        })
      }

      if (enrichedBooks.length === 0) {
        return c.json(
          createProblemDetails('NOT_FOUND', 'No books found for provided ISBNs', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      console.log(
        `[V3 Enrich] Enriched ${enrichedBooks.length}/${isbns.length} books in ${Date.now() - ctx.startTime}ms`,
      )

      return c.json(
        {
          success: true,
          data: {
            books: enrichedBooks,
            requested: isbns.length,
            found: enrichedBooks.length,
            notFound: notFound, // Always return array, even if empty (iOS requires non-optional)
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            processingTime: Date.now() - ctx.startTime,
          },
        },
        200,
      )
    } catch (error: any) {
      console.error(`[V3 Enrich] Error:`, error)

      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  // ========================================================================
  // 3. GET /v3/books/:isbn - Direct ISBN lookup
  // ========================================================================
  const getBookRoute = createRoute({
    method: 'get',
    path: '/v3/books/:isbn',
    tags: ['Books'],
    summary: 'Get book by ISBN',
    description:
      'Direct lookup by ISBN (fastest path for known ISBNs). Supports conditional requests with ETag.',
    request: {
      params: z.object({
        isbn: ISBNSchema,
      }),
      // Note: If-None-Match header is read directly via c.req.header('If-None-Match')
      // Removed headers validation - causes TypeError in @hono/zod-openapi when header is missing
    },
    responses: {
      200: {
        description: 'Book found',
        content: { 'application/json': { schema: SuccessResponseSchema(BookSchema) } },
        headers: {
          ETag: { schema: { type: 'string' }, description: 'Entity tag for caching' },
          'Cache-Control': { schema: { type: 'string' }, description: 'Caching directives' },
        },
      },
      304: {
        description: 'Not modified (ETag match)',
      },
      404: {
        description: 'Book not found',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: ErrorResponseSchema } },
      },
    },
  })

  app.openapi(getBookRoute, async (c) => {
    const ctx = c.get('ctx')
    // Use direct param access - c.req.valid('param') has type issues with @hono/zod-openapi
    const isbn = c.req.param('isbn') || ''
    const ifNoneMatch = c.req.header('If-None-Match')

    console.log(`[V3 Books] GET /v3/books/${isbn} - route matched, isbn param: "${isbn}"`)

    // Validate ISBN exists
    if (!isbn || isbn.trim() === '') {
      console.error('[V3 Books] ISBN param is empty')
      return c.json(
        createProblemDetails('MISSING_PARAMETER', 'ISBN parameter is required', {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        400,
      )
    }

    try {
      // Call service with correct signature
      const enrichmentResult = await findBookByISBN(isbn, c.env, c.executionCtx)

      // Check if we got any results
      if (!enrichmentResult || !enrichmentResult.works || enrichmentResult.works.length === 0) {
        console.warn(`[V3 Books] Book not found: ${isbn}`)
        return c.json(
          createProblemDetails('NOT_FOUND', 'Book not found', {
            requestId: ctx.requestId,
            instance: c.req.url,
          }),
          404,
        )
      }

      // Convert EnrichmentResult to V3 Book format
      // Safe: we already checked enrichmentResult.works.length > 0 above
      const work = enrichmentResult.works[0]!
      const edition = enrichmentResult.editions?.[0]

      const book = {
        isbn: edition?.isbn || isbn,
        isbn10: undefined, // Not available in canonical EditionDTO
        title: work.title,
        subtitle: undefined, // Not available in canonical WorkDTO
        authors: enrichmentResult.authors?.map((a) => a.name) || [],
        publisher: edition?.publisher,
        publishedDate: edition?.publicationDate,
        description: work.description,
        pageCount: edition?.pageCount,
        categories: work.subjectTags, // Fixed: use subjectTags instead of subjects
        language: edition?.language || 'en',
        coverUrl: work.coverImageURL || edition?.coverImageURL,
        coverSource: work.coverSource || edition?.coverSource || undefined,
        thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
        workKey: work.openLibraryWorkID || work.openLibraryID,
        editionKey: edition?.openLibraryEditionID,
        provider: 'alexandria' as const,
        quality: DEFAULT_PROVIDER_QUALITY,
      }

      // Generate content-based ETag using SHA-256 hash
      const bookJson = JSON.stringify(book)
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bookJson))
      const hashArray = Array.from(new Uint8Array(hash))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
      const etag = `"${isbn}-${hashHex.slice(0, 16)}"`

      // Check ETag match
      if (ifNoneMatch === etag) {
        return c.body(null, 304)
      }

      // Set caching headers
      c.header('ETag', etag)
      c.header('Cache-Control', 'public, max-age=3600') // 1 hour

      const duration = Date.now() - ctx.startTime
      console.log(`[V3 Books] Book found in ${duration}ms via ${enrichmentResult.source}`)

      return c.json(
        {
          success: true,
          data: book,
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            source: enrichmentResult.source || 'external',
            cached: enrichmentResult.cached || false,
            processingTime: duration,
          },
          _links: {
            self: { href: `/v3/books/${isbn}`, rel: 'self', method: 'GET' },
            enrich: { href: `/v3/books/enrich`, rel: 'related', method: 'POST' },
          },
        },
        200,
      )
    } catch (error: any) {
      console.error(`[V3 Books] Error:`, error)

      // Circuit breaker errors
      if (error.code === 'CIRCUIT_OPEN') {
        return c.json(
          createProblemDetails('CIRCUIT_OPEN', 'Service temporarily unavailable', {
            requestId: ctx.requestId,
            instance: c.req.url,
            retryAfterMs: 60000,
          }),
          503,
        )
      }

      return c.json(
        createProblemDetails('INTERNAL_ERROR', error.message, {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })

  // ========================================================================
  // OpenAPI Documentation with Security Schemes
  // ========================================================================
  // Note: OpenAPI JSON endpoint is handled in parent router (src/router.ts)
  // This is a workaround because .doc() doesn't work when OpenAPIHono is mounted as sub-app

  // Swagger UI
  app.get('/v3/docs', swaggerUI({ url: '/v3/openapi.json' }))

  console.log('[V3 API] Contract-first router with shared schemas created')
  console.log('[V3 API] Discovery Routes: GET /v3/capabilities, GET /v3/recommendations/weekly')
  console.log(
    '[V3 API] Book Routes: GET /v3/books/search, POST /v3/books/enrich, GET /v3/books/:isbn',
  )
  console.log(
    '[V3 API] Job Routes (Imports): POST /v3/jobs/imports, GET /v3/jobs/imports/:id, GET /v3/jobs/imports/:id/stream',
  )
  console.log(
    '[V3 API] Job Routes (Scans): POST /v3/jobs/scans, GET /v3/jobs/scans/:id, GET /v3/jobs/scans/:id/stream',
  )
  console.log('[V3 API] Documentation: /v3/docs')
  console.log('[V3 API] OpenAPI JSON: /v3/openapi.json')

  return app
}
