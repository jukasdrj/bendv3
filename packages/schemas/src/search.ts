/**
 * Search endpoint schemas for BooksTrack API
 *
 * Supports text, semantic, and similar search modes with
 * both offset and cursor-based pagination.
 */

import { z } from 'zod'
import { BookSchema } from './book'
import { SuccessResponseSchema, LinkSchema } from './response'

/**
 * Search mode enumeration
 *
 * Note: Only 'text' mode is currently supported. Semantic and similar search
 * modes will be added in a future release when Vectorize integration is complete.
 */
export const SearchModeSchema = z.enum(['text']).describe('Search mode')
export type SearchMode = z.infer<typeof SearchModeSchema>

/**
 * Pagination style - offset (page-based) or cursor (for large datasets)
 */
export const PaginationStyleSchema = z.enum(['offset', 'cursor']).default('offset')
export type PaginationStyle = z.infer<typeof PaginationStyleSchema>

/**
 * Search request query parameters
 *
 * Supports both offset-based (page/limit) and cursor-based pagination.
 * Cursor pagination is recommended for large result sets to avoid
 * inconsistencies when data changes between requests.
 */
export const SearchRequestSchema = z.object({
  q: z.string()
    .min(1)
    .max(200)
    .describe('Search query - book title to search for (e.g., "Harry Potter")'),
  mode: SearchModeSchema
    .default('text')
    .optional()
    .describe('Search mode (currently only "text" supported for title search)'),
  // Offset-based pagination (default)
  page: z.coerce.number()
    .int()
    .min(1)
    .default(1)
    .optional()
    .describe('Page number for offset pagination (default: 1)'),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe('Results per page (default: 20, max: 100)'),
  // Cursor-based pagination (optional, for large datasets)
  cursor: z.string()
    .optional()
    .describe('Opaque cursor for cursor-based pagination (from previous response)'),
  // Pagination style selector
  paginationStyle: PaginationStyleSchema
    .optional()
    .describe('Pagination style: "offset" (default) or "cursor"')
})

export type SearchRequest = z.infer<typeof SearchRequestSchema>

/**
 * Pagination info for offset-based results
 */
export const OffsetPaginationSchema = z.object({
  type: z.literal('offset').default('offset'),
  page: z.number().int().min(1).describe('Current page number'),
  limit: z.number().int().min(1).max(100).describe('Results per page'),
  totalPages: z.number().int().min(0).describe('Total number of pages'),
  hasNext: z.boolean().describe('Whether there are more pages'),
  hasPrev: z.boolean().describe('Whether there are previous pages')
})

export type OffsetPagination = z.infer<typeof OffsetPaginationSchema>

/**
 * Pagination info for cursor-based results
 */
export const CursorPaginationSchema = z.object({
  type: z.literal('cursor').default('cursor'),
  cursor: z.string().nullable().describe('Cursor for next page (null if no more results)'),
  hasMore: z.boolean().describe('Whether there are more results'),
  limit: z.number().int().min(1).max(100).describe('Results per page')
})

export type CursorPagination = z.infer<typeof CursorPaginationSchema>

/**
 * Union of pagination types
 */
export const PaginationSchema = z.discriminatedUnion('type', [
  OffsetPaginationSchema,
  CursorPaginationSchema
])

export type Pagination = z.infer<typeof PaginationSchema>

/**
 * Search response data
 */
export const SearchResultDataSchema = z.object({
  books: z.array(BookSchema).describe('Array of book results'),
  total: z.number().int().min(0).describe('Total number of results'),
  query: z.object({
    q: z.string(),
    mode: SearchModeSchema
  }).describe('Original search query'),
  pagination: PaginationSchema.describe('Pagination info (offset or cursor based)')
})

export type SearchResultData = z.infer<typeof SearchResultDataSchema>

/**
 * Complete search response schema
 */
export const SearchResponseSchema = SuccessResponseSchema(SearchResultDataSchema)

export type SearchResponse = z.infer<typeof SearchResponseSchema>
