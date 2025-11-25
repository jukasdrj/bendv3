/**
 * ISBNdb API Service Tests
 * Tests SecretBinding resolution and API key validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ISBNdbAPI } from "../../src/services/isbndb-api.js";

describe("ISBNdbAPI", () => {
  describe("Constructor and API Key", () => {
    it("should accept plain string API key", () => {
      const apiKey = "test-api-key-123";
      const api = new ISBNdbAPI(apiKey);
      expect(api.apiKey).toBe(apiKey);
    });

    it("should throw error if API key is not configured", () => {
      expect(() => new ISBNdbAPI(null)).toThrow("ISBNDB_API_KEY not configured");
      expect(() => new ISBNdbAPI(undefined)).toThrow("ISBNDB_API_KEY not configured");
    });
  });

  describe("fetchBook", () => {
    beforeEach(() => {
      // Reset fetch mock before each test
      global.fetch = vi.fn();
    });

    it("should use resolved API key in request headers", async () => {
      const apiKey = "test-api-key-789";
      const api = new ISBNdbAPI(apiKey);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          book: {
            title: "Test Book",
            image: "https://example.com/cover.jpg",
            authors: ["Test Author"],
          },
        }),
      });

      await api.fetchBook("9780451524935");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api2.isbndb.com/book/9780451524935",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: apiKey,
          }),
        }),
      );
    });

    it("should not expose API key in error messages", async () => {
      const apiKey = "secret-key-should-not-appear";
      const api = new ISBNdbAPI(apiKey);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      try {
        await api.fetchBook("9780451524935");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // Error message should not contain the API key
        expect(error.message).not.toContain(apiKey);
        expect(error.message).toContain("ISBNdb API error: 401");
      }
    });
  });

  describe("healthCheck", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("should use API key in health check", async () => {
      const apiKey = "secret-health-key";
      const api = new ISBNdbAPI(apiKey);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await api.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: apiKey,
          }),
        }),
      );
      expect(result).toBe(true);
    });

    it("should not expose API key in health check errors", async () => {
      const apiKey = "secret-key-should-not-leak";
      const api = new ISBNdbAPI(apiKey);

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Capture console.error to verify it doesn't leak the key
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await api.healthCheck();

      expect(result).toBe(false);

      // Check that console.error was called but didn't leak the API key
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(errorCalls).not.toContain(apiKey);

      consoleErrorSpy.mockRestore();
    });
  });
});
