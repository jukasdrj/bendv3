/**
 * RFC 9457 Problem Details helper functions
 *
 * Utilities for creating standardized error responses.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

import type { ErrorCode, ErrorResponse, FieldError } from './response'

/**
 * Base URL for error type documentation
 */
const ERROR_TYPE_BASE = 'https://api.oooefam.net/errors'

/**
 * Error code to HTTP status mapping
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  // 4xx Client Errors
  MISSING_PARAMETER: 400,
  INVALID_REQUEST: 400,
  INVALID_ISBN: 400,
  INVALID_QUERY: 400,
  INVALID_FILE: 400,
  FILE_TOO_LARGE: 413,
  BATCH_TOO_LARGE: 413,
  EMPTY_BATCH: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CLIENT_DISCONNECTED: 499,
  RATE_LIMIT_EXCEEDED: 429,
  // 5xx Server Errors
  CIRCUIT_OPEN: 503,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  CACHE_ERROR: 500,
  INTERNAL_ERROR: 500,
  API_ERROR: 500,
  NETWORK_ERROR: 502,
  TIMEOUT: 504,
  FEATURE_NOT_AVAILABLE: 501
}

/**
 * Error code to human-readable title mapping
 */
export const ERROR_TITLE_MAP: Record<ErrorCode, string> = {
  MISSING_PARAMETER: 'Missing Required Parameter',
  INVALID_REQUEST: 'Invalid Request',
  INVALID_ISBN: 'Invalid ISBN Format',
  INVALID_QUERY: 'Invalid Search Query',
  INVALID_FILE: 'Invalid File',
  FILE_TOO_LARGE: 'File Too Large',
  BATCH_TOO_LARGE: 'Batch Size Exceeded',
  EMPTY_BATCH: 'Empty Batch',
  NOT_FOUND: 'Resource Not Found',
  UNAUTHORIZED: 'Authentication Required',
  FORBIDDEN: 'Access Denied',
  CLIENT_DISCONNECTED: 'Client Disconnected',
  RATE_LIMIT_EXCEEDED: 'Rate Limit Exceeded',
  CIRCUIT_OPEN: 'Service Temporarily Unavailable',
  PROVIDER_ERROR: 'External Service Error',
  PROVIDER_TIMEOUT: 'External Service Timeout',
  CACHE_ERROR: 'Cache Error',
  INTERNAL_ERROR: 'Internal Server Error',
  API_ERROR: 'API Error',
  NETWORK_ERROR: 'Network Error',
  TIMEOUT: 'Request Timeout',
  FEATURE_NOT_AVAILABLE: 'Feature Not Available'
}

/**
 * Retryable error codes
 */
export const RETRYABLE_ERRORS: Set<ErrorCode> = new Set([
  'RATE_LIMIT_EXCEEDED',
  'CIRCUIT_OPEN',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'CACHE_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT'
])

/**
 * Options for createProblemDetails
 */
export interface ProblemDetailsOptions {
  /** URI reference identifying this specific occurrence */
  instance?: string
  /** Milliseconds to wait before retry */
  retryAfterMs?: number
  /** Field-level validation errors */
  errors?: FieldError[]
  /** Request correlation ID */
  requestId?: string
}

/**
 * Create an RFC 9457 Problem Details error response
 *
 * @example
 * ```typescript
 * const error = createProblemDetails('NOT_FOUND', 'Book with ISBN 9780439708180 not found', {
 *   instance: '/v3/books/9780439708180',
 *   requestId: 'abc-123'
 * })
 * ```
 */
export function createProblemDetails(
  code: ErrorCode,
  detail?: string,
  options?: ProblemDetailsOptions
): ErrorResponse {
  const status = ERROR_STATUS_MAP[code]
  const title = ERROR_TITLE_MAP[code]
  const retryable = RETRYABLE_ERRORS.has(code)

  // Pure RFC 9457 format (Issue #213: success field removed, HTTP status is sufficient)
  return {
    type: `${ERROR_TYPE_BASE}/${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance: options?.instance,
    code,
    retryable,
    retryAfterMs: options?.retryAfterMs,
    errors: options?.errors,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: options?.requestId
    }
  }
}

/**
 * Get HTTP status code for an error code
 */
export function getStatusForCode(code: ErrorCode): number {
  return ERROR_STATUS_MAP[code]
}

/**
 * Get human-readable title for an error code
 */
export function getTitleForCode(code: ErrorCode): string {
  return ERROR_TITLE_MAP[code]
}

/**
 * Check if an error code is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_ERRORS.has(code)
}

/**
 * Type guard to check if a response is an error
 *
 * Updated for pure RFC 9457 (Issue #213): Check HTTP status instead of success field.
 *
 * @example
 * ```typescript
 * const response = await api.getBook(isbn)
 * if (isErrorResponse(response)) {
 *   console.error(response.title, response.detail)
 * } else {
 *   console.log(response.data.title)
 * }
 * ```
 */
export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof (response as { status: unknown }).status === 'number' &&
    (response as { status: number }).status >= 400
  )
}

/**
 * Type guard to check if a response is successful
 *
 * Updated for pure RFC 9457 (Issue #213): Check for data field instead of success field.
 */
export function isSuccessResponse<T>(
  response: unknown
): response is { data: T } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    !isErrorResponse(response) // Ensure it's not an error response
  )
}
