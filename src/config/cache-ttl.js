/**
 * Centralized Cache TTL Configuration
 *
 * Single source of truth for all cache TTL values across the application.
 * Values can be overridden via environment variables for flexibility.
 *
 * Hot/Cold Strategy:
 * - Hot TTL: Short-lived cache for effectiveness tracking (2h default)
 * - Cold TTL: Actual KV expiration time (14d default)
 *
 * Content-specific TTLs:
 * - ISBN: 365 days (ISBN metadata never changes)
 * - Title: 7 days (new editions occasionally)
 * - Author: 7 days (new books occasionally)
 * - Enrichment: 180 days (very stable metadata)
 * - Cover: 365 days (cover images don't change)
 */

/**
 * Default TTL values in seconds
 */
export const DEFAULT_TTL = {
  // Hot/Cold Strategy (used by cache-service.js and external-apis.ts)
  hot: 2 * 60 * 60,           // 2 hours
  cold: 14 * 24 * 60 * 60,    // 14 days

  // Content-specific TTLs (used by kv-cache.js)
  isbn: 365 * 24 * 60 * 60,       // 365 days (ISBN metadata never changes)
  title: 7 * 24 * 60 * 60,        // 7 days (new editions occasionally)
  author: 7 * 24 * 60 * 60,       // 7 days (new books occasionally)
  enrichment: 180 * 24 * 60 * 60, // 180 days (very stable metadata)
  cover: 365 * 24 * 60 * 60,      // 365 days (cover images don't change)
};

/**
 * Get TTL value for a specific cache type
 *
 * @param {string} type - Cache type ('hot', 'cold', 'isbn', 'title', 'author', 'enrichment', 'cover')
 * @param {Object} env - Worker environment bindings
 * @returns {number} TTL in seconds
 */
export function getCacheTTL(type, env = {}) {
  const envVarMap = {
    hot: 'CACHE_HOT_TTL',
    cold: 'CACHE_COLD_TTL',
    isbn: 'CACHE_TTL_ISBN',
    title: 'CACHE_TTL_TITLE',
    author: 'CACHE_TTL_AUTHOR',
    enrichment: 'CACHE_TTL_ENRICHMENT',
    cover: 'CACHE_TTL_COVER',
  };

  const envVar = envVarMap[type];
  if (envVar && env[envVar]) {
    const parsed = parseInt(env[envVar], 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_TTL[type] || DEFAULT_TTL.cold;
}

/**
 * Get all TTL values as an object (useful for initializing services)
 *
 * @param {Object} env - Worker environment bindings
 * @returns {Object} Object with all TTL values
 */
export function getAllCacheTTLs(env = {}) {
  return {
    hot: getCacheTTL('hot', env),
    cold: getCacheTTL('cold', env),
    isbn: getCacheTTL('isbn', env),
    title: getCacheTTL('title', env),
    author: getCacheTTL('author', env),
    enrichment: getCacheTTL('enrichment', env),
    cover: getCacheTTL('cover', env),
  };
}
