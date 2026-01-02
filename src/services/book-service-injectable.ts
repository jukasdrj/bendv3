/**
 * Injectable Book Service - Dependency Injection Implementation
 *
 * This is a refactored version of book-service.ts that uses dependency injection
 * for better testability and loose coupling.
 *
 * Key improvements:
 * - Services injected via constructor rather than direct imports
 * - All dependencies are interfaces, making mocking easier
 * - Clean separation of concerns
 * - Maintains existing API for backward compatibility
 */

import type { AuthorDTO, EditionDTO, WorkDTO } from '../types/canonical'
import type { BookRecord } from '../types/database'
import type { Env } from '../types/env'
import type {
  IBookRepository,
  ICoverService,
  IDeduplicationService,
  IEnrichmentService,
  ServiceContainer,
} from './service-container'

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
 * Injectable Book Service Class
 *
 * Provides the same functionality as the original book service but with
 * injected dependencies for better testability.
 */
export class InjectableBookService {
  private bookRepository: IBookRepository
  private enrichmentService: IEnrichmentService
  private coverService: ICoverService
  private deduplicationService: IDeduplicationService
  private env: Env

  constructor(
    bookRepository: IBookRepository,
    enrichmentService: IEnrichmentService,
    coverService: ICoverService,
    deduplicationService: IDeduplicationService,
    env: Env,
  ) {
    this.bookRepository = bookRepository
    this.enrichmentService = enrichmentService
    this.coverService = coverService
    this.deduplicationService = deduplicationService
    this.env = env
  }

  /**
   * Create from service container
   */
  static fromContainer(container: ServiceContainer): InjectableBookService {
    return new InjectableBookService(
      container.resolve<IBookRepository>(ServiceId.BookRepository),
      container.resolve<IEnrichmentService>(ServiceId.EnrichmentService),
      container.resolve<ICoverService>(ServiceId.CoverService),
      container.resolve<IDeduplicationService>(ServiceId.DeduplicationService),
      container.getEnv(),
    )
  }

  /**
   * Search for a book by ISBN with smart caching and deduplication
   */
  async findBookByISBN(isbn: string, ctx?: ExecutionContext): Promise<EnrichmentResult> {
    return this.deduplicationService.deduplicate(`isbn:${isbn}`, async () => {
      return this.findBookByISBNInternal(isbn, ctx)
    })
  }

  /**
   * Internal implementation of findBookByISBN (deduplicated)
   */
  private async findBookByISBNInternal(
    isbn: string,
    ctx?: ExecutionContext,
  ): Promise<EnrichmentResult> {
    // 1. Try repository (smart router: KV → D1 based on D1_READ_PERCENTAGE)
    const cachedBook = await this.bookRepository.findByISBN(isbn)

    if (cachedBook) {
      console.log(`[BookService] ✅ Repository hit for ISBN ${isbn}`)

      // Return cached canonical metadata
      const canonicalData = cachedBook.canonicalMetadata

      // Only return cached data if it has actual works
      if (canonicalData?.works && canonicalData.works.length > 0) {
        return {
          works: canonicalData.works,
          editions: canonicalData.editions || [],
          authors: canonicalData.authors || [],
          cached: true,
          source: 'd1', // Note: Could be from KV or D1 depending on routing
        }
      }

      console.log(`[BookService] Cache has no works metadata, falling through to enrichment`)
    }

    // 2. Repository miss: Fetch from external APIs
    console.log(`[BookService] Repository miss for ISBN ${isbn}, fetching from external APIs`)

    const externalResult = await this.enrichmentService.enrichMultipleBooks(
      { isbn },
      this.env,
      { maxResults: 1 },
      ctx,
    )

    // 3. Save to repository and process covers
    if (externalResult.works && externalResult.works.length > 0) {
      await this.processAndSaveBook(isbn, externalResult, ctx)
    }

    return {
      works: externalResult.works || [],
      editions: externalResult.editions || [],
      authors: externalResult.authors || [],
      cached: false,
      source: 'external',
    }
  }

  /**
   * Search for books by title with deduplication
   */
  async findBooksByTitle(
    title: string,
    options: SearchOptions = {},
    ctx?: ExecutionContext,
  ): Promise<EnrichmentResult> {
    return this.deduplicationService.deduplicate(`title:${title}`, async () => {
      return this.findBooksByTitleInternal(title, options, ctx)
    })
  }

  /**
   * Internal implementation of findBooksByTitle (deduplicated)
   */
  private async findBooksByTitleInternal(
    title: string,
    options: SearchOptions = {},
    ctx?: ExecutionContext,
  ): Promise<EnrichmentResult> {
    const maxResults = options.maxResults || 20

    // Try repository first
    const cachedBooks = await this.bookRepository.findByTitle(title, { maxResults })

    if (cachedBooks && cachedBooks.length > 0) {
      console.log(
        `[BookService] ✅ Repository hit for title "${title}" (${cachedBooks.length} results)`,
      )

      return this.aggregateBookResults(cachedBooks, true)
    }

    // Repository miss: Fetch from external APIs
    console.log(`[BookService] Repository miss for title "${title}", fetching from external APIs`)

    const externalResult = await this.enrichmentService.enrichMultipleBooks(
      { title },
      this.env,
      { maxResults },
      ctx,
    )

    // Save all found books to repository
    if (externalResult.works && externalResult.works.length > 0) {
      await this.batchProcessAndSave(externalResult, ctx)
    }

    return {
      works: externalResult.works || [],
      editions: externalResult.editions || [],
      authors: externalResult.authors || [],
      cached: false,
      source: 'external',
    }
  }

  /**
   * Search for books by author with deduplication
   */
  async findBooksByAuthor(
    author: string,
    options: SearchOptions = {},
    ctx?: ExecutionContext,
  ): Promise<EnrichmentResult> {
    return this.deduplicationService.deduplicate(`author:${author}`, async () => {
      return this.findBooksByAuthorInternal(author, options, ctx)
    })
  }

  /**
   * Internal implementation of findBooksByAuthor (deduplicated)
   */
  private async findBooksByAuthorInternal(
    author: string,
    options: SearchOptions = {},
    ctx?: ExecutionContext,
  ): Promise<EnrichmentResult> {
    const maxResults = options.maxResults || 20

    // Try repository first
    const cachedBooks = await this.bookRepository.findByAuthor(author, { maxResults })

    if (cachedBooks && cachedBooks.length > 0) {
      console.log(
        `[BookService] ✅ Repository hit for author "${author}" (${cachedBooks.length} results)`,
      )

      return this.aggregateBookResults(cachedBooks, true)
    }

    // Repository miss: Fetch from external APIs
    console.log(`[BookService] Repository miss for author "${author}", fetching from external APIs`)

    const externalResult = await this.enrichmentService.enrichMultipleBooks(
      { author },
      this.env,
      { maxResults },
      ctx,
    )

    // Save all found books to repository
    if (externalResult.works && externalResult.works.length > 0) {
      await this.batchProcessAndSave(externalResult, ctx)
    }

    return {
      works: externalResult.works || [],
      editions: externalResult.editions || [],
      authors: externalResult.authors || [],
      cached: false,
      source: 'external',
    }
  }

  /**
   * Process cover and save a single book to repository
   */
  private async processAndSaveBook(
    isbn: string,
    result: any,
    _ctx?: ExecutionContext,
  ): Promise<void> {
    try {
      const work = result.works[0]
      const edition = result.editions?.[0]

      // Process cover via Alexandria if we have the required data
      const providerCoverURL = work.coverImageURL || edition?.coverImageURL
      const workKey = work.openLibraryWorkID || work.openLibraryID

      if (workKey && providerCoverURL) {
        try {
          // Try immediate processing with short timeout
          const alexandriaResult = await this.coverService.processBookCover(
            {
              work_key: workKey,
              provider_url: providerCoverURL,
              isbn: isbn,
            },
            this.env,
            1, // Only 1 retry (fast fail for immediate processing)
          )

          if (alexandriaResult.success) {
            // Update result with Alexandria URLs
            if (result.works[0]) {
              result.works[0].coverImageURL = alexandriaResult.urls.large
            }
            if (result.editions?.[0]) {
              result.editions[0].coverImageURL = alexandriaResult.urls.large
            }

            console.log(`[BookService] ✅ Cover processed immediately via Alexandria for ${isbn}`)
          } else {
            // Queue for background processing on failure
            console.warn(
              `[BookService] ⚠️ Immediate cover processing failed, queuing for background processing`,
            )
            await this.coverService.queueCoverProcessing(
              {
                work_key: workKey,
                provider_url: providerCoverURL,
                isbn: isbn,
              },
              this.env,
            )
          }
        } catch (error) {
          console.error(`[BookService] Cover processing error for ${isbn}:`, error)
          // Continue without cover processing
        }
      }

      // Save to repository
      const bookRecord: BookRecord = {
        isbn: isbn,
        canonicalMetadata: {
          works: result.works,
          editions: result.editions || [],
          authors: result.authors || [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await this.bookRepository.save(bookRecord)
      console.log(`[BookService] ✅ Saved book ${isbn} to repository`)
    } catch (error) {
      console.error(`[BookService] Error saving book ${isbn}:`, error)
      // Don't throw - we still want to return the result to the user
    }
  }

  /**
   * Process and save multiple books with parallel cover processing
   */
  private async batchProcessAndSave(result: any, ctx?: ExecutionContext): Promise<void> {
    const books = result.works || []
    const promises = books.map((work: any, index: number) => {
      const edition = result.editions?.[index]
      const isbn = edition?.isbn13 || edition?.isbn10 || `work-${work.id || index}`

      return this.processAndSaveBook(
        isbn,
        {
          works: [work],
          editions: edition ? [edition] : [],
          authors:
            result.authors?.filter((author: any) => work.authorIds?.includes(author.id)) || [],
        },
        ctx,
      )
    })

    await Promise.allSettled(promises)
  }

  /**
   * Aggregate cached book results into the standard format
   */
  private aggregateBookResults(books: BookRecord[], cached: boolean): EnrichmentResult {
    const allWorks: WorkDTO[] = []
    const allEditions: EditionDTO[] = []
    const allAuthors: AuthorDTO[] = []

    for (const book of books) {
      if (book.canonicalMetadata) {
        allWorks.push(...(book.canonicalMetadata.works || []))
        allEditions.push(...(book.canonicalMetadata.editions || []))
        allAuthors.push(...(book.canonicalMetadata.authors || []))
      }
    }

    return {
      works: allWorks,
      editions: allEditions,
      authors: allAuthors,
      cached,
      source: 'd1',
    }
  }
}

// ========================================================================================
// BACKWARD COMPATIBILITY WRAPPER FUNCTIONS
// ========================================================================================

/**
 * Legacy function wrappers for backward compatibility
 * These maintain the existing API while using the new injectable service internally
 */

let defaultContainer: ServiceContainer | null = null

function getDefaultContainer(env: any): ServiceContainer {
  if (!defaultContainer) {
    const { createServiceContainer } = require('./service-container')
    defaultContainer = createServiceContainer(env)
  }
  return defaultContainer
}

/**
 * Search for a book by ISBN (backward compatible)
 */
export async function findBookByISBN(
  isbn: string,
  env: any,
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  const container = getDefaultContainer(env)
  const bookService = InjectableBookService.fromContainer(container)
  return bookService.findBookByISBN(isbn, ctx)
}

/**
 * Search for books by title (backward compatible)
 */
export async function findBooksByTitle(
  title: string,
  env: any,
  options: SearchOptions = {},
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  const container = getDefaultContainer(env)
  const bookService = InjectableBookService.fromContainer(container)
  return bookService.findBooksByTitle(title, options, ctx)
}

/**
 * Search for books by author (backward compatible)
 */
export async function findBooksByAuthor(
  author: string,
  env: any,
  options: SearchOptions = {},
  ctx?: ExecutionContext,
): Promise<EnrichmentResult> {
  const container = getDefaultContainer(env)
  const bookService = InjectableBookService.fromContainer(container)
  return bookService.findBooksByAuthor(author, options, ctx)
}
