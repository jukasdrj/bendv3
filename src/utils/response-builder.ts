/**
 * Response Builder Utilities
 *
 * Centralized utilities for creating consistent HTTP responses with proper
 * headers and formatting. Reduces code duplication across route handlers.
 * 
 * This is the single source of truth for all API response generation.
 * All handlers should use these utilities for consistent response formats.
 */

import { getCorsHeaders } from "../middleware/cors.js";
import type { ApiErrorCode } from "../types/enums.js";

/**
 * Create a JSON response with proper headers
 *
 * @param data - Data to serialize as JSON
 * @param status - HTTP status code (default: 200)
 * @param corsRequest - Optional request for CORS header generation
 * @param extraHeaders - Optional additional headers to include
 * @returns Response object with JSON content
 *
 * @example
 * return jsonResponse({ success: true, data: books });
 * return jsonResponse(errorData, 400, request);
 * return jsonResponse(data, 405, null, { 'Allow': 'GET, POST' });
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
 * Create an error response with standard error format
 *
 * @param code - Error code (e.g., 'INVALID_REQUEST')
 * @param message - Human-readable error message
 * @param status - HTTP status code (default: 400)
 * @param corsRequest - Optional request for CORS headers
 * @param extraHeaders - Optional additional headers to include
 * @returns Response object with error structure
 *
 * @example
 * return errorResponse('MISSING_FIELD', 'ISBN is required', 400, request);
 * return errorResponse('METHOD_NOT_ALLOWED', 'Use GET or POST', 405, null, { 'Allow': 'GET, POST' });
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
 * Create a 202 Accepted response for async operations
 *
 * Used for endpoints that trigger background processing.
 *
 * @param data - Response data (usually job ID and status)
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with 202 status
 *
 * @example
 * return acceptedResponse({ jobId: 'abc-123', status: 'processing' });
 */
export function acceptedResponse(
  data: any,
  corsRequest: Request | null = null,
): Response {
  return jsonResponse(data, 202, corsRequest);
}

/**
 * Create a success response with data and metadata
 *
 * Follows canonical response format with success flag.
 *
 * @param data - Success data payload
 * @param metadata - Optional metadata object
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with success structure
 *
 * @example
 * return successResponse({ book: bookData }, { cached: true });
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
 * Create a not found (404) error response
 *
 * @param message - Not found message (default: 'Resource not found')
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with 404 status
 *
 * @example
 * return notFoundResponse('Book not found');
 */
export function notFoundResponse(
  message: string = "Resource not found",
  corsRequest: Request | null = null,
): Response {
  return errorResponse("NOT_FOUND", message, 404, corsRequest);
}

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
  
  // External service errors (5xx or 4xx)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  CACHE_ERROR: 'CACHE_ERROR',
  
  // Internal errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Create error response using ResponseEnvelope format (new format)
 * 
 * This matches the format used by api-responses.ts and is used for
 * endpoints that need the envelope structure with data/metadata/error.
 *
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @param code - Optional error code
 * @param details - Optional additional error details
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with envelope error structure
 *
 * @example
 * return createErrorResponse('Resource not found', 404, 'NOT_FOUND');
 * return createErrorResponse('Internal error', 500);
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: string,
  details?: any,
  corsRequest: Request | null = null,
): Response {
  console.error(`Error [${code || 'UNKNOWN'}]:`, message);
  
  const envelope = {
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

/**
 * Create success response using ResponseEnvelope format (new format)
 * 
 * This matches the format used by api-responses.ts and is used for
 * endpoints that need the envelope structure with data/metadata.
 *
 * @param data - Success data payload
 * @param metadata - Optional metadata object
 * @param status - HTTP status code (default: 200)
 * @param corsRequest - Optional request for CORS headers
 * @returns Response object with envelope success structure
 *
 * @example
 * return createSuccessResponse({ book: bookData }, { cached: true });
 * return createSuccessResponse(initResponse, {}, 202);
 */
export function createSuccessResponse<T>(
  data: T,
  metadata: any = {},
  status: number = 200,
  corsRequest: Request | null = null,
): Response {
  const envelope = {
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
 * Create error envelope object (ResponseEnvelope format)
 *
 * Returns ResponseEnvelope<null> object for error cases.
 * Compliant with API Contract v2.0 (nullable data + optional error).
 *
 * @param message - Error message
 * @param code - Optional error code
 * @param details - Optional error details
 * @param metadata - Optional additional metadata
 * @returns ResponseEnvelope<null> with error
 *
 * @example
 * return Response.json(createErrorResponseObject('Invalid ISBN', 'INVALID_ISBN'), { status: 400 });
 */
export function createErrorResponseObject(
  message: string,
  code?: ApiErrorCode | string,
  details?: any,
  metadata: any = {},
): {
  data: null;
  metadata: {
    timestamp: string;
    [key: string]: any;
  };
  error: {
    message: string;
    code?: ApiErrorCode | string;
    details?: any;
  };
} {
  return {
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    error: { message, code, details },
  };
}

/**
 * Create success envelope object (ResponseEnvelope format)
 *
 * Returns ResponseEnvelope<T> object for success cases.
 * Compliant with API Contract v2.0 (nullable data + optional error).
 *
 * @param data - Success data payload
 * @param metadata - Optional metadata
 * @returns ResponseEnvelope<T> with data
 *
 * @example
 * return Response.json(createSuccessResponseObject({ works: [] }, { cached: true }));
 */
export function createSuccessResponseObject<T>(
  data: T,
  metadata: any = {},
): {
  data: T;
  metadata: {
    timestamp: string;
    [key: string]: any;
  };
} {
  return {
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}
