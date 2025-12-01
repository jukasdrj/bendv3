/**
 * CSV Processor Core Utility
 *
 * Shared CSV processing logic extracted from:
 * - src/handlers/csv-import.ts (processCSVImportCore)
 * - src/services/csv-processor.js (processCSVImport)
 *
 * This eliminates code duplication and provides a single source of truth
 * for CSV validation, Gemini parsing, caching, and result storage.
 *
 * Related: Issue #180 - Eliminate code duplication in CSV processing
 */

import { validateCSV } from "./csv-validator.js";
import {
  buildCSVParserPrompt,
  PROMPT_VERSION,
} from "../prompts/csv-parser-prompt.js";
import { generateCSVCacheKey } from "./cache-keys.js";
import { parseCSVWithGemini } from "../providers/gemini-csv-provider.js";

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
 * @param {string} csvText - Raw CSV file content
 * @param {string} jobId - Unique job identifier
 * @param {Object} progressReporter - Interface for reporting progress
 * @param {Function} progressReporter.waitForReady - Wait for client ready signal (timeout: number) => Promise<{timedOut, disconnected}>
 * @param {Function} progressReporter.updateProgress - Update progress (pipeline: string, payload: object) => Promise<void>
 * @param {Function} progressReporter.complete - Mark job complete (pipeline: string, payload: object) => Promise<void>
 * @param {Function} progressReporter.sendError - Send error (pipeline: string, payload: object) => Promise<void>
 * @param {Object} env - Worker environment bindings (CACHE, GEMINI_API_KEY)
 * @param {Object} options - Configuration options
 * @param {number} options.resultsTTL - TTL for KV storage in seconds (default: 3600 = 1 hour)
 * @param {string} options.resultsKeyPrefix - KV key prefix (default: "job-results")
 * @param {Function} options.buildCompletionPayload - Custom completion payload builder (default: summary format)
 * @returns {Promise<void>}
 */
export async function processCSVCore(
  csvText,
  jobId,
  progressReporter,
  env,
  options = {},
) {
  const {
    resultsTTL = 3600, // Default: 1 hour
    resultsKeyPrefix = "job-results", // IMPORTANT: Must match retrieval endpoint key (csv-results for /v1/csv/results, scan-results for /v1/scan/results)
    buildCompletionPayload = buildDefaultCompletionPayload,
  } = options;

  const startTime = Date.now();

  try {
    // Wait for client to establish WebSocket and send ready signal
    // Issue #178: Increased timeout to 15 seconds to handle slow network connections
    console.log(
      `[CSV Processor Core] Waiting for WebSocket ready signal for job ${jobId}`,
    );
    const readyResult = await progressReporter.waitForReady(15000); // 15 second timeout

    if (readyResult.timedOut || readyResult.disconnected) {
      const reason = readyResult.timedOut
        ? "timeout"
        : "WebSocket not connected";
      console.warn(
        `[CSV Processor Core] WebSocket ready ${reason} for job ${jobId}, proceeding anyway (client may miss early updates)`,
      );
    } else {
      const elapsedMs = Date.now() - startTime;
      console.log(
        `[CSV Processor Core] ✅ WebSocket ready for job ${jobId} after ${elapsedMs}ms`,
      );
    }

    // Stage 0: Validation (0-5%)
    await progressReporter.updateProgress("csv_import", {
      progress: 0.02,
      status: "Validating CSV file...",
      processedCount: 0,
    });

    const validation = validateCSV(csvText);
    if (!validation.valid) {
      throw new Error(`Invalid CSV: ${validation.error}`);
    }

    // Stage 1: Gemini Parsing (5-50%)
    await progressReporter.updateProgress("csv_import", {
      progress: 0.05,
      status: "Uploading CSV to Gemini...",
      processedCount: 0,
    });

    const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
    let parsedBooks = await env.CACHE.get(cacheKey, "json");

    // Issue #101: Cache hit telemetry for monitoring effectiveness
    const cacheHit = !!parsedBooks;
    console.log(JSON.stringify({
      type: "CSV_CACHE_TELEMETRY",
      hit: cacheHit,
      cacheKey: cacheKey.substring(0, 24) + "...",
      csvSizeBytes: csvText.length,
      timestamp: new Date().toISOString(),
    }));

    if (!parsedBooks) {
      // NOTE: Gemini 2.0 Flash typically responds in <20 seconds for CSV parsing
      // Paid Plan: 30M CPU milliseconds/month, 5-minute max per invocation
      const prompt = buildCSVParserPrompt();
      parsedBooks = await callGemini(csvText, prompt, env);

      // Schema guarantees valid array structure and title+author on all books
      // Only check for empty response (edge case: CSV with no parseable books)
      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
        throw new Error("No valid books found in CSV");
      }

      // Cache for 7 days
      await env.CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
        expirationTtl: 604800,
      });
    }

    // Stage 2: Report parsed count
    await progressReporter.updateProgress("csv_import", {
      progress: 0.75,
      status: `Gemini parsed ${parsedBooks.length} books with valid title+author`,
      processedCount: parsedBooks.length,
    });

    // Validate and shape parsed books to ParsedBookDTO structure
    // Strip extraneous fields from Gemini output to prevent schema drift
    const validatedBooks = parsedBooks
      .filter((book) => book.title && book.author) // Ensure required fields present
      .map((book) => ({
        title: String(book.title).trim(),
        author: String(book.author).trim(),
        isbn: book.isbn ? String(book.isbn).trim() : undefined,
      }));

    // FIX #1: Persist parsed books to D1+KV (Issue #1 - CSV import data loss)
    // This ensures books accumulate in D1 database instead of being lost after iOS enrichment
    await progressReporter.updateProgress("csv_import", {
      progress: 0.80,
      status: `Saving ${parsedBooks.length} books to database...`,
      processedCount: parsedBooks.length,
    });

    const { BookRepository } = await import('../repositories/book-repository.js');
    const { mapGeminiCSVBookToBookRecord, isValidISBN } = await import('./book-mappers.js');
    const bookRepo = new BookRepository(env);

    // FIX: Parallelize D1 saves to avoid CPU timeout (Grok-4 critical issue)
    // 478 books × 50ms sequential = 23.9s (near 30s limit)
    // Parallel saves complete in <5s
    const savePromises = parsedBooks
      .filter((book) => isValidISBN(book.isbn))
      .map(async (geminiBook) => {
        try {
          const bookRecord = mapGeminiCSVBookToBookRecord(geminiBook);
          await bookRepo.save(bookRecord);
          return { status: 'fulfilled', isbn: geminiBook.isbn };
        } catch (error) {
          console.error(
            `[CSV Processor Core] Failed to save ISBN ${geminiBook.isbn}:`,
            error,
          );
          return { status: 'rejected', isbn: geminiBook.isbn, error };
        }
      });

    const results = await Promise.allSettled(savePromises);
    const savedCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.filter((r) => r.status === 'rejected').length;

    console.log(
      `[CSV Processor Core] ✅ Persisted ${savedCount}/${parsedBooks.length} books to D1+KV` +
        (failedCount > 0 ? ` (${failedCount} failed)` : ''),
    );

    // Queue successfully saved ISBNs for Alexandria enrichment (non-blocking)
    // This ensures Alexandria learns from CSV imports without slowing down the import
    if (env.ENRICHMENT_QUEUE) {
      const successfulISBNs = results
        .filter((r) => r.status === 'fulfilled' && r.value?.isbn)
        .map((r) => r.value.isbn);

      if (successfulISBNs.length > 0) {
        console.log(
          `[CSV Processor Core] 📤 Queueing ${successfulISBNs.length} ISBNs for Alexandria enrichment`,
        );

        // Batch queue sends for efficiency (10 ISBNs per message)
        const batchSize = 10;
        const queuePromises = [];

        for (let i = 0; i < successfulISBNs.length; i += batchSize) {
          const batch = successfulISBNs.slice(i, i + batchSize);
          for (const isbn of batch) {
            queuePromises.push(
              env.ENRICHMENT_QUEUE.send({
                entity_type: 'edition',
                isbn,
                source: 'csv_import',
                priority: 8, // High priority - user data
                timestamp: new Date().toISOString(),
              }).catch((err) => {
                // Non-blocking: log but don't fail the import
                console.warn(`[CSV Processor Core] ⚠️ Failed to queue ISBN ${isbn}:`, err.message);
              }),
            );
          }
        }

        // Fire and forget - don't await queue sends to avoid blocking CSV completion
        Promise.all(queuePromises).then(() => {
          console.log(
            `[CSV Processor Core] ✅ Queued ${successfulISBNs.length} ISBNs for background enrichment`,
          );
        });
      }
    } else {
      console.log(
        `[CSV Processor Core] ⚠️ ENRICHMENT_QUEUE not configured, skipping Alexandria enrichment`,
      );
    }

    // Store full results in KV for HTTP retrieval (API Contract format)
    // Transform validatedBooks to canonical BookSchema format
    // BookSchema requires: isbn, title, authors (array), plus optional fields
    const canonicalBooks = parsedBooks
      .filter((book) => book.title && book.author)
      .map((book) => {
        // Parse author string into array (comma-separated authors)
        const authorString = String(book.author).trim()
        const authors = authorString
          .split(/,\s*(?:and\s+)?|(?:\s+and\s+)/i)  // Split on ", " or " and "
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
          coverUrl: undefined, // Not available from CSV import
        }
      })

    const resourceId = `${resultsKeyPrefix}:${jobId}`;
    const apiContractResults = {
      booksCreated: canonicalBooks.length,
      booksUpdated: 0, // CSV import always creates new books
      duplicatesSkipped: 0, // TODO: Track duplicates
      enrichmentSucceeded: 0, // CSV import doesn't enrich - set to 0 to be accurate
      enrichmentFailed: 0, // TODO: Track enrichment failures
      errors: [], // TODO: Store validation errors with row numbers
      books: canonicalBooks // Canonical BookSchema format for iOS SwiftData
    };
    await env.CACHE.put(
      resourceId,
      JSON.stringify(apiContractResults),
      { expirationTtl: resultsTTL },
    );

    console.log(
      `[CSV Processor Core] 💾 Stored results in KV: ${resourceId} (${canonicalBooks.length} books, TTL: ${resultsTTL}s)`,
    );

    // Build completion payload (customizable per caller)
    const completionPayload = buildCompletionPayload({
      parsedBooks,
      validatedBooks,
      startTime,
      resourceId,
      jobId,
    });

    // Send completion
    await progressReporter.complete("csv_import", completionPayload);
  } catch (error) {
    console.error(
      `[CSV Processor Core] Processing failed for job ${jobId}:`,
      error,
    );
    await progressReporter.sendError("csv_import", {
      code: "E_CSV_PROCESSING_FAILED",
      message: error.message,
      retryable: true,
      details: {
        fallbackAvailable: true,
        suggestion: "Try manual CSV import instead",
      },
    });
  }
  // NOTE: No finally block! complete() and fail() handle WebSocket cleanup with
  // delayed closeConnection() to ensure final messages are delivered to client.
}

/**
 * Default completion payload builder (matches csv-import.ts format)
 *
 * @param {Object} context - Processing context
 * @returns {Object} Completion payload
 */
function buildDefaultCompletionPayload({
  parsedBooks,
  validatedBooks,
  startTime,
  resourceId,
}) {
  return {
    summary: {
      totalProcessed: parsedBooks.length,
      successCount: validatedBooks.length,
      failureCount: parsedBooks.length - validatedBooks.length,
      duration: Date.now() - startTime,
      resourceId,
    },
  };
}

/**
 * Alternative completion payload builder (matches csv-processor.js format)
 * Use this for backward compatibility with csv-processor.js callers
 *
 * @param {Object} context - Processing context
 * @returns {Object} Completion payload
 */
export function buildServiceCompletionPayload({
  validatedBooks,
  parsedBooks,
  jobId,
}) {
  return {
    booksCount: validatedBooks.length,
    resultsUrl: `/v1/csv/results/${jobId}`,
    successRate: `${validatedBooks.length}/${parsedBooks.length}`,
  };
}

/**
 * Call Gemini API to parse CSV
 *
 * @param {string} csvText - Raw CSV content
 * @param {string} prompt - Gemini prompt with few-shot examples
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Array<Object>>} Parsed book data
 */
async function callGemini(csvText, prompt, env) {
  /**
   * GEMINI_API_KEY binding supports two patterns:
   *   1. Secrets Store binding (recommended for production): env.GEMINI_API_KEY is a SecretsStore binding and requires .get() to retrieve the value.
   *   2. Plain string binding (for local development/testing): env.GEMINI_API_KEY is a string.
   *
   * This dynamic resolution allows local development with a plaintext key (e.g., via wrangler.toml)
   * while ensuring production uses the more secure Secrets Store.
   */
  const apiKey = env.GEMINI_API_KEY?.get
    ? await env.GEMINI_API_KEY.get()
    : env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
