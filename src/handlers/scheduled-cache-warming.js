/**
 * Scheduled Cache Warming Handler (Day 5: Background Cache Refresh)
 *
 * Runs every hour (cron: 0 * * * *) to warm cache for popular books.
 * Reduces cold cache misses and API costs by proactively refreshing
 * the most accessed books in the last 24 hours.
 *
 * Strategy:
 * 1. List access keys from CACHE (access:book:isbn:* pattern)
 * 2. Sort by access count (descending)
 * 3. Fetch top 100 books with >10 accesses/day
 * 4. Refresh each via findBookByISBN (updates KV + Edge)
 * 5. Rate limit to 5 req/sec to avoid API quota issues
 *
 * Cron Schedule: 0 * * * * (every hour at :00)
 * Duration: ~5-30 seconds (depends on number of popular books)
 * Cost: ~50-100 API calls/day (1000 warming calls across 24 hours)
 */

import { findBookByISBN } from '../services/book-service.ts'

/**
 * Get top accessed cache keys from last 24 hours
 *
 * @param {Object} env - Cloudflare environment
 * @param {number} limit - Maximum number of keys to return
 * @returns {Promise<string[]>} Array of top cache keys (e.g., 'book:isbn:1234567890')
 */
async function getPopularCacheKeys(env, limit = 100) {
  try {
    // List all access keys (access:book:isbn:xxx format)
    const accessPrefix = 'access:book:isbn:'
    const list = await env.CACHE.list({ prefix: accessPrefix, limit: 500 })

    if (!list || !list.keys || list.keys.length === 0) {
      console.log('No popular books found in access tracking')
      return []
    }

    // Fetch access data for all keys
    const accessData = await Promise.all(
      list.keys.map(async (key) => {
        try {
          const data = await env.CACHE.get(key.name, 'json')
          // Extract cache key by removing 'access:' prefix
          const cacheKey = key.name.replace('access:', '')
          return { cacheKey, ...(data || { count: 0, lastAccess: 0 }) }
        } catch (error) {
          console.warn(`Failed to read access key ${key.name}:`, error.message)
          return null
        }
      })
    )

    // Filter out nulls and books with low access counts
    const validData = accessData.filter(
      (d) => d !== null && d.count > 10 // Only books with >10 accesses/day
    )

    // Sort by access count descending
    const sorted = validData.sort((a, b) => b.count - a.count)

    // Return top N cache keys
    const result = sorted.slice(0, limit).map((d) => d.cacheKey)
    console.log(`Found ${result.length} popular books to warm (out of ${validData.length} with >10 accesses)`)

    return result
  } catch (error) {
    console.error('Failed to get popular cache keys:', error.message)
    return []
  }
}

/**
 * Main handler for scheduled cache warming
 *
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} ctx - Execution context
 * @returns {Promise<Object>} Stats object with warming results
 */
export async function handleScheduledCacheWarming(env, ctx) {
  const startTime = Date.now()
  console.log('🔥 Starting scheduled cache warming...')

  const stats = {
    total: 0,
    warmed: 0,
    skipped: 0,
    errors: 0,
    duration: 0
  }

  try {
    // Get popular cache keys (sorted by access count)
    const popularKeys = await getPopularCacheKeys(env, 100)
    stats.total = popularKeys.length

    if (stats.total === 0) {
      console.log('No popular books to warm, exiting')
      stats.duration = Date.now() - startTime
      return { success: true, stats }
    }

    console.log(`🔄 Warming ${stats.total} popular books...`)

    // Warm each book (rate limited to avoid API quota issues)
    for (const cacheKey of popularKeys) {
      try {
        // Extract ISBN from cache key (book:isbn:1234567890)
        const parts = cacheKey.split(':')
        if (parts[0] === 'book' && parts[1] === 'isbn' && parts.length >= 3) {
          const isbn = parts.slice(2).join(':') // Handle ISBNs with colons (unlikely but safe)

          // This will refresh the cache via findBookByISBN dual-write
          await findBookByISBN(isbn, env)
          stats.warmed++

          // Rate limit: 5 req/sec = 200ms between requests
          await new Promise((r) => setTimeout(r, 200))
        } else {
          stats.skipped++
          console.warn(`Skipped invalid cache key format: ${cacheKey}`)
        }
      } catch (error) {
        console.error(`Failed to warm ${cacheKey}:`, error.message)
        stats.errors++
      }
    }

    stats.duration = Date.now() - startTime
    console.log(
      `✅ Cache warming complete: ${stats.warmed}/${stats.total} warmed, ${stats.errors} errors in ${stats.duration}ms`
    )

    return { success: true, stats }
  } catch (error) {
    console.error('❌ Cache warming failed:', error.message)
    stats.duration = Date.now() - startTime
    return { success: false, error: error.message, stats }
  }
}
