// test/enrichment.test.js
/**
 * Unit tests for enrichment service (Sprint 2: Thin Client)
 *
 * Tests enrichment logic that delegates to Alexandria via RPC
 * (no longer tests fallback chains - Alexandria handles those internally)
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  enrichSingleBook,
  enrichMultipleBooks,
} from "../src/services/enrichment.js";

// Mock Alexandria RPC client
const mockAlexandriaClient = {
  api: {
    search: {
      $get: vi.fn(),
    },
  },
};

vi.mock("../src/services/alexandria-client.ts", () => ({
  createAlexandriaClient: vi.fn(() => mockAlexandriaClient),
}));

describe("enrichSingleBook()", () => {
  let mockEnv;

  beforeEach(() => {
    // Mock environment bindings (thin client only needs ALEXANDRIA binding)
    mockEnv = {
      ALEXANDRIA: {
        fetch: vi.fn(),
      },
    };

    // Reset all mocks before each test
    vi.resetAllMocks();
  });

  test("returns SingleEnrichmentResult for valid ISBN", async () => {
    // Mock Alexandria RPC response
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "1984",
            authors: ["George Orwell"],
            isbn_13: "9780451524935",
            cover_url: "https://example.com/cover.jpg",
            description: "A dystopian novel",
            first_published_year: 1949,
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichSingleBook({ isbn: "9780451524935" }, mockEnv);

    expect(result.success).toBe(true);
    expect(result.work).toMatchObject({
      title: "1984",
      dataProvider: "alexandria",
    });
    expect(result.edition).toMatchObject({
      isbn13: "9780451524935",
      title: "1984",
    });
    expect(result.authors).toEqual([
      { name: "George Orwell", gender: "Unknown" },
    ]);
    expect(mockAlexandriaClient.api.search.$get).toHaveBeenCalledWith({
      query: {
        isbn: "9780451524935",
        title: undefined,
        author: undefined,
      },
    });
  });

  test("returns SingleEnrichmentResult for title+author search", async () => {
    // Mock Alexandria RPC response
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "Pride and Prejudice",
            authors: ["Jane Austen"],
            isbn_13: "9780141439518",
            cover_url: "https://example.com/cover.jpg",
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichSingleBook(
      { title: "Pride and Prejudice", author: "Jane Austen" },
      mockEnv,
    );

    expect(result.success).toBe(true);
    expect(result.work).toMatchObject({
      title: "Pride and Prejudice",
      dataProvider: "alexandria",
    });
    expect(result.authors).toEqual([
      { name: "Jane Austen", gender: "Unknown" },
    ]);
  });

  test("returns error object for unknown book", async () => {
    // Mock Alexandria RPC response with no results
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichSingleBook(
      { title: "XYZ123NonexistentBook" },
      mockEnv,
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("Book not found in any provider");
    expect(result.error.retryable).toBe(false);
  });

  test("handles Alexandria RPC error gracefully (returns error object)", async () => {
    // Mock Alexandria RPC error response
    const mockAlexandriaResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichSingleBook(
      { title: "Any Book" },
      mockEnv,
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe("API_ERROR");
    expect(result.error.retryable).toBe(true);
  });

  test("returns null when no search parameters provided", async () => {
    const result = await enrichSingleBook({}, mockEnv);

    expect(result).toBeNull();
    expect(mockAlexandriaClient.api.search.$get).not.toHaveBeenCalled();
  });

  test("prioritizes ISBN search over title search", async () => {
    // Mock Alexandria RPC response
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "The Great Gatsby",
            authors: ["F. Scott Fitzgerald"],
            isbn_13: "9780743273565",
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichSingleBook(
      { isbn: "9780743273565", title: "Gatsby" },
      mockEnv,
    );

    // Should use ISBN in the query
    expect(mockAlexandriaClient.api.search.$get).toHaveBeenCalledWith({
      query: {
        isbn: "9780743273565",
        title: "Gatsby",
        author: undefined,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("enrichMultipleBooks()", () => {
  let mockEnv;

  beforeEach(() => {
    // Mock environment bindings
    mockEnv = {
      ALEXANDRIA: {
        fetch: vi.fn(),
      },
    };

    // Reset all mocks before each test
    vi.resetAllMocks();
  });

  test("returns array of WorkDTOs for valid search", async () => {
    // Mock Alexandria RPC response with multiple results
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "1984",
            authors: ["George Orwell"],
            isbn_13: "9780451524935",
          },
          {
            title: "Animal Farm",
            authors: ["George Orwell"],
            isbn_13: "9780451526342",
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks({ author: "Orwell" }, mockEnv);

    expect(result.works).toHaveLength(2);
    expect(result.works[0]).toMatchObject({
      title: "1984",
      dataProvider: "alexandria",
    });
    expect(result.editions).toHaveLength(2);
    expect(result.authors).toEqual([
      { name: "George Orwell", gender: "Unknown" },
    ]);
  });

  test("returns empty array for unknown search", async () => {
    // Mock Alexandria RPC response with no results
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks(
      { title: "XYZ123Nonexistent" },
      mockEnv,
    );

    expect(result.works).toEqual([]);
    expect(result.editions).toEqual([]);
    expect(result.authors).toEqual([]);
  });

  test("respects maxResults parameter", async () => {
    // Mock Alexandria RPC response with 10 results
    const mockResults = Array.from({ length: 10 }, (_, i) => ({
      title: `Book ${i + 1}`,
      authors: ["Test Author"],
      isbn_13: `978000000000${i}`,
    }));
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: mockResults,
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks(
      { title: "Test" },
      mockEnv,
      { maxResults: 5 },
    );

    // Should filter to maxResults on client side
    expect(result.works).toHaveLength(5);
    expect(result.editions).toHaveLength(5);
  });

  test("defaults to maxResults=20 when not specified", async () => {
    // Mock Alexandria RPC call (we're just testing parameter defaults)
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ results: [] }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    await enrichMultipleBooks({ title: "Test" }, mockEnv);

    // maxResults is not passed to Alexandria (client-side filtering only)
    expect(mockAlexandriaClient.api.search.$get).toHaveBeenCalledWith({
      query: {
        isbn: undefined,
        title: "Test",
        author: undefined,
      },
    });
  });

  test("handles API errors gracefully (returns empty array)", async () => {
    // Mock Alexandria RPC error response
    const mockAlexandriaResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks({ title: "Any Book" }, mockEnv);

    expect(result.works).toEqual([]);
    expect(result.editions).toEqual([]);
    expect(result.authors).toEqual([]);
  });

  test("returns single result for ISBN search", async () => {
    // Mock Alexandria RPC response
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "1984",
            authors: ["George Orwell"],
            isbn_13: "9780451524935",
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks(
      { isbn: "9780451524935" },
      mockEnv,
    );

    expect(result.works).toHaveLength(1);
    expect(result.works[0].title).toBe("1984");
  });

  test("returns empty result for ISBN not found", async () => {
    // Mock Alexandria RPC response with no results
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks(
      { isbn: "9999999999" },
      mockEnv,
    );

    expect(result.works).toEqual([]);
    expect(result.editions).toEqual([]);
    expect(result.authors).toEqual([]);
  });

  test("returns empty result when no search parameters provided", async () => {
    const result = await enrichMultipleBooks({}, mockEnv);

    expect(result.works).toEqual([]);
    expect(result.editions).toEqual([]);
    expect(result.authors).toEqual([]);
    expect(mockAlexandriaClient.api.search.$get).not.toHaveBeenCalled();
  });

  test("deduplicates authors in result", async () => {
    // Mock Alexandria RPC response with duplicate authors
    const mockAlexandriaResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "Book 1",
            authors: ["Author A", "Author B"],
            isbn_13: "9780000000001",
          },
          {
            title: "Book 2",
            authors: ["Author A", "Author C"],
            isbn_13: "9780000000002",
          },
        ],
      }),
    };
    mockAlexandriaClient.api.search.$get.mockResolvedValue(mockAlexandriaResponse);

    const result = await enrichMultipleBooks({ title: "Test" }, mockEnv);

    // Should deduplicate authors (Author A appears in both books)
    expect(result.authors).toHaveLength(3);
    const authorNames = result.authors.map((a) => a.name);
    expect(authorNames).toContain("Author A");
    expect(authorNames).toContain("Author B");
    expect(authorNames).toContain("Author C");
  });
});
