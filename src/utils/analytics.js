/**
 * Analytics Engine utilities for cache metrics
 *
 * Standardized functions for writing cache metrics to Analytics Engine.
 * Used by search endpoints to track ISBN lookups, cache hits/misses, and performance.
 */

/**
 * Write cache metrics to Analytics Engine
 *
 * @param {Object} env - Worker environment bindings (must include CACHE_ANALYTICS)
 * @param {Object} metrics - Metrics to write
 * @param {string} metrics.endpoint - API endpoint path (e.g., '/search/isbn')
 * @param {string} [metrics.isbn] - ISBN value (for ISBN searches only)
 * @param {boolean} metrics.cacheHit - Whether request was served from cache
 * @param {number} metrics.responseTime - Response time in milliseconds
 * @param {string} metrics.imageQuality - Image quality tier (e.g., 'HIGH', 'MEDIUM')
 * @param {number} metrics.dataCompleteness - Data completeness percentage (0-100)
 * @param {number} metrics.itemCount - Number of items returned
 *
 * @example
 * // ISBN search (logs actual ISBN for daily harvest)
 * await writeCacheMetrics(env, {
 *   endpoint: '/search/isbn',
 *   isbn: '9780385529985',
 *   cacheHit: false,
 *   responseTime: 234,
 *   imageQuality: 'HIGH',
 *   dataCompleteness: 85,
 *   itemCount: 1
 * });
 *
 * @example
 * // Title search (logs endpoint + quality)
 * await writeCacheMetrics(env, {
 *   endpoint: '/search/title',
 *   cacheHit: true,
 *   responseTime: 5,
 *   imageQuality: 'MEDIUM',
 *   dataCompleteness: 78,
 *   itemCount: 15
 * });
 */
export async function writeCacheMetrics(env, metrics) {
  if (!env.CACHE_ANALYTICS) {
    console.warn('CACHE_ANALYTICS binding not available')
    return
  }

  try {
    // For ISBN searches, log the actual ISBN value for daily harvest
    // Analytics harvest script expects: blob1=<isbn_number>, blob2='isbn_search', index1='google-books-isbn'
    // For other searches, log endpoint and image quality (legacy format)
    const blobs = metrics.isbn
      ? [metrics.isbn, 'isbn_search'] // blob1=<isbn_number>, blob2='isbn_search'
      : [metrics.endpoint, metrics.imageQuality]

    // Analytics Engine supports maximum of 1 index per data point
    // For ISBN searches, use 'google-books-isbn' as primary index for query filtering
    // For other searches, use cache hit/miss status as index
    // Note: Cache hit status is still available in blobs array for all searches
    const indexes = metrics.isbn
      ? ['google-books-isbn'] // Primary index for ISBN search filtering
      : [metrics.cacheHit ? 'HIT' : 'MISS'] // Cache status for non-ISBN searches

    await env.CACHE_ANALYTICS.writeDataPoint({
      blobs,
      doubles: [metrics.responseTime, metrics.dataCompleteness, metrics.itemCount],
      indexes,
    })
  } catch (error) {
    console.error('Failed to write cache metrics:', error)
    // TODO: Add error tracking metric (env.ANALYTICS_ERRORS.increment())
    // Don't throw - would break search requests. Silent failure acceptable for analytics.
  }
}

/**
 * Track request metrics to Analytics Engine for performance monitoring
 *
 * @param {Object} env - Worker environment bindings (must include PERFORMANCE_ANALYTICS)
 * @param {string} endpoint - API endpoint path (e.g., '/v1/search/title')
 * @param {number} statusCode - HTTP status code
 * @param {number} processingTime - Request processing time in milliseconds
 * @param {string} errorCode - Error code if request failed (optional)
 * @param {string} cacheStatus - Cache status: HIT, MISS, BYPASS (optional)
 */
export function trackRequestMetrics(
  env,
  endpoint,
  statusCode,
  processingTime,
  errorCode = null,
  cacheStatus = 'MISS',
) {
  try {
    if (!env.PERFORMANCE_ANALYTICS) return

    env.PERFORMANCE_ANALYTICS.writeDataPoint({
      blobs: [endpoint, errorCode || 'N/A', cacheStatus],
      doubles: [statusCode, processingTime],
      indexes: [endpoint], // For efficient querying by endpoint
    })
  } catch (error) {
    console.error('[Analytics] Failed to track metrics:', error)
  }
}

/**
 * Add analytics headers to response for debugging
 *
 * @param {Response} response - Original response
 * @param {number} startTime - Request start timestamp
 * @param {string} cacheStatus - Cache status (HIT, MISS, BYPASS)
 * @param {string} errorCode - Error code if applicable
 * @returns {Response} Response with added headers
 */
export function addAnalyticsHeaders(response, startTime, cacheStatus = 'MISS', errorCode = null) {
  const processingTime = Date.now() - startTime
  const headers = new Headers(response.headers)

  headers.set('X-Response-Time', `${processingTime}ms`)
  headers.set('X-Cache-Status', cacheStatus)

  if (errorCode) {
    headers.set('X-Error-Code', errorCode)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
