/**
 * Cache Key Optimization Tests
 *
 * Verifies that search functions cache full result sets and filter in-memory,
 * improving cache hit rates by removing maxResults from cache keys.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchGoogleBooks, searchOpenLibrary } from '../src/services/external-apis.ts'

describe('Cache Key Optimization - Google Books', () => {
  let mockKV
  let mockCtx
  let cacheGetSpy
  let cachePutSpy

  beforeEach(() => {
    vi.clearAllMocks()
    
    cacheGetSpy = vi.fn()
    cachePutSpy = vi.fn()

    mockKV = {
      get: vi.fn().mockResolvedValue(null),
      getWithMetadata: cacheGetSpy.mockResolvedValue({ value: null, metadata: null }),
      put: cachePutSpy.mockResolvedValue(undefined)
    }

    mockCtx = {
      waitUntil: vi.fn()
    }
  })

  it('should use same cache key for different maxResults values', async () => {
    const query = 'Harry Potter'
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
      KV_CACHE: mockKV,
      CACHE_HOT_TTL: '7200',
      CACHE_COLD_TTL: '1209600',
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    // Mock fetch to return Google Books response
    const mockGoogleResponse = {
      items: Array(40).fill(null).map((_, i) => ({
        id: `book-${i}`,
        volumeInfo: {
          title: `Test Book ${i}`,
          authors: ['Test Author'],
          publishedDate: '2020-01-01',
          industryIdentifiers: [
            { type: 'ISBN_13', identifier: `978000000000${i}` }
          ]
        }
      }))
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGoogleResponse
    })

    // First call with maxResults=10
    await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx)

    // Second call with maxResults=20 - should use same cache key
    await searchGoogleBooks(query, { maxResults: 20 }, mockEnv, mockCtx)

    // Both should check the same cache key (without maxResults)
    const expectedCacheKey = 'harry potter'
    expect(cacheGetSpy).toHaveBeenCalledTimes(2)
    
    // Verify cache key format in getWithMetadata calls
    const firstCallKey = cacheGetSpy.mock.calls[0][0]
    const secondCallKey = cacheGetSpy.mock.calls[1][0]
    
    expect(firstCallKey).toBe(`search:${expectedCacheKey}`)
    expect(secondCallKey).toBe(`search:${expectedCacheKey}`)
    expect(firstCallKey).toBe(secondCallKey)
  })

  it('should cache full result set (40 items for Google Books)', async () => {
    const query = 'Test Query'
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
      KV_CACHE: mockKV,
      CACHE_HOT_TTL: '7200',
      CACHE_COLD_TTL: '1209600',
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    const mockGoogleResponse = {
      items: Array(40).fill(null).map((_, i) => ({
        id: `book-${i}`,
        volumeInfo: {
          title: `Test Book ${i}`,
          authors: ['Test Author'],
          publishedDate: '2020-01-01',
          industryIdentifiers: [
            { type: 'ISBN_13', identifier: `978000000000${i}` }
          ]
        }
      }))
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGoogleResponse
    })

    // Request only 10 results
    await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx)

    // Verify that 40 results were requested from API (cache miss)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const fetchUrl = global.fetch.mock.calls[0][0]
    expect(fetchUrl).toContain('maxResults=40')

    // Verify that full result set was cached
    expect(cachePutSpy).toHaveBeenCalledTimes(1)
    const cachedValue = cachePutSpy.mock.calls[0][1]
    const parsedCache = JSON.parse(cachedValue)
    
    // Should cache all 40 results, not just the 10 requested
    expect(parsedCache.works).toBeDefined()
    expect(parsedCache.works.length).toBe(40)
  })

  it('should filter cached results to requested maxResults', async () => {
    const query = 'Cached Query'
    
    // Create cached data with 40 results
    const cachedData = {
      works: Array(40).fill(null).map((_, i) => ({
        workId: `work-${i}`,
        title: `Book ${i}`,
        primaryProvider: 'google-books'
      })),
      editions: [],
      primaryProvider: 'google-books'
    }

    mockKV.getWithMetadata = vi.fn().mockResolvedValue({
      value: JSON.stringify(cachedData),
      metadata: { hotTtlExpiry: Date.now() + 7200000 }
    })

    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
      KV_CACHE: mockKV,
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    // Request 10 results
    const result1 = await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx)
    expect(result1.works).toHaveLength(10)
    expect(result1.works[0].workId).toBe('work-0')
    expect(result1.works[9].workId).toBe('work-9')

    // Request 20 results - should get from same cache
    const result2 = await searchGoogleBooks(query, { maxResults: 20 }, mockEnv, mockCtx)
    expect(result2.works).toHaveLength(20)
    expect(result2.works[0].workId).toBe('work-0')
    expect(result2.works[19].workId).toBe('work-19')

    // Both should have used the same cached data
    expect(mockKV.getWithMetadata).toHaveBeenCalledTimes(2)
    
    // Should not have called the API
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should return all cached results if requested maxResults exceeds cache', async () => {
    const query = 'Small Result Set'
    
    // Cached data with only 5 results
    const cachedData = {
      works: Array(5).fill(null).map((_, i) => ({
        workId: `work-${i}`,
        title: `Book ${i}`,
        primaryProvider: 'google-books'
      })),
      editions: [],
      primaryProvider: 'google-books'
    }

    mockKV.getWithMetadata = vi.fn().mockResolvedValue({
      value: JSON.stringify(cachedData),
      metadata: { hotTtlExpiry: Date.now() + 7200000 }
    })

    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
      KV_CACHE: mockKV,
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    // Request 20 results but only 5 are available
    const result = await searchGoogleBooks(query, { maxResults: 20 }, mockEnv, mockCtx)
    
    expect(result.works).toHaveLength(5)
    expect(result.works[0].workId).toBe('work-0')
    expect(result.works[4].workId).toBe('work-4')
  })
})

describe('Cache Key Optimization - OpenLibrary', () => {
  let mockKV
  let mockCtx
  let cacheGetSpy
  let cachePutSpy

  beforeEach(() => {
    vi.clearAllMocks()
    
    cacheGetSpy = vi.fn()
    cachePutSpy = vi.fn()

    mockKV = {
      get: vi.fn().mockResolvedValue(null),
      getWithMetadata: cacheGetSpy.mockResolvedValue({ value: null, metadata: null }),
      put: cachePutSpy.mockResolvedValue(undefined)
    }

    mockCtx = {
      waitUntil: vi.fn()
    }
  })

  it('should use same cache key for different maxResults values', async () => {
    const query = 'The Lord of the Rings'
    const mockEnv = {
      KV_CACHE: mockKV,
      CACHE_HOT_TTL: '7200',
      CACHE_COLD_TTL: '1209600',
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    // Mock fetch for OpenLibrary
    const mockOLResponse = {
      docs: Array(50).fill(null).map((_, i) => ({
        key: `/works/OL${i}W`,
        title: `Test Book ${i}`,
        author_name: ['Test Author'],
        first_publish_year: 2020,
        isbn: [`978000000000${i}`]
      }))
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOLResponse
    })

    // First call with maxResults=15
    await searchOpenLibrary(query, { maxResults: 15 }, mockEnv, mockCtx)

    // Second call with maxResults=30 - should use same cache key
    await searchOpenLibrary(query, { maxResults: 30 }, mockEnv, mockCtx)

    // Both should check the same cache key (without maxResults)
    const expectedCacheKey = 'the lord of the rings'
    expect(cacheGetSpy).toHaveBeenCalledTimes(2)
    
    const firstCallKey = cacheGetSpy.mock.calls[0][0]
    const secondCallKey = cacheGetSpy.mock.calls[1][0]
    
    expect(firstCallKey).toBe(`ol:search:${expectedCacheKey}`)
    expect(secondCallKey).toBe(`ol:search:${expectedCacheKey}`)
    expect(firstCallKey).toBe(secondCallKey)
  })

  it('should cache full result set (100 items for OpenLibrary)', async () => {
    const query = 'Test Query'
    const mockEnv = {
      KV_CACHE: mockKV,
      CACHE_HOT_TTL: '7200',
      CACHE_COLD_TTL: '1209600',
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    const mockOLResponse = {
      docs: Array(100).fill(null).map((_, i) => ({
        key: `/works/OL${i}W`,
        title: `Test Book ${i}`,
        author_name: ['Test Author'],
        first_publish_year: 2020,
        isbn: [`978000000000${i}`]
      }))
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOLResponse
    })

    // Request only 20 results
    await searchOpenLibrary(query, { maxResults: 20 }, mockEnv, mockCtx)

    // Verify that 100 results were requested from API
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const fetchUrl = global.fetch.mock.calls[0][0]
    expect(fetchUrl).toContain('limit=100')

    // Verify that full result set was cached
    expect(cachePutSpy).toHaveBeenCalledTimes(1)
    const cachedValue = cachePutSpy.mock.calls[0][1]
    const parsedCache = JSON.parse(cachedValue)
    
    // Should cache all 100 results, not just the 20 requested
    expect(parsedCache.works).toBeDefined()
    expect(parsedCache.works.length).toBe(100)
  })

  it('should filter cached results to requested maxResults', async () => {
    const query = 'Cached OL Query'
    
    // Create cached data with 100 results
    const cachedData = {
      works: Array(100).fill(null).map((_, i) => ({
        workId: `OL${i}W`,
        title: `Book ${i}`,
        primaryProvider: 'openlibrary'
      })),
      editions: [],
      primaryProvider: 'openlibrary'
    }

    mockKV.getWithMetadata = vi.fn().mockResolvedValue({
      value: JSON.stringify(cachedData),
      metadata: { hotTtlExpiry: Date.now() + 7200000 }
    })

    const mockEnv = {
      KV_CACHE: mockKV,
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined)
        })
      }
    }

    // Request 25 results
    const result1 = await searchOpenLibrary(query, { maxResults: 25 }, mockEnv, mockCtx)
    expect(result1.works).toHaveLength(25)
    expect(result1.works[0].workId).toBe('OL0W')
    expect(result1.works[24].workId).toBe('OL24W')

    // Request 50 results - should get from same cache
    const result2 = await searchOpenLibrary(query, { maxResults: 50 }, mockEnv, mockCtx)
    expect(result2.works).toHaveLength(50)
    expect(result2.works[0].workId).toBe('OL0W')
    expect(result2.works[49].workId).toBe('OL49W')

    // Both should have used the same cached data
    expect(mockKV.getWithMetadata).toHaveBeenCalledTimes(2)
    
    // Should not have called the API
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
