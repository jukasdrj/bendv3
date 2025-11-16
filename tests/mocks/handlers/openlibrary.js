/**
 * MSW Handlers for OpenLibrary API
 *
 * Mocks the OpenLibrary API for testing without hitting real endpoints
 * Prevents rate limiting and ensures deterministic test results
 */

import { http, HttpResponse } from "msw";

/**
 * Mock response for a successful book search
 */
const mockSearchResponse = {
  numFound: 1,
  start: 0,
  numFoundExact: true,
  docs: [
    {
      key: "/works/OL45804W",
      title: "The Google story",
      author_name: ["David A. Vise", "Mark Malseed"],
      first_publish_year: 2005,
      isbn: ["9780739314821", "0739314823"],
      publisher: ["Random House Digital, Inc."],
      language: ["eng"],
      number_of_pages_median: 207,
      edition_count: 5,
    },
  ],
};

/**
 * Mock response for no results found
 */
const mockEmptyResponse = {
  numFound: 0,
  start: 0,
  numFoundExact: true,
  docs: [],
};

/**
 * OpenLibrary API Handlers
 */
export const openLibraryHandlers = [
  // Search endpoint
  http.get("https://openlibrary.org/search.json", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");

    // Return mock results for any query (for testing purposes)
    if (query) {
      return HttpResponse.json(mockSearchResponse);
    }

    // Return empty for no query
    return HttpResponse.json(mockEmptyResponse);
  }),

  // Author search endpoint
  http.get("https://openlibrary.org/search/authors.json", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");

    if (query) {
      return HttpResponse.json({
        numFound: 1,
        docs: [
          {
            key: "/authors/OL23919A",
            name: query, // Return searched author name
            work_count: 100,
          },
        ],
      });
    }

    return HttpResponse.json({ numFound: 0, docs: [] });
  }),

  // Author works endpoint
  http.get(
    "https://openlibrary.org/authors/:authorKey/works.json",
    ({ params }) => {
      const { authorKey } = params;

      // Generate mock works for any author
      const mockWorks = Array.from({ length: 100 }, (_, i) => ({
        key: `/works/OL${45804 + i}W`,
        title: `Test Book ${i + 1}`,
        first_publish_year: 2000 + (i % 25),
        edition_count: Math.floor(Math.random() * 10) + 1,
        authors: [
          {
            author: {
              key: `/${authorKey}`,
            },
            type: {
              key: "/type/author_role",
            },
          },
        ],
      }));

      return HttpResponse.json({
        size: mockWorks.length,
        entries: mockWorks,
      });
    },
  ),

  // Simulate server error (500)
  http.get("https://openlibrary.org/search-error.json", () => {
    return new HttpResponse(null, { status: 500 });
  }),
];

/**
 * Create a custom OpenLibrary response
 * Useful for testing specific scenarios
 */
export function createOpenLibraryResponse(overrides = {}) {
  return {
    ...mockSearchResponse,
    docs: mockSearchResponse.docs.map((doc) => ({
      ...doc,
      ...overrides,
    })),
  };
}

/**
 * Create a custom OpenLibrary handler
 * For one-off test cases that need specific responses
 */
export function createOpenLibraryHandler(query, response) {
  return http.get("https://openlibrary.org/search.json", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");

    if (q?.includes(query)) {
      return HttpResponse.json(response);
    }

    return HttpResponse.json(mockEmptyResponse);
  });
}
