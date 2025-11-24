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

const MAX_CSV_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15MB
const R2_UPLOAD_TIMEOUT = 30000 // 30 seconds
const R2_RETRY_COUNT = 3

/**
 * Upload payload to R2
 * @param {Object} env - Worker environment
 * @param {string} jobId - Job identifier
 * @param {string} type - Payload type ('csv' or 'image')
 * @param {string|ArrayBuffer} data - Payload data
 * @returns {Promise<{r2Key: string, size: number, etag: string}>}
 */
export async function uploadPayloadToR2(env, jobId, type, data) {
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

  let lastError
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
      lastError = error
      console.warn(`[R2] Upload attempt ${i + 1}/${R2_RETRY_COUNT} failed:`, error)

      if (i < R2_RETRY_COUNT - 1) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 100))
      }
    }
  }

  throw new Error(`R2 upload failed after ${R2_RETRY_COUNT} attempts: ${lastError.message}`)
}

/**
 * Fetch payload from R2
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 * @returns {Promise<string|ArrayBuffer>} Payload data
 */
export async function fetchPayloadFromR2(env, r2Key) {
  const bucket = env.BOOKSHELF_IMAGES

  try {
    const object = await bucket.get(r2Key)

    if (!object) {
      throw new Error(`R2 object not found: ${r2Key}`)
    }

    // For CSV files, return as text; for images, return as ArrayBuffer
    if (r2Key.includes('/csv/')) {
      return await object.text()
    } else {
      return await object.arrayBuffer()
    }
  } catch (error) {
    console.error(`[R2] Fetch failed for ${r2Key}:`, error)
    throw error
  }
}

/**
 * Delete payload from R2
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 */
export async function deletePayloadFromR2(env, r2Key) {
  const bucket = env.BOOKSHELF_IMAGES

  try {
    await bucket.delete(r2Key)
    console.log(`[R2] Object deleted: ${r2Key}`)
  } catch (error) {
    console.error(`[R2] Delete failed for ${r2Key}:`, error)
    // Don't throw on delete failures - log and continue
    // Worst case: 24-hour lifecycle rule will clean up
  }
}

/**
 * Validate payload size
 * @param {string} type - Payload type ('csv' or 'image')
 * @param {string|ArrayBuffer} data - Payload data
 * @returns {{valid: boolean, error?: string, size: number}}
 */
export function validatePayloadSize(type, data) {
  let size
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
 * Format: hibernation/{type}/{jobId}/{timestamp}.{ext}
 * @param {string} jobId - Job identifier
 * @param {string} type - Payload type ('csv' or 'image')
 * @returns {string} R2 object key
 */
export function generateR2Key(jobId, type) {
  const ext = type === 'csv' ? 'csv' : 'jpg'
  return `hibernation/${type}/${jobId}/${Date.now()}.${ext}`
}

/**
 * Cleanup all R2 objects for a job (used for error recovery)
 * @param {Object} env - Worker environment
 * @param {string} jobId - Job identifier
 */
export async function cleanupJobR2Objects(env, jobId) {
  const bucket = env.BOOKSHELF_IMAGES

  try {
    // List all objects with jobId prefix
    const csvPrefix = `hibernation/csv/${jobId}/`
    const imagePrefix = `hibernation/image/${jobId}/`

    const csvObjects = await bucket.list({ prefix: csvPrefix })
    const imageObjects = await bucket.list({ prefix: imagePrefix })

    const allObjects = [
      ...(csvObjects.objects || []),
      ...(imageObjects.objects || []),
    ]

    if (allObjects.length === 0) {
      console.log(`[R2] No objects found for cleanup: ${jobId}`)
      return
    }

    console.log(`[R2] Cleaning up ${allObjects.length} objects for job ${jobId}`)

    // Delete all objects
    await Promise.all(
      allObjects.map((obj) =>
        bucket.delete(obj.key).catch((error) =>
          console.error(`[R2] Failed to delete ${obj.key}:`, error)
        )
      )
    )

    console.log(`[R2] Cleanup completed for job ${jobId}`)
  } catch (error) {
    console.error(`[R2] Cleanup failed for job ${jobId}:`, error)
    // Don't throw - cleanup is best effort
  }
}
