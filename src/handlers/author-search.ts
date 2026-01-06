/**
 * Author bibliography search handler with pagination
 * Uses OpenLibrary API for author work lookups
 */

import { CacheKeyFactory } from '../services/cache-key-factory'
import * as externalApis from '../services/external-apis'
import { UnifiedCacheService } from '../services/unified-cache'
import type { Env } from '../types/env.js'
import { writeCacheMetrics } from '../utils/analytics/analytics'
import { setCached } from '../utils/cache/cache'

// ============================================================================
// Types
// ============================================================================

interface AuthorSearchOptions {
  limit?: number
  offset?: number
  sortBy?: 'publicationYear' | 'publicationYearAsc' | 'title' | 'popularity'
}

interface AuthorInfo {
  name: string
  openLibraryKey: string | null
  totalWorks: number
}

interface PaginationInfo {
  total: number
  limit: number
  offset: number
  hasMore: boolean
  nextOffset: number | null
}

interface AuthorSearchResult {
  success: boolean
  provider: string
  author: AuthorInfo
  works: unknown[]
  pagination: PaginationInfo
  cached: boolean
  cacheSource?: string
  responseTime: number
}

interface AuthorSearchError {
  success: boolean
  error: string
  details?: string
  works: unknown[]
  pagination: null
}

interface WorkItem {
  title?: string
  firstPublicationYear?: number
  editions?: unknown[]
}

/**
 * Search books by author with pagination.
 *
 * @param authorName - Author name to search
 * @param options - Search options
 * @param options.limit - Results per page (default: 50, max: 100)
 * @param options.offset - Pagination offset (default: 0)
 * @param options.sortBy - Sort order (publicationYear, title, popularity)
 * @param env - Worker environment bindings
 * @param ctx - Execution context
 * @returns Author bibliography with pagination and cache metadata
 */
export async function searchByAuthor(
  authorName: string,
  options: AuthorSearchOptions,
  env: Env,
  ctx: ExecutionContext,
): Promise<AuthorSearchResult | AuthorSearchError> {
  const { limit = 50, offset = 0, sortBy = 'publicationYear' } = options

  // Validate pagination parameters
  const validatedLimit = Math.min(Math.max(1, limit), 100)
  const validatedOffset = Math.max(0, offset)

  // Generate cache key using centralized CacheKeyFactory
  const cacheKey = CacheKeyFactory.authorSearch({
    query: authorName,
    maxResults: validatedLimit,
    showAllEditions: false, // Assuming default, adjust if needed
    sortBy: sortBy,
  })

  // Try UnifiedCache first (Edge → KV tiers)
  const cache = new UnifiedCacheService(env, ctx)
  const cachedResult = await cache.get(cacheKey, 'author', {
    query: authorName,
    limit: validatedLimit,
    offset: validatedOffset,
  })

  if (cachedResult?.data) {
    const { data, source } = cachedResult
    const cachedData = data as { works?: unknown[]; authorName?: string }

    // Write cache metrics
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/author',
        cacheHit: true,
        responseTime: 0,
        itemCount: cachedData.works?.length || 0,
        imageQuality: '',
        dataCompleteness: 0,
      }),
    )

    return {
      ...cachedData,
      cached: true,
      cacheSource: source,
    } as AuthorSearchResult
  }

  const startTime = Date.now()

  try {
    // Call existing OpenLibrary function
    const olResult = await externalApis.getOpenLibraryAuthorWorks(authorName, env)

    if (!olResult) {
      return {
        success: false,
        error: 'Author not found in OpenLibrary',
        works: [],
        pagination: null,
      }
    }

    // Apply pagination to works
    const allWorks = (olResult.works || []) as WorkItem[]
    const totalWorks = allWorks.length

    // Apply sorting
    const sortedWorks = applySorting(allWorks, sortBy)

    // Slice for pagination
    const paginatedWorks = sortedWorks.slice(validatedOffset, validatedOffset + validatedLimit)

    const responseData: AuthorSearchResult = {
      success: true,
      provider: 'openlibrary',
      author: {
        name: authorName,
        openLibraryKey:
          (olResult.author as { openLibraryKey?: string | null })?.openLibraryKey || null,
        totalWorks: totalWorks,
      },
      works: paginatedWorks,
      pagination: {
        total: totalWorks,
        limit: validatedLimit,
        offset: validatedOffset,
        hasMore: validatedOffset + validatedLimit < totalWorks,
        nextOffset:
          validatedOffset + validatedLimit < totalWorks ? validatedOffset + validatedLimit : null,
      },
      cached: false,
      responseTime: Date.now() - startTime,
    }

    // Cache for 6 hours (per-page caching)
    const ttl = 6 * 60 * 60 // 21600 seconds
    ctx.waitUntil(setCached(cacheKey, responseData, ttl, env, ctx))

    // Write cache metrics
    ctx.waitUntil(
      writeCacheMetrics(env, {
        endpoint: '/search/author',
        cacheHit: false,
        responseTime: Date.now() - startTime,
        itemCount: paginatedWorks.length,
        imageQuality: '',
        dataCompleteness: 0,
      }),
    )

    return responseData
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Author search failed for "${authorName}":`, error)
    return {
      success: false,
      error: 'Author search failed',
      details: errorMessage,
      works: [],
      pagination: null,
    }
  }
}

/**
 * Apply sorting to works array.
 *
 * @param works - Array of work objects
 * @param sortBy - Sort order
 * @returns Sorted works
 */
function applySorting(
  works: WorkItem[],
  sortBy?: 'publicationYear' | 'publicationYearAsc' | 'title' | 'popularity',
): WorkItem[] {
  const sortedWorks = [...works]

  switch (sortBy) {
    case 'publicationYear':
      // Newest first (default)
      return sortedWorks.sort(
        (a, b) => (b.firstPublicationYear || 0) - (a.firstPublicationYear || 0),
      )

    case 'publicationYearAsc':
      // Oldest first
      return sortedWorks.sort(
        (a, b) => (a.firstPublicationYear || 0) - (b.firstPublicationYear || 0),
      )

    case 'title':
      // Alphabetical
      return sortedWorks.sort((a, b) => (a.title || '').localeCompare(b.title || ''))

    case 'popularity':
      // Sort by number of editions (proxy for popularity)
      return sortedWorks.sort((a, b) => (b.editions?.length || 0) - (a.editions?.length || 0))

    default:
      return sortedWorks
  }
}
