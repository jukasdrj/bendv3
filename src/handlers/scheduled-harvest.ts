/**
 * Scheduled Harvest Handler
 *
 * Triggers Alexandria to harvest covers from ISBNdb for editions that are missing them.
 * Uses the highly efficient batch endpoint (1000 ISBNs per API call).
 *
 * Schedule: Hourly (0 * * * *)
 * Throughput: 1000 ISBNs/hour = 24,000/day (well within 15k API call quota)
 */

import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types'
import { createAlexandriaClient } from '../services/alexandria-client'
import type { Env } from '../types/env'

/**
 * Harvest result statistics
 */
interface HarvestResult {
  queried: number
  found_in_isbndb: number
  editions_updated: number
  covers_queued: number
  duration_ms: number
}

/**
 * Handles scheduled cover harvest from Alexandria
 *
 * This handler is triggered hourly by Cloudflare Cron to harvest book covers
 * from ISBNdb for editions that are missing metadata. It calls Alexandria's
 * batch harvest endpoint which processes 1000 ISBNs per request.
 *
 * @param event - The scheduled event trigger
 * @param env - Worker environment bindings
 * @param ctx - Execution context (for additional lifecycle control)
 * @returns Promise that resolves when harvest completes
 *
 * @throws Never throws - errors are caught and logged
 */
export async function handleScheduledHarvest(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📚 STARTING HOURLY COVER HARVEST')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const client = createAlexandriaClient(env)

  try {
    // Call Alexandria's /api/harvest/covers endpoint
    // batch_size: 1000 (Max efficiency for ISBNdb Premium)
    // queue_covers: true (Download and store in R2)
    const response = await client.api.harvest.covers.$post({
      json: {
        batch_size: 1000,
        offset: 0, // Always start from 0 (process newest missing covers first)
        queue_covers: true,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Harvest] Alexandria error: ${response.status} ${errorText}`)
      throw new Error(`Alexandria harvest failed: ${response.status}`)
    }

    const result: HarvestResult = await response.json()

    console.log('[Harvest] Result:', {
      queried: result.queried,
      found: result.found_in_isbndb,
      updated: result.editions_updated,
      queued: result.covers_queued,
      duration: `${result.duration_ms}ms`,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Harvest] Fatal error:', errorMessage)
  }
}
