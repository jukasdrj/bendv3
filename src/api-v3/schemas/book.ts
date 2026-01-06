/**
 * V3 API Book Schemas
 *
 * Zod schemas for book-related endpoints
 * These schemas provide:
 * - Runtime validation
 * - TypeScript type inference
 * - Automatic OpenAPI documentation
 */

import { z } from 'zod'

/**
 * Core book metadata schema
 * Matches the canonical book object from Alexandria/Google Books
 */
export const BookSchema = z.object({
  isbn: z.string().length(13).describe('13-digit ISBN (example: 9780439708180)'),
  isbn10: z
    .string()
    .length(10)
    .optional()
    .describe('10-digit ISBN if available (example: 0439708184)'),
  title: z.string().min(1).describe('Book title (example: Harry Potter and the Sorcerers Stone)'),
  subtitle: z.string().optional().describe('Book subtitle'),
  authors: z.array(z.string()).describe('List of author names (example: J.K. Rowling)'),
  publisher: z.string().optional().describe('Publisher name (example: Scholastic Inc.)'),
  publishedDate: z
    .string()
    .optional()
    .describe('Publication date in ISO 8601 or partial format (example: 1998-09-01)'),
  description: z.string().optional().describe('Book description/synopsis'),
  pageCount: z.number().int().positive().optional().describe('Number of pages (example: 309)'),
  categories: z
    .array(z.string())
    .optional()
    .describe('Book categories/genres (example: Fiction, Fantasy)'),
  language: z.string().optional().describe('ISO 639-1 language code (example: en)'),
  coverUrl: z.string().url().optional().describe('Cover image URL'),
  thumbnailUrl: z.string().url().optional().describe('Thumbnail image URL'),
  workKey: z.string().optional().describe('OpenLibrary work key (example: OL82563W)'),
  editionKey: z.string().optional().describe('OpenLibrary edition key (example: OL7353617M)'),
  provider: z
    .enum(['alexandria', 'google_books', 'open_library', 'isbndb'])
    .describe('Data source provider (example: alexandria)'),
  quality: z.number().min(0).max(100).describe('Data quality score 0-100 (example: 95)'),
})

export type Book = z.infer<typeof BookSchema>

/**
 * Response envelope for successful book responses
 */
export const BookResponseSchema = z.object({
  success: z.literal(true),
  data: BookSchema,
  metadata: z.object({
    source: z.string().describe('Data source'),
    cached: z.boolean().describe('Whether response was served from cache'),
    timestamp: z.string().describe('Response timestamp (ISO 8601)'),
    cacheKey: z.string().optional().describe('Cache key used (for debugging)'),
  }),
})

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().describe('Error code (e.g., NOT_FOUND, VALIDATION_ERROR)'),
    message: z.string().describe('Human-readable error message'),
    statusCode: z.number().int().describe('HTTP status code'),
    details: z.record(z.string(), z.unknown()).optional().describe('Additional error context'),
  }),
})

/**
 * Search results schema (for list endpoints)
 */
export const BookSearchResultsSchema = z.object({
  success: z.literal(true),
  data: z.object({
    books: z.array(BookSchema),
    total: z.number().int().describe('Total number of results'),
    page: z.number().int().describe('Current page number'),
    limit: z.number().int().describe('Results per page'),
  }),
  metadata: z.object({
    cached: z.boolean(),
    timestamp: z.string(),
    query: z.string().describe('Search query'),
  }),
})

/**
 * ISBN parameter schema (for path params)
 * NOTE: Not used - endpoints define params inline with .openapi({ param: {...}})
 */
// export const ISBNParamSchema = z.object({
//   isbn: z.string()
//     .regex(/^\d{10}(\d{3})?$/, 'Must be 10 or 13 digit ISBN')
//     .describe('10 or 13 digit ISBN'),
// })

/**
 * Title search query schema
 * NOTE: Not used - endpoints define query params inline
 */
// export const TitleSearchQuerySchema = z.object({
//   q: z.string().min(1).max(200).describe('Search query'),
//   limit: z.coerce.number().int().min(1).max(100).default(20).describe('Results per page'),
//   page: z.coerce.number().int().min(1).default(1).describe('Page number'),
// })

/**
 * Enrichment request schema
 * NOTE: Not used - endpoint defines schema inline
 */
// export const EnrichmentRequestSchema = z.object({
//   isbn: z.string().regex(/^\d{13}$/, 'Must be 13-digit ISBN'),
//   force: z.boolean().optional().default(false).describe('Force refresh from providers'),
// })

// export const EnrichmentResponseSchema = z.object({
//   success: z.literal(true),
//   data: z.object({
//     book: BookSchema,
//     enriched: z.boolean().describe('Whether new data was fetched'),
//     provider: z.string().describe('Provider used for enrichment'),
//   }),
//   metadata: z.object({
//     cached: z.boolean(),
//     timestamp: z.string(),
//   }),
// })
