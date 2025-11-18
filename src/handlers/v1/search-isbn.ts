/**
 * GET /v1/search/isbn
 *
 * Search for books by ISBN using canonical response format
 * Refactored to use shared enrichMultipleBooks() service for consistency
 */

import type { BookSearchResponse } from '../../types/responses.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';
import { enrichMultipleBooks } from '../../services/enrichment.ts';
import { normalizeISBN } from '../../utils/normalization.js';
import { extractUniqueAuthors, removeAuthorsFromWorks, enrichAuthorsWithCulturalData } from '../../utils/response-transformer.js';
import { writeCacheMetrics } from '../../utils/analytics.js';

// ISBN validation regex constants (DRY principle - avoids duplication across functions)
const ISBN10_REGEX = /^\d{9}[\dX]$/i;
const ISBN13_REGEX = /^\d{13}$/;

/**
 * Validates an ISBN-10 string using the Modulo 11 checksum algorithm.
 * Assumes the input is a cleaned 10-character string (9 digits + 1 digit/X).
 *
 * @param {string} cleanedIsbn - The 10-character ISBN-10 string without hyphens or spaces.
 * @returns {boolean} True if the ISBN-10 is valid, false otherwise.
 */
function isValidISBN10Checksum(cleanedIsbn: string): boolean {
  // Defensive check, though primary validation should happen before calling this
  if (cleanedIsbn.length !== 10 || !ISBN10_REGEX.test(cleanedIsbn)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanedIsbn[i], 10) * (10 - i);
  }

  const checkChar = cleanedIsbn[9].toUpperCase();
  const checkDigit = checkChar === 'X' ? 10 : parseInt(checkChar, 10);

  return (sum + checkDigit) % 11 === 0;
}

/**
 * Validates an ISBN-13 string using the Modulo 10 checksum algorithm.
 * Assumes the input is a cleaned 13-digit string.
 *
 * @param {string} cleanedIsbn - The 13-digit ISBN-13 string without hyphens or spaces.
 * @returns {boolean} True if the ISBN-13 is valid, false otherwise.
 */
function isValidISBN13Checksum(cleanedIsbn: string): boolean {
  // Defensive check, though primary validation should happen before calling this
  if (cleanedIsbn.length !== 13 || !ISBN13_REGEX.test(cleanedIsbn)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleanedIsbn[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }

  const checkDigit = parseInt(cleanedIsbn[12], 10);
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;

  return calculatedCheckDigit === checkDigit;
}

/**
 * Validates an ISBN (International Standard Book Number) for both ISBN-10 and ISBN-13 formats,
 * including checksum validation.
 *
 * Removes hyphens and spaces before validation.
 *
 * @param {string} isbn - The ISBN string to validate.
 * @returns {boolean} True if the ISBN is valid (format and checksum), false otherwise.
 */
function isValidISBN(isbn: string): boolean {
  if (!isbn || isbn.trim().length === 0) return false;

  const cleaned = isbn.replace(/[-\s]/g, '');

  // ISBN-13: exactly 13 digits
  if (cleaned.length === 13 && ISBN13_REGEX.test(cleaned)) {
    return isValidISBN13Checksum(cleaned);
  }

  // ISBN-10: 9 digits + (digit or X)
  if (cleaned.length === 10 && ISBN10_REGEX.test(cleaned)) {
    return isValidISBN10Checksum(cleaned);
  }

  return false;
}

export async function handleSearchISBN(
  isbn: string,
  env: any,
  request: Request | null = null
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!isbn || isbn.trim().length === 0) {
    return createErrorResponse(
      'ISBN is required',
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request
    );
  }

  if (!isValidISBN(isbn)) {
    return createErrorResponse(
      'Invalid ISBN format. Must be valid ISBN-10 or ISBN-13',
      400,
      ErrorCodes.INVALID_ISBN,
      { isbn },
      request
    );
  }

  try {
    // Normalize ISBN for consistent cache keys
    const normalizedISBN = normalizeISBN(isbn);
    console.log(`v1 ISBN search for "${isbn}" (normalized: "${normalizedISBN}") (using enrichMultipleBooks)`);

    // Use enrichMultipleBooks for consistency with other v1 search endpoints
    const result = await enrichMultipleBooks({ isbn: normalizedISBN }, env, { maxResults: 1 });

    const processingTime = Date.now() - startTime;

    if (!result || !result.works || result.works.length === 0) {
      // Book not found in any provider
      // Still log to Analytics Engine for ISBN harvest tracking
      await writeCacheMetrics(env, {
        endpoint: '/v1/search/isbn',
        isbn: normalizedISBN,
        cacheHit: false,
        responseTime: processingTime,
        imageQuality: 'NONE',
        dataCompleteness: 0,
        itemCount: 0
      });

      return createSuccessResponse(
        { works: [], editions: [], authors: [] },
        {
          processingTime,
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

    // Log ISBN search to Analytics Engine for daily harvest
    const work = cleanWorks[0];
    const hasCovers = work?.coverImageURL || result.editions?.some((e: any) => e.coverURL);
    await writeCacheMetrics(env, {
      endpoint: '/v1/search/isbn',
      isbn: normalizedISBN,
      cacheHit: false, // enrichMultipleBooks doesn't use cache (direct API calls)
      responseTime: processingTime,
      imageQuality: hasCovers ? 'MEDIUM' : 'NONE',
      dataCompleteness: work ? 75 : 0, // Simplified: assume 75% completeness for found books
      itemCount: cleanWorks.length
    });

    return createSuccessResponse(
      { works: cleanWorks, editions: result.editions, authors },
      {
        processingTime,
        provider: work?.primaryProvider, // Use actual provider from enriched work
        cached: false,
      },
      200,
      request
    );
  } catch (error: any) {
    console.error('Error in v1 ISBN search:', error);
    return createErrorResponse(
      error.message || 'Internal server error',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
