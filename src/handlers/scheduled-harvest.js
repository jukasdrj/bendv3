/**
 * Scheduled Harvest Handler
 *
 * Triggers Alexandria to harvest covers from ISBNdb for editions that are missing them.
 * Uses the highly efficient batch endpoint (1000 ISBNs per API call).
 *
 * Schedule: Hourly (0 * * * *)
 * Throughput: 1000 ISBNs/hour = 24,000/day (well within 15k API call quota)
 *
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Object>} Harvest result stats
 */
import { createAlexandriaClient } from '../services/alexandria-client'

export async function handleScheduledHarvest(env) {
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

    const result = await response.json()

    console.log('[Harvest] Result:', {
      queried: result.queried,
      found: result.found_in_isbndb,
      updated: result.editions_updated,
      queued: result.covers_queued,
      duration: `${result.duration_ms}ms`,
    })

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error('[Harvest] Fatal error:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
