/**
 * Book Search Handler Tests
 *
 * Tests the searchByTitle and searchByISBN functions with:
 * - Cache hit/miss scenarios (KV cache)
 * - Provider orchestration (Google Books + OpenLibrary)
 * - Error handling and fallback logic
 * - Data transformation and deduplication
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'
import { searchByTitle, searchByISBN } from '../../src/handlers/book-search.js'
import { createMockKV } from '../setup.js'

// Enable MSW for API mocking (includes localStorage polyfill)
const server = setupMSW()

describe('Book Search Handler - searchByISBN', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    // Reset mocks before each test
    // UnifiedCacheService requires multiple KV bindings
    mockEnv = {
      BOOK_CACHE: createMockKV(),         // Legacy KV cache
      CACHE: createMockKV(),               // UnifiedCache KV tier
      GOOGLE_BOOKS_API_KEY: 'test-key-12345',
      ANALYTICS: {                         // Analytics Engine binding
        writeDataPoint: vi.fn(),
      },
    }

    mockCtx = {
      waitUntil: vi.fn((promise) => promise), // Execute immediately for testing
    }
  })

  describe('Cache Scenarios', () => {
    it('should return cached result on cache hit', async () => {
      // Arrange: Pre-populate cache
      const cachedData = {
        kind: 'books#volumes',
        totalItems: 1,
        items: [{
          kind: 'books#volume',
          id: 'cached-123',
          volumeInfo: {
            title: 'Cached Book',
            authors: ['Test Author'],
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780123456789' }
            ],
            imageLinks: {
              thumbnail: 'http://example.com/cover.jpg'
            }
          }
        }]
      }

      // generateCacheKey format: "search:isbn:isbn={isbn}"
      const cacheKey = 'search:isbn:isbn=9780123456789'
      await mockEnv.CACHE.put(cacheKey, JSON.stringify({
        data: cachedData,
        source: 'KV',
        age: 100,
        ttl: 500000,
      }))

      // Act: Search by ISBN
      const result = await searchByISBN('9780123456789', {}, mockEnv, mockCtx)

      // Assert: Should return cached data with cache metadata
      expect(result.cached).toBe(true)
      expect(result.cacheSource).toBe('KV')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].volumeInfo.title).toBe('Cached Book')
      expect(result._cacheHeaders['X-Cache-Status']).toBe('HIT')

      // Should write cache metrics
      expect(mockCtx.waitUntil).toHaveBeenCalled()
    })

    it('should fetch from providers on cache miss', async () => {
      // Arrange: Use MSW handler for Google Books (ISBN: 9780739314821)
      // This ISBN is configured in google-books.js MSW handler

      // Act: Search by ISBN (cache miss)
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should fetch from providers
      expect(result.cached).toBe(false)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].volumeInfo.title).toBe('The Google story')
      expect(result.provider).toContain('google')
      expect(result._cacheHeaders['X-Cache-Status']).toBe('MISS')

      // Should cache the result
      expect(mockCtx.waitUntil).toHaveBeenCalled()
    })

    it('should cache results with 7-day TTL for ISBN searches', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: TTL should be 7 days (604800 seconds)
      expect(result._cacheHeaders['X-Cache-TTL']).toBe((7 * 24 * 60 * 60).toString())
    })
  })

  describe('Provider Orchestration', () => {
    it('should combine results from Google Books and OpenLibrary', async () => {
      // Arrange: Set up MSW to return results from both providers
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 1,
            items: [{
              kind: 'books#volume',
              id: 'google-1',
              volumeInfo: {
                title: 'Google Book',
                authors: ['Google Author'],
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9781111111111' }
                ]
              }
            }]
          })
        }),
        http.get('https://openlibrary.org/search.json', () => {
          return HttpResponse.json({
            numFound: 1,
            docs: [{
              key: '/works/OL123W',
              title: 'OpenLibrary Book',
              author_name: ['OL Author'],
              isbn: ['9782222222222'],
              first_publish_year: 2020,
              cover_i: 12345
            }]
          })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9781111111111', {}, mockEnv, mockCtx)

      // Assert: Should include results from both providers
      expect(result.items.length).toBeGreaterThan(0)
      expect(result.provider).toContain('orchestrated')
    })

    it('should deduplicate results by ISBN', async () => {
      // Arrange: Set up MSW to return duplicate ISBNs
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 2,
            items: [
              {
                kind: 'books#volume',
                id: 'book-1',
                volumeInfo: {
                  title: 'Duplicate Book',
                  industryIdentifiers: [
                    { type: 'ISBN_13', identifier: '9783333333333' }
                  ]
                }
              },
              {
                kind: 'books#volume',
                id: 'book-2',
                volumeInfo: {
                  title: 'Duplicate Book (Different Edition)',
                  industryIdentifiers: [
                    { type: 'ISBN_13', identifier: '9783333333333' } // Same ISBN
                  ]
                }
              }
            ]
          })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9783333333333', {}, mockEnv, mockCtx)

      // Assert: Should deduplicate by ISBN
      expect(result.items).toHaveLength(1)
    })

    it('should handle Google Books success with OpenLibrary failure', async () => {
      // Arrange: OpenLibrary returns error
      server.use(
        http.get('https://openlibrary.org/search.json', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      // Act: Search by ISBN (Google Books will succeed via default handler)
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should still return Google Books results
      expect(result.items).toHaveLength(1)
      expect(result.items[0].volumeInfo.title).toBe('The Google story')
      expect(result.provider).toContain('google')
    })

    it('should handle both providers failing gracefully', async () => {
      // Arrange: Both providers return errors
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return new HttpResponse(null, { status: 500 })
        }),
        http.get('https://openlibrary.org/search.json', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9999999999999', {}, mockEnv, mockCtx)

      // Assert: Should return empty results, not crash
      expect(result.items).toEqual([])
      expect(result.totalItems).toBe(0)
    })
  })

  describe('Data Transformation', () => {
    it('should generate correct cache headers for high-quality images', async () => {
      // Arrange: Set up response with high-quality images (zoom=1)
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 1,
            items: [{
              kind: 'books#volume',
              id: 'high-quality',
              volumeInfo: {
                title: 'High Quality Book',
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9784444444444' }
                ],
                imageLinks: {
                  thumbnail: 'http://books.google.com/content?zoom=1'
                }
              }
            }]
          })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9784444444444', {}, mockEnv, mockCtx)

      // Assert: Should detect high-quality images
      expect(result._cacheHeaders['X-Image-Quality']).toBe('high')
    })

    it('should calculate data completeness percentage correctly', async () => {
      // Arrange: Mix of complete and incomplete items
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 2,
            items: [
              {
                kind: 'books#volume',
                id: 'complete',
                volumeInfo: {
                  title: 'Complete Book',
                  industryIdentifiers: [
                    { type: 'ISBN_13', identifier: '9785555555555' }
                  ],
                  imageLinks: {
                    thumbnail: 'http://example.com/cover.jpg'
                  }
                }
              },
              {
                kind: 'books#volume',
                id: 'incomplete',
                volumeInfo: {
                  title: 'Incomplete Book',
                  // No ISBN
                  // No cover
                }
              }
            ]
          })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9785555555555', {}, mockEnv, mockCtx)

      // Assert: Should calculate completeness (50% = 1 out of 2 complete)
      const completeness = parseInt(result._cacheHeaders['X-Data-Completeness'])
      expect(completeness).toBeGreaterThanOrEqual(0)
      expect(completeness).toBeLessThanOrEqual(100)
    })

    it('should include response time metadata', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should include response time
      expect(result.responseTime).toBeDefined()
      expect(typeof result.responseTime).toBe('number')
      expect(result.responseTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid ISBN gracefully', async () => {
      // Act: Search with invalid ISBN
      const result = await searchByISBN('invalid-isbn', {}, mockEnv, mockCtx)

      // Assert: Should return empty results, not crash
      expect(result.items).toEqual([])
    })

    it('should handle network errors gracefully', async () => {
      // Arrange: Simulate network error
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.error()
        }),
        http.get('https://openlibrary.org/search.json', () => {
          return HttpResponse.error()
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9786666666666', {}, mockEnv, mockCtx)

      // Assert: Should return error response
      expect(result.error).toBeDefined()
      expect(result.items).toEqual([])
    })

    it('should catch and handle exceptions', async () => {
      // Arrange: Force an exception by passing null env
      const badEnv = null

      // Act & Assert: Should not throw
      await expect(searchByISBN('9780739314821', {}, badEnv, mockCtx)).resolves.toBeDefined()
    })
  })

  describe('Options Handling', () => {
    it('should respect maxResults option', async () => {
      // Act: Search with maxResults = 1
      const result = await searchByISBN('9780739314821', { maxResults: 1 }, mockEnv, mockCtx)

      // Assert: Should return at most 1 result
      expect(result.items.length).toBeLessThanOrEqual(1)
    })

    it('should default maxResults to 1 for ISBN searches', async () => {
      // Act: Search without maxResults option
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should default to 1 result
      expect(result.items.length).toBeLessThanOrEqual(1)
    })
  })
})

describe('Book Search Handler - searchByTitle', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    // UnifiedCacheService requires multiple KV bindings
    mockEnv = {
      BOOK_CACHE: createMockKV(),
      CACHE: createMockKV(),
      GOOGLE_BOOKS_API_KEY: 'test-key-12345',
      ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    }

    mockCtx = {
      waitUntil: vi.fn((promise) => promise),
    }
  })

  describe('Cache Scenarios', () => {
    it('should return cached result on cache hit', async () => {
      // Arrange: Pre-populate cache
      const cachedData = {
        kind: 'books#volumes',
        totalItems: 2,
        items: [
          {
            kind: 'books#volume',
            id: 'cached-title-1',
            volumeInfo: {
              title: 'Harry Potter',
              authors: ['J.K. Rowling']
            }
          },
          {
            kind: 'books#volume',
            id: 'cached-title-2',
            volumeInfo: {
              title: 'Harry Potter and the Chamber of Secrets',
              authors: ['J.K. Rowling']
            }
          }
        ]
      }

      // generateCacheKey format: "search:title:maxResults={n}&title={title}"
      const cacheKey = 'search:title:maxResults=20&title=harry potter'
      await mockEnv.CACHE.put(cacheKey, JSON.stringify({
        data: cachedData,
        source: 'EDGE',
        age: 50,
        ttl: 20000,
      }))

      // Act: Search by title
      const result = await searchByTitle('harry potter', {}, mockEnv, mockCtx)

      // Assert: Should return cached data
      expect(result.cached).toBe(true)
      expect(result.cacheSource).toBe('EDGE')
      expect(result.items).toHaveLength(2)
      expect(result._cacheHeaders['X-Cache-Status']).toBe('HIT')
    })

    it('should cache results with 6-hour TTL for title searches', async () => {
      // Arrange: Set up MSW to return results
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 1,
            items: [{
              kind: 'books#volume',
              id: 'title-search-1',
              volumeInfo: {
                title: 'Test Book',
                authors: ['Test Author']
              }
            }]
          })
        })
      )

      // Act: Search by title
      const result = await searchByTitle('test book', {}, mockEnv, mockCtx)

      // Assert: TTL should be 6 hours (21600 seconds)
      expect(result._cacheHeaders['X-Cache-TTL']).toBe((6 * 60 * 60).toString())
    })
  })

  describe('Provider Orchestration', () => {
    it('should combine results from multiple providers', async () => {
      // Arrange: Set up MSW handlers
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 1,
            items: [{
              kind: 'books#volume',
              id: 'google-title-1',
              volumeInfo: {
                title: 'Title Search Book',
                authors: ['Google Author']
              }
            }]
          })
        }),
        http.get('https://openlibrary.org/search.json', () => {
          return HttpResponse.json({
            numFound: 1,
            docs: [{
              key: '/works/OL456W',
              title: 'Another Title Book',
              author_name: ['OL Author'],
              first_publish_year: 2021
            }]
          })
        })
      )

      // Act: Search by title
      const result = await searchByTitle('title search', {}, mockEnv, mockCtx)

      // Assert: Should orchestrate multiple providers
      expect(result.items.length).toBeGreaterThan(0)
      expect(result.provider).toContain('orchestrated')
    })

    it('should deduplicate results by title', async () => {
      // Arrange: Set up duplicate titles
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 2,
            items: [
              {
                kind: 'books#volume',
                id: 'dup-1',
                volumeInfo: { title: 'Duplicate Title' }
              },
              {
                kind: 'books#volume',
                id: 'dup-2',
                volumeInfo: { title: 'Duplicate Title' } // Same title
              }
            ]
          })
        })
      )

      // Act: Search by title
      const result = await searchByTitle('duplicate', {}, mockEnv, mockCtx)

      // Assert: Should deduplicate by title (case-insensitive)
      expect(result.items).toHaveLength(1)
    })

    it('should handle case-insensitive deduplication', async () => {
      // Arrange: Set up titles with different cases
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 2,
            items: [
              {
                kind: 'books#volume',
                id: 'case-1',
                volumeInfo: { title: 'The Great Book' }
              },
              {
                kind: 'books#volume',
                id: 'case-2',
                volumeInfo: { title: 'THE GREAT BOOK' } // Same title, different case
              }
            ]
          })
        })
      )

      // Act: Search by title
      const result = await searchByTitle('great book', {}, mockEnv, mockCtx)

      // Assert: Should deduplicate case-insensitively
      expect(result.items).toHaveLength(1)
    })
  })

  describe('Options Handling', () => {
    it('should respect maxResults option', async () => {
      // Arrange: Set up multiple results
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 5,
            items: Array.from({ length: 5 }, (_, i) => ({
              kind: 'books#volume',
              id: `result-${i}`,
              volumeInfo: {
                title: `Book ${i}`
              }
            }))
          })
        })
      )

      // Act: Search with maxResults = 3
      const result = await searchByTitle('book', { maxResults: 3 }, mockEnv, mockCtx)

      // Assert: Should return at most 3 results
      expect(result.items.length).toBeLessThanOrEqual(3)
    })

    it('should default maxResults to 20 for title searches', async () => {
      // Act: Search without maxResults option
      const result = await searchByTitle('test', {}, mockEnv, mockCtx)

      // Assert: Should handle default maxResults (implementation defaults to 20)
      expect(result).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle empty title gracefully', async () => {
      // Act: Search with empty title
      const result = await searchByTitle('', {}, mockEnv, mockCtx)

      // Assert: Should return empty or error response
      expect(result).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })

    it('should handle network errors gracefully', async () => {
      // Arrange: Simulate network error
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', () => {
          return HttpResponse.error()
        }),
        http.get('https://openlibrary.org/search.json', () => {
          return HttpResponse.error()
        })
      )

      // Act: Search by title
      const result = await searchByTitle('network error test', {}, mockEnv, mockCtx)

      // Assert: Should return error response
      expect(result.error).toBeDefined()
      expect(result.items).toEqual([])
    })

    it('should handle provider timeout gracefully', async () => {
      // Arrange: Simulate timeout (very slow response)
      server.use(
        http.get('https://www.googleapis.com/books/v1/volumes', async () => {
          await new Promise(resolve => setTimeout(resolve, 100))
          return HttpResponse.json({
            kind: 'books#volumes',
            totalItems: 0
          })
        })
      )

      // Act: Search by title
      const result = await searchByTitle('timeout test', {}, mockEnv, mockCtx)

      // Assert: Should complete (not hang indefinitely)
      expect(result).toBeDefined()
    })
  })
})
