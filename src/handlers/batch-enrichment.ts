// src/handlers/batch-enrichment.js
/**
 * Batch Enrichment Handler
 *
 * Phase 2: Canonical API Contract Implementation
 * - Uses EnrichmentJobInitResponse for initialization
 * - Uses EnrichedBookDTO for flattened book structure (no nested objects)
 */

import { enrichBooksParallel } from "../services/parallel-enrichment.js";
import { enrichSingleBook } from "../services/enrichment.ts";
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from "../utils/response-builder.js";
import type {
  EnrichmentJobInitResponse,
  EnrichedBookDTO,
} from "../types/responses.js";
import { ProgressReporter } from "../utils/progress-reporter.js";

/**
 * Handle batch enrichment request (POST /api/enrichment/batch)
 *
 * Accepts a batch of books for background enrichment and returns immediately with 202 Accepted.
 * Actual enrichment happens asynchronously via ctx.waitUntil() with progress updates pushed via WebSocket.
 *
 * Used by:
 * - iOS CSV import enrichment
 * - iOS background enrichment queue
 * - Batch enrichment for large libraries
 *
 * @param {Request} request - Incoming request with JSON body { books: [{ title, author, isbn }], jobId }
 * @param {Object} env - Worker environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 * @returns {Promise<Response>} ResponseEnvelope<{ success, processedCount, totalCount }> with 202 status
 */
export async function handleBatchEnrichment(request, env, ctx) {
  try {
    const requestBody = await request.json();
    let books = requestBody.books;
    const jobId = requestBody.jobId;

    // iOS COMPATIBILITY: Accept both formats
    // Format 1: {"books": [{"title": "...", "author": "...", "isbn": "..."}]}
    // Format 2: {"barcodes": ["9780439064873", ...]} (iOS app format)
    if (!books && requestBody.barcodes && Array.isArray(requestBody.barcodes)) {
      // Convert barcodes to books format
      books = requestBody.barcodes.map(barcode => ({
        isbn: barcode,
        title: barcode, // Use ISBN as title for progress messages
        author: "", // Empty author
      }));
      console.log(`[Batch Enrichment] Converted ${books.length} barcodes to books format`);
    }

    // Validate request structure
    if (!books || !Array.isArray(books)) {
      return createErrorResponse(
        "Invalid request: must include either 'books' array or 'barcodes' array",
        400,
        ErrorCodes.INVALID_REQUEST,
      );
    }

    if (!jobId) {
      return createErrorResponse(
        "Missing jobId",
        400,
        ErrorCodes.INVALID_REQUEST,
      );
    }

    // DoS Protection: Limit batch size to prevent cost explosion
    if (books.length === 0) {
      return createErrorResponse(
        "Empty books array",
        400,
        ErrorCodes.EMPTY_BATCH,
      );
    }

    if (books.length > 100) {
      return createErrorResponse(
        "Batch size exceeds maximum of 100 books",
        400,
        ErrorCodes.BATCH_TOO_LARGE,
      );
    }

    // DEBUG: Log first book to see what iOS is actually sending
    if (books.length > 0) {
      console.log(`[Batch Enrichment] First book received:`, JSON.stringify(books[0]));
    }

    // Validate and sanitize each book
    for (let i = 0; i < books.length; i++) {
      const book = books[i];

      // Title validation
      if (!book.title || typeof book.title !== "string") {
        return createErrorResponse(
          `Invalid title for book at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      // XSS Protection: Limit title length
      if (book.title.length > 500) {
        return createErrorResponse(
          `Title exceeds maximum length of 500 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      // Optional fields validation
      if (book.author && typeof book.author !== "string") {
        return createErrorResponse(
          `Invalid author for book at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      if (book.author && book.author.length > 300) {
        return createErrorResponse(
          `Author exceeds maximum length of 300 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      if (book.isbn && typeof book.isbn !== "string") {
        return createErrorResponse(
          `Invalid ISBN for book at index ${i}`,
          400,
          ErrorCodes.INVALID_ISBN,
        );
      }

      if (book.isbn && book.isbn.length > 17) {
        return createErrorResponse(
          `ISBN exceeds maximum length of 17 characters at index ${i}`,
          400,
          ErrorCodes.INVALID_ISBN,
        );
      }

      // Basic sanitization: Trim whitespace only
      // Note: No HTML entity escaping needed for JSON APIs (clients handle escaping at UI layer)
      book.title = book.title.trim();
      if (book.author) book.author = book.author.trim();
      if (book.isbn) book.isbn = book.isbn.trim();
    }

    // Get Durable Object stubs (refactored architecture)
    // WebSocketConnectionDO: handles auth tokens and WebSocket broadcasts
    // JobStateManagerDO: handles job state persistence
    const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
    const wsDoStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

    const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
    const stateDoStub = env.JOB_STATE_MANAGER_DO.get(stateDoId);

    // Generate and store auth token for WebSocket authentication
    // Also set pipeline type for ready_ack message
    const authToken = crypto.randomUUID();
    await wsDoStub.setAuthToken(authToken, "batch_enrichment");

    console.log(`[Batch Enrichment] Auth token generated for job ${jobId}`);

    // Initialize job state for batch enrichment (CRITICAL: Must be done BEFORE returning response)
    // This sets currentPipeline so ready_ack messages will have the correct pipeline field
    await stateDoStub.initializeJobState(jobId, "batch_enrichment", books.length);

    // Create ProgressReporter for background processing
    const reporter = new ProgressReporter(jobId, env);

    // Start background enrichment
    ctx.waitUntil(processBatchEnrichment(books, reporter, env, jobId));

    // FIX: Return the response documented in the API contract (§6.2)
    // This aligns the implementation with the documentation and expected client behavior.
    // iOS expects: { jobId: String, success: Bool, processedCount: Int, totalCount: Int, authToken: String, websocketUrl: String }
    // Since enrichment happens async, we return:
    // - jobId: echoed back for client tracking
    // - success: true (job accepted and started)
    // - processedCount: 0 (no books processed yet)
    // - totalCount: books.length (total books queued)
    // - authToken: WebSocket authentication token (canonical field)
    // - token: DEPRECATED backward compatibility field (removal: March 1, 2026)
    // - message: Human-readable status message
    // - websocketUrl: Full WebSocket URL with jobId and token
    // Actual enrichment results come via WebSocket
    const initResponse: EnrichmentJobInitResponse = {
      jobId, // BUGFIX: Echo back jobId for client confirmation
      success: true,
      processedCount: 0,
      totalCount: books.length,
      authToken, // WebSocket authentication token (canonical field)
      token: authToken, // DEPRECATED: Backward compatibility for existing iOS clients (Issue #119)
      message: "Batch enrichment initiated",
      websocketUrl: `/ws/progress?jobId=${jobId}&token=${authToken}`,
    };

    return createSuccessResponse(initResponse, {}, 202);
  } catch (error) {
    return createErrorResponse(error.message, 500, ErrorCodes.INTERNAL_ERROR);
  }
}

/**
 * Background processor for batch enrichment
 *
 * @param {Array<Object>} books - Books to enrich (title, author, isbn)
 * @param {ProgressReporter} reporter - Progress reporter for DO communication
 * @param {Object} env - Worker environment bindings
 * @param {string} jobId - The client-provided job identifier
 */
async function processBatchEnrichment(books, reporter, env, jobId) {
  const startTime = Date.now();
  try {
    // Reuse existing enrichBooksParallel() logic
    const enrichedBooks = await enrichBooksParallel(
      books,
      async (book) => {
        // Call enrichment service (multi-provider fallback: Google Books → OpenLibrary)
        // Returns SingleEnrichmentResult { work, edition, authors } or null
        const enriched = await enrichSingleBook(
          {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
          },
          env,
        );

        // Return EnrichedBookDTO structure (iOS expects nested 'enriched' field)
        if (enriched) {
          return {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            success: true,
            enriched: {
              work: enriched.work,
              edition: enriched.edition,
              authors: enriched.authors || [],
            },
          };
        } else {
          return {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            success: false,
            error: "Book not found in any provider",
          };
        }
      },
      async (completed, total, title, hasError) => {
        const progress = completed / total;
        const status = hasError
          ? `Enriching (${completed}/${total}): ${title} [failed]`
          : `Enriching (${completed}/${total}): ${title}`;

        // Use ProgressReporter to update progress (routes to JobStateManagerDO)
        await reporter.updateProgress("batch_enrichment", {
          progress,
          status,
          processedCount: completed,
          currentItem: title,
        });
      },
      10, // Concurrency limit
    );

    const totalProcessed = enrichedBooks.length;
    const successCount = enrichedBooks.filter((b) => b.success === true).length;
    const failureCount = totalProcessed - successCount;
    const duration = Date.now() - startTime;

    // Store full results in KV for HTTP retrieval (2-hour TTL to match token expiry)
    // FIX (Shelf Scan Plan - Issue 1.3): Align TTL with token expiry to prevent 404 with valid token
    const resourceId = `job-results:${jobId}`;
    await env.CACHE.put(
      resourceId,
      JSON.stringify(enrichedBooks),
      { expirationTtl: 7200 }, // 2 hours (matches token expiry)
    );

    // Send completion via ProgressReporter (routes to JobStateManagerDO)
    await reporter.complete("batch_enrichment", {
      summary: {
        totalProcessed,
        successCount,
        failureCount,
        duration,
        resourceId,
      },
    });
  } catch (error) {
    // Send error via ProgressReporter (routes to JobStateManagerDO)
    await reporter.sendError("batch_enrichment", {
      code: "E_BATCH_PROCESSING_FAILED",
      message: error.message,
      retryable: true,
    });
  }
}
