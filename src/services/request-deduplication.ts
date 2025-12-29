/**
 * Request Deduplication Service
 *
 * Prevents thundering herd problem when multiple concurrent requests
 * for the same resource (ISBN, title search) trigger external API calls.
 *
 * Implementation:
 * - In-memory Map tracks inflight promises by key
 * - TTL cleanup prevents memory leaks
 * - Promise sharing across concurrent requests
 */

const inflightRequests = new Map<string, Promise<any>>()

/**
 * Deduplicate concurrent requests for the same resource
 *
 * @param key - Unique identifier for the resource (e.g., "isbn:9780439708180")
 * @param fn - Function that fetches the resource
 * @param ttlMs - TTL for cleanup (default 5 seconds)
 * @returns Promise with the resource data
 */
export async function deduplicate<T>(key: string, fn: () => Promise<T>, ttlMs = 5000): Promise<T> {
  // Return existing promise if request is already inflight
  if (inflightRequests.has(key)) {
    console.log(`[RequestDedup] 🔄 Deduplicating request for key: ${key}`)
    return inflightRequests.get(key)!
  }

  console.log(`[RequestDedup] 🆕 New request for key: ${key}`)

  // Create new promise and track it
  const promise = fn().finally(() => {
    // Cleanup after TTL to prevent memory leaks
    setTimeout(() => {
      inflightRequests.delete(key)
      console.log(`[RequestDedup] 🗑️ Cleaned up key: ${key}`)
    }, ttlMs)
  })

  inflightRequests.set(key, promise)
  return promise
}

/**
 * Get current number of inflight requests (for monitoring)
 */
export function getInflightCount(): number {
  return inflightRequests.size
}

/**
 * Clear all inflight requests (for testing)
 */
export function clearInflightRequests(): void {
  inflightRequests.clear()
}

/**
 * Generate standard cache keys for common operations
 */
export const CacheKeys = {
  isbn: (isbn: string) => `isbn:${isbn}`,
  titleSearch: (title: string, author?: string) =>
    `title:${title}${author ? `:author:${author}` : ''}`,
  authorSearch: (authorName: string) => `author:${authorName}`,
} as const
