/**
 * API Response Utilities - DEPRECATED
 * 
 * @deprecated This entire file is deprecated. Use `src/utils/response-builder.ts` instead.
 * 
 * All functions in this file have been moved to response-builder.ts for consolidation:
 * - createSuccessResponse() → use from response-builder.ts
 * - createErrorResponse() → use from response-builder.ts
 * 
 * This file is kept temporarily for backward compatibility and will be removed in a future version.
 */

import type { ResponseEnvelope, ResponseMetadata, ApiError } from '../types/responses.js';

/**
 * @deprecated Use `createSuccessResponse` from `src/utils/response-builder.ts` instead.
 * 
 * Creates a standardized successful JSON response using the ResponseEnvelope.
 *
 * @param data The payload to send
 * @param metadata Optional metadata (timestamp added automatically)
 * @param status HTTP status code (default: 200)
 * @returns Response object with enveloped JSON
 */
export function createSuccessResponse<T>(
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  status: number = 200
): Response {
  const envelope: ResponseEnvelope<T> = {
    data: data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };

  return new Response(JSON.stringify(envelope), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @deprecated Use `createErrorResponse` from `src/utils/response-builder.ts` instead.
 * 
 * Creates a standardized error JSON response using the ResponseEnvelope.
 *
 * @param message The error message
 * @param status The HTTP error status code (default: 500)
 * @param code An optional internal error code
 * @param details Optional additional error details (suggestions, context, etc.)
 * @returns Response object with enveloped error JSON
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: string,
  details?: any
): Response {
  const error: ApiError = { message, code, details };
  const envelope: ResponseEnvelope<null> = {
    data: null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
    error: error,
  };

  return new Response(JSON.stringify(envelope), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}
