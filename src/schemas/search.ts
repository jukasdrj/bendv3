/**
 * Search Endpoint Zod Schemas
 *
 * Schemas for search-related query parameters and responses.
 * These match the actual API behavior for /v1/search/* endpoints.
 *
 * Sprint 1, Day 3 - OpenAPI Fast Track Migration
 *
 * @module schemas/search
 */

import { z } from 'zod'
import { WorkSchema, EditionSchema, AuthorSchema } from './book'
import { ResponseEnvelopeSchema, ErrorResponseSchema } from './common'

// ============================================================================
// QUERY PARAMETER SCHEMAS
// ============================================================================

/**
 * ISBN Search Query Parameters
 *
 * Validates query parameters for GET /v1/search/isbn
 */
export const SearchISBNQuerySchema = z.object({
  isbn: z.string()
    .min(10, 'ISBN must be at least 10 characters')
    .max(13, 'ISBN must be at most 13 characters')
    .regex(/^\d{10}$|^\d{13}$/, 'ISBN must be 10 or 13 digits (no hyphens)')
    .describe('ISBN-10 or ISBN-13 (digits only, no hyphens)'),
  lenient: z.string()
    .optional()
    .describe('Skip ISBN checksum validation (for cache warming with dirty CSV data)')
}).strict()

/**
 * Title Search Query Parameters
 *
 * Validates query parameters for GET /v1/search/title
 */
export const SearchTitleQuerySchema = z.object({
  q: z.string()
    .min(1, 'Search query cannot be empty')
    .max(200, 'Search query must be 200 characters or less')
    .describe('Book title search query'),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('20')
    .describe('Maximum number of results (1-100, default: 20)')
}).strict()

// ============================================================================
// RESPONSE DATA SCHEMAS
// ============================================================================

/**
 * ISBN Search Response Data Schema
 *
 * Canonical response format for /v1/search/isbn endpoint.
 * Returns works, editions, and authors for the given ISBN.
 *
 * @example
 * ```json
 * {
 *   "works": [{ title: "...", ... }],
 *   "editions": [{ isbn: "...", ... }],
 *   "authors": [{ name: "...", ... }],
 *   "resultCount": 1
 * }
 * ```
 */
export const SearchISBNDataSchema = z.object({
  works: z.array(WorkSchema),
  editions: z.array(EditionSchema),
  authors: z.array(AuthorSchema),
  resultCount: z.number().int().min(0)
}).strict()

/**
 * Extended Response Metadata for Search Endpoints
 *
 * Includes additional fields specific to search operations:
 * - processingTime: Request processing time in milliseconds
 * - provider: Data source provider (google_books, open_library, isbndb, etc.)
 * - cached: Whether result was served from cache
 */
export const SearchResponseMetadataSchema = z.object({
  timestamp: z.string().datetime(),
  processingTime: z.number().int().min(0).optional(),
  provider: z.enum([
    'google_books',
    'open_library',
    'isbndb',
    'kv_cache',
    'd1_database',
    'none'
  ]).optional(),
  cached: z.boolean().optional()
}).strict()

// ============================================================================
// COMPLETE RESPONSE SCHEMAS (WITH ENVELOPE)
// ============================================================================

/**
 * ISBN Search Success Response Schema
 *
 * Complete response envelope for successful ISBN search.
 * Includes data, metadata, and optional error field (always null for success).
 */
export const SearchISBNSuccessResponseSchema = z.object({
  data: SearchISBNDataSchema,
  metadata: SearchResponseMetadataSchema.optional()
}).strict()

/**
 * ISBN Search Response Schema (Union of Success and Error)
 *
 * Discriminated union for all possible response types.
 * Used for OpenAPI spec generation.
 */
export const SearchISBNResponseSchema = z.union([
  SearchISBNSuccessResponseSchema,
  ErrorResponseSchema
])

/**
 * Title Search Response Data Schema
 *
 * Canonical response format for /v1/search/title endpoint.
 * Returns works, editions, and authors for the given title query.
 *
 * @example
 * ```json
 * {
 *   "works": [{ title: "...", ... }, ...],
 *   "editions": [{ isbn: "...", ... }, ...],
 *   "authors": [{ name: "...", ... }, ...],
 *   "resultCount": 3
 * }
 * ```
 */
export const SearchTitleDataSchema = z.object({
  works: z.array(WorkSchema),
  editions: z.array(EditionSchema),
  authors: z.array(AuthorSchema),
  resultCount: z.number().int().min(0)
}).strict()

/**
 * Title Search Success Response Schema
 *
 * Complete response envelope for successful title search.
 * Includes data, metadata, and optional error field (always null for success).
 */
export const SearchTitleSuccessResponseSchema = z.object({
  data: SearchTitleDataSchema,
  metadata: SearchResponseMetadataSchema.optional()
}).strict()

/**
 * Title Search Response Schema (Union of Success and Error)
 *
 * Discriminated union for all possible response types.
 * Used for OpenAPI spec generation.
 */
export const SearchTitleResponseSchema = z.union([
  SearchTitleSuccessResponseSchema,
  ErrorResponseSchema
])

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SearchISBNQuery = z.infer<typeof SearchISBNQuerySchema>
export type SearchTitleQuery = z.infer<typeof SearchTitleQuerySchema>
export type SearchISBNData = z.infer<typeof SearchISBNDataSchema>
export type SearchTitleData = z.infer<typeof SearchTitleDataSchema>
export type SearchResponseMetadata = z.infer<typeof SearchResponseMetadataSchema>
export type SearchISBNSuccessResponse = z.infer<typeof SearchISBNSuccessResponseSchema>
export type SearchTitleSuccessResponse = z.infer<typeof SearchTitleSuccessResponseSchema>
export type SearchISBNResponse = z.infer<typeof SearchISBNResponseSchema>
export type SearchTitleResponse = z.infer<typeof SearchTitleResponseSchema>
