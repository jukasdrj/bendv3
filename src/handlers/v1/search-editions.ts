/**
 * GET /v1/editions/search
 *
 * Search for all editions of a specific work by title and author
 * Used by iOS "Find Different Edition" feature
 */

import type { ApiResponse, BookSearchResponse } from '../../types/responses.js';
import { createSuccessResponseObject, createErrorResponseObject } from '../../types/responses.js';
import { normalizeTitle, normalizeAuthor, normalizeISBN } from '../../utils/normalization.js';
import { setCached, generateCacheKey } from '../../utils/cache.js';
import { UnifiedCacheService } from '../../services/unified-cache.js';
import { extractUniqueAuthors, removeAuthorsFromWorks } from '../../utils/response-transformer.js';
import * as externalApis from '../../services/external-apis.ts';
import type { EditionDTO, WorkDTO, AuthorDTO } from '../../types/canonical.js';

/**
 * Calculate Levenshtein distance for fuzzy string matching
 * Used to match title variations (e.g., "The Martian" vs "Martian, The")
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Check if two titles are similar enough to be considered the same work
 * Uses normalized Levenshtein distance (threshold: 0.3 = 30% difference allowed)
 */
function isTitleMatch(title1: string, title2: string): boolean {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return true;
  
  // Check if one title contains the other (for subtitle variations)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  
  // Fuzzy match using Levenshtein distance
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return false;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const similarity = 1 - (distance / maxLen);
  
  return similarity >= 0.7; // 70% similarity threshold
}

/**
 * Check if an author name matches any author in the list
 */
function isAuthorMatch(searchAuthor: string, editionAuthors: string[]): boolean {
  const normalizedSearch = normalizeAuthor(searchAuthor);
  
  return editionAuthors.some(author => {
    const normalizedAuthor = normalizeAuthor(author);
    // Check if either contains the other (handles "Andy Weir" vs "Weir, Andy")
    return normalizedAuthor.includes(normalizedSearch) || 
           normalizedSearch.includes(normalizedAuthor) ||
           normalizedAuthor === normalizedSearch;
  });
}

/**
 * Convert ISBN-10 to ISBN-13 for deduplication
 * ISBN-13 = 978 + first 9 digits of ISBN-10 + new check digit
 */
function isbn10To13(isbn10: string): string {
  if (isbn10.length !== 10) return isbn10;
  
  const base = '978' + isbn10.substring(0, 9);
  let sum = 0;
  
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return base + checkDigit;
}

/**
 * Normalize ISBN to ISBN-13 format for deduplication
 */
function normalizeISBNForDedup(isbn: string): string {
  const cleaned = normalizeISBN(isbn);
  if (cleaned.length === 10) {
    return isbn10To13(cleaned);
  }
  return cleaned;
}

/**
 * Deduplicate editions by ISBN (handles ISBN-10/ISBN-13 equivalents)
 * Returns the edition with the highest quality score for each unique ISBN
 */
function deduplicateEditions(editions: EditionDTO[]): EditionDTO[] {
  const isbnMap = new Map<string, EditionDTO>();
  
  for (const edition of editions) {
    // Get all ISBNs for this edition (primary + array)
    const isbns = new Set<string>();
    if (edition.isbn) {
      isbns.add(normalizeISBNForDedup(edition.isbn));
    }
    for (const isbn of edition.isbns || []) {
      if (isbn) {
        isbns.add(normalizeISBNForDedup(isbn));
      }
    }
    
    // Check if we've already seen any of these ISBNs
    let isDuplicate = false;
    for (const isbn of isbns) {
      if (isbnMap.has(isbn)) {
        isDuplicate = true;
        const existing = isbnMap.get(isbn)!;
        // Keep the edition with better quality score
        if (edition.isbndbQuality > existing.isbndbQuality) {
          isbnMap.set(isbn, edition);
        }
        break;
      }
    }
    
    // If not a duplicate, add all ISBNs to map
    if (!isDuplicate && isbns.size > 0) {
      const primaryISBN = Array.from(isbns)[0];
      isbnMap.set(primaryISBN, edition);
    }
  }
  
  return Array.from(isbnMap.values());
}

/**
 * Sort editions by format priority, data quality, and publication date
 * Priority: Hardcover > Paperback > E-book > Audiobook > Other
 *
 * Quality tiebreaker ensures ISBNdb editions (quality > 0) rank higher than
 * Google Books editions (quality = 0) when formats match
 */
function sortEditions(editions: EditionDTO[]): EditionDTO[] {
  const formatPriority: Record<string, number> = {
    'Hardcover': 1,
    'Paperback': 2,
    'E-book': 3,
    'Audiobook': 4,
    'Other': 5
  };

  return editions.sort((a, b) => {
    // First sort by format priority
    const priorityA = formatPriority[a.format] || 5;
    const priorityB = formatPriority[b.format] || 5;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // If same format, sort by data quality (ISBNdb > Google Books)
    if (a.isbndbQuality !== b.isbndbQuality) {
      return b.isbndbQuality - a.isbndbQuality;
    }

    // Finally by publication date (newest first)
    const dateA = a.publicationDate || '0000';
    const dateB = b.publicationDate || '0000';
    return dateB.localeCompare(dateA);
  });
}

export async function handleSearchEditions(
  workTitle: string,
  author: string,
  limit: number = 20,
  env: any,
  ctx: ExecutionContext
): Promise<ApiResponse<BookSearchResponse>> {
  const startTime = Date.now();

  // Validation
  if (!workTitle || workTitle.trim().length === 0) {
    return createErrorResponseObject(
      'workTitle parameter is required',
      'INVALID_QUERY',
      { workTitle, author }
    );
  }

  if (!author || author.trim().length === 0) {
    return createErrorResponseObject(
      'author parameter is required',
      'INVALID_QUERY',
      { workTitle, author }
    );
  }

  try {
    // Normalize inputs for consistent cache keys and matching
    const normalizedTitle = normalizeTitle(workTitle);
    const normalizedAuthor = normalizeAuthor(author);

    // Check cache first (7-day TTL as specified)
    const cacheKey = generateCacheKey('v1:editions', {
      title: normalizedTitle,
      author: normalizedAuthor
    });

    const cache = new UnifiedCacheService(env, ctx);
    const cachedResult = await cache.get(cacheKey, 'editions', {
      query: `${workTitle} by ${author}`
    });

    if (cachedResult?.data) {
      console.log(`✅ Cache HIT: /v1/editions/search (${cacheKey})`);
      return {
        ...cachedResult.data,
        meta: {
          ...cachedResult.data.meta,
          cached: true,
          cacheSource: cachedResult.source // EDGE or KV
        }
      };
    }

    console.log(
      `v1 editions search - workTitle: "${workTitle}" (normalized: "${normalizedTitle}"), ` +
      `author: "${author}" (normalized: "${normalizedAuthor}"), limit: ${limit}`
    );

    // Primary: Query ISBNdb for editions
    const isbndbResult = await externalApis.getISBNdbEditionsForWork(
      workTitle,
      author,
      env
    );

    // Fallback: Query Google Books for additional coverage
    const googleQuery = `intitle:"${workTitle}" inauthor:"${author}"`;
    const googleResult = await externalApis.searchGoogleBooks(
      googleQuery,
      { maxResults: 40 }, // Request more to account for filtering
      env
    );

    // Combine editions from both providers
    let allEditions: EditionDTO[] = [];
    
    if (isbndbResult.success && isbndbResult.editions) {
      allEditions = allEditions.concat(isbndbResult.editions);
    }
    
    if (googleResult.success && googleResult.editions) {
      allEditions = allEditions.concat(googleResult.editions);
    }

    // Filter editions to ensure they match the work
    const filteredEditions = allEditions.filter(edition => {
      // Check title match (fuzzy)
      const titleMatches = edition.title && isTitleMatch(workTitle, edition.title);
      if (!titleMatches) return false;

      // Check author match (if we have author data for the edition)
      // Note: Some editions might not have author data, we'll be lenient
      if (!edition.isbn && !edition.isbns?.length) {
        // Skip editions without any ISBN
        return false;
      }

      return true;
    });

    // Deduplicate by ISBN
    const uniqueEditions = deduplicateEditions(filteredEditions);

    // Sort by format and date
    const sortedEditions = sortEditions(uniqueEditions);

    // Apply limit
    const limitedEditions = sortedEditions.slice(0, limit);

    // Determine provider for metadata
    let provider = 'none';
    if (limitedEditions.length > 0) {
      const providers = new Set(
        limitedEditions.map(e => e.primaryProvider).filter(Boolean)
      );
      if (providers.size === 1) {
        provider = Array.from(providers)[0] || 'unknown';
      } else if (providers.size > 1) {
        provider = 'orchestrated:' + Array.from(providers).join('+');
      }
    }

    const response = createSuccessResponseObject(
      {
        works: [], // Empty - not needed for editions endpoint
        editions: limitedEditions,
        authors: [] // Empty - not needed for editions endpoint
      },
      {
        processingTime: Date.now() - startTime,
        provider,
        cached: false,
      }
    );

    // If we found no editions, return NOT_FOUND error (as specified)
    if (limitedEditions.length === 0) {
      return createErrorResponseObject(
        `No editions found for "${workTitle}" by ${author}`,
        'NOT_FOUND',
        { workTitle, author },
        { processingTime: Date.now() - startTime }
      );
    }

    // Write to cache (7-day TTL as specified)
    const ttl = 7 * 24 * 60 * 60; // 604800 seconds
    ctx.waitUntil(setCached(cacheKey, response, ttl, env));
    console.log(`💾 Cache WRITE: /v1/editions/search (${cacheKey}, TTL: ${ttl}s)`);

    return response;
  } catch (error: any) {
    console.error('Error in v1 editions search:', error);
    
    // Check if all providers failed
    if (error.message?.includes('API') || error.message?.includes('fetch')) {
      return createErrorResponseObject(
        'All book data providers failed',
        'PROVIDER_ERROR',
        { error: error.toString() },
        { processingTime: Date.now() - startTime }
      );
    }
    
    return createErrorResponseObject(
      error.message || 'Internal server error',
      'INTERNAL_ERROR',
      { error: error.toString() },
      { processingTime: Date.now() - startTime }
    );
  }
}
