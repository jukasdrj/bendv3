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

import { getCorsHeaders } from "../middleware/cors.js";
import type { ApiErrorCode } from "../types/enums.js";
import type {
  ResponseEnvelope,
  ResponseMetadata,
  ApiError,
} from "../types/responses.js";

/**
 * Standard error codes for consistent error handling across the API
 *
 * These codes are used in error responses to provide machine-readable
 * error types that clients can handle programmatically.
 */
export const ErrorCodes = {
  // Request validation errors (4xx)
  MISSING_PARAMETER: "MISSING_PARAMETER",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_ISBN: "INVALID_ISBN",
  INVALID_QUERY: "INVALID_QUERY",
  INVALID_FILE: "INVALID_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  BATCH_TOO_LARGE: "BATCH_TOO_LARGE",
  EMPTY_BATCH: "EMPTY_BATCH",

  // Resource errors (4xx)
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CLIENT_DISCONNECTED: "CLIENT_DISCONNECTED",

  // External service errors (5xx or 4xx)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  CACHE_ERROR: "CACHE_ERROR",

  // Internal errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// ============================================================================
// RESPONSE ENVELOPE FUNCTIONS (PRIMARY API)
// ============================================================================

/**
 * Create success response using ResponseEnvelope format
 *
 * This is the STANDARD way to create success responses. All handlers should use this.
 *
 * @param data - Success data payload
 * @param metadata - Optional metadata object (timestamp added automatically)
 * @param status - HTTP status code (default: 200)
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with envelope success structure
 *
 * @example
 * return createSuccessResponse({ book: bookData }, { cached: true, provider: 'google-books' });
 * return createSuccessResponse(initResponse, {}, 202);
 */
export function createSuccessResponse<T>(
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  status: number = 200,
  corsRequest: Request | null = null,
): Response {
  const envelope: ResponseEnvelope<T> = {
    success: true, // P0: Add success discriminator for iOS client compatibility
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };

  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...getCorsHeaders(corsRequest),
      "Content-Type": "application/json",
      "X-Response-Format": "v2.0", // For monitoring compliance (Issue #93)
    },
  });
}

/**
 * Create error response using ResponseEnvelope format
 *
 * This is the STANDARD way to create error responses. All handlers should use this.
 *
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param code - Optional error code (use ErrorCodes constants)
 * @param details - Optional additional error details
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with envelope error structure
 *
 * @example
 * return createErrorResponse('Resource not found', 404, ErrorCodes.NOT_FOUND);
 * return createErrorResponse('Invalid ISBN format', 400, ErrorCodes.INVALID_ISBN, { isbn: '123' });
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: string,
  details?: any,
  corsRequest: Request | null = null,
): Response {
  console.error(`Error [${code || "UNKNOWN"}]:`, message);

  // P1: Determine if error is retryable based on error code
  const retryableErrors = new Set([
    ErrorCodes.RATE_LIMIT_EXCEEDED,
    ErrorCodes.PROVIDER_ERROR,
    ErrorCodes.PROVIDER_TIMEOUT,
    ErrorCodes.CACHE_ERROR,
    ErrorCodes.INTERNAL_ERROR,
  ]);
  const retryable = code ? retryableErrors.has(code) : false;

  const envelope: ResponseEnvelope<null> = {
    success: false, // P0: Add success discriminator for iOS client compatibility
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
    error: {
      message,
      code,
      retryable, // P1: Add retryable field for intelligent retry logic
      details,
    },
  };

  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...getCorsHeaders(corsRequest),
      "Content-Type": "application/json",
      "X-Response-Format": "v2.0", // For monitoring compliance (Issue #93)
      "X-Error-Type": code || "UNKNOWN", // For analytics tracking
    },
  });
}