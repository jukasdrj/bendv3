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
 * @param {Object} env - Worker environment bindings (KV_CACHE, GEMINI_API_KEY)
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
    resultsKeyPrefix = "job-results",
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
    let parsedBooks = await env.KV_CACHE.get(cacheKey, "json");

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
      await env.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
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

    // Store full results in KV for HTTP retrieval
    const resourceId = `${resultsKeyPrefix}:${jobId}`;
    await env.KV_CACHE.put(
      resourceId,
      JSON.stringify({ books: validatedBooks, errors: [] }),
      { expirationTtl: resultsTTL },
    );

    console.log(
      `[CSV Processor Core] 💾 Stored results in KV: ${resourceId} (${validatedBooks.length} books, TTL: ${resultsTTL}s)`,
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
