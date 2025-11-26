/**
 * External API integrations (Google Books, OpenLibrary, ISBNdb)
 * Migrated from external-apis-worker
 *
 * This service provides functions for searching and enriching book data
 * from multiple external providers.
 *
 * Uses canonical normalizers to ensure all responses conform to
 * TypeScript canonical contracts (WorkDTO, EditionDTO, AuthorDTO).
 */

import {
  normalizeGoogleBooksToWork,
  normalizeGoogleBooksToEdition,
  ensureWorkForEdition,
} from "./normalizers/google-books.js";

import {
  normalizeOpenLibraryToWork,
  normalizeOpenLibraryToEdition,
  normalizeOpenLibraryToAuthor,
} from "./normalizers/openlibrary.js";

import {
  normalizeISBNdbToWork,
  normalizeISBNdbToEdition,
  normalizeISBNdbToAuthor,
} from "./normalizers/isbndb.js";

import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js";
import type { DataProvider } from "../types/enums.js";
import { logExternalApiCall } from "../utils/analytics-logger.ts";
import { createCacheService } from "./cache-service.js";
import { CircuitBreaker } from "./circuit-breaker.ts";
import { CircuitBreakerOpenError } from "../types/errors.js";

const getCircuitBreaker = (provider: string, env: ExternalAPIEnv) => {
  if (env.CIRCUIT_BREAKER_ENABLED !== 'true') {
    // Return a dummy circuit breaker that does nothing
    return {
      execute: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    };
  }
  return new CircuitBreaker(provider, env, {
    failureThreshold: parseInt(env.CIRCUIT_FAILURE_THRESHOLD || '5'),
    cooldownMs: parseInt(env.CIRCUIT_COOLDOWN_MS || '60000'),
    successThreshold: parseInt(env.CIRCUIT_SUCCESS_THRESHOLD || '2'),
  });
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Worker environment bindings used by external API functions
 */
export interface ExternalAPIEnv {
  GOOGLE_BOOKS_API_KEY?: any; // Can be string or SecretBinding
  ISBNDB_API_KEY?: any; // Can be string or SecretBinding
  GOOGLE_BOOKS_ANALYTICS?: AnalyticsEngineDataset;
  KV_CACHE?: KVNamespace;
  CACHE?: KVNamespace;
  CACHE_HOT_TTL?: string; // Hot TTL in seconds (default: 7200 = 2h)
  CACHE_COLD_TTL?: string; // Cold TTL in seconds (default: 1209600 = 14d)
  CACHE_METRICS_DO?: DurableObjectNamespace; // For cache metrics tracking
}

/**
 * Search parameters for configurable queries
 */
export interface SearchParams {
  maxResults?: number;
}

/**
 * Work with attached authors (temporary for enrichment compatibility)
 * Handlers must strip the `authors` property before sending to client
 */
export interface WorkDTOWithAuthors extends WorkDTO {
  authors?: AuthorDTO[];
}

/**
 * Normalized API response structure
 */
export interface NormalizedResponse {
  works: WorkDTOWithAuthors[];
  editions: EditionDTO[];
  authors: AuthorDTO[];
}

/**
 * Search result metadata (for logging/analytics)
 */
export interface SearchMetadata {
  provider: string;
  processingTime: number;
  totalResults?: number;
}

/**
 * Author works response (OpenLibrary specific)
 */
export interface AuthorWorksData {
  author: {
    name: string;
    openLibraryKey: string;
  };
  works: Array<{
    title: string;
    openLibraryWorkKey: string;
    firstPublicationYear?: number;
    editions: any[];
  }>;
}

/**
 * ISBNdb book detail response
 */
export interface ISBNdbBookData {
  work: WorkDTO;
  edition: EditionDTO;
  authors: AuthorDTO[];
  book: any; // Raw ISBNdb book data (backward compatibility)
}

/**
 * Google Books raw API response structure
 */
interface GoogleBooksAPIResponse {
  items?: Array<{
    id?: string;
    volumeInfo: {
      title?: string;
      authors?: string[];
      [key: string]: any;
    };
    [key: string]: any;
  }>;
}

/**
 * OpenLibrary search document structure
 */
interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  [key: string]: any;
}

/**
 * ISBNdb book structure
 */
interface ISBNdbBook {
  authors?: string[];
  [key: string]: any;
}

/**
 * ISBNdb search response
 */
interface ISBNdbSearchResponse {
  books?: ISBNdbBook[];
  total?: number;
}

// ============================================================================
// GOOGLE BOOKS API
// ============================================================================

const GOOGLE_BOOKS_USER_AGENT =
  "BooksTracker/1.0 (nerd@ooheynerds.com) GoogleBooksWorker/1.0.0";

export async function searchGoogleBooksById(
  volumeId: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ Volume ID search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return searchGoogleBooksById_Uncached(volumeId, env);
  }

  // Create cache service with 'volumeid' prefix
  const cache = createCacheService(kvNamespace, 'volumeid', env, ctx);

  // Check cache
  const cached = await cache.get(volumeId);
  if (cached) {
    console.log(`📦 Cache HIT: Volume ID ${volumeId}`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for volume ID ${volumeId}:`, error);
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Fetching volume ID ${volumeId} from Google Books`);
  const result = await searchGoogleBooksById_Uncached(volumeId, env);

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200');
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600');

    try {
      await cache.put(volumeId, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached volume ID ${volumeId}`);
    } catch (error) {
      console.error(`❌ Cache write error for volume ID ${volumeId}:`, error);
    }
  }

  return result;
}

/**
 * Uncached Google Books volume ID search (internal helper)
 */
async function searchGoogleBooksById_Uncached(
  volumeId: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('google-books', env);
  return circuitBreaker.execute(async () => {
    const startTime = Date.now();
    try {
      console.log(`GoogleBooks ID search for "${volumeId}"`);

      const apiKey = env.GOOGLE_BOOKS_API_KEY?.get
        ? await env.GOOGLE_BOOKS_API_KEY.get()
        : env.GOOGLE_BOOKS_API_KEY;

      if (!apiKey) {
        console.error("Google Books API key not configured.");
        return null;
      }

      const searchUrl = `https://www.googleapis.com/books/v1/volumes/${volumeId}?key=${apiKey}`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": GOOGLE_BOOKS_USER_AGENT,
          Accept: "application/json",
        },
        cache: "no-cache",
      });

      if (!response.ok) {
        throw new Error(
          `Google Books API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      // Wrap the single volume result in an `items` array to reuse the normalization logic
      const normalizedData = normalizeGoogleBooksResponse({ items: [data] });

      const processingTime = Date.now() - startTime;
      console.log(`GoogleBooks ID search completed in ${processingTime}ms`);

      // Return empty result if no works found
      if (!normalizedData.works || normalizedData.works.length === 0) {
        return null;
      }

      return normalizedData;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Error in GoogleBooks ID search:`, error);
      throw error; // Let exceptions bubble up
    }
  });
}

export async function searchGoogleBooks(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ Title/author search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return searchGoogleBooks_Uncached(query, params, env);
  }

  // Create cache service with 'search' prefix
  const cache = createCacheService(kvNamespace, 'search', env, ctx);

  // Generate cache key from query + maxResults
  const maxResults = params.maxResults || 20;
  const cacheKey = `${query.toLowerCase().trim()}:${maxResults}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: Search "${query}"`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for search "${query}":`, error);
      // Fall through to API call
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Searching Google Books for "${query}"`);
  const result = await searchGoogleBooks_Uncached(query, params, env);

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200'); // 2h default
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600'); // 14d default

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached search "${query}" (${result.works.length} works)`);
    } catch (error) {
      console.error(`❌ Cache write error for search "${query}":`, error);
    }
  }

  return result;
}

/**
 * Uncached Google Books title/author search (internal helper)
 */
async function searchGoogleBooks_Uncached(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('google-books', env);
  return circuitBreaker.execute(() =>
    logExternalApiCall(
      "GoogleBooks",
      async () => {
        console.log(`GoogleBooks search for "${query}"`);

        const apiKey = env.GOOGLE_BOOKS_API_KEY?.get
          ? await env.GOOGLE_BOOKS_API_KEY.get()
          : env.GOOGLE_BOOKS_API_KEY;

        if (!apiKey) {
          console.error("Google Books API key not configured.");
          return null;
        }

        const maxResults = params.maxResults || 20;
        const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${apiKey}`;

        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent": GOOGLE_BOOKS_USER_AGENT,
            Accept: "application/json",
          },
          cache: "no-cache", // Force revalidation with Google Books API
        });

        if (!response.ok) {
          throw new Error(
            `Google Books API error: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        const normalizedData = normalizeGoogleBooksResponse(data);

        if (!normalizedData.works || normalizedData.works.length === 0) {
          return null;
        }

        return normalizedData;
      },
      { query },
      env,
    ),
  );
}

export async function searchGoogleBooksByISBN(
  isbn: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace (try KV_CACHE first, fallback to CACHE)
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching (fallback to direct API call)
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ ISBN search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return searchGoogleBooksByISBN_Uncached(isbn, env);
  }

  // Create cache service with 'isbn' prefix
  const cache = createCacheService(kvNamespace, 'isbn', env, ctx);

  // Check cache FIRST
  const cacheKey = isbn.replace(/-/g, ''); // Normalize ISBN (remove hyphens)
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: ISBN ${isbn}`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for ISBN ${isbn}:`, error);
      // Fall through to API call if cached data is corrupted
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Fetching ISBN ${isbn} from Google Books API`);
  const result = await searchGoogleBooksByISBN_Uncached(isbn, env);

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200'); // 2h default
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600'); // 14d default

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached ISBN ${isbn} (hot: ${hotTtl}s, cold: ${coldTtl}s)`);
    } catch (error) {
      console.error(`❌ Cache write error for ISBN ${isbn}:`, error);
      // Don't throw - caching is non-critical
    }
  }

  return result;
}

/**
 * Uncached Google Books ISBN search (internal helper)
 * Extracted to avoid duplication between cached and fallback paths
 */
async function searchGoogleBooksByISBN_Uncached(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('google-books', env);
  return circuitBreaker.execute(() =>
    logExternalApiCall(
      "GoogleBooks",
      async () => {
        console.log(`GoogleBooks ISBN search for "${isbn}"`);

        const apiKey = env.GOOGLE_BOOKS_API_KEY?.get
          ? await env.GOOGLE_BOOKS_API_KEY.get()
          : env.GOOGLE_BOOKS_API_KEY;

        if (!apiKey) {
          console.error("Google Books API key not configured.");
          return null;
        }

        const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&key=${apiKey}`;

        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent": GOOGLE_BOOKS_USER_AGENT,
            Accept: "application/json",
          },
          cache: "no-cache", // Force revalidation with Google Books API
        });

        if (!response.ok) {
          throw new Error(
            `Google Books API error: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        const normalizedData = normalizeGoogleBooksResponse(data);

        if (!normalizedData.works || normalizedData.works.length === 0) {
          return null;
        }

        return normalizedData;
      },
      { isbn },
      env,
    ),
  );
}

/**
 * Normalize Google Books API response to canonical DTOs
 * Uses canonical normalizers to ensure contract compliance
 *
 * NOTE: This function temporarily attaches an `authors` property to WorkDTO
 * for enrichment service compatibility (WorkDTOWithAuthors type).
 * Handlers must strip this property before sending to client.
 */
function normalizeGoogleBooksResponse(
  apiResponse: GoogleBooksAPIResponse,
): NormalizedResponse {
  if (!apiResponse.items || apiResponse.items.length === 0) {
    return { works: [], editions: [], authors: [] };
  }

  const works: WorkDTOWithAuthors[] = [];
  const editions: EditionDTO[] = [];
  const authorsMap = new Map<string, AuthorDTO>();

  apiResponse.items.forEach((item) => {
    const volumeInfo = item.volumeInfo;
    if (!volumeInfo || !volumeInfo.title) {
      return;
    }

    // Use canonical normalizer for WorkDTO (ensures all required fields)
    const work = normalizeGoogleBooksToWork(item);

    // Use canonical normalizer for EditionDTO
    const edition = normalizeGoogleBooksToEdition(item);

    // Extract authors and create AuthorDTOs
    // Normalize to string[] to handle inconsistent provider formats:
    // - string[] (expected)
    // - string (single author)
    // - object[] ({name: string})
    // - undefined/null
    const rawAuthors = volumeInfo.authors;
    let authorNames: string[];

    if (!rawAuthors || (Array.isArray(rawAuthors) && rawAuthors.length === 0)) {
      authorNames = ["Unknown Author"];
    } else if (typeof rawAuthors === "string") {
      authorNames = [rawAuthors];
    } else if (Array.isArray(rawAuthors)) {
      authorNames = rawAuthors.map((a) => {
        if (typeof a === "string") return a;
        if (typeof a === "object" && a !== null && "name" in a)
          return String(a.name);
        return "Unknown Author";
      });
    } else {
      authorNames = ["Unknown Author"];
    }

    const authors: AuthorDTO[] = authorNames.map((name) => ({
      name,
      gender: "Unknown" as const, // Required field per canonical contract
    }));

    // Attach authors to work for enrichment service compatibility
    work.authors = authors;

    // Add to authors map for deduplication
    authors.forEach((author) => {
      if (!authorsMap.has(author.name)) {
        authorsMap.set(author.name, author);
      }
    });

    works.push(work);
    editions.push(edition);
  });

  return {
    works,
    editions,
    authors: Array.from(authorsMap.values()),
  };
}

// ============================================================================
// OPENLIBRARY API
// ============================================================================

const OPENLIBRARY_USER_AGENT =
  "BooksTracker/1.0 (nerd@ooheynerds.com) OpenLibraryWorker/1.1.0";

export async function searchOpenLibraryByGoodreadsId(
  goodreadsId: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('open-library', env);
  return circuitBreaker.execute(async () => {
    const startTime = Date.now();
    try {
      console.log(`OpenLibrary Goodreads ID search for "${goodreadsId}"`);

      // OpenLibrary's Search API supports querying by Goodreads ID
      const searchUrl = `https://openlibrary.org/search.json?goodreads=${goodreadsId}&limit=1`;
      const response = await fetch(searchUrl, {
        headers: { "User-Agent": OPENLIBRARY_USER_AGENT },
      });

      if (!response.ok) {
        throw new Error(`OpenLibrary search API failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.docs || data.docs.length === 0) {
        return null; // No results found
      }

      // We get a search result, not a direct work, so we normalize the search result
      const normalized = normalizeOpenLibrarySearchResults(data.docs);

      // Return null if no works found
      if (!normalized.works || normalized.works.length === 0) {
        return null;
      }

      return normalized;
    } catch (error) {
      console.error(
        `Error in OpenLibrary Goodreads ID search for "${goodreadsId}":`,
        error,
      );
      throw error; // Let exceptions bubble up
    }
  });
}

export async function searchOpenLibraryById(
  workId: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('open-library', env);
  return circuitBreaker.execute(async () => {
    const startTime = Date.now();
    try {
      console.log(`OpenLibrary ID search for "${workId}"`);

      const workUrl = `https://openlibrary.org/works/${workId}.json`;
      const workResponse = await fetch(workUrl, {
        headers: { "User-Agent": OPENLIBRARY_USER_AGENT },
      });

      if (!workResponse.ok) {
        throw new Error(`OpenLibrary work API failed: ${workResponse.status}`);
      }

      const workData = await workResponse.json();
      const normalized = normalizeOpenLibrarySearchResults([workData]);

      // Return null if no works found
      if (!normalized.works || normalized.works.length === 0) {
        return null;
      }

      return normalized;
    } catch (error) {
      console.error(`Error in OpenLibrary ID search for "${workId}":`, error);
      throw error; // Let exceptions bubble up
    }
  });
}

export async function searchOpenLibrary(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ OpenLibrary search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return searchOpenLibrary_Uncached(query, params, env);
  }

  // Create cache service with 'ol' (OpenLibrary) prefix
  const cache = createCacheService(kvNamespace, 'ol', env, ctx);

  // Generate cache key
  const maxResults = params.maxResults || 20;
  const cacheKey = `search:${query.toLowerCase().trim()}:${maxResults}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: OpenLibrary "${query}"`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for OpenLibrary "${query}":`, error);
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Searching OpenLibrary for "${query}"`);
  const result = await searchOpenLibrary_Uncached(query, params, env);

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200');
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600');

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached OpenLibrary "${query}" (${result.works.length} works)`);
    } catch (error) {
      console.error(`❌ Cache write error for OpenLibrary "${query}":`, error);
    }
  }

  return result;
}

/**
 * Uncached OpenLibrary search (internal helper)
 */
async function searchOpenLibrary_Uncached(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('open-library', env);
  return circuitBreaker.execute(() =>
    logExternalApiCall(
      "OpenLibrary",
      async () => {
        console.log(`OpenLibrary general search for "${query}"`);

        const maxResults = params.maxResults || 20;

        const searchUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}`;
        const response = await fetch(searchUrl, {
          headers: { "User-Agent": OPENLIBRARY_USER_AGENT },
        });

        if (!response.ok) {
          throw new Error(`OpenLibrary search API failed: ${response.status}`);
        }

        const data = await response.json();
        const normalized = normalizeOpenLibrarySearchResults(data.docs || []);

        if (!normalized.works || normalized.works.length === 0) {
          return null;
        }

        return normalized;
      },
      { query },
      env,
    ),
  );
}

export async function getOpenLibraryAuthorWorks(
  authorName: string,
  env: ExternalAPIEnv,
): Promise<AuthorWorksData | null> {
  const circuitBreaker = getCircuitBreaker('open-library', env);
  return circuitBreaker.execute(async () => {
    try {
      console.log(`OpenLibrary getAuthorWorks("${authorName}")`);

      const authorKey = await findAuthorKeyByName(authorName);
      if (!authorKey) {
        console.log("Author not found in OpenLibrary");
        return null;
      }

      const works = await getWorksByAuthorKey(authorKey);

      return {
        author: {
          name: authorName,
          openLibraryKey: authorKey,
        },
        works: works,
      };
    } catch (error) {
      console.error(`Error in getAuthorWorks for "${authorName}":`, error);
      throw error; // Let exceptions bubble up
    }
  });
}

/**
 * Normalize OpenLibrary search results to canonical DTOs
 * Uses canonical normalizers to ensure contract compliance
 *
 * NOTE: This function temporarily attaches an `authors` property to WorkDTO
 * for enrichment service compatibility (WorkDTOWithAuthors type).
 * Handlers must strip this property before sending to client.
 */
function normalizeOpenLibrarySearchResults(
  docs: OpenLibraryDoc[],
): NormalizedResponse {
  const works: WorkDTOWithAuthors[] = [];
  const editions: EditionDTO[] = [];
  const authorsMap = new Map<string, AuthorDTO>();

  docs.forEach((doc) => {
    if (!doc.title) return;

    // Use canonical normalizer for WorkDTO (ensures all required fields)
    const work = normalizeOpenLibraryToWork(doc);

    // Use canonical normalizer for EditionDTO
    const edition = normalizeOpenLibraryToEdition(doc);

    // Extract authors and create AuthorDTOs
    const authorNames = doc.author_name || ["Unknown Author"];
    const authors = authorNames.map((name) =>
      normalizeOpenLibraryToAuthor(name),
    );

    // Attach authors to work for enrichment service compatibility
    work.authors = authors;

    // Add to authors map for deduplication
    authors.forEach((author) => {
      if (!authorsMap.has(author.name)) {
        authorsMap.set(author.name, author);
      }
    });

    works.push(work);
    editions.push(edition);
  });

  return {
    works,
    editions,
    authors: Array.from(authorsMap.values()),
  };
}

async function findAuthorKeyByName(authorName: string): Promise<string | null> {
  const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
  const response = await fetch(searchUrl, {
    headers: { "User-Agent": OPENLIBRARY_USER_AGENT },
  });
  if (!response.ok) throw new Error("OpenLibrary author search API failed");
  const data = await response.json();
  return data.docs && data.docs.length > 0 ? data.docs[0].key : null;
}

async function getWorksByAuthorKey(authorKey: string): Promise<
  Array<{
    title: string;
    openLibraryWorkKey: string;
    firstPublicationYear?: number;
    editions: any[];
  }>
> {
  const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=1000`;
  const response = await fetch(worksUrl, {
    headers: { "User-Agent": OPENLIBRARY_USER_AGENT },
  });
  if (!response.ok) throw new Error("OpenLibrary works fetch API failed");
  const data = await response.json();

  console.log(
    `OpenLibrary returned ${data.entries?.length || 0} works for ${authorKey}`,
  );

  return (data.entries || []).map((work: any) => ({
    title: work.title,
    openLibraryWorkKey: work.key,
    firstPublicationYear: work.first_publish_year,
    editions: [],
  }));
}

// ============================================================================
// ISBNDB API
// ============================================================================

const RATE_LIMIT_KEY = "isbndb_last_request";
const RATE_LIMIT_INTERVAL = 1000;

/**
 * Search ISBNdb for books by title and author using combined search endpoint
 * This is optimized for enrichment - uses both author and text parameters
 */
export async function searchISBNdb(
  title: string,
  authorName: string | null,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ ISBNdb search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return searchISBNdb_Uncached(title, authorName, env);
  }

  // Create cache service with 'isbndb' prefix
  const cache = createCacheService(kvNamespace, 'isbndb', env, ctx);

  // Generate cache key from title + author
  const cacheKey = `search:${title.toLowerCase().trim()}:${authorName?.toLowerCase().trim() || 'any'}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: ISBNdb search "${title}" by "${authorName || 'any'}"`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for ISBNdb search "${title}":`, error);
      // Fall through to API call
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Searching ISBNdb for "${title}" by "${authorName || 'any'}"`);
  const result = await searchISBNdb_Uncached(title, authorName, env);

  // Write successful results to cache
  if (result && result.works && result.works.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200');
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600');

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached ISBNdb search "${title}" (${result.works.length} works)`);
    } catch (error) {
      console.error(`❌ Cache write error for ISBNdb search "${title}":`, error);
    }
  }

  return result;
}

/**
 * Uncached ISBNdb title/author search (internal helper)
 */
async function searchISBNdb_Uncached(
  title: string,
  authorName: string | null,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const circuitBreaker = getCircuitBreaker('isbndb', env);
  return circuitBreaker.execute(() =>
    logExternalApiCall(
      "ISBNdb",
      async () => {
        console.log(
          `ISBNdb search for "${title}" by "${authorName || "any author"}"`,
        );

        let searchUrl = `https://api2.isbndb.com/search/books?page=1&pageSize=20&text=${encodeURIComponent(title)}`;
        if (authorName) {
          searchUrl += `&author=${encodeURIComponent(authorName)}`;
        }

        await enforceRateLimit(env);
        const searchResponse = await fetchWithAuth(searchUrl, env);

        if (!searchResponse.books || searchResponse.books.length === 0) {
          return null;
        }

        const works: WorkDTOWithAuthors[] = [];
        const editions: EditionDTO[] = [];
        const authorsSet = new Set<string>();

        for (const book of searchResponse.books) {
          const work = normalizeISBNdbToWork(book);
          const authorNames = book.authors || [];
          const workAuthors: AuthorDTO[] = [];
          authorNames.forEach((name) => {
            if (name) {
              const author = normalizeISBNdbToAuthor(name);
              workAuthors.push(author);
              if (!authorsSet.has(name)) {
                authorsSet.add(name);
              }
            }
          });

          (work as WorkDTOWithAuthors).authors = workAuthors;
          works.push(work as WorkDTOWithAuthors);
          const edition = normalizeISBNdbToEdition(book);
          editions.push(edition);
        }

        const authors = Array.from(authorsSet).map((name) =>
          normalizeISBNdbToAuthor(name),
        );

        return {
          works,
          editions,
          authors,
        };
      },
      { query: title },
      env,
    ),
  );
}

export async function getISBNdbEditionsForWork(
  title: string,
  authorName: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<EditionDTO[] | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ ISBNdb editions search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return getISBNdbEditionsForWork_Uncached(title, authorName, env);
  }

  // Create cache service with 'isbndb' prefix
  const cache = createCacheService(kvNamespace, 'isbndb', env, ctx);

  // Generate cache key
  const cacheKey = `editions:${title.toLowerCase().trim()}:${authorName.toLowerCase().trim()}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: ISBNdb editions "${title}" by "${authorName}"`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for ISBNdb editions "${title}":`, error);
      // Fall through to API call
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Fetching ISBNdb editions for "${title}" by "${authorName}"`);
  const result = await getISBNdbEditionsForWork_Uncached(title, authorName, env);

  // Write successful results to cache
  if (result && result.length > 0) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200');
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600');

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached ISBNdb editions "${title}" (${result.length} editions)`);
    } catch (error) {
      console.error(`❌ Cache write error for ISBNdb editions "${title}":`, error);
    }
  }

  return result;
}

/**
 * Uncached ISBNdb editions lookup (internal helper)
 */
async function getISBNdbEditionsForWork_Uncached(
  title: string,
  authorName: string,
  env: ExternalAPIEnv,
): Promise<EditionDTO[] | null> {
  const circuitBreaker = getCircuitBreaker('isbndb', env);
  return circuitBreaker.execute(async () => {
    try {
      console.log(`ISBNdb getEditionsForWork ("${title}", "${authorName}")`);
      const searchUrl = `https://api2.isbndb.com/books/${encodeURIComponent(title)}?column=title&language=en&shouldMatchAll=1&pageSize=100`;

      await enforceRateLimit(env);
      const searchResponse = await fetchWithAuth(searchUrl, env);

      if (!searchResponse.books || searchResponse.books.length === 0) {
        return null; // No results found
      }

      const relevantBooks = searchResponse.books.filter((book: ISBNdbBook) =>
        book.authors?.some((a) =>
          a.toLowerCase().includes(authorName.toLowerCase()),
        ),
      );

      if (relevantBooks.length === 0) {
        return null; // No relevant books found
      }

      // Use canonical normalizer for editions
      const editions = relevantBooks
        .map((book) => normalizeISBNdbToEdition(book))
        .sort((a, b) => b.isbndbQuality - a.isbndbQuality); // Sort by quality score

      return editions;
    } catch (error) {
      console.error(`Error in getEditionsForWork for "${title}":`, error);
      throw error; // Let exceptions bubble up
    }
  });
}

export async function getISBNdbBookByISBN(
  isbn: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): Promise<ISBNdbBookData | null> {
  // Get KV namespace
  const kvNamespace = env.KV_CACHE || env.CACHE;

  // If no KV cache or ExecutionContext, skip caching
  if (!kvNamespace || !ctx) {
    console.warn(`⚠️ ISBNdb ISBN search without cache (missing ${!kvNamespace ? 'KV namespace' : 'ExecutionContext'})`);
    return getISBNdbBookByISBN_Uncached(isbn, env);
  }

  // Create cache service with 'isbndb' prefix
  const cache = createCacheService(kvNamespace, 'isbndb', env, ctx);

  // Check cache FIRST
  const cacheKey = `isbn:${isbn.replace(/-/g, '')}`; // Normalize ISBN
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: ISBNdb ISBN ${isbn}`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for ISBNdb ISBN ${isbn}:`, error);
      // Fall through to API call
    }
  }

  // Cache MISS - fetch from API
  console.log(`🌐 Cache MISS: Fetching ISBNdb ISBN ${isbn}`);
  const result = await getISBNdbBookByISBN_Uncached(isbn, env);

  // Write successful results to cache (longer TTL for ISBNdb - premium API)
  if (result) {
    const hotTtl = parseInt(env.CACHE_HOT_TTL || '7200');
    const coldTtl = parseInt(env.CACHE_COLD_TTL || '1209600');

    try {
      await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
      console.log(`✅ Cached ISBNdb ISBN ${isbn}`);
    } catch (error) {
      console.error(`❌ Cache write error for ISBNdb ISBN ${isbn}:`, error);
    }
  }

  return result;
}

/**
 * Uncached ISBNdb ISBN lookup (internal helper)
 */
async function getISBNdbBookByISBN_Uncached(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<ISBNdbBookData | null> {
  const circuitBreaker = getCircuitBreaker('isbndb', env);
  return circuitBreaker.execute(() =>
    logExternalApiCall(
      "ISBNdb",
      async () => {
        console.log(`ISBNdb getBookByISBN("${isbn}")`);
        const url = `https://api2.isbndb.com/book/${isbn}?with_prices=0`;
        await enforceRateLimit(env);
        const response = await fetchWithAuth(url, env);

        if (!response.book) {
          return null;
        }

        const book = response.book;
        const work = normalizeISBNdbToWork(book);
        const edition = normalizeISBNdbToEdition(book);
        const authorNames = book.authors || [];
        const authors = authorNames.map((name: string) =>
          normalizeISBNdbToAuthor(name),
        );

        return {
          work,
          edition,
          authors,
          book: response.book,
        };
      },
      { isbn },
      env,
    ),
  );
}

async function fetchWithAuth(
  url: string,
  env: ExternalAPIEnv,
): Promise<ISBNdbSearchResponse> {
  // Handle both secrets store (has .get() method) and direct env var
  const apiKey = env.ISBNDB_API_KEY?.get
    ? await env.ISBNDB_API_KEY.get()
    : env.ISBNDB_API_KEY;

  if (!apiKey) throw new Error("ISBNDB_API_KEY secret not found");
  const response = await fetch(url, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ISBNdb API error: ${response.status} - ${errorText}`);
  }
  return response.json();
}

async function enforceRateLimit(env: ExternalAPIEnv): Promise<void> {
  // Use CACHE binding instead of KV_CACHE (unified naming)
  const kvBinding = env.KV_CACHE || env.CACHE;
  if (!kvBinding) {
    console.warn("No KV cache available for rate limiting");
    return;
  }

  const lastRequest = await kvBinding.get(RATE_LIMIT_KEY);
  if (lastRequest) {
    const timeDiff = Date.now() - parseInt(lastRequest);
    if (timeDiff < RATE_LIMIT_INTERVAL) {
      const waitTime = RATE_LIMIT_INTERVAL - timeDiff;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  await kvBinding.put(RATE_LIMIT_KEY, Date.now().toString(), {
    expirationTtl: 60,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
