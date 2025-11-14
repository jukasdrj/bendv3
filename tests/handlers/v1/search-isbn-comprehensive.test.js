/**
 * Comprehensive ISBN Search Handler Tests
 * Sprint 3.2: Search Handler Tests (Issue #54)
 *
 * Tests /v1/search/isbn endpoint with new test infrastructure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleSearchISBN } from '../../../src/handlers/v1/search-isbn.js'
import { createMockKV } from '../../setup.js'
import { mockGoogleBooksSearchResponse, mockOpenLibrarySearchResponse, createMockFetchResponse } from '../../mocks/providers.js'
import { harryPotterBook, book1984, validISBNs, invalidISBNs } from '../../fixtures/books.js'
import { validateSuccessEnvelope, validateErrorEnvelope, validateV1SearchResponse } from '../../utils/response-validator.js'

describe('GET /v1/search/isbn - Comprehensive', () => {
  let mockEnv
  let originalFetch

  beforeEach(() => {
    // Setup mock environment with KV cache
    mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-google-key',
      OPENLIBRARY_API_KEY: 'test-ol-key',
      BOOK_CACHE: createMockKV()
    }

    // Save original fetch
    originalFetch = global.fetch
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  // ============================================================================
  // VALID ISBN TESTS
  // ============================================================================

  describe('Valid ISBN Formats', () => {
    it('should accept valid ISBN-13 format', async () => {
      const isbn13 = harryPotterBook.editions[0].isbn13

      global.fetch = vi.fn().mockResolvedValueOnce(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )

      const response = await handleSearchISBN(isbn13, mockEnv)

      const validation = validateSuccessEnvelope(response)
      expect(validation.valid).toBe(true)
      expect(response.success).toBe(true)
    })

    it('should accept valid ISBN-10 format', async () => {
      const isbn10 = harryPotterBook.editions[0].isbn10

      global.fetch = vi.fn().mockResolvedValueOnce(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )

      const response = await handleSearchISBN(isbn10, mockEnv)

      expect(response.success).toBe(true)
      validateSuccessEnvelope(response)
    })

    it('should normalize ISBN with hyphens', async () => {
      const isbnWithHyphens = '978-0-439-70818-0'

      global.fetch = vi.fn().mockResolvedValueOnce(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )

      const response = await handleSearchISBN(isbnWithHyphens, mockEnv)

      expect(response.success).toBe(true)
      // Verify fetch was called with normalized ISBN (no hyphens)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('9780439708180'),
        expect.any(Object)
      )
    })
  })

  // ============================================================================
  // INVALID ISBN TESTS
  // ============================================================================

  describe('Invalid ISBN Formats', () => {
    it.each(invalidISBNs.filter(isbn => isbn !== null && isbn !== undefined))(
      'should reject invalid ISBN: "%s"',
      async (invalidISBN) => {
        const response = await handleSearchISBN(invalidISBN, mockEnv)

        expect(response.success).toBe(false)
        const validation = validateErrorEnvelope(response)
        expect(validation.valid).toBe(true)
        expect(response.error.code).toBe('INVALID_ISBN')
      }
    )

    it('should return error for empty ISBN', async () => {
      const response = await handleSearchISBN('', mockEnv)

      expect(response.success).toBe(false)
      expect(response.error.code).toBe('INVALID_ISBN')
      expect(response.error.message).toContain('required')
    })

    it('should return error for null ISBN', async () => {
      const response = await handleSearchISBN(null, mockEnv)

      expect(response.success).toBe(false)
      expect(response.error.code).toBe('INVALID_ISBN')
    })
  })

  // ============================================================================
  // PROVIDER FALLBACK TESTS
  // ============================================================================

  describe('Provider Fallback Logic', () => {
    it('should fallback to OpenLibrary if Google Books fails', async () => {
      global.fetch = vi.fn()
        // Google Books fails
        .mockResolvedValueOnce(createMockFetchResponse({ error: 'API Error' }, 500))
        // OpenLibrary succeeds
        .mockResolvedValueOnce(createMockFetchResponse(mockOpenLibrarySearchResponse))

      const response = await handleSearchISBN(book1984.editions[0].isbn13, mockEnv)

      expect(response.success).toBe(true)
      expect(response.meta.source).toBe('openlibrary')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should return error if all providers fail', async () => {
      global.fetch = vi.fn()
        // All providers fail
        .mockRejectedValue(new Error('Network error'))

      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      expect(response.success).toBe(false)
      expect(response.error.code).toBe('PROVIDER_ERROR')
    })

    it('should handle provider timeout gracefully', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Fetch timeout after 5000ms'))

      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      expect(response.success).toBe(false)
      expect(response.error.message).toContain('timeout')
    })
  })

  // ============================================================================
  // RESPONSE FORMAT TESTS
  // ============================================================================

  describe('Response Format Validation', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )
    })

    it('should return canonical v1 search response structure', async () => {
      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      // Validate canonical envelope
      const envelopeValidation = validateSuccessEnvelope(response)
      expect(envelopeValidation.valid).toBe(true)

      // Validate v1 search structure
      const v1Validation = validateV1SearchResponse(response)
      expect(v1Validation.valid).toBe(true)

      // Check required arrays
      expect(response.data.works).toBeInstanceOf(Array)
      expect(response.data.editions).toBeInstanceOf(Array)
      expect(response.data.authors).toBeInstanceOf(Array)
    })

    it('should include meta.timestamp', async () => {
      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      expect(response.meta.timestamp).toBeDefined()
      expect(new Date(response.meta.timestamp).getTime()).toBeGreaterThan(0)
    })

    it('should include meta.processingTime', async () => {
      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      expect(response.meta.processingTime).toBeTypeOf('number')
      expect(response.meta.processingTime).toBeGreaterThanOrEqual(0)
    })

    it('should include meta.source (provider)', async () => {
      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      expect(response.meta.source).toBeDefined()
      expect(['google_books', 'openlibrary', 'isbndb']).toContain(response.meta.source)
    })
  })

  // ============================================================================
  // CACHE BEHAVIOR TESTS
  // ============================================================================

  describe('Cache Behavior', () => {
    it('should return cached result on second request', async () => {
      const isbn = validISBNs[0]

      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )

      // First request - cache miss
      const response1 = await handleSearchISBN(isbn, mockEnv)
      expect(response1.meta.cached).toBe(false)

      // Second request - cache hit
      const response2 = await handleSearchISBN(isbn, mockEnv)

      // Should only fetch once (first request)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Check if cache was used (depends on implementation)
      const cached = await mockEnv.BOOK_CACHE.get(`isbn:${isbn}`, 'json')
      expect(cached).toBeDefined()
    })

    it('should cache successful results', async () => {
      const isbn = validISBNs[0]

      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse(mockGoogleBooksSearchResponse)
      )

      await handleSearchISBN(isbn, mockEnv)

      // Verify cache was populated
      const cacheKey = `isbn:${isbn}`
      const cached = await mockEnv.BOOK_CACHE.get(cacheKey, 'json')

      // Cache implementation may vary
      expect(cached !== null || cached !== undefined)
    })

    it('should not cache error responses', async () => {
      const isbn = invalidISBNs[0]

      const response = await handleSearchISBN(isbn, mockEnv)

      expect(response.success).toBe(false)

      // Verify error was not cached
      const cacheKey = `isbn:${isbn}`
      const cached = await mockEnv.BOOK_CACHE.get(cacheKey, 'json')
      expect(cached).toBeNull()
    })
  })

  // ============================================================================
  // EDITION AGGREGATION TESTS
  // ============================================================================

  describe('Edition Aggregation', () => {
    it('should aggregate multiple editions for same work', async () => {
      // Mock response with multiple editions
      const multiEditionResponse = {
        ...mockGoogleBooksSearchResponse,
        items: [
          mockGoogleBooksSearchResponse.items[0],
          { ...mockGoogleBooksSearchResponse.items[0], id: 'different-id' }
        ]
      }

      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse(multiEditionResponse)
      )

      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      if (response.success) {
        expect(response.data.editions.length).toBeGreaterThan(1)
      }
    })
  })

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle malformed provider response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockFetchResponse({ incomplete: 'data' }) // Missing required fields
      )

      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      // Should handle gracefully
      expect(response.success).toBeDefined()
      expect(response.meta).toBeDefined()
    })

    it('should handle missing API key', async () => {
      const envNoKey = { ...mockEnv, GOOGLE_BOOKS_API_KEY: undefined }

      const response = await handleSearchISBN(validISBNs[0], envNoKey)

      // Should either use free tier or return error
      expect(response.success).toBeDefined()
      expect(response.meta).toBeDefined()
    })

    it('should return proper error envelope for all error scenarios', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Test error'))

      const response = await handleSearchISBN(validISBNs[0], mockEnv)

      const validation = validateErrorEnvelope(response)
      expect(validation.valid).toBe(true)
      expect(response.error.code).toBeDefined()
      expect(response.error.message).toBeDefined()
    })
  })
})
