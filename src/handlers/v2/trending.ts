/**
 * V2 Trending Handler
 *
 * Trending searches and books endpoints for iOS discovery features.
 *
 * GET /api/v2/trending/searches - Popular search queries
 * GET /api/v2/trending/books - Trending books based on user activity
 *
 * Uses unified ResponseEnvelope format with success discriminator.
 */

import type { Env } from '../../types/env'
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/response-builder'

// ============================================================================
// Types
// ============================================================================

export interface TrendingSearch {
  query: string
  searchCount: number
  category?: string
}

export interface TrendingBook {
  isbn: string
  title: string
  authors: string[]
  coverUrl?: string
  trendScore: number
  reason?: string
}

export interface TrendingSearchesResponse {
  searches: TrendingSearch[]
  timeRange: string
  generatedAt: string
}

export interface TrendingBooksResponse {
  books: TrendingBook[]
  timeRange: string
  generatedAt: string
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY_TRENDING_SEARCHES = 'trending:searches'
const CACHE_KEY_TRENDING_BOOKS = 'trending:books'
const CACHE_TTL_SECONDS = 6 * 60 * 60 // 6 hours

// Curated fallback data for when no analytics data is available
const CURATED_TRENDING_SEARCHES: TrendingSearch[] = [
  { query: 'Harry Potter', searchCount: 1250, category: 'Fantasy' },
  { query: 'Stephen King', searchCount: 980, category: 'Horror' },
  { query: 'Colleen Hoover', searchCount: 875, category: 'Romance' },
  { query: 'Fourth Wing', searchCount: 820, category: 'Fantasy' },
  { query: 'Taylor Jenkins Reid', searchCount: 750, category: 'Fiction' },
  { query: 'Brandon Sanderson', searchCount: 720, category: 'Fantasy' },
  { query: 'Iron Flame', searchCount: 690, category: 'Fantasy' },
  { query: 'Atomic Habits', searchCount: 650, category: 'Self-Help' },
  { query: 'The Hunger Games', searchCount: 620, category: 'Young Adult' },
  { query: 'Rebecca Yarros', searchCount: 580, category: 'Romance' },
]

const CURATED_TRENDING_BOOKS: TrendingBook[] = [
  {
    isbn: '9781649374042',
    title: 'Fourth Wing',
    authors: ['Rebecca Yarros'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781649374042-L.jpg',
    trendScore: 98,
    reason: 'TikTok sensation, #1 bestseller',
  },
  {
    isbn: '9781649374172',
    title: 'Iron Flame',
    authors: ['Rebecca Yarros'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781649374172-L.jpg',
    trendScore: 95,
    reason: 'Most anticipated sequel of 2023',
  },
  {
    isbn: '9781501110368',
    title: 'It Ends with Us',
    authors: ['Colleen Hoover'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781501110368-L.jpg',
    trendScore: 92,
    reason: '#BookTok favorite',
  },
  {
    isbn: '9780593441282',
    title: 'Tomorrow, and Tomorrow, and Tomorrow',
    authors: ['Gabrielle Zevin'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780593441282-L.jpg',
    trendScore: 89,
    reason: 'Award-winning literary fiction',
  },
  {
    isbn: '9780735211292',
    title: 'Atomic Habits',
    authors: ['James Clear'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
    trendScore: 87,
    reason: 'Perennial bestseller',
  },
  {
    isbn: '9781982137274',
    title: 'The Seven Husbands of Evelyn Hugo',
    authors: ['Taylor Jenkins Reid'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781982137274-L.jpg',
    trendScore: 85,
    reason: 'Modern classic, book club favorite',
  },
  {
    isbn: '9780593135204',
    title: 'A Court of Thorns and Roses',
    authors: ['Sarah J. Maas'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg',
    trendScore: 83,
    reason: 'Fantasy romance phenomenon',
  },
  {
    isbn: '9781250178602',
    title: 'The Midnight Library',
    authors: ['Matt Haig'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781250178602-L.jpg',
    trendScore: 80,
    reason: 'Uplifting and thought-provoking',
  },
  {
    isbn: '9780063021426',
    title: 'Lessons in Chemistry',
    authors: ['Bonnie Garmus'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780063021426-L.jpg',
    trendScore: 78,
    reason: 'Soon to be Apple TV+ series',
  },
  {
    isbn: '9780593334836',
    title: 'The House in the Pines',
    authors: ['Ana Reyes'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780593334836-L.jpg',
    trendScore: 75,
    reason: 'Gripping psychological thriller',
  },
]

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/v2/trending/searches
 *
 * Returns trending search queries based on user activity.
 * Falls back to curated list if no analytics data available.
 *
 * Query params:
 * - limit: Number of results (1-20, default 10)
 * - timeRange: 'day' | 'week' | 'month' (default 'week')
 */
export async function handleTrendingSearches(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 20)
  const timeRange = url.searchParams.get('timeRange') || 'week'

  try {
    const cache = env.CACHE
    const cacheKey = `${CACHE_KEY_TRENDING_SEARCHES}:${timeRange}`

    // Check cache first
    if (cache) {
      const cached = await cache.get(cacheKey, 'json') as TrendingSearchesResponse | null
      if (cached) {
        return createSuccessResponse(
          {
            searches: cached.searches.slice(0, limit),
            count: Math.min(cached.searches.length, limit),
            totalAvailable: cached.searches.length,
            timeRange: cached.timeRange,
          },
          {
            cached: true,
            source: 'kv-cache',
            generatedAt: cached.generatedAt,
          },
          200,
          request
        )
      }
    }

    // Try to get from Analytics Engine (if available)
    let searches: TrendingSearch[] = []
    let source = 'curated'

    // TODO: Query PERFORMANCE_ANALYTICS for actual search data
    // For now, use curated fallback
    if (searches.length === 0) {
      searches = CURATED_TRENDING_SEARCHES
      source = 'curated'
    }

    const now = new Date().toISOString()
    const response: TrendingSearchesResponse = {
      searches,
      timeRange,
      generatedAt: now,
    }

    // Cache the result
    if (cache) {
      await cache.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CACHE_TTL_SECONDS,
      })
    }

    return createSuccessResponse(
      {
        searches: searches.slice(0, limit),
        count: Math.min(searches.length, limit),
        totalAvailable: searches.length,
        timeRange,
      },
      {
        cached: false,
        source,
        generatedAt: now,
      },
      200,
      request
    )
  } catch (error) {
    console.error('[TrendingSearches] Error:', error)
    return createErrorResponse(
      'Failed to fetch trending searches',
      500,
      ErrorCodes.INTERNAL_ERROR,
      {},
      request
    )
  }
}

/**
 * GET /api/v2/trending/books
 *
 * Returns trending books based on user activity and popularity.
 * Falls back to curated list if no analytics data available.
 *
 * Query params:
 * - limit: Number of results (1-20, default 10)
 * - timeRange: 'day' | 'week' | 'month' (default 'week')
 */
export async function handleTrendingBooks(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 20)
  const timeRange = url.searchParams.get('timeRange') || 'week'

  try {
    const cache = env.CACHE
    const cacheKey = `${CACHE_KEY_TRENDING_BOOKS}:${timeRange}`

    // Check cache first
    if (cache) {
      const cached = await cache.get(cacheKey, 'json') as TrendingBooksResponse | null
      if (cached) {
        return createSuccessResponse(
          {
            books: cached.books.slice(0, limit),
            count: Math.min(cached.books.length, limit),
            totalAvailable: cached.books.length,
            timeRange: cached.timeRange,
          },
          {
            cached: true,
            source: 'kv-cache',
            generatedAt: cached.generatedAt,
          },
          200,
          request
        )
      }
    }

    // Try to get from D1 or Analytics Engine
    let books: TrendingBook[] = []
    let source = 'curated'

    // Try D1 for recently enriched books with high quality scores
    if (env.DB) {
      try {
        const dbResults = await env.DB.prepare(`
          SELECT
            isbn,
            title,
            publisher,
            cover_small_url,
            cover_medium_url,
            cover_large_url,
            canonical_metadata
          FROM books
          WHERE cover_medium_url IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 20
        `).all()

        if (dbResults.results && dbResults.results.length > 0) {
          books = dbResults.results.map((row: any, index: number) => {
            // Parse authors from canonical_metadata if available
            let authors: string[] = ['Unknown Author']
            if (row.canonical_metadata) {
              try {
                const metadata = JSON.parse(row.canonical_metadata)
                if (metadata.authors && Array.isArray(metadata.authors)) {
                  authors = metadata.authors.map((a: any) => a.name || a).filter(Boolean)
                }
              } catch {
                // Ignore parse errors
              }
            }

            return {
              isbn: row.isbn,
              title: row.title || 'Unknown Title',
              authors,
              coverUrl: row.cover_medium_url || row.cover_large_url || row.cover_small_url,
              trendScore: 100 - index * 5, // Decaying score based on recency
              reason: 'Recently added to library',
            }
          })
          source = 'd1-database'
        }
      } catch (dbError) {
        console.warn('[TrendingBooks] D1 query failed:', dbError)
      }
    }

    // Fall back to curated list if no D1 data
    if (books.length === 0) {
      books = CURATED_TRENDING_BOOKS
      source = 'curated'
    }

    const now = new Date().toISOString()
    const response: TrendingBooksResponse = {
      books,
      timeRange,
      generatedAt: now,
    }

    // Cache the result
    if (cache) {
      await cache.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CACHE_TTL_SECONDS,
      })
    }

    return createSuccessResponse(
      {
        books: books.slice(0, limit),
        count: Math.min(books.length, limit),
        totalAvailable: books.length,
        timeRange,
      },
      {
        cached: false,
        source,
        generatedAt: now,
      },
      200,
      request
    )
  } catch (error) {
    console.error('[TrendingBooks] Error:', error)
    return createErrorResponse(
      'Failed to fetch trending books',
      500,
      ErrorCodes.INTERNAL_ERROR,
      {},
      request
    )
  }
}
