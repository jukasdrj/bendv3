/**
 * CSV Processor Service
 * 
 * Handles CSV parsing and validation as a standalone service.
 * Extracted from ProgressWebSocketDO alarm handler as part of the
 * architectural refactoring to separate business logic from Durable Objects.
 * 
 * This service is called by handlers and coordinates CSV parsing via Gemini,
 * reporting progress updates through a provided progress callback interface.
 * 
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

import { validateCSV } from '../utils/csv-validator.js';
import { buildCSVParserPrompt, PROMPT_VERSION } from '../prompts/csv-parser-prompt.js';
import { generateCSVCacheKey } from '../utils/cache-keys.js';
import { parseCSVWithGemini } from '../providers/gemini-csv-provider.js';

/**
 * Process CSV import with progress tracking
 * 
 * @param {string} csvText - Raw CSV file content
 * @param {Object} progressReporter - Interface for reporting progress
 * @param {Function} progressReporter.updateProgress - Update progress (pipeline, payload)
 * @param {Function} progressReporter.complete - Mark job complete (pipeline, payload)
 * @param {Function} progressReporter.sendError - Send error (pipeline, payload)
 * @param {Function} progressReporter.waitForReady - Wait for client ready signal
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<void>}
 */
export async function processCSVImport(csvText, progressReporter, env) {
  try {
    // Wait for client to be ready before starting processing
    console.log('[CSV Processor] Waiting for client ready signal');
    const readyResult = await progressReporter.waitForReady(10000);

    if (readyResult.timedOut || readyResult.disconnected) {
      const reason = readyResult.timedOut ? 'timeout' : 'not connected';
      console.warn(`[CSV Processor] Client ready ${reason}, proceeding anyway (client may miss early updates)`);
    } else {
      console.log('[CSV Processor] ✅ Client ready, starting processing');
    }

    // Stage 0: Validation (0-5%)
    await progressReporter.updateProgress('csv_import', {
      progress: 0.02,
      status: 'Validating CSV file...',
      processedCount: 0
    });

    const validation = validateCSV(csvText);
    if (!validation.valid) {
      throw new Error(`Invalid CSV: ${validation.error}`);
    }

    // Stage 1: Gemini Parsing (5-50%)
    await progressReporter.updateProgress('csv_import', {
      progress: 0.05,
      status: 'Uploading CSV to Gemini...',
      processedCount: 0
    });

    const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
    let parsedBooks = await env.KV_CACHE.get(cacheKey, 'json');

    if (!parsedBooks) {
      const prompt = buildCSVParserPrompt();
      parsedBooks = await callGemini(csvText, prompt, env);

      // Schema guarantees valid array structure and title+author on all books
      // Only check for empty response (edge case: CSV with no parseable books)
      if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
        throw new Error('No valid books found in CSV');
      }

      // Cache for 7 days
      await env.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
        expirationTtl: 604800
      });
    }

    // Stage 2: Report parsed count
    await progressReporter.updateProgress('csv_import', {
      progress: 0.75,
      status: `Gemini parsed ${parsedBooks.length} books with valid title+author`,
      processedCount: parsedBooks.length
    });

    // Validate and shape parsed books to ParsedBookDTO structure
    const validatedBooks = parsedBooks
      .filter(book => book.title && book.author)
      .map(book => ({
        title: String(book.title).trim(),
        author: String(book.author).trim(),
        isbn: book.isbn ? String(book.isbn).trim() : undefined
      }));

    // Complete processing
    await progressReporter.complete('csv_import', {
      books: validatedBooks,
      errors: [],
      successRate: `${validatedBooks.length}/${parsedBooks.length}`
    });

    console.log('[CSV Processor] Processing completed successfully');

  } catch (error) {
    console.error('[CSV Processor] Processing failed:', error);
    await progressReporter.sendError('csv_import', {
      code: 'E_CSV_PROCESSING_FAILED',
      message: error.message,
      retryable: true,
      details: {
        fallbackAvailable: true,
        suggestion: 'Try manual CSV import instead'
      }
    });
  }
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
  const apiKey = env.GEMINI_API_KEY?.get
    ? await env.GEMINI_API_KEY.get()
    : env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
