/**
 * Enrichment Queue Consumer
 *
 * Processes ISBNs from the enrichment queue and writes data to Alexandria.
 * This ensures CSV imports (which bypass the normal enrichment pipeline)
 * still contribute to Alexandria's knowledge base.
 *
 * Queue Flow:
 *   CSV Import → BookRepository.save() → ENRICHMENT_QUEUE.send()
 *                                              ↓
 *                              enrichment-queue-consumer (this file)
 *                                              ↓
 *                              enrichMultipleBooks() → Alexandria
 *
 * Benefits:
 * - CSV imports remain fast (no enrichment blocking)
 * - Alexandria learns from user imports (eventual consistency)
 * - Proper ExecutionContext for waitUntil() operations
 * - User CSV data gets priority in provider chain
 *
 * Related: Issue #XXX - Alexandria doesn't learn from CSV imports
 */

import { enrichMultipleBooks } from "../services/enrichment.js"
import type { Env } from "../types/env.js"
import type {
  MessageBatch,
  ExecutionContext,
} from "@cloudflare/workers-types"

/**
 * Enrichment queue message structure
 */
interface EnrichmentQueueMessage {
  entity_type: "edition" | "work" | "author"
  isbn: string
  source: "csv_import" | "batch_enrichment" | "scan_import"
  priority: number // 1-10, higher = more important
  user_data?: {
    title?: string
    author?: string
    isbn?: string
  }
  timestamp?: string
}

/**
 * Process a batch of enrichment queue messages
 *
 * Called by Cloudflare Workers queue consumer infrastructure.
 * Each message represents an ISBN that needs enrichment and Alexandria write-back.
 *
 * @param batch - Batch of queue messages
 * @param env - Worker environment bindings
 * @param ctx - ExecutionContext with proper waitUntil() support
 */
export async function processEnrichmentBatch(
  batch: MessageBatch<EnrichmentQueueMessage>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  console.log(`[Enrichment Queue] Processing ${batch.messages.length} messages`)

  const startTime = Date.now()
  let successCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const message of batch.messages) {
    const { isbn, source, user_data } = message.body

    // Validate message
    if (!isbn) {
      console.warn(`[Enrichment Queue] Skipping message without ISBN`)
      message.ack()
      skippedCount++
      continue
    }

    try {
      console.log(`[Enrichment Queue] Enriching ISBN ${isbn} from ${source}`)

      // Call enrichment with proper ExecutionContext
      // enrichMultipleBooks already calls storeEnrichmentInAlexandria() internally
      const result = await enrichMultipleBooks(
        { isbn },
        env,
        { maxResults: 1 },
        ctx, // ✅ Has proper ExecutionContext from queue consumer
      )

      if (result.works.length > 0) {
        console.log(
          `[Enrichment Queue] ✅ Enriched ISBN ${isbn}: ${result.works[0].title} (provider: ${result.works[0].primaryProvider})`,
        )
        successCount++
      } else {
        // Book not found in any provider - this is OK, not an error
        console.log(`[Enrichment Queue] ⚠️ No enrichment found for ISBN ${isbn}`)
        successCount++ // Still count as "processed successfully"
      }

      // Acknowledge message (removes from queue)
      message.ack()
    } catch (error) {
      console.error(`[Enrichment Queue] ❌ Failed to enrich ISBN ${isbn}:`, error)

      // Retry logic: message will be requeued if not ack'd
      // After max_retries (configured in wrangler.jsonc), goes to DLQ
      message.retry()
      failedCount++
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[Enrichment Queue] Batch complete in ${duration}ms: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`,
  )

  // Log to analytics if available
  if (env.PERFORMANCE_ANALYTICS) {
    env.PERFORMANCE_ANALYTICS.writeDataPoint({
      blobs: ["enrichment_queue", "batch_processed"],
      doubles: [successCount, failedCount, skippedCount, duration],
      indexes: ["enrichment_queue"],
    })
  }
}
