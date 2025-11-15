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
): Promise<NormalizedResponse | null> {
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
}

export async function searchGoogleBooks(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const startTime = Date.now();
  try {
    console.log(`GoogleBooks search for "${query}"`);

    // Handle both secrets store (has .get() method) and direct env var
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
    });

    if (!response.ok) {
      throw new Error(
        `Google Books API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const normalizedData = normalizeGoogleBooksResponse(data);

    const processingTime = Date.now() - startTime;

    if (env.GOOGLE_BOOKS_ANALYTICS) {
      env.GOOGLE_BOOKS_ANALYTICS.writeDataPoint({
        blobs: [query, "search"],
        doubles: [processingTime, normalizedData.works.length],
        indexes: ["google-books-search"],
      });
    }

    // Return null if no works found
    if (!normalizedData.works || normalizedData.works.length === 0) {
      return null;
    }

    return normalizedData;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Error in GoogleBooks search:`, error);

    if (env.GOOGLE_BOOKS_ANALYTICS) {
      env.GOOGLE_BOOKS_ANALYTICS.writeDataPoint({
        blobs: [query, "search_error"],
        doubles: [processingTime, 0],
        indexes: ["google-books-error"],
      });
    }

    throw error; // Let exceptions bubble up
  }
}

export async function searchGoogleBooksByISBN(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const startTime = Date.now();
  try {
    console.log(`GoogleBooks ISBN search for "${isbn}"`);

    // Handle both secrets store (has .get() method) and direct env var
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
    });

    if (!response.ok) {
      throw new Error(
        `Google Books API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const normalizedData = normalizeGoogleBooksResponse(data);

    const processingTime = Date.now() - startTime;

    if (env.GOOGLE_BOOKS_ANALYTICS) {
      env.GOOGLE_BOOKS_ANALYTICS.writeDataPoint({
        blobs: [isbn, "isbn_search"],
        doubles: [processingTime, normalizedData.works.length],
        indexes: ["google-books-isbn"],
      });
    }

    // Return null if no works found
    if (!normalizedData.works || normalizedData.works.length === 0) {
      return null;
    }

    return normalizedData;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Error in GoogleBooks ISBN search:`, error);

    if (env.GOOGLE_BOOKS_ANALYTICS) {
      env.GOOGLE_BOOKS_ANALYTICS.writeDataPoint({
        blobs: [isbn, "isbn_search_error"],
        doubles: [processingTime, 0],
        indexes: ["google-books-error"],
      });
    }

    throw error; // Let exceptions bubble up
  }
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
    const authorNames = volumeInfo.authors || ["Unknown Author"];
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
}

export async function searchOpenLibraryById(
  workId: string,
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
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
}

export async function searchOpenLibrary(
  query: string,
  params: SearchParams = {},
  env: ExternalAPIEnv,
): Promise<NormalizedResponse | null> {
  const startTime = Date.now();
  try {
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

    // Return null if no works found
    if (!normalized.works || normalized.works.length === 0) {
      return null;
    }

    return normalized;
  } catch (error) {
    console.error(`Error in OpenLibrary search for "${query}":`, error);
    throw error; // Let exceptions bubble up
  }
}

export async function getOpenLibraryAuthorWorks(
  authorName: string,
  env: ExternalAPIEnv,
): Promise<AuthorWorksData | null> {
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
): Promise<NormalizedResponse | null> {
  try {
    console.log(
      `ISBNdb search for "${title}" by "${authorName || "any author"}"`,
    );

    // Build search URL with author and text parameters
    let searchUrl = `https://api2.isbndb.com/search/books?page=1&pageSize=20&text=${encodeURIComponent(title)}`;
    if (authorName) {
      searchUrl += `&author=${encodeURIComponent(authorName)}`;
    }

    await enforceRateLimit(env);
    const searchResponse = await fetchWithAuth(searchUrl, env);

    if (!searchResponse.books || searchResponse.books.length === 0) {
      return null; // No results found
    }

    // Use canonical normalizers for ISBNdb data
    const works: WorkDTOWithAuthors[] = [];
    const editions: EditionDTO[] = [];
    const authorsSet = new Set<string>();

    for (const book of searchResponse.books) {
      // Normalize to canonical WorkDTO
      const work = normalizeISBNdbToWork(book);

      // Extract and normalize authors
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

      // Attach authors to work for enrichment service compatibility
      (work as WorkDTOWithAuthors).authors = workAuthors;
      works.push(work as WorkDTOWithAuthors);

      // Normalize to canonical EditionDTO
      const edition = normalizeISBNdbToEdition(book);
      editions.push(edition);
    }

    // Convert author names to AuthorDTOs
    const authors = Array.from(authorsSet).map((name) =>
      normalizeISBNdbToAuthor(name),
    );

    return {
      works,
      editions,
      authors,
    };
  } catch (error) {
    console.error(`Error in ISBNdb search for "${title}":`, error);
    throw error; // Let exceptions bubble up
  }
}

export async function getISBNdbEditionsForWork(
  title: string,
  authorName: string,
  env: ExternalAPIEnv,
): Promise<EditionDTO[] | null> {
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
}

export async function getISBNdbBookByISBN(
  isbn: string,
  env: ExternalAPIEnv,
): Promise<ISBNdbBookData | null> {
  try {
    console.log(`ISBNdb getBookByISBN("${isbn}")`);
    const url = `https://api2.isbndb.com/book/${isbn}?with_prices=0`;
    await enforceRateLimit(env);
    const response = await fetchWithAuth(url, env);

    if (!response.book) {
      return null; // Book not found
    }

    const book = response.book;

    // Use canonical normalizers
    const work = normalizeISBNdbToWork(book);
    const edition = normalizeISBNdbToEdition(book);

    // Extract authors
    const authorNames = book.authors || [];
    const authors = authorNames.map((name: string) =>
      normalizeISBNdbToAuthor(name),
    );

    return {
      work,
      edition,
      authors,
      book: response.book, // Keep raw book data for backward compatibility
    };
  } catch (error) {
    console.error(`Error in getBookByISBN for "${isbn}":`, error);
    throw error; // Let exceptions bubble up
  }
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
