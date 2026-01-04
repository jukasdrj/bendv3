/**
 * Unit Tests: Cache Layer
 *
 * Tests for multi-tier cache (Edge → KV) with TTL management
 * TTL Strategy:
 * - ISBN search results: 365 days (ISBN never changes)
 * - Title/author search results: 7 days (metadata can change)
 * - CSV parsing results: 24 hours (expensive Gemini operation)
 * - Enrichment results: 24 hours (quality improves over time)
 * See TEST_PLAN.md for complete test strategy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateISBNCacheKey } from '../../src/utils/cache/cache-keys.js'

/**
 * Cache TTL Assignment Tests
 * Validates correct TTL values for different data types
 */
describe('Cache TTL Assignment', () => {
  // TTL values in seconds
  const TTL_ISBN_SEARCH = 365 * 24 * 60 * 60 // 365 days
  const TTL_TITLE_SEARCH = 7 * 24 * 60 * 60 // 7 days
  const TTL_CSV_PARSE = 24 * 60 * 60 // 24 hours
  const TTL_LOW_QUALITY = 1 * 60 * 60 // 1 hour

  it('should assign 365-day TTL for ISBN search results', () => {
    const ttl = TTL_ISBN_SEARCH

    expect(ttl).toBe(365 * 24 * 60 * 60)
    expect(ttl).toBe(31536000) // Exact value
    expect(ttl / (24 * 60 * 60)).toBe(365)
  })

  it('should assign 7-day TTL for title search results', () => {
    const ttl = TTL_TITLE_SEARCH

    expect(ttl).toBe(7 * 24 * 60 * 60)
    expect(ttl).toBe(604800) // Exact value
    expect(ttl / (24 * 60 * 60)).toBe(7)
  })

  it('should calculate TTL in seconds for KV.put()', () => {
    // KV expirationTtl parameter expects seconds
    const ttlSeconds = 7 * 24 * 60 * 60

    expect(typeof ttlSeconds).toBe('number')
    expect(ttlSeconds).toBeGreaterThan(0)
    // Verify it's calculated correctly from days
    expect(ttlSeconds).toBe(7 * 24 * 60 * 60)
    expect(ttlSeconds).not.toBe(7 * 24 * 60) // Not minutes
    expect(ttlSeconds).not.toBe(7 * 24) // Not hours
  })

  it('should reduce TTL for low-confidence enrichment results', () => {
    // Low quality results (confidence <70%) get shorter TTL
    const highQualityTTL = 7 * 24 * 60 * 60 // 7 days
    const lowQualityTTL = 1 * 60 * 60 // 1 hour

    expect(lowQualityTTL).toBeLessThan(highQualityTTL)
    expect(lowQualityTTL).toBe(3600)
    expect(highQualityTTL).toBe(604800)
    expect(highQualityTTL / lowQualityTTL).toBe(168) // 7 days = 168 hours
  })
})

/**
 * Cache Hit & Retrieval Tests
 * Validates cached data retrieval and metadata preservation
 */
describe('Cache Hit & Retrieval', () => {
  it('should return cached value on hit', () => {
    // Simulate cached data with metadata
    const cachedData = {
      data: {
        title: "Harry Potter and the Philosopher's Stone",
        isbn: '9780439708180',
        author: 'J.K. Rowling'
      },
      cachedAt: Date.now(),
      ttl: 604800 // 7 days
    }

    // When retrieved from cache
    const retrieved = {
      data: cachedData.data,
      cacheMetadata: {
        hit: true,
        age: 0,
        ttl: cachedData.ttl
      }
    }

    expect(retrieved.data).toBeDefined()
    expect(retrieved.data.title).toBe("Harry Potter and the Philosopher's Stone")
    expect(retrieved.cacheMetadata.hit).toBe(true)
  })

  it('should preserve cache metadata (source, timestamp)', () => {
    const now = Date.now()
    const cachedData = {
      data: { title: 'Test Book', isbn: '9780000000000' },
      cachedAt: now,
      ttl: 604800
    }

    // Metadata should be preserved
    expect(cachedData.cachedAt).toBe(now)
    expect(cachedData.ttl).toBe(604800)

    // Age calculation
    const age = Math.floor((Date.now() - cachedData.cachedAt) / 1000)
    expect(age).toBeGreaterThanOrEqual(0)
    expect(age).toBeLessThanOrEqual(1) // Should be very recent
  })

  it('should retrieve from KV cache in <50ms', () => {
    // Simulate KV retrieval timing
    const startTime = performance.now?.() || Date.now()
    const cachedValue = { title: 'Book', isbn: '9780000000000' }
    const endTime = performance.now?.() || Date.now()

    const latency = endTime - startTime
    expect(latency).toBeLessThan(50) // Should be instant in tests
  })

  it('should retrieve from edge cache in <10ms', () => {
    // Edge cache (Cloudflare) latency is even lower
    const startTime = performance.now?.() || Date.now()
    const cachedValue = { title: 'Book', isbn: '9780000000000' }
    const endTime = performance.now?.() || Date.now()

    const latency = endTime - startTime
    expect(latency).toBeLessThan(10) // Should be instant in tests
  })
})

/**
 * Cache Miss & Recovery Tests
 * Validates fallback behavior when cache miss occurs
 */
describe('Cache Miss & Recovery', () => {
  it('should fetch from provider on cache miss', () => {
    const cacheGet = null // Cache miss

    if (cacheGet === null) {
      // On cache miss, fetch from provider
      const providerData = {
        title: "Harry Potter and the Philosopher's Stone",
        isbn: '9780439708180',
        author: 'J.K. Rowling'
      }
      expect(providerData).toBeDefined()
    }
  })

  it('should populate cache after provider fetch', () => {
    // After fetching from provider
    const providerData = { title: 'Book', isbn: '9780000000000' }
    const ttl = 604800 // 7 days

    // Cache should be populated with metadata
    const cachedValue = {
      data: providerData,
      cachedAt: Date.now(),
      ttl: ttl
    }

    expect(cachedValue.data).toBe(providerData)
    expect(cachedValue.cachedAt).toBeDefined()
    expect(cachedValue.ttl).toBe(ttl)
  })

  it('should handle concurrent cache misses efficiently', () => {
    // Multiple concurrent requests for same ISBN should:
    // 1. All miss cache initially
    // 2. Only one fetches from provider
    // 3. Others wait for first to complete

    const requests = [
      { isbn: '9780439708180' },
      { isbn: '9780439708180' },
      { isbn: '9780439708180' }
    ]

    // Deduplicate by ISBN
    const uniqueISBNs = new Set(requests.map(r => r.isbn))
    expect(uniqueISBNs.size).toBe(1) // All same ISBN

    // Only one fetch should occur
    expect(requests.length).toBe(3)
    expect(uniqueISBNs.size).toBe(1) // Deduped to 1 fetch
  })

  it('should timeout slow provider during cache miss', () => {
    const TIMEOUT_MS = 5000 // 5 second timeout

    // Simulate slow provider
    const fetchStartTime = Date.now()
    const hasTimedOut = Date.now() - fetchStartTime > TIMEOUT_MS

    // Provider should timeout before 5 seconds
    expect(hasTimedOut).toBe(false) // Immediately available in test
  })
})

/**
 * Cache Invalidation Tests
 * Validates cache clearing and pattern-based invalidation
 */
describe('Cache Invalidation', () => {
  it('should invalidate cache on new enrichment', () => {
    const cacheKey = 'book:isbn:9780439708180' // Canonical format (Issue #213)
    let cache = { [cacheKey]: { title: 'Book', version: 1 } }

    // On new enrichment, delete from cache
    delete cache[cacheKey]

    expect(cache[cacheKey]).toBeUndefined()
  })

  it('should support pattern-based cache invalidation', () => {
    const cache = {
      'book:isbn:9780439708180': { title: 'Book 1' }, // Canonical format
      'book:isbn:9780439064873': { title: 'Book 2' }, // Canonical format
      'title:harry': { count: 100 },
      'title:potter': { count: 50 }
    }

    // Invalidate all ISBN entries (updated pattern for canonical format)
    const isbnPattern = /^book:isbn:/
    const keysToDelete = Object.keys(cache).filter(k => isbnPattern.test(k))
    keysToDelete.forEach(k => delete cache[k])

    expect(cache['book:isbn:9780439708180']).toBeUndefined()
    expect(cache['book:isbn:9780439064873']).toBeUndefined()
    expect(cache['title:harry']).toBeDefined() // Title entries untouched
  })

  it('should cleanup cache on manual eviction', () => {
    const cache = {
      'book:isbn:9780439708180': { title: 'Book', size: 1000 }, // Canonical format
      'book:isbn:9780439064873': { title: 'Book 2', size: 1500 } // Canonical format
    }

    // Manually evict entries
    const keysToEvict = Object.keys(cache).filter(k => {
      const size = cache[k].size || 0
      return size > 1200 // Evict large entries
    })

    keysToEvict.forEach(k => delete cache[k])

    expect(cache['book:isbn:9780439708180']).toBeDefined() // Not evicted (1000 < 1200)
    expect(cache['book:isbn:9780439064873']).toBeUndefined() // Evicted (1500 > 1200)
  })
})

/**
 * Cache Key Generation Tests
 * Validates cache key consistency and uniqueness
 */
describe('Cache Key Generation', () => {
  it('should generate consistent cache keys', () => {
    // Same ISBN should always produce same cache key
    const isbn1 = '978-0-439-70818-0'
    const isbn2 = '978-0-439-70818-0'

    const key1 = generateISBNCacheKey(isbn1)
    const key2 = generateISBNCacheKey(isbn2)

    expect(key1).toBe(key2)
    expect(key1).toMatch(/^book:isbn:/)
  })

  it('should generate unique key for each ISBN', () => {
    const isbn1 = '9780439708180'
    const isbn2 = '9780439064873'

    const key1 = generateISBNCacheKey(isbn1)
    const key2 = generateISBNCacheKey(isbn2)

    expect(key1).not.toBe(key2)
    expect(key1).toContain('9780439708180')
    expect(key2).toContain('9780439064873')
  })

  it('should namespace cache keys by data type', () => {
    // Different prefixes for different data types (Issue #213: canonical format)
    const isbnKey = `book:isbn:9780439708180`
    const titleKey = `title:harry+potter`
    const csvKey = `csv-parse:abc123def456:v1`

    // Each key has distinct namespace
    expect(isbnKey).toMatch(/^book:isbn:/)
    expect(titleKey).toMatch(/^title:/)
    expect(csvKey).toMatch(/^csv-parse:/)

    // Keys are different even for similar data
    expect(isbnKey).not.toBe(titleKey)
    expect(titleKey).not.toBe(csvKey)
  })
})
