/**
 * GET /v1/search/isbn
 *
 * Search for books by ISBN using canonical response format
 * Refactored to use shared enrichMultipleBooks() service for consistency
 *
 * @deprecated This V1 endpoint is deprecated and will be removed on March 1, 2026.
 * Use the V3 API instead: GET /v3/books/:isbn
 *
 * Migration guide:
 * - V1: GET /v1/search/isbn?isbn=9780439708180
 * - V3: GET /v3/books/9780439708180
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
import { findBookByISBN } from "../../services/book-service"; // Sprint 2: BookRepository integration
import { normalizeISBN } from "../../utils/normalization.js";
import { isValidISBN } from "../../utils/isbn-validation.js"; // Issue CR-3: Shared ISBN validation
import {
  extractUniqueAuthors,
  removeAuthorsFromWorks,
  enrichAuthorsWithCulturalData,
} from "../../utils/response-transformer.js";
import { writeCacheMetrics } from "../../utils/analytics.js";
import { ISBNdbAPI } from "../../services/isbndb-api.js"; // Issue #188: ISBNdb fallback

export async function handleSearchISBN(
  isbn: string,
  env: any,
  request: Request | null = null,
  ctx?: ExecutionContext,
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!isbn || isbn.trim().length === 0) {
    return createErrorResponse(
      "ISBN is required",
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request,
    );
  }

  // Check for lenient mode (skip checksum validation for cache warming with dirty CSV data)
  const url = request ? new URL(request.url) : null;
  const lenient = url?.searchParams.get('lenient') === 'true';

  // Lenient mode: Only check basic format (10 or 13 digits), skip checksum
  // Strict mode (default): Full ISBN validation with checksum
  if (!lenient && !isValidISBN(isbn)) {
    return createErrorResponse(
      "Invalid ISBN format. Must be valid ISBN-10 or ISBN-13",
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request,
    );
  }

  // Lenient mode basic validation
  if (lenient) {
    const cleaned = isbn.replace(/[-\s]/g, '');
    if (!/^\d{10,13}$/.test(cleaned)) {
      return createErrorResponse(
        "Invalid ISBN format. Must be 10-13 digits",
        400,
        ErrorCodes.INVALID_ISBN,
        { isbn },
        request,
      );
    }
  }

  try {
    // Normalize ISBN for consistent cache keys
    const normalizedISBN = normalizeISBN(isbn);
    console.log(
      `v1 ISBN search for "${isbn}" (normalized: "${normalizedISBN}") (using BookRepository + enrichment)`,
    );

    // Sprint 2: Use book-service which checks BookRepository (KV/D1) first, then external APIs
    let result = await findBookByISBN(normalizedISBN, env, ctx);

    let provider = result?.works?.[0]?.primaryProvider || "none";
    const cached = result.cached || false;

    // Issue #188: Fallback to ISBNdb if no results from primary sources
    if (!result || !result.works || result.works.length === 0) {
      console.log(`[ISBN Search] Primary sources failed, falling back to ISBNdb for ${normalizedISBN}`);

      try {
        const isbndb = new ISBNdbAPI(env.ISBNDB_API_KEY);
        const isbndbResult = await isbndb.fetchBook(normalizedISBN);

        if (isbndbResult) {
          // Map ISBNdb result to canonical format
          result = {
            works: [{
              title: isbndbResult.title,
              subjectTags: [],
              goodreadsWorkIDs: [],
              amazonASINs: [],
              librarythingIDs: [],
              googleBooksVolumeIDs: [],
              isbndbQuality: 100,
              reviewStatus: "verified",
              coverImageURL: isbndbResult.image,
              primaryProvider: "isbndb",
              synthetic: false,
            }],
            editions: [{
              isbns: [normalizedISBN],
              format: "Unknown",
              amazonASINs: [],
              googleBooksVolumeIDs: [],
              librarythingIDs: [],
              isbndbQuality: 100,
              publisher: isbndbResult.publisher,
              publicationDate: isbndbResult.publishedDate,
              coverImageURL: isbndbResult.image,
              primaryProvider: "isbndb",
            }],
            authors: isbndbResult.authors.map((name: string) => ({ name })),
          };
          provider = "isbndb";
          console.log(`[ISBN Search] ✅ ISBNdb fallback successful for ${normalizedISBN}`);
        }
      } catch (isbndbError) {
        console.warn(`[ISBN Search] ISBNdb fallback failed:`, isbndbError);
      }
    }

    const processingTime = Date.now() - startTime;

    if (!result || !result.works || result.works.length === 0) {
      // Book not found in any provider
      // Still log to Analytics Engine for ISBN harvest tracking
      await writeCacheMetrics(env, {
        endpoint: "/v1/search/isbn",
        isbn: normalizedISBN,
        cacheHit: false,
        responseTime: processingTime,
        imageQuality: "NONE",
        dataCompleteness: 0,
        itemCount: 0,
      });

      return createSuccessResponse(
        { works: [], editions: [], authors: [], resultCount: 0 },
        {
          processingTime,
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

    // Log ISBN search to Analytics Engine for daily harvest
    const work = cleanWorks[0];
    const hasCovers =
      work?.coverImageURL || result.editions?.some((e: any) => e.coverURL);
    await writeCacheMetrics(env, {
      endpoint: "/v1/search/isbn",
      isbn: normalizedISBN,
      cacheHit: cached, // Sprint 2: Track BookRepository cache hits (KV or D1)
      responseTime: processingTime,
      imageQuality: hasCovers ? "MEDIUM" : "NONE",
      dataCompleteness: work ? 75 : 0, // Simplified: assume 75% completeness for found books
      itemCount: cleanWorks.length,
    });

    return createSuccessResponse(
      {
        works: cleanWorks,
        editions: result.editions,
        authors,
        resultCount: cleanWorks.length,
      },
      {
        processingTime,
        provider: provider, // Issue #188: Updated to reflect actual provider (includes isbndb fallback)
        cached, // Sprint 2: Reflect actual cache status from BookRepository
      },
      200,
      request,
    );
  } catch (error: any) {
    console.error("Error in v1 ISBN search:", error);
    return createErrorResponse(
      error.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString(), processingTime: Date.now() - startTime },
      request,
    );
  }
}
