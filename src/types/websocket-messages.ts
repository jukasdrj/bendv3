/**
 * Unified WebSocket Message Schema (v1.0.0) - Canonical Contract
 *
 * **This is the ONLY supported WebSocket message format.**
 * Legacy v1 methods (updateProgress, complete, fail) have been removed.
 *
 * Provides consistent message structure across all asynchronous job pipelines:
 * - **batch_enrichment**: Background book metadata enrichment from external APIs
 * - **csv_import**: AI-powered CSV parsing with Gemini
 * - **ai_scan**: Bookshelf image scanning and book detection with Gemini Vision
 *
 * ## Design Principles
 *
 * 1. **Discriminated Unions**: TypeScript can narrow message types based on `type` field
 * 2. **Schema Versioning**: `version` field enables future schema evolution without breaking clients
 * 3. **Pipeline Tracking**: `pipeline` field enables multi-job tracking in client UIs
 * 4. **Latency Monitoring**: `timestamp` enables client-side latency measurement
 * 5. **Type Safety**: Payload types are strictly defined per message type
 *
 * ## Message Flow Example
 *
 * ```
 * Client                    Server (Durable Object)
 *   |                              |
 *   |--- WebSocket Upgrade ------->|
 *   |<---- 101 Switching ---------|
 *   |                              |
 *   |<---- job_started ------------|  { type: "job_started", totalCount: 50 }
 *   |<---- job_progress -----------|  { type: "job_progress", progress: 0.2 }
 *   |<---- job_progress -----------|  { type: "job_progress", progress: 0.4 }
 *   |<---- job_complete -----------|  { type: "job_complete", enrichedBooks: [...] }
 *   |                              |
 *   |<---- Close (1000) -----------|
 * ```
 *
 * ## Migration Note
 *
 * The legacy v1 RPC methods have been removed:
 * - ❌ `updateProgress(progress, status, keepAlive)` - Use `updateProgress(pipeline, payload)` instead
 * - ❌ `complete(data)` - Use `complete(pipeline, payload)` instead
 * - ❌ `fail(errorData)` - Send error via `error` message type instead
 *
 * All methods now require `pipeline` parameter and follow the unified schema.
 *
 * @module types/websocket-messages
 */

import type { SingleEnrichmentResult } from '../services/enrichment.ts';

// =============================================================================
// Core Types & Enums
// =============================================================================

/**
 * Message type discriminator
 */
export type MessageType =
  | "job_started"
  | "job_progress"
  | "job_complete"
  | "error"
  | "ping"
  | "pong";

/**
 * Pipeline identifier for job source tracking
 */
export type PipelineType =
  | "batch_enrichment"
  | "csv_import"
  | "ai_scan";

// =============================================================================
// Base Message Envelope
// =============================================================================

/**
 * All WebSocket messages follow this structure
 */
export interface WebSocketMessage {
  type: MessageType;
  jobId: string;           // Client correlation ID
  pipeline: PipelineType;  // Source identification
  timestamp: number;       // Server time (ms since epoch)
  version: string;         // Schema version (e.g., "1.0.0")
  payload: MessagePayload; // Type-specific data
}

/**
 * Payload is a discriminated union based on message type
 */
export type MessagePayload =
  | JobStartedPayload
  | JobProgressPayload
  | JobCompletePayload
  | ErrorPayload
  | PingPayload
  | PongPayload;

// =============================================================================
// Job Started Payload
// =============================================================================

export interface JobStartedPayload {
  type: "job_started";
  totalCount?: number;      // Optional: Total items to process
  estimatedDuration?: number; // Optional: Estimated seconds
}

// =============================================================================
// Job Progress Payload
// =============================================================================

export interface JobProgressPayload {
  type: "job_progress";
  progress: number;         // 0.0 - 1.0
  status: string;           // Human-readable status message
  processedCount?: number;  // Optional: Items processed so far
  currentItem?: string;     // Optional: Current item being processed
  keepAlive?: boolean;      // Optional: True for keep-alive pings
}

// =============================================================================
// Job Complete Payload (Pipeline-Specific) - Summary-Only Format
// =============================================================================

/**
 * Job completion summary (mobile-optimized)
 *
 * **Design:** Sends lightweight summary (< 1 KB) instead of full result arrays.
 * Full results are stored in KV with 1-hour TTL and retrieved via HTTP pagination.
 *
 * **Why:** Large JSON payloads (5-10 MB) cause UI stutters and battery drain on mobile.
 * Cloudflare limit is 32 MiB/message, but parsing huge payloads freezes mobile UIs.
 */
export interface JobCompletionSummary {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  duration: number;          // Milliseconds
  resourceId?: string;       // Optional: KV key for full results (e.g., "job-results:uuid")
}

export type JobCompletePayload =
  | BatchEnrichmentCompletePayload
  | CSVImportCompletePayload
  | AIScanCompletePayload;

/**
 * Single book enrichment result from backend
 * Matches the structure returned by batch-enrichment.js
 */
export interface EnrichedBookPayload {
  title: string;
  author?: string;
  isbn?: string;
  success: boolean;
  error?: string;
  enriched?: SingleEnrichmentResult | null;
}

/**
 * Batch Enrichment Completion (Summary-Only)
 *
 * **Old format (removed):** `enrichedBooks: EnrichedBookPayload[]` (could be 5-10 MB)
 * **New format:** Lightweight summary with resourceId for HTTP retrieval
 */
export interface BatchEnrichmentCompletePayload {
  type: "job_complete";
  pipeline: "batch_enrichment";
  summary: JobCompletionSummary;
}

/**
 * CSV Import Completion (Summary-Only)
 *
 * **Old format (removed):** `books: ParsedBook[]`, `errors: ImportError[]` (multi-MB for large CSVs)
 * **New format:** Lightweight summary with resourceId for HTTP retrieval
 */
export interface CSVImportCompletePayload {
  type: "job_complete";
  pipeline: "csv_import";
  summary: JobCompletionSummary;
}

export interface ParsedBook {
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  publisher?: string;
  publicationYear?: number;
  enrichmentError?: string;
}

export interface ImportError {
  title: string;
  error: string;
}

/**
 * AI Scan Completion (Summary-Only)
 *
 * **Old format (removed):** `books: DetectedBook[]` (5-10 MB for bookshelf with 200+ books)
 * **New format:** Lightweight summary with resourceId for HTTP retrieval
 *
 * **Mobile Impact:** Bookshelf scans with 200+ books previously caused UI freezes (10+ seconds)
 */
export interface AIScanCompletePayload {
  type: "job_complete";
  pipeline: "ai_scan";
  summary: JobCompletionSummary & {
    totalDetected?: number;  // Optional: AI-specific stat
    approved?: number;       // Optional: Books auto-approved
    needsReview?: number;    // Optional: Books requiring manual review
  };
}

export interface DetectedBook {
  title?: string;
  author?: string;
  isbn?: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  enrichmentStatus?: string;
  coverUrl?: string;
  publisher?: string;
  publicationYear?: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// =============================================================================
// Error Payload
// =============================================================================

export interface ErrorPayload {
  type: "error";
  code: string;             // Machine-readable error code
  message: string;          // Human-readable error message
  details?: any;            // Optional: Additional error context
  retryable?: boolean;      // Optional: Can client retry?
}

// =============================================================================
// Ping/Pong Payloads
// =============================================================================

export interface PingPayload {
  type: "ping";
  timestamp: number;
}

export interface PongPayload {
  type: "pong";
  timestamp: number;
  latency?: number;         // Optional: Server-measured round-trip time
}

// =============================================================================
// WebSocket Message Factory
// =============================================================================

/**
 * Factory for creating type-safe WebSocket messages
 */
export class WebSocketMessageFactory {
  private static readonly VERSION = "1.0.0";

  /**
   * Create a job_started message
   */
  static createJobStarted(
    jobId: string,
    pipeline: PipelineType,
    payload: Omit<JobStartedPayload, "type">
  ): WebSocketMessage {
    return {
      type: "job_started",
      jobId,
      pipeline,
      timestamp: Date.now(),
      version: this.VERSION,
      payload: {
        type: "job_started",
        ...payload
      }
    };
  }

  /**
   * Create a job_progress message
   */
  static createJobProgress(
    jobId: string,
    pipeline: PipelineType,
    payload: Omit<JobProgressPayload, "type">
  ): WebSocketMessage {
    return {
      type: "job_progress",
      jobId,
      pipeline,
      timestamp: Date.now(),
      version: this.VERSION,
      payload: {
        type: "job_progress",
        ...payload
      }
    };
  }

  /**
   * Create a job_complete message
   */
  static createJobComplete(
    jobId: string,
    pipeline: PipelineType,
    payload: Omit<JobCompletePayload, "type">
  ): WebSocketMessage {
    return {
      type: "job_complete",
      jobId,
      pipeline,
      timestamp: Date.now(),
      version: this.VERSION,
      payload: {
        type: "job_complete",
        ...payload
      }
    };
  }

  /**
   * Create an error message
   */
  static createError(
    jobId: string,
    pipeline: PipelineType,
    payload: Omit<ErrorPayload, "type">
  ): WebSocketMessage {
    return {
      type: "error",
      jobId,
      pipeline,
      timestamp: Date.now(),
      version: this.VERSION,
      payload: {
        type: "error",
        ...payload
      }
    };
  }

  /**
   * Create a ping message
   */
  static createPing(
    jobId: string,
    pipeline: PipelineType
  ): WebSocketMessage {
    const timestamp = Date.now();
    return {
      type: "ping",
      jobId,
      pipeline,
      timestamp,
      version: this.VERSION,
      payload: {
        type: "ping",
        timestamp
      }
    };
  }

  /**
   * Create a pong message
   */
  static createPong(
    jobId: string,
    pipeline: PipelineType,
    pingTimestamp: number
  ): WebSocketMessage {
    const timestamp = Date.now();
    return {
      type: "pong",
      jobId,
      pipeline,
      timestamp,
      version: this.VERSION,
      payload: {
        type: "pong",
        timestamp,
        latency: timestamp - pingTimestamp
      }
    };
  }
}
