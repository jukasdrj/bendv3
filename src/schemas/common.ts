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

// ============================================================================
// RESPONSE ENVELOPE SCHEMAS
// ============================================================================

/**
 * Response Metadata Schema
 *
 * Included in all API responses to provide context about request processing.
 */
export const ResponseMetadataSchema = z.object({
  timestamp: z.string().datetime(),
  cached: z.boolean().optional(),
  source: z.enum([
    'google_books',
    'open_library',
    'isbndb',
    'kv_cache',
    'd1_database',
    'vectorize'
  ]).optional()
}).strict()

// Legacy alias for backward compatibility
export const MetadataSchema = ResponseMetadataSchema

/**
 * Generic Success Response Envelope
 *
 * Factory function to create a ResponseEnvelope schema for success responses.
 * This matches the actual BooksTrack API ResponseEnvelope format (v2.0).
 *
 * **NOTE:** The API does NOT use a `success` discriminator in the current implementation.
 * Success is determined by the absence of an `error` field and HTTP 2xx status code.
 *
 * @template T - Zod schema for the data payload
 *
 * @example
 * ```typescript
 * const BookResponseSchema = ResponseEnvelopeSchema(BookSchema)
 * // Results in: { data: {...}, metadata: {...} }
 * ```
 */
export const ResponseEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    metadata: ResponseMetadataSchema.optional()
  }).strict()


// ============================================================================
// ERROR RESPONSE SCHEMAS
// ============================================================================

/**
 * Error Object Schema
 *
 * Structured error information included in all error responses.
 * Supports circuit breaker errors with retry metadata.
 */
export const ErrorObjectSchema = z.object({
  code: z.enum([
    // Client errors (4xx)
    'NOT_FOUND',
    'INVALID_REQUEST',
    'INVALID_ISBN',
    'INVALID_QUERY',
    'MISSING_PARAMETER',
    'UNAUTHORIZED',
    'FORBIDDEN',

    // Server errors (5xx)
    'INTERNAL_ERROR',
    'API_ERROR',
    'NETWORK_ERROR',

    // Rate limiting & circuit breaker
    'RATE_LIMIT_EXCEEDED',
    'CIRCUIT_OPEN',

    // Provider-specific
    'PROVIDER_ERROR',
    'TIMEOUT'
  ]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean().optional(),
  retryAfterMs: z.number().min(0).optional(),
  provider: z.string().optional()
}).strict()

// Legacy alias for backward compatibility
export const ErrorDetailsSchema = ErrorObjectSchema

/**
 * Error Response Schema
 *
 * Canonical error response format for the BooksTrack API (v2.0).
 * Errors include a `data: null` field and an `error` object with details.
 *
 * @example
 * ```json
 * {
 *   "data": null,
 *   "metadata": {
 *     "timestamp": "2025-11-27T12:00:00.000Z"
 *   },
 *   "error": {
 *     "code": "CIRCUIT_OPEN",
 *     "message": "Provider google-books circuit breaker is open",
 *     "provider": "google-books",
 *     "retryable": true,
 *     "retryAfterMs": 45000
 *   }
 * }
 * ```
 */
export const ErrorResponseSchema = z.object({
  data: z.null(),
  metadata: ResponseMetadataSchema.optional(),
  error: ErrorObjectSchema
}).strict()



// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>
export type ErrorObject = z.infer<typeof ErrorObjectSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * Helper type to infer the success response type from a data schema
 */
export type SuccessResponse<T extends z.ZodTypeAny> = z.infer<ReturnType<typeof ResponseEnvelopeSchema<T>>>
