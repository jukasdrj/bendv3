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
export class ProgressReporter {
  /**
   * Create a new progress reporter
   * 
   * @param {string} jobId - Job identifier
   * @param {Object} env - Worker environment bindings
   */
  constructor(jobId, env) {
    this.jobId = jobId;
    this.env = env;
    
    // Get Durable Object stubs
    const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
    this.wsStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
    
    const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
    this.stateStub = env.JOB_STATE_MANAGER_DO.get(stateDoId);
  }

  /**
   * Set authentication token for WebSocket connection
   * 
   * @param {string} token - Authentication token
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    return await this.wsStub.setAuthToken(token);
  }

  /**
   * Initialize job state
   * 
   * @param {string} pipeline - Pipeline type
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initialize(pipeline, totalCount) {
    return await this.stateStub.initializeJobState(this.jobId, pipeline, totalCount);
  }

  /**
   * Wait for client ready signal
   * 
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{timedOut: boolean, disconnected: boolean}>}
   */
  async waitForReady(timeoutMs = 5000) {
    return await this.wsStub.waitForReady(timeoutMs);
  }

  /**
   * Update job progress
   * 
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress payload
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    return await this.stateStub.updateProgress(pipeline, payload);
  }

  /**
   * Complete job
   * 
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    return await this.stateStub.complete(pipeline, payload);
  }

  /**
   * Send error
   * 
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    return await this.stateStub.sendError(pipeline, payload);
  }

  /**
   * Cancel job
   * 
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelJob(reason) {
    return await this.stateStub.cancelJob(reason);
  }

  /**
   * Check if job is canceled
   * 
   * @returns {Promise<boolean>}
   */
  async isCanceled() {
    return await this.stateStub.isCanceled();
  }

  /**
   * Get job state
   * 
   * @returns {Promise<Object|null>}
   */
  async getJobState() {
    return await this.stateStub.getJobState();
  }

  /**
   * Close WebSocket connection
   * 
   * @param {string} reason - Reason for closing
   * @returns {Promise<{success: boolean}>}
   */
  async closeConnection(reason) {
    return await this.wsStub.closeConnection(reason);
  }
}
