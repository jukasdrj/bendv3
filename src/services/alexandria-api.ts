/**
 * Alexandria API Integration (Hono RPC Migration - Sprint 1)
 *
 * Alexandria is a self-hosted OpenLibrary PostgreSQL dump providing access to
 * 49.3M+ ISBNs with zero API costs and sub-100ms response times.
 *
 * Provider Priority: PRIMARY (checked before Google Books)
 *
 * Architecture Evolution:
 * - Phase 1 (Current): HTTP fetch with circuit breaker
 * - Phase 2 (Sprint 1): Hono RPC with Service Bindings (sub-millisecond)
 * - Phase 3 (Sprint 2): Smart Provider pattern (Alexandria handles fallbacks)
 *
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md for full migration plan
 * @see src/services/alexandria-client.ts for RPC client implementation
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
import { getCached, setCached } from "../utils/cache.js"
import { withCircuitBreaker } from "./circuit-breaker"
import { getCacheTTL } from "../config/cache-ttl.js"
import {
  createAlexandriaClient,
  hasAlexandriaServiceBinding,
  getAlexandriaEffectiveUrl,
} from "./alexandria-client"

// ============================================================================
// CONSTANTS
// ============================================================================

const ALEXANDRIA_BASE_URL = "https://alexandria.ooheynerds.com"
const ALEXANDRIA_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaClient/1.0.0"

/**
 * Feature flag for Hono RPC migration
 *
 * When true, uses Hono RPC client with Service Bindings (if available).
 * When false, uses legacy fetch-based implementation.
 *
 * CURRENT STATUS: Environment-driven (default: false)
 * TO ENABLE: Set wrangler.jsonc var ENABLE_ALEXANDRIA_RPC="true" once Alexandria exports AppType
 *
 * @see src/services/alexandria-client.ts for RPC implementation
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md for full migration checklist
 */
function isAlexandriaRPCEnabled(env: ExternalAPIEnv): boolean {
  return env.ENABLE_ALEXANDRIA_RPC === 'true'
}

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
  // If no KV cache, skip caching (fallback to direct API call)
  if (!env.CACHE) {
    console.warn(`⚠️ Alexandria ISBN search without cache (missing KV namespace)`)

    // Feature flag: Use RPC or fetch-based implementation
    const uncachedFn = isAlexandriaRPCEnabled(env)
      ? searchAlexandriaByISBN_Uncached_RPC
      : searchAlexandriaByISBN_Uncached_Fetch

    return withCircuitBreaker('alexandria', env, () => uncachedFn(isbn, env))
  }

  // Check cache FIRST
  const normalizedIsbn = isbn.replace(/-/g, '') // Normalize ISBN (remove hyphens)
  const cacheKey = `alex:isbn:${normalizedIsbn}`
  const cached = await getCached(cacheKey, env, ctx)

  if (cached) {
    console.log(`📦 Cache HIT: Alexandria ISBN ${isbn}`)
    return cached.data as NormalizedResponse
  }

  // Cache MISS - fetch from API with circuit breaker
  console.log(`🌐 Cache MISS: Fetching ISBN ${isbn} from Alexandria`)

  // Feature flag: Use RPC or fetch-based implementation
  const uncachedFn = isAlexandriaRPCEnabled(env)
    ? searchAlexandriaByISBN_Uncached_RPC
    : searchAlexandriaByISBN_Uncached_Fetch

  const result = await withCircuitBreaker('alexandria', env, () => uncachedFn(isbn, env))

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = getCacheTTL('hot', env)
    const coldTtl = getCacheTTL('cold', env)
    await setCached(cacheKey, result, coldTtl, env, ctx, hotTtl)
    console.log(`✅ Cached Alexandria ISBN ${isbn} (hot: ${hotTtl}s, cold: ${coldTtl}s)`)
  }

  return result
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * RPC-based Alexandria ISBN search (Sprint 1: Hono RPC Migration)
 *
 * Uses Hono RPC client with Service Bindings for sub-millisecond latency.
 * This function will replace the fetch-based implementation once Alexandria
 * exports its TypeScript types.
 *
 * Benefits:
 * - No public internet round-trip (service-to-service binding)
 * - Full type safety (compile-time route validation)
 * - Automatic request/response validation (Zod schemas)
 *
 * @param isbn - 10 or 13 digit ISBN
 * @param env - Worker environment bindings
 * @returns Normalized book data or null if not found
 *
 * TODO: Enable this once Alexandria exports AppType
 * TODO: Remove searchAlexandriaByISBN_Uncached_Fetch once migration complete
 */
async function searchAlexandriaByISBN_Uncached_RPC(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  return logExternalApiCall(
    "alexandria",
    async () => {
      console.log(`🔗 Alexandria RPC search for ISBN "${isbn}"`)

      // Create typed RPC client
      const client = createAlexandriaClient(env)

      // Make typed RPC call (TypeScript ensures this route exists)
      // Once Alexandria exports its types, this will be fully type-safe
      const response = await client.api.search.$get({
        query: { isbn },
      })

      if (response.status === 404) {
        console.log(`📭 Alexandria RPC: ISBN ${isbn} not found (404)`)
        return null
      }

      if (!response.ok) {
        throw new Error(
          `Alexandria RPC error: ${response.status} ${response.statusText}`,
        )
      }

      const jsonResponse: any = await response.json()
      // Handle V3 Envelope format
      const data: AlexandriaISBNResponse = jsonResponse.data || jsonResponse

      // Alexandria returns 200 with empty results array if ISBN not found
      if (!data.results || data.results.length === 0) {
        console.log(`📭 Alexandria RPC: ISBN ${isbn} not found (empty results)`)
        return null
      }

      const normalizedData = normalizeAlexandriaResponse(data.results[0], isbn)

      if (!normalizedData.works || normalizedData.works.length === 0) {
        return null
      }

      return normalizedData
    },
    { isbn },
    env,
  )
}

/**
 * Fetch-based Alexandria ISBN search (Legacy)
 *
 * Uses standard HTTP fetch with circuit breaker protection.
 * This implementation will be removed once Hono RPC migration is complete.
 *
 * @param isbn - 10 or 13 digit ISBN
 * @param env - Worker environment bindings
 * @returns Normalized book data or null if not found
 *
 * @deprecated Will be replaced by searchAlexandriaByISBN_Uncached_RPC
 */
async function searchAlexandriaByISBN_Uncached_Fetch(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  return logExternalApiCall(
    "alexandria",
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

      const jsonResponse: any = await response.json()
      // Handle V3 Envelope format: { success: true, data: { ... } }
      const data: AlexandriaISBNResponse = jsonResponse.data || jsonResponse

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
  // Prefer new per-work embedded authors array, fallback to legacy single author string
  let authors: AuthorDTO[]
  if (result.authors && result.authors.length > 0) {
    // New format: per-work embedded authors array from Alexandria
    authors = result.authors.map(a => normalizeAlexandriaToAuthor(a.name))
  } else if (result.author) {
    // Legacy format: single author string
    authors = [normalizeAlexandriaToAuthor(result.author)]
  } else {
    authors = []
  }

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
