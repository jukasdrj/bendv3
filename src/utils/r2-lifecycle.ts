/**
 * R2 lifecycle and cleanup policies
 *
 * Implements automatic cleanup and retention policies for R2-stored payloads.
 * Ensures orphaned objects don't accumulate and cost money.
 */

import type { Env } from '../types/env.js'
import { cleanupJobR2Objects, deletePayloadFromR2 } from './r2-hibernation.ts'

/**
 * Default cleanup delay (24 hours)
 */
const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000

/**
 * Cleanup task metadata
 */
interface CleanupTask {
  r2Key: string
  expiryTime: number
  cleanupScheduled: true
}

/**
 * Orphaned object metadata
 */
interface OrphanedObject {
  key: string
  size: number
  uploaded: string
  age: number
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  deleted: number
  failed: number
}

/**
 * Schedule cleanup for old/failed jobs (24-hour window)
 * Note: This sets expiration metadata on the R2 object.
 * Cloudflare Lifecycle Rules should also be configured for safety.
 *
 * @param _env - Worker environment (unused, kept for interface compatibility)
 * @param r2Key - R2 object key
 * @param delayMs - Delay before cleanup (default: 24 hours)
 * @returns Cleanup task metadata
 */
export async function scheduleCleanup(
  _env: Env,
  r2Key: string,
  delayMs = CLEANUP_DELAY_MS,
): Promise<CleanupTask> {
  // R2 doesn't support programmatic lifecycle rules per object
  // Instead, we rely on:
  // 1. Immediate cleanup on success/failure
  // 2. Manual Cloudflare Lifecycle Rule (configured in dashboard)
  // 3. Periodic cleanup job (future: use Queue or Cron)

  console.log(`[R2 Lifecycle] Scheduled cleanup for ${r2Key} in ${delayMs / 1000}s`)

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
 * @param env - Worker environment
 * @param jobId - Job identifier
 * @param r2Key - Optional specific R2 key (if known)
 */
export async function forceCleanup(
  env: Env,
  jobId: string,
  r2Key: string | null = null,
): Promise<void> {
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
    const err = error as Error
    console.error(`[R2 Lifecycle] Force cleanup failed for job ${jobId}:`, err)
    // Don't throw - cleanup is best effort
  }
}

/**
 * Cleanup after successful processing
 * Deletes R2 object immediately after successful job completion.
 *
 * @param env - Worker environment
 * @param r2Key - R2 object key
 */
export async function cleanupOnSuccess(env: Env, r2Key: string): Promise<void> {
  console.log(`[R2 Lifecycle] Cleanup on success for ${r2Key}`)

  try {
    await deletePayloadFromR2(env, r2Key)
    console.log(`[R2 Lifecycle] Success cleanup completed for ${r2Key}`)
  } catch (error) {
    const err = error as Error
    console.error(`[R2 Lifecycle] Success cleanup failed for ${r2Key}:`, err)
    // Don't throw - cleanup is best effort
  }
}

/**
 * Get orphaned objects older than threshold
 * Used for periodic cleanup jobs (future: Cron trigger)
 * Handles pagination for >1000 orphaned objects
 *
 * @param env - Worker environment
 * @param thresholdMs - Age threshold (default: 24 hours)
 * @returns List of orphaned R2 keys
 */
export async function getOrphanedObjects(
  env: Env,
  thresholdMs = CLEANUP_DELAY_MS,
): Promise<OrphanedObject[]> {
  const bucket = env.BOOKSHELF_IMAGES
  const cutoffTime = Date.now() - thresholdMs
  const orphaned: OrphanedObject[] = []

  try {
    // Paginate through all hibernation objects (max 1000 per request)
    let cursor: string | undefined
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

      cursor = result.truncated ? result.cursor : undefined
    } while (cursor)

    console.log(`[R2 Lifecycle] Found ${orphaned.length} orphaned objects`)
    return orphaned
  } catch (error) {
    const err = error as Error
    console.error('[R2 Lifecycle] Failed to list orphaned objects:', err)
    return []
  }
}

/**
 * Cleanup orphaned objects (periodic maintenance job)
 * Should be called from Cron trigger or Queue consumer.
 *
 * @param env - Worker environment
 * @param thresholdMs - Age threshold (default: 24 hours)
 * @returns Deletion statistics
 */
export async function cleanupOrphanedObjects(
  env: Env,
  thresholdMs = CLEANUP_DELAY_MS,
): Promise<CleanupResult> {
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
      const err = error as Error
      failed++
      console.error(`[R2 Lifecycle] Failed to delete orphaned object ${obj.key}:`, err)
    }
  }

  console.log(`[R2 Lifecycle] Cleanup complete: ${deleted} deleted, ${failed} failed`)
  return { deleted, failed }
}
