/**
 * Enrich endpoint schemas for BooksTrack API
 *
 * Single or batch ISBN enrichment with optional embedding generation.
 */

import { z } from 'zod'
import { BookSchema } from './book'
import { SuccessResponseSchema } from './response'

/**
 * Enrich request body
 */
export const EnrichRequestSchema = z.object({
  isbns: z.array(z.string().regex(/^\d{10}(\d{3})?$/))
    .min(1)
    .max(50)
    .describe('Array of ISBNs to enrich (1-50, supports ISBN-10 and ISBN-13)'),
  includeEmbedding: z.boolean()
    .default(false)
    .optional()
    .describe('Generate semantic embeddings for vector search')
})

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>

/**
 * Enriched book with vectorization status
 */
export const EnrichedBookSchema = BookSchema.extend({
  vectorized: z.boolean().describe('Whether semantic embedding was generated')
})

export type EnrichedBook = z.infer<typeof EnrichedBookSchema>

/**
 * Enrich response data (supports batch)
 */
export const EnrichResultDataSchema = z.object({
  books: z.array(EnrichedBookSchema).describe('Enriched books (may be fewer than requested if some not found)'),
  requested: z.number().int().min(1).describe('Number of ISBNs requested'),
  found: z.number().int().min(0).describe('Number of books found'),
  notFound: z.array(z.string()).optional().describe('ISBNs that were not found')
})

export type EnrichResultData = z.infer<typeof EnrichResultDataSchema>

/**
 * Complete enrich response schema
 */
export const EnrichResponseSchema = SuccessResponseSchema(EnrichResultDataSchema)

export type EnrichResponse = z.infer<typeof EnrichResponseSchema>
