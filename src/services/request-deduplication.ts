/**
 * Request Deduplication Service
 *
 * Prevents thundering herd problem when multiple concurrent requests
 * for the same resource (ISBN, title search) trigger external API calls.
 *
 * Implementation:
 * - In-memory Map tracks inflight promises by key
 * - LRU eviction prevents unbounded memory growth
 * - Promise sharing across concurrent requests
 */

const MAX_INFLIGHT_REQUESTS = 1000 // Maximum concurrent deduplicated requests

const inflightRequests = new Map<string, Promise<any>>()

/**
 * Deduplicate concurrent requests for the same resource
 *
 * @param key - Unique identifier for the resource (e.g., "isbn:9780439708180")
 * @param fn - Function that fetches the resource
 * @param ttlMs - TTL for cleanup (default 5 seconds)
 * @returns Promise with the resource data
 */
export async function deduplicate<T>(key: string, fn: () => Promise<T>, _ttlMs = 5000): Promise<T> {
  // Return existing promise if request is already inflight
  if (inflightRequests.has(key)) {
    console.log(`[RequestDedup] 🔄 Deduplicating request for key: ${key}`)
    return inflightRequests.get(key)!
  }

  // LRU eviction: remove oldest entry if max size reached
  if (inflightRequests.size >= MAX_INFLIGHT_REQUESTS) {
    const oldestKey = inflightRequests.keys().next().value
    if (oldestKey) {
      inflightRequests.delete(oldestKey)
      console.warn(
        `[RequestDedup] ⚠️ Evicted oldest key: ${oldestKey} (max size ${MAX_INFLIGHT_REQUESTS} reached)`,
      )
    }
  }

  console.log(
    `[RequestDedup] 🆕 New request for key: ${key} (cache size: ${inflightRequests.size})`,
  )

  // Create new promise and track it
  const promise = fn().finally(() => {
    // Immediate cleanup on completion (no setTimeout to avoid Worker termination issues)
    inflightRequests.delete(key)
    console.log(`[RequestDedup] 🗑️ Cleaned up key: ${key} (cache size: ${inflightRequests.size})`)
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
