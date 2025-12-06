/**
 * Bookshelf AI Scanner Service
 * Migrated from bookshelf-ai-worker
 *
 * OPTIMIZED: Gemini 2.0 Flash only (proven working, 2M token context window)
 * CRITICAL: Uses direct function calls instead of RPC to eliminate circular dependencies!
 */

import { enrichMultipleBooks } from "./enrichment.ts";
import { scanImageWithGemini } from "../providers/gemini-provider.js";
import { enrichBooksParallel } from "./parallel-enrichment.js";
import { categorizeBooks } from "../utils/confidence.js";

/**
 * Debug logging helper - only logs verbose details in DEBUG mode
 * Prevents production log spam (Issue #114)
 *
 * @param {Object} env - Worker environment
 * @param {Function} logFn - Function to execute for logging
 */
function debugLog(env, logFn) {
  if (env.LOG_LEVEL === "DEBUG") {
    logFn();
  }
}

/**
 * AI Scanner Progress Stages
 * Defines progress percentages for each stage of the AI scanning pipeline
 */
const PROGRESS_STAGES = {
  QUALITY_ANALYSIS: 0.1, // Image quality check (10%)
  AI_PROCESSING: 0.3, // Gemini AI vision processing (30%)
  DETECTION_COMPLETE: 0.5, // Book detection complete (50%)
  ENRICHMENT_START: 0.7, // Begin parallel enrichment (70%)
  ENRICHMENT_DELTA: 0.25, // Enrichment progress range (70% → 95%)
  FINALIZATION: 1.0, // Complete and send results (100%)
};

/**
 * Process bookshelf image scan with AI vision
 *
 * @param {string} jobId - Unique job identifier
 * @param {ArrayBuffer} imageData - Raw image data
 * @param {Request} request - Request object with X-AI-Provider header
 * @param {Object} env - Worker environment bindings
 * @param {Object} doStub - ProgressWebSocketDO stub for status updates
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export async function processBookshelfScan(
  jobId,
  imageData,
  request,
  env,
  doStub,
  ctx,
) {
  const startTime = Date.now();

  try {
    // Enforce 10MB per-photo limit for single scans (Issue #171) – consistent with batch handler
    const MAX_IMAGE_SIZE = 10_000_000; // 10MB per photo (matches Gemini API limits and batch enforcement)
    if (imageData.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_SIZE / 1_000_000}MB (actual: ${(imageData.byteLength / 1_000_000).toFixed(1)}MB). Please compress or resize the image.`);
    }

    console.log(
      `[AI Scanner] Starting scan for job ${jobId}, image size: ${imageData.byteLength} bytes`,
    );

    // NEW: Check if WebSocket is ready (should have been done in index.js, but double-check)
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > 6000) {
      console.warn(
        `[AI Scanner] Job ${jobId} started ${elapsedMs}ms after request - possible ready timeout`,
      );
    }

    // Initialize job state
    await doStub.initializeJobState("ai_scan", 3); // 3 stages total

    // Stage 1: Image quality analysis (10% progress)
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.QUALITY_ANALYSIS,
      status: "Analyzing image quality...",
      processedCount: 0,
      currentItem: "Image quality check",
    });
    // ISSUE #114: Guard verbose logging - only in DEBUG mode
    debugLog(env, () => {
      console.log(
        `[AI Scanner] Progress pushed: ${PROGRESS_STAGES.QUALITY_ANALYSIS * 100}% (image quality analysis)`,
      );
    });

    // Stage 2: AI processing with Gemini 2.0 Flash
    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.AI_PROCESSING,
      status: "Processing with Gemini AI...",
      processedCount: 1,
      currentItem: "Gemini AI processing",
    });

    console.log(`[AI Scanner] Job ${jobId} - Using Gemini 2.0 Flash`);

    let scanResult;
    let modelUsed = "unknown"; // Default fallback
    try {
      scanResult = await scanImageWithGemini(imageData, env);
      console.log("[AI Scanner] Gemini processing complete");

      /**
       * Extract model name from AI provider metadata for completion response.
       *
       * DEFENSIVE PROGRAMMING: Fallback to 'unknown' if metadata is incomplete.
       * This prevents runtime errors in the following scenarios:
       * 1. Future AI providers may have different metadata structures
       * 2. Gemini API response structure could change in future versions
       * 3. Network issues could result in partial/corrupted responses
       *
       * Without this fallback, missing metadata would cause:
       * - "providerParam is not defined" error at completion stage
       * - Premature WebSocket closure (code 1001 instead of clean 1000)
       * - iOS client receiving "Scan failed" despite successful AI processing
       *
       * @see ai-scanner-metadata.test.js for test coverage of this fallback
       */
      modelUsed = scanResult.metadata?.model || "unknown";
      console.log(`[AI Scanner] Model used: ${modelUsed}`);
    } catch (aiError) {
      console.error("[AI Scanner] Gemini processing failed:", aiError.message);
      throw aiError;
    }

    const detectedBooks = scanResult.books;
    const suggestions = scanResult.suggestions || [];

    console.log(
      `[AI Scanner] ${detectedBooks.length} books detected (${scanResult.metadata.processingTimeMs}ms)`,
    );

    await doStub.updateProgress("ai_scan", {
      progress: PROGRESS_STAGES.DETECTION_COMPLETE,
      status: `Detected ${detectedBooks.length} books, enriching data...`,
      processedCount: 1,
      currentItem: `${detectedBooks.length} books detected`,
    });

    // Stage 3: Enrichment (70% → 100% progress)
    // OPTIMIZED: Parallel enrichment with 10 concurrent requests
    const enrichedBooks = await enrichBooksParallel(
      detectedBooks,
      async (book) => {
        // Direct service call - NO RPC, no circular dependency!
        // Issue #205: Migrated from V1 handleSearchAdvanced to enrichMultipleBooks service
        // ISSUE #114: Guard verbose logging - only in DEBUG mode
        debugLog(env, () => {
          console.log(
            `[AI Scanner] Enriching book: "${book.title}" by ${book.author || "unknown"}`,
          );
        });

        const enrichmentResult = await enrichMultipleBooks(
          {
            title: book.title || "",
            author: book.author || "",
          },
          env,
          { maxResults: 20 },
          ctx, // Pass execution context for waitUntil support
        );

        // enrichMultipleBooks returns { works, editions, authors }
        const work = enrichmentResult.works?.[0] || null;
        const editions = enrichmentResult.editions || [];
        const authors = enrichmentResult.authors || [];

        // ISSUE #114: Guard verbose logging - only in DEBUG mode
        debugLog(env, () => {
          console.log(
            `[AI Scanner] ✅ Enrichment ${work ? "found" : "not_found"} for "${book.title}": work=${!!work}, editions=${editions.length}, authors=${authors.length}`,
          );
        });

        return {
          ...book,
          enrichment: {
            status: work ? "success" : "not_found",
            work,
            editions,
            authors,
            provider: "alexandria", // enrichMultipleBooks uses Alexandria RPC
            cachedResult: false, // Alexandria handles its own caching internally
          },
        };
      },
      async (index) => {
        // Progress callback - update DO for real-time WebSocket updates
        const enrichmentProgress =
          PROGRESS_STAGES.ENRICHMENT_START +
          (index / detectedBooks.length) * PROGRESS_STAGES.ENRICHMENT_DELTA;

        await doStub.updateProgress("ai_scan", {
          progress: enrichmentProgress,
          status: `Enriching book ${index + 1} of ${detectedBooks.length}...`,
          processedCount: 1 + index,
          currentItem: detectedBooks[index]?.title || "Unknown",
        });
      },
      10, // maxConcurrency
    );

    console.log(
      `[AI Scanner] Enrichment complete - ${enrichedBooks.length} books enriched`,
    );

    // Categorize books by confidence level
    const categorized = categorizeBooks(enrichedBooks);

    console.log(
      `[AI Scanner] Categorization: ${categorized.high.length} high, ${categorized.medium.length} medium, ${categorized.low.length} low confidence`,
    );

    // Stage 4: Completion (100%)
    const totalTime = Date.now() - startTime;

    // Completion payload with modelUsed fallback
    await doStub.complete("ai_scan", {
      books: enrichedBooks,
      suggestions,
      summary: {
        totalBooks: enrichedBooks.length,
        highConfidence: categorized.high.length,
        mediumConfidence: categorized.medium.length,
        lowConfidence: categorized.low.length,
        processingTimeMs: totalTime,
        modelUsed, // Includes fallback to 'unknown' if metadata incomplete
      },
    });

    console.log(`[AI Scanner] Job ${jobId} completed in ${totalTime}ms`);
  } catch (error) {
    console.error(`[AI Scanner] Job ${jobId} failed:`, error);

    // Send error via Durable Object
    await doStub.sendError("ai_scan", {
      message: error.message || "Unknown scan error",
      code: "AI_SCAN_FAILED",
    });
  }
  // NOTE: No finally block needed! complete() and sendError() handle WebSocket cleanup
}
