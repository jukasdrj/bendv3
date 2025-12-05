/**
 * Response schemas for BooksTrack API
 *
 * Implements RFC 9457 Problem Details for error responses.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

import { z } from '@hono/zod-openapi'

/**
 * Data source providers
 */
export const DataSourceSchema = z.enum([
  'alexandria',
  'google_books',
  'open_library',
  'isbndb',
  'kv-cache',
  'vectorize',
  'text-search',
  'job-state-manager-do'
]).openapi('DataSource')

export type DataSource = z.infer<typeof DataSourceSchema>

/**
 * Rate limit information
 */
export const RateLimitSchema = z.object({
  limit: z.number().int().describe('Max requests per window'),
  remaining: z.number().int().describe('Requests remaining in window'),
  reset: z.number().int().describe('Unix timestamp when window resets')
}).openapi('RateLimit')

export type RateLimit = z.infer<typeof RateLimitSchema>

/**
 * Shared response metadata included in all API responses
 */
export const ResponseMetadataSchema = z.object({
  timestamp: z.string().datetime().describe('ISO 8601 timestamp of response'),
  requestId: z.string().uuid().optional().describe('Correlation ID for request tracing (X-Request-ID)'),
  source: DataSourceSchema.optional().describe('Data source provider'),
  cached: z.boolean().optional().describe('Whether response was served from cache'),
  processingTimeMs: z.number().int().min(0).optional().describe('Processing time in milliseconds'),
  rateLimit: RateLimitSchema.optional().describe('Rate limit status')
}).openapi('ResponseMetadata')

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>

/**
 * HATEOAS link for resource discoverability (optional)
 */
export const LinkSchema = z.object({
  href: z.string().url().describe('Link URL'),
  rel: z.string().describe('Link relation type'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method')
}).openapi('Link')

export type Link = z.infer<typeof LinkSchema>

/**
 * Generic success response factory function
 *
 * Usage:
 * ```typescript
 * const BookResponseSchema = SuccessResponseSchema(BookSchema)
 * ```
 */
export function SuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true).describe('Success discriminator (always true for successful responses)'),
    data: dataSchema,
    metadata: ResponseMetadataSchema,
    _links: z.record(z.string(), LinkSchema).optional().describe('HATEOAS links for resource discoverability')
  })
}

/**
 * RFC 9457 Problem Details error codes
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */
export const ErrorCodeSchema = z.enum([
  // Request validation errors (4xx)
  'MISSING_PARAMETER',
  'INVALID_REQUEST',
  'INVALID_ISBN',
  'INVALID_QUERY',
  'INVALID_FILE',
  'FILE_TOO_LARGE',
  'BATCH_TOO_LARGE',
  'EMPTY_BATCH',
  // Resource errors (4xx)
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CLIENT_DISCONNECTED',
  // External service errors (5xx or 4xx)
  'RATE_LIMIT_EXCEEDED',
  'CIRCUIT_OPEN',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'CACHE_ERROR',
  // Internal errors (5xx)
  'INTERNAL_ERROR',
  'API_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT',
  'FEATURE_NOT_AVAILABLE'
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>

/**
 * Field-level validation error
 */
export const FieldErrorSchema = z.object({
  field: z.string().describe('Field path (e.g., "isbns[0]")'),
  message: z.string().describe('Validation error message'),
  code: z.string().optional().describe('Validation error code')
}).openapi('FieldError')

export type FieldError = z.infer<typeof FieldErrorSchema>

/**
 * RFC 9457 Problem Details error response
 *
 * Combines RFC 9457 standard fields with BooksTrack-specific extensions.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 *
 * Standard fields:
 * - type: URI reference identifying the problem type
 * - title: Short, human-readable summary
 * - status: HTTP status code
 * - detail: Human-readable explanation specific to this occurrence
 * - instance: URI reference identifying the specific occurrence
 *
 * Extensions:
 * - code: Machine-readable error code (BooksTrack-specific)
 * - retryable: Whether the client should retry
 * - retryAfterMs: Milliseconds to wait before retry
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false).describe('Success discriminator (always false for error responses)'),
  // RFC 9457 Problem Details standard fields
  type: z.string().url().default('about:blank').describe('URI reference identifying the problem type'),
  title: z.string().describe('Short, human-readable summary of the problem type'),
  status: z.number().int().min(100).max(599).describe('HTTP status code'),
  detail: z.string().optional().describe('Human-readable explanation specific to this occurrence'),
  instance: z.string().optional().describe('URI reference identifying this specific occurrence'),
  // BooksTrack extensions
  code: ErrorCodeSchema.describe('Machine-readable error code'),
  retryable: z.boolean().optional().describe('Whether the request can be retried'),
  retryAfterMs: z.number().int().min(0).optional().describe('Milliseconds to wait before retry'),
  errors: z.array(FieldErrorSchema).optional().describe('Field-level validation errors'),
  // Metadata
  metadata: z.object({
    timestamp: z.string().datetime().describe('ISO 8601 timestamp'),
    requestId: z.string().uuid().optional().describe('Request correlation ID')
  })
}).openapi('ErrorResponse')

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * TypeScript utility type for success responses with inferred data type
 */
export type SuccessResponse<T> = {
  success: true
  data: T
  metadata: ResponseMetadata
  _links?: Record<string, Link>
}
