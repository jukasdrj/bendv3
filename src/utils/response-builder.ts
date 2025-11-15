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
import type { ResponseEnvelope, ResponseMetadata, ApiError } from "../types/responses.js";

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
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  CACHE_ERROR: 'CACHE_ERROR',

  // Internal errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };

  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...(corsRequest ? getCorsHeaders(corsRequest) : {}),
      "Content-Type": "application/json",
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
  console.error(`Error [${code || 'UNKNOWN'}]:`, message);

  const envelope: ResponseEnvelope<null> = {
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
    error: {
      message,
      code,
      details,
    },
  };

  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...(corsRequest ? getCorsHeaders(corsRequest) : {}),
      "Content-Type": "application/json",
    },
  });
}

// ============================================================================
// LEGACY RESPONSE OBJECT FUNCTIONS (For v1 Search Handlers)
// ============================================================================

/**
 * Create legacy success response object (SuccessResponse format)
 *
 * Returns SuccessResponse<T> object for v1 search handlers.
 * Router wraps these with adaptToUnifiedEnvelope() to convert to new format.
 *
 * @param data - Success data payload
 * @param meta - Optional metadata (uses ResponseMeta, not ResponseMetadata)
 * @returns SuccessResponse<T> with success flag
 *
 * @example
 * // For v1 search handlers
 * return createSuccessResponseObject({ works: [] }, { cached: true, provider: 'google-books' });
 */
export function createSuccessResponseObject<T>(
  data: T,
  meta: any = {},
): { success: true; data: T; meta: any } {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create legacy error response object (ErrorResponse format)
 *
 * Returns ErrorResponse object for v1 search handlers.
 * Router wraps these with adaptToUnifiedEnvelope() to convert to new format.
 *
 * @param message - Error message
 * @param code - Optional error code
 * @param details - Optional error details
 * @param meta - Optional metadata (uses ResponseMeta, not ResponseMetadata)
 * @returns ErrorResponse with success flag
 *
 * @example
 * // For v1 search handlers
 * return createErrorResponseObject('Invalid ISBN', 'INVALID_ISBN');
 */
export function createErrorResponseObject(
  message: string,
  code?: ApiErrorCode | string,
  details?: any,
  meta: any = {},
): { success: false; error: { message: string; code?: string; details?: any }; meta: any } {
  return {
    success: false,
    error: { message, code, details },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

// ============================================================================
// LEGACY RESPONSE FUNCTIONS (DEPRECATED)
// ============================================================================

/**
 * @deprecated Use createSuccessResponse() instead
 *
 * Create a JSON response with proper headers
 */
export function jsonResponse(
  data: any,
  status: number = 200,
  corsRequest: Request | null = null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...(corsRequest ? getCorsHeaders(corsRequest) : {}),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * @deprecated Use createErrorResponse() instead
 *
 * Create an error response with legacy format (success: false)
 */
export function errorResponse(
  code: string,
  message: string,
  status: number = 400,
  corsRequest: Request | null = null,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
    corsRequest,
    extraHeaders,
  );
}

/**
 * @deprecated Use createSuccessResponse() with status 202
 *
 * Create a 202 Accepted response for async operations
 */
export function acceptedResponse(
  data: any,
  corsRequest: Request | null = null,
): Response {
  return jsonResponse(data, 202, corsRequest);
}

/**
 * @deprecated Use createSuccessResponse() instead
 *
 * Create a success response with legacy format (success: true)
 */
export function successResponse(
  data: any,
  metadata: any = {},
  corsRequest: Request | null = null,
): Response {
  return jsonResponse(
    {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    },
    200,
    corsRequest,
  );
}

/**
 * @deprecated Use createErrorResponse() with ErrorCodes.NOT_FOUND
 *
 * Create a not found (404) error response
 */
export function notFoundResponse(
  message: string = "Resource not found",
  corsRequest: Request | null = null,
): Response {
  return errorResponse("NOT_FOUND", message, 404, corsRequest);
}
