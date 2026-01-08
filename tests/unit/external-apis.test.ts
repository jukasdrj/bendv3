import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as externalApis from "../../src/services/external-apis";
import { getCached, setCached } from "../../src/utils/cache/cache";
import { withCircuitBreaker } from "../../src/services/circuit-breaker";

// Mock dependencies
vi.mock("../../src/utils/cache/cache", () => ({
    getCached: vi.fn(),
    setCached: vi.fn(),
}));
vi.mock("../../src/services/circuit-breaker", () => ({
    withCircuitBreaker: vi.fn(),
}));
vi.mock("../../src/utils/analytics-logger", () => ({
    logExternalApiCall: vi.fn((_provider, fn) => fn()),
}));

// Mock normalizers
vi.mock("../../src/services/normalizers/google-books", () => ({
    normalizeGoogleBooksToWork: vi.fn(() => ({ title: "Normalized Work" })),
    normalizeGoogleBooksToEdition: vi.fn(() => ({ title: "Normalized Edition" })),
    ensureWorkForEdition: vi.fn(),
}));

vi.mock("../../src/services/normalizers/openlibrary", () => ({
    normalizeOpenLibraryToWork: vi.fn(() => ({ title: "Normalized OL Work" })),
    normalizeOpenLibraryToEdition: vi.fn(() => ({ title: "Normalized OL Edition" })),
    normalizeOpenLibraryToAuthor: vi.fn((name) => ({ name, gender: "Unknown" })),
}));

vi.mock("../../src/services/normalizers/isbndb", () => ({
    normalizeISBNdbToWork: vi.fn(() => ({ title: "Normalized ISBNdb Work" })),
    normalizeISBNdbToEdition: vi.fn(() => ({ title: "Normalized ISBNdb Edition", isbndbQuality: 10 })),
    normalizeISBNdbToAuthor: vi.fn((name) => ({ name, gender: "Unknown" })),
}));

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("External APIs Service", () => {
    let envMock: any;
    let ctxMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        envMock = {
            CACHE: {
                get: vi.fn(),
                put: vi.fn(),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
            },
            GOOGLE_BOOKS_API_KEY: "test-google-key",
            ISBNDB_API_KEY: "test-isbndb-key",
            CACHE_HOT_TTL: "3600",
            CACHE_COLD_TTL: "86400",
        };
        ctxMock = {
            waitUntil: vi.fn(),
        };

        // Default mock implementation for cache
        (getCached as any).mockResolvedValue(null);
        (withCircuitBreaker as any).mockImplementation((_provider, _env, fn) => fn());
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("searchGoogleBooksById", () => {
        it("should return cached result if available", async () => {
            const cachedResult = { works: [{ title: "Cached Work" }] };
            (getCached as any).mockResolvedValue({ data: cachedResult });

            const result = await externalApis.searchGoogleBooksById("123", envMock, ctxMock);

            expect(getCached).toHaveBeenCalledWith("volumeid:123", envMock, ctxMock);
            expect(result).toEqual(cachedResult);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("should fetch from API on cache miss", async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: "123",
                    volumeInfo: { title: "Test Book", authors: ["Test Author"] },
                }),
            });

            const result = await externalApis.searchGoogleBooksById("123", envMock, ctxMock);

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining("https://www.googleapis.com/books/v1/volumes/123"),
                expect.any(Object)
            );
            expect(result?.works).toHaveLength(1);
            expect(result?.works[0].title).toBe("Normalized Work");
            expect(setCached).toHaveBeenCalled();
        });

        it("should handle API errors", async () => {
             // Mock withCircuitBreaker to throw or return null/error based on implementation
             // The implementation calls searchGoogleBooksById_Uncached which throws
             // withCircuitBreaker just calls the function in the mock
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(externalApis.searchGoogleBooksById("123", envMock, ctxMock))
                .rejects.toThrow("Google Books API error: 404");
        });
    });

    describe("searchGoogleBooks", () => {
        it("should return cached result and filter by maxResults", async () => {
            const cachedResult = {
                works: Array(30).fill({ title: "Work" }),
            };
            (getCached as any).mockResolvedValue({ data: cachedResult });

            const result = await externalApis.searchGoogleBooks("query", { maxResults: 10 }, envMock, ctxMock);

            expect(result?.works).toHaveLength(10);
        });

        it("should fetch from API on cache miss and cache result", async () => {
             fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [{ volumeInfo: { title: "Test Book" } }],
                }),
            });

            const result = await externalApis.searchGoogleBooks("query", { maxResults: 10 }, envMock, ctxMock);

            expect(fetchMock).toHaveBeenCalled();
            expect(result?.works).toHaveLength(1);
            expect(setCached).toHaveBeenCalled();
        });
    });

    describe("searchOpenLibraryById", () => {
        it("should fetch from API and normalize response", async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    key: "/works/OL123W",
                    title: "Test Book",
                }),
            });

            const result = await externalApis.searchOpenLibraryById("OL123W", envMock, ctxMock);

            expect(fetchMock).toHaveBeenCalledWith(
                "https://openlibrary.org/works/OL123W.json",
                expect.any(Object)
            );
            expect(result?.works).toHaveLength(1);
            expect(result?.works[0].title).toBe("Normalized OL Work");
        });

         it("should throw error if API call fails", async () => {
             // normalizeOpenLibrarySearchResults returns empty arrays if no docs
             // simulate empty response normalization via mock?
             // Actually `normalizeOpenLibrarySearchResults` takes docs array.
             // searchOpenLibraryById wraps single result in array.
             // if single result is valid, it produces 1 work.

             // To simulate null return, we need to ensure the normalized data has no works.
             // But our mock normalizer always returns a work.
             // We can customize the mock for this test or assume success path coverage is enough for now.
             // Let's test API failure.

            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

             await expect(externalApis.searchOpenLibraryById("OL123W", envMock, ctxMock))
                .rejects.toThrow("OpenLibrary work API failed: 404");
        });
    });

    describe("searchISBNdb", () => {
         it("should return cached result", async () => {
            const cachedResult = { works: [{ title: "Cached ISBNdb Work" }] };
            (getCached as any).mockResolvedValue({ data: cachedResult });

            const result = await externalApis.searchISBNdb("title", "author", envMock, ctxMock);
             expect(result).toEqual(cachedResult);
         });

         it("should fetch from API and handle rate limits", async () => {
            envMock.CACHE.get.mockResolvedValue(null); // No rate limit key
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    books: [{ title: "Test Book", authors: ["Test Author"] }],
                }),
            });

            const result = await externalApis.searchISBNdb("title", "author", envMock, ctxMock);

            expect(envMock.CACHE.put).toHaveBeenCalledWith("isbndb_last_request", expect.any(String), expect.any(Object));
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining("api2.isbndb.com/search/books"),
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: "test-isbndb-key" }) })
            );
            expect(result?.works).toHaveLength(1);
         });

         it("should handle missing API key", async () => {
             envMock.ISBNDB_API_KEY = null;
              await expect(externalApis.searchISBNdb("title", "author", envMock, ctxMock))
                .rejects.toThrow("ISBNDB_API_KEY secret not found");
         });
    });
});
