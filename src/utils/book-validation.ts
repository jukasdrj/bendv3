/**
 * Book Validation Utilities
 *
 * Validation functions for book data structures, cache entries, and format detection.
 */

import type { EnrichedBook } from '@bookstrack/schemas'

/**
 * Validates that cached data has the correct V3 EnrichedBook structure.
 *
 * Detects stale cache entries from old nested works/editions/authors format
 * and ensures all required fields are present for the flat V3 schema.
 *
 * @param data - Unknown data from cache
 * @returns Type guard indicating if data is a valid EnrichedBook
 *
 * @example
 * ```typescript
 * const cached = await env.CACHE.get<EnrichedBook>(cacheKey, 'json')
 * if (cached && isValidEnrichedBookCacheEntry(cached)) {
 *   // Safe to use as EnrichedBook
 *   return cached
 * }
 * ```
 */
export function isValidEnrichedBookCacheEntry(data: unknown): data is EnrichedBook {
  if (!data || typeof data !== 'object') return false

  const obj = data as Record<string, unknown>

  // V3 EnrichedBook must have these flat fields (not nested works/editions)
  return (
    typeof obj.isbn === 'string' &&
    typeof obj.title === 'string' &&
    Array.isArray(obj.authors) &&
    typeof obj.provider === 'string' &&
    typeof obj.quality === 'number' && // Required by EnrichedBook
    'vectorized' in obj && // Required for cache hit condition
    !('works' in obj) && // Reject old nested format
    !('editions' in obj) // Reject old nested format
  )
}
