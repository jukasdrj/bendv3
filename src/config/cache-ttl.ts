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

import type { Env } from '../types/env.js'

/**
 * Cache type identifiers
 */
export type CacheType = 'hot' | 'cold' | 'isbn' | 'title' | 'author' | 'enrichment' | 'cover'

/**
 * Cache TTL configuration object
 */
export interface CacheTTLConfig {
  hot: number
  cold: number
  isbn: number
  title: number
  author: number
  enrichment: number
  cover: number
}

/**
 * Default TTL values in seconds
 */
export const DEFAULT_TTL: CacheTTLConfig = {
  // Hot/Cold Strategy (used by cache-service.js and external-apis.ts)
  hot: 2 * 60 * 60, // 2 hours
  cold: 14 * 24 * 60 * 60, // 14 days

  // Content-specific TTLs (used by kv-cache.js)
  isbn: 365 * 24 * 60 * 60, // 365 days (ISBN metadata never changes)
  title: 7 * 24 * 60 * 60, // 7 days (new editions occasionally)
  author: 7 * 24 * 60 * 60, // 7 days (new books occasionally)
  enrichment: 180 * 24 * 60 * 60, // 180 days (very stable metadata)
  cover: 365 * 24 * 60 * 60, // 365 days (cover images don't change)
}

/**
 * Get TTL value for a specific cache type
 *
 * @param type - Cache type ('hot', 'cold', 'isbn', 'title', 'author', 'enrichment', 'cover')
 * @param env - Worker environment bindings
 * @returns TTL in seconds
 */
export function getCacheTTL(type: CacheType, env: Partial<Env> = {}): number {
  const envVarMap: Record<CacheType, keyof Env> = {
    hot: 'CACHE_HOT_TTL',
    cold: 'CACHE_COLD_TTL',
    isbn: 'CACHE_TTL_ISBN',
    title: 'CACHE_TTL_TITLE',
    author: 'CACHE_TTL_AUTHOR',
    enrichment: 'CACHE_TTL_ENRICHMENT',
    cover: 'CACHE_TTL_COVER',
  }

  const envVar = envVarMap[type]
  if (envVar && env[envVar]) {
    const value = env[envVar]
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed
      }
    } else if (typeof value === 'number' && value > 0) {
      return value
    }
  }

  return DEFAULT_TTL[type] || DEFAULT_TTL.cold
}

/**
 * Get all TTL values as an object (useful for initializing services)
 *
 * @param env - Worker environment bindings
 * @returns Object with all TTL values
 */
export function getAllCacheTTLs(env: Partial<Env> = {}): CacheTTLConfig {
  return {
    hot: getCacheTTL('hot', env),
    cold: getCacheTTL('cold', env),
    isbn: getCacheTTL('isbn', env),
    title: getCacheTTL('title', env),
    author: getCacheTTL('author', env),
    enrichment: getCacheTTL('enrichment', env),
    cover: getCacheTTL('cover', env),
  }
}
