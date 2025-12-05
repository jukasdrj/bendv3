/**
 * OpenAPI Route Definitions: /v1/search/* endpoints
 *
 * Sprint 1, Day 3-4 - OpenAPI Fast Track Migration
 * Endpoints:
 * - GET /v1/search/isbn (Sprint 1, Day 3)
 * - GET /v1/search/title (Sprint 1, Day 4)
 *
 * @deprecated All V1 endpoints are deprecated and will be removed March 1, 2026.
 * Migrate to V3 API:
 * - /v1/search/isbn → /v3/books/:isbn
 * - /v1/search/title → /v3/books/search?q=title
 *
 * @see {@link /docs/V1_SUNSET_PLAN.md}
 * @sunset 2026-03-01
 */

import { createRoute } from '@hono/zod-openapi'
import {
  SearchISBNQuerySchema,
  SearchISBNSuccessResponseSchema,
  SearchISBNDataSchema,
  SearchTitleQuerySchema,
  SearchTitleSuccessResponseSchema,
  SearchTitleDataSchema,
  SearchResponseMetadataSchema
} from '../../schemas/search'
import { ErrorResponseSchema } from '../../schemas/common'

/**
 * GET /v1/search/isbn - Search by ISBN
 *
 * Searches for a book by ISBN-10 or ISBN-13.
 * Returns canonical book data including works, editions, and authors.
 *
 * **Data Flow:**
 * 1. Check BookRepository (KV/D1 cache)
 * 2. Query Google Books API (if cache miss)
 * 3. Fallback to OpenLibrary API
 * 4. Fallback to ISBNdb API
 * 5. Enrich authors with cultural data from Wikidata
 * 6. Cache result for 24 hours
 *
 * **Cache Behavior:**
 * - KV cache TTL: 24 hours
 * - D1 database: Permanent storage
 * - Cache key: `book:isbn:{normalized_isbn}`
 *
 * **Circuit Breaker:**
 * - Failures: 5 consecutive failures → OPEN
 * - Cooldown: 60 seconds
 * - Recovery: 2 successes → CLOSED
 */
export const searchISBNRoute = createRoute({
  method: 'get',
  path: '/v1/search/isbn',
  tags: ['Search', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Search for a book by ISBN - Use /v3/books/:isbn instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V3 API instead: \`GET /v3/books/:isbn\`
>
> **Migration:**
> - V1: \`GET /v1/search/isbn?isbn=9780439708180\`
> - V3: \`GET /v3/books/9780439708180\`

Search for a book by ISBN-10 or ISBN-13 (digits only, no hyphens).

Returns comprehensive book data including:
- Works: Abstract creative works (title, description, subjects)
- Editions: Physical/digital editions (publisher, publication date, format)
- Authors: Author biographical data (name, gender, cultural region)

**Example:** \`GET /v1/search/isbn?isbn=9780439708180\`

**Multi-Provider Orchestration:**
1. BookRepository (KV/D1 cache) - fastest
2. Google Books API - primary source
3. OpenLibrary API - fallback #1
4. ISBNdb API - fallback #2

**Cache TTL:** 24 hours (KV), permanent (D1)

**Rate Limits:**
- 100 requests/minute per IP
- 1000 requests/hour per IP

**Circuit Breaker Protection:**
All external providers are protected by circuit breakers.
If a provider's circuit is OPEN, the request fails fast with \`CIRCUIT_OPEN\` error.
  `,
  request: {
    query: SearchISBNQuerySchema
  },
  responses: {
    200: {
      description: 'Book found successfully',
      content: {
        'application/json': {
          schema: SearchISBNSuccessResponseSchema,
          example: {
            data: {
              works: [{
                title: "Harry Potter and the Philosopher's Stone",
                subjectTags: ["magic", "wizards", "fantasy"],
                firstPublicationYear: 1997,
                description: "Harry Potter has never even heard of Hogwarts...",
                coverImageURL: "https://covers.openlibrary.org/b/id/12345-L.jpg",
                primaryProvider: "google_books",
                goodreadsWorkIDs: ["OL82563W"],
                amazonASINs: ["B0192CTMYG"],
                librarythingIDs: [],
                googleBooksVolumeIDs: ["wrOQLV6xB-wC"],
                isbndbQuality: 95,
                reviewStatus: "verified",
                synthetic: false
              }],
              editions: [{
                isbns: ["9780439708180", "0439708184"],
                title: "Harry Potter and the Philosopher's Stone",
                publisher: "Scholastic Inc.",
                publicationDate: "1999-09-01",
                pageCount: 309,
                format: "paperback",
                coverImageURL: "https://covers.openlibrary.org/b/isbn/9780439708180-L.jpg",
                primaryProvider: "google_books",
                amazonASINs: ["0439708184"],
                googleBooksVolumeIDs: ["wrOQLV6xB-wC"],
                librarythingIDs: [],
                isbndbQuality: 95
              }],
              authors: [{
                name: "J.K. Rowling",
                gender: "female",
                culturalRegion: "europe",
                nationality: "British",
                birthYear: 1965,
                openLibraryID: "OL23919A",
                bookCount: 42
              }],
              resultCount: 1
            },
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z",
              processingTime: 145,
              provider: "google_books",
              cached: true
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid ISBN format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "INVALID_ISBN",
              message: "Invalid ISBN format. Must be valid ISBN-10 or ISBN-13",
              details: {
                isbn: "invalid-isbn"
              }
            }
          }
        }
      }
    },
    404: {
      description: 'Book not found',
      content: {
        'application/json': {
          schema: SearchISBNSuccessResponseSchema,
          example: {
            data: {
              works: [],
              editions: [],
              authors: [],
              resultCount: 0
            },
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z",
              processingTime: 523,
              provider: "none",
              cached: false
            }
          }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Rate limit exceeded. Maximum 100 requests per minute.",
              retryable: true,
              retryAfterMs: 60000
            }
          }
        }
      }
    },
    503: {
      description: 'Circuit breaker open - provider unavailable',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "CIRCUIT_OPEN",
              message: "Provider google-books circuit breaker is open. Service temporarily unavailable.",
              provider: "google-books",
              retryable: true,
              retryAfterMs: 45000
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "INTERNAL_ERROR",
              message: "An unexpected error occurred while processing the request"
            }
          }
        }
      }
    }
  }
})

/**
 * GET /v1/search/title - Search by Title
 *
 * Searches for books by title using multi-provider orchestration.
 * Returns up to 20 results by default (configurable via limit parameter).
 *
 * **Data Flow:**
 * 1. Normalize title for consistent cache keys
 * 2. Query primary provider (currently OpenLibrary for title searches)
 * 3. Extract unique authors from results
 * 4. Enrich authors with cultural data from Wikidata
 * 5. Return canonical response with works, editions, and authors
 *
 * **Cache Behavior:**
 * - Title searches are not cached (freshness is important for search results)
 * - Individual books found in results can be cached separately via ISBN lookups
 *
 * **Performance:**
 * - Typical response time: 800-1500ms (uncached)
 * - Author enrichment adds 200-400ms for large result sets
 * - Rate limited to 100 requests/minute per IP
 */
export const searchTitleRoute = createRoute({
  method: 'get',
  path: '/v1/search/title',
  tags: ['Search', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Search for books by title - Use /v3/books/search instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V3 API instead: \`GET /v3/books/search?q=title\`
>
> **Migration:**
> - V1: \`GET /v1/search/title?q=harry+potter\`
> - V3: \`GET /v3/books/search?q=harry+potter\`

Search for books by title using multi-provider orchestration.

Returns up to 20 results by default, each including:
- Works: Abstract creative works (title, description, subjects)
- Editions: Physical/digital editions (publisher, publication date, format)
- Authors: Author biographical data (name, gender, cultural region)

**Example:** \`GET /v1/search/title?q=harry%20potter&limit=10\`

**Multi-Provider Orchestration:**
1. OpenLibrary API - primary source for title searches
2. Author enrichment from Wikidata (cultural diversity data)
3. No caching (freshness important for search results)

**Query Parameters:**
- \`q\` (required): Search query string (1-200 characters)
- \`limit\` (optional): Maximum number of results (1-100, default: 20)

**Rate Limits:**
- 100 requests/minute per IP
- 1000 requests/hour per IP

**Author Enrichment:**
All author results are enriched with cultural and biographical data from Wikidata.
  `,
  request: {
    query: SearchTitleQuerySchema
  },
  responses: {
    200: {
      description: 'Books found successfully (may be empty if no matches)',
      content: {
        'application/json': {
          schema: SearchTitleSuccessResponseSchema,
          example: {
            data: {
              works: [{
                title: "Harry Potter and the Philosopher's Stone",
                subjectTags: ["magic", "wizards", "fantasy", "adventure"],
                firstPublicationYear: 1997,
                description: "Harry Potter has never even heard of Hogwarts...",
                coverImageURL: "https://covers.openlibrary.org/b/id/12345-L.jpg",
                primaryProvider: "open_library",
                goodreadsWorkIDs: ["OL82563W"],
                amazonASINs: ["B0192CTMYG"],
                librarythingIDs: [],
                googleBooksVolumeIDs: [],
                isbndbQuality: 85,
                reviewStatus: "verified",
                synthetic: false
              },
              {
                title: "Harry Potter and the Chamber of Secrets",
                subjectTags: ["magic", "wizards", "fantasy"],
                firstPublicationYear: 1998,
                description: "The summer after his first year at Hogwarts...",
                coverImageURL: "https://covers.openlibrary.org/b/id/12346-L.jpg",
                primaryProvider: "open_library",
                goodreadsWorkIDs: ["OL82563W"],
                amazonASINs: ["B0192CTNYH"],
                librarythingIDs: [],
                googleBooksVolumeIDs: [],
                isbndbQuality: 85,
                reviewStatus: "verified",
                synthetic: false
              }],
              editions: [{
                isbns: ["9780439708180", "0439708184"],
                title: "Harry Potter and the Philosopher's Stone",
                publisher: "Scholastic Inc.",
                publicationDate: "1999-09-01",
                pageCount: 309,
                format: "paperback",
                coverImageURL: "https://covers.openlibrary.org/b/isbn/9780439708180-L.jpg",
                primaryProvider: "open_library",
                amazonASINs: ["0439708184"],
                googleBooksVolumeIDs: [],
                librarythingIDs: [],
                isbndbQuality: 85
              }],
              authors: [{
                name: "J.K. Rowling",
                gender: "female",
                culturalRegion: "europe",
                nationality: "British",
                birthYear: 1965,
                openLibraryID: "OL23919A",
                bookCount: 42
              }],
              resultCount: 2
            },
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z",
              processingTime: 1205,
              provider: "open_library",
              cached: false
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid query parameters',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "INVALID_QUERY",
              message: "Search query is required and must be 1-200 characters",
              details: {
                parameter: "q"
              }
            }
          }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Rate limit exceeded. Maximum 100 requests per minute.",
              retryable: true,
              retryAfterMs: 60000
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: "2025-11-28T12:00:00.000Z"
            },
            error: {
              code: "INTERNAL_ERROR",
              message: "An unexpected error occurred while processing the request"
            }
          }
        }
      }
    }
  }
})
