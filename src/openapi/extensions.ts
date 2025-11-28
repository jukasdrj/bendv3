/**
 * OpenAPI Custom Extensions
 *
 * TypeScript types and documentation for custom x-* extensions used in
 * BooksTrack API OpenAPI routes. These extensions provide additional
 * metadata for capabilities endpoint auto-generation and client SDK hints.
 *
 * @see OPENAPI_MIGRATION_PLAN.md - Phase 1 POC (lines 149, 255-256)
 */

/**
 * Rate limit configuration for an endpoint
 *
 * Used to auto-generate rate limit documentation and enforce limits
 * at runtime. Values are extracted by capabilities endpoint to inform
 * clients of per-endpoint rate limits.
 *
 * @example
 * ```typescript
 * router.openapi(createRoute({
 *   // ... other config
 *   'x-rateLimit': { requests: 100, windowMs: 60000 }
 * }))
 * ```
 */
export interface RateLimitExtension {
  /**
   * Maximum number of requests allowed within the time window
   */
  requests: number

  /**
   * Time window in milliseconds
   * Common values: 60000 (1 minute), 3600000 (1 hour), 86400000 (1 day)
   */
  windowMs: number
}

/**
 * Feature identifier for capabilities endpoint
 *
 * Associates an OpenAPI route with a feature in the capabilities response.
 * Used to auto-detect which features are enabled based on registered routes.
 *
 * @example
 * ```typescript
 * router.openapi(createRoute({
 *   // ... other config
 *   'x-feature': 'text_search'
 * }))
 * ```
 *
 * @see src/handlers/v2/capabilities.ts - Feature list
 */
export type FeatureExtension =
  | 'text_search'           // ISBN, title, author search
  | 'advanced_search'       // Multi-field search with filters
  | 'semantic_search'       // AI-powered semantic search
  | 'batch_enrichment'      // OpenLibrary work ID enrichment
  | 'csv_import'            // CSV file import with Gemini parsing
  | 'ai_scan'               // Bookshelf photo scanning with Gemini Vision
  | 'websocket_progress'    // Real-time job progress via WebSocket
  | 'http_polling'          // HTTP polling fallback for job status
  | 'job_cancellation'      // Cancel in-progress jobs (v3.2+)

/**
 * API version when endpoint was introduced
 *
 * Used to auto-generate deprecation notices and track API evolution.
 * Helps clients understand which endpoints require newer API versions.
 *
 * @example
 * ```typescript
 * router.openapi(createRoute({
 *   // ... other config
 *   'x-version': '3.2.0'
 * }))
 * ```
 */
export type VersionExtension = string // Semantic version (e.g., '3.2.0')

/**
 * Internal notes for endpoint (not exposed to clients)
 *
 * Developer notes about implementation details, known issues, or
 * future deprecation plans. Excluded from public OpenAPI spec.
 *
 * @example
 * ```typescript
 * router.openapi(createRoute({
 *   // ... other config
 *   'x-notes': 'Deprecation planned for March 2026 - migrate to /v2/search'
 * }))
 * ```
 */
export type NotesExtension = string

/**
 * Complete set of custom OpenAPI extensions
 *
 * Use this type to ensure type safety when adding custom extensions
 * to OpenAPI route definitions.
 *
 * @example
 * ```typescript
 * import type { OpenAPIExtensions } from './openapi/extensions'
 *
 * const extensions: OpenAPIExtensions = {
 *   'x-rateLimit': { requests: 100, windowMs: 60000 },
 *   'x-feature': 'text_search',
 *   'x-version': '3.3.0',
 *   'x-notes': 'Primary search endpoint'
 * }
 *
 * router.openapi(createRoute({
 *   // ... route config
 *   ...extensions
 * }))
 * ```
 */
export interface OpenAPIExtensions {
  /**
   * Rate limit configuration for this endpoint
   */
  'x-rateLimit'?: RateLimitExtension

  /**
   * Feature identifier for capabilities mapping
   */
  'x-feature'?: FeatureExtension

  /**
   * API version when endpoint was introduced
   */
  'x-version'?: VersionExtension

  /**
   * Internal developer notes (not exposed in public spec)
   */
  'x-notes'?: NotesExtension
}

/**
 * Helper function to create typed OpenAPI extensions
 *
 * Provides type safety and autocomplete when defining route extensions.
 *
 * @example
 * ```typescript
 * router.openapi(createRoute({
 *   method: 'get',
 *   path: '/v1/search/isbn',
 *   // ... other config
 *   ...createExtensions({
 *     rateLimit: { requests: 100, windowMs: 60000 },
 *     feature: 'text_search',
 *     version: '3.3.0'
 *   })
 * }))
 * ```
 */
export function createExtensions(options: {
  rateLimit?: RateLimitExtension
  feature?: FeatureExtension
  version?: VersionExtension
  notes?: NotesExtension
}): OpenAPIExtensions {
  const extensions: OpenAPIExtensions = {}

  if (options.rateLimit) {
    extensions['x-rateLimit'] = options.rateLimit
  }

  if (options.feature) {
    extensions['x-feature'] = options.feature
  }

  if (options.version) {
    extensions['x-version'] = options.version
  }

  if (options.notes) {
    extensions['x-notes'] = options.notes
  }

  return extensions
}
