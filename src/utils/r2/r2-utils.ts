/**
 * R2 Utility Functions
 *
 * Provides helper functions for managing Cloudflare R2 storage operations,
 * including batch deletion and cleanup of orphaned objects.
 */

/**
 * Deletes multiple objects from an R2 bucket.
 *
 * This function handles potential errors during deletion gracefully, logging them
 * but not re-throwing, as cleanup is typically a best-effort operation
 * and shouldn't mask the original error that triggered the cleanup.
 *
 * @param bucket - The R2 bucket to delete objects from
 * @param keys - An array of object keys to delete
 * @returns Promise that resolves when deletion attempt is complete
 */
export async function deleteR2Objects(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) {
    console.log('[R2 Cleanup] No objects to clean up')
    return
  }

  console.log(`[R2 Cleanup] Attempting to delete ${keys.length} objects: ${keys.join(', ')}`)

  try {
    // R2's delete method can take an array of keys for batch deletion
    await bucket.delete(keys)
    console.log(`[R2 Cleanup] Successfully deleted ${keys.length} objects`)
  } catch (error) {
    console.error(
      `[R2 Cleanup] Failed to delete objects - may indicate orphaned files:`,
      error,
      `Keys attempted:`,
      keys,
    )
    // Do not re-throw; cleanup failures should not prevent the original error from being handled
  }
}
