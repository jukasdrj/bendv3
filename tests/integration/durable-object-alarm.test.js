/**
 * Integration Tests: Durable Object Alarm Handlers
 *
 * Tests that verify the Durable Object alarm handlers have proper access
 * to environment bindings (CACHE, GEMINI_API_KEY, etc.).
 *
 * This test caught a critical bug where this.env was not stored in the
 * constructor, causing KV writes to fail silently during alarm execution.
 *
 * Priority: P0 (Critical - prevents data loss)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProgressWebSocketDO } from "../../src/durable-objects/progress-socket.js";

// Mock dependencies
vi.mock("../../src/providers/gemini-csv-provider.ts", () => ({
  parseCSVWithGemini: vi.fn(async () => [
    { title: "Test Book", author: "Test Author", isbn: "1234567890" },
  ]),
}));

vi.mock("../../src/utils/csv-validator.js", () => ({
  validateCSV: vi.fn(() => ({ valid: true })),
}));

vi.mock("../../src/prompts/csv-parser-prompt.js", () => ({
  buildCSVParserPrompt: () => "Mock CSV parser prompt",
  PROMPT_VERSION: "v1.0.0-test",
}));

vi.mock("../../src/utils/cache-keys.js", () => ({
  generateCSVCacheKey: async () => "mock-cache-key",
}));

describe("Durable Object Alarm - Environment Bindings", () => {
  let mockState;
  let mockEnv;
  let doInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Durable Object storage
    const storageData = new Map();

    mockState = {
      id: {
        toString: () => "test-do-id",
        equals: vi.fn(),
        name: "test-do-name",
      },
      storage: {
        get: vi.fn((key) => {
          const value = storageData.get(key);
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
        delete: vi.fn((keys) => {
          if (Array.isArray(keys)) {
            keys.forEach((k) => storageData.delete(k));
          } else {
            storageData.delete(keys);
          }
          return Promise.resolve();
        }),
        list: vi.fn(() =>
          Promise.resolve({
            keys: new Map(),
            size: 0,
          }),
        ),
      },
      blockConcurrencyWhile: vi.fn(async (fn) => fn()),
      waitUntil: vi.fn(),
    };

    // Mock environment with CACHE
    mockEnv = {
      CACHE: {
        get: vi.fn(async () => null), // Cache miss
        put: vi.fn(async () => {}),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      },
      GEMINI_API_KEY: "test-api-key",
    };

    // Create actual DO instance
    doInstance = new ProgressWebSocketDO(mockState, mockEnv);
  });

  describe("Constructor Environment Binding", () => {
    it("should store env in constructor for alarm access", () => {
      // CRITICAL: Verify this.env is set in constructor
      expect(doInstance.env).toBeDefined();
      expect(doInstance.env).toBe(mockEnv);
      expect(doInstance.env.CACHE).toBeDefined();
      expect(doInstance.env.GEMINI_API_KEY).toBe("test-api-key");
    });

    it("should have access to CACHE binding", () => {
      expect(doInstance.env.CACHE).toBeDefined();
      expect(doInstance.env.CACHE.get).toBeDefined();
      expect(doInstance.env.CACHE.put).toBeDefined();
    });

    it("should have access to GEMINI_API_KEY binding", () => {
      expect(doInstance.env.GEMINI_API_KEY).toBeDefined();
      expect(typeof doInstance.env.GEMINI_API_KEY).toBe("string");
    });
  });

  describe("CSV Import Alarm Handler", () => {
    it("should have access to env bindings during alarm execution", async () => {
      // Set up CSV import job state
      await mockState.storage.put("csvData", "title,author\nTest,Author");
      await mockState.storage.put("jobId", "test-job-123");
      await mockState.storage.put("jobType", "csv-import");

      // Simulate WebSocket ready state
      doInstance.isReady = true;
      doInstance.webSocket = {
        readyState: 1, // OPEN
        send: vi.fn(),
        close: vi.fn(),
      };

      // Execute alarm handler (this is where the bug would manifest)
      await doInstance.processCSVImportAlarm();

      // CRITICAL: Verify CACHE.put was called (this would fail if this.env is undefined)
      expect(mockEnv.CACHE.put).toHaveBeenCalled();

      // Verify results were stored with correct key format
      const kvPutCalls = mockEnv.CACHE.put.mock.calls;
      const resultsPut = kvPutCalls.find((call) =>
        call[0].startsWith("csv-results:"),
      );

      expect(resultsPut).toBeDefined();
      expect(resultsPut[0]).toBe("csv-results:test-job-123");

      // Verify stored data structure
      const storedData = JSON.parse(resultsPut[1]);
      expect(storedData.books).toBeDefined();
      expect(Array.isArray(storedData.books)).toBe(true);
      expect(storedData.errors).toBeDefined();

      // Verify TTL (1 hour for csv-import handler)
      expect(resultsPut[2]).toEqual({ expirationTtl: 3600 });
    });

    it("should pass env to processCSVImportCore", async () => {
      await mockState.storage.put("csvData", "title,author\nTest,Author");
      await mockState.storage.put("jobId", "test-job-456");
      await mockState.storage.put("jobType", "csv-import");

      doInstance.isReady = true;
      doInstance.webSocket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };

      await doInstance.processCSVImportAlarm();

      // Verify Gemini API was called with correct API key from env
      const { parseCSVWithGemini } = await import(
        "../../src/providers/gemini-csv-provider.ts"
      );
      expect(parseCSVWithGemini).toHaveBeenCalledWith(
        expect.any(String), // CSV text
        expect.any(String), // Prompt
        "test-api-key", // API key from env
      );
    });
  });

  describe("Bookshelf Scan Alarm Handler", () => {
    it("should have access to env bindings for bookshelf scan", async () => {
      // Set up bookshelf scan job state
      await mockState.storage.put("scanImages", [
        { url: "https://example.com/image.jpg" },
      ]);
      await mockState.storage.put("jobId", "scan-job-789");
      await mockState.storage.put("jobType", "bookshelf-scan");

      doInstance.isReady = true;
      doInstance.webSocket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };

      // This test verifies env is accessible, even if bookshelf scan fails
      // (We're not mocking the full AI scanner service here)
      expect(doInstance.env).toBeDefined();
      expect(doInstance.env.GEMINI_API_KEY).toBe("test-api-key");
    });
  });

  describe("Regression Test: Missing env Bug", () => {
    it("should NOT throw TypeError when accessing env.CACHE in alarm", async () => {
      // This test specifically validates the bug fix where this.env was missing

      await mockState.storage.put("csvData", "title,author\nBook,Author");
      await mockState.storage.put("jobId", "regression-test-job");
      await mockState.storage.put("jobType", "csv-import");

      doInstance.isReady = true;
      doInstance.webSocket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };

      // Before fix: This would throw "Cannot read property 'CACHE' of undefined"
      // After fix: This should complete successfully
      await expect(
        doInstance.processCSVImportAlarm(),
      ).resolves.not.toThrow();

      // Verify KV write succeeded
      expect(mockEnv.CACHE.put).toHaveBeenCalled();
    });
  });
});
