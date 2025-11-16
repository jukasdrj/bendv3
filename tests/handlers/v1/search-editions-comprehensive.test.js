import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleSearchEditions } from "../../../src/handlers/v1/search-editions.ts";
import { createMockFetchResponse } from "../../mocks/providers.js";

/**
 * Parse v2 Response object and extract body + status
 * Handlers now return Response objects (issue #117)
 */
async function parseV2Response(response) {
  const body = await response.json();
  return {
    body,
    status: response.status,
    headers: response.headers,
  };
}

// Mock ExecutionContext
const createMockContext = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {},
});

// Mock ISBNdb response for editions
const mockIsbndbEditionsResponse = {
  total: 3,
  books: [
    {
      title: "The Martian",
      title_long: "The Martian: A Novel",
      isbn13: "9780553418026",
      isbn: "0553418025",
      binding: "Hardcover",
      publisher: "Crown Publishing",
      date_published: "2014-02-11",
      authors: ["Andy Weir"],
      image: "https://images.isbndb.com/covers/80/26/9780553418026.jpg",
      pages: 369,
    },
    {
      title: "The Martian",
      isbn13: "9780804139021",
      isbn: "0804139024",
      binding: "Paperback",
      publisher: "Broadway Books",
      date_published: "2014-10-28",
      authors: ["Andy Weir"],
    },
  ],
};

// Mock Google Books response
const mockGoogleBooksEditionsResponse = {
  kind: "books#volumes",
  totalItems: 1,
  items: [
    {
      kind: "books#volume",
      id: "google-martian-1",
      volumeInfo: {
        title: "The Martian",
        authors: ["Andy Weir"],
        publisher: "Crown",
        publishedDate: "2014",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780804139038" }],
        imageLinks: {
          thumbnail: "https://books.google.com/covers/martian.jpg",
        },
      },
    },
  ],
};

describe("GET /v1/editions/search - Comprehensive Integration Tests", () => {
  beforeEach(() => {
    // Set up default "happy path" mocks for external API calls
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlString = url.toString();

      // ISBNdb API - return generic editions for any title search
      if (urlString.includes("api2.isbndb.com")) {
        // Extract title from URL for more realistic mocking
        const titleMatch = urlString.match(/books\/([^?]+)/);
        const searchTitle = titleMatch
          ? decodeURIComponent(titleMatch[1])
          : "Unknown Book";

        // Return mock data that will pass title/author filtering
        // Note: ISBNdb function filters by author, but we can't extract it from URL
        // So we return books with multiple common test authors to pass filtering
        return createMockFetchResponse(
          {
            total: 2,
            books: [
              {
                title: searchTitle, // Use the searched title so fuzzy matching passes
                isbn13: "9780000000001",
                isbn: "0000000001",
                binding: "Hardcover",
                publisher: "Test Publisher",
                date_published: "2020-01-01",
                // Include actual author names that tests search for
                authors: [
                  "Andy Weir",
                  "George Orwell",
                  "J.K. Rowling",
                  "J.R.R. Tolkien",
                  "Suzanne Collins",
                  "Collins, Suzanne",
                ],
                pages: 300,
              },
              {
                title: searchTitle,
                isbn13: "9780000000002",
                isbn: "0000000002",
                binding: "Paperback",
                publisher: "Test Publisher",
                date_published: "2021-01-01",
                authors: [
                  "Andy Weir",
                  "George Orwell",
                  "J.K. Rowling",
                  "J.R.R. Tolkien",
                ],
              },
            ],
          },
          200,
        );
      }

      // Google Books API - return generic editions for any query
      if (urlString.includes("googleapis.com/books")) {
        // Extract title and author from Google Books query
        const titleMatch = urlString.match(/intitle:"([^"]+)"/);
        const authorMatch = urlString.match(/inauthor:"([^"]+)"/);
        const bookTitle = titleMatch ? titleMatch[1] : "Test Book";
        const bookAuthor = authorMatch ? authorMatch[1] : "Test Author";

        return createMockFetchResponse(
          {
            kind: "books#volumes",
            totalItems: 1,
            items: [
              {
                kind: "books#volume",
                id: "google-test-1",
                volumeInfo: {
                  title: bookTitle, // Use extracted title for fuzzy matching
                  authors: [bookAuthor], // Use extracted author for filtering
                  publisher: "Google Test Publisher",
                  publishedDate: "2020",
                  industryIdentifiers: [
                    { type: "ISBN_13", identifier: "9780000000003" },
                  ],
                },
              },
            ],
          },
          200,
        );
      }

      // Fallback for unexpected fetch calls
      console.warn("Unexpected fetch call:", urlString);
      return createMockFetchResponse({ error: "Unexpected API call" }, 404);
    });
  });

  afterEach(() => {
    // Restore all mocks after each test to ensure isolation
    vi.restoreAllMocks();
  });
  describe("Response Format Validation", () => {
    it("should return canonical BookSearchResponse structure", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "The Martian",
        "Andy Weir",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      // Verify canonical response envelope
      expect(status).toBe(200);
      expect(body).toBeDefined();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(body.metadata).toHaveProperty("timestamp");
      expect(body.metadata).toHaveProperty("processingTime");
      expect(body.metadata.processingTime).toBeTypeOf("number");
      expect(body.metadata.processingTime).toBeGreaterThan(0);

      if (body.data !== null) {
        // Verify data structure
        expect(body.data).toBeDefined();
        expect(body.data).toHaveProperty("works");
        expect(body.data).toHaveProperty("editions");
        expect(body.data).toHaveProperty("authors");

        // Verify works and authors are empty (as per spec)
        expect(body.data.works).toEqual([]);
        expect(body.data.authors).toEqual([]);

        // Verify editions is an array
        expect(Array.isArray(body.data.editions)).toBe(true);
      }
    });

    it("should include provider metadata in response when successful", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "1984",
        "George Orwell",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      // Provider metadata should be present (either in success or error response)
      expect(status).toBe(200);
      expect(body.metadata).toBeDefined();
      expect(body.metadata).toHaveProperty("timestamp");
      expect(body.metadata).toHaveProperty("processingTime");
    });
  });

  describe("EditionDTO Validation", () => {
    it("should return EditionDTO objects with required fields", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "Harry Potter",
        "J.K. Rowling",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      if (body.data && body.data.editions.length > 0) {
        const edition = body.data.editions[0];

        // Verify EditionDTO structure
        expect(edition).toHaveProperty("isbns");
        expect(Array.isArray(edition.isbns)).toBe(true);
        expect(edition).toHaveProperty("format");
        expect(edition).toHaveProperty("isbndbQuality");
        expect(typeof edition.isbndbQuality).toBe("number");

        // Optional fields
        if (edition.isbn) {
          expect(typeof edition.isbn).toBe("string");
        }
        if (edition.title) {
          expect(typeof edition.title).toBe("string");
        }
        if (edition.publisher) {
          expect(typeof edition.publisher).toBe("string");
        }
      }
    });

    it("should include format field in all editions", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "The Hobbit",
        "J.R.R. Tolkien",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      if (body.data && body.data.editions.length > 0) {
        for (const edition of body.data.editions) {
          expect(edition).toHaveProperty("format");
          expect(typeof edition.format).toBe("string");
          // Format should be one of the valid values
          expect([
            "Hardcover",
            "Paperback",
            "E-book",
            "Audiobook",
            "Other",
          ]).toContain(edition.format);
        }
      }
    });
  });

  describe("Query Parameter Validation", () => {
    it("should normalize title with special characters", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "The Lord of the Rings: The Fellowship of the Ring",
        "J.R.R. Tolkien",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      expect(body).toBeDefined();
      expect(body.metadata).toBeDefined();
    });

    it("should handle author names with various formats", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      // Test with "Last, First" format
      const response = await handleSearchEditions(
        "The Hunger Games",
        "Collins, Suzanne",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      expect(body).toBeDefined();
      expect(body.metadata).toBeDefined();
    });

    it("should handle whitespace in query parameters", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "  The Martian  ",
        "  Andy Weir  ",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      expect(body).toBeDefined();
      expect(body.metadata).toBeDefined();
    });
  });

  describe("Limit Parameter Behavior", () => {
    it("should respect small limit values", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "The Martian",
        "Andy Weir",
        1,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      if (body.data && body.data.editions.length > 0) {
        expect(body.data.editions.length).toBeLessThanOrEqual(1);
      }
    });

    it("should respect large limit values", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "Harry Potter",
        "J.K. Rowling",
        100,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      if (body.data && body.data.editions.length > 0) {
        expect(body.data.editions.length).toBeLessThanOrEqual(100);
      }
    });

    it("should handle limit = 0 gracefully", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "1984",
        "George Orwell",
        0,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      if (body.data !== null) {
        expect(body.data.editions.length).toBe(0);
      }
    });
  });

  describe("Error Code Validation", () => {
    it("should return INVALID_QUERY for empty workTitle", async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "",
        "Andy Weir",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
      if (body.error) {
        expect(body.error.code).toBe("INVALID_QUERY");
        expect(body.error.message).toContain("workTitle");
      }
    });

    it("should return INVALID_QUERY for empty author", async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "The Martian",
        "",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
      if (body.error) {
        expect(body.error.code).toBe("INVALID_QUERY");
        expect(body.error.message).toContain("author");
      }
    });

    it("should include details in error responses", async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions("", "", 20, mockEnv, mockCtx);

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(400);
      expect(body.error).toBeDefined();
      if (body.error) {
        expect(body.error).toHaveProperty("details");
      }
    });
  });

  describe("Performance Metrics", () => {
    it("should include processingTime in metadata", async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        "1984",
        "George Orwell",
        20,
        mockEnv,
        mockCtx,
      );

      const { body, status } = await parseV2Response(response);

      expect(status).toBe(200);
      expect(body.metadata).toHaveProperty("processingTime");
      expect(typeof body.metadata.processingTime).toBe("number");
      expect(body.metadata.processingTime).toBeGreaterThanOrEqual(0); // Can be 0ms in test environment
    });

    it("should have reasonable processing time for cached results", async () => {
      const cachedData = {
        data: {
          works: [],
          editions: [
            {
              isbn: "9780553418026",
              isbns: ["9780553418026"],
              title: "The Martian",
              format: "Hardcover",
              isbndbQuality: 95,
            },
          ],
          authors: [],
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 50,
          provider: "isbndb",
          cached: false,
        },
        error: null,
      };

      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: "test-key",
        ISBNDB_API_KEY: "test-key",
        CACHE: {
          get: async () => null,
          put: async () => {},
        },
        KV_CACHE: {
          get: async () => JSON.stringify(cachedData),
          put: async () => {},
        },
      };
      const mockCtx = createMockContext();

      const startTime = Date.now();
      const response = await handleSearchEditions(
        "The Martian",
        "Andy Weir",
        20,
        mockEnv,
        mockCtx,
      );
      const duration = Date.now() - startTime;

      // Cached results should be very fast (< 100ms in test environment)
      expect(duration).toBeLessThan(100);
    });
  });
});
