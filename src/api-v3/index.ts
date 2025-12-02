/**
 * V3 API - Native @hono/zod-openapi Implementation
 *
 * Replaces Chanfana with native Hono OpenAPI support for better zod@4 compatibility
 *
 * Migration from Chanfana (Dec 2, 2025):
 * - Uses OpenAPIHono instead of fromHono()
 * - Uses createRoute() for route definitions
 * - Direct integration with @hono/zod-openapi (no wrapper needed)
 * - Full zod@4 support without version conflicts
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { Env } from '../types'
import { BookSchema, BookSearchResultsSchema } from './schemas/book'
import { createErrorResponse, ErrorCodes, createSuccessResponse } from '../utils/response-builder'
import { findBooksByTitle } from '../services/book-service'
import { normalizeTitle } from '../utils/normalization'
import { extractUniqueAuthors, removeAuthorsFromWorks, enrichAuthorsWithCulturalData } from '../utils/response-transformer'

// Constants for V3 API data transformation
const DEFAULT_PROVIDER_QUALITY = 95 // Default quality score for provider data

/**
 * Create and configure V3 OpenAPI router
 */
export function createV3Router() {
  const app = new OpenAPIHono<{ Bindings: Env }>()

  // IMPORTANT: Register specific routes BEFORE parameterized routes
  // /v3/books/search must come before /v3/books/:isbn to avoid path conflicts

  // ========================================================================
  // GET /v3/books/search - Search books by title (SPECIFIC ROUTE - FIRST!)
  // ========================================================================
  const searchBooksRoute = createRoute({
    method: 'get',
    path: '/v3/books/search',
    tags: ['Books'],
    summary: 'Search books by title',
    description: 'Search for books by title with pagination. Returns up to 100 results.',
    request: {
      query: z.object({
        q: z.string()
          .min(1)
          .max(200)
          .describe('Search query (e.g., "Harry Potter")')
          .openapi({
            param: { name: 'q', in: 'query' },
            example: 'Harry Potter'
          }),
        page: z.coerce.number()
          .int()
          .min(1)
          .default(1)
          .optional()
          .describe('Page number (default: 1)')
          .openapi({
            param: { name: 'page', in: 'query' },
            example: 1
          }),
        limit: z.coerce.number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .optional()
          .describe('Results per page (default: 20, max: 100)')
          .openapi({
            param: { name: 'limit', in: 'query' },
            example: 20
          })
      })
    },
    responses: {
      200: {
        description: 'Search results',
        content: {
          'application/json': {
            schema: BookSearchResultsSchema
          }
        }
      },
      400: {
        description: 'Invalid query',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      },
      500: {
        description: 'Server error',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      }
    }
  })

  app.openapi(searchBooksRoute, async (c) => {
    const startTime = Date.now()
    const { q, page = 1, limit = 20 } = c.req.valid('query')

    console.log(`[V3 Search] Query: "${q}", page: ${page}, limit: ${limit}`)

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
            page,
            limit
          },
          metadata: {
            cached: false,
            timestamp: new Date().toISOString(),
            query: q
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

      const duration = Date.now() - startTime
      console.log(`[V3 Search] Found ${books.length} books in ${duration}ms`)

      return c.json({
        success: true,
        data: {
          books,
          total: books.length,
          page,
          limit
        },
        metadata: {
          cached: false,
          timestamp: new Date().toISOString(),
          query: q
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Search] Error:`, error)

      return c.json(
        createErrorResponse(
          error.message || 'Internal server error',
          500,
          ErrorCodes.INTERNAL_ERROR,
          {},
          c.req.raw
        ),
        500
      )
    }
  })

  // ========================================================================
  // POST /v3/books/enrich - Enrich book metadata (SPECIFIC ROUTE - SECOND!)
  // ========================================================================
  const enrichBookRoute = createRoute({
    method: 'post',
    path: '/v3/books/enrich',
    tags: ['Books'],
    summary: 'Enrich book metadata',
    description: 'Enrich book metadata by ISBN with optional embedding generation',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              isbn: z.string()
                .regex(/^\d{10}(\d{3})?$/, 'Must be 10 or 13 digit ISBN')
                .describe('10 or 13 digit ISBN')
                .openapi({ example: '9780439708180' }),
              includeEmbedding: z.boolean()
                .optional()
                .default(false)
                .describe('Generate semantic embedding for search')
                .openapi({ example: false })
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Book enriched successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              data: BookSchema.extend({
                vectorized: z.boolean().describe('Whether embedding was generated')
              }),
              metadata: z.object({
                source: z.string(),
                cached: z.boolean(),
                timestamp: z.string()
              })
            })
          }
        }
      },
      400: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      },
      404: {
        description: 'Book not found',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      },
      500: {
        description: 'Server error',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      }
    }
  })

  app.openapi(enrichBookRoute, async (c) => {
    const { isbn, includeEmbedding = false } = c.req.valid('json')

    console.log(`[V3 Enrich] ISBN: ${isbn}, includeEmbedding: ${includeEmbedding}`)

    try {
      // Import enrichment services
      const { enrichMultipleBooks } = await import('../services/enrichment')
      const { generateBookEmbedding, storeEmbedding } = await import('../services/embedding-service')

      // Check cache first
      const cacheKey = `book:isbn:${isbn}`
      const cached = await c.env.CACHE.get(cacheKey, 'json') as any

      if (cached && (!includeEmbedding || cached.vectorized)) {
        console.log(`[V3 Enrich] Cache hit for ${isbn}`)
        return c.json({
          success: true,
          data: cached,
          metadata: {
            source: 'kv-cache',
            cached: true,
            timestamp: new Date().toISOString()
          }
        }, 200)
      }

      // Fetch from external APIs
      const result = await enrichMultipleBooks(
        { isbn },
        c.env,
        { maxResults: 1 },
        c.executionCtx
      )

      if (!result || !result.works || result.works.length === 0) {
        return c.json(
          createErrorResponse(
            'Book not found',
            404,
            ErrorCodes.NOT_FOUND,
            { isbn },
            c.req.raw
          ),
          404
        )
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
          console.warn(`[V3 Enrich] Embedding generation failed:`, embError)
          // Continue without embedding
        }
      }

      // Cache the result
      await c.env.CACHE.put(cacheKey, JSON.stringify(book), {
        expirationTtl: 86400 // 24 hours
      })

      console.log(`[V3 Enrich] Enriched ${isbn} successfully`)

      return c.json({
        success: true,
        data: book,
        metadata: {
          source: work.primaryProvider || 'external',
          cached: false,
          timestamp: new Date().toISOString()
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Enrich] Error:`, error)

      return c.json(
        createErrorResponse(
          error.message || 'Internal server error',
          500,
          ErrorCodes.INTERNAL_ERROR,
          {},
          c.req.raw
        ),
        500
      )
    }
  })

  // ========================================================================
  // GET /v3/books/:isbn - Get book by ISBN (PARAMETERIZED ROUTE - LAST!)
  // ========================================================================
  const getBookByISBNRoute = createRoute({
    method: 'get',
    path: '/v3/books/:isbn',
    tags: ['Books'],
    summary: 'Get book by ISBN',
    description: 'Retrieves book metadata from Alexandria → Google Books → ISBNdb chain with circuit breaker protection',
    request: {
      params: z.object({
        isbn: z.string()
          .regex(/^\d{10}(\d{3})?$/, 'Must be 10 or 13 digit ISBN')
          .openapi({
            param: { name: 'isbn', in: 'path' },
            example: '9780439708180'
          })
      })
    },
    responses: {
      200: {
        description: 'Book found',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              data: BookSchema,
              metadata: z.object({
                source: z.string(),
                cached: z.boolean(),
                timestamp: z.string()
              })
            })
          }
        }
      },
      404: {
        description: 'Book not found',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      },
      500: {
        description: 'Server error',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              error: z.object({
                code: z.string(),
                message: z.string()
              })
            })
          }
        }
      }
    }
  })

  app.openapi(getBookByISBNRoute, async (c) => {
    const startTime = Date.now()
    const { isbn } = c.req.valid('param')

    console.log(`[V3 Books] GET /v3/books/${isbn}`)

    try {
      // Import book service from existing service layer
      const { findBookByISBN } = await import('../services/book-service')

      // Call service with correct signature: (isbn, env, ctx)
      const enrichmentResult = await findBookByISBN(isbn, c.env, c.executionCtx)

      // Check if we got any results
      if (!enrichmentResult || !enrichmentResult.works || enrichmentResult.works.length === 0) {
        console.warn(`[V3 Books] Book not found: ${isbn}`)
        return c.json(
          createErrorResponse(
            'Book not found',
            404,
            ErrorCodes.NOT_FOUND,
            {},
            c.req.raw
          ),
          404
        )
      }

      const duration = Date.now() - startTime
      console.log(`[V3 Books] Book found in ${duration}ms via ${enrichmentResult.source}`)

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
        provider: 'alexandria', // All books are served through Alexandria (BooksTrack's unified API)
        quality: DEFAULT_PROVIDER_QUALITY,
      }

      // Wrap in success response
      return c.json({
        success: true,
        data: book,
        metadata: {
          source: enrichmentResult.source || 'external',
          cached: enrichmentResult.cached || false,
          timestamp: new Date().toISOString()
        }
      }, 200)

    } catch (error: any) {
      console.error(`[V3 Books] Error:`, error)

      // Circuit breaker errors
      if (error.code === 'CIRCUIT_OPEN') {
        return c.json(
          createErrorResponse(
            'Service temporarily unavailable',
            503,
            ErrorCodes.CIRCUIT_OPEN,
            { retryAfterMs: 60000 },
            c.req.raw
          ),
          503
        )
      }

      return c.json(
        createErrorResponse(
          error.message || 'Internal server error',
          500,
          ErrorCodes.INTERNAL_ERROR,
          {},
          c.req.raw
        ),
        500
      )
    }
  })

  // OpenAPI documentation endpoints
  app.doc('/v3/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'BooksTrack V3 API',
      version: '3.0.0',
      description: 'Native Hono OpenAPI implementation with full zod@4 support'
    }
  })

  // Swagger UI
  app.get('/v3/docs', swaggerUI({ url: '/v3/openapi.json' }))

  console.log('[V3 API] Native @hono/zod-openapi router created')
  console.log('[V3 API] Routes: GET /v3/books/search, POST /v3/books/enrich, GET /v3/books/:isbn')
  console.log('[V3 API] Documentation: /v3/docs')
  console.log('[V3 API] OpenAPI JSON: /v3/openapi.json')

  return app
}
