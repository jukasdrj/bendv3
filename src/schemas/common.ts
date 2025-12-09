/**
 * Common Zod Schemas - Response Envelopes and Errors
 *
 * Core schemas used across all API endpoints for OpenAPI generation.
 * These schemas define the canonical response format for the BooksTrack API.
 *
 * Phase 1.3 - Core Schemas (OpenAPI Migration Plan)
 *
 * @module schemas/common
 */

import { z } from 'zod'

/**
 * Response Envelope Schema Factory
 *
 * Creates a response envelope schema wrapping arbitrary data.
 * This is a generic factory function for building response schemas.
 *
 * @param dataSchema - Zod schema for the data payload
 * @returns Zod schema for complete response envelope
 */
export function ResponseEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    metadata: z.object({
      timestamp: z.string().datetime().optional(),
      cached: z.boolean().optional(),
      source: z.string().optional(),
    }).optional(),
  }).strict()
}
