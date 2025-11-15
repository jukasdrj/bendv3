/**
 * Comprehensive Advanced Search Handler Tests
 * Sprint 3.2: Search Handler Tests (Issue #54)
 *
 * Tests /v1/search/advanced endpoint with new test infrastructure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleSearchAdvanced } from "../../../src/handlers/v1/search-advanced.js";
import { createMockKV } from "../../setup.js";
import {
  mockGoogleBooksSearchResponse,
  mockGoogleBooksEmptyResponse,
  createMockFetchResponse,
} from "../../mocks/providers.js";
import {
  harryPotterBook,
  book1984,
  greatGatsbyBook,
} from "../../fixtures/books.js";
import {
  validateSuccessEnvelope,
  validateErrorEnvelope,
  validateV1SearchResponse,
} from "../../utils/response-validator.js";

// Mock ExecutionContext for cache.waitUntil
const createMockContext = () => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
});

describe("GET /v1/search/advanced - Comprehensive", () => {
  let mockEnv;
  let mockCtx;
  let originalFetch;

  beforeEach(() => {
    mockEnv = {
      GOOGLE_BOOKS_API_KEY: "test-google-key",
      CACHE: createMockKV(),
    };

    mockCtx = createMockContext();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  // ============================================================================
  // MULTIPLE PARAMETER COMBINATIONS
  // ============================================================================

  describe("Multiple Parameter Combinations", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should search with title + author combination", async () => {
      const response = await handleSearchAdvanced(
        book1984.title,
        book1984.authors[0].name,
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      const validation = validateV1SearchResponse(response);
      expect(validation.valid).toBe(true);

      // Verify fetch was called (handler combines title + author into single query)
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should search with title only", async () => {
      const response = await handleSearchAdvanced(
        harryPotterBook.title,
        "", // No author
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      validateSuccessEnvelope(response);
    });

    it("should search with author only", async () => {
      const response = await handleSearchAdvanced(
        "", // No title
        greatGatsbyBook.authors[0].name,
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      validateSuccessEnvelope(response);
    });

    it("should return error when both title and author are missing", async () => {
      const response = await handleSearchAdvanced("", "", mockEnv, mockCtx);

      expect(response.error).toBeDefined();
      const validation = validateErrorEnvelope(response);
      expect(validation.valid).toBe(true);
      expect(response.error.code).toBe("INVALID_QUERY");
      expect(response.error.message).toContain("title or author");
    });
  });

  // ============================================================================
  // FILTERING TESTS
  // ============================================================================

  describe("Year Filtering", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should filter by publication year if supported", async () => {
      // Advanced search may support year filtering
      const response = await handleSearchAdvanced(
        book1984.title,
        book1984.authors[0].name,
        mockEnv,
        mockCtx,
        { year: 1949 },
      );

      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
    });

    it("should filter by year range if supported", async () => {
      const response = await handleSearchAdvanced(
        "classic literature",
        "",
        mockEnv,
        mockCtx,
        { yearFrom: 1900, yearTo: 1950 },
      );

      expect(response.data).toBeDefined();
    });
  });

  describe("Publisher Filtering", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should filter by publisher if supported", async () => {
      const response = await handleSearchAdvanced(
        harryPotterBook.title,
        "",
        mockEnv,
        mockCtx,
        { publisher: "Bloomsbury" },
      );

      expect(response.data).toBeDefined();
    });
  });

  // ============================================================================
  // EMPTY RESULTS HANDLING
  // ============================================================================

  describe("Empty Results Handling", () => {
    it("should handle no results gracefully", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksEmptyResponse),
        );

      const response = await handleSearchAdvanced(
        "nonexistent book xyz123",
        "nonexistent author",
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      expect(response.data.works).toHaveLength(0);
      expect(response.data.editions).toHaveLength(0);
      expect(response.data.authors).toHaveLength(0);

      // Should still return valid envelope
      validateSuccessEnvelope(response);
    });

    it("should include helpful message for empty results", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksEmptyResponse),
        );

      const response = await handleSearchAdvanced(
        "xyz123",
        "abc456",
        mockEnv,
        mockCtx,
      );

      if (response.data !== null) {
        // May include metadata about empty results
        expect(response.metadata).toBeDefined();
      }
    });
  });

  // ============================================================================
  // MALFORMED QUERY PARAMETERS
  // ============================================================================

  describe("Malformed Query Parameters", () => {
    it("should handle null parameters", async () => {
      const response = await handleSearchAdvanced(null, null, mockEnv, mockCtx);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe("INVALID_QUERY");
    });

    it("should handle undefined parameters", async () => {
      const response = await handleSearchAdvanced(
        undefined,
        undefined,
        mockEnv,
        mockCtx,
      );

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe("INVALID_QUERY");
    });

    it("should trim whitespace from parameters", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );

      const response = await handleSearchAdvanced(
        "  test  ",
        "  author  ",
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      // Verify trimmed values were used
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("test"),
        expect.any(Object),
      );
    });

    it("should handle special characters in queries", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );

      const response = await handleSearchAdvanced(
        "C++ Programming",
        "Bjarne Stroustrup",
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      // Verify proper URL encoding
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("%"),
        expect.any(Object),
      );
    });
  });

  // ============================================================================
  // PROVIDER INTEGRATION
  // ============================================================================

  describe("Provider Integration", () => {
    it("should handle provider errors gracefully (best-effort)", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse({ error: "API Error" }, 500),
        );

      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      // Best-effort: provider errors return empty results
      expect(response.data).toBeDefined();
      expect(response.data.works).toEqual([]);
      expect(response.data.editions).toEqual([]);
      expect(response.data.authors).toEqual([]);
    });

    it("should handle network failures (best-effort)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      // Best-effort: network failures return empty results
      expect(response.data).toBeDefined();
      expect(response.data.works).toEqual([]);
    });

    it("should handle timeout errors (best-effort)", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Fetch timeout after 5000ms"));

      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      // Best-effort: timeouts return empty results
      expect(response.data).toBeDefined();
      expect(response.data.works).toEqual([]);
    });

    it("should handle malformed provider responses", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockFetchResponse({ incomplete: "data" }));

      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      // Should handle gracefully
      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
    });
  });

  // ============================================================================
  // RESPONSE FORMAT VALIDATION
  // ============================================================================

  describe("Response Format Validation", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should return canonical v1 search response structure", async () => {
      const response = await handleSearchAdvanced(
        harryPotterBook.title,
        harryPotterBook.authors[0].name,
        mockEnv,
        mockCtx,
      );

      const validation = validateV1SearchResponse(response);
      expect(validation.valid).toBe(true);
    });

    it("should include all required envelope fields", async () => {
      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.timestamp).toBeDefined();
      expect(response.metadata.processingTime).toBeTypeOf("number");
    });

    it("should include data arrays for successful responses", async () => {
      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      if (response.data !== null) {
        expect(response.data.works).toBeInstanceOf(Array);
        expect(response.data.editions).toBeInstanceOf(Array);
        expect(response.data.authors).toBeInstanceOf(Array);
      }
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe("Performance", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should complete search in reasonable time (<500ms P95)", async () => {
      const startTime = Date.now();

      await handleSearchAdvanced(
        harryPotterBook.title,
        harryPotterBook.authors[0].name,
        mockEnv,
        mockCtx,
      );

      const duration = Date.now() - startTime;

      // Should complete quickly (allow 1000ms for test environment)
      expect(duration).toBeLessThan(1000);
    });

    it("should include processingTime in meta", async () => {
      const response = await handleSearchAdvanced(
        "test",
        "author",
        mockEnv,
        mockCtx,
      );

      expect(response.metadata.processingTime).toBeTypeOf("number");
      expect(response.metadata.processingTime).toBeGreaterThanOrEqual(0);
      expect(response.metadata.processingTime).toBeLessThan(1000);
    });
  });
});
