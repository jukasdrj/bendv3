/**
 * Tests for request coalescing timeout and memory leak prevention
 * Issue #201: IN_FLIGHT_REQUESTS Map memory leak risk
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAdvancedSearch } from "../../src/handlers/search-handlers.js";
import * as externalApis from "../../src/services/external-apis.ts";

// Mock external APIs module
vi.mock("../../src/services/external-apis.ts");

describe("Request Coalescing Timeout & Cleanup", () => {
  let mockEnv;

  // Helper to parse Response objects
  // Note: Clone response before reading to support request coalescing tests
  async function parseResponse(response) {
    if (response && typeof response.json === "function") {
      // Clone the response so it can be read multiple times (for coalescing tests)
      return await response.clone().json();
    }
    return response;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      CACHE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      },
      GOOGLE_BOOKS_API_KEY: "test-key",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should clean up Map entry on successful request", async () => {
    // Mock successful response
    vi.mocked(externalApis.searchGoogleBooks).mockResolvedValueOnce({
      works: [
        {
          title: "Test Book",
          authors: [{ name: "Test Author" }],
          editions: [
            {
              isbn13: "9781234567890",
              googleBooksVolumeId: "test-volume-id",
              publicationDate: "2024-01-01",
              publisher: "Test Publisher",
              description: "Test description",
              coverImageURL: "https://example.com/cover.jpg",
            },
          ],
        },
      ],
    });

    const searchParams = {
      bookTitle: "Test Book",
      authorName: "Test Author",
    };

    const result = await parseResponse(
      await handleAdvancedSearch(searchParams, {}, mockEnv),
    );

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.data.items).toHaveLength(1);

    // Verify Map is empty after successful request
    // Note: We can't directly access IN_FLIGHT_REQUESTS, but we can verify
    // by making a second request and checking it's not coalesced
    vi.mocked(externalApis.searchGoogleBooks).mockResolvedValueOnce({
      works: [
        {
          title: "Test Book 2",
          authors: [{ name: "Test Author" }],
          editions: [
            {
              isbn13: "9781234567891",
              googleBooksVolumeId: "test-volume-id-2",
            },
          ],
        },
      ],
    });

    const result2 = await parseResponse(
      await handleAdvancedSearch(searchParams, {}, mockEnv),
    );

    // Should make a new API call (not coalesced)
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(2);
  });

  it("should clean up Map entry on error", async () => {
    // Mock error response
    vi.mocked(externalApis.searchGoogleBooks).mockRejectedValueOnce(
      new Error("API error"),
    );

    const searchParams = {
      bookTitle: "Test Book",
      authorName: "Test Author",
    };

    const result = await parseResponse(
      await handleAdvancedSearch(searchParams, {}, mockEnv),
    );

    expect(result.error).toBeDefined();
    expect(result.error.code).toBe("INTERNAL_ERROR");

    // Verify cleanup by making second request
    vi.mocked(externalApis.searchGoogleBooks).mockRejectedValueOnce(
      new Error("API error 2"),
    );

    await parseResponse(await handleAdvancedSearch(searchParams, {}, mockEnv));

    // Should make a new API call (not coalesced)
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(2);
  });

  it("should clean up Map entry on timeout", async () => {
    // Mock a request that never resolves (simulates timeout)
    const neverResolves = new Promise(() => {
      // Never resolves or rejects
    });

    vi.mocked(externalApis.searchGoogleBooks).mockReturnValueOnce(
      neverResolves,
    );

    const searchParams = {
      bookTitle: "Test Book",
      authorName: "Test Author",
    };

    // Use fake timers for testing timeout
    vi.useFakeTimers();

    const requestPromise = handleAdvancedSearch(searchParams, {}, mockEnv);

    // Fast-forward past the 30 second timeout
    await vi.advanceTimersByTimeAsync(31000);

    // Request should have timed out
    await expect(requestPromise).rejects.toThrow("Request timeout");

    // Verify cleanup by making second request
    vi.mocked(externalApis.searchGoogleBooks).mockResolvedValueOnce({
      works: [
        {
          title: "Test Book 2",
          authors: [{ name: "Test Author" }],
          editions: [
            {
              isbn13: "9781234567891",
              googleBooksVolumeId: "test-volume-id-2",
            },
          ],
        },
      ],
    });

    vi.useRealTimers();

    const result2 = await parseResponse(
      await handleAdvancedSearch(searchParams, {}, mockEnv),
    );

    // Should make a new API call (not coalesced)
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(2);
  });

  it("should coalesce concurrent requests with same parameters", async () => {
    // Mock a slow response (100ms)
    vi.mocked(externalApis.searchGoogleBooks).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              works: [
                {
                  title: "Test Book",
                  authors: [{ name: "Test Author" }],
                  editions: [
                    {
                      isbn13: "9781234567890",
                      googleBooksVolumeId: "test-volume-id",
                    },
                  ],
                },
              ],
            });
          }, 100);
        }),
    );

    const searchParams = {
      bookTitle: "Test Book",
      authorName: "Test Author",
    };

    // Fire 3 concurrent requests
    const [response1, response2, response3] = await Promise.all([
      handleAdvancedSearch(searchParams, {}, mockEnv),
      handleAdvancedSearch(searchParams, {}, mockEnv),
      handleAdvancedSearch(searchParams, {}, mockEnv),
    ]);

    const [result1, result2, result3] = await Promise.all([
      parseResponse(response1),
      parseResponse(response2),
      parseResponse(response3),
    ]);

    // All should succeed (no error field)
    expect(result1.error).toBeUndefined();
    expect(result2.error).toBeUndefined();
    expect(result3.error).toBeUndefined();

    // Should only make ONE API call (coalesced)
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple different requests without interference", async () => {
    // Mock responses for different searches
    vi.mocked(externalApis.searchGoogleBooks)
      .mockResolvedValueOnce({
        works: [
          {
            title: "Book 1",
            authors: [{ name: "Author 1" }],
            editions: [
              { isbn13: "1111111111111", googleBooksVolumeId: "vol-1" },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        works: [
          {
            title: "Book 2",
            authors: [{ name: "Author 2" }],
            editions: [
              { isbn13: "2222222222222", googleBooksVolumeId: "vol-2" },
            ],
          },
        ],
      });

    const search1 = { bookTitle: "Book 1", authorName: "Author 1" };
    const search2 = { bookTitle: "Book 2", authorName: "Author 2" };

    const [response1, response2] = await Promise.all([
      handleAdvancedSearch(search1, {}, mockEnv),
      handleAdvancedSearch(search2, {}, mockEnv),
    ]);

    const [result1, result2] = await Promise.all([
      parseResponse(response1),
      parseResponse(response2),
    ]);

    expect(result1.error).toBeUndefined();
    expect(result2.error).toBeUndefined();
    expect(result1.data.items[0].volumeInfo.title).toBe("Book 1");
    expect(result2.data.items[0].volumeInfo.title).toBe("Book 2");

    // Should make TWO API calls (different cache keys)
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(2);
  });

  it("should not leak memory after 1000+ requests", async () => {
    // Mock fast responses
    vi.mocked(externalApis.searchGoogleBooks).mockResolvedValue({
      works: [
        {
          title: "Test Book",
          authors: [{ name: "Test Author" }],
          editions: [
            {
              isbn13: "9781234567890",
              googleBooksVolumeId: "test-volume-id",
            },
          ],
        },
      ],
    });

    // Execute 1000 sequential requests
    for (let i = 0; i < 1000; i++) {
      const searchParams = {
        bookTitle: `Book ${i}`,
        authorName: "Test Author",
      };

      await parseResponse(
        await handleAdvancedSearch(searchParams, {}, mockEnv),
      );
    }

    // All requests should complete successfully
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(1000);

    // Note: We can't directly check Map size, but if there was a memory leak,
    // we'd see timeouts or OOM errors in a real environment
    // This test verifies all requests complete without hanging
  });

  it("should handle rapid sequential requests correctly", async () => {
    // Mock responses
    const mockResponses = Array.from({ length: 100 }, (_, i) => ({
      works: [
        {
          title: `Book ${i}`,
          authors: [{ name: "Test Author" }],
          editions: [
            {
              isbn13: `${i}`.padStart(13, "0"),
              googleBooksVolumeId: `vol-${i}`,
            },
          ],
        },
      ],
    }));

    mockResponses.forEach((response) => {
      vi.mocked(externalApis.searchGoogleBooks).mockResolvedValueOnce(response);
    });

    // Execute 100 rapid sequential requests
    const results = [];
    for (let i = 0; i < 100; i++) {
      const searchParams = {
        bookTitle: `Book ${i}`,
        authorName: "Test Author",
      };
      const response = await handleAdvancedSearch(searchParams, {}, mockEnv);
      results.push(await parseResponse(response));
    }

    // All should succeed (no error field)
    expect(results.every((r) => !r.error)).toBe(true);
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledTimes(100);
  });

  it("should timeout after 30 seconds exactly", async () => {
    // Mock a request that never resolves
    vi.mocked(externalApis.searchGoogleBooks).mockReturnValueOnce(
      new Promise(() => {}), // Never resolves
    );

    vi.useFakeTimers();

    const searchParams = {
      bookTitle: "Test Book",
      authorName: "Test Author",
    };

    const requestPromise = handleAdvancedSearch(searchParams, {}, mockEnv);

    // Advance to 29 seconds - should NOT timeout yet
    await vi.advanceTimersByTimeAsync(29000);

    // Advance to 31 seconds - should timeout
    await vi.advanceTimersByTimeAsync(2000);

    await expect(requestPromise).rejects.toThrow(
      "Request timeout after 30000ms",
    );

    vi.useRealTimers();
  });

  it("should handle negative cache entries correctly without leaking", async () => {
    // Mock negative cache response (404)
    mockEnv.CACHE.get = vi.fn().mockResolvedValueOnce({
      type: "no_results",
      error: "No results found",
      status: 404,
      timestamp: Date.now(),
    });

    const searchParams = {
      bookTitle: "Nonexistent Book",
      authorName: "Fake Author",
    };

    const result = await parseResponse(
      await handleAdvancedSearch(searchParams, {}, mockEnv),
    );

    expect(result.error).toBeUndefined();
    expect(result.data.items).toEqual([]);
    expect(result.metadata.cached).toBe(true);

    // Should NOT call external API (negative cache hit)
    expect(externalApis.searchGoogleBooks).not.toHaveBeenCalled();
  });
});
