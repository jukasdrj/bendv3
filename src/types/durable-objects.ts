/**
 * Durable Object Stub Interfaces
 *
 * Type-safe interfaces for Durable Object stubs used across the codebase.
 * These replace unsafe `as unknown as {...}` casting patterns.
 *
 * @see https://developers.cloudflare.com/durable-objects/
 */

import type { WorkflowWebSocketMessage } from './workflow-events.js'

/**
 * WebSocket Connection Durable Object stub interface
 *
 * Used for real-time progress updates during workflow execution.
 */
export interface IWebSocketConnectionDO {
  /**
   * Set authentication token for WebSocket connections
   * @param token - JWT or UUID token for authentication
   * @returns Success status
   */
  setAuthToken(token: string): Promise<{ success: boolean }>

  /**
   * Send a message to connected WebSocket clients
   * @param msg - Message payload (typically WorkflowWebSocketMessage)
   * @returns Success status
   */
  send(msg: WorkflowWebSocketMessage | Record<string, unknown>): Promise<{ success: boolean }>

  /**
   * Refresh an existing authentication token
   * @param oldToken - The current token to refresh
   * @returns New token and expiration, or error
   */
  refreshAuthToken(oldToken: string): Promise<{
    token?: string
    expiresIn?: number
    error?: string
  }>

  /**
   * Get current job state and authentication details
   * @returns Job state with auth info, or null if not found
   */
  getJobStateAndAuth(): Promise<{
    jobState: Record<string, unknown>
    authToken: string
    authTokenExpiration: number
  } | null>

  /**
   * Get current job state
   * @returns Job state object or null
   */
  getJobState(): Promise<Record<string, unknown> | null>

  /**
   * Cancel a running batch operation
   * @returns Cancellation result
   */
  cancelBatch(): Promise<{ success: boolean; message?: string }>

  /**
   * Fetch handler for WebSocket upgrade requests
   * @param request - Incoming HTTP request
   * @returns Response (WebSocket upgrade or error)
   */
  fetch(request: Request): Promise<Response>
}

/**
 * Job State Manager Durable Object stub interface
 *
 * Manages job state persistence and coordination for CSV imports, scans, and batch enrichment.
 * CRITICAL: Keep this interface in sync with src/durable-objects/job-state-manager.ts
 */
export interface IJobStateManagerDO {
  /**
   * Initialize job state (V3 API method)
   * @param jobId - Unique job identifier
   * @param pipeline - Pipeline type (csv_import, bookshelf_scan, batch_enrichment)
   * @param totalCount - Total items to process (0 if unknown)
   */
  initializeJobState(
    jobId: string,
    pipeline: 'csv_import' | 'bookshelf_scan' | 'batch_enrichment',
    totalCount: number,
  ): Promise<{ success: boolean }>

  /**
   * Get current job state
   */
  getJobState(): Promise<{
    jobId: string
    type: string
    status: string
    progress: number
    processedCount: number
    totalCount: number
    startTime: string
    completedTime?: string
    error?: { code: string; message: string }
  } | null>

  /**
   * Send error to job (marks as failed)
   * @param pipeline - Pipeline type
   * @param payload - Error details
   */
  sendError(
    pipeline: string,
    payload: {
      code: string
      message: string
      retryable?: boolean
      details?: Record<string, unknown>
    },
  ): Promise<{ success: boolean }>

  /**
   * Schedule CSV processing via alarm
   * @param csvText - Raw CSV content
   * @param jobId - Job identifier
   */
  scheduleCSVProcessing(csvText: string, jobId: string): Promise<{ success: boolean }>

  /**
   * Schedule bookshelf scan processing via alarm
   * @param scanImageR2Keys - R2 keys for uploaded images
   * @param jobId - Job identifier
   */
  scheduleBookshelfScanProcessing(
    scanImageR2Keys: string[],
    jobId: string,
  ): Promise<{ success: boolean }>

  /**
   * Schedule batch enrichment processing via alarm
   * @param isbns - ISBNs to enrich
   * @param options - Enrichment options
   * @param jobId - Job identifier
   */
  scheduleBatchEnrichmentProcessing(
    isbns: string[],
    options: { includeEmbedding: boolean },
    jobId: string,
  ): Promise<{ success: boolean }>
}

/**
 * Cache Metrics Durable Object stub interface
 *
 * Tracks cache hit/miss statistics.
 */
export interface ICacheMetricsDO {
  /**
   * Record a cache event
   * @param event - Cache event details
   */
  recordEvent(event: {
    type: 'hit' | 'miss' | 'write'
    prefix: string
    key: string
    timestamp: number
  }): Promise<void>

  /**
   * Get current cache statistics
   */
  getStats(): Promise<{
    hits: number
    misses: number
    writes: number
    hitRate: number
    byPrefix: Record<string, { hits: number; misses: number }>
  }>
}
