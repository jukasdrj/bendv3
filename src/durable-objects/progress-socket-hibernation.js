import { DurableObject } from "cloudflare:workers";
import { WebSocketCloseCodes } from "../types/websocket-messages.js";
import { processCSVImportCore } from "../handlers/csv-import.ts";
import { processBookshelfScan } from "../services/ai-scanner.js";
import {
  validatePayloadSize,
  uploadPayloadToR2,
  fetchPayloadFromR2,
  deletePayloadFromR2,
} from "../utils/r2-hibernation.js";

/**
 * ProgressWebSocketDO with Cloudflare WebSocket Hibernation API
 *
 * KEY DIFFERENCES from traditional pattern:
 * - Uses state.acceptWebSocket() instead of webSocket.accept()
 * - Implements DO lifecycle methods instead of event listeners
 * - DO goes to sleep between messages (70-80% cost reduction)
 * - State stored in DO storage, not in-memory
 *
 * Migration Strategy:
 * - Feature flag ENABLE_HIBERNATION_WEBSOCKET controls which implementation is used
 * - Parallel deployment allows instant rollback if issues arise
 * - Gradual rollout: 1% → 10% → 50% → 100%
 *
 * Related Issues:
 * - #221: Review WebSocket implementation against CF best practices
 * - #170: Add max concurrent WebSocket connections limit
 *
 * @see https://developers.cloudflare.com/durable-objects/api/websockets/#websocket-hibernation
 */

// Constants
const MAX_CONNECTIONS = 5; // Issue #170: Prevent resource exhaustion (5 per jobId/DO instance)
const BLACKLIST_TTL_SECONDS = 2.5 * 60 * 60; // 2.5 hours (token validity window)
const BUFFER_THRESHOLD = 1024 * 1024; // 1MB backpressure threshold
const MAX_INCOMING_SIZE = 10 * 1024; // 10KB max incoming message size

// Storage keys for hibernation-safe state
// CRITICAL: All state must be in storage, not in-memory
const STORAGE_KEYS = {
  CONNECTION_COUNT: "connectionCount",
  AUTH_TOKEN: "authToken",
  AUTH_TOKEN_EXPIRATION: "authTokenExpiration",
  JOB_ID: "jobId",
  JOB_TYPE: "jobType",
  IS_READY: "isReady",
  CURRENT_PIPELINE: "currentPipeline",
  JOB_STATE: "jobState",
  THROTTLE_STATE: "throttleState",
  LAST_DISCONNECT: "lastDisconnect",
  LAST_DISCONNECT_CODE: "lastDisconnectCode",
  LAST_DISCONNECT_REASON: "lastDisconnectReason",
  BATCH_STATE: "batchState",
  CSV_DATA: "csvData",
  IMAGE_DATA: "imageData",
  REQUEST_HEADERS: "requestHeaders",
};

export class ProgressWebSocketDO_Hibernation extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state; // Required for accessing state.getWebSockets() and state.storage in hibernation API
    this.env = env;
    // ✅ HIBERNATION FIX: No direct storage assignment - use this.state.storage instead
    // NO in-memory state - everything in storage for persistence across hibernation cycles
  }

  /**
   * WebSocket message handler - called on each incoming message
   * DO automatically wakes up, processes message, then goes back to sleep
   *
   * @param {WebSocket} ws - The WebSocket connection
   * @param {string|ArrayBuffer} message - Incoming message
   */
  async webSocketMessage(ws, message) {
    try {
      // SECURITY: Validate incoming message size (Cloudflare best practices)
      const messageSize = new Blob([message]).size;
      if (messageSize > MAX_INCOMING_SIZE) {
        const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
        console.warn(
          `[Hibernation DO ${jobId}] Incoming message too large: ${messageSize} bytes (max ${MAX_INCOMING_SIZE} bytes)`,
        );
        ws.close(WebSocketCloseCodes.POLICY_VIOLATION, "Message too large");
        return;
      }

      // Load state from storage (hydration)
      const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
      const authToken = await this.state.storage.get(STORAGE_KEYS.AUTH_TOKEN);
      const isReady = await this.state.storage.get(STORAGE_KEYS.IS_READY);

      // Parse message
      const data = typeof message === "string" ? JSON.parse(message) : null;
      if (!data || !data.type) {
        console.warn("[ProgressWebSocketDO_Hibernation] Invalid message format");
        return;
      }

      console.log(
        `[ProgressWebSocketDO_Hibernation] Message received: ${data.type} for job ${jobId}`,
      );

      // Handle message types
      switch (data.type) {
        case "ready":
          await this.handleReadyMessage(ws, data);
          break;

        case "cancel":
          await this.handleCancelMessage(ws, data);
          break;

        default:
          console.warn(
            `[ProgressWebSocketDO_Hibernation] Unknown message type: ${data.type}`,
          );
      }

      // DO will automatically go to sleep after this method returns
    } catch (error) {
      console.error(
        "[ProgressWebSocketDO_Hibernation] Error handling message:",
        error,
      );
      // Don't close connection on parse errors - may be temporary
    }
  }

  /**
   * WebSocket close handler - called when connection closes
   *
   * @param {WebSocket} ws - The WebSocket connection
   * @param {number} code - Close code (RFC 6455)
   * @param {string} reason - Close reason
   * @param {boolean} wasClean - Whether close was clean
   */
  async webSocketClose(ws, code, reason, wasClean) {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

    console.log(
      `[ProgressWebSocketDO_Hibernation] WebSocket closed for job ${jobId}: code=${code}, reason=${reason}, clean=${wasClean}`,
    );

    // Store disconnect info for reconnection logic
    await this.state.storage.put(STORAGE_KEYS.LAST_DISCONNECT, Date.now());
    await this.state.storage.put(STORAGE_KEYS.LAST_DISCONNECT_CODE, code);
    await this.state.storage.put(STORAGE_KEYS.LAST_DISCONNECT_REASON, reason);

    // Decrement connection count atomically
    await this.state.storage.transaction(async (txn) => {
      const count = (await txn.get(STORAGE_KEYS.CONNECTION_COUNT)) || 0;
      await txn.put(STORAGE_KEYS.CONNECTION_COUNT, Math.max(0, count - 1));
    });

    // Reset ready state
    await this.state.storage.put(STORAGE_KEYS.IS_READY, false);
  }

  /**
   * WebSocket error handler - called on connection errors
   *
   * @param {WebSocket} ws - The WebSocket connection
   * @param {Error} error - The error that occurred
   */
  async webSocketError(ws, error) {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

    // Categorize error type for better diagnostics
    const errorType = this.categorizeWebSocketError(error);

    console.error(
      `[Hibernation DO ${jobId}] WebSocket error (${errorType}):`,
      error.message,
      { stack: error.stack }
    );

    // Store error with metadata for debugging
    await this.state.storage.put("lastError", {
      type: errorType,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
    });

    // Decrement connection count (connection is about to close)
    await this.state.storage.transaction(async (txn) => {
      const count = (await txn.get(STORAGE_KEYS.CONNECTION_COUNT)) || 0;
      await txn.put(STORAGE_KEYS.CONNECTION_COUNT, Math.max(0, count - 1));
    });

    // Choose appropriate close code based on error type
    const closeCode = errorType === 'CLIENT_ERROR'
      ? WebSocketCloseCodes.POLICY_VIOLATION
      : WebSocketCloseCodes.INTERNAL_ERROR;

    ws.close(closeCode, `Connection error: ${errorType}`);
  }

  /**
   * Categorize WebSocket errors for better diagnostics
   * @param {Error} error - The error to categorize
   * @returns {string} Error category
   */
  categorizeWebSocketError(error) {
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('buffer')) return 'BUFFER_OVERFLOW';
    if (msg.includes('timeout')) return 'TIMEOUT';
    if (msg.includes('auth')) return 'AUTH_FAILURE';
    if (msg.includes('limit')) return 'CLIENT_ERROR';
    return 'UNKNOWN';
  }

  /**
   * HTTP fetch handler - handles WebSocket upgrades and RPC calls
   *
   * @param {Request} request - Incoming HTTP request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade request
    if (request.headers.get("Upgrade") === "websocket") {
      return await this.handleWebSocketUpgrade(request);
    }

    // If not a WebSocket upgrade, return 400 (RPC calls are direct method calls, not HTTP)
    return new Response("Bad Request: Expected WebSocket upgrade", { status: 400 });
  }

  /**
   * Handle WebSocket upgrade with hibernation API
   * CRITICAL: Uses state.acceptWebSocket() instead of ws.accept()
   */
  async handleWebSocketUpgrade(request) {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    // Extract token from subprotocol header (SECURE) or query param (DEPRECATED)
    const wsProtocol = request.headers.get("Sec-WebSocket-Protocol");
    let providedToken = null;
    let tokenSource = null;

    if (wsProtocol) {
      // NEW METHOD: Extract token from subprotocol header (secure)
      // Format: "bookstrack-auth.{token}"
      const protocols = wsProtocol.split(",").map((p) => p.trim());
      const authProtocol = protocols.find((p) =>
        p.startsWith("bookstrack-auth."),
      );

      if (authProtocol) {
        providedToken = authProtocol.substring("bookstrack-auth.".length);
        tokenSource = "subprotocol";
        console.log(
          `[Hibernation DO ${jobId}] ✅ Token provided via secure subprotocol header`,
        );
      }
    }

    if (!providedToken) {
      // OLD METHOD (DEPRECATED): Fallback to query param for backward compatibility
      providedToken = url.searchParams.get("token");
      if (providedToken) {
        tokenSource = "query_param";
        console.warn(
          `[Hibernation DO ${jobId}] ⚠️ DEPRECATED: Token provided via URL query parameter (INSECURE). ` +
            `Client should migrate to Sec-WebSocket-Protocol header.`,
        );
      }
    }

    if (!jobId) {
      return new Response("Missing jobId parameter", { status: 400 });
    }

    // FULL AUTHENTICATION VALIDATION: Parallel storage reads
    const storageStartTime = Date.now();
    const [storedToken, expiration, oldTokenExpiration] = await Promise.all([
      this.state.storage.get(STORAGE_KEYS.AUTH_TOKEN),
      this.state.storage.get(STORAGE_KEYS.AUTH_TOKEN_EXPIRATION),
      providedToken
        ? this.state.storage.get(`oldAuthToken:${providedToken}`)
        : Promise.resolve(null),
    ]);
    const storageDuration = Date.now() - storageStartTime;

    console.log(
      `[Hibernation DO ${jobId}] 📊 Storage reads took ${storageDuration}ms (token source: ${tokenSource})`,
    );

    // Check KV blacklist (cross-instance invalidation)
    const blacklistEntry = providedToken
      ? await this.env.KV_CACHE.get(`token:blacklist:${providedToken}`, "json")
      : null;

    if (blacklistEntry) {
      console.warn(
        `[Hibernation DO ${jobId}] 🚫 WebSocket authentication failed - token blacklisted`,
        {
          reason: blacklistEntry.reason,
          invalidatedAt: new Date(blacklistEntry.invalidatedAt).toISOString(),
        },
      );
      return new Response("Token invalidated - job completed or failed", {
        status: 401,
      });
    }

    // Validate token match (current token or grace period old token)
    let authSuccess = false;
    if (storedToken && providedToken && storedToken === providedToken) {
      authSuccess = true;
    } else if (providedToken && oldTokenExpiration) {
      // Check for recently auto-refreshed token (5-minute grace period)
      authSuccess = true;
      console.log(
        `[Hibernation DO ${jobId}] ✅ Reconnection successful using recently expired token (grace period)`,
      );
    }

    if (!authSuccess) {
      console.warn(
        `[Hibernation DO ${jobId}] WebSocket authentication failed - invalid token`,
      );
      return new Response("Unauthorized", { status: 401 });
    }

    // Check token expiration (only for current token, not grace period)
    if (storedToken === providedToken && Date.now() > expiration) {
      console.warn(
        `[Hibernation DO ${jobId}] WebSocket authentication failed - token expired`,
      );
      return new Response("Token expired", { status: 401 });
    }

    console.log(
      `[Hibernation DO ${jobId}] ✅ WebSocket authentication successful`,
    );

    // Check connection limit (Issue #170)
    let connectionCount = 0;
    try {
      await this.state.storage.transaction(async (txn) => {
        const count = (await txn.get(STORAGE_KEYS.CONNECTION_COUNT)) || 0;
        connectionCount = count;

        if (count >= MAX_CONNECTIONS) {
          throw new Error(
            `Connection limit reached (${MAX_CONNECTIONS} max connections)`,
          );
        }
        await txn.put(STORAGE_KEYS.CONNECTION_COUNT, count + 1);
      });
    } catch (error) {
      // Connection limit exceeded - send proper error message via WebSocket
      console.warn(
        `[Hibernation DO ${jobId}] ⚠️ Connection limit exceeded: ${connectionCount}/${MAX_CONNECTIONS}`,
      );

      // Create temporary WebSocket to send error message
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server);

      // Send error message matching API contract
      const errorMessage = {
        type: "error",
        payload: {
          code: "CONNECTION_LIMIT_EXCEEDED",
          message: `Maximum concurrent connections (${MAX_CONNECTIONS}) exceeded`,
          retryable: true,
          details: {
            currentConnections: connectionCount,
            limit: MAX_CONNECTIONS,
          },
        },
      };

      server.send(JSON.stringify(errorMessage));

      // Close with policy violation code (1008)
      server.close(
        WebSocketCloseCodes.POLICY_VIOLATION,
        "Connection limit exceeded",
      );

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Create WebSocket pair
    const [client, server] = Object.values(new WebSocketPair());

    // CRITICAL: Use state.acceptWebSocket() for hibernation
    // This enables automatic wake/sleep cycle
    this.state.acceptWebSocket(server);

    // Store initial state + session metadata (Cloudflare best practices)
    // Note: Auth token + expiration already set via setAuthToken() RPC call before connection
    const sessionMetadata = {
      id: crypto.randomUUID(),
      jobId: jobId,
      connectedAt: new Date().toISOString(),
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
      userAgent: request.headers.get("User-Agent") || "unknown",
      country: request.headers.get("CF-IPCountry") || "unknown",
    };

    await this.state.storage.put({
      [STORAGE_KEYS.JOB_ID]: jobId,
      [STORAGE_KEYS.IS_READY]: false,
      sessionMetadata: sessionMetadata,
    });

    console.log(
      `[ProgressWebSocketDO_Hibernation] WebSocket connection established for job ${jobId} (hibernation enabled)`,
      {
        sessionId: sessionMetadata.id,
        ip: sessionMetadata.ip,
        country: sessionMetadata.country,
      },
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle "ready" message from client
   */
  async handleReadyMessage(ws, data) {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
    const pipeline = await this.state.storage.get(STORAGE_KEYS.CURRENT_PIPELINE);

    console.log(`[ProgressWebSocketDO_Hibernation] Client ready for job ${jobId}`);

    // Mark as ready
    await this.state.storage.put(STORAGE_KEYS.IS_READY, true);

    // Send ready acknowledgment (following API contract v2.4.1)
    const now = Date.now();
    ws.send(
      JSON.stringify({
        type: "ready_ack",
        jobId,
        pipeline,
        timestamp: now,
        version: "1.0.0",
        payload: {
          type: "ready_ack",
          timestamp: now,
        },
      }),
    );

    // Wake up any alarm waiting for ready signal
    const alarm = await this.state.storage.getAlarm();
    if (alarm) {
      console.log(
        "[ProgressWebSocketDO_Hibernation] Triggering alarm (client ready)",
      );
      await this.state.storage.deleteAlarm(); // Cancel alarm, will trigger immediately
    }
  }

  /**
   * Handle "cancel" message from client
   */
  async handleCancelMessage(ws, data) {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

    console.log(
      `[ProgressWebSocketDO_Hibernation] Job cancelled by client: ${jobId}`,
    );

    // Store cancellation state
    await this.state.storage.put(STORAGE_KEYS.JOB_STATE, "cancelled");

    // Close connection
    ws.close(
      WebSocketCloseCodes.NORMAL_CLOSURE,
      "Job cancelled by client request",
    );
  }

  /**
   * RPC: Set authentication token
   * Called by handlers after job initialization
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {string} token - Authentication token
   * @returns {Promise<{success: boolean}>}
   */
  async setAuthToken(token) {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token provided');
      }

      const expiration = Date.now() + 2 * 60 * 60 * 1000; // 2-hour TTL
      await this.state.storage.put({
        [STORAGE_KEYS.AUTH_TOKEN]: token,
        [STORAGE_KEYS.AUTH_TOKEN_EXPIRATION]: expiration,
      });

      console.log("[ProgressWebSocketDO_Hibernation] Auth token set with 2-hour TTL");

      return { success: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in setAuthToken: ${error.stack}`);
      throw error; // Let caller handle the error
    }
  }

  /**
   * RPC: Initialize job state
   * Called by handlers after token is set to initialize job tracking
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {string} pipeline - Pipeline identifier (csv_import, batch_enrichment, ai_scan)
   * @param {number} totalCount - Total number of items to process
   * @returns {Promise<{success: boolean}>}
   */
  async initializeJobState(pipeline, totalCount) {
    try {
      if (!pipeline || typeof pipeline !== 'string') {
        throw new Error('Invalid pipeline provided');
      }
      if (typeof totalCount !== 'number' || totalCount < 0) {
        throw new Error('Invalid totalCount provided');
      }

      const jobState = {
        pipeline,
        totalCount,
        processedCount: 0,
        status: 'running',
        startTime: Date.now(),
        version: 1,
      };

      await this.state.storage.put({
        [STORAGE_KEYS.JOB_STATE]: jobState,
        [STORAGE_KEYS.CURRENT_PIPELINE]: pipeline,
      });

      console.log(`[ProgressWebSocketDO_Hibernation] Job state initialized for pipeline: ${pipeline}`);

      return { success: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in initializeJobState: ${error.stack}`);
      throw error;
    }
  }

  /**
   * RPC: Update progress
   * Called by handlers/services to send progress updates
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {string} pipeline - Pipeline identifier
   * @param {Object} payload - Progress update payload {progress, status, processedCount, currentItem}
   * @returns {Promise<{success: boolean}>}
   */
  async updateProgress(pipeline, payload) {
    try {
      // 1. HYDRATE: Load state from storage
      const data = await this.state.storage.get([STORAGE_KEYS.JOB_ID, STORAGE_KEYS.JOB_STATE]);
      const jobId = data.get(STORAGE_KEYS.JOB_ID);
      const jobState = data.get(STORAGE_KEYS.JOB_STATE);

      // 2. VALIDATE: Check state
      if (!jobId || !jobState) {
        throw new Error('Job not initialized. Cannot update progress.');
      }

      // 3. EXECUTE: Create immutable copy to avoid mutation race conditions
      const updatedJobState = {
        ...jobState,
        processedCount: payload.processedCount ?? jobState.processedCount,
        status: payload.status ?? jobState.status,
        ...(payload.currentItem && { currentItem: payload.currentItem }),
        version: (jobState.version || 1) + 1,
        lastUpdateTime: Date.now(),
      };

      const message = {
        type: 'job_progress',
        jobId: jobId,
        pipeline: pipeline,
        timestamp: updatedJobState.lastUpdateTime,
        version: '1.0.0',
        payload: {
          type: 'job_progress',
          ...payload
        },
      };

      // Send to all connected WebSocket clients
      const webSockets = this.state.getWebSockets();
      if (webSockets.length > 0) {
        const messageStr = JSON.stringify(message);
        for (const ws of webSockets) {
          // Check backpressure before sending
          if (ws.bufferedAmount > BUFFER_THRESHOLD) {
            console.warn(
              `[Hibernation DO] High backpressure detected (${ws.bufferedAmount} bytes buffered), skipping connection`,
            );
            continue; // Skip slow client
          }
          ws.send(messageStr);
        }
      } else {
        console.warn(`[Hibernation DO] updateProgress: No active WebSocket connections for jobId ${jobId}`);
      }

      // 4. PERSIST: Save updated state (immutable copy prevents race conditions)
      await this.state.storage.put(STORAGE_KEYS.JOB_STATE, updatedJobState);

      // 5. RESPOND
      return { success: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in updateProgress: ${error.stack}`);
      throw error;
    }
  }

  /**
   * RPC: Complete job
   * Called by handlers/services when job finishes successfully
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {string} pipeline - Pipeline identifier
   * @param {Object} payload - Completion payload with summary data
   * @returns {Promise<{success: boolean}>}
   */
  async complete(pipeline, payload) {
    try {
      const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

      if (!jobId) {
        throw new Error('Job not initialized. Cannot complete job.');
      }

      const now = Date.now();
      const message = {
        type: 'job_complete',
        jobId: jobId,
        pipeline: pipeline,
        timestamp: now,
        version: '1.0.0',
        payload: {
          type: 'job_complete',
          pipeline,
          expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now in ISO format
          ...payload,
        },
      };

      const webSockets = this.state.getWebSockets();
      if (webSockets.length > 0) {
        const messageStr = JSON.stringify(message);
        for (const ws of webSockets) {
          ws.send(messageStr);
        }

        // Wait 1 second before closing (allows message delivery)
        await new Promise(resolve => setTimeout(resolve, 1000));

        for (const ws of webSockets) {
          ws.close(1000, 'Normal closure');
        }
      } else {
        console.warn(`[Hibernation DO] complete: No active WebSocket connections for jobId ${jobId}`);
      }

      console.log(`[ProgressWebSocketDO_Hibernation] Job completed successfully: ${jobId}`);

      return { success: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in complete: ${error.stack}`);
      throw error;
    }
  }

  /**
   * RPC: Send error
   * Called by handlers/services when job fails
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {string} pipeline - Pipeline identifier
   * @param {Object} payload - Error payload {code, message, details, retryable}
   * @returns {Promise<{success: boolean}>}
   */
  async sendError(pipeline, payload) {
    try {
      const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

      // Construct error message using v2.0.0 canonical format (breaking change)
      const now = Date.now();
      const message = {
        type: 'error',
        version: '2.0.0',
        jobId: jobId || null, // Include jobId if available, otherwise null
        pipeline: pipeline,
        timestamp: now,
        payload: {
          type: 'error',
          data: null,
          metadata: {
            timestamp: new Date(now).toISOString(),
          },
          error: {
            code: payload.code || 'UNKNOWN_ERROR',
            message: payload.message || 'An unknown error occurred.',
            details: payload.details || {},
          },
          retryable: payload.retryable === true, // Coerce to boolean
        },
      };

      const webSockets = this.state.getWebSockets();
      if (webSockets.length > 0) {
        const messageStr = JSON.stringify(message);
        for (const ws of webSockets) {
          ws.send(messageStr);
        }

        // Wait 1 second before closing (allows message delivery)
        await new Promise(resolve => setTimeout(resolve, 1000));

        for (const ws of webSockets) {
          ws.close(1011, 'Internal error');
        }
      } else {
        console.warn(`[Hibernation DO] sendError: No active WebSocket connections for jobId ${jobId}`);
      }

      console.log(`[ProgressWebSocketDO_Hibernation] Job failed: ${jobId}`);

      return { success: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in sendError: ${error.stack}`);
      throw error;
    }
  }

  /**
   * RPC: Wait for client ready signal
   * Called by handlers before starting long-running operations
   *
   * Native DO stub call pattern - returns plain object, not HTTP Response
   *
   * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
   * @returns {Promise<{success: boolean, timedOut?: boolean, disconnected?: boolean, elapsedMs?: number}>}
   */
  async waitForReady(timeoutMs = 15000) {
    try {
      const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
      const startTime = Date.now();

      // Poll for ready state
      while (Date.now() - startTime < timeoutMs) {
        const isReady = await this.state.storage.get(STORAGE_KEYS.IS_READY);
        const webSockets = this.state.getWebSockets();

        if (isReady && webSockets.length > 0) {
          return { success: true, elapsedMs: Date.now() - startTime };
        }

        if (webSockets.length === 0) {
          return { success: false, disconnected: true };
        }

        // Wait 100ms before next check
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Timeout
      console.warn(
        `[ProgressWebSocketDO_Hibernation] Client ready timeout (${timeoutMs}ms) for job ${jobId}`,
      );
      return { success: false, timedOut: true };
    } catch (error) {
      console.error(`[Hibernation DO] Error in waitForReady: ${error.stack}`);
      throw error;
    }
  }

  /**
   * RPC Method: Schedule CSV processing via Durable Object alarm
   *
   * Stores CSV data and schedules alarm to process it outside Worker CPU time limits.
   * Alarm-based processing allows long-running Gemini API calls (20-60s) without timeout.
   *
   * @param {string} csvText - Raw CSV file content
   * @param {string} jobId - Job identifier
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleCSVProcessing(csvText, jobId) {
    console.log(`[${jobId}] Scheduling CSV processing via alarm`);

    let r2Key = null;

    try {
      // 1. Validate payload size
      const { valid, error, size } = validatePayloadSize('csv', csvText);
      if (!valid) {
        throw new Error(`CSV validation failed: ${error}`);
      }

      // 2. Upload to R2 (moves large payload out of DO storage)
      const uploadResult = await uploadPayloadToR2(
        this.env,
        jobId,
        'csv',
        csvText
      );
      r2Key = uploadResult.r2Key;
      console.log(`[${jobId}] CSV uploaded to R2: ${r2Key} (${size} bytes)`);

      // 3. Store minimal metadata in DO storage (no large payload!)
      await this.state.storage.put({
        [STORAGE_KEYS.JOB_ID]: jobId,
        [STORAGE_KEYS.JOB_TYPE]: 'csv-import',
        'R2_CSV_KEY': r2Key,
        'CSV_SIZE': size,
        'CSV_ETAG': uploadResult.etag,
        'CSV_UPLOAD_TIME': Date.now(),
      });

      // 4. Schedule alarm with 2-second delay to ensure WebSocket connects
      // iOS needs time to: receive HTTP 202 → extract jobId → connect WebSocket → send ready
      const alarmTime = Date.now() + 2000;
      await this.state.storage.setAlarm(alarmTime);

      console.log(
        `[${jobId}] CSV processing alarm scheduled for ${new Date(alarmTime).toISOString()}`,
      );

      return { success: true };
    } catch (error) {
      console.error(`[${jobId}] Failed to schedule CSV processing:`, error);

      // Cleanup R2 on any error after upload (prevent orphaned objects)
      if (r2Key) {
        try {
          await deletePayloadFromR2(this.env, r2Key);
          console.log(`[${jobId}] R2 cleanup completed after scheduling error`);
        } catch (cleanupError) {
          console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
        }
      }

      throw error;
    }
  }

  /**
   * RPC Method: Schedule bookshelf scan processing via Durable Object alarm
   *
   * Stores image data and schedules alarm to process it outside Worker CPU time limits.
   * Similar to CSV import, this delegates work to alarm context for long AI operations.
   *
   * @param {ArrayBuffer} imageData - Raw image data
   * @param {string} jobId - Job identifier
   * @param {Object} requestHeaders - Headers from original request (X-AI-Provider, etc.)
   * @returns {Promise<{success: boolean}>}
   */
  async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
    console.log(`[${jobId}] Scheduling bookshelf scan via alarm`);

    let r2Key = null;

    try {
      // 1. Validate payload size
      const { valid, error, size } = validatePayloadSize('image', imageData);
      if (!valid) {
        throw new Error(`Image validation failed: ${error}`);
      }

      // 2. Upload to R2 (moves large payload out of DO storage)
      const uploadResult = await uploadPayloadToR2(
        this.env,
        jobId,
        'image',
        imageData
      );
      r2Key = uploadResult.r2Key;
      console.log(`[${jobId}] Image uploaded to R2: ${r2Key} (${size} bytes)`);

      // 3. Store minimal metadata in DO storage (no large payload!)
      await this.state.storage.put({
        [STORAGE_KEYS.JOB_ID]: jobId,
        [STORAGE_KEYS.JOB_TYPE]: 'bookshelf-scan',
        'R2_IMAGE_KEY': r2Key,
        'IMAGE_SIZE': size,
        'IMAGE_ETAG': uploadResult.etag,
        'IMAGE_UPLOAD_TIME': Date.now(),
        [STORAGE_KEYS.REQUEST_HEADERS]: requestHeaders || {},
      });

      // 4. Schedule alarm with 2-second delay to ensure WebSocket connects
      const alarmTime = Date.now() + 2000;
      await this.state.storage.setAlarm(alarmTime);

      console.log(
        `[${jobId}] Bookshelf scan alarm scheduled for ${new Date(alarmTime).toISOString()}`,
      );

      return { success: true };
    } catch (error) {
      console.error(`[${jobId}] Failed to schedule bookshelf scan:`, error);

      // Cleanup R2 on any error after upload (prevent orphaned objects)
      if (r2Key) {
        try {
          await deletePayloadFromR2(this.env, r2Key);
          console.log(`[${jobId}] R2 cleanup completed after scheduling error`);
        } catch (cleanupError) {
          console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
        }
      }

      throw error;
    }
  }

  /**
   * Alarm handler - for automatic token refresh, job processing, and cleanup
   * DO wakes up, runs alarm, then goes back to sleep
   *
   * Handles three types of alarms:
   * 1. CSV Import Processing - jobType='csv-import', scheduled 2s after upload
   * 2. Bookshelf Scan Processing - jobType='bookshelf-scan', scheduled 2s after upload
   * 3. Token Refresh - no jobType, token needs refresh
   */
  async alarm() {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
    const jobType = await this.state.storage.get(STORAGE_KEYS.JOB_TYPE);

    console.log(
      `[ProgressWebSocketDO_Hibernation] Alarm triggered for job ${jobId}, type: ${jobType || 'token-refresh'}`,
    );

    // Route to appropriate handler based on job type
    if (jobType === "csv-import") {
      // CSV processing alarm (scheduled at 2s by scheduleCSVProcessing)
      console.log(`[${jobId}] Processing CSV import in alarm context`);
      await this.processCSVImportAlarm();
    } else if (jobType === "bookshelf-scan") {
      // Bookshelf scan processing alarm (scheduled at 2s by scheduleBookshelfScan)
      console.log(`[${jobId}] Processing bookshelf scan in alarm context`);
      await this.processBookshelfScanAlarm();
    } else {
      // Token refresh alarm (no jobType)
      const tokenExpiration = await this.state.storage.get(
        STORAGE_KEYS.AUTH_TOKEN_EXPIRATION,
      );
      if (tokenExpiration && Date.now() >= tokenExpiration - 5 * 60 * 1000) {
        await this.refreshAuthToken();
      }

      // Schedule next alarm (e.g., 5 minutes)
      await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
    }
  }

  /**
   * Process CSV import inside Durable Object alarm
   * No Worker CPU time limits apply in alarm context
   */
  async processCSVImportAlarm() {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
    const r2Key = await this.state.storage.get('R2_CSV_KEY');
    const csvSize = await this.state.storage.get('CSV_SIZE');
    const csvEtag = await this.state.storage.get('CSV_ETAG');

    console.log(
      `[${jobId}] Starting CSV processing in alarm (fetching from R2: ${r2Key})`,
    );

    try {
      // 1. Fetch from R2 (no large payload in DO storage!)
      const csvText = await fetchPayloadFromR2(this.env, r2Key);

      // 2. Validate size matches metadata
      const actualSize = typeof csvText === 'string' ? new TextEncoder().encode(csvText).length : csvText.length;
      if (actualSize !== csvSize) {
        throw new Error(`CSV size mismatch: expected ${csvSize}, got ${actualSize}`);
      }

      // 3. Validate ETag matches metadata (data integrity check)
      if (csvEtag && csvEtag !== 'upload-complete') {
        const object = await this.env.BOOKSHELF_IMAGES.head(r2Key);
        if (object && object.etag !== csvEtag) {
          throw new Error(`CSV ETag mismatch: expected ${csvEtag}, got ${object.etag} - possible corruption`);
        }
      }

      console.log(`[${jobId}] CSV fetched from R2 successfully (${actualSize} bytes, ETag verified)`);

      // 3. Process CSV with access to this (DO stub methods)
      await processCSVImportCore(csvText, jobId, this, this.env);

      console.log(`[${jobId}] CSV processing completed successfully`);

      // 4. Delete from R2 (cleanup after success)
      await deletePayloadFromR2(this.env, r2Key);
      console.log(`[${jobId}] R2 object deleted: ${r2Key}`);

      // 5. Clean up DO storage
      await this.state.storage.delete([
        STORAGE_KEYS.CSV_DATA, // Legacy key (if exists)
        STORAGE_KEYS.JOB_ID,
        STORAGE_KEYS.JOB_TYPE,
        'R2_CSV_KEY',
        'CSV_SIZE',
        'CSV_ETAG',
        'CSV_UPLOAD_TIME',
      ]);
    } catch (error) {
      console.error(`[${jobId}] CSV processing failed in alarm:`, error);

      // Attempt R2 cleanup (best effort)
      try {
        if (r2Key) {
          await deletePayloadFromR2(this.env, r2Key);
          console.log(`[${jobId}] R2 cleanup completed after error`);
        }
      } catch (cleanupError) {
        console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
      }

      // Send error to client
      await this.sendError("csv_import", {
        code: "CSV_PROCESSING_ERROR",
        message: error.message,
        details: {
          fallbackAvailable: true,
          suggestion: "Try manual CSV import instead",
        },
        retryable: true,
      });

      // Clean up DO storage even on error
      await this.state.storage.delete([
        STORAGE_KEYS.CSV_DATA, // Legacy key (if exists)
        STORAGE_KEYS.JOB_ID,
        STORAGE_KEYS.JOB_TYPE,
        'R2_CSV_KEY',
        'CSV_SIZE',
        'CSV_ETAG',
        'CSV_UPLOAD_TIME',
      ]);
    }
  }

  /**
   * Process bookshelf scan inside Durable Object alarm
   * No Worker CPU time limits apply in alarm context (can handle 20-60s AI processing)
   */
  async processBookshelfScanAlarm() {
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
    const r2Key = await this.state.storage.get('R2_IMAGE_KEY');
    const imageSize = await this.state.storage.get('IMAGE_SIZE');
    const imageEtag = await this.state.storage.get('IMAGE_ETAG');
    const requestHeaders = await this.state.storage.get(STORAGE_KEYS.REQUEST_HEADERS);

    console.log(
      `[${jobId}] Starting bookshelf scan in alarm (fetching from R2: ${r2Key})`,
    );

    try {
      // 1. Fetch from R2 (no large payload in DO storage!)
      const imageData = await fetchPayloadFromR2(this.env, r2Key);

      // 2. Validate size matches metadata
      const actualSize = imageData instanceof ArrayBuffer ? imageData.byteLength : imageData.length;
      if (actualSize !== imageSize) {
        throw new Error(`Image size mismatch: expected ${imageSize}, got ${actualSize}`);
      }

      // 3. Validate ETag matches metadata (data integrity check)
      if (imageEtag && imageEtag !== 'upload-complete') {
        const object = await this.env.BOOKSHELF_IMAGES.head(r2Key);
        if (object && object.etag !== imageEtag) {
          throw new Error(`Image ETag mismatch: expected ${imageEtag}, got ${object.etag} - possible corruption`);
        }
      }

      console.log(`[${jobId}] Image fetched from R2 successfully (${actualSize} bytes, ETag verified)`);

      // 3. Create mock request object with headers
      const mockRequest = {
        headers: {
          get: (key) => requestHeaders[key] || null,
        },
      };

      // 4. Process bookshelf scan with access to this (DO stub methods)
      // Pass null for ctx since we're in alarm context (no ctx.waitUntil needed)
      await processBookshelfScan(
        jobId,
        imageData,
        mockRequest,
        this.env,
        this,
        null,
      );

      console.log(`[${jobId}] Bookshelf scan completed successfully`);

      // 5. Delete from R2 (cleanup after success)
      await deletePayloadFromR2(this.env, r2Key);
      console.log(`[${jobId}] R2 object deleted: ${r2Key}`);

      // 6. Clean up DO storage
      await this.state.storage.delete([
        STORAGE_KEYS.IMAGE_DATA, // Legacy key (if exists)
        STORAGE_KEYS.REQUEST_HEADERS,
        STORAGE_KEYS.JOB_ID,
        STORAGE_KEYS.JOB_TYPE,
        'R2_IMAGE_KEY',
        'IMAGE_SIZE',
        'IMAGE_ETAG',
        'IMAGE_UPLOAD_TIME',
      ]);
    } catch (error) {
      console.error(
        `[${jobId}] Bookshelf scan processing failed in alarm:`,
        error,
      );

      // Attempt R2 cleanup (best effort)
      try {
        if (r2Key) {
          await deletePayloadFromR2(this.env, r2Key);
          console.log(`[${jobId}] R2 cleanup completed after error`);
        }
      } catch (cleanupError) {
        console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
      }

      await this.sendError("ai_scan", {
        code: "AI_SCAN_PROCESSING_ERROR",
        message: error.message,
        details: {
          fallbackAvailable: false,
          suggestion:
            "Try uploading a clearer photo or contact support if issue persists",
        },
        retryable: true,
      });

      // Clean up DO storage even on error
      await this.state.storage.delete([
        STORAGE_KEYS.IMAGE_DATA, // Legacy key (if exists)
        STORAGE_KEYS.REQUEST_HEADERS,
        STORAGE_KEYS.JOB_ID,
        STORAGE_KEYS.JOB_TYPE,
        'R2_IMAGE_KEY',
        'IMAGE_SIZE',
        'IMAGE_ETAG',
        'IMAGE_UPLOAD_TIME',
      ]);
    }
  }

  /**
   * Refresh authentication token
   * Called by alarm handler or manually via RPC
   */
  async refreshAuthToken() {
    const currentToken = await this.state.storage.get(STORAGE_KEYS.AUTH_TOKEN);
    const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

    if (!currentToken) {
      console.warn(
        `[ProgressWebSocketDO_Hibernation] No token to refresh for job ${jobId}`,
      );
      return;
    }

    try {
      // Call token refresh endpoint
      const response = await fetch(
        `${this.env.API_BASE_URL}/v1/auth/refresh-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const { token: newToken, expiresAt } = await response.json();

      // Blacklist old token
      await this.env.KV_CACHE.put(
        `token:blacklist:${currentToken}`,
        "1",
        { expirationTtl: BLACKLIST_TTL_SECONDS },
      );

      // Store new token
      await this.state.storage.put(STORAGE_KEYS.AUTH_TOKEN, newToken);
      await this.state.storage.put(STORAGE_KEYS.AUTH_TOKEN_EXPIRATION, expiresAt);

      console.log(
        `[ProgressWebSocketDO_Hibernation] Auth token refreshed for job ${jobId}`,
      );

      // Send new token to client
      const connections = this.state.getWebSockets();
      for (const ws of connections) {
        ws.send(
          JSON.stringify({
            type: "token_refreshed",
            token: newToken,
            expiresAt,
          }),
        );
      }
    } catch (error) {
      console.error(
        `[ProgressWebSocketDO_Hibernation] Token refresh failed for job ${jobId}:`,
        error,
      );
    }
  }
}
