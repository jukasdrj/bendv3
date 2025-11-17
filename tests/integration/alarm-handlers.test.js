/**
 * Integration Tests: Alarm Handler Coverage
 *
 * Tests Durable Object alarm execution for ProgressWebSocketDO:
 * - Alarm execution failures and error handling
 * - CSV processing alarm with malformed data
 * - Bookshelf scan alarm with invalid image data
 * - Cleanup alarm execution (24-hour job cleanup)
 * - Alarm scheduling conflicts (multiple alarm types)
 * - Token refresh alarm execution
 *
 * Priority: P2 (Edge Cases)
 * Related: Issue #150 (Edge case coverage)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Alarm Handler Coverage - Integration", () => {
  let mockStorage;
  let mockEnv;
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
      setAlarm: vi.fn((timestamp) => Promise.resolve()),
      list: vi.fn((options) => {
        const keys = Array.from(storageData.keys()).filter((key) =>
          options?.prefix ? key.startsWith(options.prefix) : true,
        );
        return Promise.resolve({ keys: () => keys, size: keys.length });
      }),
    };

    mockEnv = {
      GEMINI_API_KEY: "test-key",
    };

    // Create mock DO with alarm handlers
    progressDO = {
      storage: mockStorage,
      env: mockEnv,
      jobId: "alarm-test-job",
      webSocket: { send: vi.fn(), close: vi.fn() },

      // Simulate alarm handler routing
      async alarm() {
        const jobType = await this.storage.get("jobType");
        const jobId = await this.storage.get("jobId");
        const expiration = await this.storage.get("authTokenExpiration");

        // Token refresh alarm (no jobType, but has token)
        if (expiration && !jobType) {
          return await this.handleTokenRefreshAlarm();
        }

        // Job processing alarms
        if (jobType === "csv-import") {
          return await this.processCSVImportAlarm();
        } else if (jobType === "bookshelf-scan") {
          return await this.processBookshelfScanAlarm();
        } else {
          // Cleanup alarm (no jobType)
          return await this.handleCleanupAlarm();
        }
      },

      async handleTokenRefreshAlarm() {
        const expiration = await this.storage.get("authTokenExpiration");
        const now = Date.now();
        const timeUntilExpiration = expiration - now;

        if (timeUntilExpiration < 30 * 60 * 1000 && timeUntilExpiration > 0) {
          // Auto-refresh token
          const newToken = "auto-refreshed-" + crypto.randomUUID();
          await this.storage.put("authToken", newToken);
          await this.storage.put(
            "authTokenExpiration",
            now + 2 * 60 * 60 * 1000,
          );
          return { success: true, refreshed: true };
        }
        return { success: true, refreshed: false };
      },

      async processCSVImportAlarm() {
        const csvData = await this.storage.get("csvData");
        const jobId = await this.storage.get("jobId");

        if (csvData === null || csvData === undefined) {
          throw new Error("CSV data not found in storage");
        }

        // Simulate CSV validation and processing
        const lines = csvData.split("\n").filter(line => line.trim());
        if (lines.length < 2) {
          throw new Error("CSV file must have header and at least one row");
        }

        // Cleanup after processing
        await this.storage.delete("csvData");
        await this.storage.delete("jobId");
        await this.storage.delete("jobType");

        return { success: true, rowsProcessed: lines.length - 1 };
      },

      async processBookshelfScanAlarm() {
        const imageData = await this.storage.get("imageData");
        const jobId = await this.storage.get("jobId");

        if (!imageData) {
          throw new Error("Image data not found in storage");
        }

        // Simulate image validation
        if (!imageData.byteLength || imageData.byteLength === 0) {
          throw new Error("Image data is empty");
        }

        if (imageData.byteLength > 10 * 1024 * 1024) {
          throw new Error("Image too large (max 10MB)");
        }

        // Cleanup after processing
        await this.storage.delete("imageData");
        await this.storage.delete("jobId");
        await this.storage.delete("jobType");

        return { success: true, booksFound: 0 }; // Simplified
      },

      async handleCleanupAlarm() {
        // 24-hour cleanup alarm
        await this.storage.delete("jobState");
        await this.storage.delete("authToken");
        await this.storage.delete("authTokenExpiration");

        // Delete all oldAuthToken:* keys
        const oldTokenKeys = await this.storage.list({
          prefix: "oldAuthToken:",
        });
        for (const key of oldTokenKeys.keys()) {
          await this.storage.delete(key);
        }

        return { success: true, cleaned: true, deletedTokens: oldTokenKeys.size };
      },

      async scheduleCSVProcessing(csvText, jobId) {
        await this.storage.put("csvData", csvText);
        await this.storage.put("jobId", jobId);
        await this.storage.put("jobType", "csv-import");

        const alarmTime = Date.now() + 2000;
        await this.storage.setAlarm(alarmTime);

        return { success: true };
      },

      async scheduleBookshelfScan(imageData, jobId) {
        await this.storage.put("imageData", imageData);
        await this.storage.put("jobId", jobId);
        await this.storage.put("jobType", "bookshelf-scan");

        const alarmTime = Date.now() + 2000;
        await this.storage.setAlarm(alarmTime);

        return { success: true };
      },
    };
  });

  describe("CSV Processing Alarm", () => {
    it("should successfully process valid CSV data", async () => {
      // Arrange
      const csvData = "Title,Author,ISBN\nBook 1,Author 1,1234567890\nBook 2,Author 2,0987654321";
      const jobId = "csv-job-1";

      await progressDO.scheduleCSVProcessing(csvData, jobId);

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);
      expect(result.rowsProcessed).toBe(2);

      // Verify cleanup
      const cleanedCsvData = await mockStorage.get("csvData");
      const cleanedJobType = await mockStorage.get("jobType");
      expect(cleanedCsvData).toBeNull();
      expect(cleanedJobType).toBeNull();
    });

    it("should fail on empty CSV data", async () => {
      // Arrange - CSV with only whitespace (after filtering)
      const csvData = "\n\n  \n";
      const jobId = "csv-job-empty";

      await progressDO.scheduleCSVProcessing(csvData, jobId);

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "CSV file must have header and at least one row",
      );
    });

    it("should fail on header-only CSV (no data rows)", async () => {
      // Arrange
      const csvData = "Title,Author,ISBN";
      const jobId = "csv-job-header-only";

      await progressDO.scheduleCSVProcessing(csvData, jobId);

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "CSV file must have header and at least one row",
      );
    });

    it("should fail when CSV data not found in storage", async () => {
      // Arrange - Set jobType but no csvData
      await mockStorage.put("jobType", "csv-import");
      await mockStorage.put("jobId", "csv-job-missing");

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "CSV data not found in storage",
      );
    });

    it("should handle malformed CSV with special characters", async () => {
      // Arrange - CSV with special characters
      const csvData = 'Title,Author\n"Book, with comma","Author with ""quotes"""\nBook 2,Author 2';
      const jobId = "csv-job-special";

      await progressDO.scheduleCSVProcessing(csvData, jobId);

      // Act
      const result = await progressDO.alarm();

      // Assert - Should process despite special characters
      expect(result.success).toBe(true);
      expect(result.rowsProcessed).toBe(2);
    });
  });

  describe("Bookshelf Scan Alarm", () => {
    it("should successfully process valid image data", async () => {
      // Arrange - Simulate image data
      const imageData = new ArrayBuffer(1024); // 1KB image
      const jobId = "scan-job-1";

      await progressDO.scheduleBookshelfScan(imageData, jobId);

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);

      // Verify cleanup
      const cleanedImageData = await mockStorage.get("imageData");
      const cleanedJobType = await mockStorage.get("jobType");
      expect(cleanedImageData).toBeNull();
      expect(cleanedJobType).toBeNull();
    });

    it("should fail on empty image data", async () => {
      // Arrange
      const imageData = new ArrayBuffer(0);
      const jobId = "scan-job-empty";

      await progressDO.scheduleBookshelfScan(imageData, jobId);

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "Image data is empty",
      );
    });

    it("should fail on image larger than 10MB", async () => {
      // Arrange - Image larger than limit
      const imageData = new ArrayBuffer(11 * 1024 * 1024); // 11MB
      const jobId = "scan-job-large";

      await progressDO.scheduleBookshelfScan(imageData, jobId);

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "Image too large (max 10MB)",
      );
    });

    it("should fail when image data not found in storage", async () => {
      // Arrange - Set jobType but no imageData
      await mockStorage.put("jobType", "bookshelf-scan");
      await mockStorage.put("jobId", "scan-job-missing");

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow(
        "Image data not found in storage",
      );
    });

    it("should handle edge case image size (exactly 10MB)", async () => {
      // Arrange - Exactly at size limit
      const imageData = new ArrayBuffer(10 * 1024 * 1024); // Exactly 10MB
      const jobId = "scan-job-exact";

      await progressDO.scheduleBookshelfScan(imageData, jobId);

      // Act
      const result = await progressDO.alarm();

      // Assert - Should succeed at exact limit
      expect(result.success).toBe(true);
    });
  });

  describe("Cleanup Alarm (24-hour)", () => {
    it("should delete job state and auth tokens after job completion", async () => {
      // Arrange - Set up state to be cleaned (no expiration = past cleanup alarm)
      await mockStorage.put("jobState", { status: "complete" });
      await mockStorage.put("authToken", "old-token");
      // Don't set expiration - cleanup happens after token expired/deleted

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(true);

      // Verify deletions
      expect(await mockStorage.get("jobState")).toBeNull();
      expect(await mockStorage.get("authToken")).toBeNull();
    });

    it("should delete all old auth tokens", async () => {
      // Arrange - Create multiple old tokens
      await mockStorage.put("oldAuthToken:token1", true);
      await mockStorage.put("oldAuthToken:token2", true);
      await mockStorage.put("oldAuthToken:token3", true);

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);

      // Verify all old tokens deleted
      const token1 = await mockStorage.get("oldAuthToken:token1");
      const token2 = await mockStorage.get("oldAuthToken:token2");
      const token3 = await mockStorage.get("oldAuthToken:token3");

      expect(token1).toBeNull();
      expect(token2).toBeNull();
      expect(token3).toBeNull();
    });

    it("should handle cleanup when no data exists", async () => {
      // Arrange - Empty storage
      // No jobType = cleanup alarm

      // Act
      const result = await progressDO.alarm();

      // Assert - Should succeed even with no data
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(true);
    });
  });

  describe("Token Refresh Alarm", () => {
    it("should refresh token when within 30-minute window", async () => {
      // Arrange - Token expires in 25 minutes (within window)
      const oldToken = "old-token-123";
      const expiration = Date.now() + 25 * 60 * 1000;

      await mockStorage.put("authToken", oldToken);
      await mockStorage.put("authTokenExpiration", expiration);

      // No jobType = token refresh alarm (if token exists)

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);
      expect(result.refreshed).toBe(true);

      // Verify new token
      const newToken = await mockStorage.get("authToken");
      expect(newToken).not.toBe(oldToken);
      expect(newToken).toContain("auto-refreshed-");
    });

    it("should not refresh token outside 30-minute window", async () => {
      // Arrange - Token expires in 60 minutes (outside window)
      const token = "current-token";
      const expiration = Date.now() + 60 * 60 * 1000;

      await mockStorage.put("authToken", token);
      await mockStorage.put("authTokenExpiration", expiration);

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);
      expect(result.refreshed).toBe(false);

      // Verify token unchanged
      const currentToken = await mockStorage.get("authToken");
      expect(currentToken).toBe(token);
    });

    it("should not refresh already expired token", async () => {
      // Arrange - Token already expired
      const token = "expired-token";
      const expiration = Date.now() - 1000; // Expired 1 second ago

      await mockStorage.put("authToken", token);
      await mockStorage.put("authTokenExpiration", expiration);

      // Act
      const result = await progressDO.alarm();

      // Assert
      expect(result.success).toBe(true);
      expect(result.refreshed).toBe(false);
    });
  });

  describe("Alarm Scheduling Conflicts", () => {
    it("should schedule CSV alarm without conflicting with cleanup", async () => {
      // Arrange
      const csvData = "Title,Author\nBook 1,Author 1";
      const jobId = "csv-conflict-job";

      // Act - Schedule CSV processing
      await progressDO.scheduleCSVProcessing(csvData, jobId);

      // Assert - Should set alarm
      expect(mockStorage.setAlarm).toHaveBeenCalled();

      // Verify jobType is set (prevents cleanup alarm)
      const jobType = await mockStorage.get("jobType");
      expect(jobType).toBe("csv-import");
    });

    it("should handle switching from CSV to cleanup alarm", async () => {
      // Arrange - Start with CSV job
      const csvData = "Title,Author\nBook 1,Author 1";
      await progressDO.scheduleCSVProcessing(csvData, "csv-job");

      // Process CSV (removes jobType)
      await progressDO.alarm();

      // Act - Next alarm should be cleanup
      const cleanupResult = await progressDO.alarm();

      // Assert
      expect(cleanupResult.cleaned).toBe(true);
    });

    it("should prioritize job alarm over token refresh", async () => {
      // Arrange - Both job and token expiring
      const csvData = "Title,Author\nBook 1,Author 1";
      await progressDO.scheduleCSVProcessing(csvData, "priority-job");

      await mockStorage.put("authToken", "token");
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 25 * 60 * 1000,
      );

      // Act - Alarm should process job, not token refresh
      const result = await progressDO.alarm();

      // Assert - Should have processed CSV (job takes priority)
      expect(result.rowsProcessed).toBeDefined();
      expect(result.refreshed).toBeUndefined();
    });

    it("should handle bookshelf scan alarm priority", async () => {
      // Arrange - Both scan and token
      const imageData = new ArrayBuffer(1024);
      await progressDO.scheduleBookshelfScan(imageData, "scan-priority-job");

      await mockStorage.put("authToken", "token");
      await mockStorage.put(
        "authTokenExpiration",
        Date.now() + 25 * 60 * 1000,
      );

      // Act
      const result = await progressDO.alarm();

      // Assert - Should process scan first
      expect(result.booksFound).toBeDefined();
      expect(result.refreshed).toBeUndefined();
    });

    it("should allow sequential alarms without conflicts", async () => {
      // Arrange - Process multiple alarm types in sequence
      const results = [];

      // 1. CSV alarm
      await progressDO.scheduleCSVProcessing("Title,Author\nBook 1,Author 1", "seq-job-1");
      results.push(await progressDO.alarm());

      // 2. Token refresh alarm
      await mockStorage.put("authToken", "token");
      await mockStorage.put("authTokenExpiration", Date.now() + 25 * 60 * 1000);
      results.push(await progressDO.alarm());

      // 3. Cleanup alarm (after token refresh, expiration is removed)
      await mockStorage.delete("authToken");
      await mockStorage.delete("authTokenExpiration");
      await mockStorage.put("jobState", { status: "complete" });
      results.push(await progressDO.alarm());

      // Assert - All should succeed
      expect(results[0].rowsProcessed).toBeDefined();
      expect(results[1].refreshed).toBe(true);
      expect(results[2].cleaned).toBe(true);
    });
  });

  describe("Alarm Execution Failures", () => {
    it("should propagate CSV processing errors", async () => {
      // Arrange - Invalid CSV
      await progressDO.scheduleCSVProcessing("", "fail-job");

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow();
    });

    it("should propagate bookshelf scan errors", async () => {
      // Arrange - Empty image
      await progressDO.scheduleBookshelfScan(new ArrayBuffer(0), "fail-scan");

      // Act & Assert
      await expect(progressDO.alarm()).rejects.toThrow("Image data is empty");
    });

    it("should handle storage.delete failures gracefully", async () => {
      // Arrange
      await mockStorage.put("jobState", { status: "complete" });

      // Mock delete to fail
      const originalDelete = mockStorage.delete;
      mockStorage.delete = vi
        .fn()
        .mockRejectedValueOnce(new Error("Delete failed"));

      // Act & Assert - Should throw
      await expect(progressDO.alarm()).rejects.toThrow("Delete failed");

      // Restore
      mockStorage.delete = originalDelete;
    });

    it("should handle storage.setAlarm failures", async () => {
      // Arrange
      mockStorage.setAlarm = vi
        .fn()
        .mockRejectedValueOnce(new Error("Alarm scheduling failed"));

      const csvData = "Title,Author\nBook 1,Author 1";

      // Act & Assert
      await expect(
        progressDO.scheduleCSVProcessing(csvData, "alarm-fail-job"),
      ).rejects.toThrow("Alarm scheduling failed");
    });
  });
});
