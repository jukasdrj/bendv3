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

import type {
  AuthorReference,
  BookResult,
  ResolveExternalIdResult,
} from "alexandria-worker/types";
import type { AuthorDTO, EditionDTO, WorkDTO } from "../types/canonical.js";
import type {
  AuthorGender,
  DataProvider,
  EditionFormat,
} from "../types/enums.js";
import type { Env } from "../types/env.js";
import { createAlexandriaClient } from "./alexandria-client.js";
import {
  searchGoogleBooks,
  searchGoogleBooksByISBN,
  searchOpenLibrary,
} from "./external-apis.js";

// ========================================================================================
// INTERFACES
// ========================================================================================

/**
 * Extended BookResult with enriched fields
 * Alexandria returns these fields in practice, but they're not in the base BookResult type
 * See: alexandria-worker database schema (editions, works, authors tables)
 *
 * Note: We use intersection type (&) instead of extends to avoid type conflicts
 */
type EnrichedBookResult = BookResult & {
  // Edition fields (from editions table)
  isbn_10?: string | null;
  isbn_13?: string | null;
  published_date?: string | null;
  page_count?: number | null;
  language?: string | null;
  publisher?: string | null;
  binding?: string | null;

  // Work fields (from works table)
  work_key?: string | null;
  description?: string | null;
  first_published_year?: number | null;
  subjects?: string | null; // JSON string

  // External IDs (from enriched metadata)
  google_books_id?: string | null;
  goodreads_id?: string | null;
  isbndb_work_id?: string | null;
  isbndb_quality?: number | null;

  // OpenLibrary IDs
  openlibrary_edition_id?: string | null;
  openlibrary_work_id?: string | null;
};

// WorkerEnv interface removed - use Env from types/env.ts instead
// This duplicate interface was causing type conflicts (See TODO.md P3 #6)

/**
 * Query parameters for book searches
 */
interface BookSearchQuery {
  title?: string;
  author?: string;
  isbn?: string;
  openLibraryId?: string;
  googleBooksId?: string;
}

/**
 * Options for multi-book searches
 */
interface SearchOptions {
  maxResults?: number;
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
  code:
    | "NOT_FOUND"
    | "API_ERROR"
    | "RATE_LIMIT"
    | "CIRCUIT_OPEN"
    | "NETWORK_ERROR"
    | "INVALID_INPUT";
  message: string;
  provider?: string; // Which provider failed (e.g., 'google-books', 'open-library')
  retryable: boolean; // Whether the client should retry
  retryAfterMs?: number; // Suggested retry delay in milliseconds
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
export type SingleEnrichmentResponse =
  | SingleEnrichmentResult
  | SingleEnrichmentError
  | null;

// ========================================================================================
// HELPER FUNCTIONS
// ========================================================================================

/**
 * Maps Alexandria's AuthorReference to BooksTrack's AuthorDTO
 * Type-safe mapping ensures all enriched metadata fields are captured
 *
 * @param authorRef - Alexandria author reference (from BookResult.authors)
 * @returns AuthorDTO with all enriched metadata fields
 */
function mapAuthorReferenceToDTO(
  authorRef: AuthorReference | string,
): AuthorDTO {
  // Handle legacy string-only authors (backwards compatibility)
  if (typeof authorRef === "string") {
    return {
      name: authorRef,
      gender: "Unknown",
    };
  }

  // Map gender with proper type safety
  let gender: AuthorGender = "Unknown";
  if (authorRef.gender) {
    const g = authorRef.gender.toLowerCase();
    if (g === "male") gender = "Male";
    else if (g === "female") gender = "Female";
    else if (g === "non-binary") gender = "Non-binary";
    else gender = "Other";
  }

  // Map all enriched metadata fields (Alexandria v2.2.3+)
  return {
    name: authorRef.name,
    gender,
    nationality: authorRef.nationality ?? undefined,
    birthYear: authorRef.birth_year ?? undefined,
    deathYear: authorRef.death_year ?? undefined,
    // Enriched metadata (ensures no fields are missed)
    bio: authorRef.bio ?? undefined,
    wikidata_id: authorRef.wikidata_id ?? undefined,
    image: authorRef.image ?? undefined,
    key: authorRef.key ?? undefined,
    openlibrary: authorRef.openlibrary ?? undefined,
  };
}

// ========================================================================================
// PUBLIC FUNCTIONS
// ========================================================================================

/**
 * Resolve Amazon ASIN to ISBN using Alexandria's External ID Resolution API (v2.3.0+)
 *
 * **Architecture:**
 * - Delegates to Alexandria for reverse lookup (provider: amazon, type: isbn)
 * - Caches results in KV for efficiency (7-day TTL for stable mappings)
 * - Handles failures gracefully (returns null ISBN to allow fallbacks)
 *
 * **Use Cases:**
 * - User book imports from Amazon (ASIN → ISBN conversion)
 * - Cross-reference resolution for multi-provider data
 *
 * **Performance:**
 * - Cache hit: <1ms (KV lookup)
 * - Cache miss: 10-15ms (Alexandria lazy backfill)
 * - Expected hit rate: 95%+ after 30 days
 *
 * @param asin - Amazon ASIN to resolve (e.g., 'B001234567')
 * @param env - Worker environment bindings (requires ALEXANDRIA service binding and EXTERNAL_IDS KV)
 * @param ctx - ExecutionContext for caching (optional)
 * @returns Object with ISBN (if resolved), confidence score (0-100), and cache status
 *
 * @example
 * ```typescript
 * const result = await resolveAsinToIsbn('B001234567', env)
 * if (result.isbn && result.confidence >= 80) {
 *   // High confidence resolution - proceed with enrichment
 *   const bookData = await findBookByISBN(result.isbn, env)
 * } else {
 *   // Low confidence or failed - try fallback methods
 *   console.warn(`ASIN ${asin} could not be resolved with high confidence`)
 * }
 * ```
 */
export async function resolveAsinToIsbn(
  asin: string,
  env: Env,
  _ctx?: ExecutionContext,
): Promise<{ isbn: string | null; confidence: number; cached?: boolean }> {
  if (!asin) {
    console.warn("[resolveAsinToIsbn] Empty ASIN provided");
    return { isbn: null, confidence: 0 };
  }

  const cacheKey = `asin:${asin}`;

  // Step 1: Check KV cache first (long TTL for stable external IDs)
  if (env.EXTERNAL_IDS) {
    try {
      const cached = await env.EXTERNAL_IDS.get<{
        isbn: string;
        confidence: number;
        ttl: number;
      }>(cacheKey, { type: "json" });

      if (cached && Date.now() < cached.ttl) {
        console.log(
          `[resolveAsinToIsbn] ✅ KV cache hit for ASIN ${asin}: ${cached.isbn}`,
        );
        return {
          isbn: cached.isbn,
          confidence: cached.confidence,
          cached: true,
        };
      }
    } catch (cacheError) {
      console.warn(
        `[resolveAsinToIsbn] ⚠️ KV cache error for ${asin}:`,
        cacheError,
      );
      // Continue without cache
    }
  }

  console.log(
    `[resolveAsinToIsbn] 🔍 KV cache miss for ASIN ${asin}, calling Alexandria RPC`,
  );

  // Step 2: Call Alexandria's reverse lookup endpoint
  try {
    // Create Alexandria RPC client (sub-millisecond internal call via Service Binding)
    const client = createAlexandriaClient(env);

    // Call reverse lookup: GET /api/resolve/amazon/{asin}?type=edition
    // Alexandria will check its crosswalk table and lazy-backfill if needed
    const response = await (
      client.api.resolve as {
        $get: (options: {
          param: { provider: string; id: string };
          query: { type: string };
        }) => Promise<Response>;
      }
    ).$get({
      param: { provider: "amazon", id: asin },
      query: { type: "edition" },
    });

    if (!response.ok) {
      console.warn(
        `[resolveAsinToIsbn] ⚠️ Alexandria RPC error for ${asin}: ${response.status} ${response.statusText}`,
      );
      return { isbn: null, confidence: 0 };
    }

    const data = (await response.json()) as ResolveExternalIdResult;

    // Alexandria response format: { success: true, data: { key, entity_type, confidence } }
    if (!data.success || !data.data || data.data.confidence < 50) {
      console.log(
        `[resolveAsinToIsbn] ⚠️ Alexandria found no/low-confidence resolution for ${asin} (confidence: ${data.data?.confidence || 0})`,
      );
      return { isbn: null, confidence: data.data?.confidence || 0 };
    }

    const { key: isbn, confidence } = data.data;

    // Step 3: Cache successful resolution (TTL: 7 days)
    if (env.EXTERNAL_IDS) {
      try {
        const ttl = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        await env.EXTERNAL_IDS.put(
          cacheKey,
          JSON.stringify({
            isbn,
            confidence,
            ttl,
          }),
          { expirationTtl: 7 * 24 * 60 * 60 }, // 7 days in seconds
        );
        console.log(
          `[resolveAsinToIsbn] ✅ Cached resolution: ${asin} → ${isbn}`,
        );
      } catch (cacheError) {
        console.warn(
          `[resolveAsinToIsbn] ⚠️ Failed to cache ${asin}:`,
          cacheError,
        );
        // Don't fail the request - caching is best-effort
      }
    }

    console.log(
      `[resolveAsinToIsbn] ✅ Resolved ASIN ${asin} to ISBN ${isbn} (confidence: ${confidence})`,
    );
    return { isbn, confidence, cached: false };
  } catch (error) {
    console.error(`[resolveAsinToIsbn] ❌ RPC error for ${asin}:`, error);
    // Soft error: return null to allow fallbacks
    return { isbn: null, confidence: 0 };
  }
}

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
  env: Env,
  options: SearchOptions = { maxResults: 20 },
  _ctx?: ExecutionContext,
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
    // DIAGNOSTIC_LOG: Check if client is using Service Binding or External URL
    const client = createAlexandriaClient(env as unknown as Env) as {
      api: {
        search: {
          $get: (options: {
            query: { isbn?: string; title?: string; author?: string };
          }) => Promise<Response>;
        };
      };
    };

    console.log(`enrichMultipleBooks: Calling Alexandria RPC for`, {
      isbn,
      title,
      author,
      maxResults,
    });

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
      console.error(
        `enrichMultipleBooks: Alexandria RPC error:`,
        response.status,
        response.statusText,
        await response.text().catch(() => 'No response body'),
      );
      return { works: [], editions: [], authors: [] };
    }

    const responseData = await response.json();

    // Alexandria wraps results in "data" envelope: { success: true, data: { results: [...] } }
    const data = (
      typeof responseData === "object" &&
      responseData !== null &&
      "data" in responseData
        ? responseData.data
        : responseData
    ) as { results?: unknown[] };

    if (!data.results || data.results.length === 0) {
      console.log(`enrichMultipleBooks: Alexandria found no results for`, {
        isbn,
        title,
        author,
      });

      // FALLBACK: Google Books -> OpenLibrary
      // Alexandria currently fails for title/author searches (Phase 3 pending)
      console.log(`enrichMultipleBooks: ⚠️ Falling back to Google Books`);

      let fallbackResult = null;

      if (isbn) {
        fallbackResult = await searchGoogleBooksByISBN(isbn, env as any);
      } else {
        // Construct query string for Google Books
        const confirmQuery = [title, author].filter(Boolean).join(" ");
        if (confirmQuery) {
          fallbackResult = await searchGoogleBooks(
            confirmQuery,
            { maxResults },
            env as any,
          );
        }
      }

      // If Google Books failed/empty, try OpenLibrary
      if (
        (!fallbackResult || !fallbackResult.works.length) &&
        (title || author)
      ) {
        console.log(
          `enrichMultipleBooks: ⚠️ Google Books empty, falling back to OpenLibrary`,
        );
        const q = [title, author].filter(Boolean).join(" ");
        fallbackResult = await searchOpenLibrary(q, { maxResults }, env as any);
      }

      if (fallbackResult) {
        // Map NormalizedResponse to EnrichmentResult (strip work.authors)
        return {
          works: fallbackResult.works.map((w) => {
            const { authors, ...rest } = w; // Strip authors from work
            return rest;
          }),
          editions: fallbackResult.editions,
          authors: fallbackResult.authors,
        };
      }

      return { works: [], editions: [], authors: [] };
    }

    // Map Alexandria BookResult[] to BooksTrack canonical types
    // Alexandria stores data in normalized form (work/edition/author tables)
    // Works include embedded authors for per-work author support
    const works: (WorkDTO & { authors?: AuthorDTO[] })[] = [];
    const editions: EditionDTO[] = [];
    const authorsMap = new Map<string, AuthorDTO>();

    data.results.forEach((item) => {
      const book = item as EnrichedBookResult
      // Extract per-work authors first (needed for embedding in work)
      // Alexandria returns 'authors' as array of AuthorReference objects
      // NOTE: Alexandria sometimes returns OpenLibrary paths as 'name' (e.g., "/authors/OL23919A")
      // We filter these out as they are not valid author names
      let workAuthorDTOs: AuthorDTO[] = [];
      if (book.authors && Array.isArray(book.authors)) {
        workAuthorDTOs = book.authors
          .map((authorRef: AuthorReference | string) =>
            mapAuthorReferenceToDTO(authorRef),
          )
          // Filter out invalid names and OpenLibrary paths
          .filter(
            (a) =>
              a &&
              typeof a === "object" &&
              a.name &&
              !a.name.startsWith("/authors/"),
          );
      }

      // Map to WorkDTO (canonical contract) with embedded authors
      // Alexandria returns: title, authors[], isbn, publishers, pages, work_title, openlibrary_edition, openlibrary_work
      const work: WorkDTO & { authors?: AuthorDTO[] } = {
        // Required fields
        title: book.title || book.work_title || "Unknown",
        subjectTags: book.subjects
          ? typeof book.subjects === "string"
            ? JSON.parse(book.subjects)
            : book.subjects
          : [],

        // External IDs - Legacy
        // Alexandria returns openlibrary_work as full URL, extract the key
        openLibraryWorkID: book.openlibrary_work
          ? book.openlibrary_work.split("/works/")[1]
          : undefined,
        googleBooksVolumeID: book.google_books_id || undefined,
        goodreadsID: book.goodreads_id || undefined,
        isbndbID: book.isbndb_work_id || undefined,

        // Optional metadata
        description: book.description || undefined,
        firstPublicationYear: book.first_published_year || undefined,
        coverImageURL: book.coverUrl || undefined,
        coverUrls: book.coverUrls ? { original: book.coverUrls.large || '', ...book.coverUrls } : undefined, // Multi-size covers (Alexandria v2.2.4+)
        coverSource: book.coverSource || undefined,

        // Required arrays (empty if not provided)
        goodreadsWorkIDs: [],
        amazonASINs: [],
        librarythingIDs: [],
        googleBooksVolumeIDs: [],

        // Quality metrics (required)
        isbndbQuality: book.isbndb_quality || 0,
        reviewStatus: "verified" as const, // Default for Alexandria data

        // Provenance
        primaryProvider: "alexandria" as DataProvider,

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
          publicationDate:
            book.published_date || book.publish_date || undefined,
          pageCount: book.page_count || book.pages || undefined,
          language: book.language || "en",
          publisher: book.publisher || book.publishers || undefined,
          coverImageURL: book.coverUrl || undefined,
          coverUrls: book.coverUrls ? { original: book.coverUrls.large || '', ...book.coverUrls } : undefined, // Multi-size covers (Alexandria v2.2.4+)
          coverSource: book.coverSource || undefined,
          format: mapBindingToFormat(book.binding ?? undefined), // Default format (required by EditionDTO)
          // External IDs
          openLibraryEditionID: book.openlibrary_edition
            ? book.openlibrary_edition.split("/books/")[1]
            : undefined,
          // Required arrays (empty if not provided)
          amazonASINs: [],
          googleBooksVolumeIDs: [],
          librarythingIDs: [],
          // Quality metrics
          isbndbQuality: book.isbndb_quality || 0,
          primaryProvider: "alexandria" as DataProvider,
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

    console.log(
      `enrichMultipleBooks: Alexandria returned ${filteredWorks.length} works (requested: ${maxResults})`,
    );

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
  env: Env,
  _ctx?: ExecutionContext,
): Promise<SingleEnrichmentResponse> {
  const { title, author, isbn, openLibraryId, googleBooksId } = query;

  // Require at least one search parameter
  if (!title && !isbn && !author && !openLibraryId && !googleBooksId) {
    console.warn("enrichSingleBook: No search parameters provided");
    return null;
  }

  try {
    // Create Alexandria RPC client (sub-millisecond internal call)
    const client = createAlexandriaClient(env as unknown as Env) as {
      api: {
        search: {
          $get: (options: {
            query: { isbn?: string; title?: string; author?: string };
          }) => Promise<Response>;
        };
      };
    };

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
      console.error(
        `enrichSingleBook: Alexandria RPC error:`,
        response.status,
        response.statusText,
      );
      return {
        success: false,
        error: {
          code: "API_ERROR",
          message: `Alexandria RPC error: ${response.status}`,
          provider: "alexandria",
          retryable: response.status >= 500, // Retry on 5xx errors
        },
      };
    }

    const responseData = await response.json();

    // Alexandria wraps results in "data" envelope: { success: true, data: { results: [...] } }
    const rawData =
      typeof responseData === "object" &&
      responseData !== null &&
      "data" in responseData
        ? responseData.data
        : responseData;

    // Type guard: verify data has results array
    const data = rawData as { results?: unknown[] };
    if (
      !data ||
      typeof data !== "object" ||
      !("results" in data) ||
      !Array.isArray(data.results) ||
      data.results.length === 0
    ) {
      console.log(`enrichSingleBook: Alexandria found no results for`, query);

      // FALLBACK: Google Books
      console.log(`enrichSingleBook: ⚠️ Falling back to Google Books`);

      let fallbackResult = null;

      if (isbn) {
        fallbackResult = await searchGoogleBooksByISBN(isbn, env as any);
      } else {
        const q = [title, author].filter(Boolean).join(" ");
        if (q) {
          fallbackResult = await searchGoogleBooks(
            q,
            { maxResults: 1 },
            env as any,
          );
        }
      }

      if (fallbackResult && fallbackResult.works.length > 0) {
        const work = fallbackResult.works[0];
        const edition = fallbackResult.editions[0] || null;
        // fallbackResult.authors is a flat list of all authors from all works
        // But for single result, it matches exactly

        // Strip authors from work (types compatibility)
        const { authors, ...cleanWork } = work;

        return {
          success: true,
          work: cleanWork,
          edition,
          authors: fallbackResult.authors,
        };
      }

      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Book not found in any provider",
          retryable: false,
        },
      };
    }

    // Take the first result (Alexandria returns best match first)
    const book = data.results[0] as EnrichedBookResult;

    console.log(
      `enrichSingleBook: Alexandria returned result for "${book.title}"`,
      JSON.stringify(book)
    );

    // Map to WorkDTO (canonical contract)
    const work: WorkDTO = {
      title: book.title,
      openLibraryWorkID: book.work_key || undefined,
      googleBooksVolumeID: book.google_books_id || undefined,
      goodreadsID: book.goodreads_id || undefined,
      isbndbID: book.isbndb_work_id || undefined,
      description: book.description || undefined,
      firstPublicationYear: book.first_published_year || undefined,
      coverImageURL: book.coverUrl || undefined, // Fixed: Use camelCase coverUrl from Alexandria
      coverUrls: book.coverUrls ? { original: book.coverUrls.large || '', ...book.coverUrls } : undefined, // Multi-size covers (Alexandria v2.2.4+)
      coverSource: book.coverSource || undefined,
      subjectTags: book.subjects ? JSON.parse(book.subjects) : undefined,
      // Provenance: Alexandria is the source (it handled the smart lookup)
      primaryProvider: "alexandria" as DataProvider,
      // Required arrays (empty if not provided)
      goodreadsWorkIDs: [],
      amazonASINs: [],
      librarythingIDs: [],
      googleBooksVolumeIDs: [],
      // Quality metrics (required)
      isbndbQuality: book.isbndb_quality || 0,
      reviewStatus: "verified" as const,
    };

    // Map to EditionDTO (canonical contract)
    const bestIsbn = book.isbn_13 || book.isbn_10 || book.isbn;
    const edition: EditionDTO | null =
      bestIsbn
        ? {
            isbn: bestIsbn,
            isbns: [bestIsbn],
            title: book.title,
            publicationDate: book.published_date || undefined,
            pageCount: book.page_count || undefined,
            language: book.language || "en",
            publisher: book.publisher ? book.publisher : undefined,
            coverImageURL: book.coverUrl ? book.coverUrl : undefined, // Fixed: Use camelCase coverUrl from Alexandria
            coverUrls: book.coverUrls ? { original: book.coverUrls.large || '', ...book.coverUrls } : undefined, // Multi-size covers (Alexandria v2.2.4+)
            coverSource: book.coverSource || undefined,
            format: mapBindingToFormat(book.binding ?? undefined),
            primaryProvider: "alexandria" as DataProvider,
            isbndbQuality: book.isbndb_quality || 0,
            // External IDs
            openLibraryEditionID: book.openlibrary_edition
              ? book.openlibrary_edition.split("/books/")[1]
              : undefined,
            // Required arrays (empty if not provided)
            amazonASINs: [],
            googleBooksVolumeIDs: [],
            librarythingIDs: [],
          }
        : null;

    // Map authors using type-safe helper function
    const authors: AuthorDTO[] = (book.authors || [])
      .map((authorRef: AuthorReference | string) =>
        mapAuthorReferenceToDTO(authorRef),
      )
      // Filter out invalid names and OpenLibrary paths (matching enrichMultipleBooks)
      .filter(
        (a) =>
          a &&
          typeof a === "object" &&
          a.name &&
          !a.name.startsWith("/authors/"),
      );

    return {
      success: true,
      work,
      edition,
      authors,
    };
  } catch (error) {
    console.error("enrichSingleBook: RPC error:", error);

    // Type guard for error object
    const err = error as Error;

    // Handle network/RPC errors
    if (err.name === "TypeError" || err.message?.includes("fetch")) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "Network error while contacting Alexandria",
          retryable: true,
          retryAfterMs: 5000,
        },
      };
    }

    // Unknown error - not retryable
    return {
      success: false,
      error: {
        code: "API_ERROR",
        message: err.message || "Unknown error during enrichment",
        retryable: false,
      },
    };
  }
}

function mapBindingToFormat(binding?: string): EditionFormat {
  if (!binding) return "Paperback";
  const b = binding.toLowerCase();
  if (b.includes("hard") || b.includes("bound")) return "Hardcover";
  if (b.includes("soft") || b.includes("paper")) return "Paperback";
  if (b.includes("audio") || b.includes("cd") || b.includes("cassette"))
    return "Audiobook";
  if (
    b.includes("digital") ||
    b.includes("epub") ||
    b.includes("kindle") ||
    b.includes("ebook")
  )
    return "E-book";
  if (b.includes("mass")) return "Mass Market";

  return "Paperback";
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
