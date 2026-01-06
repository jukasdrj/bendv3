/**
 * Bookshelf AI Scanner Service
 * Migrated from bookshelf-ai-worker
 *
 * OPTIMIZED: Gemini 2.0 Flash only (proven working, 2M token context window)
 * CRITICAL: Uses direct function calls instead of RPC to eliminate circular dependencies!
 */

import { getCacheTTL } from '../config/cache-ttl'
import { scanImageWithGemini } from '../providers/gemini-provider'
import type { AuthorDTO, EditionDTO, WorkDTO } from '../types/canonical'
import type { Env } from '../types/env.js'
import type { BookshelfDetectedBook } from '../types/gemini-schemas'
import { categorizeBooks } from '../utils/book/confidence'
import { enrichMultipleBooks } from './enrichment'
import { enrichBooksParallel } from './parallel-enrichment.js'

/**
 * Scan result from Gemini provider (matches gemini-provider.ts interface)
 */
interface ScanResult {
  books: BookshelfDetectedBook[]
  suggestions: string[]
  metadata: {
    provider: string
    model: string
    timestamp: string
    processingTimeMs: number
    tokenUsage: {
      promptTokens: number
      outputTokens: number
      totalTokens: number
    }
    error?: string
  }
}

/**
 * Durable Object stub interface for job state management
 */
interface JobStateManagerStub {
  initializeJobState(jobType: string, totalStages: number): Promise<void>
  updateProgress(
    jobType: string,
    progress: {
      progress: number
      status: string
      processedCount: number
      currentItem: string
    },
  ): Promise<void>
  complete(jobType: string, payload: unknown): Promise<void>
  sendError(jobType: string, error: { message: string; code: string }): Promise<void>
}

/**
 * Enriched book with all metadata
 */
interface EnrichedBook extends BookshelfDetectedBook {
  boundingBox?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
  enrichment?: {
    status: 'success' | 'not_found' | 'error'
    work: WorkDTO | null
    editions: EditionDTO[]
    authors: AuthorDTO[]
    provider: string
    cachedResult: boolean
  }
}

/**
 * Categorized books by confidence level
 */
interface CategorizedBooks {
  high: EnrichedBook[]
  medium: EnrichedBook[]
  low: EnrichedBook[]
}

/**
 * Scan completion payload
 */
interface ScanCompletionPayload {
  totalDetected: number
  approved: number
  needsReview: number
  resultsUrl: string
  metadata: {
    modelUsed: string
    processingTime: number
  }
}

/**
 * Book metadata for results storage
 */
interface BookResult {
  title: string
  author?: string | null
  isbn: string | null
  confidence?: number | null
  boundingBox?: {
    x1: number
    y1: number
    x2: number
    y2: number
  }
  enrichmentStatus: string
  coverUrl: string | null
  publisher: string | null
  publicationYear: number | null
}

/**
 * Full results stored in KV
 */
interface FullResults {
  totalDetected: number
  approved: number
  needsReview: number
  books: BookResult[]
  metadata: {
    modelUsed: string
    processingTime: number
    timestamp: number
  }
}

/**
 * Debug logging helper - only logs verbose details in DEBUG mode
 * Prevents production log spam (Issue #114)
 *
 * @param env - Worker environment
 * @param logFn - Function to execute for logging
 */
function debugLog(env: Env, logFn: () => void): void {
  if (env.LOG_LEVEL === 'DEBUG') {
    logFn()
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
}

/**
 * Process bookshelf image scan with AI vision
 *
 * @param jobId - Unique job identifier
 * @param imageData - Raw image data
 * @param _request - Request object with X-AI-Provider header
 * @param env - Worker environment bindings
 * @param doStub - JobStateManagerDO stub for status updates
 * @param ctx - Execution context for waitUntil
 */
export async function processBookshelfScan(
  jobId: string,
  imageData: ArrayBuffer,
  _request: Request,
  env: Env,
  doStub: JobStateManagerStub,
  ctx: ExecutionContext,
): Promise<void> {
  const startTime = Date.now()

  try {
    // Enforce 10MB per-photo limit for single scans (Issue #171) – consistent with batch handler
    const MAX_IMAGE_SIZE = 10_000_000 // 10MB per photo (matches Gemini API limits and batch enforcement)
    if (imageData.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(
        `Image exceeds maximum size of ${MAX_IMAGE_SIZE / 1_000_000}MB (actual: ${(imageData.byteLength / 1_000_000).toFixed(1)}MB). Please compress or resize the image.`,
      )
    }

    console.log(
      `[AI Scanner] Starting scan for job ${jobId}, image size: ${imageData.byteLength} bytes`,
    )

    // NEW: Check if WebSocket is ready (should have been done in index.js, but double-check)
    const elapsedMs = Date.now() - startTime
    if (elapsedMs > 6000) {
      console.warn(
        `[AI Scanner] Job ${jobId} started ${elapsedMs}ms after request - possible ready timeout`,
      )
    }

    // Initialize job state
    await doStub.initializeJobState('ai_scan', 3) // 3 stages total

    // Stage 1: Image quality analysis (10% progress)
    await doStub.updateProgress('ai_scan', {
      progress: PROGRESS_STAGES.QUALITY_ANALYSIS,
      status: 'Analyzing image quality...',
      processedCount: 0,
      currentItem: 'Image quality check',
    })
    // ISSUE #114: Guard verbose logging - only in DEBUG mode
    debugLog(env, () => {
      console.log(
        `[AI Scanner] Progress pushed: ${PROGRESS_STAGES.QUALITY_ANALYSIS * 100}% (image quality analysis)`,
      )
    })

    // Stage 2: AI processing with Gemini 2.0 Flash
    await doStub.updateProgress('ai_scan', {
      progress: PROGRESS_STAGES.AI_PROCESSING,
      status: 'Processing with Gemini AI...',
      processedCount: 1,
      currentItem: 'Gemini AI processing',
    })

    console.log(`[AI Scanner] Job ${jobId} - Using Gemini 2.0 Flash`)

    let scanResult: ScanResult
    let modelUsed = 'unknown' // Default fallback
    try {
      scanResult = await scanImageWithGemini(imageData, env)
      console.log('[AI Scanner] Gemini processing complete')

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
      modelUsed = scanResult.metadata?.model || 'unknown'
      console.log(`[AI Scanner] Model used: ${modelUsed}`)
    } catch (aiError) {
      const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown AI error'
      console.error('[AI Scanner] Gemini processing failed:', errorMessage)
      throw aiError
    }

    const detectedBooks = scanResult.books

    console.log(
      `[AI Scanner] ${detectedBooks.length} books detected (${scanResult.metadata.processingTimeMs}ms)`,
    )

    await doStub.updateProgress('ai_scan', {
      progress: PROGRESS_STAGES.DETECTION_COMPLETE,
      status: `Detected ${detectedBooks.length} books, enriching data...`,
      processedCount: 1,
      currentItem: `${detectedBooks.length} books detected`,
    })

    // Stage 3: Enrichment (70% → 100% progress)
    // OPTIMIZED: Parallel enrichment with 10 concurrent requests
    const enrichedBooks = await enrichBooksParallel(
      detectedBooks,
      async (book: BookshelfDetectedBook): Promise<EnrichedBook> => {
        // Direct service call - NO RPC, no circular dependency!
        // Issue #205: Migrated from V1 handleSearchAdvanced to enrichMultipleBooks service
        // ISSUE #114: Guard verbose logging - only in DEBUG mode
        debugLog(env, () => {
          console.log(`[AI Scanner] Enriching book: "${book.title}" by ${book.author || 'unknown'}`)
        })

        const enrichmentResult = await enrichMultipleBooks(
          {
            title: book.title || '',
            author: book.author || '',
          },
          env,
          { maxResults: 20 },
          ctx, // Pass execution context for waitUntil support
        )

        // enrichMultipleBooks returns { works, editions, authors }
        const work = enrichmentResult.works?.[0] || null
        const editions = enrichmentResult.editions || []
        const authors = enrichmentResult.authors || []

        // ISSUE #114: Guard verbose logging - only in DEBUG mode
        debugLog(env, () => {
          console.log(
            `[AI Scanner] ✅ Enrichment ${work ? 'found' : 'not_found'} for "${book.title}": work=${!!work}, editions=${editions.length}, authors=${authors.length}`,
          )
        })

        return {
          ...book,
          enrichment: {
            status: work ? 'success' : 'not_found',
            work,
            editions,
            authors,
            provider: 'alexandria', // enrichMultipleBooks uses Alexandria RPC
            cachedResult: false, // Alexandria handles its own caching internally
          },
        }
      },
      async (completed: number) => {
        // Progress callback - update DO for real-time WebSocket updates
        // Note: `completed` is already 1-indexed from enrichBooksParallel (1, 2, 3...N)
        const enrichmentProgress =
          PROGRESS_STAGES.ENRICHMENT_START +
          (completed / detectedBooks.length) * PROGRESS_STAGES.ENRICHMENT_DELTA

        await doStub.updateProgress('ai_scan', {
          progress: enrichmentProgress,
          status: `Enriching book ${completed} of ${detectedBooks.length}...`,
          processedCount: completed,
          currentItem: detectedBooks[completed - 1]?.title || 'Unknown',
        })
      },
      10, // maxConcurrency
    )

    console.log(`[AI Scanner] Enrichment complete - ${enrichedBooks.length} books enriched`)

    // Categorize books by confidence level
    const categorized = categorizeBooks(enrichedBooks) as CategorizedBooks

    console.log(
      `[AI Scanner] Categorization: ${categorized.high.length} high, ${categorized.medium.length} medium, ${categorized.low.length} low confidence`,
    )

    // Stage 4: Completion (100%)
    const totalTime = Date.now() - startTime

    // ISSUE #133: Store full results in KV to avoid multi-MB WebSocket payloads
    // Build unified books array using standard structure
    const books: BookResult[] = enrichedBooks.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn || null,
      confidence: b.confidence,
      boundingBox: b.boundingBox,
      enrichmentStatus: (b.enrichment?.status as 'success' | 'not_found' | 'error' | undefined) || 'pending',
      coverUrl: b.enrichment?.work?.coverImageURL || null,
      publisher: (b.enrichment?.editions as Array<{ publisher?: string | null }>)?.[0]?.publisher || null,
      publicationYear: (b.enrichment?.editions as Array<{ publicationYear?: number | null }>)?.[0]?.publicationYear || null,
    }))

    // Store complete results in KV with 24-hour expiration
    const resultsKey = `scan-results:${jobId}`
    const fullResults: FullResults = {
      totalDetected: detectedBooks.length,
      approved: categorized.high.length,
      needsReview: categorized.medium.length + categorized.low.length,
      books,
      metadata: {
        modelUsed,
        processingTime: totalTime,
        timestamp: Date.now(),
      },
    }

    await env.CACHE.put(resultsKey, JSON.stringify(fullResults), {
      expirationTtl: getCacheTTL('hot', env), // Use hot TTL (2h) for temporary results
    })

    debugLog(env, () => {
      console.log(
        `[AI Scanner] 💾 Stored full results in KV: ${resultsKey} (${books.length} books)`,
      )
    })

    // Send summary-only completion via WebSocket (avoid large payloads)
    const completionPayload: ScanCompletionPayload = {
      totalDetected: detectedBooks.length,
      approved: categorized.high.length,
      needsReview: categorized.medium.length + categorized.low.length,
      resultsUrl: `/v1/scan/results/${jobId}`, // Client fetches full results via HTTP GET
      metadata: {
        modelUsed,
        processingTime: totalTime,
      },
    }

    debugLog(env, () => {
      console.log(
        `[AI Scanner] 📤 Sending summary-only completion:`,
        JSON.stringify(completionPayload),
      )
    })

    await doStub.complete('ai_scan', completionPayload)

    console.log(
      `[AI Scanner] Scan complete for job ${jobId}: ${detectedBooks.length} books, ${totalTime}ms`,
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown scan error'
    console.error(`[AI Scanner] Job ${jobId} failed:`, error)

    // Send error via Durable Object
    await doStub.sendError('ai_scan', {
      message: errorMessage,
      code: 'AI_SCAN_FAILED',
    })
  }
  // NOTE: No finally block needed! complete() and sendError() handle WebSocket cleanup
}
