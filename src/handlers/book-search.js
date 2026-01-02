/**
 * Book search handlers with KV caching
 * Migrated from books-api-proxy
 *
 * Caching rules:
 * - Title search: 6 hour TTL (21600 seconds)
 * - ISBN search: 7 day TTL (604800 seconds) - ISBN data is stable
 */

import { CacheKeyFactory } from '../services/cache-key-factory.ts'
import * as externalApis from '../services/external-apis.ts'
import { UnifiedCacheService } from '../services/unified-cache.js'
import { writeCacheMetrics } from '../utils/analytics.ts'
import { detectImageQuality } from '../utils/book-metadata.ts'
import { setCached } from '../utils/cache.js'
import { transformWorkToGoogleFormat } from '../utils/transform-work.js'

/**
 * Search books by title with multi-provider orchestration
 * @param {string} title - Book title to search
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results to return (default: 20)
 * @param {Object} env - Worker environment bindings
 * @param {Object} ctx - Execution context
 * @returns {Promise<{
 *   kind: string,
 *   totalItems: number,
 *   items: Array<any>,
 *   provider: string,
 *   cached: boolean,
 *   cacheSource?: string,
 *   responseTime: number,
 *   _cacheHeaders: Record<string, string>
 * }>} Search results in Google Books format with cache metadata
 */
export async function searchByTitle(title, options, env, ctx) {
  const { maxResults = 20 } = options
  const cacheKey = CacheKeyFactory.bookTitle(title, maxResults)

  // Try UnifiedCache first (Edge → KV tiers)
  const cache = new UnifiedCacheService(env, ctx)
  const cachedResult = await cache.get(cacheKey, 'title', {
    query: title,
    maxResults,
  })

  if (cachedResult?.data) {
    const { data, source } = cachedResult
    const headers = await generateCacheHeaders(
      true,
      cachedResult.age || 0,
      cachedResult.ttl || 0,
      data.items,
      env,
    )

    // Write cache metrics to Analytics Engine
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/title',
        cacheHit: true,
        responseTime: 0, // Cache hits are instant
        imageQuality: headers['X-Image-Quality'],
        dataCompleteness: parseInt(headers['X-Data-Completeness'], 10),
        itemCount: data.items?.length || 0,
      }),
    )

    return {
      ...data,
      cached: true,
      cacheSource: source, // NEW: Include cache source (EDGE or KV)
      _cacheHeaders: headers,
    }
  }

  const startTime = Date.now()

  try {
    // Search both Google Books and OpenLibrary in parallel
    const searchPromises = [
      externalApis.searchGoogleBooks(title, { maxResults }, env),
      externalApis.searchOpenLibrary(title, { maxResults }, env),
    ]

    const results = await Promise.allSettled(searchPromises)

    let finalItems = []
    const successfulProviders = []

    // Process Google Books results
    if (results[0].status === 'fulfilled' && results[0].value) {
      const googleData = results[0].value
      // NormalizedResponse has works/editions structure, not items
      if (googleData.works && googleData.works.length > 0) {
        // Transform works to Google Books format
        const transformedItems = googleData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('google')
      }
    }

    // Process OpenLibrary results
    if (results[1].status === 'fulfilled' && results[1].value) {
      const olData = results[1].value
      if (olData.works && olData.works.length > 0) {
        // Transform OpenLibrary works to Google Books format
        const transformedItems = olData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('openlibrary')
      }
    }

    // Deduplication by ISBN with title fallback
    const dedupedItems = deduplicateByISBN(finalItems)

    /**
     * @type {{
     *   kind: string,
     *   totalItems: number,
     *   items: Array<any>,
     *   provider: string,
     *   cached: boolean,
     *   responseTime: number,
     *   _cacheHeaders: Record<string, string>
     * }}
     */
    const responseData = {
      kind: 'books#volumes',
      totalItems: dedupedItems.length,
      items: dedupedItems.slice(0, maxResults),
      provider: `orchestrated:${successfulProviders.join('+')}`,
      cached: false,
      responseTime: Date.now() - startTime,
      _cacheHeaders: await generateCacheHeaders(false, 0, 6 * 60 * 60, dedupedItems, env), // TTL: 6h
    }

    // Cache for 6 hours
    const ttl = 6 * 60 * 60 // 21600 seconds
    const hotTtl = 2 * 60 * 60 // 2 hours (for TTL effectiveness tracking)
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env, ctx, hotTtl))

    // Write cache metrics to Analytics Engine
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/title',
        cacheHit: false,
        responseTime: Date.now() - startTime,
        imageQuality: responseData._cacheHeaders['X-Image-Quality'],
        dataCompleteness: parseInt(responseData._cacheHeaders['X-Data-Completeness'], 10),
        itemCount: dedupedItems.length,
      }),
    )

    return responseData
  } catch (error) {
    console.error(`Title search failed for "${title}":`, error)
    return {
      error: 'Title search failed',
      details: error.message,
      items: [],
      _cacheHeaders: generateCacheHeaders(false, 0, 0, []),
    }
  }
}

/**
 * Search books by ISBN with multi-provider orchestration
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum results to return (default: 1)
 * @param {Object} env - Worker environment bindings
 * @param {Object} ctx - Execution context
 * @returns {Promise<Object>} Book details in Google Books format
 */
export async function searchByISBN(isbn, options, env, ctx) {
  const { maxResults = 1 } = options
  const cacheKey = CacheKeyFactory.bookISBN(isbn)

  // Try UnifiedCache first (Edge → KV tiers)
  const cache = new UnifiedCacheService(env, ctx)
  const cachedResult = await cache.get(cacheKey, 'isbn', {
    query: isbn,
    maxResults,
  })

  if (cachedResult?.data) {
    const { data, source } = cachedResult
    const headers = await generateCacheHeaders(
      true,
      cachedResult.age || 0,
      cachedResult.ttl || 0,
      data.items,
      env,
    )

    // Write cache metrics to Analytics Engine
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/isbn',
        isbn: isbn, // Log actual ISBN for daily harvest
        cacheHit: true,
        responseTime: 0, // Cache hits are instant
        imageQuality: headers['X-Image-Quality'],
        dataCompleteness: parseInt(headers['X-Data-Completeness'], 10),
        itemCount: data.items?.length || 0,
      }),
    )

    return {
      ...data,
      cached: true,
      cacheSource: source, // NEW: Include cache source (EDGE or KV)
      _cacheHeaders: headers,
    }
  }

  const startTime = Date.now()

  try {
    // Search both Google Books and OpenLibrary in parallel
    const searchPromises = [
      externalApis.searchGoogleBooksByISBN(isbn, env),
      externalApis.searchOpenLibrary(isbn, { maxResults, isbn }, env),
    ]

    const results = await Promise.allSettled(searchPromises)

    let finalItems = []
    const successfulProviders = []

    // Process Google Books results
    if (results[0].status === 'fulfilled' && results[0].value) {
      const googleData = results[0].value
      // NormalizedResponse has works/editions structure, not items
      if (googleData.works && googleData.works.length > 0) {
        const transformedItems = googleData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('google')
      }
    }

    // Process OpenLibrary results
    if (results[1].status === 'fulfilled' && results[1].value) {
      const olData = results[1].value
      if (olData.works && olData.works.length > 0) {
        const transformedItems = olData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('openlibrary')
      }
    }

    // Simple deduplication by ISBN
    const dedupedItems = deduplicateByISBN(finalItems)

    const responseData = {
      kind: 'books#volumes',
      totalItems: dedupedItems.length,
      items: dedupedItems.slice(0, maxResults),
      provider: `orchestrated:${successfulProviders.join('+')}`,
      cached: false,
      responseTime: Date.now() - startTime,
      _cacheHeaders: generateCacheHeaders(false, 0, 7 * 24 * 60 * 60, dedupedItems), // TTL: 7d
    }

    // Cache for 7 days (ISBN data is stable)
    const ttl = 7 * 24 * 60 * 60 // 604800 seconds
    const hotTtl = 2 * 24 * 60 * 60 // 2 days (for TTL effectiveness tracking)
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env, ctx, hotTtl))

    // Write cache metrics to Analytics Engine
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/isbn',
        isbn: isbn, // Log actual ISBN for daily harvest
        cacheHit: false,
        responseTime: Date.now() - startTime,
        imageQuality: responseData._cacheHeaders['X-Image-Quality'],
        dataCompleteness: parseInt(responseData._cacheHeaders['X-Data-Completeness'], 10),
        itemCount: dedupedItems.length,
      }),
    )

    return responseData
  } catch (error) {
    console.error(`ISBN search failed for "${isbn}":`, error)
    return {
      error: 'ISBN search failed',
      details: error.message,
      items: [],
      _cacheHeaders: generateCacheHeaders(false, 0, 0, []),
    }
  }
}

/**
 * Deduplicate items by title (case-insensitive)
 */
function _deduplicateByTitle(items) {
  const seen = new Set()
  return items.filter((item) => {
    const title = item.volumeInfo?.title?.toLowerCase() || ''
    if (seen.has(title)) {
      return false
    }
    seen.add(title)
    return true
  })
}

/**
 * Deduplicate items by ISBN with title fallback
 * For books without ISBNs (common for pre-1970 books), falls back to title deduplication
 */
function deduplicateByISBN(items) {
  const seen = new Set()
  const seenTitles = new Set()

  return items.filter((item) => {
    const identifiers = item.volumeInfo?.industryIdentifiers || []
    const isbns = identifiers
      .filter((id) => id.type === 'ISBN_13' || id.type === 'ISBN_10')
      .map((id) => id.identifier)

    // If book has ISBNs, dedupe by ISBN
    if (isbns && isbns.length > 0) {
      const hasNewISBN = isbns.some((isbn) => {
        const normalized = isbn.replace(/[-\s]/g, '')
        if (seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      return hasNewISBN
    }

    // Fallback: If no ISBN, dedupe by normalized title
    if (item.volumeInfo?.title) {
      const normalizedTitle = item.volumeInfo.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .trim()

      if (seenTitles.has(normalizedTitle)) {
        return false // Duplicate title
      }
      seenTitles.add(normalizedTitle)
      return true
    }

    // Edge case: No ISBN and no title - keep it
    return true
  })
}

/**
 * Generate cache health headers for response
 * @param {boolean} cacheHit - Whether request was served from cache
 * @param {number} age - Cache age in seconds
 * @param {number} ttl - Cache TTL in seconds
 * @param {Array} items - Search result items for quality analysis
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Object>} Headers object
 */
async function generateCacheHeaders(cacheHit, age, ttl, items = [], env) {
  const headers = {}

  // Cache status
  headers['X-Cache-Status'] = cacheHit ? 'HIT' : 'MISS'

  // Cache age (seconds since write)
  headers['X-Cache-Age'] = age.toString()

  // Cache TTL (remaining seconds before expiry)
  headers['X-Cache-TTL'] = ttl.toString()

  // Image quality analysis (provider-agnostic)
  const imageQuality = await analyzeImageQuality(items, env)
  headers['X-Image-Quality'] = imageQuality

  // Data completeness (% with ISBN + cover)
  const completeness = calculateDataCompleteness(items)
  headers['X-Data-Completeness'] = completeness.toString()

  return headers
}

/**
 * Analyzes cover image quality from URLs (provider-agnostic)
 * Uses detectImageQuality utility for accurate dimension-based analysis
 *
 * @param {Array} items - Search result items in Google Books format
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<string>} 'high' | 'medium' | 'low' | 'missing'
 */
async function analyzeImageQuality(items, env) {
  if (!items || items.length === 0) return 'missing'

  // Collect all cover URLs for parallel processing
  const coverUrls = items.map((item) => {
    const imageLinks = item.volumeInfo?.imageLinks
    return imageLinks?.thumbnail || imageLinks?.smallThumbnail || ''
  })

  // Detect quality for all covers in parallel (with 2s timeout per image)
  const qualityResults = await Promise.all(coverUrls.map((url) => detectImageQuality(url, env)))

  // Count quality levels
  let highCount = 0
  let mediumCount = 0
  let _lowCount = 0
  let missingCount = 0

  for (const result of qualityResults) {
    switch (result.quality) {
      case 'high':
        highCount++
        break
      case 'medium':
        mediumCount++
        break
      case 'low':
        _lowCount++
        break
      case 'missing':
        missingCount++
        break
    }
  }

  // Return dominant quality level
  const total = items.length
  if (highCount / total > 0.5) return 'high'
  if (mediumCount / total > 0.3) return 'medium'
  if (missingCount / total > 0.5) return 'missing'
  return 'low'
}

/**
 * Calculates data completeness percentage
 * @param {Array} items - Search result items in Google Books format
 * @returns {number} Percentage (0-100) of items with ISBN + cover
 */
function calculateDataCompleteness(items) {
  if (!items || items.length === 0) return 0

  let completeCount = 0

  for (const item of items) {
    const volumeInfo = item.volumeInfo
    const hasISBN = volumeInfo?.industryIdentifiers?.length > 0
    const hasCover = volumeInfo?.imageLinks?.thumbnail || volumeInfo?.imageLinks?.smallThumbnail

    if (hasISBN && hasCover) {
      completeCount++
    }
  }

  return Math.round((completeCount / items.length) * 100)
}

// writeCacheMetrics moved to src/utils/analytics.js for reuse across handlers
