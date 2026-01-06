/**
 * Response Builder Utilities - Single Source of Truth
 *
 * Centralized utilities for creating consistent HTTP responses with proper
 * headers and formatting. All handlers MUST use these functions for response generation.
 *
 * ## Response Format
 *
 * All endpoints use the ResponseEnvelope format:
 *
 * **Success:**
 * ```json
 * {
 *   "data": { ...payload... },
 *   "metadata": {
 *     "timestamp": "2025-11-14T23:00:00.000Z",
 *     "provider": "google-books",
 *     "cached": true
 *   }
 * }
 * ```
 *
 * **Error:**
 * ```json
 * {
 *   "data": null,
 *   "metadata": {
 *     "timestamp": "2025-11-14T23:00:00.000Z"
 *   },
 *   "error": {
 *     "message": "Invalid query parameter",
 *     "code": "INVALID_QUERY",
 *     "details": { ... }
 *   }
 * }
 * ```
 */

import { getCorsHeaders } from '../../middleware/cors.js'
import type { ResponseEnvelope } from '../../types/responses.js'

/**
 * Standard error codes for consistent error handling across the API
 *
 * These codes are used in error responses to provide machine-readable
 * error types that clients can handle programmatically.
 */
export const ErrorCodes = {
  // Request validation errors (4xx)
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_ISBN: 'INVALID_ISBN',
  INVALID_QUERY: 'INVALID_QUERY',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  BATCH_TOO_LARGE: 'BATCH_TOO_LARGE',
  EMPTY_BATCH: 'EMPTY_BATCH',

  // Resource errors (4xx)
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CLIENT_DISCONNECTED: 'CLIENT_DISCONNECTED',

  // External service errors (5xx or 4xx)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN', // Issue #303: Circuit breaker is open
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  CACHE_ERROR: 'CACHE_ERROR',

  // Internal errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

// ============================================================================
// RESPONSE ENVELOPE FUNCTIONS (PRIMARY API)
// ============================================================================

/**
 * Options for createErrorResponse
 */
export interface ErrorResponseOptions {
  /** Human-readable error message */
  message: string
  /** HTTP status code (default: 500) */
  status?: number
  /** Error code (use ErrorCodes constants) */
  code?: string
  /** Additional error details */
  details?: any
  /** Request for CORS headers */
  corsRequest?: Request | null
  /** Retry delay in milliseconds (sets Retry-After header for 429 responses) */
  retryAfterMs?: number
}

/**
 * Create error response using ResponseEnvelope format
 *
 * This is the STANDARD way to create error responses. All handlers should use this.
 *
 * @param messageOrOptions - Error message string OR options object
 * @param status - HTTP status code (ignored if options object used)
 * @param code - Optional error code (ignored if options object used)
 * @param details - Optional additional error details (ignored if options object used)
 * @param corsRequest - Optional request for CORS headers (ignored if options object used)
 * @returns Response object with envelope error structure
 *
 * @example
 * // Simple usage (backward compatible)
 * return createErrorResponse('Resource not found', 404, ErrorCodes.NOT_FOUND);
 * return createErrorResponse('Invalid ISBN format', 400, ErrorCodes.INVALID_ISBN, { isbn: '123' });
 *
 * // With Retry-After header for rate limiting (Issue #302)
 * return createErrorResponse({
 *   message: 'Rate limit exceeded',
 *   status: 429,
 *   code: ErrorCodes.RATE_LIMIT_EXCEEDED,
 *   retryAfterMs: 60000
 * });
 */
export function createErrorResponse(
  messageOrOptions: string | ErrorResponseOptions,
  status: number = 500,
  code?: string,
  details?: any,
  corsRequest: Request | null = null,
): Response {
  // Support both old signature and new options object
  let opts: ErrorResponseOptions
  if (typeof messageOrOptions === 'string') {
    opts = { message: messageOrOptions, status, code, details, corsRequest }
  } else {
    opts = messageOrOptions
  }

  const finalStatus = opts.status ?? 500
  const finalCode = opts.code
  const finalDetails = opts.details
  const finalCorsRequest = opts.corsRequest ?? null
  const retryAfterMs = opts.retryAfterMs

  console.error(`Error [${finalCode || 'UNKNOWN'}]:`, opts.message)

  // P1: Determine if error is retryable based on error code (Issue #303)
  const retryableErrors = new Set<string>([
    ErrorCodes.RATE_LIMIT_EXCEEDED,
    ErrorCodes.CIRCUIT_OPEN, // Issue #303: Circuit breaker errors are retryable
    ErrorCodes.PROVIDER_ERROR,
    ErrorCodes.PROVIDER_TIMEOUT,
    ErrorCodes.CACHE_ERROR,
    ErrorCodes.INTERNAL_ERROR,
  ])
  const retryable = finalCode ? retryableErrors.has(finalCode) : false

  const envelope: ResponseEnvelope<null> & { success: false } = {
    success: false as const, // P0: Add success discriminator for iOS client compatibility
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
    error: {
      message: opts.message,
      code: finalCode,
      retryable, // P1: Add retryable field for intelligent retry logic
      // Issue #302: Include retryAfterMs in response body for iOS client
      ...(retryAfterMs && { retryAfterMs }),
      details: finalDetails,
    },
  }

  // Build headers (Issue #302: Add Retry-After for 429 responses)
  const headers: Record<string, string> = {
    ...getCorsHeaders(finalCorsRequest ?? undefined),
    'Content-Type': 'application/json',
    'X-Response-Format': 'v2.0', // For monitoring compliance (Issue #93)
    'X-Error-Type': finalCode || 'UNKNOWN', // For analytics tracking
  }

  // Add Retry-After header for rate-limited responses (RFC 6585)
  if (finalStatus === 429 && retryAfterMs) {
    // Retry-After can be seconds or HTTP-date; we use seconds (more precise)
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000))
  }

  return new Response(JSON.stringify(envelope), {
    status: finalStatus,
    headers,
  })
}
