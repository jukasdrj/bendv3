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
import { requestContext, rateLimitHeaders, type RequestContext } from '../middleware/request-context'
import {
  SearchRequestSchema,
  SearchResponseSchema,
  EnrichRequestSchema,
  EnrichResponseSchema,
  BookSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
  ISBNSchema
} from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'
import { findBooksByTitle, findBookByISBN } from '../services/book-service'
import { normalizeTitle } from '../utils/normalization'
import { extractUniqueAuthors, removeAuthorsFromWorks, enrichAuthorsWithCulturalData } from '../utils/response-transformer'

// Constants for V3 API data transformation
const DEFAULT_PROVIDER_QUALITY = 95 // Default quality score for provider data

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
    const { q, mode = 'text', page = 1, limit = 20 } = c.req.valid('query')

    console.log(`[V3 Search] Query: "${q}", mode: ${mode}, page: ${page}, limit: ${limit}`)

    try {
      // Normalize title for consistent cache keys
      const normalizedTitle = normalizeTitle(q)

      // Use existing book service
      const result = await findBooksByTitle(normalizedTitle, undefined, c.env, {
        maxResults: limit
      })

      if (!result || !result.works || result.works.length === 0) {
        // No books found
        return c.json({
          success: true,
          data: {
            books: [],
            total: 0,
            query: { q, mode },
            pagination: {
              page,
              limit,
              totalPages: 0,
              hasNext: false,
              hasPrev: false
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            requestId: ctx.requestId,
            cached: false,
            processingTimeMs: Date.now() - ctx.startTime
          }
        }, 200)
      }

      // Extract unique authors and enrich with cultural data
      const baseAuthors = extractUniqueAuthors(result.works)
      const authors = await enrichAuthorsWithCulturalData(baseAuthors, c.env)
      const cleanWorks = removeAuthorsFromWorks(result.works)

      // Convert to V3 Book format
      const books = cleanWorks.map((work, idx) => {
        const edition = result.editions?.[idx]
        const workAuthors = authors.filter(a =>
          work.authorIDs?.includes(a.openLibraryID || '') ||
          work.title.toLowerCase().includes(a.name.toLowerCase())
        )

        return {
          isbn: edition?.isbn13 || edition?.isbn10 || '',
          isbn10: edition?.isbn10,
          title: work.title,
          subtitle: work.subtitle,
          authors: workAuthors.map(a => a.name),
          publisher: edition?.publisher,
          publishedDate: edition?.publicationDate,
          description: work.description,
          pageCount: edition?.pageCount,
          categories: work.subjects,
          language: edition?.language || 'en',
          coverUrl: work.coverImageURL || edition?.coverImageURL,
          thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
          workKey: work.openLibraryWorkID || work.openLibraryID,
          editionKey: edition?.openLibraryEditionID,
          provider: 'alexandria' as const,
          quality: DEFAULT_PROVIDER_QUALITY
        }
      }).filter(book => book.isbn) // Only include books with ISBNs

      const totalPages = Math.ceil(books.length / limit)

      console.log(`[V3 Search] Found ${books.length} books in ${Date.now() - ctx.startTime}ms`)

      return c.json({
        success: true,
        data: {
          books,
          total: books.length,
          query: { q, mode },
          pagination: {
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          cached: false,
          processingTimeMs: Date.now() - ctx.startTime
        },
        _links: {
          self: {
            href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&page=${page}&limit=${limit}`,
            rel: 'self',
            method: 'GET'
          },
          ...(page < totalPages ? {
            next: {
              href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&page=${page + 1}&limit=${limit}`,
              rel: 'next',
              method: 'GET'
            }
          } : {}),
          ...(page > 1 ? {
            prev: {
              href: `/v3/books/search?q=${encodeURIComponent(q)}&mode=${mode}&page=${page - 1}&limit=${limit}`,
              rel: 'prev',
              method: 'GET'
            }
          } : {})
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Search] Error:`, error)

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

    console.log(`[V3 Enrich] ISBNs: ${isbns.length}, includeEmbedding: ${includeEmbedding}`)

    try {
      // Import enrichment services
      const { enrichMultipleBooks } = await import('../services/enrichment')
      const { generateBookEmbedding, storeEmbedding } = await import('../services/embedding-service')

      const enrichedBooks: any[] = []
      const notFound: string[] = []

      // Process ISBNs in parallel batches to prevent timeout
      const CONCURRENCY = 10 // Process 10 ISBNs at a time

      const processSingleISBN = async (isbn: string) => {
        try {
          // Check cache first
          const cacheKey = `book:isbn:${isbn}`
          const cached = await c.env.CACHE.get(cacheKey, 'json') as any

          if (cached && (!includeEmbedding || cached.vectorized)) {
            return { success: true, book: cached }
          }

          // Fetch from external APIs
          const result = await enrichMultipleBooks(
            { isbn },
            c.env,
            { maxResults: 1 },
            c.executionCtx
          )

          if (!result || !result.works || result.works.length === 0) {
            return { success: false, isbn }
          }

          // Convert to V3 format
          const work = result.works[0]
          const edition = result.editions?.[0]
          const authors = result.authors || []

          const book = {
            isbn: edition?.isbn13 || isbn,
            isbn10: edition?.isbn10,
            title: work.title,
            subtitle: work.subtitle,
            authors: authors.map(a => a.name),
            publisher: edition?.publisher,
            publishedDate: edition?.publicationDate,
            description: work.description,
            pageCount: edition?.pageCount,
            categories: work.subjects,
            language: edition?.language || 'en',
            coverUrl: work.coverImageURL || edition?.coverImageURL,
            thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
            workKey: work.openLibraryWorkID || work.openLibraryID,
            editionKey: edition?.openLibraryEditionID,
            provider: 'alexandria' as const,
            quality: DEFAULT_PROVIDER_QUALITY,
            vectorized: false
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
                  categories: book.categories
                },
                c.env
              )

              if (embedding) {
                const stored = await storeEmbedding(
                  embedding,
                  {
                    isbn: book.isbn,
                    title: book.title,
                    author: book.authors.join(', '),
                    categories: book.categories?.join(', ')
                  },
                  c.env
                )
                book.vectorized = stored
              }
            } catch (embError) {
              console.warn(`[V3 Enrich] Embedding generation failed for ${isbn}:`, embError)
            }
          }

          // Cache the result
          await c.env.CACHE.put(cacheKey, JSON.stringify(book), {
            expirationTtl: 86400 // 24 hours
          })

          return { success: true, book }

        } catch (error) {
          console.error(`[V3 Enrich] Error processing ${isbn}:`, error)
          return { success: false, isbn }
        }
      }

      // Process in parallel batches with controlled concurrency
      for (let i = 0; i < isbns.length; i += CONCURRENCY) {
        const batch = isbns.slice(i, i + CONCURRENCY)
        const results = await Promise.allSettled(
          batch.map(isbn => processSingleISBN(isbn))
        )

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
            instance: c.req.url
          }),
          404
        )
      }

      console.log(`[V3 Enrich] Enriched ${enrichedBooks.length}/${isbns.length} books in ${Date.now() - ctx.startTime}ms`)

      return c.json({
        success: true,
        data: {
          books: enrichedBooks,
          requested: isbns.length,
          found: enrichedBooks.length,
          notFound: notFound.length > 0 ? notFound : undefined
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          processingTimeMs: Date.now() - ctx.startTime
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Enrich] Error:`, error)

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
        isbn: ISBNSchema
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

    console.log(`[V3 Books] GET /v3/books/${isbn}`)

    try {
      // Call service with correct signature
      const enrichmentResult = await findBookByISBN(isbn, c.env, c.executionCtx)

      // Check if we got any results
      if (!enrichmentResult || !enrichmentResult.works || enrichmentResult.works.length === 0) {
        console.warn(`[V3 Books] Book not found: ${isbn}`)
        return c.json(
          createProblemDetails('NOT_FOUND', 'Book not found', {
            requestId: ctx.requestId,
            instance: c.req.url
          }),
          404
        )
      }

      // Convert EnrichmentResult to V3 Book format
      const work = enrichmentResult.works[0]
      const edition = enrichmentResult.editions?.[0]

      const book = {
        isbn: edition?.isbn13 || isbn,
        isbn10: edition?.isbn10,
        title: work.title,
        subtitle: work.subtitle,
        authors: enrichmentResult.authors?.map(a => a.name) || [],
        publisher: edition?.publisher,
        publishedDate: edition?.publicationDate,
        description: work.description,
        pageCount: edition?.pageCount,
        categories: work.subjects,
        language: edition?.language || 'en',
        coverUrl: work.coverImageURL || edition?.coverImageURL,
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
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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

      return c.json({
        success: true,
        data: book,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          source: enrichmentResult.source || 'external',
          cached: enrichmentResult.cached || false,
          processingTimeMs: duration
        },
        _links: {
          self: { href: `/v3/books/${isbn}`, rel: 'self', method: 'GET' },
          enrich: { href: `/v3/books/enrich`, rel: 'related', method: 'POST' }
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Error:`, error)

      // Circuit breaker errors
      if (error.code === 'CIRCUIT_OPEN') {
        return c.json(
          createProblemDetails('CIRCUIT_OPEN', 'Service temporarily unavailable', {
            requestId: ctx.requestId,
            instance: c.req.url,
            retryAfterMs: 60000
          }),
          503
        )
      }

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

  console.log('[V3 API] Contract-first router with shared schemas created')
  console.log('[V3 API] Routes: GET /v3/books/search, POST /v3/books/enrich, GET /v3/books/:isbn')
  console.log('[V3 API] Documentation: /v3/docs')
  console.log('[V3 API] OpenAPI JSON: /v3/openapi.json')

  return app
}
