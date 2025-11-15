/**
 * GET /v1/search/advanced
 *
 * Advanced search for books by title and/or author using canonical response format
 * Returns up to 20 results for iOS search UI
 */

import type { BookSearchResponse } from '../../types/responses.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';
import { enrichMultipleBooks } from '../../services/enrichment.ts';
import { normalizeTitle, normalizeAuthor } from '../../utils/normalization.js';
import { setCached } from '../../utils/cache.js';
import { UnifiedCacheService } from '../../services/unified-cache.js';
import { extractUniqueAuthors, removeAuthorsFromWorks } from '../../utils/response-transformer.js';
import { CacheKeyFactory } from "../../services/cache-key-factory.js";

export async function handleSearchAdvanced(
  title: string,
  author: string,
  env: any,
  ctx: ExecutionContext,
  request: Request | null = null
): Promise<Response> {
  const startTime = Date.now();

  // Validation - require at least one parameter
  const hasTitle = title && title.trim().length > 0;
  const hasAuthor = author && author.trim().length > 0;

  if (!hasTitle && !hasAuthor) {
    return createErrorResponse(
      "At least one of title or author is required",
      400,
      ErrorCodes.INVALID_QUERY,
      { title, author },
      request
    );
  }

  try {
    // Normalize both title and author for consistent cache keys
    const normalizedTitle = hasTitle ? normalizeTitle(title) : "";
    const normalizedAuthor = hasAuthor ? normalizeAuthor(author) : "";

    // Check cache first
    const cacheKey = CacheKeyFactory.generic("v1:advanced", {
      title: normalizedTitle,
      author: normalizedAuthor,
    });

    const cache = new UnifiedCacheService(env, ctx);
    const cachedResult = await cache.get(cacheKey, "advanced", {
      query: `${title} ${author}`.trim(),
    });

    if (cachedResult?.data) {
      console.log(`✅ Cache HIT: /v1/search/advanced (${cacheKey})`);
      // Cache hit - return v2 format directly
      return createSuccessResponse(
        cachedResult.data.data,
        {
          ...cachedResult.data.meta,
          cached: true,
          cacheSource: cachedResult.source, // EDGE or KV
        },
        200,
        request
      );
    }

    console.log(
      `v1 advanced search - title: "${title}" (normalized: "${normalizedTitle}"), ` +
        `author: "${author}" (normalized: "${normalizedAuthor}") ` +
        `(using enrichMultipleBooks, maxResults: 20)`,
    );

    // Use enrichMultipleBooks for search endpoints (returns up to 20 results)
    const result = await enrichMultipleBooks(
      {
        title: normalizedTitle,
        author: normalizedAuthor,
      },
      env,
      { maxResults: 20 },
    );

    if (!result || !result.works || result.works.length === 0) {
      // No books found in any provider
      return createSuccessResponse(
        { works: [], editions: [], authors: [] },
        {
          processingTime: Date.now() - startTime,
          provider: "none",
          cached: false,
        },
        200,
        request
      );
    }

    // Extract all unique authors from works
    const authors = extractUniqueAuthors(result.works);

    // Remove authors property from works (not part of canonical WorkDTO)
    const cleanWorks = removeAuthorsFromWorks(result.works);

    const response = createSuccessResponse(
      { works: cleanWorks, editions: result.editions, authors },
      {
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider, // Use actual provider from enriched work
        cached: false,
      },
      200,
      request
    );

    // Write to cache (6h TTL, same as /search/title)
    // Note: We need to cache the legacy format for backward compatibility with existing cache
    const legacyResponseObject = {
      success: true,
      data: { works: cleanWorks, editions: result.editions, authors },
      meta: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        provider: cleanWorks[0]?.primaryProvider,
        cached: false,
      }
    };
    const ttl = 6 * 60 * 60; // 21600 seconds
    ctx.waitUntil(setCached(cacheKey, legacyResponseObject, ttl, env));
    console.log(
      `💾 Cache WRITE: /v1/search/advanced (${cacheKey}, TTL: ${ttl}s)`,
    );

    return response;
  } catch (error: any) {
    console.error("Error in v1 advanced search:", error);
    return createErrorResponse(
      error.message || "Internal server error",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString(), processingTime: Date.now() - startTime },
      request
    );
  }
}
