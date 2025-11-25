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
 * Manages job state persistence and coordination.
 */
export interface IJobStateManagerDO {
  /**
   * Initialize a new job
   * @param jobId - Unique job identifier
   * @param metadata - Initial job metadata
   */
  initializeJob(jobId: string, metadata: Record<string, unknown>): Promise<void>

  /**
   * Update job progress
   * @param progress - Progress percentage (0-100)
   * @param status - Current status string
   */
  updateProgress(progress: number, status: string): Promise<void>

  /**
   * Get current job state
   */
  getState(): Promise<Record<string, unknown> | null>

  /**
   * Mark job as complete
   * @param result - Final result data
   */
  complete(result: Record<string, unknown>): Promise<void>

  /**
   * Mark job as failed
   * @param error - Error message or details
   */
  fail(error: string | Error): Promise<void>
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
