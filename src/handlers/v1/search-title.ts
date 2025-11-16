/**
 * GET /v1/search/title
 *
 * Search for books by title using canonical response format
 * Returns up to 20 results for iOS search UI
 */

import type { BookSearchResponse } from '../../types/responses.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';
import { enrichMultipleBooks } from '../../services/enrichment.ts';
import { normalizeTitle } from '../../utils/normalization.js';
import { extractUniqueAuthors, removeAuthorsFromWorks, enrichAuthorsWithCulturalData } from '../../utils/response-transformer.js';

export async function handleSearchTitle(
  query: string,
  env: any,
  request: Request | null = null
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!query || query.trim().length === 0) {
    return createErrorResponse(
      'Search query is required',
      400,
      ErrorCodes.INVALID_QUERY,
      { query },
      request
    );
  }

  try {
    // Normalize title for consistent cache keys
    const normalizedTitle = normalizeTitle(query);
    console.log(`v1 title search for "${query}" (normalized: "${normalizedTitle}") (using enrichMultipleBooks, maxResults: 20)`);

    // Use enrichMultipleBooks for search endpoints (returns up to 20 results)
    const result = await enrichMultipleBooks({ title: normalizedTitle }, env, { maxResults: 20 });

    if (!result || !result.works || result.works.length === 0) {
      // No books found in any provider
      return createSuccessResponse(
        { works: [], editions: [], authors: [] },
        {
          processingTime: Date.now() - startTime,
          provider: 'none',
          cached: false,
        },
        200,
        request
      );
    }

    // Extract all unique authors from works
    const baseAuthors = extractUniqueAuthors(result.works);

    // Enrich authors with cultural diversity data from Wikidata
    const authors = await enrichAuthorsWithCulturalData(baseAuthors, env);

    // Remove authors property from works (not part of canonical WorkDTO)
    const cleanWorks = removeAuthorsFromWorks(result.works);

    return createSuccessResponse(
      { works: cleanWorks, editions: result.editions, authors },
      {
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider, // Use actual provider from enriched work
        cached: false,
      },
      200,
      request
    );
  } catch (error: any) {
    console.error('Error in v1 title search:', error);
    return createErrorResponse(
      error.message || 'Internal server error',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
