/**
 * Mocks for External APIs
 *
 * This file contains mock implementations for the external APIs that the
 * application interacts with, such as OpenLibrary, Google Books, and ISBNdb.
 *
 * These mocks are designed to be used in Vitest tests to simulate the behavior
 * of these external services, allowing for isolated and deterministic tests.
 *
 * The mocks are applied in `tests/setup.js`.
 */

import { vi } from 'vitest';

// =============================================================================
// Mock API Endpoints
// =============================================================================

const initialMockApiResponses = {
  'https://openlibrary.org/search.json': {
    docs: [{ title: 'Mock Book' }],
  },
  'https://www.googleapis.com/books/v1/volumes': {
    items: [{ volumeInfo: { title: 'Mock Book' } }],
  },
  'https://api.isbndb.com/book/978-0-321-76572-3': {
    book: { title: 'Mock Book' },
  },
};

let mockApiResponses = { ...initialMockApiResponses };

// =============================================================================
// Mock `fetch` Implementation
// =============================================================================

const originalFetch = global.fetch;

export const mockFetch = vi.fn(async (url, options) => {
  const urlString = typeof url === 'string' ? url : url.url;
  const urlWithoutQuery = urlString.split('?')[0];

  if (mockApiResponses[urlWithoutQuery]) {
    const mock = mockApiResponses[urlWithoutQuery];
    return new Response(JSON.stringify(mock.data || mock), {
      status: mock.status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fallback to the original `fetch` for any unhandled requests
  return originalFetch(url, options);
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sets a custom mock response for a specific URL for the duration of a test.
 *
 * @param {string} url - The URL to mock.
 * @param {object} response - The mock response data.
 * @param {number} [status=200] - The HTTP status code.
 */
export const setMockResponse = (url, response, status = 200) => {
  mockApiResponses[url] = { data: response, status };
};

/**
 * Resets all mock responses to their initial default state.
 */
export const clearMockResponses = () => {
  mockApiResponses = { ...initialMockApiResponses };
};
