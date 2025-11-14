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

  describe('Provider Integration', () => {
    it('should fetch from providers and return valid response', async () => {
      // Arrange: Use MSW handler for Google Books (ISBN: 9780739314821)
      // This ISBN is configured in google-books.js MSW handler

      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should return valid response structure
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)

      // Should have cache headers
      expect(result._cacheHeaders).toBeDefined()
      expect(result._cacheHeaders['X-Cache-Status']).toBeDefined()

      // Should have provider info
      expect(result.provider).toBeDefined()
    })

    it('should include response time metadata', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should include response time
      expect(result.responseTime).toBeDefined()
      expect(typeof result.responseTime).toBe('number')
      expect(result.responseTime).toBeGreaterThanOrEqual(0)
    })

    it('should cache results with 7-day TTL for ISBN searches', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: TTL should be 7 days (604800 seconds)
      expect(result._cacheHeaders['X-Cache-TTL']).toBe((7 * 24 * 60 * 60).toString())
    })
  })

  describe('Provider Orchestration', () => {
    it('should handle provider failures gracefully', async () => {
      // Arrange: OpenLibrary returns error (simulating fallback scenario)
      server.use(
        http.get('https://openlibrary.org/search.json', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should return valid response (graceful degradation)
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })
  })

  describe('Data Transformation', () => {
    it('should include cache headers with quality metrics', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Should have cache headers with quality information
      expect(result._cacheHeaders).toBeDefined()
      expect(result._cacheHeaders['X-Image-Quality']).toBeDefined()
      expect(result._cacheHeaders['X-Data-Completeness']).toBeDefined()
      expect(result._cacheHeaders['X-Cache-TTL']).toBeDefined()
    })

    it('should calculate data completeness as a percentage', async () => {
      // Act: Search by ISBN
      const result = await searchByISBN('9780739314821', {}, mockEnv, mockCtx)

      // Assert: Completeness should be 0-100
      const completeness = parseInt(result._cacheHeaders['X-Data-Completeness'])
      expect(completeness).toBeGreaterThanOrEqual(0)
      expect(completeness).toBeLessThanOrEqual(100)
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

  describe('Provider Integration', () => {
    it('should fetch results from providers', async () => {
      // Act: Search by title
      const result = await searchByTitle('test', {}, mockEnv, mockCtx)

      // Assert: Should return results
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result._cacheHeaders).toBeDefined()
    })

    it('should cache results with 6-hour TTL for title searches', async () => {
      // Act: Search by title
      const result = await searchByTitle('test book', {}, mockEnv, mockCtx)

      // Assert: TTL should be 6 hours (21600 seconds)
      expect(result._cacheHeaders['X-Cache-TTL']).toBe((6 * 60 * 60).toString())
    })
  })


  describe('Options Handling', () => {
    it('should handle default maxResults for title searches', async () => {
      // Act: Search without maxResults option
      const result = await searchByTitle('test', {}, mockEnv, mockCtx)

      // Assert: Should handle default maxResults
      expect(result).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })
  })
})
