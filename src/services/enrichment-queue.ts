/**
 * Enrichment Queue Producer
 *
 * Sends enrichment requests to Alexandria queue for background processing.
 * Enables async book enrichment without blocking user requests.
 *
 * Queue: alexandria-enrichment-queue
 * Consumer: Alexandria worker (processes enrichment requests)
 *
 * @see Cover & Queue Architecture Implementation Plan (Dec 3, 2025)
 */

import type { EnrichmentSource } from '../types/enums.js'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Enrichment request payload
 */
export interface EnrichmentRequest {
  isbn: string
  work_key?: string
  priority?: 'high' | 'normal' | 'low'
  source?: EnrichmentSource
}

/**
 * Queue send result
 */
export interface QueueResult {
  queued: boolean
  error?: string
}

/**
 * Batch queue result
 */
export interface BatchQueueResult {
  queued: number
  failed: number
  errors?: Array<{ isbn: string; error: string }>
}

/**
 * Environment with queue binding
 */
interface EnrichmentQueueEnv {
  ENRICHMENT_QUEUE?: {
    send: (message: any) => Promise<void>
  }
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Queue single ISBN for background enrichment by Alexandria
 *
 * @param request - Enrichment request
 * @param env - Worker environment with ENRICHMENT_QUEUE binding
 * @returns Queue send result
 *
 * @example
 * // User-triggered enrichment (high priority)
 * await queueEnrichment({
 *   isbn: '9780316769174',
 *   priority: 'high',
 *   source: 'user_add'
 * }, env)
 *
 * @example
 * // Background enrichment (normal priority)
 * await queueEnrichment({
 *   isbn: '9780439708180',
 *   priority: 'normal',
 *   source: 'background'
 * }, env)
 */
export async function queueEnrichment(
  request: EnrichmentRequest,
  env: EnrichmentQueueEnv,
): Promise<QueueResult> {
  try {
    // Validate ISBN
    if (!request.isbn) {
      throw new Error('ISBN is required')
    }

    // Check if queue binding exists
    if (!env.ENRICHMENT_QUEUE) {
      throw new Error('ENRICHMENT_QUEUE binding not found')
    }

    // Build queue message
    const message = {
      isbn: request.isbn,
      work_key: request.work_key,
      priority: request.priority || 'normal',
      source: request.source || 'background',
      queued_at: new Date().toISOString(),
    }

    // Send to queue
    await env.ENRICHMENT_QUEUE.send(message)

    console.log(
      `[EnrichQueue] Queued ${request.isbn} (priority: ${message.priority}, source: ${message.source})`,
    )

    return { queued: true }
  } catch (error: any) {
    console.error('[EnrichQueue] Failed to queue:', error.message)
    return { queued: false, error: error.message }
  }
}

/**
 * Queue multiple ISBNs for background enrichment
 *
 * Sends all ISBNs to the queue with shared options (priority, source).
 * Uses Promise.allSettled for partial success handling.
 *
 * @param isbns - Array of ISBNs to enrich
 * @param options - Shared options for all ISBNs (priority, source, work_key)
 * @param env - Worker environment with ENRICHMENT_QUEUE binding
 * @returns Batch queue result with counts
 *
 * @example
 * // Background batch enrichment
 * const result = await queueEnrichmentBatch(
 *   ['9780316769174', '9780439708180', '9780451524935'],
 *   { priority: 'normal', source: 'background' },
 *   env
 * )
 * console.log(`Queued: ${result.queued}, Failed: ${result.failed}`)
 *
 * @example
 * // High-priority user import
 * const result = await queueEnrichmentBatch(
 *   csvISBNs,
 *   { priority: 'high', source: 'csv_import' },
 *   env
 * )
 */
export async function queueEnrichmentBatch(
  isbns: string[],
  options: Partial<EnrichmentRequest>,
  env: EnrichmentQueueEnv,
): Promise<BatchQueueResult> {
  const errors: Array<{ isbn: string; error: string }> = []

  // Queue all ISBNs in parallel (Promise.allSettled for partial success)
  const results = await Promise.allSettled(
    isbns.map((isbn) =>
      queueEnrichment(
        {
          ...options,
          isbn,
        } as EnrichmentRequest,
        env,
      ),
    ),
  )

  // Count successes and failures
  let queued = 0
  let failed = 0

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.queued) {
      queued++
    } else {
      failed++
      const isbn = isbns[index]
      const error =
        result.status === 'rejected'
          ? result.reason?.message || 'Unknown error'
          : result.value.error || 'Unknown error'
      errors.push({ isbn, error })
    }
  })

  console.log(`[EnrichQueue] Batch complete: ${queued} queued, ${failed} failed`)

  return {
    queued,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  }
}
