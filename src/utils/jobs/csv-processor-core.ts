/**
 * CSV Processor Core Utility
 *
 * Shared CSV processing logic extracted from:
 * - src/handlers/csv-import.ts (processCSVImportCore)
 * - src/services/csv-processor.ts (processCSVImport)
 *
 * This eliminates code duplication and provides a single source of truth
 * for CSV validation, Gemini parsing, caching, and result storage.
 *
 * Related: Issue #180 - Eliminate code duplication in CSV processing
 */

import { buildCSVParserPrompt } from '../../prompts/csv-parser-prompt'
import {
  type GeminiParseResult,
  type GeminiValidationError,
  parseCSVWithGemini as parseCSVWithGeminiImpl,
} from '../../providers/gemini-csv-provider'
import type { Env } from '../../types/env'
import type { CSVParsedBook } from '../../types/gemini-schemas'
import { generateCSVCacheKey } from '../cache/cache-keys'
import { processWithLimit } from '../concurrency/concurrency-limiter'
import { validateCSV as validateCSVImpl } from '../validation/csv-validator'
import type { ProgressReporter } from './progress-reporter'

/**
 * Parsed book from Gemini CSV parser
 * @deprecated Use CSVParsedBook from gemini-schemas instead
 */
export type ParsedBook = CSVParsedBook

/**
 * Validated book in ParsedBookDTO structure
 */
export interface ValidatedBook {
  title: string
  author: string
  isbn?: string
}

/**
 * Canonical book schema for API responses
 */
export interface CanonicalBook {
  isbn: string
  title: string
  authors: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  language?: string
  coverUrl?: string
}

/**
 * CSV validation result
 */
export interface CSVValidationResult {
  valid: boolean
  error?: string
}

/**
 * Job processing context
 */
export interface ProcessingContext {
  parsedBooks: ParsedBook[]
  validatedBooks: ValidatedBook[]
  startTime: number
  resourceId: string
  jobId: string
}

/**
 * Completion payload
 */
export interface CompletionPayload {
  summary?: {
    totalProcessed: number
    successCount: number
    failureCount: number
    duration: number
    resourceId: string
  }
  booksCount?: number
  resultsUrl?: string
  successRate?: string
  [key: string]: unknown
}

/**
 * API contract results format
 */
export interface APIContractResults {
  booksCreated: number
  booksUpdated: number
  duplicatesSkipped: number
  enrichmentSucceeded: number
  enrichmentFailed: number
  errors: unknown[]
  books: CanonicalBook[]
}

/**
 * CSV processor options
 */
export interface ProcessCSVCoreOptions {
  /** TTL for KV storage in seconds (default: 3600 = 1 hour) */
  resultsTTL?: number
  /** KV key prefix (default: "job-results") */
  resultsKeyPrefix?: string
  /** Custom completion payload builder */
  buildCompletionPayload?: (context: ProcessingContext) => CompletionPayload
  /** Dependency injection for testing */
  deps?: ProcessorDependencies
}

/**
 * Dependencies for CSV processing (for testing/mocking)
 */
export interface ProcessorDependencies {
  validateCSV: (csvText: string) => CSVValidationResult
  parseCSVWithGemini: (
    csvText: string,
    prompt: string,
    apiKey: string,
  ) => Promise<GeminiParseResult>
}

/**
 * Default dependencies for CSV processing
 * Exported for testing with dependency injection (Issue #217)
 */
export const defaultDeps: ProcessorDependencies = {
  validateCSV: validateCSVImpl,
  parseCSVWithGemini: parseCSVWithGeminiImpl,
}

/**
 * Core CSV processing function
 *
 * Handles the complete CSV processing pipeline:
 * 1. Wait for WebSocket ready signal
 * 2. Validate CSV structure
 * 3. Parse with Gemini (with caching)
 * 4. Validate and shape results
 * 5. Store results in KV
 * 6. Report completion
 *
 * @param csvText - Raw CSV file content
 * @param jobId - Unique job identifier
 * @param progressReporter - Interface for reporting progress
 * @param env - Worker environment bindings (CACHE, GEMINI_API_KEY)
 * @param options - Configuration options
 */
export async function processCSVCore(
  csvText: string,
  jobId: string,
  progressReporter: ProgressReporter,
  env: Env,
  options: ProcessCSVCoreOptions = {},
): Promise<void> {
  const {
    resultsTTL = 3600, // Default: 1 hour
    resultsKeyPrefix = 'job-results', // IMPORTANT: Must match retrieval endpoint key (csv-results for /v1/csv/results, scan-results for /v1/scan/results)
    buildCompletionPayload = buildDefaultCompletionPayload,
    deps = defaultDeps, // Dependency injection for testing (Issue #217)
  } = options

  const startTime = Date.now()
  const processingErrors: GeminiValidationError[] = []

  try {
    // Wait for client to establish WebSocket and send ready signal
    // Issue #178: Increased timeout to 15 seconds to handle slow network connections
    console.log(`[CSV Processor Core] Waiting for WebSocket ready signal for job ${jobId}`)
    const readyResult = await progressReporter.waitForReady(15000) // 15 second timeout

    if (readyResult.timedOut || readyResult.disconnected) {
      const reason = readyResult.timedOut ? 'timeout' : 'WebSocket not connected'
      console.warn(
        `[CSV Processor Core] WebSocket ready ${reason} for job ${jobId}, proceeding anyway (client may miss early updates)`,
      )
    } else {
      const elapsedMs = Date.now() - startTime
      console.log(`[CSV Processor Core] ✅ WebSocket ready for job ${jobId} after ${elapsedMs}ms`)
    }

    // Stage 0: Validation (0-5%)
    await progressReporter.updateProgress('csv_import', {
      progress: 0.02,
      status: 'Validating CSV file...',
      processedCount: 0,
    })

    const validation = deps.validateCSV(csvText)
    if (!validation.valid) {
      throw new Error(`Invalid CSV: ${validation.error}`)
    }

    // Stage 1: Gemini Parsing (5-50%)
    await progressReporter.updateProgress('csv_import', {
      progress: 0.05,
      status: 'Uploading CSV to Gemini...',
      processedCount: 0,
    })

    const cacheKey = await generateCSVCacheKey(csvText)
    let parsedBooks = await env.CACHE.get<ParsedBook[]>(cacheKey, 'json')

    // Issue #101: Cache hit telemetry for monitoring effectiveness
    const cacheHit = !!parsedBooks
    console.log(
      JSON.stringify({
        type: 'CSV_CACHE_TELEMETRY',
        hit: cacheHit,
        cacheKey: `${cacheKey.substring(0, 24)}...`,
        csvSizeBytes: csvText.length,
        timestamp: new Date().toISOString(),
      }),
    )

    if (!parsedBooks) {
      // NOTE: Gemini 2.0 Flash typically responds in <20 seconds for CSV parsing
      // Paid Plan: 30M CPU milliseconds/month, 5-minute max per invocation
      const prompt = buildCSVParserPrompt()
      const geminiResult = await callGemini(csvText, prompt, env, deps)
      parsedBooks = geminiResult.books

      // Collect Phase 1 errors: Gemini filtering and validation errors
      processingErrors.push(...geminiResult.errors)

      // Schema guarantees valid array structure and title+author on all books
      // Only check for empty response (edge case: CSV with no parseable books)
      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
        throw new Error('No valid books found in CSV')
      }

      // Cache for 7 days
      await env.CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
        expirationTtl: 604800,
      })
    }

    // Stage 2: Report parsed count
    await progressReporter.updateProgress('csv_import', {
      progress: 0.75,
      status: `Gemini parsed ${parsedBooks.length} books with valid title+author`,
      processedCount: parsedBooks.length,
    })

    // Validate and shape parsed books to ParsedBookDTO structure
    // Strip extraneous fields from Gemini output to prevent schema drift
    const validatedBooks: ValidatedBook[] = parsedBooks
      .map((book, index): ValidatedBook | null => {
        const trimmedTitle = book.title ? String(book.title).trim() : ''
        const trimmedAuthor = book.author ? String(book.author).trim() : ''

        if (!trimmedTitle || !trimmedAuthor) {
          processingErrors.push({
            rowNumber: index + 2,
            message: `Missing required field: ${!trimmedTitle ? 'title' : 'author'}`,
            code: !trimmedTitle ? 'missing_title' : 'missing_author',
            field: !trimmedTitle ? 'title' : 'author',
            value: !trimmedTitle ? trimmedTitle : trimmedAuthor,
            title: book.title,
          })
          return null
        }

        return {
          title: trimmedTitle,
          author: trimmedAuthor,
          isbn: book.isbn ? String(book.isbn).trim() : undefined,
        }
      })
      .filter((book): book is ValidatedBook => book !== null)

    // FIX #1: Persist parsed books to D1+KV (Issue #1 - CSV import data loss)
    // This ensures books accumulate in D1 database instead of being lost after iOS enrichment
    await progressReporter.updateProgress('csv_import', {
      progress: 0.8,
      status: `Saving ${parsedBooks.length} books to database...`,
      processedCount: parsedBooks.length,
    })

    const { BookRepository } = await import('../../repositories/book-repository.js')
    const { mapGeminiCSVBookToBookRecord, isValidISBN, deduplicateBooksByISBN } = await import(
      '../transform/book-mappers.js'
    )
    const bookRepo = new BookRepository(env)

    // Identify duplicates within the CSV (same ISBN)
    // 1. Separate books with valid ISBNs from those without
    const booksWithISBN = parsedBooks.filter((book) => isValidISBN(book.isbn))
    const booksWithoutISBN = parsedBooks.filter((book) => !isValidISBN(book.isbn))

    // 2. Deduplicate books with ISBNs
    const uniqueBooksWithISBN = deduplicateBooksByISBN(booksWithISBN)
    const duplicatesSkipped = booksWithISBN.length - uniqueBooksWithISBN.length

    // 3. Combine unique books + books without ISBN for saving
    const booksToSave = [...uniqueBooksWithISBN, ...booksWithoutISBN]

    if (duplicatesSkipped > 0) {
      console.log(`[CSV Processor Core] Skipped ${duplicatesSkipped} duplicate ISBNs in CSV`)
    }

    // FIX: Parallelize D1 saves to avoid CPU timeout (Grok-4 critical issue)
    // 478 books × 50ms sequential = 23.9s (near 30s limit)
    // Parallel saves complete in <5s
    // Filter to books with valid ISBNs for D1 persistence
    // (booksWithoutISBN are excluded here since they can't be persisted)
    // UPDATED: Use concurrency limit to prevent D1 throttling
    const booksWithValidISBN = booksToSave.filter((book) => isValidISBN(book.isbn))

    const saveTasks = booksWithValidISBN.map((geminiBook) => async () => {
      try {
        const bookRecord = mapGeminiCSVBookToBookRecord(geminiBook)
        await bookRepo.save(bookRecord)
        return { status: 'fulfilled' as const, isbn: geminiBook.isbn }
      } catch (error) {
        console.error(`[CSV Processor Core] Failed to save ISBN ${geminiBook.isbn}:`, error)
        throw error // Throw to ensure Promise.allSettled marks as rejected
      }
    })

    const results = await processWithLimit(saveTasks, 20)

    // Capture database save failures
    const saveErrors: GeminiValidationError[] = results
      .map((result, index) => {
        if (result.status === 'rejected') {
          const book = booksWithValidISBN[index]
          const errorMessage =
            result.reason instanceof Error ? result.reason.message : 'Unknown database error'

          return {
            rowNumber: -1, // Row number lost at save stage
            message: `Failed to persist to database: ${errorMessage}`,
            code: 'database_error' as const,
            field: 'isbn' as const,
            value: book.isbn ? String(book.isbn).trim() : undefined,
            title: book.title,
          } as GeminiValidationError
        }
        return null
      })
      .filter((err): err is GeminiValidationError => err !== null)

    processingErrors.push(...saveErrors)

    const savedCount = results.filter((r) => r.status === 'fulfilled').length
    const failedCount = results.filter((r) => r.status === 'rejected').length

    const booksEligibleForSave = booksToSave.filter((book) => isValidISBN(book.isbn)).length
    console.log(
      `[CSV Processor Core] ✅ Persisted ${savedCount}/${booksEligibleForSave} books to D1+KV` +
        (duplicatesSkipped > 0 ? ` (${duplicatesSkipped} duplicates skipped)` : '') +
        (failedCount > 0 ? ` (${failedCount} failed)` : ''),
    )

    // Queue successfully saved ISBNs for Alexandria enrichment (non-blocking)
    // This ensures Alexandria learns from CSV imports without slowing down the import
    if (env.ENRICHMENT_QUEUE) {
      const successfulISBNs: string[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const isbn = (result.value as { status: 'fulfilled'; isbn?: string }).isbn
          if (isbn) {
            successfulISBNs.push(isbn)
          }
        }
      }

      if (successfulISBNs.length > 0) {
        console.log(
          `[CSV Processor Core] 📤 Queueing ${successfulISBNs.length} ISBNs for Alexandria enrichment`,
        )

        // Batch queue sends for efficiency (10 ISBNs per message)
        const batchSize = 10
        const queuePromises: Promise<void>[] = []

        for (let i = 0; i < successfulISBNs.length; i += batchSize) {
          const batch = successfulISBNs.slice(i, i + batchSize)
          for (const isbn of batch) {
            queuePromises.push(
              env.ENRICHMENT_QUEUE.send({
                entity_type: 'edition',
                isbn,
                source: 'csv_import',
                priority: 8, // High priority - user data
                timestamp: new Date().toISOString(),
              }).catch((err: Error) => {
                // Non-blocking: log but don't fail the import
                console.warn(`[CSV Processor Core] ⚠️ Failed to queue ISBN ${isbn}:`, err.message)
              }),
            )
          }
        }

        // Fire and forget - don't await queue sends to avoid blocking CSV completion
        Promise.all(queuePromises).then(() => {
          console.log(
            `[CSV Processor Core] ✅ Queued ${successfulISBNs.length} ISBNs for background enrichment`,
          )
        })
      }
    } else {
      console.log(
        `[CSV Processor Core] ⚠️ ENRICHMENT_QUEUE not configured, skipping Alexandria enrichment`,
      )
    }

    // FIX: Enrich books inline with Alexandria before returning results
    // This ensures iOS client receives books with covers and descriptions
    // Previously: Books returned with coverUrl: undefined, causing iOS to show 0 books
    //
    // TIMEOUT PROTECTION: For very large CSVs (>100 books), skip inline enrichment
    // to avoid Workers CPU timeout. Books will be enriched via background queue instead.
    const INLINE_ENRICHMENT_LIMIT = 100
    const shouldEnrichInline = booksWithValidISBN.length <= INLINE_ENRICHMENT_LIMIT

    if (!shouldEnrichInline) {
      console.log(
        `[CSV Processor Core] ⚠️ Skipping inline enrichment for ${booksWithValidISBN.length} books (exceeds ${INLINE_ENRICHMENT_LIMIT} limit)`,
      )
      console.log(
        `[CSV Processor Core] 📤 Books will be enriched via background queue (already queued above)`,
      )
    }

    await progressReporter.updateProgress('csv_import', {
      progress: 0.85,
      status: shouldEnrichInline
        ? `Enriching ${booksWithValidISBN.length} books with metadata...`
        : `Queued ${booksWithValidISBN.length} books for background enrichment`,
      processedCount: parsedBooks.length,
    })

    const { enrichSingleBook } = await import('../../services/enrichment.js')
    const enrichedBooksMap = new Map<string, CanonicalBook>()
    let enrichmentSucceeded = 0
    let enrichmentFailed = 0

    // Enrich books with valid ISBNs (parallel with concurrency limit)
    // Only enrich inline if under the limit to avoid CPU timeout
    const enrichTasks = booksWithValidISBN.map((book) => async () => {
      if (!book.isbn) return

      try {
        const result = await enrichSingleBook({ isbn: book.isbn }, env)

        if (result && result.success) {
          // Extract cover URL from edition (prioritize large → medium → small → legacy coverImageURL)
          const coverUrl =
            result.edition?.coverUrls?.large ||
            result.edition?.coverUrls?.medium ||
            result.edition?.coverUrls?.small ||
            result.edition?.coverImageURL ||
            undefined

          enrichedBooksMap.set(book.isbn, {
            isbn: result.edition?.isbn || book.isbn,
            title: result.work.title || book.title,
            authors: result.authors.map((a) => a.name),
            publisher: result.edition?.publisher || undefined,
            publishedDate: result.edition?.publicationDate || undefined,
            description: result.work.description || undefined,
            pageCount: result.edition?.pageCount || undefined,
            categories: result.work.subjectTags?.slice(0, 5) || undefined, // Limit to top 5 categories
            language: result.edition?.language || 'en',
            coverUrl, // ✅ Now populated with actual cover URL!
          })
          enrichmentSucceeded++
        } else {
          enrichmentFailed++
        }
      } catch (error) {
        console.warn(`[CSV Processor Core] Enrichment failed for ISBN ${book.isbn}:`, error)
        enrichmentFailed++
      }
    })

    // Process enrichment with concurrency limit (20 parallel requests)
    // Skip if CSV is too large (timeout protection)
    if (shouldEnrichInline) {
      await processWithLimit(enrichTasks, 20)

      await progressReporter.updateProgress('csv_import', {
        progress: 0.95,
        status: `Enriched ${enrichmentSucceeded}/${booksWithValidISBN.length} books`,
        processedCount: parsedBooks.length,
      })

      console.log(
        `[CSV Processor Core] ✅ Enrichment complete: ${enrichmentSucceeded} succeeded, ${enrichmentFailed} failed`,
      )
    } else {
      console.log(
        `[CSV Processor Core] ⏭️ Skipped inline enrichment (CSV too large - ${booksWithValidISBN.length} books)`,
      )
    }

    // Store full results in KV for HTTP retrieval (API Contract format)
    // Transform validatedBooks to canonical BookSchema format
    // BookSchema requires: isbn, title, authors (array), plus optional fields
    // Use booksToSave to avoid returning duplicates in the API response
    const canonicalBooks: CanonicalBook[] = booksToSave
      .filter((book) => book.title && book.author)
      .map((book) => {
        // Use enriched data if available, otherwise fall back to parsed data
        const enrichedBook = book.isbn ? enrichedBooksMap.get(book.isbn) : undefined

        if (enrichedBook) {
          return enrichedBook
        }

        // Fallback: Use parsed data for books without ISBNs or failed enrichment
        // Parse author string into array (comma-separated authors)
        const authorString = String(book.author).trim()
        const authors = authorString
          .split(/,\s*(?:and\s+)?|(?:\s+and\s+)/i) // Split on ", " or " and "
          .map((a) => a.trim())
          .filter((a) => a.length > 0)

        return {
          // Required fields
          isbn: book.isbn ? String(book.isbn).trim() : '',
          title: String(book.title).trim(),
          authors: authors,
          // Optional fields from Gemini parser
          publisher: book.publisher ? String(book.publisher).trim() : undefined,
          publishedDate: book.publicationYear ? `${book.publicationYear}-01-01` : undefined,
          description: book.notes ? String(book.notes).trim() : undefined,
          pageCount: book.pageCount ? Number(book.pageCount) : undefined,
          categories: book.genre ? [String(book.genre).trim()] : undefined,
          language: book.languageCode || 'en',
          coverUrl: undefined, // No cover available for books without enrichment
        }
      })

    // Map GeminiValidationError to JobErrorDetail schema
    const formattedErrors = processingErrors.map((err) => ({
      row: err.rowNumber,
      isbn: err.value,
      error: err.message,
    }))

    const resourceId = `${resultsKeyPrefix}:${jobId}`
    const apiContractResults: APIContractResults = {
      booksCreated: canonicalBooks.length,
      booksUpdated: 0, // CSV import always creates new books
      duplicatesSkipped: duplicatesSkipped,
      enrichmentSucceeded: enrichmentSucceeded, // ✅ FIXED: Now tracks actual enrichment count
      enrichmentFailed: enrichmentFailed, // ✅ FIXED: Now tracks enrichment failures
      errors: formattedErrors, // ✅ FIXED: Populated errors array
      books: canonicalBooks, // Canonical BookSchema format for iOS SwiftData (now with covers!)
    }
    await env.CACHE.put(resourceId, JSON.stringify(apiContractResults), {
      expirationTtl: resultsTTL,
    })

    console.log(
      `[CSV Processor Core] 💾 Stored results in KV: ${resourceId} (${canonicalBooks.length} books, TTL: ${resultsTTL}s)`,
    )

    // Build completion payload (customizable per caller)
    const completionPayload = buildCompletionPayload({
      parsedBooks,
      validatedBooks,
      startTime,
      resourceId,
      jobId,
    })

    // Send completion
    await progressReporter.complete('csv_import', completionPayload)
  } catch (error) {
    console.error(`[CSV Processor Core] Processing failed for job ${jobId}:`, error)
    await progressReporter.sendError('csv_import', {
      code: 'E_CSV_PROCESSING_FAILED',
      message: (error as Error).message,
      retryable: true,
      details: {
        fallbackAvailable: true,
        suggestion: 'Try manual CSV import instead',
      },
    })
  }
  // NOTE: No finally block! complete() and fail() handle WebSocket cleanup with
  // delayed closeConnection() to ensure final messages are delivered to client.
}

/**
 * Default completion payload builder (matches csv-import.ts format)
 *
 * @param context - Processing context
 * @returns Completion payload
 */
function buildDefaultCompletionPayload(context: ProcessingContext): CompletionPayload {
  const { parsedBooks, validatedBooks, startTime, resourceId } = context
  return {
    summary: {
      totalProcessed: parsedBooks.length,
      successCount: validatedBooks.length,
      failureCount: parsedBooks.length - validatedBooks.length,
      duration: Date.now() - startTime,
      resourceId,
    },
  }
}

/**
 * Alternative completion payload builder (matches csv-processor.ts format)
 * Use this for backward compatibility with csv-processor.ts callers
 *
 * @param context - Processing context
 * @returns Completion payload
 */
export function buildServiceCompletionPayload(context: ProcessingContext): CompletionPayload {
  const { validatedBooks, parsedBooks, jobId } = context
  return {
    booksCount: validatedBooks.length,
    resultsUrl: `/v3/jobs/imports/${jobId}/results`,
    successRate: `${validatedBooks.length}/${parsedBooks.length}`,
  }
}

/**
 * Call Gemini API to parse CSV
 *
 * @param csvText - Raw CSV content
 * @param prompt - Gemini prompt with few-shot examples
 * @param env - Worker environment bindings
 * @param deps - Injected dependencies (Issue #217)
 * @returns GeminiParseResult with books and validation errors
 */
async function callGemini(
  csvText: string,
  prompt: string,
  env: Env,
  deps: ProcessorDependencies,
): Promise<GeminiParseResult> {
  /**
   * GEMINI_API_KEY binding supports two patterns:
   *   1. Secrets Store binding (recommended for production): env.GEMINI_API_KEY is a SecretsStore binding and requires .get() to retrieve the value.
   *   2. Plain string binding (for local development/testing): env.GEMINI_API_KEY is a string.
   *
   * This dynamic resolution allows local development with a plaintext key (e.g., via wrangler.toml)
   * while ensuring production uses the more secure Secrets Store.
   */
  const geminiApiKey = env.GEMINI_API_KEY as string | { get?: () => Promise<string> }
  let apiKey: string

  if (typeof geminiApiKey === 'object' && geminiApiKey.get) {
    apiKey = await geminiApiKey.get()
  } else {
    apiKey = geminiApiKey as string
  }

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  return await deps.parseCSVWithGemini(csvText, prompt, apiKey)
}
