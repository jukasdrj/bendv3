/**
 * Unit Tests: CSV Processor Service
 *
 * Tests the extracted CSV processing business logic.
 * This service is now independent of Durable Objects.
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 * Related: Issue #217 - Dependency injection for workerd-compatible testing
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Import the service directly - no vi.mock needed with dependency injection
import { processCSVImport } from "../../src/services/csv-processor";

describe("CSV Processor Service", () => {
  let mockProgressReporter;
  let mockEnv;
  let mockDeps;
  const testJobId = "test-job-id";

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock dependencies (Issue #217 - workerd-compatible testing)
    mockDeps = {
      validateCSV: vi.fn().mockReturnValue({ valid: true }),
      parseCSVWithGemini: vi.fn().mockResolvedValue([
        { title: "Test Book", author: "Test Author" },
      ]),
    };

    // Mock progress reporter interface
    mockProgressReporter = {
      waitForReady: vi.fn(async () => ({
        timedOut: false,
        disconnected: false,
      })),
      updateProgress: vi.fn(async () => ({ success: true })),
      complete: vi.fn(async () => ({ success: true })),
      sendError: vi.fn(async () => ({ success: true })),
    };

    // Mock environment
    mockEnv = {
      CACHE: {
        get: vi.fn(async () => null), // Cache miss by default
        put: vi.fn(async () => {}),
      },
      GEMINI_API_KEY: "test-api-key",
    };
  });

  describe("Client Ready Signal", () => {
    it("should wait for client ready before processing", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.waitForReady).toHaveBeenCalledWith(15000);
    });

    it("should continue processing if client ready times out", async () => {
      mockProgressReporter.waitForReady.mockResolvedValue({
        timedOut: true,
        disconnected: false,
      });

      const csvText = "title,author\nTest Book,Test Author";

      // Should not throw
      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalled();
    });

    it("should continue processing if client disconnected", async () => {
      mockProgressReporter.waitForReady.mockResolvedValue({
        timedOut: false,
        disconnected: true,
      });

      const csvText = "title,author\nTest Book,Test Author";

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalled();
    });
  });

  describe("Progress Reporting", () => {
    it("should report validation progress", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          progress: 0.02,
          status: expect.stringContaining("Validating"),
        }),
      );
    });

    it("should report Gemini upload progress", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          progress: 0.05,
          status: expect.stringContaining("Gemini"),
        }),
      );
    });

    it("should report parsed books count", async () => {
      const csvText = "title,author\nBook 1,Author 1\nBook 2,Author 2";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Book 1", author: "Author 1" },
        { title: "Book 2", author: "Author 2" },
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          progress: 0.75,
          status: expect.stringContaining("2 books"),
          processedCount: 2,
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should send error for invalid CSV", async () => {
      // Mock CSV validator to fail
      mockDeps.validateCSV.mockReturnValue({
        valid: false,
        error: "Missing required columns",
      });

      const csvText = "invalid,csv\ndata";

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          code: "E_CSV_PROCESSING_FAILED",
          message: expect.stringContaining("Invalid CSV"),
        }),
      );
    });

    it("should handle Gemini API errors", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockRejectedValue(
        new Error("Gemini API rate limit exceeded"),
      );

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          code: "E_CSV_PROCESSING_FAILED",
          retryable: true,
        }),
      );
    });

    it("should handle empty Gemini response", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          message: expect.stringContaining("No valid books found"),
        }),
      );
    });
  });

  describe("Caching", () => {
    it("should check cache before calling Gemini", async () => {
      const csvText = "title,author\nTest Book,Test Author";
      const cachedBooks = [{ title: "Cached Book", author: "Cached Author" }];

      mockEnv.CACHE.get.mockResolvedValue(cachedBooks);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockEnv.CACHE.get).toHaveBeenCalled();
      // ISSUE #133: Summary-only completion (booksCount instead of books array)
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          booksCount: 1,
          resultsUrl: expect.stringContaining("/v3/jobs/imports/"),
        }),
      );
    });

    it("should cache Gemini results", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockEnv.CACHE.get.mockResolvedValue(null); // Cache miss

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Test Book"),
        expect.objectContaining({
          expirationTtl: 604800, // 7 days
        }),
      );
    });
  });

  describe("Book Validation", () => {
    it("should filter out books without title", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Valid Book", author: "Valid Author" },
        { author: "No Title Author" }, // Missing title
        { title: "Another Book", author: "Another Author" },
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      // ISSUE #133: Summary-only completion
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          booksCount: 2, // 2 valid books (1 filtered out)
          resultsUrl: expect.stringContaining("/v3/jobs/imports/"),
        }),
      );

      // Verify full results stored in KV
      const kvPutCall = mockEnv.CACHE.put.mock.calls.find((call) =>
        call[0].startsWith("csv-results:"),
      );
      expect(kvPutCall).toBeDefined();
      const storedResults = JSON.parse(kvPutCall[1]);
      expect(storedResults.books).toHaveLength(2);
    });

    it("should filter out books without author", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Valid Book", author: "Valid Author" },
        { title: "No Author Book" }, // Missing author
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      // ISSUE #133: Summary-only completion
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          booksCount: 1, // 1 valid book (1 filtered out)
        }),
      );

      // Verify full results in KV
      const kvPutCall = mockEnv.CACHE.put.mock.calls.find((call) =>
        call[0].startsWith("csv-results:"),
      );
      const storedResults = JSON.parse(kvPutCall[1]);
      expect(storedResults.books).toHaveLength(1);
      expect(storedResults.books[0].title).toBe("Valid Book");
    });

    it("should trim whitespace from book data", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        {
          title: "  Spaced Book  ",
          author: "  Spaced Author  ",
          isbn: "  1234567890  ",
        },
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      // ISSUE #133: Summary-only completion
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          booksCount: 1,
        }),
      );

      // Verify trimmed data in KV storage (canonical BookSchema format)
      const kvPutCall = mockEnv.CACHE.put.mock.calls.find((call) =>
        call[0].startsWith("csv-results:"),
      );
      const storedResults = JSON.parse(kvPutCall[1]);
      expect(storedResults.books[0].title).toBe("Spaced Book");
      expect(storedResults.books[0].authors).toEqual(["Spaced Author"]);
      expect(storedResults.books[0].isbn).toBe("1234567890");
    });

    it("should handle optional ISBN field", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Book With ISBN", author: "Author", isbn: "1234567890" },
        { title: "Book Without ISBN", author: "Author" },
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      // ISSUE #133: Verify ISBN handling in KV storage (canonical BookSchema format)
      const kvPutCall = mockEnv.CACHE.put.mock.calls.find((call) =>
        call[0].startsWith("csv-results:"),
      );
      const storedResults = JSON.parse(kvPutCall[1]);

      expect(storedResults.books[0].isbn).toBe("1234567890");
      expect(storedResults.books[1].isbn).toBe(""); // Empty string for missing ISBN in canonical format
    });
  });

  describe("Completion", () => {
    it("should complete with validated books", async () => {
      const csvText = "title,author\nBook 1,Author 1\nBook 2,Author 2";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Book 1", author: "Author 1" },
        { title: "Book 2", author: "Author 2" },
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      // ISSUE #133: Summary-only completion via WebSocket
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          booksCount: 2,
          resultsUrl: expect.stringContaining("/v3/jobs/imports/"),
          successRate: "2/2",
        }),
      );

      // Verify full results stored in KV (canonical BookSchema format)
      const kvPutCall = mockEnv.CACHE.put.mock.calls.find((call) =>
        call[0].startsWith("csv-results:"),
      );
      const storedResults = JSON.parse(kvPutCall[1]);
      expect(storedResults.books).toHaveLength(2);
      expect(storedResults.books[0].title).toBe("Book 1");
      expect(storedResults.books[0].authors).toEqual(["Author 1"]);
      expect(storedResults.books[1].title).toBe("Book 2");
      expect(storedResults.books[1].authors).toEqual(["Author 2"]);
      expect(storedResults.errors).toEqual([]);
    });

    it("should include success rate in completion", async () => {
      const csvText = "title,author\nTest Book,Test Author";

      mockDeps.parseCSVWithGemini.mockResolvedValue([
        { title: "Book 1", author: "Author 1" },
        { title: "Book 2", author: "Author 2" },
        { title: "Book 3" }, // Missing author, will be filtered
      ]);

      await processCSVImport(csvText, mockProgressReporter, mockEnv, testJobId, mockDeps);

      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        "csv_import",
        expect.objectContaining({
          successRate: "2/3",
        }),
      );
    });
  });
});
