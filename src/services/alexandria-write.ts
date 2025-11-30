/**
 * Alexandria Write API Integration
 *
 * Stores enrichment data back to Alexandria for future lookups.
 * Uses fire-and-forget pattern via ctx.waitUntil() to avoid blocking responses.
 *
 * @see https://alexandria.ooheynerds.com/openapi.json for API spec
 */

import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js";
import type { ExternalAPIEnv } from "./external-apis.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const ALEXANDRIA_BASE_URL = "https://alexandria.ooheynerds.com";
const ALEXANDRIA_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaWrite/1.0.0";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Alexandria enrichment edition request payload
 */
interface AlexandriaEditionPayload {
  isbn: string;
  title?: string;
  subtitle?: string;
  publisher?: string;
  publication_date?: string;
  page_count?: number;
  format?: string;
  language?: string;
  primary_provider: string;
  cover_urls?: {
    large?: string;
    medium?: string;
    small?: string;
  };
  cover_source?: string;
  work_key?: string;
  openlibrary_edition_id?: string;
  amazon_asins?: string[];
  google_books_volume_ids?: string[];
  goodreads_edition_ids?: string[];
  alternate_isbns?: string[];
}

/**
 * Alexandria enrichment work request payload
 */
interface AlexandriaWorkPayload {
  work_key: string;
  title: string;
  subtitle?: string;
  description?: string;
  original_language?: string;
  first_publication_year?: number;
  subject_tags?: string[];
  primary_provider: string;
  cover_urls?: {
    large?: string;
    medium?: string;
    small?: string;
  };
  cover_source?: string;
  openlibrary_work_id?: string;
  goodreads_work_ids?: string[];
  amazon_asins?: string[];
  google_books_volume_ids?: string[];
}

/**
 * Alexandria enrichment author request payload
 */
interface AlexandriaAuthorPayload {
  author_key: string;
  name: string;
  gender?: string;
  nationality?: string;
  birth_year?: number;
  death_year?: number;
  bio?: string;
  bio_source?: string;
  author_photo_url?: string;
  primary_provider: string;
  openlibrary_author_id?: string;
  goodreads_author_ids?: string[];
  wikidata_id?: string;
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Store edition enrichment data in Alexandria (fire-and-forget)
 *
 * Call this after successful external provider lookups to cache data for future use.
 * Uses ctx.waitUntil() to avoid blocking the response.
 *
 * @param edition - Edition DTO from enrichment pipeline
 * @param provider - Which provider the data came from (e.g., 'isbndb', 'google-books')
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 */
export function storeEditionInAlexandria(
  edition: EditionDTO,
  provider: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): void {
  // Skip if no ISBN (can't store without primary key)
  if (!edition.isbn && (!edition.isbns || edition.isbns.length === 0)) {
    console.log(`⏭️ Alexandria write skipped: No ISBN for edition`);
    return;
  }

  // Skip Alexandria provider (don't write back what we read from it)
  if (provider === "alexandria") {
    return;
  }

  const payload = mapEditionToAlexandria(edition, provider);

  if (ctx) {
    // Fire-and-forget: don't block the response
    ctx.waitUntil(postToAlexandria("/api/enrich/edition", payload, env));
  } else if ((env as unknown as { ENRICHMENT_QUEUE?: Queue }).ENRICHMENT_QUEUE) {
    // No ExecutionContext (e.g., alarm context), queue for later processing
    const queue = (env as unknown as { ENRICHMENT_QUEUE: Queue }).ENRICHMENT_QUEUE;
    console.log(`📤 Alexandria write queued (alarm context): edition ${payload.isbn}`);
    queue.send({
      entity_type: 'edition',
      isbn: payload.isbn,
      source: 'alarm_fallback',
      priority: 5, // Medium priority for fallback
      timestamp: new Date().toISOString(),
    }).catch((err: Error) => {
      console.warn(`⚠️ Failed to queue Alexandria write for ${payload.isbn}:`, err.message);
    });
  } else {
    // No context and no queue available, log warning and skip
    console.warn(`⚠️ Alexandria write skipped: No ExecutionContext for edition ${payload.isbn}`);
  }
}

/**
 * Store work enrichment data in Alexandria (fire-and-forget)
 *
 * @param work - Work DTO from enrichment pipeline
 * @param provider - Which provider the data came from
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 */
export function storeWorkInAlexandria(
  work: WorkDTO,
  provider: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): void {
  // Skip if no work key (can't store without primary key)
  if (!work.openLibraryID && !work.openLibraryWorkID && !work.googleBooksVolumeID) {
    console.log(`⏭️ Alexandria write skipped: No work key for "${work.title}"`);
    return;
  }

  // Skip Alexandria provider (don't write back what we read from it)
  if (provider === "alexandria") {
    return;
  }

  const payload = mapWorkToAlexandria(work, provider);

  if (ctx) {
    ctx.waitUntil(postToAlexandria("/api/enrich/work", payload, env));
  } else {
    console.warn(`⚠️ Alexandria write skipped: No ExecutionContext for work ${payload.work_key}`);
  }
}

/**
 * Store author enrichment data in Alexandria (fire-and-forget)
 *
 * @param author - Author DTO from enrichment pipeline
 * @param provider - Which provider the data came from
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 */
export function storeAuthorInAlexandria(
  author: AuthorDTO,
  provider: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): void {
  // Skip if no author key (can't store without primary key)
  if (!author.openLibraryID && !author.googleBooksID) {
    console.log(`⏭️ Alexandria write skipped: No author key for "${author.name}"`);
    return;
  }

  // Skip Alexandria provider (don't write back what we read from it)
  if (provider === "alexandria") {
    return;
  }

  const payload = mapAuthorToAlexandria(author, provider);

  if (ctx) {
    ctx.waitUntil(postToAlexandria("/api/enrich/author", payload, env));
  } else {
    console.warn(`⚠️ Alexandria write skipped: No ExecutionContext for author ${payload.author_key}`);
  }
}

/**
 * Store full enrichment result in Alexandria (convenience function)
 *
 * Stores work, editions, and authors from a complete enrichment result.
 * Call this after successful enrichMultipleBooks() or enrichSingleBook().
 *
 * @param result - Complete enrichment result with works, editions, authors
 * @param provider - Which provider the data came from
 * @param env - Worker environment bindings
 * @param ctx - Execution context for waitUntil
 */
export function storeEnrichmentInAlexandria(
  result: { works?: WorkDTO[]; editions?: EditionDTO[]; authors?: AuthorDTO[] },
  provider: string,
  env: ExternalAPIEnv,
  ctx?: ExecutionContext,
): void {
  // Skip Alexandria provider
  if (provider === "alexandria") {
    return;
  }

  // Store all editions
  if (result.editions) {
    for (const edition of result.editions) {
      storeEditionInAlexandria(edition, provider, env, ctx);
    }
  }

  // Store all works
  if (result.works) {
    for (const work of result.works) {
      storeWorkInAlexandria(work, provider, env, ctx);
    }
  }

  // Store all authors
  if (result.authors) {
    for (const author of result.authors) {
      storeAuthorInAlexandria(author, provider, env, ctx);
    }
  }
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Map EditionDTO to Alexandria API payload
 */
function mapEditionToAlexandria(edition: EditionDTO, provider: string): AlexandriaEditionPayload {
  const primaryIsbn = edition.isbn || (edition.isbns && edition.isbns[0]) || "";
  return {
    isbn: primaryIsbn,
    title: edition.title || undefined,
    publisher: edition.publisher || undefined,
    publication_date: edition.publicationDate || undefined,
    page_count: edition.pageCount || undefined,
    format: edition.format || undefined,
    language: edition.language || undefined,
    primary_provider: provider,
    cover_urls: edition.coverImageURL
      ? { large: edition.coverImageURL, medium: edition.coverImageURL, small: edition.coverImageURL }
      : undefined,
    cover_source: edition.coverImageURL ? provider : undefined,
    openlibrary_edition_id: edition.openLibraryEditionID || edition.openLibraryID || undefined,
    google_books_volume_ids: edition.googleBooksVolumeID ? [edition.googleBooksVolumeID] : (edition.googleBooksVolumeIDs?.length ? edition.googleBooksVolumeIDs : undefined),
    alternate_isbns: edition.isbns?.filter((isbn): isbn is string => !!isbn && isbn !== primaryIsbn),
  };
}

/**
 * Map WorkDTO to Alexandria API payload
 */
function mapWorkToAlexandria(work: WorkDTO, provider: string): AlexandriaWorkPayload {
  return {
    work_key: work.openLibraryWorkID || work.openLibraryID || `/works/${work.googleBooksVolumeID || "unknown"}`,
    title: work.title,
    description: work.description || undefined,
    original_language: work.originalLanguage || undefined,
    first_publication_year: work.firstPublicationYear || undefined,
    subject_tags: work.subjectTags?.length ? work.subjectTags : undefined,
    primary_provider: provider,
    cover_urls: work.coverImageURL
      ? { large: work.coverImageURL, medium: work.coverImageURL, small: work.coverImageURL }
      : undefined,
    cover_source: work.coverImageURL ? provider : undefined,
    openlibrary_work_id: work.openLibraryWorkID || work.openLibraryID || undefined,
    google_books_volume_ids: work.googleBooksVolumeID ? [work.googleBooksVolumeID] : (work.googleBooksVolumeIDs?.length ? work.googleBooksVolumeIDs : undefined),
  };
}

/**
 * Map AuthorDTO to Alexandria API payload
 */
function mapAuthorToAlexandria(author: AuthorDTO, provider: string): AlexandriaAuthorPayload {
  return {
    author_key: author.openLibraryID || `/authors/${author.googleBooksID || "unknown"}`,
    name: author.name,
    nationality: author.nationality || undefined,
    birth_year: author.birthYear || undefined,
    death_year: author.deathYear || undefined,
    primary_provider: provider,
    openlibrary_author_id: author.openLibraryID || undefined,
  };
}

/**
 * POST data to Alexandria API endpoint
 */
async function postToAlexandria(
  endpoint: string,
  payload: AlexandriaEditionPayload | AlexandriaWorkPayload | AlexandriaAuthorPayload,
  env: ExternalAPIEnv,
): Promise<void> {
  const url = `${ALEXANDRIA_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": ALEXANDRIA_USER_AGENT,
  };

  // Add Cloudflare Access service token headers if available
  const clientId = env.ALEXANDRIA_CLIENT_ID;
  const clientSecret = env.ALEXANDRIA_CLIENT_SECRET;

  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json() as { data?: unknown };
      console.log(`✅ Alexandria ${endpoint}: ${JSON.stringify(data.data || data)}`);
    } else {
      const errorText = await response.text();
      console.error(`❌ Alexandria ${endpoint} failed: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error(`❌ Alexandria ${endpoint} error:`, error);
  }
}
