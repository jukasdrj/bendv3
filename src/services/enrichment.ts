/**
 * Book enrichment service (Sprint 2: Thin Client Architecture)
 *
 * **Architecture Update (December 2025):**
 * BooksTrack is now a thin client that delegates all book enrichment to Alexandria.
 * Alexandria handles the smart logic internally:
 * - Checks its local database first (49M+ ISBNs)
 * - Auto-fetches from external APIs if not found (ISBNdb → Google Books → OpenLibrary)
 * - Stores results in its own database
 * - Returns fresh data to BooksTrack
 *
 * **Benefits:**
 * - Lower latency: Database checks happen inside Alexandria (sub-millisecond RPC)
 * - Better security: API keys live only in Alexandria, not in BooksTrack
 * - Cost savings: "Not found" checks stay local, no redundant external API calls
 * - Simpler BooksTrack: No fallback chains, no external API logic
 *
 * **Used by:**
 * - /api/enrichment/batch (via batch-enrichment.js handler)
 * - /v1/search/* endpoints (title, ISBN, advanced search)
 *
 * @see docs/ALEXANDRIA_RPC_MIGRATION.md for architecture details
 */

import { createAlexandriaClient } from "./alexandria-client.js";
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
 * Enrich multiple books with metadata (Thin Client - delegates to Alexandria)
 *
 * **Architecture (Sprint 2):**
 * Alexandria is now the smart provider that automatically:
 * 1. Checks its local database (49M+ ISBNs, <100ms)
 * 2. Auto-fetches from external APIs if not found (ISBNdb → Google → OpenLibrary)
 * 3. Stores results in its own database
 * 4. Returns fresh data
 *
 * BooksTrack just asks: "Do you have this book?" and trusts the response.
 *
 * @param query - Search parameters (isbn, title, author)
 * @param env - Worker environment bindings (needs ALEXANDRIA service binding)
 * @param options - Search options (maxResults)
 * @param ctx - ExecutionContext (not used in thin client, kept for API compatibility)
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

  // Validate: require at least one search parameter
  if (!isbn && !title && !author) {
    console.warn("enrichMultipleBooks: No search parameters provided");
    return { works: [], editions: [], authors: [] };
  }

  try {
    // Create Alexandria RPC client (sub-millisecond internal call)
    const client = createAlexandriaClient(env);

    console.log(`enrichMultipleBooks: Calling Alexandria RPC for`, { isbn, title, author, maxResults });

    // Call Alexandria's /api/search endpoint
    // Alexandria handles:
    // - Database lookup (fast, local, 49M+ ISBNs)
    // - External API fallback if not found (ISBNdb → Google → OpenLibrary)
    // - Automatic storage of new results
    const response = await client.api.search.$get({
      query: {
        isbn: isbn || undefined,
        title: title || undefined,
        author: author || undefined,
        // Note: maxResults not yet supported by Alexandria's search endpoint
        // Future enhancement: Alexandria should respect this parameter
      },
    });

    if (!response.ok) {
      console.error(`enrichMultipleBooks: Alexandria RPC error:`, response.status, response.statusText);
      return { works: [], editions: [], authors: [] };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.log(`enrichMultipleBooks: Alexandria found no results for`, { isbn, title, author });
      return { works: [], editions: [], authors: [] };
    }

    // Map Alexandria BookResult[] to BooksTrack canonical types
    // Alexandria stores data in normalized form (work/edition/author tables)
    // Works include embedded authors for per-work author support
    const works: (WorkDTO & { authors?: AuthorDTO[] })[] = [];
    const editions: EditionDTO[] = [];
    const authorsMap = new Map<string, AuthorDTO>();

    data.results.forEach((book: any) => {
      // Extract per-work authors first (needed for embedding in work)
      // Alexandria returns 'authors' as array of {name, key, openlibrary} objects
      // NOTE: Alexandria sometimes returns OpenLibrary paths as 'name' (e.g., "/authors/OL23919A")
      // We filter these out as they are not valid author names
      let workAuthorDTOs: AuthorDTO[] = [];
      if (book.authors && Array.isArray(book.authors)) {
        workAuthorDTOs = book.authors
          .map((a: any) => typeof a === 'string' ? a : a.name)
          .filter(Boolean)
          // Filter out OpenLibrary author paths (not valid names)
          .filter((name: string) => !name.startsWith('/authors/'))
          .map((name: string) => ({ name, gender: 'Unknown' as const }));
      } else if (book.author && !book.author.startsWith('/authors/')) {
        workAuthorDTOs = [{ name: book.author, gender: 'Unknown' as const }];
      }

      // Map to WorkDTO (canonical contract) with embedded authors
      // Alexandria returns: title, authors[], isbn, publishers, pages, work_title, openlibrary_edition, openlibrary_work
      const work: WorkDTO & { authors?: AuthorDTO[] } = {
        // Required fields
        title: book.title || book.work_title || 'Unknown',
        subjectTags: book.subjects ? (typeof book.subjects === 'string' ? JSON.parse(book.subjects) : book.subjects) : [],

        // External IDs - Legacy
        // Alexandria returns openlibrary_work as full URL, extract the key
        openLibraryWorkID: book.openlibrary_work ? book.openlibrary_work.split('/works/')[1] : undefined,
        googleBooksVolumeID: book.google_books_id || undefined,
        goodreadsID: book.goodreads_id || undefined,
        isbndbID: book.isbndb_work_id || undefined,

        // Optional metadata
        description: book.description || undefined,
        firstPublicationYear: book.first_published_year || undefined,
        coverImageURL: book.coverUrl || undefined,
        coverSource: book.coverSource || undefined,

        // Required arrays (empty if not provided)
        goodreadsWorkIDs: [],
        amazonASINs: [],
        librarythingIDs: [],
        googleBooksVolumeIDs: [],

        // Quality metrics (required)
        isbndbQuality: book.isbndb_quality || 0,
        reviewStatus: 'verified' as const, // Default for Alexandria data

        // Provenance
        primaryProvider: 'alexandria' as DataProvider,

        // Per-work embedded authors (for V3 API search results)
        authors: workAuthorDTOs,
      };
      works.push(work);

      // Map to EditionDTO (canonical contract)
      // Alexandria returns 'isbn' (single field), not isbn_13/isbn_10 separately
      const isbn = book.isbn_13 || book.isbn_10 || book.isbn;
      if (isbn) {
        const edition: EditionDTO = {
          isbn: isbn,
          isbns: [isbn], // Required array of all ISBNs
          title: book.title,
          publicationDate: book.published_date || book.publish_date || undefined,
          pageCount: book.page_count || book.pages || undefined,
          language: book.language || 'en',
          publisher: book.publisher || book.publishers || undefined,
          coverImageURL: book.coverUrl || undefined,
          coverSource: book.coverSource || undefined,
          format: 'paperback' as const, // Default format (required by EditionDTO)
          // External IDs
          openLibraryEditionID: book.openlibrary_edition ? book.openlibrary_edition.split('/books/')[1] : undefined,
          // Required arrays (empty if not provided)
          amazonASINs: [],
          googleBooksVolumeIDs: [],
          librarythingIDs: [],
          // Quality metrics
          isbndbQuality: book.isbndb_quality || 0,
          primaryProvider: 'alexandria' as DataProvider,
        };
        editions.push(edition);
      }

      // Add per-work authors to deduplicated authors map (for result.authors)
      workAuthorDTOs.forEach((author) => {
        if (author.name && !authorsMap.has(author.name)) {
          authorsMap.set(author.name, author);
        }
      });
    });

    // Apply maxResults filtering (client-side, since Alexandria doesn't support it yet)
    const filteredWorks = works.slice(0, maxResults);
    const filteredEditions = editions.slice(0, maxResults);

    console.log(`enrichMultipleBooks: Alexandria returned ${filteredWorks.length} works (requested: ${maxResults})`);

    return {
      works: filteredWorks,
      editions: filteredEditions,
      authors: Array.from(authorsMap.values()),
    };
  } catch (error) {
    console.error("enrichMultipleBooks: RPC error:", error);
    // Best-effort: Network/RPC errors = empty results (don't crash the request)
    return { works: [], editions: [], authors: [] };
  }
}

/**
 * Enrich a single book with metadata (Thin Client - delegates to Alexandria)
 *
 * **Architecture (Sprint 2):**
 * Alexandria is now the smart provider. BooksTrack just asks:
 * "Do you have this book?" and trusts the response.
 *
 * Alexandria handles:
 * - Database lookup (49M+ ISBNs, <100ms)
 * - External API fallback if not found (ISBNdb → Google → OpenLibrary)
 * - Automatic storage of new results
 * - Cover image selection (prioritizes high-quality covers)
 *
 * @param query - Search parameters (isbn, title, author, IDs)
 * @param env - Worker environment bindings (needs ALEXANDRIA service binding)
 * @param ctx - ExecutionContext (not used in thin client, kept for API compatibility)
 * @returns SingleEnrichmentResult with work, edition, and authors, or error object if not found
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
    // Create Alexandria RPC client (sub-millisecond internal call)
    const client = createAlexandriaClient(env);

    console.log(`enrichSingleBook: Calling Alexandria RPC for`, query);

    // Call Alexandria's /api/search endpoint
    // Alexandria handles all the smart fallback logic internally
    const response = await client.api.search.$get({
      query: {
        isbn: isbn || undefined,
        title: title || undefined,
        author: author || undefined,
        // Note: Alexandria doesn't yet support specific ID lookups (googleBooksId, openLibraryId)
        // Future enhancement: Pass these to Alexandria for even faster lookups
      },
    });

    if (!response.ok) {
      console.error(`enrichSingleBook: Alexandria RPC error:`, response.status, response.statusText);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: `Alexandria RPC error: ${response.status}`,
          provider: 'alexandria',
          retryable: response.status >= 500, // Retry on 5xx errors
        }
      };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.log(`enrichSingleBook: Alexandria found no results for`, query);
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Book not found in any provider',
          retryable: false,
        }
      };
    }

    // Take the first result (Alexandria returns best match first)
    const book = data.results[0];

    // Map to WorkDTO (canonical contract)
    const work: WorkDTO = {
      title: book.title,
      openLibraryWorkKey: book.work_key || undefined,
      googleBooksId: book.google_books_id || undefined,
      goodreadsId: book.goodreads_id || undefined,
      isbndbWorkId: book.isbndb_work_id || undefined,
      description: book.description || undefined,
      firstPublishedYear: book.first_published_year || undefined,
      coverImageURL: book.coverUrl || undefined, // Fixed: Use camelCase coverUrl from Alexandria
      subjects: book.subjects ? JSON.parse(book.subjects) : undefined,
      // Provenance: Alexandria is the source (it handled the smart lookup)
      dataProvider: 'alexandria' as DataProvider,
    };

    // Map to EditionDTO (canonical contract)
    const edition: EditionDTO | null = (book.isbn_13 || book.isbn_10) ? {
      isbn: book.isbn_13 || book.isbn_10!,
      isbn13: book.isbn_13 || undefined,
      isbn10: book.isbn_10 || undefined,
      title: book.title,
      publishedDate: book.published_date || undefined,
      pageCount: book.page_count || undefined,
      language: book.language || 'en',
      publisher: book.publisher || undefined,
      coverImageURL: book.coverUrl || undefined, // Fixed: Use camelCase coverUrl from Alexandria
      binding: book.binding || undefined,
      msrp: book.msrp || undefined,
      dimensions: book.dimensions || undefined,
      dataProvider: 'alexandria' as DataProvider,
      isbndbQuality: book.isbndb_quality || 0,
    } : null;

    // Map authors
    const authors: AuthorDTO[] = (book.authors || []).map((authorName: string) => ({
      name: authorName,
      gender: 'Unknown' as const, // Alexandria doesn't track gender
    }));

    console.log(`enrichSingleBook: Alexandria returned result for "${book.title}"`);

    return {
      success: true,
      work,
      edition,
      authors,
    };
  } catch (error) {
    console.error("enrichSingleBook: RPC error:", error);

    // Handle network/RPC errors
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network error while contacting Alexandria',
          retryable: true,
          retryAfterMs: 5000,
        }
      };
    }

    // Unknown error - not retryable
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error.message || 'Unknown error during enrichment',
        retryable: false,
      }
    };
  }
}

// ========================================================================================
// DEAD CODE NOTICE (Sprint 2 - Thin Client Migration)
// ========================================================================================
//
// The following helper functions are no longer used after the thin client refactor.
// They have been removed because Alexandria now handles all external API logic internally.
//
// Previously removed functions (December 2025):
// - searchGoogleBooks() - Now handled by Alexandria's smart provider
// - searchOpenLibrary() - Now handled by Alexandria's smart provider
// - searchByISBN() - Now handled by Alexandria's smart provider
// - searchGoogleBooksById() - Now handled by Alexandria's smart provider
// - searchOpenLibraryById() - Now handled by Alexandria's smart provider
// - searchOpenLibraryByGoodreadsId() - Now handled by Alexandria's smart provider
// - addProvenanceFields() - Provenance set to 'alexandria' in mapping logic
//
// All external API fallback chains have been replaced with single Alexandria RPC calls.
// See Sprint 2 migration notes in file header for architecture details.
//
// ========================================================================================
