/**
 * Book enrichment service
 *
 * Provides DRY enrichment services for individual and multiple book lookups:
 * - enrichSingleBook() - Individual book enrichment with multi-provider fallback
 *   (Google Books → OpenLibrary)
 * - enrichMultipleBooks() - Multiple results for search queries
 *
 * Used by:
 * - /api/enrichment/batch (via batch-enrichment.js handler)
 * - /v1/search/* endpoints (title, ISBN, advanced search)
 */

import * as externalApis from "./external-apis.js";
import { storeEnrichmentInAlexandria } from "./alexandria-write.js";
import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js";
import type { DataProvider } from "../types/enums.js";
import { CircuitBreakerOpenError, ExternalAPIError, RateLimitError } from "../types/errors";

// ========================================================================================
// INTERFACES
// ========================================================================================

/**
 * Cloudflare Worker environment bindings
 * See wrangler.toml for complete configuration
 */
interface WorkerEnv {
  // KV Namespaces
  CACHE: KVNamespace;
  CACHE: KVNamespace;

  // Secrets
  GOOGLE_BOOKS_API_KEY: string;
  ISBNDB_API_KEY: string;
  GEMINI_API_KEY: string;
  ALEXANDRIA_CLIENT_ID?: string; // Cloudflare Access service token
  ALEXANDRIA_CLIENT_SECRET?: string; // Cloudflare Access service token

  // R2 Buckets
  API_CACHE_COLD: R2Bucket;
  LIBRARY_DATA: R2Bucket;
  BOOKSHELF_IMAGES: R2Bucket;

  // Workers AI
  AI: Fetcher;

  // Durable Objects
  PROGRESS_WEBSOCKET_DO: DurableObjectNamespace;

  // Analytics Engine
  PERFORMANCE_ANALYTICS?: AnalyticsEngineDataset;
  CACHE_ANALYTICS?: AnalyticsEngineDataset;
  PROVIDER_ANALYTICS?: AnalyticsEngineDataset;
  AI_ANALYTICS?: AnalyticsEngineDataset;

  // Queue Producers
  AUTHOR_WARMING_QUEUE?: Queue;
}

/**
 * Query parameters for book searches
 */
interface BookSearchQuery {
  title?: string;
  author?: string;
  isbn?: string;
}

/**
 * Options for multi-book searches
 */
interface SearchOptions {
  maxResults?: number;
}

/**
 * Extended WorkDTO with authors property
 * external-apis.js returns works with authors array, but canonical WorkDTO doesn't include it
 */
type WorkDTOWithAuthors = WorkDTO & { authors?: AuthorDTO[] };

/**
 * Normalized API response from external API calls
 */
interface ApiResponse {
  works: WorkDTOWithAuthors[];
  editions: EditionDTO[];
  authors: AuthorDTO[];
}

/**
 * Return type for enrichMultipleBooks
 */
interface EnrichmentResult {
  works: WorkDTO[];
  editions: EditionDTO[];
  authors: AuthorDTO[];
}

/**
 * Enrichment error details
 * Provides context about why enrichment failed
 */
export interface EnrichmentError {
  code: 'NOT_FOUND' | 'API_ERROR' | 'RATE_LIMIT' | 'CIRCUIT_OPEN' | 'NETWORK_ERROR' | 'INVALID_INPUT';
  message: string;
  provider?: string;      // Which provider failed (e.g., 'google-books', 'open-library')
  retryable: boolean;     // Whether the client should retry
  retryAfterMs?: number;  // Suggested retry delay in milliseconds
}

/**
 * Return type for enrichSingleBook (success case)
 * Contains work, edition (with cover URL), and authors for a single book
 */
export interface SingleEnrichmentResult {
  success: true;
  work: WorkDTO;
  edition: EditionDTO | null;
  authors: AuthorDTO[];
}

/**
 * Return type for enrichSingleBook (error case)
 */
export interface SingleEnrichmentError {
  success: false;
  error: EnrichmentError;
}

/**
 * Combined return type for enrichSingleBook
 */
export type SingleEnrichmentResponse = SingleEnrichmentResult | SingleEnrichmentError | null;

// ========================================================================================
// PUBLIC FUNCTIONS
// ========================================================================================

/**
 * Enrich multiple books with metadata from external providers
 * Used by search endpoints that need multiple results
 *
 * @param query - Search parameters
 * @param env - Worker environment bindings
 * @param options - Search options
 * @param ctx - ExecutionContext for cache operations (optional for backward compatibility)
 * @returns EnrichmentResult with works, editions, and authors
 */
export async function enrichMultipleBooks(
  query: BookSearchQuery,
  env: WorkerEnv,
  options: SearchOptions = { maxResults: 20 },
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  const { title, author, isbn } = query;
  const { maxResults = 20 } = options;

  // ISBN search returns single result (ISBNs are unique)
  if (isbn) {
    // Try Alexandria first (local, free, fast)
    try {
      console.log(
        `enrichMultipleBooks: Searching Alexandria by ISBN "${isbn}"`,
      );
      const alexandriaResult = await externalApis.searchAlexandriaByISBN(
        isbn,
        env,
        ctx, // Pass ExecutionContext for caching
      );

      if (alexandriaResult && alexandriaResult.works && alexandriaResult.works.length > 0) {
        // Add provenance fields to all works
        return {
          works: alexandriaResult.works.map((work: WorkDTO) =>
            addProvenanceFields(work, "alexandria"),
          ),
          editions: alexandriaResult.editions || [],
          authors: alexandriaResult.authors || [],
        };
      }
      // No results from Alexandria, proceed to Google Books
      console.log(
        `enrichMultipleBooks: Alexandria returned no results, trying Google Books`,
      );
    } catch (error) {
      // Alexandria failed (network error, 500, etc.), proceed to Google Books
      console.error(
        `enrichMultipleBooks: Alexandria error for ISBN "${isbn}":`,
        error,
      );
      console.log(`enrichMultipleBooks: Trying Google Books fallback`);
    }

    // Fallback to Google Books ISBN search (with isolated error handling)
    try {
      console.log(
        `enrichMultipleBooks: Searching Google Books by ISBN "${isbn}"`,
      );
      const googleResult = await externalApis.searchGoogleBooksByISBN(
        isbn,
        env,
        ctx, // Pass ExecutionContext for caching
      );

      if (googleResult && googleResult.works && googleResult.works.length > 0) {
        // Store in Alexandria for future lookups (fire-and-forget)
        storeEnrichmentInAlexandria(googleResult, "google-books", env, ctx);

        // Add provenance fields to all works
        return {
          works: googleResult.works.map((work: WorkDTO) =>
            addProvenanceFields(work, "google-books"),
          ),
          editions: googleResult.editions || [],
          authors: googleResult.authors || [],
        };
      }
      // No results from Google Books, proceed to OpenLibrary
      console.log(
        `enrichMultipleBooks: Google Books returned no results, trying OpenLibrary`,
      );
    } catch (error) {
      // Google Books failed (network error, 500, etc.), proceed to fallback
      console.error(
        `enrichMultipleBooks: Google Books error for ISBN "${isbn}":`,
        error,
      );
      console.log(`enrichMultipleBooks: Trying OpenLibrary fallback`);
    }

    // Fallback to OpenLibrary ISBN search (with isolated error handling)
    try {
      const olResult = await externalApis.searchOpenLibrary(
        isbn,
        { maxResults: 1, isbn },
        env,
        ctx, // Pass ExecutionContext for caching
      );

      if (olResult && olResult.works && olResult.works.length > 0) {
        // Store in Alexandria for future lookups (fire-and-forget)
        storeEnrichmentInAlexandria(olResult, "openlibrary", env, ctx);

        // Add provenance fields to all works
        return {
          works: olResult.works.map((work: WorkDTO) =>
            addProvenanceFields(work, "openlibrary"),
          ),
          editions: olResult.editions || [],
          authors: olResult.authors || [],
        };
      }
      // No results from OpenLibrary either
      console.log(
        `enrichMultipleBooks: OpenLibrary returned no results, trying ISBNdb`,
      );
    } catch (error) {
      // OpenLibrary failed too
      console.error(
        `enrichMultipleBooks: OpenLibrary error for ISBN "${isbn}":`,
        error,
      );
      console.log(`enrichMultipleBooks: Trying ISBNdb fallback`);
    }

    // Fallback to ISBNdb ISBN search (with isolated error handling)
    try {
      const isbndbResult = await externalApis.getISBNdbBookByISBN(isbn, env, ctx);

      if (isbndbResult && isbndbResult.work) {
        // Store in Alexandria for future lookups (fire-and-forget)
        const enrichmentResult = {
          works: [isbndbResult.work],
          editions: isbndbResult.edition ? [isbndbResult.edition] : [],
          authors: isbndbResult.authors || [],
        };
        storeEnrichmentInAlexandria(enrichmentResult, "isbndb", env, ctx);

        // Add provenance fields to work
        return {
          works: [addProvenanceFields(isbndbResult.work, "isbndb")],
          editions: isbndbResult.edition ? [isbndbResult.edition] : [],
          authors: isbndbResult.authors || [],
        };
      }
      // No results from ISBNdb either
      console.log(`enrichMultipleBooks: ISBNdb returned no results`);
    } catch (error) {
      // ISBNdb failed too
      console.error(
        `enrichMultipleBooks: ISBNdb error for ISBN "${isbn}":`,
        error,
      );
    }

    // No results from any provider
    console.log(
      `enrichMultipleBooks: No results for ISBN "${isbn}" from any provider (Google Books, OpenLibrary, ISBNdb)`,
    );
    return { works: [], editions: [], authors: [] };
  }

  // Build search query for Google Books
  const searchQuery = [title, author].filter(Boolean).join(" ");

  if (!searchQuery) {
    console.warn("enrichMultipleBooks: No search parameters provided");
    return { works: [], editions: [], authors: [] };
  }

  try {
    // Try Google Books first with maxResults
    console.log(
      `enrichMultipleBooks: Searching Google Books for "${searchQuery}" (maxResults: ${maxResults})`,
    );
    const googleResult = await externalApis.searchGoogleBooks(
      searchQuery,
      { maxResults },
      env,
      ctx, // Pass ExecutionContext for caching
    );

    if (googleResult && googleResult.works && googleResult.works.length > 0) {
      // Store in Alexandria for future lookups (fire-and-forget)
      storeEnrichmentInAlexandria(googleResult, "google-books", env, ctx);

      // Add provenance fields to all works
      return {
        works: googleResult.works.map((work: WorkDTO) =>
          addProvenanceFields(work, "google-books"),
        ),
        editions: googleResult.editions || [],
        authors: googleResult.authors || [],
      };
    }

    // Fallback to OpenLibrary
    console.log(
      `enrichMultipleBooks: Google Books returned no results, trying OpenLibrary`,
    );
    const olResult = await externalApis.searchOpenLibrary(
      searchQuery,
      { maxResults },
      env,
      ctx, // Pass ExecutionContext for caching
    );

    if (olResult && olResult.works && olResult.works.length > 0) {
      // Store in Alexandria for future lookups (fire-and-forget)
      storeEnrichmentInAlexandria(olResult, "openlibrary", env, ctx);

      // Add provenance fields to all works
      return {
        works: olResult.works.map((work: WorkDTO) =>
          addProvenanceFields(work, "openlibrary"),
        ),
        editions: olResult.editions || [],
        authors: olResult.authors || [],
      };
    }

    // Fallback to ISBNdb (only if we have both title and author with meaningful values)
    if (title?.trim() && author?.trim()) {
      console.log(
        `enrichMultipleBooks: OpenLibrary returned no results, trying ISBNdb`,
      );
      const isbndbResult = await externalApis.searchISBNdb(title, author, env, ctx);

      if (isbndbResult && isbndbResult.works && isbndbResult.works.length > 0) {
        console.log(
          `✅ ISBNdb SUCCESS: Found ${isbndbResult.works.length} works`,
        );
        // Store in Alexandria for future lookups (fire-and-forget)
        storeEnrichmentInAlexandria(isbndbResult, "isbndb", env, ctx);

        return {
          works: isbndbResult.works.map((work: WorkDTO) =>
            addProvenanceFields(work, "isbndb"),
          ),
          editions: isbndbResult.editions || [],
          authors: isbndbResult.authors || [],
        };
      }
    }

    // No results from any provider
    console.log(`enrichMultipleBooks: No results for "${searchQuery}"`);
    return { works: [], editions: [], authors: [] };
  } catch (error) {
    console.error("enrichMultipleBooks error:", error);
    // Best-effort: API errors = empty results (don't propagate errors)
    return { works: [], editions: [], authors: [] };
  }
}

/**
 * Enrich a single book with metadata from external providers
 * Used by enrichment pipeline that needs best match for a specific book
 *
 * @param query - Search parameters
 * @param env - Worker environment bindings
 * @returns SingleEnrichmentResult with work, edition, and authors, or null if not found
 */
export async function enrichSingleBook(
  query: BookSearchQuery,
  env: WorkerEnv,
  ctx?: ExecutionContext,
): Promise<SingleEnrichmentResponse> {
  const { title, author, isbn, openLibraryId, googleBooksId } = query;

  // Require at least one search parameter
  if (!title && !isbn && !author && !openLibraryId && !googleBooksId) {
    console.warn("enrichSingleBook: No search parameters provided");
    return null;
  }

  try {
    // Strategy 1: If ISBN provided, use ISBN search (most accurate)
    if (isbn) {
      const result: SingleEnrichmentResult | null = await searchByISBN(
        isbn,
        env,
        ctx,
      );
      // If we have a result with a cover, we're done
      if (
        result &&
        (result.work.coverImageURL || result.edition?.coverImageURL)
      ) {
        return result;
      }
    }

    // Strategy 2: Use other specific identifiers if available
    if (googleBooksId) {
      const result: SingleEnrichmentResult | null = await searchGoogleBooksById(
        googleBooksId,
        env,
        ctx,
      );
      if (
        result &&
        (result.work.coverImageURL || result.edition?.coverImageURL)
      )
        return result;
    }

    if (openLibraryId) {
      const result: SingleEnrichmentResult | null = await searchOpenLibraryById(
        openLibraryId,
        env,
        ctx,
      );
      if (
        result &&
        (result.work.coverImageURL || result.edition?.coverImageURL)
      )
        return result;
    }

    if (query.goodreadsId) {
      const result: SingleEnrichmentResult | null =
        await searchOpenLibraryByGoodreadsId(query.goodreadsId, env, ctx);
      if (
        result &&
        (result.work.coverImageURL || result.edition?.coverImageURL)
      )
        return result;
    }

    // Strategy 3: Try Google Books with title+author
    const googleResult: SingleEnrichmentResult | null = await searchGoogleBooks(
      { title, author },
      env,
      ctx,
    );
    if (
      googleResult &&
      (googleResult.work.coverImageURL || googleResult.edition?.coverImageURL)
    ) {
      return googleResult;
    }

    // Strategy 4: Fallback to OpenLibrary with title+author
    const openLibResult: SingleEnrichmentResult | null =
      await searchOpenLibrary({ title, author }, env, ctx);
    if (openLibResult) {
      return openLibResult;
    }

    // If Google Books found a result but it had no cover, return that partial result
    if (googleResult) {
      return googleResult;
    }

    // Book not found in any provider
    console.log(`enrichSingleBook: No results for query:`, query);
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Book not found in any provider',
        retryable: false
      }
    };
  } catch (error) {
    console.error("enrichSingleBook error:", error);

    // Handle circuit breaker open
    if (error instanceof CircuitBreakerOpenError) {
      console.log(`Circuit breaker OPEN for ${error.provider}, skipping to fallback`);
      return {
        success: false,
        error: {
          code: 'CIRCUIT_OPEN',
          message: `Provider ${error.provider} circuit breaker is open`,
          provider: error.provider,
          retryable: true,
          retryAfterMs: error.retryAfterMs
        }
      };
    }

    // Handle rate limit errors
    if (error instanceof RateLimitError) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: `Rate limit exceeded for ${error.provider}`,
          provider: error.provider,
          retryable: true,
          retryAfterMs: error.retryAfterMs || 60000
        }
      };
    }

    // Handle external API errors
    if (error instanceof ExternalAPIError) {
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error.message,
          provider: error.provider,
          retryable: error.retryable
        }
      };
    }

    // Handle network/timeout errors
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network error while fetching book data',
          retryable: true,
          retryAfterMs: 5000
        }
      };
    }

    // Unknown error - not retryable
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error.message || 'Unknown error during enrichment',
        retryable: false
      }
    };
  }
}

/**
 * Search Google Books API with query
 * Thin wrapper around external-apis.js - returns work, edition, and authors
 *
 * @param query - Search parameters
 * @param env - Worker environment bindings
 * @returns SingleEnrichmentResult with work, edition, and authors or null
 */
async function searchGoogleBooks(
  query: BookSearchQuery,
  env: WorkerEnv,
  ctx?: ExecutionContext,
): Promise<SingleEnrichmentResult | null> {
  const { title, author, isbn } = query;

  // Build search query (title + author for better precision)
  const searchQuery: string = isbn
    ? isbn
    : [title, author].filter(Boolean).join(" ");

  const result = isbn
    ? await externalApis.searchGoogleBooksByISBN(searchQuery, env, ctx)
    : await externalApis.searchGoogleBooks(searchQuery, { maxResults: 1 }, env, ctx);

  if (!result || !result.works || result.works.length === 0) {
    return null;
  }

  // Return first work with provenance fields, plus edition and authors
  const work: WorkDTO = addProvenanceFields(result.works[0], "google-books");
  const edition: EditionDTO | null =
    result.editions && result.editions.length > 0 ? result.editions[0] : null;
  const authors: AuthorDTO[] = result.authors || [];

  return { success: true, work, edition, authors };
}

/**
 * Search OpenLibrary API with query
 * Thin wrapper around external-apis.js - returns work, edition, and authors
 *
 * @param query - Search parameters
 * @param env - Worker environment bindings
 * @returns SingleEnrichmentResult with work, edition, and authors or null
 */
async function searchOpenLibrary(
  query: BookSearchQuery,
  env: WorkerEnv,
  ctx?: ExecutionContext,
): Promise<SingleEnrichmentResult | null> {
  const { title, author } = query;

  const searchQuery: string = [title, author].filter(Boolean).join(" ");
  const result = await externalApis.searchOpenLibrary(
    searchQuery,
    { maxResults: 1 },
    env,
    ctx,
  );

  if (!result || !result.works || result.works.length === 0) {
    return null;
  }

  // Return first work with provenance fields, plus edition and authors
  const work: WorkDTO = addProvenanceFields(result.works[0], "openlibrary");
  const edition: EditionDTO | null =
    result.editions && result.editions.length > 0 ? result.editions[0] : null;
  const authors: AuthorDTO[] = result.authors || [];

  return { success: true, work, edition, authors };
}

/**
 * ISBN-specific search (tries Google Books, then OpenLibrary)
 * Thin wrapper around external-apis.js - returns work, edition, and authors
 *
 * @param isbn - ISBN-10 or ISBN-13
 * @param env - Worker environment bindings
 * @returns SingleEnrichmentResult with work, edition, and authors or null
 */
async function searchByISBN(
  isbn: string,
  env: WorkerEnv,
  ctx?: ExecutionContext,
): Promise<SingleEnrichmentResult | null> {
  // Try Alexandria first (local, free, fast)
  try {
    const alexandriaResult = await externalApis.searchAlexandriaByISBN(isbn, env, ctx);
    if (alexandriaResult?.works?.length) {
      return {
        success: true,
        work: addProvenanceFields(alexandriaResult.works[0], "alexandria"),
        edition: alexandriaResult.editions?.[0] || null,
        authors: alexandriaResult.authors || [],
      };
    }
  } catch (error) {
    console.error(`searchByISBN: Alexandria error for ISBN "${isbn}":`, error);
    // Fall through to Google Books
  }

  // Fallback to Google Books ISBN search
  const googleResult = await searchGoogleBooks({ isbn }, env, ctx);
  if (
    googleResult &&
    googleResult.success &&
    (googleResult.work.coverImageURL || googleResult.edition?.coverImageURL)
  ) {
    return googleResult;
  }

  // Fallback to OpenLibrary ISBN search
  const olResult = await searchOpenLibrary({ isbn }, env, ctx);
  if (olResult && olResult.success) {
    return olResult;
  }

  // If Google Books found a result but it had no cover, return that partial result
  if (googleResult && googleResult.success) {
    return googleResult;
  }

  return null;
}

/**
 * Add provenance fields to work already normalized by external-apis.js
 *
 * The external-apis.js already returns fully normalized works.
 * We just add provenance tracking fields:
 * - primaryProvider - Which API contributed the data
 * - contributors - Array of all providers (single provider for direct calls)
 * - synthetic - Flag for inferred works (false for direct API results)
 *
 * @param work - Normalized work from external-apis.js
 * @param provider - Provider name
 * @returns WorkDTO with provenance fields
 */
function addProvenanceFields(work: WorkDTO, provider: DataProvider): WorkDTO {
  return {
    ...work, // Preserve all existing normalized fields
    primaryProvider: provider,
    contributors: [provider],
    synthetic: false, // Direct API result, not inferred
  };
}
