/**
 * CacheKeyFactory - Centralized cache key generation service
 *
 * This service provides a single source of truth for all cache key generation
 * across handlers and consumers. It ensures consistency and prevents cache
 * key drift that can lead to cache misses.
 *
 * Benefits:
 * - Single source of truth for cache key patterns
 * - Prevents duplicate logic across handlers and consumers
 * - Easier to update cache strategies (changes in one place)
 * - Reduces risk of cache invalidation bugs
 *
 * Usage:
 *   import { CacheKeyFactory } from '../services/cache-key-factory.js';
 *   const cacheKey = CacheKeyFactory.authorSearch({ query: 'tolkien', sortBy: 'publicationYear' });
 */

/**
 * Author search parameters
 */
export interface AuthorSearchParams {
  query: string
  maxResults?: number
  showAllEditions?: boolean
  sortBy?: string
}

/**
 * Generic cache key parameters
 */
export interface GenericParams {
  [key: string]: string | number | boolean
}

export class CacheKeyFactory {
  /**
   * Normalize text for consistent cache keys
   *
   * Applies Unicode NFC (Canonical Composition) normalization to prevent
   * cache key duplication for Unicode variations of the same text.
   *
   * Example: "café" can be represented as:
   * - Composed: é = U+00E9
   * - Decomposed: e + ́ = U+0065 + U+0301
   *
   * Without normalization, these create different cache keys but represent
   * the same query, leading to cache inefficiency.
   *
   * @param text - Text to normalize
   * @returns Normalized text (NFC, lowercase, trimmed)
   */
  static normalizeText(text: string): string {
    return text.toLowerCase().trim().normalize('NFC')
  }

  /**
   * Generate cache key for author search
   *
   * This matches the pattern used in author-search.js for consistency
   * with existing cached data.
   *
   * @param params - Search parameters
   * @returns Cache key in format: auto-search:{queryB64}:{paramsB64}
   */
  static authorSearch(params: AuthorSearchParams): string {
    const { query, maxResults = 50, showAllEditions = false, sortBy = 'publicationYear' } = params

    // Normalize query (lowercase, trim, Unicode NFC)
    const normalizedQuery = CacheKeyFactory.normalizeText(query)

    // Base64 encode query with URL-safe characters
    const queryB64 = btoa(normalizedQuery).replace(/[/+=]/g, '_')

    // Create params object matching handler logic
    const searchParams = {
      maxResults: maxResults,
      showAllEditions: showAllEditions,
      sortBy: sortBy,
    }

    // Sort params alphabetically for consistency
    const paramsString = Object.keys(searchParams)
      .sort()
      .map((key) => `${key}=${searchParams[key as keyof typeof searchParams]}`)
      .join('&')

    // Base64 encode params with URL-safe characters
    const paramsB64 = btoa(paramsString).replace(/[/+=]/g, '_')

    return `auto-search:${queryB64}:${paramsB64}`
  }

  /**
   * Generate cache key for ISBN book search
   *
   * @param isbn - ISBN-10 or ISBN-13
   * @returns Cache key in format: search:isbn:isbn={normalizedISBN}
   */
  static bookISBN(isbn: string): string {
    // Normalize ISBN by removing hyphens
    const normalizedISBN = isbn.replace(/-/g, '')
    return `search:isbn:isbn=${normalizedISBN}`
  }

  /**
   * Generate cache key for title search
   *
   * @param title - Book title
   * @param maxResults - Maximum results to return (default: 20)
   * @returns Cache key in format: search:title:maxresults={n}&title={normalizedTitle}
   */
  static bookTitle(title: string, maxResults = 20): string {
    // Normalize title (lowercase, trim, Unicode NFC)
    const normalizedTitle = CacheKeyFactory.normalizeText(title)

    // Use alphabetically sorted params for consistency
    return `search:title:maxresults=${maxResults}&title=${normalizedTitle}`
  }

  /**
   * Generate cache key for cover images
   *
   * @param isbn - ISBN identifier
   * @returns Cache key in format: cover:{normalizedISBN}
   */
  static coverImage(isbn: string): string {
    const normalizedISBN = isbn.replace(/-/g, '')
    return `cover:${normalizedISBN}`
  }

  /**
   * Generate a generic cache key with sorted parameters
   *
   * This is a utility method for handlers that need custom cache keys
   * but still want consistent parameter ordering.
   *
   * @param prefix - Cache key prefix (e.g., 'search:title')
   * @param params - Key-value pairs to include in cache key
   * @returns Generated cache key in format: {prefix}:{param1}={value1}&{param2}={value2}
   */
  static generic(prefix: string, params: GenericParams): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')
    return `${prefix}:${sortedParams}`
  }
}
