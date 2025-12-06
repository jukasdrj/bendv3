/**
 * Enrich endpoint schemas for BooksTrack API
 *
 * Single or batch ISBN enrichment with optional embedding generation.
 */

import { z } from '@hono/zod-openapi'
import { BookSchema } from './book'
import { SuccessResponseSchema } from './response'

/**
 * Enrich request body (supports both isbns and barcodes formats for iOS compatibility)
 */
const ISBNArraySchema = z.array(z.string().regex(/^\d{10}(\d{3})?$/))

export const EnrichRequestSchema = z.union([
  z.object({
    isbns: ISBNArraySchema
      .min(1)
      .max(500)
      .describe('Array of ISBNs to enrich (1-500, supports ISBN-10 and ISBN-13)'),
    includeEmbedding: z.boolean()
      .default(false)
      .optional()
      .describe('Generate semantic embeddings for vector search'),
    async: z.boolean()
      .default(false)
      .optional()
      .describe('Process asynchronously as background job (required for batches >50)')
  }),
  z.object({
    barcodes: ISBNArraySchema
      .min(1)
      .max(500)
      .describe('Array of ISBNs (iOS format - same as isbns)'),
    includeEmbedding: z.boolean()
      .default(false)
      .optional()
      .describe('Generate semantic embeddings for vector search'),
    async: z.boolean()
      .default(false)
      .optional()
      .describe('Process asynchronously as background job (required for batches >50)')
  })
]).refine((data) => {
  const isbns = 'isbns' in data ? data.isbns : data.barcodes
  const isAsync = data.async ?? false

  // Sync mode limited to 50 ISBNs
  if (!isAsync && isbns.length > 50) {
    return false
  }

  return true
}, {
  message: 'Sync mode limited to 50 ISBNs. Use async=true for batches >50 (up to 500 ISBNs)'
}).openapi('EnrichRequest')

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>

/**
 * Enriched book with vectorization status
 */
export const EnrichedBookSchema = BookSchema.extend({
  vectorized: z.boolean().describe('Whether semantic embedding was generated')
}).openapi('EnrichedBook')

export type EnrichedBook = z.infer<typeof EnrichedBookSchema>

/**
 * Enrich response data (supports batch)
 */
export const EnrichResultDataSchema = z.object({
  books: z.array(EnrichedBookSchema).describe('Enriched books (may be fewer than requested if some not found)'),
  requested: z.number().int().min(1).describe('Number of ISBNs requested'),
  found: z.number().int().min(0).describe('Number of books found'),
  notFound: z.array(z.string()).optional().describe('ISBNs that were not found')
}).openapi('EnrichResultData')

export type EnrichResultData = z.infer<typeof EnrichResultDataSchema>

/**
 * Complete enrich response schema
 */
export const EnrichResponseSchema = SuccessResponseSchema(EnrichResultDataSchema)

export type EnrichResponse = z.infer<typeof EnrichResponseSchema>
