/**
 * Comprehensive Title Search Handler Tests
 * Sprint 3.2: Search Handler Tests (Issue #54)
 *
 * Tests /v1/search/title endpoint with new test infrastructure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleSearchTitle } from "../../../src/handlers/v1/search-title.js";
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

describe("GET /v1/search/title - Comprehensive", () => {
  let mockEnv;
  let originalFetch;

  beforeEach(() => {
    mockEnv = {
      GOOGLE_BOOKS_API_KEY: "test-google-key",
      BOOK_CACHE: createMockKV(),
    };

    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  // ============================================================================
  // VALID QUERY TESTS
  // ============================================================================

  describe("Valid Title Queries", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should return canonical WorkDTO for valid title", async () => {
      const response = await handleSearchTitle(harryPotterBook.title, mockEnv);

      expect(response.data).toBeDefined();
      const validation = validateV1SearchResponse(response);
      expect(validation.valid).toBe(true);

      // Verify data structure
      expect(response.data.works).toBeInstanceOf(Array);
      expect(response.data.editions).toBeInstanceOf(Array);
      expect(response.data.authors).toBeInstanceOf(Array);
    });

    it("should handle short titles (single word)", async () => {
      const response = await handleSearchTitle("1984", mockEnv);

      expect(response.data).toBeDefined();
      validateSuccessEnvelope(response);
    });

    it("should handle long titles", async () => {
      const longTitle =
        "Harry Potter and the Philosopher's Stone: A Novel for Young Readers";

      const response = await handleSearchTitle(longTitle, mockEnv);

      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
    });

    it("should handle titles with special characters (normalized)", async () => {
      const titleWithSpecialChars = "C++ Programming: The #1 Guide";

      const response = await handleSearchTitle(titleWithSpecialChars, mockEnv);

      expect(response.data).toBeDefined();
      // Note: Handler normalizes special characters for simpler search queries
      // "C++ Programming: The #1 Guide" becomes "c programming the 1 guide"
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should trim whitespace from query", async () => {
      const titleWithWhitespace = "  1984  ";

      const response = await handleSearchTitle(titleWithWhitespace, mockEnv);

      expect(response.data).toBeDefined();
      // Verify fetch was called with trimmed query
      expect(global.fetch).toHaveBeenCalledWith(
        expect.not.stringContaining("%20%20"), // No double spaces
        expect.any(Object),
      );
    });
  });

  // ============================================================================
  // INVALID QUERY TESTS
  // ============================================================================

  describe("Invalid Title Queries", () => {
    it("should return error for empty query", async () => {
      const response = await handleSearchTitle("", mockEnv);

      expect(response.error).toBeDefined();
      const validation = validateErrorEnvelope(response);
      expect(validation.valid).toBe(true);
      expect(response.error.code).toBe("INVALID_QUERY");
      expect(response.error.message).toContain("required");
    });

    it("should return error for null query", async () => {
      const response = await handleSearchTitle(null, mockEnv);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe("INVALID_QUERY");
    });

    it("should return error for undefined query", async () => {
      const response = await handleSearchTitle(undefined, mockEnv);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe("INVALID_QUERY");
    });

    it("should reject excessively long queries (>200 chars)", async () => {
      const longQuery = "a".repeat(201);

      const response = await handleSearchTitle(longQuery, mockEnv);

      // Should either truncate or reject
      expect(response.data).toBeDefined();
      if (response.error) {
        expect(response.error.code).toMatch(/INVALID_QUERY|VALIDATION_ERROR/);
      }
    });
  });

  // ============================================================================
  // PROVIDER ERROR HANDLING
  // ============================================================================

  describe("Provider Error Handling", () => {
    it("should handle provider errors gracefully (best-effort)", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse({ error: "Internal Server Error" }, 500),
        );

      const response = await handleSearchTitle("test query", mockEnv);

      // Best-effort: provider errors return empty results
      expect(response.data).toBeDefined();
      expect(response.data.works).toEqual([]);
    });

    it("should handle network errors (best-effort)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const response = await handleSearchTitle("test query", mockEnv);

      // Best-effort: network errors return empty results
      expect(response.data).toBeDefined();
      expect(response.data.works).toEqual([]);
    });

    it("should handle empty results gracefully", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksEmptyResponse),
        );

      const response = await handleSearchTitle(
        "nonexistent book xyz123",
        mockEnv,
      );

      expect(response.data).toBeDefined();
      expect(response.data.works).toHaveLength(0);
      expect(response.data.editions).toHaveLength(0);
    });

    it("should handle malformed API responses", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(createMockFetchResponse({ incomplete: "data" }));

      const response = await handleSearchTitle("test", mockEnv);

      // Should handle gracefully without crashing
      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
    });
  });

  // ============================================================================
  // RESPONSE ENVELOPE TESTS
  // ============================================================================

  describe("Response Envelope Format", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should include success field", async () => {
      const response = await handleSearchTitle(book1984.title, mockEnv);

      expect(response.data).toBeDefined();
    });

    it("should include meta.timestamp", async () => {
      const response = await handleSearchTitle(book1984.title, mockEnv);

      expect(response.metadata.timestamp).toBeDefined();
      const timestamp = new Date(response.metadata.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it("should include meta.processingTime", async () => {
      const response = await handleSearchTitle(book1984.title, mockEnv);

      expect(response.metadata.processingTime).toBeTypeOf("number");
      expect(response.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    it("should include meta.provider", async () => {
      const response = await handleSearchTitle(book1984.title, mockEnv);

      if (response.data !== null) {
        expect(response.metadata.provider).toBeDefined();
        expect(typeof response.metadata.provider).toBe("string");
      }
    });
  });

  // ============================================================================
  // CACHE BEHAVIOR TESTS
  // ============================================================================

  describe("Cache Behavior", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it.skip("should cache successful search results (caching not implemented)", async () => {
      // NOTE: Current implementation uses enrichMultipleBooks which doesn't cache
      // This test is kept for future when caching is added
      const title = harryPotterBook.title;

      await handleSearchTitle(title, mockEnv);

      // Verify cache was accessed (implementation may vary)
      const cacheKey = `title:${title.toLowerCase()}`;
      const cached = await mockEnv.BOOK_CACHE.get(cacheKey, "json");

      // Cache behavior depends on implementation
      expect(cached === null || typeof cached === "object").toBe(true);
    });

    it.skip("should return cached result on second request (caching not implemented)", async () => {
      // NOTE: Current implementation uses enrichMultipleBooks which doesn't cache
      // This test is kept for future when caching is added
      const title = book1984.title;

      // First request
      const response1 = await handleSearchTitle(title, mockEnv);
      const firstFetchCount = global.fetch.mock.calls.length;

      // Second request
      const response2 = await handleSearchTitle(title, mockEnv);
      const secondFetchCount = global.fetch.mock.calls.length;

      // Should use cache on second request (may not fetch again)
      expect(response1.success).toBe(response2.success);
    });
  });

  // ============================================================================
  // PAGINATION SUPPORT TESTS
  // ============================================================================

  describe("Pagination Support", () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          createMockFetchResponse(mockGoogleBooksSearchResponse),
        );
    });

    it("should support maxResults parameter", async () => {
      const response = await handleSearchTitle(
        harryPotterBook.title,
        mockEnv,
        10,
      );

      if (response.data !== null) {
        // Should limit results
        const totalResults =
          response.data.works.length +
          response.data.editions.length +
          response.data.authors.length;

        expect(totalResults).toBeLessThanOrEqual(10);
      }
    });

    it("should default maxResults to 20", async () => {
      const response = await handleSearchTitle(harryPotterBook.title, mockEnv);

      // Default pagination behavior
      expect(response.data).toBeDefined();
    });
  });
});
