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
import type { AuthorDTO, EditionDTO, WorkDTO } from '../types/canonical'
import type { BookRecord } from '../types/database'
import { processBookCover, queueCoverProcessing } from './alexandria-cover-service'
import { enrichMultipleBooks } from './enrichment'

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
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  const bookRepo = new BookRepository(env)

  // 1. Try repository (smart router: KV → D1 based on D1_READ_PERCENTAGE)
  const cachedBook = await bookRepo.findByISBN(isbn)

  if (cachedBook) {
    console.log(`[BookService] ✅ Repository hit for ISBN ${isbn}`)

    // Return cached canonical metadata
    const canonicalData = cachedBook.canonicalMetadata

    // Only return cached data if it has actual works
    // Otherwise, fall through to enrichment (book may have been cached before enrichment was added)
    if (canonicalData?.works && canonicalData.works.length > 0) {
      return {
        works: canonicalData.works,
        editions: canonicalData.editions || [],
        authors: canonicalData.authors || [],
        cached: true,
        source: 'd1', // Note: Could be from KV or D1 depending on routing
      }
    }

    console.log(`[BookService] D1 cache has no works metadata, falling through to enrichment`)
  }

  // 2. Repository miss: Fetch from external APIs
  console.log(`[BookService] Repository miss for ISBN ${isbn}, fetching from external APIs`)

  const externalResult = await enrichMultipleBooks({ isbn }, env, { maxResults: 1 }, ctx)

  // 3. Save to repository (dual-write if ENABLE_D1_WRITES=true)
  if (externalResult.works && externalResult.works.length > 0) {
    try {
      const work = externalResult.works[0]
      const edition = externalResult.editions?.[0]

      // Process cover via Alexandria if we have a work key and cover URL
      let coverURLs = {
        small: work.coverImageURL || edition?.coverImageURL || null,
        medium: work.coverImageURL || edition?.coverImageURL || null,
        large: work.coverImageURL || edition?.coverImageURL || null,
      }

      const providerCoverURL = work.coverImageURL || edition?.coverImageURL
      const workKey = work.openLibraryWorkID || work.openLibraryID
      if (workKey && providerCoverURL) {
        try {
          // Try immediate processing with short timeout (1 retry for fast fail)
          const alexandriaResult = await processBookCover(
            {
              work_key: workKey,
              provider_url: providerCoverURL,
              isbn: isbn,
            },
            env as any,
            1, // Only 1 retry (fast fail for immediate processing)
          )

          if (alexandriaResult.success) {
            coverURLs = {
              small: alexandriaResult.urls.small,
              medium: alexandriaResult.urls.medium,
              large: alexandriaResult.urls.large,
            }

            // 🏈 THE TOUCHDOWN PLAY - Update externalResult with Alexandria URLs!
            // This ensures the client receives Alexandria-hosted cover URLs instead of provider URLs
            if (externalResult.works[0]) {
              externalResult.works[0].coverImageURL = alexandriaResult.urls.large
            }
            if (externalResult.editions?.[0]) {
              externalResult.editions[0].coverImageURL = alexandriaResult.urls.large
            }

            console.log(`[BookService] ✅ Cover processed immediately via Alexandria for ${isbn}`)
          } else {
            // Queue for background processing on failure
            console.warn(
              `[BookService] ⚠️ Immediate cover processing failed, queuing for background processing`,
            )
            await queueCoverProcessing(
              {
                work_key: workKey,
                provider_url: providerCoverURL,
                isbn: isbn,
              },
              env as any,
              'normal', // Normal priority for background processing
            )
            console.log(`[BookService] 📬 Cover queued for background processing: ${isbn}`)
          }
        } catch (coverError) {
          console.error(`[BookService] Error processing cover via Alexandria:`, coverError)
          // Queue for background processing as fallback
          try {
            await queueCoverProcessing(
              {
                work_key: workKey,
                provider_url: providerCoverURL,
                isbn: isbn,
              },
              env as any,
              'normal',
            )
            console.log(`[BookService] 📬 Cover queued after error: ${isbn}`)
          } catch (queueError) {
            console.error(`[BookService] Failed to queue cover:`, queueError)
          }
          // Fall back to provider URLs (already set in coverURLs)
        }
      }

      const bookRecord: BookRecord = {
        isbn: isbn,
        title: work.title || 'Unknown',
        subtitle: work.subtitle || null,
        description: work.description || null,
        publisher: edition?.publisher || null,
        publicationDate: edition?.publicationDate || null,
        language: edition?.language || 'en',
        pageCount: edition?.pageCount || null,
        coverSmallUrl: coverURLs.small,
        coverMediumUrl: coverURLs.medium,
        coverLargeUrl: coverURLs.large,
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
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  // Title searches go directly to external APIs (no cache)
  // Reason: Multiple results, cache key would be complex
  console.log(`[BookService] Title search for "${title}" (no cache, direct external API call)`)

  const result = await enrichMultipleBooks({ title, author }, env, options, ctx)

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
  ctx?: ExecutionContext,
): Promise<Map<string, EnrichmentResult>> {
  const bookRepo = new BookRepository(env)
  const results = new Map<string, EnrichmentResult>()

  // Step 1: Check repository for all ISBNs (parallel)
  const cacheResults = await Promise.allSettled(isbns.map((isbn) => bookRepo.findByISBN(isbn)))

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
    `[BookService] Batch enrichment: ${results.size} cached, ${missingISBNs.length} to fetch`,
  )

  // Step 2: Fetch missing ISBNs from external APIs (parallel)
  const externalResults = await Promise.allSettled(
    missingISBNs.map((isbn) => enrichMultipleBooks({ isbn }, env, { maxResults: 1 }, ctx)),
  )

  // Step 3: Process covers in parallel with concurrency control
  // Prepare cover processing tasks for books with valid work keys
  const COVER_BATCH_SIZE = 10 // Process 10 covers at a time to avoid overwhelming Alexandria
  const coverProcessingTasks: Array<{
    isbn: string
    workKey: string
    providerCoverURL: string
    resultIndex: number
  }> = []

  // Collect all cover processing tasks
  for (let i = 0; i < missingISBNs.length; i++) {
    const isbn = missingISBNs[i]
    const result = externalResults[i]

    if (result.status === 'fulfilled' && result.value.works.length > 0) {
      const work = result.value.works[0]
      const edition = result.value.editions?.[0]
      const providerCoverURL = work.coverImageURL || edition?.coverImageURL
      const workKey = work.openLibraryWorkID || work.openLibraryID

      if (workKey && providerCoverURL) {
        coverProcessingTasks.push({
          isbn,
          workKey,
          providerCoverURL,
          resultIndex: i,
        })
      }
    }
  }

  console.log(
    `[BookService] Processing ${coverProcessingTasks.length} covers in batches of ${COVER_BATCH_SIZE}`,
  )

  // Process covers in batches for controlled parallelism
  const coverResultsMap = new Map<string, any>()
  for (let i = 0; i < coverProcessingTasks.length; i += COVER_BATCH_SIZE) {
    const batch = coverProcessingTasks.slice(i, i + COVER_BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map((task) =>
        processBookCover(
          {
            work_key: task.workKey,
            provider_url: task.providerCoverURL,
            isbn: task.isbn,
          },
          env as any,
        ),
      ),
    )

    // Store results in map for later use
    batch.forEach((task, index) => {
      const result = batchResults[index]
      if (result.status === 'fulfilled') {
        coverResultsMap.set(task.isbn, result.value)
      }
    })
  }

  // Step 4: Save to repository and add to results
  for (let i = 0; i < missingISBNs.length; i++) {
    const isbn = missingISBNs[i]
    const result = externalResults[i]

    if (result.status === 'fulfilled' && result.value.works.length > 0) {
      const externalResult = result.value

      // Save to repository
      try {
        const work = externalResult.works[0]
        const edition = externalResult.editions?.[0]

        // Use pre-processed cover URLs from parallel batch
        let coverURLs = {
          small: work.coverImageURL || edition?.coverImageURL || null,
          medium: work.coverImageURL || edition?.coverImageURL || null,
          large: work.coverImageURL || edition?.coverImageURL || null,
        }

        const alexandriaResult = coverResultsMap.get(isbn)
        if (alexandriaResult?.success) {
          coverURLs = {
            small: alexandriaResult.urls.small,
            medium: alexandriaResult.urls.medium,
            large: alexandriaResult.urls.large,
          }

          // 🏈 THE TOUCHDOWN PLAY #2 - Update externalResult with Alexandria URLs!
          // Same fix as findBookByISBN - ensures batch operations also return Alexandria URLs
          if (externalResult.works[0]) {
            externalResult.works[0].coverImageURL = alexandriaResult.urls.large
          }
          if (externalResult.editions?.[0]) {
            externalResult.editions[0].coverImageURL = alexandriaResult.urls.large
          }
        }

        const bookRecord: BookRecord = {
          isbn: isbn,
          title: work.title || 'Unknown',
          subtitle: work.subtitle || null,
          description: work.description || null,
          publisher: edition?.publisher || null,
          publicationDate: edition?.publicationDate || null,
          language: edition?.language || 'en',
          pageCount: edition?.pageCount || null,
          coverSmallUrl: coverURLs.small,
          coverMediumUrl: coverURLs.medium,
          coverLargeUrl: coverURLs.large,
          canonicalMetadata: {
            works: externalResult.works,
            editions: externalResult.editions,
            authors: externalResult.authors,
          },
          providerMetadata: null,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
        }

        await bookRepo.save(bookRecord)
      } catch (error) {
        console.error(`[BookService] Failed to save ${isbn} to repository:`, error)
      }

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
  limit = 50,
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
    new Map(allAuthors.map((author) => [author.name, author])).values(),
  )

  return {
    works: allWorks,
    editions: allEditions,
    authors: uniqueAuthors,
    cached: true,
    source: 'd1',
  }
}
