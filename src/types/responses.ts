/**
 * API Response Envelopes - Standardized Contracts
 *
 * This module defines the canonical API response formats used across all HTTP endpoints.
 * All responses follow a consistent envelope structure for predictable client-side handling.
 *
 * ## Unified Response Envelope (Current Standard)
 *
 * All /v1/* endpoints use the `ResponseEnvelope<T>` format:
 *
 * **Success Response:**
 * ```json
 * {
 *   "data": { ...payload... },
 *   "metadata": {
 *     "timestamp": "2025-11-14T23:00:00.000Z",
 *     "processingTime": 123,
 *     "provider": "google-books",
 *     "cached": true
 *   }
 * }
 * ```
 *
 * **Error Response:**
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
 *
 * ## Legacy Response Format (Deprecated)
 *
 * The legacy `SuccessResponse<T> | ErrorResponse` format with `success` discriminator
 * has been deprecated. Use `ResponseEnvelope<T>` for all new endpoints.
 *
 * **Migration Note:** The feature flag `ENABLE_UNIFIED_ENVELOPE` has been removed.
 * All endpoints now use the unified envelope format exclusively.
 *
 * @module types/responses
 */

import type { DataProvider, ApiErrorCode } from './enums.js';
import type { WorkDTO, EditionDTO, AuthorDTO } from './canonical.js';

// ============================================================================
// RESPONSE ENVELOPE
// ============================================================================

/**
 * Response metadata included in every response (legacy)
 */
export interface ResponseMeta {
  timestamp: string; // ISO 8601
  processingTime?: number; // milliseconds
  provider?: DataProvider;
  cached?: boolean;
  cacheAge?: number; // seconds since cached
  requestId?: string; // for distributed tracing (future)
}

/**
 * Response metadata for unified envelope format
 *
 * Included in all API responses to provide context about the request processing.
 */
export interface ResponseMetadata {
  timestamp: string; // ISO 8601 timestamp of when the response was generated
  traceId?: string; // Optional distributed tracing identifier (future use)
  processingTime?: number; // Request processing duration in milliseconds
  provider?: DataProvider; // Data source that fulfilled the request
  cached?: boolean; // Whether the response was served from cache
}

/**
 * API Error structure
 *
 * Consistent error format included in all error responses.
 */
export interface ApiError {
  message: string; // Human-readable error description
  code?: string; // Machine-readable error code for programmatic handling
  details?: any; // Optional additional context about the error
}

/**
 * Universal Response Envelope (Current Standard)
 *
 * All /v1/* endpoints use this format for consistent client-side handling.
 * The envelope always includes `data` and `metadata` fields.
 *
 * - Success: `data` contains the payload, `error` is undefined
 * - Error: `data` is null, `error` contains error details
 *
 * @template T - The type of the success response payload
 *
 * @example Success response
 * ```typescript
 * const response: ResponseEnvelope<BookSearchResponse> = {
 *   data: { works: [...], editions: [...], authors: [...] },
 *   metadata: { timestamp: "2025-11-14T23:00:00.000Z", provider: "google-books" }
 * };
 * ```
 *
 * @example Error response
 * ```typescript
 * const response: ResponseEnvelope<null> = {
 *   data: null,
 *   metadata: { timestamp: "2025-11-14T23:00:00.000Z" },
 *   error: { message: "Book not found", code: "NOT_FOUND" }
 * };
 * ```
 */
export interface ResponseEnvelope<T> {
  data: T | null;
  metadata: ResponseMetadata;
  error?: ApiError;
}

/**
 * Success Response Envelope (Legacy - Deprecated)
 *
 * @deprecated Use `ResponseEnvelope<T>` instead
 *
 * Legacy format with `success` discriminator. This format is no longer used
 * for new endpoints but is maintained for backward compatibility in some
 * internal response builders.
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

/**
 * Error Response Envelope (Legacy - Deprecated)
 *
 * @deprecated Use `ResponseEnvelope<null>` with error field instead
 *
 * Legacy error format with `success` discriminator. This format is no longer used
 * for new endpoints but is maintained for backward compatibility.
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: ApiErrorCode;
    details?: any;
  };
  meta: ResponseMeta;
  status?: number; // Optional HTTP status code (Issue #398)
}

/**
 * Discriminated Union for Legacy Responses (Deprecated)
 *
 * @deprecated Use `ResponseEnvelope<T>` instead
 */
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// DOMAIN-SPECIFIC RESPONSE TYPES
// ============================================================================

/**
 * Book search response
 * Used by: /v1/search/title, /v1/search/isbn, /v1/search/advanced
 */
export interface BookSearchResponse {
  works: WorkDTO[];
  editions: EditionDTO[];
  authors: AuthorDTO[];
  totalResults?: number; // for pagination (future)
}

/**
 * Enrichment job response
 * Used by: /v1/api/enrichment/start
 */
export interface EnrichmentJobResponse {
  jobId: string;
  queuedCount: number;
  estimatedDuration?: number; // seconds
  websocketUrl: string;
}

/**
 * Bookshelf scan response
 * Used by: /v1/api/scan-bookshelf, /v1/api/scan-bookshelf/batch
 */
export interface BookshelfScanResponse {
  jobId: string;
  detectedBooks: {
    work: WorkDTO;
    edition: EditionDTO;
    confidence: number; // 0.0-1.0
  }[];
  websocketUrl: string;
}

// ============================================================================
// AI PIPELINE RESPONSE TYPES (Phase 2 - Canonical API Contract)
// ============================================================================

/**
 * Bookshelf Scan Initialization Response
 * Used by: POST /api/scan-bookshelf/batch
 */
export interface BookshelfScanInitResponse {
  jobId: string;
  token: string; // WebSocket authentication token
  totalPhotos: number;
  status: 'started' | 'processing';
}

/**
 * BoundingBox - Rectangle coordinates for book spine in image
 */
export interface BoundingBox {
  x: number;      // X coordinate (0.0-1.0, normalized)
  y: number;      // Y coordinate (0.0-1.0, normalized)
  width: number;  // Width (0.0-1.0, normalized)
  height: number; // Height (0.0-1.0, normalized)
}

/**
 * DetectedBookDTO - Book detected by AI bookshelf scan
 *
 * Hybrid structure: flat fields for simple data, nested enrichment for canonical DTOs.
 * Used in WebSocket completion messages (AIScanCompletePayload).
 */
export interface DetectedBookDTO {
  title?: string;
  author?: string;
  isbn?: string;
  confidence?: number;  // 0.0-1.0 (AI confidence score)
  boundingBox?: BoundingBox;
  enrichmentStatus?: 'pending' | 'success' | 'not_found' | 'error';

  // Flattened edition fields (not nested) - DEPRECATED, use enrichment below
  coverUrl?: string;
  publisher?: string;
  publicationYear?: number;

  // Nested enrichment data (canonical DTOs) - Added Nov 2025 to fix enrichment loss
  enrichment?: {
    status: 'success' | 'not_found' | 'error';
    work?: WorkDTO;
    editions?: EditionDTO[];
    authors?: AuthorDTO[];
    provider?: string;
    cachedResult?: boolean;
    error?: string;
  };
}

/**
 * CSV Import Initialization Response
 * Used by: POST /api/import/csv-gemini
 */
export interface CSVImportInitResponse {
  jobId: string;
  token: string; // WebSocket authentication token
}

/**
 * ParsedBookDTO - Book parsed from CSV file
 */
export interface ParsedBookDTO {
  title: string;
  author: string;
  isbn?: string;
}

/**
 * Enrichment Job Initialization Response
 * Used by: POST /api/enrichment/start
 */
export interface EnrichmentJobInitResponse {
  success: boolean;
  processedCount: number;
  totalCount: number;
  token: string; // WebSocket authentication token
}

/**
 * EnrichedBookDTO - Book with enrichment data from external providers
 *
 * Flattened structure (no nested objects) for iOS Codable parsing.
 * Used in WebSocket completion messages (EnrichmentCompletePayload).
 */
export interface EnrichedBookDTO {
  title: string;
  author?: string;
  isbn?: string;
  success: boolean; // true if enrichment found data, false otherwise
  error?: string;

  // Nested enrichment data (matches iOS EnrichedBookPayload)
  enriched?: {
    work: WorkDTO;
    edition?: EditionDTO;
    authors: AuthorDTO[];
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create success response object (legacy format)
 * Returns SuccessResponse<T> object, not Response
 */
export function createSuccessResponseObject<T>(
  data: T,
  meta: Partial<ResponseMeta> = {}
): SuccessResponse<T> {
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
 * Create error response object (legacy format)
 * Returns ErrorResponse object, not Response
 */
export function createErrorResponseObject(
  message: string,
  code?: ApiErrorCode,
  details?: any,
  meta: Partial<ResponseMeta> = {}
): ErrorResponse {
  return {
    success: false,
    error: { message, code, details },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}
