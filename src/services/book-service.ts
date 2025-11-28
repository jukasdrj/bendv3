/**
 * Book Service - High-level book data access layer (Sprint 2 Day 4)
 *
 * Integrates BookRepository (KV/D1 cache) with enrichment service (external APIs).
 * This service is the single entry point for all book data access.
 *
 * Flow:
 * 1. Check BookRepository (KV → D1 based on feature flags)
 * 2. On miss: Fetch from external APIs (enrichMultipleBooks)
 * 3. Save to BookRepository (dual-write if ENABLE_D1_WRITES=true)
 * 4. Return canonical book data
 *
 * Used by:
 * - /v1/search/isbn (ISBN search)
 * - /v1/search/title (title search - future)
 * - /api/enrichment/batch (batch enrichment - future)
 */

import { BookRepository } from '../repositories/book-repository'
import { enrichMultipleBooks } from './enrichment'
import type { BookRecord } from '../types/database'
import type { WorkDTO, EditionDTO, AuthorDTO } from '../types/canonical'

interface BookSearchQuery {
  title?: string
  author?: string
  isbn?: string
}

interface SearchOptions {
  maxResults?: number
}

interface EnrichmentResult {
  works: WorkDTO[]
  editions: EditionDTO[]
  authors: AuthorDTO[]
  cached?: boolean
  source?: 'kv' | 'd1' | 'external'
}

/**
 * Search for a book by ISBN with smart caching
 *
 * @param isbn - Normalized ISBN (10 or 13 digits)
 * @param env - Cloudflare environment bindings
 * @param ctx - Execution context for caching
 * @returns EnrichmentResult with works, editions, authors
 */
export async function findBookByISBN(
  isbn: string,
  env: any,
  ctx?: ExecutionContext
): Promise<EnrichmentResult> {
  const bookRepo = new BookRepository(env)

  // 1. Try repository (smart router: KV → D1 based on D1_READ_PERCENTAGE)
  const cachedBook = await bookRepo.findByISBN(isbn)

  if (cachedBook) {
    console.log(`[BookService] ✅ Repository hit for ISBN ${isbn}`)

    // Return cached canonical metadata
    const canonicalData = cachedBook.canonicalMetadata

    return {
      works: canonicalData.works || [],
      editions: canonicalData.editions || [],
      authors: canonicalData.authors || [],
      cached: true,
      source: 'd1', // Note: Could be from KV or D1 depending on routing
    }
  }

  // 2. Repository miss: Fetch from external APIs
  console.log(`[BookService] Repository miss for ISBN ${isbn}, fetching from external APIs`)

  const externalResult = await enrichMultipleBooks(
    { isbn },
    env,
    { maxResults: 1 },
    ctx
  )

  // 3. Save to repository (dual-write if ENABLE_D1_WRITES=true)
  if (externalResult.works && externalResult.works.length > 0) {
    try {
      const work = externalResult.works[0]
      const edition = externalResult.editions?.[0]

      const bookRecord: BookRecord = {
        isbn: isbn,
        title: work.title || 'Unknown',
        subtitle: work.subtitle || null,
        description: work.description || null,
        publisher: edition?.publisher || null,
        publicationDate: edition?.publicationDate || null,
        language: edition?.language || 'en',
        pageCount: edition?.pageCount || null,
        coverSmallUrl: work.coverImageURL || edition?.coverImageURL || null,
        coverMediumUrl: work.coverImageURL || edition?.coverImageURL || null,
        coverLargeUrl: work.coverImageURL || edition?.coverImageURL || null,
        canonicalMetadata: {
          works: externalResult.works,
          editions: externalResult.editions,
          authors: externalResult.authors,
        },
        providerMetadata: null, // Could store raw provider responses here
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      }

      await bookRepo.save(bookRecord)
      console.log(`[BookService] ✅ Saved to repository: ${isbn}`)
    } catch (error) {
      console.error(`[BookService] Failed to save to repository:`, error)
      // Don't fail the request - eventual consistency is OK
    }
  }

  return {
    ...externalResult,
    cached: false,
    source: 'external',
  }
}

/**
 * Search for books by title with smart caching
 *
 * Note: Title searches return multiple results, so caching strategy differs from ISBN.
 * For now, we skip repository and go directly to external APIs.
 * Future: Cache individual books found by title search.
 *
 * @param title - Book title to search
 * @param author - Optional author name
 * @param env - Cloudflare environment bindings
 * @param options - Search options (maxResults)
 * @param ctx - Execution context for caching
 * @returns EnrichmentResult with works, editions, authors
 */
export async function findBooksByTitle(
  title: string,
  author: string | undefined,
  env: any,
  options: SearchOptions = { maxResults: 20 },
  ctx?: ExecutionContext
): Promise<EnrichmentResult> {
  // Title searches go directly to external APIs (no cache)
  // Reason: Multiple results, cache key would be complex
  console.log(`[BookService] Title search for "${title}" (no cache, direct external API call)`)

  const result = await enrichMultipleBooks(
    { title, author },
    env,
    options,
    ctx
  )

  // Future enhancement: Cache individual books found in title search results
  // This would populate the repository for future ISBN lookups

  return {
    ...result,
    cached: false,
    source: 'external',
  }
}

/**
 * Batch enrichment with repository integration
 *
 * For batch operations (CSV processing, bookshelf scanning), check repository first,
 * then enrich missing books from external APIs.
 *
 * @param isbns - Array of ISBNs to enrich
 * @param env - Cloudflare environment bindings
 * @param ctx - Execution context for caching
 * @returns Map of ISBN → EnrichmentResult
 */
export async function batchEnrichBooks(
  isbns: string[],
  env: any,
  ctx?: ExecutionContext
): Promise<Map<string, EnrichmentResult>> {
  const bookRepo = new BookRepository(env)
  const results = new Map<string, EnrichmentResult>()

  // Step 1: Check repository for all ISBNs (parallel)
  const cacheResults = await Promise.allSettled(
    isbns.map((isbn) => bookRepo.findByISBN(isbn))
  )

  const missingISBNs: string[] = []

  cacheResults.forEach((result, index) => {
    const isbn = isbns[index]

    if (result.status === 'fulfilled' && result.value) {
      // Cache hit
      const cachedBook = result.value
      results.set(isbn, {
        works: cachedBook.canonicalMetadata.works || [],
        editions: cachedBook.canonicalMetadata.editions || [],
        authors: cachedBook.canonicalMetadata.authors || [],
        cached: true,
        source: 'd1',
      })
    } else {
      // Cache miss
      missingISBNs.push(isbn)
    }
  })

  console.log(
    `[BookService] Batch enrichment: ${results.size} cached, ${missingISBNs.length} to fetch`
  )

  // Step 2: Fetch missing ISBNs from external APIs (parallel)
  const externalResults = await Promise.allSettled(
    missingISBNs.map((isbn) =>
      enrichMultipleBooks({ isbn }, env, { maxResults: 1 }, ctx)
    )
  )

  // Step 3: Prepare book records for saving and add to results
  const booksToSave: { isbn: string; record: BookRecord }[] = []

  for (let i = 0; i < missingISBNs.length; i++) {
    const isbn = missingISBNs[i]
    const result = externalResults[i]

    if (result.status === 'fulfilled' && result.value.works.length > 0) {
      const externalResult = result.value
      const work = externalResult.works[0]
      const edition = externalResult.editions?.[0]

      const bookRecord: BookRecord = {
        isbn: isbn,
        title: work.title || 'Unknown',
        subtitle: work.subtitle || null,
        description: work.description || null,
        publisher: edition?.publisher || null,
        publicationDate: edition?.publicationDate || null,
        language: edition?.language || 'en',
        pageCount: edition?.pageCount || null,
        coverSmallUrl: work.coverImageURL || edition?.coverImageURL || null,
        coverMediumUrl: work.coverImageURL || edition?.coverImageURL || null,
        coverLargeUrl: work.coverImageURL || edition?.coverImageURL || null,
        canonicalMetadata: {
          works: externalResult.works,
          editions: externalResult.editions,
          authors: externalResult.authors,
        },
        providerMetadata: null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      }

      // Queue for parallel saving
      booksToSave.push({ isbn, record: bookRecord })

      results.set(isbn, {
        ...externalResult,
        cached: false,
        source: 'external',
      })
    } else {
      // External API failed or no results
      results.set(isbn, {
        works: [],
        editions: [],
        authors: [],
        cached: false,
        source: 'external',
      })
    }
  }

  // Step 4: Save all book records in parallel with concurrency limit
  // Prevents overwhelming the database with too many simultaneous writes
  const BATCH_SIZE = 10 // Maximum concurrent saves
  if (booksToSave.length > 0) {
    let savedCount = 0
    let failedCount = 0

    // Process in batches to limit concurrency
    for (let i = 0; i < booksToSave.length; i += BATCH_SIZE) {
      const batch = booksToSave.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(({ record }) => bookRepo.save(record))
      )

      // Log failures for each batch
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'rejected') {
          const actualIndex = i + batchIndex
          console.error(`[BookService] Failed to save ${booksToSave[actualIndex].isbn} to repository:`, result.reason)
          failedCount++
        } else {
          savedCount++
        }
      })
    }

    console.log(`[BookService] Batch save complete: ${savedCount} saved, ${failedCount} failed`)
  }

  return results
}

/**
 * Complex query: Find all books by author (D1-only)
 *
 * This query requires D1 (relational database with author normalization).
 * Only works when D1_READ_PERCENTAGE > 0.
 *
 * @param authorName - Author name (fuzzy match)
 * @param limit - Max results (default 50)
 * @param env - Cloudflare environment bindings
 * @returns Array of books by author
 */
export async function findBooksByAuthor(
  authorName: string,
  env: any,
  limit = 50
): Promise<EnrichmentResult> {
  const bookRepo = new BookRepository(env)

  const books = await bookRepo.findByAuthor(authorName, limit)

  if (books.length === 0) {
    console.log(`[BookService] No books found for author "${authorName}" (D1 query)`)
    return {
      works: [],
      editions: [],
      authors: [],
      cached: false,
      source: 'd1',
    }
  }

  console.log(`[BookService] Found ${books.length} books for author "${authorName}"`)

  // Extract works, editions, authors from canonicalMetadata
  const allWorks: WorkDTO[] = []
  const allEditions: EditionDTO[] = []
  const allAuthors: AuthorDTO[] = []

  books.forEach((book) => {
    const metadata = book.canonicalMetadata
    if (metadata.works) allWorks.push(...metadata.works)
    if (metadata.editions) allEditions.push(...metadata.editions)
    if (metadata.authors) allAuthors.push(...metadata.authors)
  })

  // Deduplicate authors by name
  const uniqueAuthors = Array.from(
    new Map(allAuthors.map((author) => [author.name, author])).values()
  )

  return {
    works: allWorks,
    editions: allEditions,
    authors: uniqueAuthors,
    cached: true,
    source: 'd1',
  }
}
