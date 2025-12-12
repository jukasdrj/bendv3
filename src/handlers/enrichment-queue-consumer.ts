/**
 * Enrichment Queue Consumer
 *
 * Processes ISBNs from the enrichment queue, fetches metadata from providers,
 * and updates both Alexandria and the user's library (D1/KV) with enriched data.
 *
 * Queue Flow:
 *   CSV Import → BookRepository.save() → ENRICHMENT_QUEUE.send()
 *                     (no cover)                  ↓
 *                              enrichment-queue-consumer (this file)
 *                                              ↓
 *                              enrichMultipleBooks() → Alexandria
 *                                              ↓
 *                              updateLibraryWithCover() → D1/KV (cover URLs)
 *
 * Benefits:
 * - CSV imports remain fast (no enrichment blocking)
 * - Alexandria learns from user imports (eventual consistency)
 * - User library gets cover images after async enrichment
 * - Proper ExecutionContext for waitUntil() operations
 *
 * Related: Fix for cover images not showing after CSV import
 */

import { enrichMultipleBooks } from "../services/enrichment.js"
import { BookRepository } from "../repositories/book-repository.js"
import type { Env } from "../types/env.js"
import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js"
import type { EnrichmentSource } from "../types/enums.js"
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
  source: EnrichmentSource
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
        const work = result.works[0]
        const edition = result.editions?.[0]
        const coverUrl = edition?.coverImageURL || work?.coverImageURL

        console.log(
          `[Enrichment Queue] ✅ Enriched ISBN ${isbn}: ${work.title} (provider: ${work.primaryProvider})`,
        )

        // Update the user's library (D1/KV) with cover URLs
        if (coverUrl) {
          await updateLibraryWithCover(isbn, coverUrl, result, env)
        } else {
          console.log(`[Enrichment Queue] ⚠️ No cover URL found for ISBN ${isbn}`)
        }

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

/**
 * Update user's library (D1/KV) with cover URLs from enrichment
 *
 * This bridges the gap between:
 * 1. CSV import (saves books without covers)
 * 2. Background enrichment (fetches covers from providers)
 *
 * Strategy:
 * - Fetch existing book from library (preserves user data like ratings)
 * - Merge enriched cover URLs into existing record
 * - Save back to D1/KV
 *
 * @param isbn - ISBN to update
 * @param coverUrl - Primary cover URL from enrichment
 * @param enrichmentResult - Full enrichment result with works/editions/authors
 * @param env - Worker environment bindings
 */
async function updateLibraryWithCover(
  isbn: string,
  coverUrl: string,
  enrichmentResult: { works: WorkDTO[]; editions: EditionDTO[]; authors: AuthorDTO[] },
  env: Env,
): Promise<void> {
  try {
    const bookRepo = new BookRepository(env)

    // Fetch existing book to preserve user data (ratings, notes, etc.)
    const existingBook = await bookRepo.findByISBN(isbn)

    if (!existingBook) {
      console.log(`[Enrichment Queue] Book ${isbn} not found in library, skipping cover update`)
      return
    }

    // Check if cover already exists (avoid unnecessary updates)
    if (existingBook.coverSmallUrl || existingBook.coverMediumUrl || existingBook.coverLargeUrl) {
      console.log(`[Enrichment Queue] Book ${isbn} already has cover, skipping update`)
      return
    }

    // Merge enriched data into existing book
    const updatedBook = {
      ...existingBook,
      // Cover URLs (coverUrl already contains edition?.coverImageURL || work?.coverImageURL)
      coverSmallUrl: coverUrl,
      coverMediumUrl: coverUrl,
      coverLargeUrl: coverUrl,
      // Update canonical metadata with enriched data
      // Note: works.length > 0 is guaranteed by caller (line 95)
      canonicalMetadata: {
        ...existingBook.canonicalMetadata,
        works: enrichmentResult.works,
        // Preserve existing metadata if enrichment didn't find editions/authors
        editions: enrichmentResult.editions.length > 0
          ? enrichmentResult.editions
          : existingBook.canonicalMetadata?.editions || [],
        authors: enrichmentResult.authors.length > 0
          ? enrichmentResult.authors
          : existingBook.canonicalMetadata?.authors || [],
      },
      updatedAt: Math.floor(Date.now() / 1000),
    }

    // Save updated book back to D1/KV
    await bookRepo.save(updatedBook)

    console.log(`[Enrichment Queue] 📚 Updated library with cover for ISBN ${isbn}: ${coverUrl.substring(0, 60)}...`)
  } catch (error) {
    // Non-fatal: log but don't fail the enrichment
    console.error(`[Enrichment Queue] ⚠️ Failed to update library for ISBN ${isbn}:`, error)
  }
}
