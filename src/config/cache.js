/**
 * Centralized Cache TTL Configuration
 *
 * Single source of truth for all cache TTL values.
 * Supports environment variable overrides for flexible deployment.
 *
 * TTL Strategy:
 * - ISBN: 365 days (never changes)
 * - Title: 7 days (new editions occasionally)
 * - Author: 7 days (new books periodically)
 * - Enrichment: 180 days (metadata very stable)
 * - Cover: 365 days (images rarely change)
 * - Hot: 2 hours (for hot/cold strategy)
 * - Cold: 14 days (for hot/cold strategy)
 */

/**
 * Get TTL value from environment or use default
 * @param {Object} env - Worker environment bindings
 * @param {string} key - Environment variable key
 * @param {number} defaultValue - Default TTL in seconds
 * @returns {number} TTL in seconds
 */
function getTTLFromEnv(env, key, defaultValue) {
  if (!env || !env[key]) {
    return defaultValue
  }

  const value = parseInt(env[key], 10)
  if (isNaN(value) || value < 0) {
    console.warn(`Invalid TTL value for ${key}: ${env[key]}, using default: ${defaultValue}`)
    return defaultValue
  }

  return value
}

/**
 * Default TTL values (in seconds)
 */
export const DEFAULT_CACHE_TTL = {
  isbn: 365 * 24 * 60 * 60, // 31536000 seconds = 365 days
  title: 7 * 24 * 60 * 60, // 604800 seconds = 7 days
  author: 7 * 24 * 60 * 60, // 604800 seconds = 7 days
  enrichment: 180 * 24 * 60 * 60, // 15552000 seconds = 180 days
  cover: 365 * 24 * 60 * 60, // 31536000 seconds = 365 days
  hot: 2 * 60 * 60, // 7200 seconds = 2 hours
  cold: 14 * 24 * 60 * 60, // 1209600 seconds = 14 days
}

/**
 * Cache configuration service
 */
export class CacheConfig {
  /**
   * Get TTL for a specific cache type
   * @param {string} type - Cache type ('isbn', 'title', 'author', 'enrichment', 'cover', 'hot', 'cold')
   * @param {Object} env - Worker environment bindings (optional)
   * @returns {number} TTL in seconds
   */
  static getTTL(type, env = null) {
    const envKey = `CACHE_TTL_${type.toUpperCase()}`
    const defaultValue = DEFAULT_CACHE_TTL[type] || DEFAULT_CACHE_TTL.title

    if (!env) {
      return defaultValue
    }

    return getTTLFromEnv(env, envKey, defaultValue)
  }

  /**
   * Get all TTL values as an object
   * @param {Object} env - Worker environment bindings (optional)
   * @returns {Object} Object with all TTL values
   */
  static getAllTTLs(env = null) {
    const types = Object.keys(DEFAULT_CACHE_TTL)
    const ttls = {}

    for (const type of types) {
      ttls[type] = CacheConfig.getTTL(type, env)
    }

    return ttls
  }

  /**
   * Get hot TTL (for hot/cold caching strategy)
   * Supports legacy CACHE_HOT_TTL environment variable
   * @param {Object} env - Worker environment bindings (optional)
   * @returns {number} Hot TTL in seconds
   */
  static getHotTTL(env = null) {
    // Support legacy CACHE_HOT_TTL for backward compatibility
    if (env && env.CACHE_HOT_TTL) {
      return getTTLFromEnv(env, 'CACHE_HOT_TTL', DEFAULT_CACHE_TTL.hot)
    }
    return CacheConfig.getTTL('hot', env)
  }

  /**
   * Get cold TTL (for hot/cold caching strategy)
   * Supports legacy CACHE_COLD_TTL environment variable
   * @param {Object} env - Worker environment bindings (optional)
   * @returns {number} Cold TTL in seconds
   */
  static getColdTTL(env = null) {
    // Support legacy CACHE_COLD_TTL for backward compatibility
    if (env && env.CACHE_COLD_TTL) {
      return getTTLFromEnv(env, 'CACHE_COLD_TTL', DEFAULT_CACHE_TTL.cold)
    }
    return CacheConfig.getTTL('cold', env)
  }
}
