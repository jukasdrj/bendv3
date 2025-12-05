/**
 * GET /v1/search/title
 *
 * Search for books by title using canonical response format
 * Returns up to 20 results for iOS search UI
 *
 * @deprecated This V1 endpoint is deprecated and will be removed on March 1, 2026.
 * Use the V3 API instead: GET /v3/books/search?q=title
 *
 * Migration guide:
 * - V1: GET /v1/search/title?q=harry+potter
 * - V3: GET /v3/books/search?q=harry+potter
 *
 * @see {@link /docs/V1_SUNSET_PLAN.md} for complete migration details
 * @sunset 2026-03-01
 */

import type { BookSearchResponse } from "../../types/responses.js";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from "../../utils/response-builder.js";
import { findBooksByTitle } from "../../services/book-service"; // Sprint 2: BookRepository integration
import { normalizeTitle } from "../../utils/normalization.js";
import {
  extractUniqueAuthors,
  removeAuthorsFromWorks,
  enrichAuthorsWithCulturalData,
} from "../../utils/response-transformer.js";

export async function handleSearchTitle(
  query: string,
  env: any,
  request: Request | null = null,
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!query || query.trim().length === 0) {
    return createErrorResponse(
      "Search query is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { query },
      request,
    );
  }

  try {
    // Normalize title for consistent cache keys
    const normalizedTitle = normalizeTitle(query);
    console.log(
      `v1 title search for "${query}" (normalized: "${normalizedTitle}") (using book-service, maxResults: 20)`,
    );

    // Sprint 2: Use book-service (currently goes directly to external APIs for title searches)
    // Future enhancement: Cache individual books found in title search results
    const result = await findBooksByTitle(normalizedTitle, undefined, env, {
      maxResults: 20,
    });

    if (!result || !result.works || result.works.length === 0) {
      // No books found in any provider
      return createSuccessResponse(
        { works: [], editions: [], authors: [], resultCount: 0 },
        {
          processingTime: Date.now() - startTime,
          provider: "none",
          cached: false,
        },
        200,
        request,
      );
    }

    // Extract all unique authors from works
    const baseAuthors = extractUniqueAuthors(result.works);

    // Enrich authors with cultural diversity data from Wikidata
    const authors = await enrichAuthorsWithCulturalData(baseAuthors, env);

    // Remove authors property from works (not part of canonical WorkDTO)
    const cleanWorks = removeAuthorsFromWorks(result.works);

    return createSuccessResponse(
      {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length,
      },
      {
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider, // Use actual provider from enriched work
        cached: false,
      },
      200,
      request,
    );
  } catch (error: any) {
    console.error("Error in v1 title search:", error);
    return createErrorResponse(
      error.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString(), processingTime: Date.now() - startTime },
      request,
    );
  }
}
