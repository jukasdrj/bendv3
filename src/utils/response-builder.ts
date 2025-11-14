/**
 * Response Builder Utilities
 *
 * Centralized utilities for creating consistent HTTP responses with proper
 * headers and formatting. Reduces code duplication across route handlers.
 */

import { getCorsHeaders } from "../middleware/cors.js";

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
