/**
 * Book search handlers with KV caching
 * Migrated from books-api-proxy
 *
 * Caching rules:
 * - Title search: 6 hour TTL (21600 seconds)
 * - ISBN search: 7 day TTL (604800 seconds) - ISBN data is stable
 */

import { CacheKeyFactory } from '../services/cache-key-factory'
import * as externalApis from '../services/external-apis'
import { UnifiedCacheService } from '../services/unified-cache'
import type { Env } from '../types/env'
import { writeCacheMetrics } from '../utils/analytics/analytics'
import { detectImageQuality } from '../utils/book/book-metadata'
import { setCached } from '../utils/cache/cache'
import { transformWorkToGoogleFormat } from '../utils/transform/transform-work'

// ============================================================================
// Types
// ============================================================================

interface SearchOptions {
  maxResults?: number
}

interface CacheHeaderRecord {
  [key: string]: string
}

interface SearchResult {
  kind: string
  totalItems: number
  items: unknown[]
  provider: string
  cached: boolean
  cacheSource?: string
  responseTime: number
  _cacheHeaders: CacheHeaderRecord
}

interface SearchError {
  error: string
  details: string
  items: unknown[]
  _cacheHeaders: CacheHeaderRecord
}

interface WorkItem {
  volumeInfo?: {
    title?: string
    industryIdentifiers?: Array<{ type: string; identifier: string }>
    imageLinks?: {
      thumbnail?: string
      smallThumbnail?: string
    }
  }
}

/**
 * Search books by title with multi-provider orchestration
 *
 * @param title - Book title to search
 * @param options - Search options
 * @param options.maxResults - Maximum results to return (default: 20)
 * @param env - Worker environment bindings
 * @param ctx - Execution context
 * @returns Search results in Google Books format with cache metadata
 */
export async function searchByTitle(
  title: string,
  options: SearchOptions,
  env: Env,
  ctx: ExecutionContext,
): Promise<SearchResult | SearchError> {
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
      cacheSource: source, // Include cache source (EDGE or KV)
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

    let finalItems: unknown[] = []
    const successfulProviders: string[] = []

    // Process Google Books results
    if (results[0].status === 'fulfilled' && results[0].value) {
      const googleData = results[0].value as { works?: unknown[] }
      if (googleData.works && googleData.works.length > 0) {
        const transformedItems = googleData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('google')
      }
    }

    // Process OpenLibrary results
    if (results[1].status === 'fulfilled' && results[1].value) {
      const olData = results[1].value as { works?: unknown[] }
      if (olData.works && olData.works.length > 0) {
        const transformedItems = olData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('openlibrary')
      }
    }

    // Deduplication by ISBN with title fallback
    const dedupedItems = deduplicateByISBN(finalItems)

    const responseData: SearchResult = {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Title search failed for "${title}":`, error)
    return {
      error: 'Title search failed',
      details: errorMessage,
      items: [],
      _cacheHeaders: await generateCacheHeaders(false, 0, 0, [], env),
    }
  }
}

/**
 * Search books by ISBN with multi-provider orchestration
 *
 * @param isbn - ISBN-10 or ISBN-13
 * @param options - Search options
 * @param options.maxResults - Maximum results to return (default: 1)
 * @param env - Worker environment bindings
 * @param ctx - Execution context
 * @returns Book details in Google Books format
 */
export async function searchByISBN(
  isbn: string,
  options: SearchOptions,
  env: Env,
  ctx: ExecutionContext,
): Promise<SearchResult | SearchError> {
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
      cacheSource: source, // Include cache source (EDGE or KV)
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

    let finalItems: unknown[] = []
    const successfulProviders: string[] = []

    // Process Google Books results
    if (results[0].status === 'fulfilled' && results[0].value) {
      const googleData = results[0].value as { works?: unknown[] }
      if (googleData.works && googleData.works.length > 0) {
        const transformedItems = googleData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('google')
      }
    }

    // Process OpenLibrary results
    if (results[1].status === 'fulfilled' && results[1].value) {
      const olData = results[1].value as { works?: unknown[] }
      if (olData.works && olData.works.length > 0) {
        const transformedItems = olData.works.map((work) => transformWorkToGoogleFormat(work))
        finalItems = [...finalItems, ...transformedItems]
        successfulProviders.push('openlibrary')
      }
    }

    // Simple deduplication by ISBN
    const dedupedItems = deduplicateByISBN(finalItems)

    const responseData: SearchResult = {
      kind: 'books#volumes',
      totalItems: dedupedItems.length,
      items: dedupedItems.slice(0, maxResults),
      provider: `orchestrated:${successfulProviders.join('+')}`,
      cached: false,
      responseTime: Date.now() - startTime,
      _cacheHeaders: await generateCacheHeaders(false, 0, 7 * 24 * 60 * 60, dedupedItems, env), // TTL: 7d
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`ISBN search failed for "${isbn}":`, error)
    return {
      error: 'ISBN search failed',
      details: errorMessage,
      items: [],
      _cacheHeaders: await generateCacheHeaders(false, 0, 0, [], env),
    }
  }
}

/**
 * Deduplicate items by ISBN with title fallback.
 * For books without ISBNs (common for pre-1970 books), falls back to title deduplication.
 *
 * @param items - Items to deduplicate
 * @returns Deduplicated items array
 */
function deduplicateByISBN(items: unknown[]): unknown[] {
  const seen = new Set<string>()
  const seenTitles = new Set<string>()

  return items.filter((item) => {
    const workItem = item as WorkItem
    const identifiers = workItem.volumeInfo?.industryIdentifiers || []
    const isbns = identifiers
      .filter((id) => id.type === 'ISBN_13' || id.type === 'ISBN_10')
      .map((id) => id.identifier)

    // If book has ISBNs, dedupe by ISBN
    if (isbns && isbns.length > 0) {
      const hasNewISBN = isbns.some((isbnValue) => {
        const normalized = isbnValue.replace(/[-\s]/g, '')
        if (seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      return hasNewISBN
    }

    // Fallback: If no ISBN, dedupe by normalized title
    if (workItem.volumeInfo?.title) {
      const normalizedTitle = workItem.volumeInfo.title
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
 *
 * @param cacheHit - Whether request was served from cache
 * @param age - Cache age in seconds
 * @param ttl - Cache TTL in seconds
 * @param items - Search result items for quality analysis
 * @param env - Worker environment bindings
 * @returns Headers object
 */
async function generateCacheHeaders(
  cacheHit: boolean,
  age: number,
  ttl: number,
  items: unknown[] = [],
  env: Env,
): Promise<CacheHeaderRecord> {
  const headers: CacheHeaderRecord = {}

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
 * Analyzes cover image quality from URLs (provider-agnostic).
 * Uses detectImageQuality utility for accurate dimension-based analysis.
 *
 * @param items - Search result items in Google Books format
 * @param env - Worker environment bindings
 * @returns Quality level: 'high' | 'medium' | 'low' | 'missing'
 */
async function analyzeImageQuality(items: unknown[], env: Env): Promise<string> {
  if (!items || items.length === 0) return 'missing'

  // Collect all cover URLs for parallel processing
  const coverUrls = items.map((item) => {
    const workItem = item as WorkItem
    const imageLinks = workItem.volumeInfo?.imageLinks
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
 * Calculates data completeness percentage.
 *
 * @param items - Search result items in Google Books format
 * @returns Percentage (0-100) of items with ISBN + cover
 */
function calculateDataCompleteness(items: unknown[]): number {
  if (!items || items.length === 0) return 0

  let completeCount = 0

  for (const item of items) {
    const workItem = item as WorkItem
    const volumeInfo = workItem.volumeInfo
    const hasISBN = (volumeInfo?.industryIdentifiers?.length || 0) > 0
    const hasCover = volumeInfo?.imageLinks?.thumbnail || volumeInfo?.imageLinks?.smallThumbnail

    if (hasISBN && hasCover) {
      completeCount++
    }
  }

  return Math.round((completeCount / items.length) * 100)
}
