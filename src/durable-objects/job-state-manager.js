import { DurableObject } from "cloudflare:workers";

/**
 * Job State Manager Durable Object
 *
 * Responsibility: Job state persistence and queries ONLY
 * - Stores job progress/status in durable storage
 * - Provides state query methods
 * - Coordinates with WebSocketConnectionDO for broadcasts
 *
 * This DO is part of the refactored architecture that separates concerns:
 * - WebSocketConnectionDO: Connection management
 * - JobStateManagerDO: State persistence (this file)
 * - Services: Business logic (csv-processor, batch-enrichment)
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

// Pipeline-specific throttling configuration
const THROTTLE_CONFIG = {
  batch_enrichment: { updateCount: 5, timeSeconds: 10 },
  csv_import: { updateCount: 20, timeSeconds: 30 },
  ai_scan: { updateCount: 1, timeSeconds: 60 },
};

export class JobStateManagerDO extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.storage = state.storage;
    this.updatesSinceLastPersist = 0;
    this.lastPersistTime = 0;
    this.currentPipeline = null;
  }

  /**
   * RPC Method: Initialize job state with pipeline configuration
   *
   * @param {string} jobId - Job identifier
   * @param {string} pipeline - Pipeline type (batch_enrichment, csv_import, ai_scan)
   * @param {number} totalCount - Total items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initializeJobState(jobId, pipeline, totalCount) {
    console.log(
      `[JobStateManager] Initializing job ${jobId} for pipeline ${pipeline}`,
    );

    this.currentPipeline = pipeline;

    const jobState = {
      jobId,
      pipeline,
      totalCount,
      processedCount: 0,
      progress: 0,
      status: "initialized",
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      canceled: false,
    };

    await this.storage.put("jobState", jobState);
    console.log(`[JobStateManager] Job ${jobId} initialized`);

    return { success: true };
  }

  /**
   * RPC Method: Update job progress
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Progress update payload
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    const jobState = await this.storage.get("jobState");

    if (!jobState) {
      console.warn("[JobStateManager] No job state found for progress update");
      return { success: false };
    }

    // Update state
    const updatedState = {
      ...jobState,
      progress: payload.progress ?? jobState.progress,
      status: payload.status ?? jobState.status,
      processedCount: payload.processedCount ?? jobState.processedCount,
      lastUpdateTime: Date.now(),
    };

    // Throttle storage writes to reduce costs
    const throttleConfig = THROTTLE_CONFIG[pipeline] || {
      updateCount: 10,
      timeSeconds: 20,
    };
    this.updatesSinceLastPersist++;
    const timeSinceLastPersist = (Date.now() - this.lastPersistTime) / 1000;

    const shouldPersist =
      this.updatesSinceLastPersist >= throttleConfig.updateCount ||
      timeSinceLastPersist >= throttleConfig.timeSeconds;

    if (shouldPersist) {
      await this.storage.put("jobState", updatedState);
      this.updatesSinceLastPersist = 0;
      this.lastPersistTime = Date.now();
      console.log(
        `[JobStateManager] State persisted for job ${jobState.jobId}`,
      );
    }

    // Get WebSocket DO and notify
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

    await wsDoStub.send({
      type: "progress",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload,
    });

    return { success: true };
  }

  /**
   * RPC Method: Complete job
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Completion payload
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    const jobState = await this.storage.get("jobState");

    if (!jobState) {
      console.warn("[JobStateManager] No job state found for completion");
      return { success: false };
    }

    const completedState = {
      ...jobState,
      status: "completed",
      progress: 1.0,
      completedTime: Date.now(),
      result: payload,
    };

    await this.storage.put("jobState", completedState);
    console.log(`[JobStateManager] Job ${jobState.jobId} completed`);

    // Notify WebSocket
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

    await wsDoStub.send({
      type: "complete",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload,
    });

    // Schedule cleanup after 24 hours
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);

    // Close WebSocket connection after brief delay to ensure message delivery
    // Fix: Properly await async operation in setTimeout to catch errors
    // Using `void` to explicitly mark this as a fire-and-forget operation
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection("Job completed");
          resolve();
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err,
          );
          resolve(); // Resolve anyway to prevent hanging
        }
      }, 1000);
    });

    return { success: true };
  }

  /**
   * RPC Method: Fail job with error
   *
   * @param {string} pipeline - Pipeline type
   * @param {Object} payload - Error payload
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    const jobState = await this.storage.get("jobState");

    if (!jobState) {
      console.warn("[JobStateManager] No job state found for error");
      return { success: false };
    }

    const failedState = {
      ...jobState,
      status: "failed",
      failedTime: Date.now(),
      error: payload,
    };

    await this.storage.put("jobState", failedState);
    console.log(`[JobStateManager] Job ${jobState.jobId} failed`);

    // Notify WebSocket
    const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobState.jobId);
    const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

    await wsDoStub.send({
      type: "error",
      jobId: jobState.jobId,
      pipeline,
      timestamp: Date.now(),
      version: "2.0.0",
      payload,
    });

    // Schedule cleanup after 24 hours
    await this.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);

    // Close WebSocket connection after brief delay to ensure message delivery
    // Fix: Properly await async operation in setTimeout to catch errors
    // Using `void` to explicitly mark this as a fire-and-forget operation
    void new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await wsDoStub.closeConnection("Job failed");
          resolve();
        } catch (err) {
          console.error(
            `[JobStateManager] Failed to close connection for job ${jobState.jobId}:`,
            err,
          );
          resolve(); // Resolve anyway to prevent hanging
        }
      }, 1000);
    });

    return { success: true };
  }

  /**
   * RPC Method: Get current job state
   *
   * @returns {Promise<Object|null>} Current job state or null
   */
  async getJobState() {
    return await this.storage.get("jobState");
  }

  /**
   * RPC Method: Cancel job
   *
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelJob(reason = "Job canceled by user") {
    const jobState = await this.storage.get("jobState");

    if (!jobState) {
      console.warn("[JobStateManager] No job state found for cancellation");
      return { success: false };
    }

    const canceledState = {
      ...jobState,
      canceled: true,
      cancelReason: reason,
      canceledTime: Date.now(),
    };

    await this.storage.put("jobState", canceledState);
    console.log(`[JobStateManager] Job ${jobState.jobId} canceled: ${reason}`);

    return { success: true };
  }

  /**
   * RPC Method: Check if job is canceled
   *
   * @returns {Promise<boolean>}
   */
  async isCanceled() {
    const jobState = await this.storage.get("jobState");
    return jobState?.canceled || false;
  }

  /**
   * RPC Method: Schedule CSV processing via alarm
   *
   * @param {string} csvText - Raw CSV content
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleCSVProcessing(csvText, jobId) {
    await this.storage.put("csvText", csvText);
    await this.storage.put("processingType", "csv_import");
    await this.storage.setAlarm(Date.now()); // Trigger immediately
    console.log(`[JobStateManager] Scheduled CSV processing for job ${jobId}`);
    return { success: true };
  }

  /**
   * RPC Method: Schedule bookshelf scan processing via alarm
   *
   * Avoids Worker CPU time limits for long-running Gemini AI calls (20-60s)
   * Similar to CSV import, this delegates work to Durable Object alarm context
   *
   * @param {ArrayBuffer} imageData - Raw image data
   * @param {string} jobId - Job identifier
   * @param {Object} requestHeaders - Headers from original request (X-AI-Provider, etc.)
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
    // Store image data as ArrayBuffer
    await this.storage.put("imageData", imageData);
    await this.storage.put("requestHeaders", requestHeaders || {});
    await this.storage.put("processingType", "bookshelf_scan");
    await this.storage.setAlarm(Date.now()); // Trigger immediately
    console.log(`[JobStateManager] Scheduled bookshelf scan for job ${jobId}`);
    return { success: true };
  }

  /**
   * Alarm handler: Process CSV, bookshelf scan, or cleanup old job state
   *
   * Handles three scenarios:
   * 1. CSV processing (triggered immediately after scheduling)
   * 2. Bookshelf scan processing (triggered immediately after scheduling)
   * 3. Cleanup after 24 hours (triggered after job completion/failure)
   */
  async alarm() {
    const processingType = await this.storage.get("processingType");

    if (processingType === "csv_import") {
      // CSV processing path
      console.log("[JobStateManager] Alarm triggered for CSV processing");

      const csvText = await this.storage.get("csvText");
      const jobState = await this.storage.get("jobState");

      if (!csvText || !jobState) {
        console.error(
          "[JobStateManager] Missing CSV text or job state in alarm handler",
        );
        return;
      }

      // Import CSV processor and progress reporter (in DO context to avoid handler timeout)
      const { processCSVImport } = await import("../services/csv-processor.js");
      const { ProgressReporter } = await import(
        "../utils/progress-reporter.js"
      );

      const reporter = new ProgressReporter(jobState.jobId, this.env);

      try {
        await processCSVImport(csvText, reporter, this.env);
      } catch (error) {
        console.error(
          "[JobStateManager] CSV processing failed in alarm:",
          error,
        );

        // CRITICAL: Update job state to 'failed' so client is notified
        // Without this, the job would be stuck and user left hanging
        await reporter.sendError("csv_import", {
          code: "E_ALARM_PROCESSING_FAILED",
          message: error.message || "CSV processing failed",
          retryable: true,
          details: {
            fallbackAvailable: true,
            suggestion:
              "Try manual CSV import or contact support if issue persists",
          },
        });
      }

      // Clean up temporary storage
      await this.storage.delete("csvText");
      await this.storage.delete("processingType");

    } else if (processingType === "bookshelf_scan") {
      // Bookshelf scan processing path
      console.log("[JobStateManager] Alarm triggered for bookshelf scan processing");

      const imageData = await this.storage.get("imageData");
      const requestHeaders = await this.storage.get("requestHeaders");
      const jobState = await this.storage.get("jobState");

      if (!imageData || !jobState) {
        console.error(
          "[JobStateManager] Missing image data or job state in alarm handler",
        );
        return;
      }

      // Import AI scanner service (in DO context to avoid Worker CPU timeout)
      const { processBookshelfScan } = await import("../services/ai-scanner.js");
      const { ProgressReporter } = await import("../utils/progress-reporter.js");

      const reporter = new ProgressReporter(jobState.jobId, this.env);

      try {
        // Create a mock request object with headers (for X-AI-Provider support)
        const mockRequest = {
          headers: {
            get: (key) => requestHeaders[key] || null
          }
        };

        // Call the AI scanner with reporter instead of doStub
        // We pass null for ctx since we're in alarm context (no ctx.waitUntil needed)
        await processBookshelfScan(
          jobState.jobId,
          imageData,
          mockRequest,
          this.env,
          reporter, // Use reporter instead of doStub
          null      // No execution context in alarm
        );
      } catch (error) {
        console.error(
          "[JobStateManager] Bookshelf scan processing failed in alarm:",
          error,
        );

        await reporter.sendError("ai_scan", {
          code: "E_ALARM_PROCESSING_FAILED",
          message: error.message || "Bookshelf scan processing failed",
          retryable: true,
          details: {
            fallbackAvailable: false,
            suggestion: "Try uploading a clearer photo or contact support if issue persists",
          },
        });
      }

      // Clean up temporary storage
      await this.storage.delete("imageData");
      await this.storage.delete("requestHeaders");
      await this.storage.delete("processingType");

    } else {
      // Cleanup path (24 hour cleanup after job completion/failure)
      console.log(
        "[JobStateManager] Cleanup alarm triggered - removing old state",
      );

      const jobState = await this.storage.get("jobState");

      // Also cleanup WebSocket DO storage
      if (jobState?.jobId) {
        try {
          const wsDoId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(
            jobState.jobId,
          );
          const wsDoStub = this.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
          await wsDoStub.cleanupStorage();
        } catch (error) {
          console.warn(
            "[JobStateManager] Failed to cleanup WebSocket DO storage:",
            error,
          );
        }
      }

      await this.storage.delete("jobState");
    }
  }
}
