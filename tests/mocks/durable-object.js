/**
 * Mock Durable Object Utilities
 *
 * Helpers for testing Durable Object functionality
 * Used by: tests/integration/websocket-do.test.js
 */

import { vi } from "vitest";
import { createMockWebSocketPair } from "../setup.js";

/**
 * Mock Durable Object Stub
 * Simulates RPC calls to a Durable Object
 */
export function createMockDOStub() {
  return {
    // WebSocket upgrade
    fetch: vi.fn(async (request) => {
      return new Response(null, { status: 101, webSocket: {} });
    }),

    // Auth & Token Management
    setAuthToken: vi.fn(async (token) => {
      return { success: true };
    }),

    refreshAuthToken: vi.fn(async (oldToken) => {
      return { token: "new-token-uuid", expiresIn: 7200 };
    }),

    // Job State Management
    initializeJobState: vi.fn(async (pipeline, totalCount) => {
      return { success: true };
    }),

    updateJobState: vi.fn(async (updates) => {
      return { success: true, persisted: true };
    }),

    getJobState: vi.fn(async () => {
      return {
        pipeline: "batch_enrichment",
        totalCount: 5,
        processedCount: 0,
        status: "running",
        version: 1,
      };
    }),

    getJobStateAndAuth: vi.fn(async () => {
      return {
        jobState: {
          pipeline: "batch_enrichment",
          totalCount: 5,
          status: "running",
        },
        authToken: "test-token",
        authTokenExpiration: Date.now() + 7200000,
      };
    }),

    completeJobState: vi.fn(async (results) => {
      return { success: true };
    }),

    failJobState: vi.fn(async (error) => {
      return { success: true };
    }),

    // Progress Updates (Unified Schema v1.0.0)
    pushProgress: vi.fn(async (progressData) => {
      return { success: true };
    }),

    updateProgress: vi.fn(async (pipeline, payload) => {
      // Validate pipeline type
      const validPipelines = ["batch_enrichment", "csv_import", "ai_scan"];
      if (!validPipelines.includes(pipeline)) {
        throw new Error(
          `Invalid pipeline: ${pipeline}. Expected one of: ${validPipelines.join(", ")}`,
        );
      }

      // Validate required payload fields
      if (
        typeof payload.progress !== "number" ||
        payload.progress < 0 ||
        payload.progress > 1
      ) {
        throw new Error(
          `Invalid progress value: ${payload.progress}. Expected number between 0 and 1`,
        );
      }

      if (typeof payload.status !== "string" || payload.status.length === 0) {
        throw new Error(
          "Missing or invalid required field: status (must be non-empty string)",
        );
      }

      return { success: true };
    }),

    complete: vi.fn(async (pipeline, payload) => {
      // Validate pipeline type
      const validPipelines = ["batch_enrichment", "csv_import", "ai_scan"];
      if (!validPipelines.includes(pipeline)) {
        throw new Error(
          `Invalid pipeline: ${pipeline}. Expected one of: ${validPipelines.join(", ")}`,
        );
      }

      // Pipeline-specific payload validation (ISSUE #133: Summary-only pattern)
      if (pipeline === "ai_scan") {
        if (typeof payload.totalDetected !== "number") {
          throw new Error(
            "Missing required field for ai_scan completion: totalDetected (number)",
          );
        }
        if (typeof payload.approved !== "number") {
          throw new Error(
            "Missing required field for ai_scan completion: approved (number)",
          );
        }
        // ISSUE #133: Accept either books array (legacy) or resultsUrl (summary-only)
        if (
          !Array.isArray(payload.books) &&
          typeof payload.resultsUrl !== "string"
        ) {
          throw new Error(
            "Missing required field for ai_scan completion: books (array) or resultsUrl (string)",
          );
        }
      } else if (pipeline === "csv_import") {
        // ISSUE #133: Accept either books array (legacy) or resultsUrl (summary-only)
        if (
          !Array.isArray(payload.books) &&
          typeof payload.booksCount !== "number"
        ) {
          throw new Error(
            "Missing required field for csv_import completion: books (array) or booksCount (number)",
          );
        }
        if (typeof payload.successRate !== "string") {
          throw new Error(
            "Missing required field for csv_import completion: successRate (string)",
          );
        }
      } else if (pipeline === "batch_enrichment") {
        if (typeof payload.successCount !== "number") {
          throw new Error(
            "Missing required field for batch_enrichment completion: successCount (number)",
          );
        }
      }

      return { success: true };
    }),

    sendError: vi.fn(async (pipeline, payload) => {
      // Validate pipeline type
      const validPipelines = ["batch_enrichment", "csv_import", "ai_scan"];
      if (!validPipelines.includes(pipeline)) {
        throw new Error(
          `Invalid pipeline: ${pipeline}. Expected one of: ${validPipelines.join(", ")}`,
        );
      }

      // Validate required error payload fields
      if (typeof payload.code !== "string" || payload.code.length === 0) {
        throw new Error(
          "Missing or invalid required field: code (must be non-empty string)",
        );
      }

      if (typeof payload.message !== "string" || payload.message.length === 0) {
        throw new Error(
          "Missing or invalid required field: message (must be non-empty string)",
        );
      }

      return { success: true };
    }),

    closeConnection: vi.fn(async (reason) => {
      return { success: true };
    }),

    // Batch Operations
    initBatch: vi.fn(async ({ jobId, totalPhotos, status }) => {
      return { success: true };
    }),

    updatePhoto: vi.fn(async ({ photoIndex, status, booksFound, error }) => {
      return { success: true };
    }),

    completeBatch: vi.fn(
      async ({ status, totalBooks, photoResults, books }) => {
        return { success: true };
      },
    ),

    getState: vi.fn(async () => {
      return {
        jobId: "test-job-id",
        type: "batch",
        totalPhotos: 3,
        photos: [
          { index: 0, status: "complete", booksFound: 2 },
          { index: 1, status: "complete", booksFound: 3 },
          { index: 2, status: "queued", booksFound: 0 },
        ],
        totalBooksFound: 5,
      };
    }),

    isBatchCanceled: vi.fn(async () => {
      return { canceled: false };
    }),

    cancelBatch: vi.fn(async () => {
      return { success: true };
    }),

    // Ready Signal
    waitForReady: vi.fn(async (timeoutMs = 5000) => {
      return { success: true };
    }),

    // Cancellation
    cancelJob: vi.fn(async (reason) => {
      return { success: true, status: "canceled" };
    }),

    isCanceled: vi.fn(async () => {
      return false;
    }),

    // CSV Processing
    scheduleCSVProcessing: vi.fn(async (csvText, jobId) => {
      return { success: true };
    }),
  };
}

/**
 * Mock Durable Object Namespace
 * Simulates getting DO stubs by ID
 */
export function createMockDONamespace() {
  const stubs = new Map();

  return {
    idFromName: vi.fn((name) => ({
      toString: () => `do-id-${name}`,
    })),

    idFromString: vi.fn((id) => ({
      toString: () => id,
    })),

    get: vi.fn((id) => {
      const idStr = id.toString();
      if (!stubs.has(idStr)) {
        stubs.set(idStr, createMockDOStub());
      }
      return stubs.get(idStr);
    }),

    // Test helpers
    __getStub: (id) => stubs.get(id.toString()),
    __getAllStubs: () => Array.from(stubs.values()),
    __clear: () => stubs.clear(),
  };
}

/**
 * Mock WebSocket upgrade in Durable Object context
 */
export function createMockWebSocketUpgradeRequest() {
  const { server, client } = createMockWebSocketPair();

  return {
    method: "GET",
    url: new URL(
      "ws://localhost/ws/progress?jobId=test-job-id&token=test-token",
    ),
    headers: new Map([
      ["upgrade", "websocket"],
      ["connection", "upgrade"],
      ["sec-websocket-key", "test-key"],
      ["sec-websocket-version", "13"],
    ]),
    // Response-like object with webSocket
    createWebSocketPair: () => ({ 0: client, 1: server }),
    __server: server,
    __client: client,
  };
}

/**
 * Mock Durable Object Alarm
 */
export function createMockAlarm() {
  return {
    alarmTime: Date.now() + 86400000, // 24 hours from now
    triggered: false,
    async execute() {
      this.triggered = true;
    },
  };
}

/**
 * Helper: Simulate token refresh window
 * Returns the time remaining until token can be refreshed (30 min window)
 */
export function getTokenRefreshWindowTime(tokenExpiration) {
  const REFRESH_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
  const timeRemaining = tokenExpiration - Date.now();
  const timeUntilWindow = timeRemaining - REFRESH_WINDOW_MS;

  return {
    timeRemaining,
    timeUntilWindow,
    canRefresh: timeUntilWindow <= 0,
    minutesRemaining: Math.floor(timeRemaining / 60000),
  };
}

/**
 * Helper: Create valid auth token
 */
export function createValidAuthToken() {
  // UUID v4 format
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
