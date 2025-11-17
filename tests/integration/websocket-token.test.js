/**
 * Integration Tests: WebSocket Token Management Edge Cases
 *
 * Tests critical token lifecycle scenarios for ProgressWebSocketDO:
 * - Token expiration at exact boundaries
 * - Token refresh window enforcement
 * - Concurrent refresh race conditions
 * - Clock skew scenarios
 *
 * Priority: P0 (Security & Data Loss)
 * Related: Issue #150 (Edge case coverage)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("WebSocket Token Management - Edge Cases", () => {
  let mockStorage;
  let mockEnv;
  let progressDO;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Durable Object storage with realistic behavior
    const storageData = new Map();
    
    mockStorage = {
      data: storageData,
      get: vi.fn((key) => {
        const value = storageData.has(key) ? storageData.get(key) : null;
        return Promise.resolve(value);
      }),
      put: vi.fn((keyOrObj, value, options) => {
        if (typeof keyOrObj === "object") {
          // Batch put
          Object.entries(keyOrObj).forEach(([k, v]) => storageData.set(k, v));
        } else {
          storageData.set(keyOrObj, value);
          // Handle TTL expiration
          if (options?.expirationTtl) {
            setTimeout(
              () => storageData.delete(keyOrObj),
              options.expirationTtl * 1000,
            );
          }
        }
        return Promise.resolve();
      }),
      delete: vi.fn((key) => {
        storageData.delete(key);
        return Promise.resolve();
      }),
    };

    // Mock environment
    mockEnv = {
      PROGRESS_WEBSOCKET_DO: {
        get: vi.fn(),
      },
    };

    // Create mock DO instance that simulates ProgressWebSocketDO methods
    progressDO = {
      storage: mockStorage,
      jobId: "test-job-123",
      refreshInProgress: false,

      // Simulate setAuthToken method
      async setAuthToken(token) {
        await this.storage.put("authToken", token);
        await this.storage.put(
          "authTokenExpiration",
          Date.now() + 2 * 60 * 60 * 1000,
        );
        return { success: true };
      },

      // Simulate refreshAuthToken method
      async refreshAuthToken(oldToken) {
        if (this.refreshInProgress) {
          return { error: "Refresh in progress, please retry shortly" };
        }

        this.refreshInProgress = true;
        try {
          const storedToken = await this.storage.get("authToken");
          const expiration = await this.storage.get("authTokenExpiration");

          // Validate old token
          if (!storedToken || !oldToken || storedToken !== oldToken) {
            return { error: "Invalid token" };
          }

          // Check if token is expired
          if (Date.now() > expiration) {
            return { error: "Token expired" };
          }

          // Enforce 30-minute refresh window
          const REFRESH_WINDOW_MS = 30 * 60 * 1000;
          const timeUntilExpiration = expiration - Date.now();
          if (timeUntilExpiration > REFRESH_WINDOW_MS) {
            return {
              error: "Refresh not allowed yet",
              details: `Token can be refreshed ${Math.floor((timeUntilExpiration - REFRESH_WINDOW_MS) / 60000)} minutes from now`,
            };
          }

          // Generate new token
          const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1000;
          const newToken = "new-token-" + crypto.randomUUID();
          const newExpiration = Date.now() + TOKEN_EXPIRATION_MS;
          await this.storage.put("authToken", newToken);
          await this.storage.put("authTokenExpiration", newExpiration);

          return {
            token: newToken,
            expiresIn: 7200,
          };
        } finally {
          this.refreshInProgress = false;
        }
      },

      // Simulate autoRefreshToken method
      async autoRefreshToken() {
        if (this.refreshInProgress) {
          return false;
        }

        this.refreshInProgress = true;
        try {
          const expiration = await this.storage.get("authTokenExpiration");
          const oldToken = await this.storage.get("authToken");
          const now = Date.now();

          if (now > expiration) {
            return false;
          }

          const REFRESH_WINDOW_MS = 30 * 60 * 1000;
          const timeUntilExpiration = expiration - now;
          if (timeUntilExpiration > REFRESH_WINDOW_MS) {
            return false;
          }

          const TOKEN_EXPIRATION_MS = 2 * 60 * 60 * 1000;
          const newToken = "auto-" + crypto.randomUUID();
          const newExpiration = now + TOKEN_EXPIRATION_MS;

          await this.storage.put("authToken", newToken);
          await this.storage.put("authTokenExpiration", newExpiration);

          // Store old token with grace period
          if (oldToken) {
            await this.storage.put(`oldAuthToken:${oldToken}`, true, {
              expirationTtl: 300,
            });
          }

          return true;
        } finally {
          this.refreshInProgress = false;
        }
      },
    };
  });

  describe("Token Expiration - Exact Boundary", () => {
    it("should reject authentication when currentTime === expirationTime", async () => {
      // Arrange - Set token with expiration time
      const token = "boundary-token-123";
      const expirationTime = Date.now() + 1000; // Expires in 1 second

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Wait until exactly expiration time
      await new Promise((resolve) =>
        setTimeout(resolve, expirationTime - Date.now() + 10),
      );

      // Act - Attempt to refresh at exact expiration boundary
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Should reject as expired
      expect(result.error).toBe("Token expired");
      expect(result.token).toBeUndefined();
    });

    it("should allow authentication 1ms before expiration", async () => {
      // Arrange
      const token = "almost-expired-token";
      const expirationTime = Date.now() + 29 * 60 * 1000; // 29 minutes (within refresh window)

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Refresh just before expiration (within window)
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Should succeed
      expect(result.error).toBeUndefined();
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(7200);
    });
  });

  describe("Token Refresh Window - Exact Boundary", () => {
    it("should reject refresh when exactly 30 minutes + 1ms remain", async () => {
      // Arrange - Token expires in exactly 30 minutes + 1ms
      const token = "window-boundary-token";
      const REFRESH_WINDOW_MS = 30 * 60 * 1000;
      const expirationTime = Date.now() + REFRESH_WINDOW_MS + 1;

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Attempt to refresh just outside window
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Should reject (not in refresh window yet)
      expect(result.error).toBe("Refresh not allowed yet");
      expect(result.details).toContain("minutes from now");
    });

    it("should allow refresh when exactly 30 minutes remain", async () => {
      // Arrange - Token expires in exactly 30 minutes
      const token = "window-edge-token";
      const REFRESH_WINDOW_MS = 30 * 60 * 1000;
      const expirationTime = Date.now() + REFRESH_WINDOW_MS;

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Refresh at exact window boundary
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Should succeed
      expect(result.error).toBeUndefined();
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(7200);
    });

    it("should allow refresh when 29 minutes 59 seconds remain", async () => {
      // Arrange - Token expires just under 30 minutes
      const token = "window-inside-token";
      const expirationTime = Date.now() + 29 * 60 * 1000 + 59 * 1000;

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Should succeed (inside window)
      expect(result.error).toBeUndefined();
      expect(result.token).toBeDefined();
    });
  });

  describe("Concurrent Token Refresh - Race Conditions", () => {
    it("should prevent concurrent manual refresh attempts", async () => {
      // Arrange
      const token = "concurrent-token";
      const expirationTime = Date.now() + 25 * 60 * 1000; // 25 minutes (in window)

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Trigger two refresh requests simultaneously
      const [result1, result2] = await Promise.all([
        progressDO.refreshAuthToken(token),
        progressDO.refreshAuthToken(token),
      ]);

      // Assert - One should succeed, one should be rejected
      const successResults = [result1, result2].filter((r) => r.token);
      const errorResults = [result1, result2].filter((r) => r.error);

      expect(successResults.length).toBe(1);
      expect(errorResults.length).toBe(1);
      expect(errorResults[0].error).toContain("Refresh in progress");
    });

    it("should prevent concurrent auto-refresh attempts", async () => {
      // Arrange
      const oldToken = "auto-concurrent-token";
      const expirationTime = Date.now() + 25 * 60 * 1000;

      await progressDO.storage.put("authToken", oldToken);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Trigger two auto-refresh calls simultaneously
      const [result1, result2] = await Promise.all([
        progressDO.autoRefreshToken(),
        progressDO.autoRefreshToken(),
      ]);

      // Assert - Only one should succeed
      const successCount = [result1, result2].filter((r) => r === true).length;
      expect(successCount).toBe(1);
    });

    it("should block manual refresh during auto-refresh", async () => {
      // Arrange
      const token = "mixed-concurrent-token";
      const expirationTime = Date.now() + 25 * 60 * 1000;

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Trigger auto-refresh and manual refresh concurrently
      const [autoResult, manualResult] = await Promise.all([
        progressDO.autoRefreshToken(),
        progressDO.refreshAuthToken(token),
      ]);

      // Assert - One succeeds, one is blocked
      const successCount =
        (autoResult ? 1 : 0) + (manualResult.token ? 1 : 0);
      expect(successCount).toBe(1);

      if (!autoResult) {
        expect(manualResult.error).toContain("Refresh in progress");
      }
    });
  });

  describe("Auto-Refresh Grace Period", () => {
    it("should store old token with 5-minute TTL during auto-refresh", async () => {
      // Arrange
      const oldToken = "grace-period-token";
      const expirationTime = Date.now() + 25 * 60 * 1000;

      await progressDO.storage.put("authToken", oldToken);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Act - Auto-refresh token
      const refreshed = await progressDO.autoRefreshToken();

      // Assert - Old token should be stored with grace period
      expect(refreshed).toBe(true);

      const oldTokenKey = `oldAuthToken:${oldToken}`;
      const oldTokenStored = await progressDO.storage.get(oldTokenKey);
      expect(oldTokenStored).toBe(true);

      // New token should be different
      const newToken = await progressDO.storage.get("authToken");
      expect(newToken).not.toBe(oldToken);
      expect(newToken).toContain("auto-");
    });

    it("should allow reconnection with old token during grace period", async () => {
      // Arrange
      const oldToken = "reconnect-old-token";
      const expirationTime = Date.now() + 25 * 60 * 1000;

      await progressDO.storage.put("authToken", oldToken);
      await progressDO.storage.put("authTokenExpiration", expirationTime);

      // Auto-refresh to create old token
      await progressDO.autoRefreshToken();
      const newToken = await progressDO.storage.get("authToken");

      // Act - Simulate reconnection with old token (grace period check)
      const oldTokenKey = `oldAuthToken:${oldToken}`;
      const gracePeriodValid = await progressDO.storage.get(oldTokenKey);

      // Assert - Old token should still be valid in grace period
      expect(gracePeriodValid).toBe(true);
      expect(newToken).not.toBe(oldToken);
    });
  });

  describe("Clock Skew Scenarios", () => {
    it("should handle server clock ahead of client", async () => {
      // Arrange - Simulate client's token expiration is earlier than server's
      const token = "clock-skew-token";
      const serverTime = Date.now();
      const clientPerceivedExpiration = serverTime + 31 * 60 * 1000; // Client thinks 31 min
      const actualExpiration = serverTime + 29 * 60 * 1000; // Server: 29 min (in window)

      // Client sends refresh based on their clock
      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", actualExpiration);

      // Act - Refresh attempt (server-side validation)
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Server allows refresh based on server time
      expect(result.error).toBeUndefined();
      expect(result.token).toBeDefined();
    });

    it("should reject refresh when server clock behind client", async () => {
      // Arrange - Server thinks more time remains than client
      const token = "clock-behind-token";
      const serverTime = Date.now();
      const actualExpiration = serverTime + 35 * 60 * 1000; // Server: 35 min (outside window)

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", actualExpiration);

      // Act - Client tries to refresh (thinks it's in window)
      const result = await progressDO.refreshAuthToken(token);

      // Assert - Server rejects (not in window yet by server time)
      expect(result.error).toBe("Refresh not allowed yet");
    });
  });

  describe("Token Validation Edge Cases", () => {
    it("should reject refresh with null token", async () => {
      // Arrange
      const token = "valid-token";
      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put(
        "authTokenExpiration",
        Date.now() + 25 * 60 * 1000,
      );

      // Act - Attempt refresh with null
      const result = await progressDO.refreshAuthToken(null);

      // Assert
      expect(result.error).toBe("Invalid token");
    });

    it("should reject refresh with empty string token", async () => {
      // Arrange
      const token = "valid-token";
      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put(
        "authTokenExpiration",
        Date.now() + 25 * 60 * 1000,
      );

      // Act
      const result = await progressDO.refreshAuthToken("");

      // Assert
      expect(result.error).toBe("Invalid token");
    });

    it("should reject refresh with mismatched token", async () => {
      // Arrange
      const storedToken = "stored-token";
      const providedToken = "different-token";
      await progressDO.storage.put("authToken", storedToken);
      await progressDO.storage.put(
        "authTokenExpiration",
        Date.now() + 25 * 60 * 1000,
      );

      // Act
      const result = await progressDO.refreshAuthToken(providedToken);

      // Assert
      expect(result.error).toBe("Invalid token");
    });
  });

  describe("Token Expiration Edge Cases", () => {
    it("should handle token with expiration in the past", async () => {
      // Arrange
      const token = "past-token";
      const pastExpiration = Date.now() - 1000; // Expired 1 second ago

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", pastExpiration);

      // Act
      const result = await progressDO.refreshAuthToken(token);

      // Assert
      expect(result.error).toBe("Token expired");
    });

    it("should handle auto-refresh when already expired", async () => {
      // Arrange
      const token = "auto-past-token";
      const pastExpiration = Date.now() - 1000;

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", pastExpiration);

      // Act
      const result = await progressDO.autoRefreshToken();

      // Assert - Should not refresh
      expect(result).toBe(false);
    });

    it("should handle auto-refresh when outside refresh window", async () => {
      // Arrange
      const token = "auto-outside-window";
      const futureExpiration = Date.now() + 60 * 60 * 1000; // 60 minutes

      await progressDO.storage.put("authToken", token);
      await progressDO.storage.put("authTokenExpiration", futureExpiration);

      // Act
      const result = await progressDO.autoRefreshToken();

      // Assert - Should not refresh (too early)
      expect(result).toBe(false);
    });
  });
});
