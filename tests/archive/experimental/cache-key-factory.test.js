/**
 * Unit tests for CacheKeyFactory
 * Ensures cache key generation is consistent and predictable
 */

import { describe, test, expect } from "vitest";
import { CacheKeyFactory } from "../src/services/cache-key-factory.js";

describe("CacheKeyFactory", () => {
  describe("authorSearch()", () => {
    test("should generate cache key with default parameters", () => {
      const key = CacheKeyFactory.authorSearch({
        query: "J.R.R. Tolkien",
      });

      // Should normalize query to lowercase
      const expectedQuery = btoa("j.r.r. tolkien").replace(/[/+=]/g, "_");
      const expectedParams = btoa(
        "maxResults=50&showAllEditions=false&sortBy=publicationYear",
      ).replace(/[/+=]/g, "_");

      expect(key).toBe(`auto-search:${expectedQuery}:${expectedParams}`);
    });

    test("should normalize query by trimming and lowercasing", () => {
      const key1 = CacheKeyFactory.authorSearch({ query: "  TOLKIEN  " });
      const key2 = CacheKeyFactory.authorSearch({ query: "tolkien" });

      expect(key1).toBe(key2);
    });

    test("should include custom maxResults parameter", () => {
      const key = CacheKeyFactory.authorSearch({
        query: "tolkien",
        maxResults: 100,
      });

      const expectedParams = btoa(
        "maxResults=100&showAllEditions=false&sortBy=publicationYear",
      ).replace(/[/+=]/g, "_");
      expect(key).toContain(expectedParams);
    });

    test("should include custom sortBy parameter", () => {
      const key = CacheKeyFactory.authorSearch({
        query: "tolkien",
        sortBy: "title",
      });

      const expectedParams = btoa(
        "maxResults=50&showAllEditions=false&sortBy=title",
      ).replace(/[/+=]/g, "_");
      expect(key).toContain(expectedParams);
    });

    test("should include showAllEditions parameter", () => {
      const key = CacheKeyFactory.authorSearch({
        query: "tolkien",
        showAllEditions: true,
      });

      const expectedParams = btoa(
        "maxResults=50&showAllEditions=true&sortBy=publicationYear",
      ).replace(/[/+=]/g, "_");
      expect(key).toContain(expectedParams);
    });

    test("should sort parameters alphabetically for consistency", () => {
      // Regardless of input order, output should be consistent
      const key1 = CacheKeyFactory.authorSearch({
        sortBy: "title",
        query: "tolkien",
        maxResults: 100,
        showAllEditions: true,
      });

      const key2 = CacheKeyFactory.authorSearch({
        query: "tolkien",
        maxResults: 100,
        showAllEditions: true,
        sortBy: "title",
      });

      expect(key1).toBe(key2);
    });

    test("should produce URL-safe base64 encoding", () => {
      const key = CacheKeyFactory.authorSearch({
        query: "special/chars+test=",
      });

      // Should not contain /, +, or = characters
      expect(key).not.toMatch(/[/+=]/);
    });
  });

  describe("bookISBN()", () => {
    test("should generate cache key for ISBN-13", () => {
      const key = CacheKeyFactory.bookISBN("978-0-7432-7356-5");
      expect(key).toBe("search:isbn:isbn=9780743273565");
    });

    test("should generate cache key for ISBN-10", () => {
      const key = CacheKeyFactory.bookISBN("0-7432-7356-9");
      expect(key).toBe("search:isbn:isbn=0743273569");
    });

    test("should normalize ISBN by removing hyphens", () => {
      const key1 = CacheKeyFactory.bookISBN("978-0-7432-7356-5");
      const key2 = CacheKeyFactory.bookISBN("9780743273565");

      expect(key1).toBe(key2);
    });

    test("should handle ISBN without hyphens", () => {
      const key = CacheKeyFactory.bookISBN("9780743273565");
      expect(key).toBe("search:isbn:isbn=9780743273565");
    });
  });

  describe("bookTitle()", () => {
    test("should generate cache key with default maxResults", () => {
      const key = CacheKeyFactory.bookTitle("The Hobbit");
      expect(key).toBe("search:title:maxresults=20&title=the hobbit");
    });

    test("should normalize title by trimming and lowercasing", () => {
      const key1 = CacheKeyFactory.bookTitle("  THE HOBBIT  ");
      const key2 = CacheKeyFactory.bookTitle("the hobbit");

      expect(key1).toBe(key2);
    });

    test("should include custom maxResults parameter", () => {
      const key = CacheKeyFactory.bookTitle("The Hobbit", 50);
      expect(key).toBe("search:title:maxresults=50&title=the hobbit");
    });

    test("should maintain alphabetical parameter order", () => {
      const key = CacheKeyFactory.bookTitle("Test Book", 10);
      // maxresults comes before title alphabetically
      expect(key).toMatch(/^search:title:maxresults=\d+&title=/);
    });

    test("should handle special characters in title", () => {
      const key = CacheKeyFactory.bookTitle(
        "Harry Potter & the Philosopher's Stone",
      );
      expect(key).toBe(
        "search:title:maxresults=20&title=harry potter & the philosopher's stone",
      );
    });
  });

  describe("coverImage()", () => {
    test("should generate cache key for cover image", () => {
      const key = CacheKeyFactory.coverImage("978-0-7432-7356-5");
      expect(key).toBe("cover:9780743273565");
    });

    test("should normalize ISBN by removing hyphens", () => {
      const key1 = CacheKeyFactory.coverImage("978-0-7432-7356-5");
      const key2 = CacheKeyFactory.coverImage("9780743273565");

      expect(key1).toBe(key2);
    });
  });

  describe("generic()", () => {
    test("should generate cache key with sorted parameters", () => {
      const key = CacheKeyFactory.generic("custom:prefix", {
        param2: "value2",
        param1: "value1",
        param3: "value3",
      });

      expect(key).toBe(
        "custom:prefix:param1=value1&param2=value2&param3=value3",
      );
    });

    test("should handle empty parameters", () => {
      const key = CacheKeyFactory.generic("custom:prefix", {});
      expect(key).toBe("custom:prefix:");
    });

    test("should handle single parameter", () => {
      const key = CacheKeyFactory.generic("search:genre", { genre: "fantasy" });
      expect(key).toBe("search:genre:genre=fantasy");
    });

    test("should maintain consistent order regardless of input order", () => {
      const key1 = CacheKeyFactory.generic("prefix", {
        z: "1",
        a: "2",
        m: "3",
      });
      const key2 = CacheKeyFactory.generic("prefix", {
        m: "3",
        z: "1",
        a: "2",
      });

      expect(key1).toBe(key2);
    });
  });

  describe("Consistency across methods", () => {
    test("should produce different keys for different search types", () => {
      const authorKey = CacheKeyFactory.authorSearch({ query: "tolkien" });
      const titleKey = CacheKeyFactory.bookTitle("tolkien");
      const isbnKey = CacheKeyFactory.bookISBN("9780743273565");

      expect(authorKey).not.toBe(titleKey);
      expect(titleKey).not.toBe(isbnKey);
      expect(authorKey).not.toBe(isbnKey);
    });

    test("should produce consistent keys for same inputs", () => {
      // Call multiple times with same params
      const key1 = CacheKeyFactory.bookTitle("The Hobbit", 20);
      const key2 = CacheKeyFactory.bookTitle("The Hobbit", 20);
      const key3 = CacheKeyFactory.bookTitle("The Hobbit", 20);

      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    test("should produce different keys for different inputs", () => {
      const key1 = CacheKeyFactory.bookTitle("The Hobbit");
      const key2 = CacheKeyFactory.bookTitle("The Fellowship of the Ring");

      expect(key1).not.toBe(key2);
    });
  });
});
