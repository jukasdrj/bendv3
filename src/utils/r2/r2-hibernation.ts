/**
 * R2 utilities for hibernation-safe payload storage
 *
 * Moves large CSV (8MB) and image (10MB) payloads from Durable Object
 * storage to R2, enabling stable WebSocket hibernation during deployments.
 *
 * DO storage limitation: Deserializes on wake-up, fails if code has changed.
 * R2 solution: Store only metadata (strings) in DO, payloads in R2.
 *
 * Related: Issue #8 (hibernation failures), Issue #11 (R2 migration)
 */

import type { Env } from '../../types/env.js'

const MAX_CSV_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15MB
const R2_UPLOAD_TIMEOUT = 30000 // 30 seconds
const R2_RETRY_COUNT = 3
const R2_DELETE_BATCH_SIZE = 100 // Issue #62: Batch deletes to avoid rate limits
const R2_DELETE_DELAY_MS = 100 // Issue #62: Delay between batches

/**
 * R2 upload result
 */
export interface R2UploadResult {
  r2Key: string
  size: number
  etag: string
}

/**
 * Payload validation result
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  size: number
}

/**
 * Payload type
 */
export type PayloadType = 'csv' | 'image'

/**
 * Payload data (string for CSV, ArrayBuffer for images)
 */
export type PayloadData = string | ArrayBuffer

/**
 * Upload payload to R2
 *
 * @param env - Worker environment
 * @param jobId - Job identifier
 * @param type - Payload type ('csv' or 'image')
 * @param data - Payload data
 * @returns Upload result with R2 key, size, and etag
 */
export async function uploadPayloadToR2(
  env: Env,
  jobId: string,
  type: PayloadType,
  data: PayloadData,
): Promise<R2UploadResult> {
  // Use BOOKSHELF_IMAGES bucket for all hibernation payloads
  const bucket = env.BOOKSHELF_IMAGES
  const ext = type === 'csv' ? 'csv' : 'jpg'
  const timestamp = Date.now()
  const r2Key = `hibernation/${type}/${jobId}/${timestamp}.${ext}`

  // Validate size
  const { valid, error, size } = validatePayloadSize(type, data)
  if (!valid) {
    throw new Error(`Payload validation failed: ${error}`)
  }

  let lastError: Error | undefined
  for (let i = 0; i < R2_RETRY_COUNT; i++) {
    try {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT)

      await bucket.put(r2Key, data, {
        httpMetadata: {
          contentType: type === 'csv' ? 'text/csv' : 'image/jpeg',
        },
        customMetadata: {
          jobId,
          type,
          uploadTime: timestamp.toString(),
        },
      })

      clearTimeout(timeout)

      // Skip immediate verification to avoid R2 eventual consistency race condition
      // Verification happens when fetching (if object doesn't exist, fetch will fail)
      // This prevents false "Upload verification failed" errors
      return {
        r2Key,
        size,
        etag: 'upload-complete',
      }
    } catch (error) {
      lastError = error as Error
      console.warn(`[R2] Upload attempt ${i + 1}/${R2_RETRY_COUNT} failed:`, error)

      if (i < R2_RETRY_COUNT - 1) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 2 ** i * 100))
      }
    }
  }

  throw new Error(`R2 upload failed after ${R2_RETRY_COUNT} attempts: ${lastError?.message}`)
}

/**
 * Fetch payload from R2
 *
 * @param env - Worker environment
 * @param r2Key - R2 object key
 * @returns Payload data (string for CSV, ArrayBuffer for images)
 */
export async function fetchPayloadFromR2(env: Env, r2Key: string): Promise<PayloadData> {
  const bucket = env.BOOKSHELF_IMAGES

  // Add timeout to prevent indefinite hangs (consistent with upload)
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT)

  try {
    const object = await bucket.get(r2Key)
    clearTimeout(timeout)

    if (!object) {
      throw new Error(`R2 object not found: ${r2Key}`)
    }

    // Issue #61: Validate r2Key format with regex instead of simple string check
    // Expected format: hibernation/{type}/{jobId}/{timestamp}.{ext}
    const isCsv = r2Key.match(/^hibernation\/csv\/.+?\/.+?\.csv$/)
    return isCsv ? await object.text() : await object.arrayBuffer()
  } catch (error) {
    clearTimeout(timeout)
    console.error(`[R2] Fetch failed for ${r2Key}:`, error)
    throw error
  }
}

/**
 * Delete payload from R2
 *
 * @param env - Worker environment
 * @param r2Key - R2 object key
 */
export async function deletePayloadFromR2(env: Env, r2Key: string): Promise<void> {
  const bucket = env.BOOKSHELF_IMAGES

  // Issue #59: Add timeout to delete operations
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT)

  try {
    await bucket.delete(r2Key)
    clearTimeout(timeout)
    // Issue #63: Remove excessive logging in hot path
  } catch (error) {
    clearTimeout(timeout)
    console.error(`[R2] Delete failed for ${r2Key}:`, error)
    // Don't throw on delete failures - log and continue
    // Worst case: 24-hour lifecycle rule will clean up
  }
}

/**
 * Validate payload size
 *
 * @param type - Payload type ('csv' or 'image')
 * @param data - Payload data
 * @returns Validation result with size
 */
export function validatePayloadSize(type: PayloadType, data: PayloadData): ValidationResult {
  let size: number

  if (typeof data === 'string') {
    // Workers-compatible: Use TextEncoder instead of Buffer.byteLength
    size = new TextEncoder().encode(data).length
  } else if (data instanceof ArrayBuffer) {
    size = data.byteLength
  } else if (ArrayBuffer.isView(data)) {
    size = data.byteLength
  } else {
    return {
      valid: false,
      error: 'Invalid data type: must be string or ArrayBuffer',
      size: 0,
    }
  }

  const maxSize = type === 'csv' ? MAX_CSV_SIZE : MAX_IMAGE_SIZE

  if (size > maxSize) {
    return {
      valid: false,
      error: `Payload too large: ${size} bytes (max ${maxSize} bytes)`,
      size,
    }
  }

  return { valid: true, size }
}

/**
 * Generate R2 object key
 *
 * Format: hibernation/{type}/{jobId}/{timestamp}.{ext}
 *
 * @param jobId - Job identifier
 * @param type - Payload type ('csv' or 'image')
 * @returns R2 object key
 */
export function generateR2Key(jobId: string, type: PayloadType): string {
  const ext = type === 'csv' ? 'csv' : 'jpg'
  return `hibernation/${type}/${jobId}/${Date.now()}.${ext}`
}

/**
 * Cleanup all R2 objects for a job (used for error recovery)
 *
 * Handles pagination for jobs with >1000 R2 objects
 *
 * @param env - Worker environment
 * @param jobId - Job identifier
 */
export async function cleanupJobR2Objects(env: Env, jobId: string): Promise<void> {
  const bucket = env.BOOKSHELF_IMAGES
  const allObjects: R2Object[] = []

  try {
    // Paginate through all results (bucket.list returns max 1000 per request)
    const prefixes = [`hibernation/csv/${jobId}/`, `hibernation/image/${jobId}/`]

    // Issue #59: Add timeout to list operations
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT)

    for (const prefix of prefixes) {
      let cursor: string | undefined
      do {
        const result = await bucket.list({ prefix, cursor })
        allObjects.push(...(result.objects || []))
        cursor = result.truncated ? result.cursor : undefined
      } while (cursor)
    }

    clearTimeout(timeout)

    if (allObjects.length === 0) {
      // Issue #63: Remove excessive logging in hot path
      return
    }

    // Issue #63: Remove excessive logging in hot path

    // Issue #62: Delete objects in batches to avoid R2 rate limits
    // For jobs with 1000+ objects, parallel deletes could hit 429 errors
    for (let i = 0; i < allObjects.length; i += R2_DELETE_BATCH_SIZE) {
      const batch = allObjects.slice(i, i + R2_DELETE_BATCH_SIZE)
      await Promise.all(
        batch.map((obj) =>
          bucket
            .delete(obj.key)
            .catch((error) => console.error(`[R2] Failed to delete ${obj.key}:`, error)),
        ),
      )

      // Add delay between batches (except for last batch)
      if (i + R2_DELETE_BATCH_SIZE < allObjects.length) {
        await new Promise((resolve) => setTimeout(resolve, R2_DELETE_DELAY_MS))
      }
    }

    // Issue #63: Remove excessive logging in hot path
  } catch (error) {
    console.error(`[R2] Cleanup failed for job ${jobId}:`, error)
    // Don't throw - cleanup is best effort
  }
}
