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

export class CacheKeyFactory {
  /**
   * Generate cache key for author search
   *
   * This matches the pattern used in author-search.js for consistency
   * with existing cached data.
   *
   * @param {Object} params - Search parameters
   * @param {string} params.query - Author name to search
   * @param {number} params.maxResults - Maximum results to return (default: 50)
   * @param {boolean} params.showAllEditions - Whether to show all editions (default: false)
   * @param {string} params.sortBy - Sort order (default: 'publicationYear')
   * @returns {string} Cache key in format: auto-search:{queryB64}:{paramsB64}
   */
  static authorSearch(params) {
    const {
      query,
      maxResults = 50,
      showAllEditions = false,
      sortBy = "publicationYear",
    } = params;

    // Normalize query (lowercase, trim)
    const normalizedQuery = query.toLowerCase().trim();

    // Base64 encode query with URL-safe characters
    const queryB64 = btoa(normalizedQuery).replace(/[/+=]/g, "_");

    // Create params object matching handler logic
    const searchParams = {
      maxResults: maxResults,
      showAllEditions: showAllEditions,
      sortBy: sortBy,
    };

    // Sort params alphabetically for consistency
    const paramsString = Object.keys(searchParams)
      .sort()
      .map((key) => `${key}=${searchParams[key]}`)
      .join("&");

    // Base64 encode params with URL-safe characters
    const paramsB64 = btoa(paramsString).replace(/[/+=]/g, "_");

    return `auto-search:${queryB64}:${paramsB64}`;
  }

  /**
   * Generate cache key for ISBN book search
   *
   * @param {string} isbn - ISBN-10 or ISBN-13
   * @returns {string} Cache key in format: search:isbn:isbn={normalizedISBN}
   */
  static bookISBN(isbn) {
    // Normalize ISBN by removing hyphens
    const normalizedISBN = isbn.replace(/-/g, "");
    return `search:isbn:isbn=${normalizedISBN}`;
  }

  /**
   * Generate cache key for title search
   *
   * @param {string} title - Book title
   * @param {number} maxResults - Maximum results to return (default: 20)
   * @returns {string} Cache key in format: search:title:maxresults={n}&title={normalizedTitle}
   */
  static bookTitle(title, maxResults = 20) {
    // Normalize title (lowercase, trim)
    const normalizedTitle = title.toLowerCase().trim();

    // Use alphabetically sorted params for consistency
    return `search:title:maxresults=${maxResults}&title=${normalizedTitle}`;
  }

  /**
   * Generate cache key for cover images
   *
   * @param {string} isbn - ISBN identifier
   * @returns {string} Cache key in format: cover:{normalizedISBN}
   */
  static coverImage(isbn) {
    const normalizedISBN = isbn.replace(/-/g, "");
    return `cover:${normalizedISBN}`;
  }

  /**
   * Generate a generic cache key with sorted parameters
   *
   * This is a utility method for handlers that need custom cache keys
   * but still want consistent parameter ordering.
   *
   * @param {string} prefix - Cache key prefix (e.g., 'search:title')
   * @param {Object} params - Key-value pairs to include in cache key
   * @returns {string} Generated cache key in format: {prefix}:{param1}={value1}&{param2}={value2}
   */
  static generic(prefix, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return `${prefix}:${sortedParams}`;
  }
}
