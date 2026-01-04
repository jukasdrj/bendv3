/**
 * Alexandria API Type Definitions
 *
 * Official types from alexandria-worker package (v2.2.1).
 * Provides full type safety for Hono RPC client and Alexandria API integration.
 *
 * **Version 2.2.1 Changes:**
 * - ✅ Full AlexandriaAppType export for compile-time route validation
 * - ✅ Complete type safety for Hono RPC client integration
 * - Added `CombinedSearchQuery` and `CombinedSearchResult` types
 * - Added new `/api/search/combined` endpoint support
 * - `SearchResult.count` is deprecated in favor of `pagination.total`
 *
 * @see https://www.npmjs.com/package/alexandria-worker
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md for migration guide
 */

// ============================================================================
// Hono App Type (for RPC Client)
// ============================================================================

/**
 * Alexandria Hono app type for RPC client
 *
 * This type represents all routes exposed by the Alexandria worker.
 * Used by the Hono RPC client to provide compile-time route validation
 * and type inference for request/response shapes.
 *
 * Note: Imported from alexandria-worker package root (exports app type),
 * not from /types (which only exports data types).
 *
 * @example
 * ```typescript
 * import { hc } from 'hono/client'
 * import type { AlexandriaAppType } from './alexandria-types'
 *
 * const client = hc<AlexandriaAppType>('https://alexandria.ooheynerds.com')
 * const response = await client.api.search.$get({ query: { isbn: '...' } })
 * ```
 */
export type { AlexandriaAppType } from 'alexandria-worker'

// ============================================================================
// Request Types
// ============================================================================

export type {
  CombinedSearchQuery,
  EnrichAuthor,
  EnrichEdition,
  EnrichWork,
  ProcessCover,
  QueueEnrichment,
  SearchQuery,
} from 'alexandria-worker/types'

// ============================================================================
// Response Types
// ============================================================================

export type {
  BatchCoverResult,
  BookResult,
  CombinedSearchResult,
  CoverMetadata,
  CoverProcessResult,
  CoverStatus,
  DatabaseStats,
  EnrichmentJobStatus,
  EnrichmentQueueResult,
  EnrichmentResult,
  ErrorResponse,
  HealthCheck,
  SearchResult,
} from 'alexandria-worker/types'

/**
 * Standard API Response Envelope from Alexandria V3
 */
export interface ResponseMeta {
  requestId: string
  timestamp: string
  latencyMs?: number
}

export interface AlexandriaResponse<T> {
  success: boolean
  data: T
  meta: ResponseMeta
}

// ============================================================================
// Constants
// ============================================================================

export { API_ROUTES, ENDPOINTS } from 'alexandria-worker/types'

// ============================================================================
// Zod Schemas (for runtime validation)
// ============================================================================

export {
  CombinedSearchQuerySchema,
  EnrichAuthorSchema,
  EnrichEditionSchema,
  EnrichWorkSchema,
  ProcessCoverSchema,
  QueueEnrichmentSchema,
  SearchQuerySchema,
} from 'alexandria-worker/types'
