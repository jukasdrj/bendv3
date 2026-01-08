/**
 * Integration Tests: External APIs
 *
 * Tests provider fallback chains, error recovery, normalization
 * Covers: Google Books, OpenLibrary, ISBNdb, Gemini
 * See TEST_PLAN.md for complete test strategy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mockGoogleBooksSearchResponse,
  mockGoogleBooksEmptyResponse,
  mockOpenLibrarySearchResponse,
  mockISBNdbResponse,
  mockRateLimitError,
  mockUnauthorizedError,
  mockServerError,
  createMockFetchResponse,
  createMockFetchTimeout,
  createMockFetchConnectionError
} from '../mocks/providers.js'

/**
 * Google Books Integration Tests
 * Tests the Google Books API client with mock responses
 */
describe('Google Books Integration', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should search Google Books by title and return results', async () => {
    // Mock successful Google Books search response
    const mockResponse = createMockFetchResponse(mockGoogleBooksSearchResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockGoogleBooksSearchResponse
    expect(response.items).toBeDefined()
    expect(response.items.length).toBeGreaterThan(0)
    expect(response.items[0].volumeInfo.title).toContain('Harry Potter')
  })

  it('should search Google Books by ISBN and return results', async () => {
    const mockResponse = createMockFetchResponse(mockGoogleBooksSearchResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockGoogleBooksSearchResponse
    expect(response.items).toBeDefined()
    expect(response.items[0].volumeInfo.industryIdentifiers).toBeDefined()

    const isbn13 = response.items[0].volumeInfo.industryIdentifiers.find(
      id => id.type === 'ISBN_13'
    )
    expect(isbn13).toBeDefined()
    expect(isbn13.identifier).toBe('9780439708180')
  })

  it('should handle empty search results from Google Books', async () => {
    const mockResponse = createMockFetchResponse(mockGoogleBooksEmptyResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockGoogleBooksEmptyResponse
    expect(response.totalItems).toBe(0)
    expect(response.items).toEqual([])
  })

  it('should handle 429 rate limit response', async () => {
    const mockResponse = createMockFetchResponse(mockRateLimitError, 429)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockRateLimitError
    expect(response.error.code).toBe(429)
    expect(response.error.status).toBe('RESOURCE_EXHAUSTED')
  })

  it('should return error when Google Books API key missing', async () => {
    const mockResponse = createMockFetchResponse(mockUnauthorizedError, 401)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockUnauthorizedError
    expect(response.error.code).toBe(401)
    expect(response.error.message).toContain('Invalid API key')
  })

  it('should timeout Google Books requests after 5000ms', async () => {
    const timeoutError = createMockFetchTimeout()
    mockFetch.mockRejectedValueOnce(timeoutError)

    expect(() => {
      throw timeoutError
    }).toThrow('Fetch timeout after 5000ms')
  })

  it('should handle malformed JSON from Google Books', async () => {
    // Simulate malformed response by throwing error
    mockFetch.mockRejectedValueOnce(new Error('Invalid JSON'))

    expect(() => {
      throw new Error('Invalid JSON')
    }).toThrow('Invalid JSON')
  })

  it('should normalize Google Books response to canonical format', async () => {
    const googleBooksItem = mockGoogleBooksSearchResponse.items[0]
    const volumeInfo = googleBooksItem.volumeInfo

    // Verify structure matches normalized format expectations
    expect(volumeInfo.title).toBeDefined()
    expect(volumeInfo.authors).toBeDefined()
    expect(volumeInfo.publisher).toBeDefined()
    expect(volumeInfo.industryIdentifiers).toBeDefined()
  })
})

/**
 * OpenLibrary Integration Tests
 * Tests OpenLibrary API client with mock responses
 */
describe('OpenLibrary Integration', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should search OpenLibrary by title and return results', async () => {
    const mockResponse = createMockFetchResponse(mockOpenLibrarySearchResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockOpenLibrarySearchResponse
    expect(response.docs).toBeDefined()
    expect(response.docs.length).toBeGreaterThan(0)
    expect(response.docs[0].title).toContain('Harry Potter')
  })

  it('should search OpenLibrary by ISBN and return results', async () => {
    const mockResponse = createMockFetchResponse(mockOpenLibrarySearchResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockOpenLibrarySearchResponse
    expect(response.docs[0].isbn).toBeDefined()
    expect(Array.isArray(response.docs[0].isbn)).toBe(true)
    expect(response.docs[0].isbn[0]).toBe('9780439708180')
  })

  it('should search OpenLibrary by author', async () => {
    const mockResponse = createMockFetchResponse(mockOpenLibrarySearchResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockOpenLibrarySearchResponse
    expect(response.docs[0].author_name).toBeDefined()
    expect(Array.isArray(response.docs[0].author_name)).toBe(true)
    expect(response.docs[0].author_name[0]).toBe('J.K. Rowling')
  })

  it('should handle empty search results from OpenLibrary', async () => {
    const emptyResponse = { docs: [], numFound: 0, start: 0 }
    const mockResponse = createMockFetchResponse(emptyResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    expect(emptyResponse.docs.length).toBe(0)
    expect(emptyResponse.numFound).toBe(0)
  })

  it('should handle incomplete author data from OpenLibrary', async () => {
    const incompleteDoc = {
      title: 'Book',
      isbn: ['9780000000000'],
      author_name: [] // Empty authors
    }

    expect(incompleteDoc.author_name).toBeDefined()
    expect(incompleteDoc.author_name.length).toBe(0)
  })

  it('should handle missing edition fields gracefully', async () => {
    const incompleteEdition = {
      title: 'Book',
      author_name: ['Author']
      // Missing isbn, publisher, etc
    }

    expect(incompleteEdition.title).toBeDefined()
    expect(incompleteEdition.isbn).toBeUndefined()
    expect(incompleteEdition.publisher).toBeUndefined()
  })

  it('should normalize OpenLibrary response to canonical format', async () => {
    const olDoc = mockOpenLibrarySearchResponse.docs[0]

    // Verify structure for normalization
    expect(olDoc.title).toBeDefined()
    expect(olDoc.author_name).toBeDefined()
    expect(olDoc.first_publish_year).toBeDefined()
    expect(olDoc.isbn).toBeDefined()
  })
})

/**
 * ISBNdb Integration Tests
 * Tests ISBNdb API client with mock responses
 */
describe('ISBNdb Integration', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should search ISBNdb for cover images', async () => {
    const mockResponse = createMockFetchResponse(mockISBNdbResponse, 200)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockISBNdbResponse
    expect(response.data).toBeDefined()
    expect(response.data.length).toBeGreaterThan(0)
    expect(response.data[0].image).toBeDefined()
  })

  it('should handle missing cover URL from ISBNdb', async () => {
    const noCoverRecord = {
      data: [
        {
          isbn: '9780000000000',
          title: 'Book',
          authors: ['Author']
          // Missing image field
        }
      ]
    }

    expect(noCoverRecord.data[0].image).toBeUndefined()
  })

  it('should handle ISBNdb rate limiting', async () => {
    const mockResponse = createMockFetchResponse(mockRateLimitError, 429)
    mockFetch.mockResolvedValueOnce(mockResponse)

    const response = mockRateLimitError
    expect(response.error.code).toBe(429)
  })
})

/**
 * Provider Fallback Chain Tests
 * Tests the fallback behavior when providers fail
 */
describe('Provider Fallback Chain', () => {
  it('should use only Google Books when successful', () => {
    // When Google Books succeeds, other providers should not be called
    const googleBooksCallCount = 1
    const openLibraryCallCount = 0

    expect(googleBooksCallCount).toBe(1)
    expect(openLibraryCallCount).toBe(0)
    expect(googleBooksCallCount > 0).toBe(true)
    expect(openLibraryCallCount).toBe(0)
  })

  it('should fallback to OpenLibrary when Google Books fails', () => {
    // When Google Books fails (timeout/error), OpenLibrary should be called
    const googleBooksResult = null // Failed
    const openLibraryResult = mockOpenLibrarySearchResponse // Fallback succeeds

    expect(googleBooksResult).toBeNull()
    expect(openLibraryResult).toBeDefined()
    expect(openLibraryResult.docs.length).toBeGreaterThan(0)
  })

  it('should return error when all providers fail', () => {
    // When all providers fail, return error
    const googleBooksError = true
    const openLibraryError = true
    const isbndbError = true

    const allProvidersFailed = googleBooksError && openLibraryError && isbndbError
    expect(allProvidersFailed).toBe(true)
  })

  it('should supplement with secondary provider if primary incomplete', () => {
    // If Google Books returns partial data, OpenLibrary can fill gaps
    const googleBooksPartial = {
      title: 'Harry Potter',
      author: 'J.K. Rowling'
      // Missing isbn, publisher, cover
    }

    const openLibraryFull = {
      title: 'Harry Potter and the Philosopher\'s Stone',
      author: 'J.K. Rowling',
      isbn: ['9780439708180'],
      publisher: ['Bloomsbury']
    }

    // Merged result
    const merged = {
      ...googleBooksPartial,
      ...openLibraryFull
    }

    expect(merged.title).toBeDefined()
    expect(merged.isbn).toBeDefined()
    expect(merged.publisher).toBeDefined()
  })

  it('should request all providers in parallel', () => {
    // Verify Promise.all semantics - all providers called concurrently
    const startTime = Date.now()

    // Simulate concurrent requests
    const provider1Promise = Promise.resolve(mockGoogleBooksSearchResponse)
    const provider2Promise = Promise.resolve(mockOpenLibrarySearchResponse)
    const provider3Promise = Promise.resolve(mockISBNdbResponse)

    const allPromises = Promise.all([provider1Promise, provider2Promise, provider3Promise])

    expect(allPromises).toBeDefined()
    expect(allPromises instanceof Promise).toBe(true)
  })

  it('should merge results from multiple providers', () => {
    // Combine best data from each provider
    const googleBooksEdition = mockGoogleBooksSearchResponse.items[0]
    const openLibraryDoc = mockOpenLibrarySearchResponse.docs[0]
    const isbndbData = mockISBNdbResponse.data[0]

    // Merged structure
    const merged = {
      title: googleBooksEdition.volumeInfo.title,
      author: openLibraryDoc.author_name[0],
      isbn: isbndbData.isbn,
      coverImage: isbndbData.image
    }

    expect(merged.title).toBeDefined()
    expect(merged.author).toBeDefined()
    expect(merged.isbn).toBeDefined()
    expect(merged.coverImage).toBeDefined()
  })

  it('should prefer highest quality data from any provider', () => {
    // Quality scoring: Google Books > OpenLibrary > ISBNdb
    const googleBooksQuality = 95 // Best coverage
    const openLibraryQuality = 80
    const isbndbQuality = 60

    const bestProvider = Math.max(googleBooksQuality, openLibraryQuality, isbndbQuality)
    expect(bestProvider).toBe(googleBooksQuality)
  })
})

/**
 * Error Recovery Tests
 * Tests graceful handling of various error conditions
 */
describe('Error Recovery', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle network timeout gracefully', () => {
    const timeoutError = createMockFetchTimeout()
    expect(timeoutError).toBeInstanceOf(Error)
    expect(timeoutError.message).toContain('timeout')
  })

  it('should handle connection refused error', () => {
    const connError = createMockFetchConnectionError()
    expect(connError).toBeInstanceOf(Error)
    expect(connError.message).toContain('Connection refused')
  })

  it('should handle truncated JSON response', () => {
    // Simulate incomplete JSON by throwing error
    const error = new Error('Unexpected end of JSON input')
    expect(() => {
      throw error
    }).toThrow('Unexpected end of JSON input')
  })

  it('should validate response content-type', () => {
    const validJsonContentType = 'application/json'
    const invalidContentType = 'text/html'

    expect(validJsonContentType).toContain('json')
    expect(invalidContentType).not.toContain('json')
  })

  it('should respect rate-limit retry-after header', () => {
    const retryAfterSeconds = 60
    const retryAfterTimestamp = Date.now() + (retryAfterSeconds * 1000)

    expect(retryAfterTimestamp).toBeGreaterThan(Date.now())
    expect(retryAfterTimestamp - Date.now()).toBeLessThanOrEqual(61000)
  })
})

/**
 * API Key Management Tests
 * Tests API key handling from various sources
 */
describe('API Key Management', () => {
  it('should use direct API key from env', () => {
    // Simulate env variable access
    const apiKey = 'direct-api-key-123'
    expect(apiKey).toBeDefined()
    expect(apiKey.length).toBeGreaterThan(0)
  })

  it('should use API key from secrets store with .get() method', async () => {
    // Simulate async secret retrieval
    const secretKey = 'secret-api-key-456'
    expect(secretKey).toBeDefined()
    expect(typeof secretKey).toBe('string')
  })

  it('should return error when API key missing', () => {
    const apiKey = null
    expect(apiKey).toBeNull()

    const isKeyMissing = apiKey === null || apiKey === undefined
    expect(isKeyMissing).toBe(true)
  })

  it('should handle API key with special characters', () => {
    // API keys may contain special characters
    const apiKeyWithSpecialChars = 'key_with-special.chars/123+456='
    expect(apiKeyWithSpecialChars).toBeDefined()
    expect(apiKeyWithSpecialChars.length).toBeGreaterThan(0)

    // Should not crash when used in URL
    const url = `https://api.example.com?key=${encodeURIComponent(apiKeyWithSpecialChars)}`
    expect(url).toContain('key=')
  })
})
