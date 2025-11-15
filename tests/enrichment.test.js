// test/enrichment.test.js
/**
 * Unit tests for enrichment service
 *
 * Tests core enrichment logic for single and multiple book lookups
 * with multi-provider fallback (Google Books → OpenLibrary)
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  enrichSingleBook,
  enrichMultipleBooks,
} from "../src/services/enrichment.js";
import * as externalApis from "../src/services/external-apis.ts";

// Mock external APIs module
vi.mock("../src/services/external-apis.ts", () => ({
  searchGoogleBooks: vi.fn(),
  searchGoogleBooksById: vi.fn(),
  searchGoogleBooksByISBN: vi.fn(),
  searchOpenLibrary: vi.fn(),
  searchOpenLibraryById: vi.fn(),
  searchOpenLibraryByGoodreadsId: vi.fn(),
  getOpenLibraryAuthorWorks: vi.fn(),
  searchISBNdb: vi.fn(),
  getISBNdbEditionsForWork: vi.fn(),
  getISBNdbBookByISBN: vi.fn(),
}));

describe("enrichSingleBook()", () => {
  let mockEnv;

  beforeEach(() => {
    // Mock environment bindings
    mockEnv = {
      GOOGLE_BOOKS_API_KEY: "test-key",
      GOOGLE_BOOKS_ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    };

    // Reset all mocks before each test
    vi.resetAllMocks();
  });

  test("returns WorkDTO for valid book (Google Books)", async () => {
    // Mock successful Google Books response
    const mockWork = {
      work: {
        title: "1984",
        authors: [{ name: "George Orwell" }],
        primaryProvider: "google-books",
        contributors: ["google-books"],
        synthetic: false,
      },
      edition: { isbn13: "9780451524935" },
      authors: [{ name: "George Orwell" }],
    };
    const searchByISBNSpy = vi.spyOn(externalApis, 'searchGoogleBooksByISBN').mockResolvedValue({
      success: true,
      works: [mockWork.work],
      editions: [mockWork.edition],
      authors: mockWork.authors,
    });

    const result = await enrichSingleBook({ isbn: "9780451524935" }, mockEnv);

    expect(result).toMatchObject({
      work: {
        title: "1984",
        authors: [{ name: "George Orwell" }],
        primaryProvider: "google-books",
        contributors: ["google-books"],
        synthetic: false,
      },
    });
    expect(searchByISBNSpy).toHaveBeenCalledWith(
      "9780451524935",
      mockEnv,
    );
  });

  test("returns WorkDTO for title+author search (Google Books)", async () => {
    // Mock successful Google Books response
    const mockWork = {
      work: {
        title: "Pride and Prejudice",
        authors: [{ name: "Jane Austen" }],
        primaryProvider: "google-books",
        contributors: ["google-books"],
      },
      edition: null,
      authors: [{ name: "Jane Austen" }],
    };
    const searchGoogleBooksSpy = vi.spyOn(externalApis, 'searchGoogleBooks').mockResolvedValue({
      success: true,
      works: [mockWork.work],
      authors: mockWork.authors,
    });
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({ success: false });


    const result = await enrichSingleBook(
      { title: "Pride and Prejudice", author: "Jane Austen" },
      mockEnv,
    );

    expect(result).toMatchObject({
      work: {
        title: "Pride and Prejudice",
        authors: [{ name: "Jane Austen" }],
        primaryProvider: "google-books",
        contributors: ["google-books"],
      },
    });
    expect(searchGoogleBooksSpy).toHaveBeenCalledWith(
      "Pride and Prejudice Jane Austen",
      { maxResults: 1 },
      mockEnv,
    );
  });

  test("returns null for unknown book", async () => {
    // Mock: All providers return no results
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({
      success: true,
      works: [],
    });
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [],
    });
    externalApis.searchOpenLibrary.mockResolvedValue({
      success: true,
      works: [],
    });

    const result = await enrichSingleBook(
      { title: "XYZ123NonexistentBook" },
      mockEnv,
    );

    expect(result).toBeNull();
  });

  test("tries Google Books first, OpenLibrary as fallback", async () => {
    // Mock: Google Books returns nothing
    const searchGoogleBooksSpy = vi.spyOn(externalApis, 'searchGoogleBooks').mockResolvedValue({
      success: true,
      works: [],
    });

    // Mock: OpenLibrary returns result
    const mockWork = {
      work: {
        title: "Obscure Indie Book",
        authors: [{ name: "Unknown Author" }],
        primaryProvider: "openlibrary",
        contributors: ["openlibrary"],
      },
      edition: null,
      authors: [{ name: "Unknown Author" }],
    };
    const searchOpenLibrarySpy = vi.spyOn(externalApis, 'searchOpenLibrary').mockResolvedValue({
      success: true,
      works: [mockWork.work],
      authors: mockWork.authors,
    });
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({ success: false });


    const result = await enrichSingleBook(
      { title: "Obscure Indie Book" },
      mockEnv,
    );

    expect(result).not.toBeNull();
    expect(result.work.primaryProvider).toBe("openlibrary");
    expect(result.work.contributors).toEqual(["openlibrary"]);
    expect(searchGoogleBooksSpy).toHaveBeenCalled();
    expect(searchOpenLibrarySpy).toHaveBeenCalled();
  });

  test("handles API errors gracefully (returns null)", async () => {
    // Mock: Google Books throws network error
    externalApis.searchGoogleBooks.mockRejectedValue(
      new Error("Network timeout"),
    );

    // Mock: OpenLibrary also fails
    externalApis.searchOpenLibrary.mockRejectedValue(
      new Error("Service unavailable"),
    );

    const result = await enrichSingleBook({ title: "Any Book" }, mockEnv);

    // Should not throw, returns null for graceful degradation
    expect(result).toBeNull();
  });

  test("returns null when no search parameters provided", async () => {
    const result = await enrichSingleBook({}, mockEnv);
    expect(result).toBeNull();

    // Should not call any external APIs
    expect(externalApis.searchGoogleBooks).not.toHaveBeenCalled();
    expect(externalApis.searchOpenLibrary).not.toHaveBeenCalled();
  });

  test("prioritizes ISBN search over title search", async () => {
    // Mock: ISBN search succeeds
    const mockWork = {
      work: {
        title: "The Great Gatsby",
      },
    };
    const searchByISBNSpy = vi.spyOn(externalApis, 'searchGoogleBooksByISBN').mockResolvedValue({
      success: true,
      works: [mockWork.work],
    });
    const searchGoogleBooksSpy = vi.spyOn(externalApis, 'searchGoogleBooks');

    const result = await enrichSingleBook(
      { isbn: "9780743273565", title: "The Great Gatsby" },
      mockEnv,
    );

    expect(result).not.toBeNull();
    expect(result.work.title).toBe("The Great Gatsby");

    // Should use ISBN search, not title search
    expect(searchByISBNSpy).toHaveBeenCalled();
    expect(searchGoogleBooksSpy).not.toHaveBeenCalled();
  });

  test("falls back to OpenLibrary if Google Books title search fails", async () => {
    // Mock: Google Books title search returns no results
    const searchGoogleBooksSpy = vi.spyOn(externalApis, 'searchGoogleBooks').mockResolvedValue({
      success: true,
      works: [],
    });

    // Mock: OpenLibrary title search succeeds
    const mockWork = {
      work: {
        title: "Obscure Indie Book",
        primaryProvider: "openlibrary",
      },
    };
    const searchOpenLibrarySpy = vi.spyOn(externalApis, 'searchOpenLibrary').mockResolvedValue({
      success: true,
      works: [mockWork.work],
    });
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({ success: false });


    const result = await enrichSingleBook(
      { title: "Obscure Indie Book", author: "Independent Author" },
      mockEnv,
    );

    expect(result).not.toBeNull();
    expect(result.work.title).toBe("Obscure Indie Book");
    expect(result.work.primaryProvider).toBe("openlibrary");

    // Should try Google Books first, then fall back to OpenLibrary
    expect(searchGoogleBooksSpy).toHaveBeenCalled();
    expect(searchOpenLibrarySpy).toHaveBeenCalled();
  });
});

describe("enrichMultipleBooks()", () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      GOOGLE_BOOKS_API_KEY: "test-key",
      GOOGLE_BOOKS_ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    };

    vi.resetAllMocks();
  });

  test("returns array of WorkDTOs for valid search", async () => {
    // Mock: Google Books returns multiple results
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [
        {
          title: "1984",
          authors: [{ name: "George Orwell" }],
          editions: [],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "approved",
          synthetic: false,
        },
        {
          title: "Animal Farm",
          authors: [{ name: "George Orwell" }],
          editions: [],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "approved",
          synthetic: false,
        },
      ],
    });

    const results = await enrichMultipleBooks({ title: "Orwell" }, mockEnv);

    expect(results.works.length).toBeGreaterThan(0);
    expect(results.works).toHaveLength(2);
    expect(results.works[0]).toHaveProperty("title");
    expect(results.works[0]).toHaveProperty("primaryProvider", "google-books");
    expect(results.works[0]).toHaveProperty("contributors", ["google-books"]);
  });

  test("returns empty array for unknown search", async () => {
    // Mock: All providers return no results
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [],
    });
    externalApis.searchOpenLibrary.mockResolvedValue({
      success: true,
      works: [],
    });

    const results = await enrichMultipleBooks(
      { title: "XYZ123Nonexistent" },
      mockEnv,
    );

    expect(results).toEqual({ works: [], editions: [], authors: [] });
  });

  test("respects maxResults parameter", async () => {
    // Mock: Google Books returns limited results
    const mockWorks = Array.from({ length: 5 }, (_, i) => ({
      title: `Book ${i + 1}`,
      authors: [{ name: "Test Author" }],
      editions: [],
      subjectTags: [],
      goodreadsWorkIDs: [],
      amazonASINs: [],
      librarythingIDs: [],
      googleBooksVolumeIDs: [],
      isbndbQuality: 0,
      reviewStatus: "approved",
      synthetic: false,
    }));

    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: mockWorks,
    });

    const results = await enrichMultipleBooks({ title: "Test" }, mockEnv, {
      maxResults: 5,
    });

    expect(results.works).toHaveLength(5);
    expect(externalApis.searchGoogleBooks).toHaveBeenCalledWith(
      "Test",
      { maxResults: 5 },
      mockEnv,
    );
  });

  test("defaults to maxResults=20 when not specified", async () => {
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [],
    });

    await enrichMultipleBooks({ title: "Test" }, mockEnv);

    expect(externalApis.searchGoogleBooks).toHaveBeenCalledWith(
      "Test",
      { maxResults: 20 },
      mockEnv,
    );
  });

  test("handles API errors gracefully (returns empty array)", async () => {
    // Mock: Google Books throws error
    externalApis.searchGoogleBooks.mockRejectedValue(
      new Error("API rate limit exceeded"),
    );

    const results = await enrichMultipleBooks({ title: "Any Book" }, mockEnv);

    // Should not throw, returns empty result for graceful degradation
    expect(results).toEqual({ works: [], editions: [], authors: [] });
  });

  test("combines title and author in search query", async () => {
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [],
    });

    await enrichMultipleBooks(
      { title: "Pride and Prejudice", author: "Jane Austen" },
      mockEnv,
    );

    expect(externalApis.searchGoogleBooks).toHaveBeenCalledWith(
      "Pride and Prejudice Jane Austen",
      { maxResults: 20 },
      mockEnv,
    );
  });

  test("returns single result for ISBN search", async () => {
    // Mock: ISBN search returns one book
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({
      success: true,
      works: [
        {
          title: "1984",
          authors: [{ name: "George Orwell" }],
          editions: [{ isbn13: "9780451524935" }],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "approved",
          synthetic: false,
        },
      ],
    });

    const results = await enrichMultipleBooks(
      { isbn: "9780451524935" },
      mockEnv,
      { maxResults: 1 },
    );

    expect(results.works).toHaveLength(1);
    expect(results.works[0].title).toBe("1984");
    expect(externalApis.searchGoogleBooksByISBN).toHaveBeenCalledWith(
      "9780451524935",
      mockEnv,
    );
  });

  test("returns empty result for ISBN not found", async () => {
    externalApis.searchGoogleBooksByISBN.mockResolvedValue({
      success: true,
      works: [],
    });

    const results = await enrichMultipleBooks({ isbn: "9999999999" }, mockEnv);

    expect(results).toEqual({ works: [], editions: [], authors: [] });
  });

  test("falls back to OpenLibrary when Google Books returns no results", async () => {
    // Mock: Google Books returns nothing
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [],
    });

    // Mock: OpenLibrary returns results
    externalApis.searchOpenLibrary.mockResolvedValue({
      success: true,
      works: [
        {
          title: "Indie Book",
          authors: [{ name: "Indie Author" }],
          editions: [],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "pending",
          synthetic: false,
        },
      ],
    });

    const results = await enrichMultipleBooks({ title: "Indie Book" }, mockEnv);

    expect(results.works).toHaveLength(1);
    expect(results.works[0].primaryProvider).toBe("openlibrary");
    expect(externalApis.searchGoogleBooks).toHaveBeenCalled();
    expect(externalApis.searchOpenLibrary).toHaveBeenCalled();
  });

  test("returns empty result when no search parameters provided", async () => {
    const results = await enrichMultipleBooks({}, mockEnv);

    expect(results).toEqual({ works: [], editions: [], authors: [] });

    // Should not call any external APIs
    expect(externalApis.searchGoogleBooks).not.toHaveBeenCalled();
    expect(externalApis.searchOpenLibrary).not.toHaveBeenCalled();
  });

  test("adds provenance fields to all results", async () => {
    externalApis.searchGoogleBooks.mockResolvedValue({
      success: true,
      works: [
        {
          title: "Book 1",
          authors: [],
          editions: [],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "approved",
          synthetic: false,
        },
        {
          title: "Book 2",
          authors: [],
          editions: [],
          subjectTags: [],
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 0,
          reviewStatus: "approved",
          synthetic: false,
        },
      ],
    });

    const results = await enrichMultipleBooks({ title: "Test" }, mockEnv);

    // All results should have provenance fields
    results.works.forEach((work) => {
      expect(work).toHaveProperty("primaryProvider");
      expect(work).toHaveProperty("contributors");
      expect(work).toHaveProperty("synthetic");
    });
  });
});
