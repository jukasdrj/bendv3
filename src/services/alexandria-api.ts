/**
 * Alexandria API Integration
 *
 * Alexandria is a self-hosted OpenLibrary PostgreSQL dump providing access to
 * 49.3M+ ISBNs with zero API costs and sub-100ms response times.
 *
 * Provider Priority: PRIMARY (checked before Google Books)
 * API: https://alexandria.ooheynerds.com
 *
 * @see todo-alexandria-integration.md for integration plan
 */

import {
  normalizeAlexandriaToWork,
  normalizeAlexandriaToEdition,
  normalizeAlexandriaToAuthor,
} from "./normalizers/alexandria.js"
import type { AlexandriaResult } from "./normalizers/alexandria.js"
import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js"
import type { ExternalAPIEnv, NormalizedResponse, WorkDTOWithAuthors } from "./external-apis"
import { logExternalApiCall } from "../utils/analytics-logger.ts"
import { createCacheService } from "./cache-service.js"
import { withCircuitBreaker } from "./circuit-breaker"
import { getCacheTTL } from "../config/cache-ttl.js"

// ============================================================================
// CONSTANTS
// ============================================================================

const ALEXANDRIA_BASE_URL = "https://alexandria.ooheynerds.com"
const ALEXANDRIA_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaClient/1.0.0"

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Alexandria API response structure for ISBN lookup
 */
interface AlexandriaISBNResponse {
  results: AlexandriaResult[]
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Search Alexandria by ISBN (primary use case)
 *
 * Uses KV cache → Circuit breaker → Alexandria API
 * Returns null if ISBN not found (404 or empty results)
 *
 * @param isbn - 10 or 13 digit ISBN
 * @param env - Worker environment bindings
 * @param ctx - Execution context for cache tracking
 * @returns Normalized book data or null if not found
 */
export async function searchAlexandriaByISBN(
  isbn: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace
  const kvNamespace = env.CACHE

  // If no KV cache or ExecutionContext, skip caching (fallback to direct API call)
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ Alexandria ISBN search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`)
    return withCircuitBreaker('alexandria', env, () => searchAlexandriaByISBN_Uncached(isbn, env))
  }

  // Create cache service with 'alex' prefix
  const cache = createCacheService(kvNamespace, 'alex', env, ctx)

  // Check cache FIRST
  const cacheKey = `isbn:${isbn.replace(/-/g, '')}` // Normalize ISBN (remove hyphens)
  const cached = await cache.get(cacheKey)

  if (cached) {
    console.log(`📦 Cache HIT: Alexandria ISBN ${isbn}`)
    try {
      return JSON.parse(cached)
    } catch (error) {
      console.error(`❌ Cache parse error for Alexandria ISBN ${isbn}:`, error)
      // Fall through to API call if cached data is corrupted
    }
  }

  // Cache MISS - fetch from API with circuit breaker
  console.log(`🌐 Cache MISS: Fetching ISBN ${isbn} from Alexandria`)
  const result = await withCircuitBreaker('alexandria', env, () => searchAlexandriaByISBN_Uncached(isbn, env))

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = getCacheTTL('hot', env)
    const coldTtl = getCacheTTL('cold', env)

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl)
      console.log(`✅ Cached Alexandria ISBN ${isbn} (hot: ${hotTtl}s, cold: ${coldTtl}s)`)
    } catch (error) {
      console.error(`❌ Cache write error for Alexandria ISBN ${isbn}:`, error)
      // Don't throw - caching is non-critical
    }
  }

  return result
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Uncached Alexandria ISBN search (internal helper)
 * Extracted to avoid duplication between cached and fallback paths
 */
async function searchAlexandriaByISBN_Uncached(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  return logExternalApiCall(
    "Alexandria",
    async () => {
      console.log(`Alexandria ISBN search for "${isbn}"`)

      const searchUrl = `${ALEXANDRIA_BASE_URL}/api/search?isbn=${encodeURIComponent(isbn)}`

      // Get service token credentials for Cloudflare Access bypass
      // These are Worker secrets (not Secrets Store), so they're plain strings
      const clientId = env.ALEXANDRIA_CLIENT_ID;
      const clientSecret = env.ALEXANDRIA_CLIENT_SECRET;

      const headers: Record<string, string> = {
        "User-Agent": ALEXANDRIA_USER_AGENT,
        Accept: "application/json",
      };

      // Add Cloudflare Access service token headers if available
      if (clientId && clientSecret) {
        headers["CF-Access-Client-Id"] = clientId;
        headers["CF-Access-Client-Secret"] = clientSecret;
      }

      const response = await fetch(searchUrl, { headers })

      if (response.status === 404) {
        console.log(`📭 Alexandria: ISBN ${isbn} not found (404)`)
        return null
      }

      if (!response.ok) {
        throw new Error(
          `Alexandria API error: ${response.status} ${response.statusText}`,
        )
      }

      const data: AlexandriaISBNResponse = await response.json()

      // Alexandria returns 200 with empty results array if ISBN not found
      if (!data.results || data.results.length === 0) {
        console.log(`📭 Alexandria: ISBN ${isbn} not found (empty results)`)
        return null
      }

      const normalizedData = normalizeAlexandriaResponse(data.results[0], isbn)

      if (!normalizedData.works || normalizedData.works.length === 0) {
        return null
      }

      return normalizedData
    },
    { isbn },
    env, // Pass env for potential analytics logging
  )
}

/**
 * Normalize Alexandria API response to canonical DTOs
 * Uses canonical normalizers to ensure contract compliance
 *
 * NOTE: This function temporarily attaches an `authors` property to WorkDTO
 * for enrichment service compatibility (WorkDTOWithAuthors type).
 * Handlers must strip this property before sending to client.
 */
function normalizeAlexandriaResponse(
  result: AlexandriaResult,
  isbn: string,
): NormalizedResponse {
  const work = normalizeAlexandriaToWork(result)
  const edition = normalizeAlexandriaToEdition(result)

  // Extract authors from result
  const authors: AuthorDTO[] = result.author
    ? [normalizeAlexandriaToAuthor(result.author)]
    : []

  // Attach authors to work (temporary for enrichment pipeline)
  const workWithAuthors: WorkDTOWithAuthors = {
    ...work,
    authors,
  }

  return {
    works: [workWithAuthors],
    editions: [edition],
    authors,
  }
}

// ============================================================================
// FUTURE ENHANCEMENTS
// ============================================================================

/**
 * Search Alexandria by title/author (NOT IMPLEMENTED YET)
 *
 * @deprecated Alexandria Phase 3 required - use ISBN search instead
 * @see todo-alexandria-integration.md for implementation roadmap
 *
 * @param query - Search query string
 * @param params - Search parameters (maxResults, etc.)
 * @param env - Worker environment bindings
 * @param ctx - Execution context
 * @throws {Error} Always throws - feature not implemented
 */
export async function searchAlexandria(
  query: string,
  params: any,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  throw new Error(
    'Alexandria title/author search not implemented; use ISBN search instead. ' +
    'See todo-alexandria-integration.md for Phase 3 roadmap.'
  )
}
