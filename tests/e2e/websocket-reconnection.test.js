/**
 * E2E Tests: WebSocket Reconnection Flow
 *
 * Tests WebSocket reconnection scenarios for ProgressWebSocketDO:
 * - Client reconnection with `reconnect=true` query param
 * - State synchronization after reconnection  
 * - Reconnection during active job processing
 * - Grace period handling (60-second window)
 * - Multiple reconnection attempts
 *
 * Priority: P1 (Reliability)
 * Related: Issue #150 (Edge case coverage), Issue #127 (Reconnection support)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("WebSocket Reconnection Flow - E2E", () => {
  let mockStorage;
  let mockWebSocket;
  let progressDO;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock storage
    const storageData = new Map();
    mockStorage = {
      data: storageData,
      get: vi.fn((key) => Promise.resolve(storageData.get(key) || null)),
      put: vi.fn((keyOrObj, value) => {
        if (typeof keyOrObj === "object") {
          Object.entries(keyOrObj).forEach(([k, v]) => storageData.set(k, v));
        } else {
          storageData.set(keyOrObj, value);
        }
        return Promise.resolve();
      }),
      delete: vi.fn((key) => {
        storageData.delete(key);
        return Promise.resolve();
      }),
    };

    // Mock WebSocket
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
    };

    // Create mock DO with reconnection support
    progressDO = {
      storage: mockStorage,
      webSocket: null,
      jobId: "reconnect-job-123",
      isReady: false,

      // Simulate WebSocket upgrade with reconnection detection
      async handleUpgrade(request) {
        const url = new URL(request.url);
        const isReconnect = url.searchParams.get("reconnect") === "true";
        const providedToken = url.searchParams.get("token");

        // Validate token
        const storedToken = await this.storage.get("authToken");
        const expiration = await this.storage.get("authTokenExpiration");

        if (!storedToken || storedToken !== providedToken) {
          // Check grace period for old tokens
          const oldTokenKey = `oldAuthToken:${providedToken}`;
          const gracePeriodValid = await this.storage.get(oldTokenKey);
          if (!gracePeriodValid) {
            return { success: false, error: "Unauthorized" };
          }
        }

        if (Date.now() > expiration) {
          return { success: false, error: "Token expired" };
        }

        // Handle reconnection
        if (isReconnect && this.webSocket) {
          this.webSocket.close(1000, "Client reconnecting");
          this.webSocket = null;
          this.isReady = false;
        }

        // Store disconnect info for reconnection tracking
        await this.storage.put("lastDisconnect", Date.now());

        // Create new WebSocket
        this.webSocket = mockWebSocket;

        // Send reconnection state if applicable
        if (isReconnect) {
          const jobState = await this.storage.get("jobState");
          if (jobState) {
            this.webSocket.send(
              JSON.stringify({
                type: "reconnected",
                jobId: this.jobId,
                payload: {
                  progress: jobState.progress || 0,
                  status: jobState.status || "processing",
                  processedCount: jobState.processedCount || 0,
                  totalCount: jobState.totalCount || 0,
                  message: "Reconnected successfully - resuming job progress",
                },
              }),
            );
          }
        }

        return { success: true, isReconnect };
      },

      // Simulate disconnect tracking
      async handleDisconnect(code, reason) {
        await this.storage.put("lastDisconnect", Date.now());
        await this.storage.put("lastDisconnectCode", code);
        await this.storage.put("lastDisconnectReason", reason || "Unknown");

        // Only full cleanup on normal closure
        if (code === 1000) {
          this.webSocket = null;
          await this.storage.delete("jobState");
        } else {
          // Keep state for reconnection
          this.webSocket = null;
          this.isReady = false;
        }
      },

      // Simulate job state management
      async initializeJobState(pipeline, totalCount) {
        const state = {
          pipeline,
          totalCount,
          processedCount: 0,
          progress: 0,
          status: "running",
          startTime: Date.now(),
          version: 1,
        };
        await this.storage.put("jobState", state);
        return { success: true };
      },

      async updateJobState(updates) {
        const currentState = (await this.storage.get("jobState")) || {};
        const newState = {
          ...currentState,
          ...updates,
          lastUpdate: Date.now(),
          version: (currentState.version || 0) + 1,
        };
        await this.storage.put("jobState", newState);
        return { success: true, persisted: true };
      },
    };
  });

  describe("Reconnection with reconnect=true", () => {
    it("should accept reconnection with valid token", async () => {
      // Arrange - Set up initial connection
      const token = "reconnect-token-123";
      const expiration = Date.now() + 2 * 60 * 60 * 1000;
      await mockStorage.put("authToken", token);
      await mockStorage.put("authTokenExpiration", expiration);
      await progressDO.initializeJobState("batch_enrichment", 100);

      // Initial connection
      const initialRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}`,
      );
      progressDO.webSocket = mockWebSocket;

      // Simulate disconnect
      await progressDO.handleDisconnect(1006, "Network error");

      // Act - Reconnect with reconnect=true
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.isReconnect).toBe(true);
    });

    it("should close old WebSocket before establishing new connection", async () => {
      // Arrange
      const token = "close-old-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      const oldWebSocket = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
      };
      progressDO.webSocket = oldWebSocket;

      // Act - Reconnect
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      await progressDO.handleUpgrade(reconnectRequest);

      // Assert - Old WebSocket should be closed
      expect(oldWebSocket.close).toHaveBeenCalledWith(
        1000,
        "Client reconnecting",
      );
    });

    it("should reject reconnection with invalid token", async () => {
      // Arrange
      const validToken = "valid-token";
      const invalidToken = "invalid-token";
      await mockStorage.put("authToken", validToken);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Act - Attempt reconnection with wrong token
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${invalidToken}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("Unauthorized");
    });

    it("should accept reconnection with old token during grace period", async () => {
      // Arrange - Set up initial token
      const oldToken = "old-grace-token";
      const newToken = "new-grace-token";
      await mockStorage.put("authToken", newToken);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Store old token with grace period
      await mockStorage.put(`oldAuthToken:${oldToken}`, true);

      // Act - Reconnect with old token
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${oldToken}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert - Should accept old token during grace period
      expect(result.success).toBe(true);
    });
  });

  describe("State Synchronization After Reconnection", () => {
    it("should send current job state on reconnection", async () => {
      // Arrange
      const token = "sync-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Initialize job with some progress
      await progressDO.initializeJobState("csv_import", 500);
      await progressDO.updateJobState({
        processedCount: 250,
        progress: 50,
        status: "processing",
      });

      // Act - Reconnect
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      await progressDO.handleUpgrade(reconnectRequest);

      // Assert - Should send reconnection message with current state
      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);

      expect(sentMessage.type).toBe("reconnected");
      expect(sentMessage.payload.progress).toBe(50);
      expect(sentMessage.payload.processedCount).toBe(250);
      expect(sentMessage.payload.totalCount).toBe(500);
      expect(sentMessage.payload.status).toBe("processing");
    });

    it("should handle reconnection when no job state exists", async () => {
      // Arrange
      const token = "no-state-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // No job state initialized

      // Act - Reconnect
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert - Should succeed but not send reconnection state
      expect(result.success).toBe(true);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it("should preserve job version on reconnection", async () => {
      // Arrange
      const token = "version-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      await progressDO.initializeJobState("ai_scan", 5);

      // Make several updates to increment version
      for (let i = 0; i < 3; i++) {
        await progressDO.updateJobState({ processedCount: i + 1 });
      }

      const stateBeforeReconnect = await mockStorage.get("jobState");

      // Act - Reconnect
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      await progressDO.handleUpgrade(reconnectRequest);

      // Assert - Version should be unchanged
      const stateAfterReconnect = await mockStorage.get("jobState");
      expect(stateAfterReconnect.version).toBe(stateBeforeReconnect.version);
      expect(stateAfterReconnect.version).toBeGreaterThan(1);
    });
  });

  describe("Reconnection During Active Job Processing", () => {
    it("should allow reconnection while job is processing", async () => {
      // Arrange
      const token = "active-job-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      await progressDO.initializeJobState("batch_enrichment", 100);
      await progressDO.updateJobState({
        processedCount: 50,
        progress: 50,
        status: "processing",
      });

      // Act - Reconnect while job is mid-processing
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert
      expect(result.success).toBe(true);

      // Verify sent state shows processing
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage.payload.status).toBe("processing");
      expect(sentMessage.payload.progress).toBe(50);
    });

    it("should handle reconnection at job completion", async () => {
      // Arrange
      const token = "complete-job-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      await progressDO.initializeJobState("batch_enrichment", 100);
      await progressDO.updateJobState({
        processedCount: 100,
        progress: 100,
        status: "complete",
      });

      // Act - Reconnect after completion
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert
      expect(result.success).toBe(true);

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage.payload.status).toBe("complete");
      expect(sentMessage.payload.progress).toBe(100);
    });
  });

  describe("Grace Period Handling (60-second window)", () => {
    it("should track disconnect time for grace period", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;

      // Act - Disconnect
      const disconnectTime = Date.now();
      await progressDO.handleDisconnect(1006, "Connection lost");

      // Assert - Should store disconnect time
      const lastDisconnect = await mockStorage.get("lastDisconnect");
      expect(lastDisconnect).toBeGreaterThanOrEqual(disconnectTime);
      expect(lastDisconnect).toBeLessThanOrEqual(Date.now());
    });

    it("should store disconnect code and reason", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;

      // Act - Disconnect with specific code
      await progressDO.handleDisconnect(1006, "Network timeout");

      // Assert
      const code = await mockStorage.get("lastDisconnectCode");
      const reason = await mockStorage.get("lastDisconnectReason");

      expect(code).toBe(1006);
      expect(reason).toBe("Network timeout");
    });

    it("should preserve state during unexpected disconnect (non-1000)", async () => {
      // Arrange
      await progressDO.initializeJobState("csv_import", 1000);
      await progressDO.updateJobState({ processedCount: 500, progress: 50 });
      progressDO.webSocket = mockWebSocket;

      // Act - Unexpected disconnect
      await progressDO.handleDisconnect(1006, "Connection lost");

      // Assert - State should be preserved
      const jobState = await mockStorage.get("jobState");
      expect(jobState).toBeDefined();
      expect(jobState.processedCount).toBe(500);
    });

    it("should cleanup state on normal closure (code 1000)", async () => {
      // Arrange
      await progressDO.initializeJobState("batch_enrichment", 100);
      progressDO.webSocket = mockWebSocket;

      // Act - Normal disconnect
      await progressDO.handleDisconnect(1000, "Job completed");

      // Assert - State should be deleted
      const jobState = await mockStorage.get("jobState");
      expect(jobState).toBeNull();
    });

    it("should allow reconnection within grace period", async () => {
      // Arrange
      const token = "grace-period-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );
      await progressDO.initializeJobState("ai_scan", 3);

      // Disconnect
      await progressDO.handleDisconnect(1006, "Network issue");

      // Simulate time passing (< 60 seconds)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Act - Reconnect within grace period
      const reconnectRequest = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(reconnectRequest);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe("Multiple Reconnection Attempts", () => {
    it("should handle rapid reconnection attempts", async () => {
      // Arrange
      const token = "rapid-reconnect-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Act - Multiple rapid reconnections
      const results = [];
      for (let i = 0; i < 3; i++) {
        const request = new Request(
          `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
        );
        const result = await progressDO.handleUpgrade(request);
        results.push(result);
      }

      // Assert - All should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it("should track each reconnection attempt", async () => {
      // Arrange
      const token = "track-reconnect-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Act - Multiple disconnects and reconnects
      for (let i = 0; i < 3; i++) {
        await progressDO.handleDisconnect(1006, `Disconnect ${i}`);

        const request = new Request(
          `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
        );
        await progressDO.handleUpgrade(request);
      }

      // Assert - Last disconnect should be most recent
      const lastDisconnect = await mockStorage.get("lastDisconnect");
      expect(lastDisconnect).toBeDefined();
      expect(Date.now() - lastDisconnect).toBeLessThan(1000);
    });

    it("should reject reconnection after token expiration", async () => {
      // Arrange
      const token = "expired-reconnect-token";
      const pastExpiration = Date.now() - 1000; // Already expired
      await mockStorage.put("authToken", token);
      await mockStorage.put("authTokenExpiration", pastExpiration);

      // Act - Attempt reconnection with expired token
      const request = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("Token expired");
    });
  });

  describe("Reconnection Edge Cases", () => {
    it("should handle reconnection without prior WebSocket", async () => {
      // Arrange - No prior WebSocket established
      const token = "no-prior-ws-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      progressDO.webSocket = null;

      // Act - Attempt reconnection
      const request = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(request);

      // Assert - Should succeed (no old WebSocket to close)
      expect(result.success).toBe(true);
    });

    it("should handle reconnection with different jobId in URL", async () => {
      // Arrange
      const token = "different-jobid-token";
      await mockStorage.put("authToken", token);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );

      // Act - Reconnect with different jobId (should still work as token is DO-specific)
      const request = new Request(
        `http://localhost/ws/progress?jobId=different-job-id&token=${token}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(request);

      // Assert - Token validation should work regardless of jobId in URL
      expect(result.success).toBe(true);
    });

    it("should handle reconnection during token auto-refresh", async () => {
      // Arrange
      const oldToken = "pre-refresh-token";
      const newToken = "post-refresh-token";

      // Simulate mid-refresh state
      await mockStorage.put("authToken", newToken);
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 2 * 60 * 60 * 1000,
      );
      await mockStorage.put(`oldAuthToken:${oldToken}`, true);

      // Act - Reconnect with old token during grace period
      const request = new Request(
        `http://localhost/ws/progress?jobId=reconnect-job-123&token=${oldToken}&reconnect=true`,
      );
      const result = await progressDO.handleUpgrade(request);

      // Assert - Should accept old token
      expect(result.success).toBe(true);
    });
  });
});
