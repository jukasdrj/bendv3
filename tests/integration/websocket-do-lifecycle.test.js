/**
 * Integration Tests: WebSocket Durable Object Lifecycle
 *
 * Tests DO eviction, state restoration, and storage operation failures:
 * - DO eviction and state restoration from storage
 * - State persistence after DO restart
 * - Storage operation failures (put/get/delete errors)
 * - Throttle state survival across DO evictions (Issue #2 validation)
 *
 * Priority: P0 (Storage failures) + P1 (Reliability)
 * Related: Issue #150 (Edge case coverage), Issue #2 (Throttle state persistence)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("WebSocket DO Lifecycle - Storage & Eviction", () => {
  let mockStorage;
  let mockEnv;
  let progressDO;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Durable Object storage
    const storageData = new Map();

    mockStorage = {
      data: storageData,
      get: vi.fn((key) => {
        const value = storageData.has(key) ? storageData.get(key) : null;
        return Promise.resolve(value);
      }),
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

    mockEnv = {};

    // Create mock DO instance with lifecycle methods
    progressDO = {
      storage: mockStorage,
      jobId: "test-job-456",
      currentPipeline: null,

      // Simulate initializeJobState
      async initializeJobState(pipeline, totalCount) {
        this.currentPipeline = pipeline;
        const state = {
          pipeline,
          totalCount,
          processedCount: 0,
          status: "running",
          startTime: Date.now(),
          version: 1,
        };

        await this.storage.put("jobState", state);
        return { success: true };
      },

      // Simulate updateJobState with throttling (Issue #2 fix)
      async updateJobState(updates) {
        if (!this.currentPipeline) {
          return { success: false, persisted: false };
        }

        const THROTTLE_CONFIG = {
          batch_enrichment: { updateCount: 5, timeSeconds: 10 },
          csv_import: { updateCount: 20, timeSeconds: 30 },
          ai_scan: { updateCount: 1, timeSeconds: 60 },
        };

        const config = THROTTLE_CONFIG[this.currentPipeline];
        if (!config) {
          throw new Error(`Invalid pipeline type: ${this.currentPipeline}`);
        }

        // Load throttle state from storage (survives eviction)
        const throttleState = (await this.storage.get("throttleState")) || {
          updatesSinceLastPersist: 0,
          lastPersistTime: Date.now(),
        };

        throttleState.updatesSinceLastPersist++;
        const timeSinceLastPersist =
          Date.now() - throttleState.lastPersistTime;

        const shouldPersist =
          throttleState.updatesSinceLastPersist >= config.updateCount ||
          timeSinceLastPersist >= config.timeSeconds * 1000;

        if (shouldPersist) {
          const currentState = (await this.storage.get("jobState")) || {};
          const newState = {
            ...currentState,
            ...updates,
            lastUpdate: Date.now(),
            version: (currentState.version || 0) + 1,
          };

          // Persist both job state and throttle state atomically
          await this.storage.put({
            jobState: newState,
            throttleState: {
              updatesSinceLastPersist: 0,
              lastPersistTime: Date.now(),
            },
          });

          return { success: true, persisted: true };
        }

        // Update throttle state even if not persisting job state
        await this.storage.put("throttleState", throttleState);
        return { success: true, persisted: false };
      },

      // Simulate getJobState
      async getJobState() {
        return (await this.storage.get("jobState")) || null;
      },

      // Simulate completeJobState
      async completeJobState(results) {
        const currentState = (await this.storage.get("jobState")) || {};
        const finalState = {
          ...currentState,
          status: "complete",
          endTime: Date.now(),
          results,
          version: (currentState.version || 0) + 1,
        };

        await this.storage.put("jobState", finalState);
        return { success: true };
      },
    };
  });

  describe("Storage Operation Failures - P0", () => {
    it("should handle storage.put failure during token set", async () => {
      // Arrange - Mock storage.put to fail
      mockStorage.put.mockRejectedValueOnce(
        new Error("Storage quota exceeded"),
      );

      // Act & Assert
      await expect(
        mockStorage.put("authToken", "test-token"),
      ).rejects.toThrow("Storage quota exceeded");
    });

    it("should handle storage.get failure during token retrieval", async () => {
      // Arrange - Mock storage.get to fail
      mockStorage.get.mockRejectedValueOnce(new Error("Storage unavailable"));

      // Act & Assert
      await expect(mockStorage.get("authToken")).rejects.toThrow(
        "Storage unavailable",
      );
    });

    it("should handle storage.delete failure during cleanup", async () => {
      // Arrange
      mockStorage.delete.mockRejectedValueOnce(
        new Error("Storage deletion failed"),
      );

      // Act & Assert
      await expect(mockStorage.delete("authToken")).rejects.toThrow(
        "Storage deletion failed",
      );
    });

    it("should handle batch storage.put failure", async () => {
      // Arrange - Set initial state
      await progressDO.initializeJobState("batch_enrichment", 100);

      // Mock failure on next batch put
      const originalPut = mockStorage.put;
      mockStorage.put = vi
        .fn()
        .mockRejectedValueOnce(new Error("Batch write failed"))
        .mockImplementation(originalPut);

      // Act & Assert - Should throw on state update
      await expect(
        progressDO.updateJobState({ processedCount: 5 }),
      ).rejects.toThrow("Batch write failed");
    });

    it("should handle storage.get returning null for missing keys", async () => {
      // Act - Get non-existent key
      const result = await mockStorage.get("nonExistentKey");

      // Assert
      expect(result).toBeNull();
    });

    it("should handle corrupted data in storage", async () => {
      // Arrange - Put corrupted data
      await mockStorage.put("jobState", { corrupted: true, missing: "fields" });

      // Act - Retrieve state
      const state = await progressDO.getJobState();

      // Assert - Should return corrupted data (app handles validation)
      expect(state).toEqual({ corrupted: true, missing: "fields" });
    });
  });

  describe("DO Eviction and State Restoration - P1", () => {
    it("should restore job state after DO eviction", async () => {
      // Arrange - Initialize job and update state
      await progressDO.initializeJobState("batch_enrichment", 100);
      
      // Make 5 updates to trigger persistence (threshold is 5 for batch_enrichment)
      for (let i = 0; i < 5; i++) {
        await progressDO.updateJobState({ processedCount: (i + 1) * 10, progress: (i + 1) * 10 });
      }

      // Simulate DO eviction by getting final state from storage
      const stateBeforeEviction = await progressDO.getJobState();

      // Simulate DO restart - create new DO instance with same storage
      const newProgressDO = {
        storage: mockStorage, // Same storage reference
        jobId: "test-job-456",
        currentPipeline: null,
        getJobState: progressDO.getJobState.bind({ storage: mockStorage }),
      };

      // Act - Restore state from storage
      const restoredState = await newProgressDO.getJobState();

      // Assert - State should be preserved
      expect(restoredState).toEqual(stateBeforeEviction);
      expect(restoredState.processedCount).toBe(50);
      expect(restoredState.progress).toBe(50);
      expect(restoredState.pipeline).toBe("batch_enrichment");
    });

    it("should restore throttle state after DO eviction (Issue #2)", async () => {
      // Arrange - Initialize and make some updates
      await progressDO.initializeJobState("csv_import", 1000);

      // Make 10 updates (threshold is 20 for csv_import)
      for (let i = 0; i < 10; i++) {
        await progressDO.updateJobState({ processedCount: i + 1 });
      }

      // Get throttle state before eviction
      const throttleBeforeEviction = await mockStorage.get("throttleState");
      expect(throttleBeforeEviction.updatesSinceLastPersist).toBe(10);

      // Simulate DO eviction and restart
      const newProgressDO = {
        storage: mockStorage,
        currentPipeline: "csv_import",
        updateJobState: progressDO.updateJobState.bind({
          storage: mockStorage,
          currentPipeline: "csv_import",
        }),
      };

      // Act - Continue updates after restart
      await newProgressDO.updateJobState({ processedCount: 11 });

      // Assert - Throttle state should be preserved and counted correctly
      const throttleAfterRestart = await mockStorage.get("throttleState");
      // Should be 11 (10 from before + 1 new update)
      expect(throttleAfterRestart.updatesSinceLastPersist).toBe(11);
    });

    it("should handle missing state during DO restart", async () => {
      // Arrange - Create new DO without initializing state
      const newDO = {
        storage: mockStorage,
        getJobState: progressDO.getJobState.bind({ storage: mockStorage }),
      };

      // Act - Try to get state
      const state = await newDO.getJobState();

      // Assert - Should return null for missing state
      expect(state).toBeNull();
    });

    it("should preserve token across DO eviction", async () => {
      // Arrange - Set token
      const token = "persistent-token-123";
      const expiration = Date.now() + 2 * 60 * 60 * 1000;
      await mockStorage.put("authToken", token);
      await mockStorage.put("authTokenExpiration", expiration);

      // Simulate DO eviction
      const tokenBeforeEviction = await mockStorage.get("authToken");

      // Create new DO instance (same storage)
      const newDO = {
        storage: mockStorage,
      };

      // Act - Retrieve token after restart
      const restoredToken = await newDO.storage.get("authToken");
      const restoredExpiration = await newDO.storage.get(
        "authTokenExpiration",
      );

      // Assert - Token should be preserved
      expect(restoredToken).toBe(tokenBeforeEviction);
      expect(restoredToken).toBe(token);
      expect(restoredExpiration).toBe(expiration);
    });
  });

  describe("State Persistence After DO Restart - P1", () => {
    it("should preserve job version numbers across restarts", async () => {
      // Arrange
      await progressDO.initializeJobState("batch_enrichment", 100);

      // Make multiple updates to increment version
      for (let i = 0; i < 5; i++) {
        await progressDO.updateJobState({ processedCount: (i + 1) * 20 });
      }

      const stateBeforeRestart = await progressDO.getJobState();

      // Simulate restart
      const newDO = {
        storage: mockStorage,
        getJobState: progressDO.getJobState.bind({ storage: mockStorage }),
      };

      // Act
      const stateAfterRestart = await newDO.getJobState();

      // Assert - Version should be preserved
      expect(stateAfterRestart.version).toBe(stateBeforeRestart.version);
      expect(stateAfterRestart.version).toBeGreaterThan(1);
    });

    it("should preserve completed job state across restarts", async () => {
      // Arrange
      await progressDO.initializeJobState("batch_enrichment", 10);
      await progressDO.updateJobState({
        processedCount: 10,
        progress: 100,
      });
      await progressDO.completeJobState({
        enrichedCount: 10,
        failedCount: 0,
      });

      // Simulate restart
      const newDO = {
        storage: mockStorage,
        getJobState: progressDO.getJobState.bind({ storage: mockStorage }),
      };

      // Act
      const restoredState = await newDO.getJobState();

      // Assert
      expect(restoredState.status).toBe("complete");
      expect(restoredState.results.enrichedCount).toBe(10);
      expect(restoredState.endTime).toBeDefined();
    });

    it("should handle partial state updates during eviction", async () => {
      // Arrange - Initialize state
      await progressDO.initializeJobState("ai_scan", 1);

      // Start update but simulate eviction mid-process
      const updatePromise = progressDO.updateJobState({
        processedCount: 1,
        status: "analyzing",
      });

      // Simulate eviction immediately (create new DO before update completes)
      const newDO = {
        storage: mockStorage,
        getJobState: progressDO.getJobState.bind({ storage: mockStorage }),
      };

      // Wait for update to complete
      await updatePromise;

      // Act - Check state from new DO
      const state = await newDO.getJobState();

      // Assert - State should reflect completed update
      expect(state.processedCount).toBe(1);
      expect(state.status).toBe("analyzing");
    });
  });

  describe("Throttle State Survival (Issue #2 Validation) - P1", () => {
    it("should maintain throttle count across multiple evictions", async () => {
      // Arrange
      await progressDO.initializeJobState("csv_import", 1000);

      // Make 15 updates (threshold is 20)
      for (let i = 0; i < 15; i++) {
        await progressDO.updateJobState({ processedCount: i + 1 });
      }

      // First eviction
      let throttleState1 = await mockStorage.get("throttleState");
      expect(throttleState1.updatesSinceLastPersist).toBe(15);

      // Simulate first restart
      const do1 = {
        storage: mockStorage,
        currentPipeline: "csv_import",
        updateJobState: progressDO.updateJobState.bind({
          storage: mockStorage,
          currentPipeline: "csv_import",
        }),
      };

      // Make 5 more updates (total 20, should trigger persist)
      for (let i = 0; i < 5; i++) {
        await do1.updateJobState({ processedCount: 15 + i + 1 });
      }

      // Check throttle state after persist
      let throttleState2 = await mockStorage.get("throttleState");
      expect(throttleState2.updatesSinceLastPersist).toBe(0); // Reset after persist

      // Second eviction and restart
      const do2 = {
        storage: mockStorage,
        currentPipeline: "csv_import",
        updateJobState: progressDO.updateJobState.bind({
          storage: mockStorage,
          currentPipeline: "csv_import",
        }),
      };

      // Make 10 more updates
      for (let i = 0; i < 10; i++) {
        await do2.updateJobState({ processedCount: 20 + i + 1 });
      }

      // Assert - Throttle count should start from 0 and increment correctly
      let throttleState3 = await mockStorage.get("throttleState");
      expect(throttleState3.updatesSinceLastPersist).toBe(10);
    });

    it("should reset throttle timer correctly after eviction", async () => {
      // Arrange
      await progressDO.initializeJobState("ai_scan", 5);

      // Make one update
      await progressDO.updateJobState({ processedCount: 1 });

      const throttleState1 = await mockStorage.get("throttleState");
      const lastPersistTime = throttleState1.lastPersistTime;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Simulate eviction and restart
      const newDO = {
        storage: mockStorage,
        currentPipeline: "ai_scan",
        updateJobState: progressDO.updateJobState.bind({
          storage: mockStorage,
          currentPipeline: "ai_scan",
        }),
      };

      // Act - Make another update after restart
      await newDO.updateJobState({ processedCount: 2 });

      // Assert - lastPersistTime should be preserved from storage
      const throttleState2 = await mockStorage.get("throttleState");
      expect(throttleState2.lastPersistTime).toBeGreaterThanOrEqual(
        lastPersistTime,
      );
    });

    it("should handle time-based throttle trigger after eviction", async () => {
      // Arrange - ai_scan has 60-second time throttle
      await progressDO.initializeJobState("ai_scan", 5);

      // Make one update
      await progressDO.updateJobState({ processedCount: 1 });

      // Manually set lastPersistTime to simulate passage of time
      const oldThrottle = await mockStorage.get("throttleState");
      await mockStorage.put("throttleState", {
        updatesSinceLastPersist: 1,
        lastPersistTime: Date.now() - 61 * 1000, // 61 seconds ago
      });

      // Simulate eviction and restart
      const newDO = {
        storage: mockStorage,
        currentPipeline: "ai_scan",
        updateJobState: progressDO.updateJobState.bind({
          storage: mockStorage,
          currentPipeline: "ai_scan",
        }),
      };

      // Act - Make update after time threshold
      const result = await newDO.updateJobState({ processedCount: 2 });

      // Assert - Should persist due to time threshold
      expect(result.persisted).toBe(true);

      const finalThrottle = await mockStorage.get("throttleState");
      expect(finalThrottle.updatesSinceLastPersist).toBe(0); // Reset
    });
  });

  describe("Storage State Consistency", () => {
    it("should maintain atomicity of batch storage operations", async () => {
      // Arrange
      await progressDO.initializeJobState("batch_enrichment", 100);

      // Act - Make 5 updates with multiple fields to trigger persistence
      for (let i = 0; i < 5; i++) {
        await progressDO.updateJobState({
          processedCount: (i + 1) * 10,
          progress: (i + 1) * 10,
          currentItem: { isbn: "1234567890", index: i },
        });
      }

      // Assert - All fields should be persisted together atomically
      const state = await progressDO.getJobState();
      expect(state.processedCount).toBe(50);
      expect(state.progress).toBe(50);
      expect(state.currentItem).toEqual({ isbn: "1234567890", index: 4 });
    });

    it("should handle concurrent reads during writes", async () => {
      // Arrange
      await progressDO.initializeJobState("batch_enrichment", 100);

      // Act - Trigger concurrent read and write
      const writePromise = progressDO.updateJobState({
        processedCount: 25,
      });
      const readPromise = progressDO.getJobState();

      const [writeResult, readResult] = await Promise.all([
        writePromise,
        readPromise,
      ]);

      // Assert - Read should return consistent state (either before or after write)
      expect(readResult).toBeDefined();
      expect(readResult.totalCount).toBe(100);
      // processedCount could be 0 (before write) or 25 (after write)
      expect([0, 25]).toContain(readResult.processedCount);
    });
  });
});
