/**
 * Search handlers for book lookups
 * Extracted to eliminate RPC circular dependencies
 *
 * Optimizations:
 * - Negative caching for 404/5xx responses (5-minute TTL)
 * - Request coalescing to prevent duplicate in-flight calls
 */

import * as externalApis from '../services/external-apis'
import type { Env } from '../types/env'
import { createErrorResponse, ErrorCodes } from '../utils/http/response-builder'
import { transformWorkToGoogleFormat } from '../utils/transform/transform-work'

// ============================================================================
// Types
// ============================================================================

interface SearchParams {
  bookTitle?: string
  authorName?: string
  isbn?: string
}

interface SearchOptions {
  maxResults?: number
}

interface NegativeCacheEntry {
  type: 'no_results' | 'error'
  error: string
  status: number
  timestamp: number
}

interface AdvancedSearchResponse {
  items: unknown[]
  resultCount: number
}

interface ProviderResult {
  works?: unknown[]
}

// ============================================================================
// Constants
// ============================================================================

// Request coalescing: Map of in-flight requests by cache key
const IN_FLIGHT_REQUESTS = new Map<string, Promise<Response>>()

// Request timeout (30 seconds)
const REQUEST_TIMEOUT_MS = 30000

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wrap a promise with timeout and automatic cleanup.
 * Ensures Map entries are always removed, even on timeout.
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param cacheKey - Cache key to clean up
 * @returns Promise that rejects on timeout
 */
async function withTimeout(
  promise: Promise<Response>,
  timeoutMs: number,
  cacheKey: string,
): Promise<Response> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<Response>((_, reject) => {
        timeoutId = setTimeout(() => {
          // Clean up Map entry on timeout
          IN_FLIGHT_REQUESTS.delete(cacheKey)
          console.error(`⏱️ Request timeout after ${timeoutMs}ms: ${cacheKey}`)
          reject(new Error(`Request timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    // Always clear timeout to prevent memory leak
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    // Note: DO NOT delete from Map here on success
    // The inner requestPromise's finally block handles cleanup
    // We only delete on timeout (handled above)
  }
}

/**
 * Generate cache key for search parameters.
 *
 * @param searchParams - Search parameters
 * @returns Cache key string
 */
function generateSearchCacheKey(searchParams: SearchParams): string {
  const { bookTitle, authorName, isbn } = searchParams
  const parts = [
    isbn || '',
    bookTitle?.normalize('NFC').toLowerCase().trim() || '',
    authorName?.normalize('NFC').toLowerCase().trim() || '',
  ]
  return `search:${parts.filter(Boolean).join(':')}`
}

/**
 * Check for negative cache entry (previous failed lookup).
 * Returns null if no negative cache, or cached error if exists.
 *
 * @param cacheKey - Cache key
 * @param env - Worker environment
 * @returns Negative cache entry or null
 */
async function checkNegativeCache(cacheKey: string, env: Env): Promise<NegativeCacheEntry | null> {
  try {
    const negativeKey = `negative:${cacheKey}`
    const cached = await env.CACHE.get(negativeKey, 'json')

    if (cached?.timestamp) {
      const age = Date.now() - cached.timestamp
      // Return cached error if less than 5 minutes old
      if (age < 300000) {
        console.log(`⚠️ Negative cache HIT: ${cacheKey} (age: ${Math.round(age / 1000)}s)`)
        return cached as NegativeCacheEntry
      }
    }
  } catch (error) {
    console.error('Negative cache check failed:', error)
  }
  return null
}

/**
 * Store failed lookup in negative cache (5-minute TTL).
 *
 * @param cacheKey - Cache key
 * @param error - Error object with message and status
 * @param type - Type: 'no_results' or 'error'
 * @param env - Worker environment
 */
async function storeNegativeCache(
  cacheKey: string,
  error: { message?: string; status?: number },
  type: 'no_results' | 'error',
  env: Env,
): Promise<void> {
  try {
    const negativeKey = `negative:${cacheKey}`
    await env.CACHE.put(
      negativeKey,
      JSON.stringify({
        type: type || 'error', // 'no_results' vs 'error'
        error: error.message || 'Unknown error',
        status: error.status || 500,
        timestamp: Date.now(),
      }),
      {
        expirationTtl: 300, // 5 minutes
      },
    )
    console.log(`📝 Stored negative cache: ${cacheKey} (type: ${type})`)
  } catch (err) {
    console.error('Failed to store negative cache:', err)
  }
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Advanced search handler for multi-provider book search.
 * Previously called via RPC from bookshelf-ai-worker.
 *
 * Performs parallel searches across Google Books and OpenLibrary,
 * with request coalescing to prevent duplicate in-flight calls.
 *
 * @param searchParams - Search parameters
 * @param searchParams.bookTitle - Book title to search
 * @param searchParams.authorName - Author name to search
 * @param options - Search options
 * @param options.maxResults - Maximum results to return (default: 1)
 * @param env - Worker environment bindings
 * @returns Search results with items array (Google Books format)
 */
export async function handleAdvancedSearch(
  searchParams: SearchParams,
  options: SearchOptions = {},
  env: Env,
): Promise<Response> {
  const { bookTitle, authorName } = searchParams
  const maxResults = options.maxResults || 1
  const cacheKey = generateSearchCacheKey(searchParams)

  console.log(`[AdvancedSearch] Searching for "${bookTitle}" by "${authorName}"`)

  // Check negative cache first (prevents repeated failed lookups)
  const negativeCache = await checkNegativeCache(cacheKey, env)
  if (negativeCache) {
    // Maintain consistent API contract: always return success: true for "no results"
    if (negativeCache.type === 'no_results') {
      return new Response(JSON.stringify({ items: [], resultCount: 0 } as AdvancedSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Only true errors return success: false
    return createErrorResponse(
      negativeCache.error,
      negativeCache.status || 500,
      ErrorCodes.PROVIDER_ERROR,
    )
  }

  // Check for in-flight request (request coalescing)
  if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
    console.log(`🔄 Request coalescing: Waiting for in-flight request (${cacheKey})`)
    return IN_FLIGHT_REQUESTS.get(cacheKey) as Promise<Response>
  }

  // Create new request promise
  const requestPromise = (async () => {
    try {
      // Try Google Books first (most reliable for enrichment)
      const query = [bookTitle, authorName].filter(Boolean).join(' ')

      const googleResult = (await externalApis.searchGoogleBooks(
        query,
        { maxResults },
        env,
      )) as ProviderResult | null

      if (googleResult?.works && googleResult.works.length > 0) {
        // Convert normalized works to Google Books format using shared utility
        const items = googleResult.works.map((work) => transformWorkToGoogleFormat(work))

        const resultItems = items.slice(0, maxResults)
        return new Response(
          JSON.stringify({
            items: resultItems,
            resultCount: resultItems.length,
          } as AdvancedSearchResponse),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      // Fallback to OpenLibrary if Google Books fails
      console.log(`[AdvancedSearch] Google Books returned no results, trying OpenLibrary...`)

      const olResult = (await externalApis.searchOpenLibrary(
        query,
        { maxResults },
        env,
      )) as ProviderResult | null

      if (olResult?.works && olResult.works.length > 0) {
        // Convert OpenLibrary works to Google Books format using shared utility
        const items = olResult.works.map((work) => transformWorkToGoogleFormat(work))

        const resultItems = items.slice(0, maxResults)
        return new Response(
          JSON.stringify({
            items: resultItems,
            resultCount: resultItems.length,
          } as AdvancedSearchResponse),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      // No results from any provider - store as "no_results" type (not error)
      console.log(`[AdvancedSearch] No results found from any provider`)
      await storeNegativeCache(
        cacheKey,
        { message: 'No results found', status: 404 },
        'no_results',
        env,
      )

      return new Response(JSON.stringify({ items: [], resultCount: 0 } as AdvancedSearchResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed'
      const errorStatus =
        error instanceof Error && 'status' in error ? (error.status as number) : undefined

      console.error(`[AdvancedSearch] Error searching for "${bookTitle}":`, error)

      // Store negative cache for 5xx errors only (not client errors)
      if (!errorStatus || errorStatus >= 500) {
        await storeNegativeCache(
          cacheKey,
          { message: errorMessage, status: errorStatus || 500 },
          'error',
          env,
        )
      }

      return createErrorResponse(errorMessage || 'Search failed', 500, ErrorCodes.INTERNAL_ERROR)
    } finally {
      // Clean up in-flight request
      IN_FLIGHT_REQUESTS.delete(cacheKey)
    }
  })()

  // Wrap with timeout to prevent memory leak on hung requests
  const timeoutPromise = withTimeout(requestPromise, REQUEST_TIMEOUT_MS, cacheKey)

  // Store promise for request coalescing
  IN_FLIGHT_REQUESTS.set(cacheKey, timeoutPromise)

  return timeoutPromise
}
