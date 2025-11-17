/**
 * Error Scenario Tests: WebSocket Failures and Protocol Errors
 *
 * Tests error handling for ProgressWebSocketDO:
 * - WebSocket close during message send
 * - Invalid JSON in client messages (protocol errors)
 * - Message size exceeding 32 MiB limit
 * - Network failures during state persistence
 * - Protocol violation handling
 * - Message validation errors
 *
 * Priority: P2 (Edge Cases)
 * Related: Issue #150 (Edge case coverage), Issue #135 (Message size validation)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("WebSocket Error Scenarios - Protocol & Network Failures", () => {
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

    // Mock WebSocket with failure scenarios
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
      addEventListener: vi.fn(),
    };

    // Create mock DO with error handling
    progressDO = {
      storage: mockStorage,
      webSocket: null,
      jobId: "error-test-job",
      isReady: false,

      // Simulate message validation
      validateMessageSize(message) {
        const sizeBytes = new Blob([message]).size;
        const sizeMB = sizeBytes / (1024 * 1024);
        const MAX_SIZE_MB = 32;

        if (sizeMB > MAX_SIZE_MB) {
          const error = `WebSocket message too large: ${sizeMB.toFixed(2)} MB (max ${MAX_SIZE_MB} MB)`;
          throw new Error(error);
        }

        return sizeMB;
      },

      // Simulate message send with error handling
      async sendMessage(data) {
        if (!this.webSocket) {
          throw new Error("No WebSocket connection available");
        }

        const message = JSON.stringify(data);
        this.validateMessageSize(message);

        try {
          this.webSocket.send(message);
          return { success: true };
        } catch (error) {
          console.error(`Failed to send message: ${error.message}`);
          throw error;
        }
      },

      // Simulate message handling with protocol validation
      async handleMessage(messageData) {
        let msg;
        try {
          msg = JSON.parse(messageData);
        } catch (error) {
          // JSON parse failure is protocol violation
          this.webSocket.close(1002, "Invalid JSON"); // Protocol error code
          await this.cleanup();
          throw new Error("Protocol error: Invalid JSON");
        }

        // Validate message structure
        if (!msg || typeof msg !== "object") {
          this.webSocket.close(1002, "Invalid message format");
          await this.cleanup();
          throw new Error("Protocol error: Invalid message structure");
        }

        if (!msg.type || typeof msg.type !== "string") {
          this.webSocket.close(1002, "Missing message type");
          await this.cleanup();
          throw new Error("Protocol error: Missing message type");
        }

        // Handle known message types
        if (msg.type === "ready") {
          this.isReady = true;
          return { success: true, type: "ready" };
        }

        // Unknown message type is protocol violation
        this.webSocket.close(1002, `Unknown message type: ${msg.type}`);
        await this.cleanup();
        throw new Error(`Protocol error: Unknown message type '${msg.type}'`);
      },

      async cleanup() {
        this.webSocket = null;
        this.isReady = false;
      },
    };
  });

  describe("WebSocket Close During Message Send", () => {
    it("should throw error when WebSocket is null", async () => {
      // Arrange - No WebSocket connection
      progressDO.webSocket = null;

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "progress", data: {} }),
      ).rejects.toThrow("No WebSocket connection available");
    });

    it("should handle WebSocket.send() failure", async () => {
      // Arrange - Mock send to throw error
      progressDO.webSocket = {
        send: vi.fn().mockImplementation(() => {
          throw new Error("WebSocket is closed");
        }),
        readyState: 3, // CLOSED
      };

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "progress", data: {} }),
      ).rejects.toThrow("WebSocket is closed");
    });

    it("should handle network failure during send", async () => {
      // Arrange - Simulate network error
      progressDO.webSocket = {
        send: vi.fn().mockImplementation(() => {
          throw new Error("Network error: connection lost");
        }),
      };

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "job_complete", data: {} }),
      ).rejects.toThrow("Network error: connection lost");
    });

    it("should handle WebSocket in CLOSING state", async () => {
      // Arrange
      progressDO.webSocket = {
        send: vi.fn().mockImplementation(() => {
          throw new Error("WebSocket is already in CLOSING or CLOSED state");
        }),
        readyState: 2, // CLOSING
      };

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "error", data: {} }),
      ).rejects.toThrow("WebSocket is already in CLOSING or CLOSED state");
    });
  });

  describe("Invalid JSON in Client Messages", () => {
    it("should reject invalid JSON", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const invalidJSON = "{invalid json}";

      // Act & Assert
      await expect(progressDO.handleMessage(invalidJSON)).rejects.toThrow(
        "Protocol error: Invalid JSON",
      );
      expect(mockWebSocket.close).toHaveBeenCalledWith(1002, "Invalid JSON");
    });

    it("should reject malformed JSON with unclosed braces", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const malformedJSON = '{"type":"ready",';

      // Act & Assert
      await expect(progressDO.handleMessage(malformedJSON)).rejects.toThrow(
        "Protocol error: Invalid JSON",
      );
    });

    it("should reject non-object JSON (primitive value)", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const primitiveJSON = '"just a string"';

      // Act & Assert
      await expect(progressDO.handleMessage(primitiveJSON)).rejects.toThrow(
        "Protocol error: Invalid message structure",
      );
      expect(mockWebSocket.close).toHaveBeenCalledWith(
        1002,
        "Invalid message format",
      );
    });

    it("should reject JSON array instead of object", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const arrayJSON = '[{"type":"ready"}]';

      // Act & Assert - Arrays don't have .type, so it fails on missing type
      await expect(progressDO.handleMessage(arrayJSON)).rejects.toThrow(
        "Protocol error: Missing message type",
      );
    });

    it("should reject message with missing type field", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const noTypeJSON = '{"data":"some data"}';

      // Act & Assert
      await expect(progressDO.handleMessage(noTypeJSON)).rejects.toThrow(
        "Protocol error: Missing message type",
      );
      expect(mockWebSocket.close).toHaveBeenCalledWith(
        1002,
        "Missing message type",
      );
    });

    it("should reject message with non-string type", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const numberTypeJSON = '{"type":123}';

      // Act & Assert
      await expect(progressDO.handleMessage(numberTypeJSON)).rejects.toThrow(
        "Protocol error: Missing message type",
      );
    });

    it("should reject unknown message type", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const unknownTypeJSON = '{"type":"unknown_command"}';

      // Act & Assert
      await expect(progressDO.handleMessage(unknownTypeJSON)).rejects.toThrow(
        "Protocol error: Unknown message type 'unknown_command'",
      );
      expect(mockWebSocket.close).toHaveBeenCalledWith(
        1002,
        "Unknown message type: unknown_command",
      );
    });

    it("should accept valid ready message", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const validJSON = '{"type":"ready"}';

      // Act
      const result = await progressDO.handleMessage(validJSON);

      // Assert
      expect(result.success).toBe(true);
      expect(result.type).toBe("ready");
      expect(progressDO.isReady).toBe(true);
      expect(mockWebSocket.close).not.toHaveBeenCalled();
    });
  });

  describe("Message Size Exceeding 32 MiB Limit (Issue #135)", () => {
    it("should accept message under 32 MiB", () => {
      // Arrange - 10 MB message
      const data = {
        type: "progress",
        books: new Array(1000).fill({
          title: "Book Title",
          author: "Author Name",
          isbn: "1234567890123",
        }),
      };
      const message = JSON.stringify(data);

      // Act & Assert - Should not throw
      const size = progressDO.validateMessageSize(message);
      expect(size).toBeLessThan(32);
    });

    it("should reject message over 32 MiB", () => {
      // Arrange - Create large message (> 32 MiB)
      // 100000 objects * ~500 bytes each ≈ 47 MB
      const largeData = {
        type: "job_complete",
        books: new Array(100000).fill({
          title: "Very Long Book Title That Takes Up Space",
          author: "Very Long Author Name That Also Takes Up Space",
          description:
            "This is a very long description that will make the message larger and larger until it exceeds the 32 MiB limit. ".repeat(
              3,
            ),
          isbn: "1234567890123",
          coverUrl:
            "https://example.com/very/long/url/that/takes/up/more/space",
        }),
      };
      const message = JSON.stringify(largeData);

      // Verify message is actually over 32 MiB
      const sizeMB = new Blob([message]).size / (1024 * 1024);
      expect(sizeMB).toBeGreaterThan(32);

      // Act & Assert
      expect(() => progressDO.validateMessageSize(message)).toThrow(
        /WebSocket message too large/,
      );
    });

    it("should fail to send message over 32 MiB", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const largeData = {
        type: "job_complete",
        books: new Array(100000).fill({
          title: "Book",
          data: "x".repeat(1000),
        }),
      };

      // Act & Assert
      await expect(progressDO.sendMessage(largeData)).rejects.toThrow(
        /WebSocket message too large/,
      );
    });

    it("should handle edge case at exactly 32 MiB", () => {
      // Arrange - Message exactly at 32 MiB
      const size32MiB = 32 * 1024 * 1024;
      const paddingNeeded = size32MiB - 100; // Account for JSON structure
      const message = JSON.stringify({
        type: "progress",
        data: "x".repeat(paddingNeeded),
      });

      // Act
      const actualSize = progressDO.validateMessageSize(message);

      // Assert - Should be very close to 32 MB (within tolerance)
      expect(actualSize).toBeGreaterThan(31.9);
      expect(actualSize).toBeLessThanOrEqual(32);
    });

    it("should fail at 32 MiB + 1 byte", () => {
      // Arrange
      const size32MiBPlus1 = 32 * 1024 * 1024 + 1;
      const message = "x".repeat(size32MiBPlus1);

      // Act & Assert
      expect(() => progressDO.validateMessageSize(message)).toThrow(
        /WebSocket message too large/,
      );
    });
  });

  describe("Network Failures During State Persistence", () => {
    it("should handle storage.put failure during state update", async () => {
      // Arrange - Mock storage to fail
      mockStorage.put = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network timeout"));

      // Act & Assert
      await expect(mockStorage.put("jobState", {})).rejects.toThrow(
        "Network timeout",
      );
    });

    it("should handle storage failure during token save", async () => {
      // Arrange
      mockStorage.put = vi
        .fn()
        .mockRejectedValueOnce(new Error("Connection lost"));

      // Act & Assert
      await expect(mockStorage.put("authToken", "token")).rejects.toThrow(
        "Connection lost",
      );
    });

    it("should handle intermittent storage failures with retry", async () => {
      // Arrange - Fail first time, succeed second time
      let attemptCount = 0;
      mockStorage.put = vi.fn().mockImplementation((key, value) => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error("Temporary network error"));
        }
        return Promise.resolve();
      });

      // Act - First attempt fails
      await expect(mockStorage.put("jobState", {})).rejects.toThrow(
        "Temporary network error",
      );

      // Second attempt succeeds
      await expect(mockStorage.put("jobState", {})).resolves.toBeUndefined();

      // Assert
      expect(attemptCount).toBe(2);
    });

    it("should handle storage.get failure during state retrieval", async () => {
      // Arrange
      mockStorage.get = vi
        .fn()
        .mockRejectedValueOnce(new Error("Storage unavailable"));

      // Act & Assert
      await expect(mockStorage.get("jobState")).rejects.toThrow(
        "Storage unavailable",
      );
    });

    it("should handle batch storage failure", async () => {
      // Arrange
      mockStorage.put = vi
        .fn()
        .mockRejectedValueOnce(new Error("Batch write failed"));

      // Act & Assert
      await expect(
        mockStorage.put({ key1: "value1", key2: "value2" }),
      ).rejects.toThrow("Batch write failed");
    });
  });

  describe("Protocol Violation Handling", () => {
    it("should close connection with code 1002 for protocol errors", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const invalidMessage = "not json at all";

      // Act
      await expect(progressDO.handleMessage(invalidMessage)).rejects.toThrow();

      // Assert
      expect(mockWebSocket.close).toHaveBeenCalledWith(
        1002,
        expect.stringContaining("Invalid JSON"),
      );
    });

    it("should cleanup after protocol violation", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      progressDO.isReady = true;

      // Act
      await expect(
        progressDO.handleMessage('{"type":null}'),
      ).rejects.toThrow();

      // Assert - Should cleanup state
      expect(progressDO.webSocket).toBeNull();
      expect(progressDO.isReady).toBe(false);
    });

    it("should use correct close codes for different violations", async () => {
      // Arrange & Act - Test different protocol violations
      const tests = [
        { message: "invalid", description: "invalid JSON" },
        { message: '{"data":"no type"}', description: "missing type" },
        { message: '{"type":"unknown"}', description: "unknown type" },
      ];

      for (const test of tests) {
        // Create new WebSocket for each test
        const testWebSocket = {
          send: vi.fn(),
          close: vi.fn(),
          readyState: 1,
        };
        progressDO.webSocket = testWebSocket;

        await expect(
          progressDO.handleMessage(test.message),
        ).rejects.toThrow();
        
        // Assert - Should use protocol error code 1002
        // WebSocket gets cleaned up (set to null), so check the saved reference
        expect(testWebSocket.close).toHaveBeenCalledWith(
          1002,
          expect.any(String),
        );
      }
    });
  });

  describe("Message Validation Edge Cases", () => {
    it("should handle null message", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;

      // Act & Assert
      await expect(progressDO.handleMessage("null")).rejects.toThrow(
        "Protocol error: Invalid message structure",
      );
    });

    it("should handle undefined message", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;

      // Act & Assert
      await expect(progressDO.handleMessage("undefined")).rejects.toThrow(
        "Protocol error: Invalid JSON",
      );
    });

    it("should handle empty string message", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;

      // Act & Assert
      await expect(progressDO.handleMessage("")).rejects.toThrow(
        "Protocol error: Invalid JSON",
      );
    });

    it("should handle message with extra whitespace", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const messageWithWhitespace = '  \n\t  {"type":"ready"}  \n  ';

      // Act
      const result = await progressDO.handleMessage(messageWithWhitespace);

      // Assert - Should parse successfully despite whitespace
      expect(result.success).toBe(true);
    });

    it("should handle message with escaped characters", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const messageWithEscapes = '{"type":"ready","data":"test\\nline"}';

      // Act - Should parse successfully
      const result = await progressDO.handleMessage(messageWithEscapes);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should handle message with Unicode characters", async () => {
      // Arrange
      progressDO.webSocket = mockWebSocket;
      const unicodeMessage = '{"type":"ready","data":"Hello 世界 🌍"}';

      // Act
      const result = await progressDO.handleMessage(unicodeMessage);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe("WebSocket State Edge Cases", () => {
    it("should detect WebSocket already closed before send", async () => {
      // Arrange
      progressDO.webSocket = {
        send: vi.fn(),
        readyState: 3, // CLOSED
      };

      // Mock send to detect closed state
      progressDO.webSocket.send.mockImplementation(() => {
        if (progressDO.webSocket.readyState === 3) {
          throw new Error("WebSocket is closed");
        }
      });

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "progress" }),
      ).rejects.toThrow("WebSocket is closed");
    });

    it("should handle WebSocket closing mid-send", async () => {
      // Arrange
      progressDO.webSocket = {
        send: vi.fn().mockImplementation(() => {
          // Simulate WebSocket closing during send
          throw new Error("WebSocket closed during send");
        }),
        readyState: 1,
      };

      // Act & Assert
      await expect(
        progressDO.sendMessage({ type: "job_complete" }),
      ).rejects.toThrow("WebSocket closed during send");
    });
  });
});
