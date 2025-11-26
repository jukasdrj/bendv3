// src/config/cache.ts

// Define the types of cache TTLs we will manage.
export type CacheType = 'isbn' | 'title' | 'author' | 'enrichment' | 'cover' | 'hot' | 'cold' | 'default';

// Define the structure for environment variables to make it type-safe.
export interface CacheEnv {
  CACHE_TTL_ISBN?: string;
  CACHE_TTL_TITLE?: string;
  CACHE_TTL_AUTHOR?: string;
  CACHE_TTL_ENRICHMENT?: string;
  CACHE_TTL_COVER?: string;
  CACHE_TTL_HOT?: string;
  CACHE_TTL_COLD?: string;
}

/**
 * Centralized cache configuration management.
 * Provides a single source of truth for all cache TTLs, configurable via environment variables.
 */
export class CacheConfig {
  /**
   * Retrieves the TTL for a specific cache type.
   *
   * @param type The type of cache TTL to retrieve.
   * @param env The environment object containing TTL configurations.
   * @returns The TTL value in seconds.
   */
  static getTTL(type: CacheType, env: CacheEnv): number {
    const ttls: { [key in CacheType]: number } = {
      isbn: parseInt(env.CACHE_TTL_ISBN || '31536000'),       // 365 days
      title: parseInt(env.CACHE_TTL_TITLE || '604800'),       // 7 days
      author: parseInt(env.CACHE_TTL_AUTHOR || '604800'),      // 7 days
      enrichment: parseInt(env.CACHE_TTL_ENRICHMENT || '15552000'), // 180 days
      cover: parseInt(env.CACHE_TTL_COVER || '31536000'),      // 365 days
      hot: parseInt(env.CACHE_TTL_HOT || '7200'),           // 2 hours
      cold: parseInt(env.CACHE_TTL_COLD || '1209600'),        // 14 days
      default: parseInt(env.CACHE_TTL_TITLE || '604800'),   // Default to title TTL
    };

    return ttls[type] || ttls.default;
  }
}
