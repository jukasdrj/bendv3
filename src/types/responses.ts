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

import type { AuthorDTO, EditionDTO, WorkDTO } from './canonical.js'
import type { DataProvider } from './enums.js'

// ============================================================================
// RESPONSE ENVELOPE
// ============================================================================

/**
 * Response metadata included in every response (legacy)
 */
export interface ResponseMeta {
  timestamp: string // ISO 8601
  processingTime?: number // milliseconds
  provider?: DataProvider
  cached?: boolean
  cacheAge?: number // seconds since cached
  requestId?: string // for distributed tracing (future)
}

/**
 * Response metadata for unified envelope format
 *
 * Included in all API responses to provide context about the request processing.
 */
export interface ResponseMetadata {
  timestamp: string // ISO 8601 timestamp of when the response was generated
  traceId?: string // Optional distributed tracing identifier (future use)
  processingTime?: number // Request processing duration in milliseconds
  provider?: DataProvider // Data source that fulfilled the request
  cached?: boolean // Whether the response was served from cache
  source?: string // Sprint 3: Data source identifier (e.g., 'vectorize', 'kv-cache', 'd1-database')
  searchMode?: string // Sprint 3: Search mode used (e.g., 'text', 'semantic', 'hybrid')
  generatedAt?: string // Sprint 3: When recommendations were generated
  expiresAt?: string // Sprint 3: When cached data expires
  nextGenerationTime?: string // Sprint 3: Next scheduled generation time
}

/**
 * API Error structure
 *
 * Consistent error format included in all error responses.
 */
export interface ApiError {
  message: string // Human-readable error description
  code?: string // Machine-readable error code for programmatic handling
  retryable: boolean // P1: Whether the client should retry this request
  details?: any // Optional additional context about the error
}

// ============================================================================
// DOMAIN-SPECIFIC RESPONSE TYPES
// ============================================================================

/**
 * Book search response
 * Used by: /v1/search/title, /v1/search/isbn, /v1/search/advanced
 */
export interface BookSearchResponse {
  works: WorkDTO[]
  editions: EditionDTO[]
  authors: AuthorDTO[]
  resultCount: number // Number of books found (0 for no results, N for N books)
  totalResults?: number // for pagination (future)
}

/**
 * Enrichment job response
 * Used by: /v1/api/enrichment/start
 */
export interface EnrichmentJobResponse {
  jobId: string
  queuedCount: number
  estimatedDuration?: number // seconds
  websocketUrl: string
}

/**
 * Bookshelf scan response
 * Used by: /v1/api/scan-bookshelf, /v1/api/scan-bookshelf/batch
 */
export interface BookshelfScanResponse {
  jobId: string
  detectedBooks: {
    work: WorkDTO
    edition: EditionDTO
    confidence: number // 0.0-1.0
  }[]
  websocketUrl: string
}

// ============================================================================
// AI PIPELINE RESPONSE TYPES (Phase 2 - Canonical API Contract)
// ============================================================================

/**
 * Bookshelf Scan Initialization Response
 * Used by: POST /api/scan-bookshelf/batch, POST /api/batch-scan
 */
export interface BookshelfScanInitResponse {
  jobId: string
  authToken: string // SSE authentication token (canonical field)
  sseUrl: string // SSE endpoint for real-time progress updates
  statusUrl: string // HTTP polling endpoint for job status
  totalPhotos: number
  status: 'started' | 'processing'
}

/**
 * BoundingBox - Rectangle coordinates for book spine in image
 */
export interface BoundingBox {
  x: number // X coordinate (0.0-1.0, normalized)
  y: number // Y coordinate (0.0-1.0, normalized)
  width: number // Width (0.0-1.0, normalized)
  height: number // Height (0.0-1.0, normalized)
}

/**
 * DetectedBookDTO - Book detected by AI bookshelf scan
 *
 * Hybrid structure: flat fields for simple data, nested enrichment for canonical DTOs.
 * Used in WebSocket completion messages (AIScanCompletePayload).
 */
export interface DetectedBookDTO {
  title?: string
  author?: string
  isbn?: string
  confidence?: number // 0.0-1.0 (AI confidence score)
  boundingBox?: BoundingBox
  // FIX (Shelf Scan Plan - Issue 2.2): Added "circuit_open" status for circuit breaker failures
  enrichmentStatus?: 'pending' | 'success' | 'not_found' | 'error' | 'circuit_open'

  // Flattened edition fields (not nested) - DEPRECATED, use enrichment below
  coverUrl?: string
  publisher?: string
  publicationYear?: number

  // Nested enrichment data (canonical DTOs) - Added Nov 2025 to fix enrichment loss
  // FIX (Shelf Scan Plan - Issue 2.2): Added "circuit_open" status + retryAfterMs for circuit breaker failures
  enrichment?: {
    status: 'success' | 'not_found' | 'error' | 'circuit_open'
    work?: WorkDTO
    editions?: EditionDTO[]
    authors?: AuthorDTO[]
    provider?: string
    cachedResult?: boolean
    error?: string
    retryAfterMs?: number // For circuit_open: when client can retry
  }
}

/**
 * CSV Import Initialization Response
 * Used by: POST /api/import/csv-gemini, POST /api/v2/imports
 */
export interface CSVImportInitResponse {
  jobId: string
  authToken: string // WebSocket/SSE authentication token (canonical field)
  sseUrl: string // SSE endpoint for real-time progress updates
  statusUrl: string // HTTP polling endpoint for job status
}

/**
 * ParsedBookDTO - Book parsed from CSV file
 */
export interface ParsedBookDTO {
  title: string
  author: string
  isbn?: string
}

/**
 * Enrichment Job Initialization Response
 * Used by: POST /v1/enrichment/batch
 */
export interface EnrichmentJobInitResponse {
  jobId: string // Echoed back from request for client confirmation
  success: boolean
  processedCount: number
  totalCount: number
  authToken: string // WebSocket authentication token (canonical field)
  token?: string // DEPRECATED: Use 'authToken'. Backward compatibility only. Removal: March 1, 2026
  message?: string // Human-readable status message
  websocketUrl: string // Full WebSocket URL with jobId and token
}

/**
 * EnrichedBookDTO - Book with enrichment data from external providers
 *
 * Flattened structure (no nested objects) for iOS Codable parsing.
 * Used in WebSocket completion messages (EnrichmentCompletePayload).
 */
export interface EnrichedBookDTO {
  title: string
  author?: string
  isbn?: string
  success: boolean // true if enrichment found data, false otherwise
  error?: string

  // Nested enrichment data (matches iOS EnrichedBookPayload)
  enriched?: {
    work: WorkDTO
    edition?: EditionDTO
    authors: AuthorDTO[]
  }
}
