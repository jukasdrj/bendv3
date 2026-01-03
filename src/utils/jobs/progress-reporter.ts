/**
 * Progress Reporter Adapter
 *
 * Provides a unified interface to the new refactored Durable Object architecture
 * while maintaining backward compatibility with existing code.
 *
 * This adapter coordinates between:
 * - WebSocketConnectionDO: Connection management
 * - JobStateManagerDO: State persistence
 *
 * Usage:
 *   const reporter = new ProgressReporter(jobId, env);
 *   await reporter.initialize('csv_import', 0);
 *   await reporter.updateProgress('csv_import', { progress: 0.5, status: 'Processing...' });
 *   await reporter.complete('csv_import', { books: [...] });
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

import type { Env } from '../types/env'

/**
 * WebSocket connection ready result
 */
export interface ReadyResult {
  timedOut: boolean
  disconnected: boolean
}

/**
 * Operation success response
 */
export interface SuccessResponse {
  success: boolean
}

/**
 * Progress update payload
 */
export interface ProgressPayload {
  progress?: number
  status?: string
  processedCount?: number
  [key: string]: unknown
}

/**
 * Completion payload
 */
export interface CompletionPayload {
  summary?: {
    totalProcessed: number
    successCount: number
    failureCount: number
    duration: number
    resourceId: string
  }
  booksCount?: number
  resultsUrl?: string
  successRate?: string
  [key: string]: unknown
}

/**
 * Error payload
 */
export interface ErrorPayload {
  code: string
  message: string
  retryable?: boolean
  details?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Job state object
 */
export interface JobState {
  jobId: string
  pipeline: string
  status: string
  progress: number
  totalCount: number
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

/**
 * WebSocket Connection DO stub interface
 */
interface WebSocketConnectionStub {
  setAuthToken(token: string): Promise<SuccessResponse>
  waitForReady(timeoutMs: number): Promise<ReadyResult>
  closeConnection(reason: string): Promise<SuccessResponse>
}

/**
 * Job State Manager DO stub interface
 */
interface JobStateManagerStub {
  initializeJobState(jobId: string, pipeline: string, totalCount: number): Promise<SuccessResponse>
  updateProgress(pipeline: string, payload: ProgressPayload): Promise<SuccessResponse>
  complete(pipeline: string, payload: CompletionPayload): Promise<SuccessResponse>
  sendError(pipeline: string, payload: ErrorPayload): Promise<SuccessResponse>
  cancelJob(reason: string): Promise<SuccessResponse>
  isCanceled(): Promise<boolean>
  getJobState(): Promise<JobState | null>
}

/**
 * Progress Reporter for coordinating WebSocket connections and job state
 */
export class ProgressReporter {
  private readonly jobId: string
  private readonly wsStub: WebSocketConnectionStub
  private readonly stateStub: JobStateManagerStub

  /**
   * Create a new progress reporter
   *
   * @param jobId - Job identifier
   * @param env - Worker environment bindings
   */
  constructor(jobId: string, env: Env) {
    this.jobId = jobId

    // Get Durable Object stubs
    const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
    this.wsStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId) as unknown as WebSocketConnectionStub

    const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
    this.stateStub = env.JOB_STATE_MANAGER_DO.get(stateDoId) as unknown as JobStateManagerStub
  }

  /**
   * Set authentication token for WebSocket connection
   *
   * @param token - Authentication token
   * @returns Success response
   */
  async setAuthToken(token: string): Promise<SuccessResponse> {
    return await this.wsStub.setAuthToken(token)
  }

  /**
   * Initialize job state
   *
   * @param pipeline - Pipeline type
   * @param totalCount - Total items to process
   * @returns Success response
   */
  async initialize(pipeline: string, totalCount: number): Promise<SuccessResponse> {
    return await this.stateStub.initializeJobState(this.jobId, pipeline, totalCount)
  }

  /**
   * Wait for client ready signal
   *
   * @param timeoutMs - Timeout in milliseconds (default: 5000)
   * @returns Ready result indicating timeout or disconnect status
   */
  async waitForReady(timeoutMs = 5000): Promise<ReadyResult> {
    return await this.wsStub.waitForReady(timeoutMs)
  }

  /**
   * Update job progress
   *
   * @param pipeline - Pipeline type
   * @param payload - Progress payload
   * @returns Success response
   */
  async updateProgress(pipeline: string, payload: ProgressPayload): Promise<SuccessResponse> {
    return await this.stateStub.updateProgress(pipeline, payload)
  }

  /**
   * Complete job
   *
   * @param pipeline - Pipeline type
   * @param payload - Completion payload
   * @returns Success response
   */
  async complete(pipeline: string, payload: CompletionPayload): Promise<SuccessResponse> {
    return await this.stateStub.complete(pipeline, payload)
  }

  /**
   * Send error
   *
   * @param pipeline - Pipeline type
   * @param payload - Error payload
   * @returns Success response
   */
  async sendError(pipeline: string, payload: ErrorPayload): Promise<SuccessResponse> {
    return await this.stateStub.sendError(pipeline, payload)
  }

  /**
   * Cancel job
   *
   * @param reason - Cancellation reason
   * @returns Success response
   */
  async cancelJob(reason: string): Promise<SuccessResponse> {
    return await this.stateStub.cancelJob(reason)
  }

  /**
   * Check if job is canceled
   *
   * @returns True if job is canceled
   */
  async isCanceled(): Promise<boolean> {
    return await this.stateStub.isCanceled()
  }

  /**
   * Get job state
   *
   * @returns Job state or null if not found
   */
  async getJobState(): Promise<JobState | null> {
    return await this.stateStub.getJobState()
  }

  /**
   * Close WebSocket connection
   *
   * @param reason - Reason for closing
   * @returns Success response
   */
  async closeConnection(reason: string): Promise<SuccessResponse> {
    return await this.wsStub.closeConnection(reason)
  }
}
