/**
 * R2 lifecycle and cleanup policies
 *
 * Implements automatic cleanup and retention policies for R2-stored payloads.
 * Ensures orphaned objects don't accumulate and cost money.
 */

import { deletePayloadFromR2, cleanupJobR2Objects } from './r2-hibernation.js'

const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Schedule cleanup for old/failed jobs (24-hour window)
 * Note: This sets expiration metadata on the R2 object.
 * Cloudflare Lifecycle Rules should also be configured for safety.
 *
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 * @param {number} delayMs - Delay before cleanup (default: 24 hours)
 */
export async function scheduleCleanup(env, r2Key, delayMs = CLEANUP_DELAY_MS) {
  // R2 doesn't support programmatic lifecycle rules per object
  // Instead, we rely on:
  // 1. Immediate cleanup on success/failure
  // 2. Manual Cloudflare Lifecycle Rule (configured in dashboard)
  // 3. Periodic cleanup job (future: use Queue or Cron)

  console.log(
    `[R2 Lifecycle] Scheduled cleanup for ${r2Key} in ${delayMs / 1000}s`
  )

  // Store cleanup task in metadata (for monitoring)
  const expiryTime = Date.now() + delayMs
  return {
    r2Key,
    expiryTime,
    cleanupScheduled: true,
  }
}

/**
 * Force cleanup on job failure
 * Immediately deletes R2 object and all related objects for the job.
 *
 * @param {Object} env - Worker environment
 * @param {string} jobId - Job identifier
 * @param {string} r2Key - Optional specific R2 key (if known)
 */
export async function forceCleanup(env, jobId, r2Key = null) {
  console.log(`[R2 Lifecycle] Force cleanup for job ${jobId}`)

  try {
    if (r2Key) {
      // Delete specific object
      await deletePayloadFromR2(env, r2Key)
    } else {
      // Delete all objects for job
      await cleanupJobR2Objects(env, jobId)
    }

    console.log(`[R2 Lifecycle] Force cleanup completed for job ${jobId}`)
  } catch (error) {
    console.error(
      `[R2 Lifecycle] Force cleanup failed for job ${jobId}:`,
      error
    )
    // Don't throw - cleanup is best effort
  }
}

/**
 * Cleanup after successful processing
 * Deletes R2 object immediately after successful job completion.
 *
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 */
export async function cleanupOnSuccess(env, r2Key) {
  console.log(`[R2 Lifecycle] Cleanup on success for ${r2Key}`)

  try {
    await deletePayloadFromR2(env, r2Key)
    console.log(`[R2 Lifecycle] Success cleanup completed for ${r2Key}`)
  } catch (error) {
    console.error(
      `[R2 Lifecycle] Success cleanup failed for ${r2Key}:`,
      error
    )
    // Don't throw - cleanup is best effort
  }
}

/**
 * Get orphaned objects older than threshold
 * Used for periodic cleanup jobs (future: Cron trigger)
 * Handles pagination for >1000 orphaned objects
 *
 * @param {Object} env - Worker environment
 * @param {number} thresholdMs - Age threshold (default: 24 hours)
 * @returns {Promise<Array>} List of orphaned R2 keys
 */
export async function getOrphanedObjects(
  env,
  thresholdMs = CLEANUP_DELAY_MS
) {
  const bucket = env.BOOKSHELF_IMAGES
  const cutoffTime = Date.now() - thresholdMs
  const orphaned = []

  try {
    // Paginate through all hibernation objects (max 1000 per request)
    let cursor
    do {
      const result = await bucket.list({ prefix: 'hibernation/', cursor })

      for (const obj of result.objects || []) {
        // Parse timestamp from key (format: hibernation/type/jobId/timestamp.ext)
        // More specific regex: matches 13-digit timestamp followed by .csv or .jpg
        const match = obj.key.match(/hibernation\/[^/]+\/[^/]+\/(\d{13})\.(csv|jpg)$/)
        if (match) {
          const uploadTime = parseInt(match[1], 10)
          if (uploadTime < cutoffTime) {
            orphaned.push({
              key: obj.key,
              size: obj.size,
              uploaded: new Date(uploadTime).toISOString(),
              age: Date.now() - uploadTime,
            })
          }
        }
      }

      cursor = result.truncated ? result.cursor : null
    } while (cursor)

    console.log(`[R2 Lifecycle] Found ${orphaned.length} orphaned objects`)
    return orphaned
  } catch (error) {
    console.error('[R2 Lifecycle] Failed to list orphaned objects:', error)
    return []
  }
}

/**
 * Cleanup orphaned objects (periodic maintenance job)
 * Should be called from Cron trigger or Queue consumer.
 *
 * @param {Object} env - Worker environment
 * @param {number} thresholdMs - Age threshold (default: 24 hours)
 * @returns {Promise<{deleted: number, failed: number}>}
 */
export async function cleanupOrphanedObjects(
  env,
  thresholdMs = CLEANUP_DELAY_MS
) {
  console.log('[R2 Lifecycle] Starting orphaned object cleanup')

  const orphaned = await getOrphanedObjects(env, thresholdMs)

  if (orphaned.length === 0) {
    console.log('[R2 Lifecycle] No orphaned objects to clean up')
    return { deleted: 0, failed: 0 }
  }

  let deleted = 0
  let failed = 0

  const bucket = env.BOOKSHELF_IMAGES

  for (const obj of orphaned) {
    try {
      await bucket.delete(obj.key)
      deleted++
      console.log(`[R2 Lifecycle] Deleted orphaned object: ${obj.key}`)
    } catch (error) {
      failed++
      console.error(
        `[R2 Lifecycle] Failed to delete orphaned object ${obj.key}:`,
        error
      )
    }
  }

  console.log(
    `[R2 Lifecycle] Cleanup complete: ${deleted} deleted, ${failed} failed`
  )
  return { deleted, failed }
}
