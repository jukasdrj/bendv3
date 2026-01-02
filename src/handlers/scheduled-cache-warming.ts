/**
 * Scheduled Cache Warming Handler (Day 5: Background Cache Refresh)
 *
 * Runs every hour (cron: 0 * * * *) to warm cache for popular books.
 * Reduces cold cache misses and API costs by proactively refreshing
 * the most accessed books in the last 24 hours.
 *
 * Dual Strategy:
 * 1. Static List (Phase 1): Top 100 popular ISBNs from config/popular-books.js
 *    - Classic literature, bestsellers, popular series (Harry Potter, etc.)
 *    - Refreshed every 6 hours (cron: 0 star-slash-6 star star star)
 * 2. Analytics-Driven (Phase 2): Most accessed books from access tracking
 *    - List access keys from CACHE (access:book:isbn:star pattern)
 *    - Sort by access count (descending)
 *    - Fetch top 100 books with >10 accesses/day
 *    - Refreshed hourly (cron: 0 star star star star)
 *
 * Rate limiting: 5 req/sec to avoid API quota issues
 *
 * Cron Schedule:
 * - Every hour at :00 - Analytics-driven warm-up
 * - Every 6 hours - Static popular books warm-up
 *
 * Duration: ~5-30 seconds (depends on number of popular books)
 * Cost: ~400 API calls/day (static) + ~100 API calls/day (analytics) = ~500/day
 */

import { getPopularISBNs } from '../config/popular-books.ts'
import { findBookByISBN } from '../services/book-service.ts'
import type { Env } from '../types/env'

interface AccessData {
  cacheKey: string
  count: number
  lastAccess: number
}

interface WarmingStats {
  total: number
  warmed: number
  alreadyCached?: number
  skipped?: number
  errors: number
  duration: number
}

interface WarmingResult {
  success: boolean
  stats: WarmingStats
  error?: string
}

interface CacheWarmingResults {
  static: WarmingResult | null
  analytics: WarmingResult | null
  totalDuration: number
}

interface CacheWarmingOptions {
  staticOnly?: boolean
}

/**
 * Get top accessed cache keys from last 24 hours
 */
async function getPopularCacheKeys(env: Env, limit = 100): Promise<string[]> {
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
          const data = await env.CACHE.get<AccessData>(key.name, 'json')
          // Extract cache key by removing 'access:' prefix
          const cacheKey = key.name.replace('access:', '')
          return { cacheKey, ...(data || { count: 0, lastAccess: 0 }) }
        } catch (error) {
          console.warn(`Failed to read access key ${key.name}:`, (error as Error).message)
          return null
        }
      }),
    )

    // Filter out nulls and books with low access counts
    const validData = accessData.filter(
      (d): d is AccessData => d !== null && d.count > 10, // Only books with >10 accesses/day
    )

    // Sort by access count descending
    const sorted = validData.sort((a, b) => b.count - a.count)

    // Return top N cache keys
    const result = sorted.slice(0, limit).map((d) => d.cacheKey)
    console.log(
      `Found ${result.length} popular books to warm (out of ${validData.length} with >10 accesses)`,
    )

    return result
  } catch (error) {
    console.error('Failed to get popular cache keys:', (error as Error).message)
    return []
  }
}

/**
 * Warm static popular books from config/popular-books.js
 */
async function warmStaticPopularBooks(env: Env): Promise<WarmingResult> {
  const startTime = Date.now()
  console.log('📚 Warming static popular books from config...')

  const stats: WarmingStats = {
    total: 0,
    warmed: 0,
    alreadyCached: 0,
    errors: 0,
    duration: 0,
  }

  try {
    const popularISBNs = getPopularISBNs()
    stats.total = popularISBNs.length
    console.log(`Found ${stats.total} popular ISBNs in config`)

    // Warm each popular book (rate limited)
    for (const isbn of popularISBNs) {
      try {
        // Check if already cached to avoid unnecessary API calls
        const cacheKey = `book:isbn:${isbn}`
        const cached = await env.CACHE.get(cacheKey)

        if (cached) {
          stats.alreadyCached!++
          // Still refresh to extend TTL
          await findBookByISBN(isbn, env)
          stats.warmed++
        } else {
          // Cache miss - fetch from external APIs
          await findBookByISBN(isbn, env)
          stats.warmed++
        }

        // Rate limit: 5 req/sec = 200ms between requests
        await new Promise((r) => setTimeout(r, 200))
      } catch (error) {
        console.error(`Failed to warm static popular book ${isbn}:`, (error as Error).message)
        stats.errors++
      }
    }

    stats.duration = Date.now() - startTime
    console.log(
      `✅ Static popular books warming complete: ${stats.warmed}/${stats.total} warmed (${stats.alreadyCached} already cached), ${stats.errors} errors in ${stats.duration}ms`,
    )

    return { success: true, stats }
  } catch (error) {
    console.error('❌ Static popular books warming failed:', (error as Error).message)
    stats.duration = Date.now() - startTime
    return { success: false, error: (error as Error).message, stats }
  }
}

/**
 * Warm analytics-driven popular books from access tracking
 */
async function warmAnalyticsDrivenBooks(env: Env): Promise<WarmingResult> {
  const startTime = Date.now()
  console.log('📊 Warming analytics-driven popular books...')

  const stats: WarmingStats = {
    total: 0,
    warmed: 0,
    skipped: 0,
    errors: 0,
    duration: 0,
  }

  try {
    // Get popular cache keys (sorted by access count)
    const popularKeys = await getPopularCacheKeys(env, 100)
    stats.total = popularKeys.length

    if (stats.total === 0) {
      console.log('No analytics-driven popular books found, skipping')
      stats.duration = Date.now() - startTime
      return { success: true, stats }
    }

    console.log(`🔄 Warming ${stats.total} analytics-driven popular books...`)

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
          stats.skipped!++
          console.warn(`Skipped invalid cache key format: ${cacheKey}`)
        }
      } catch (error) {
        console.error(`Failed to warm analytics book ${cacheKey}:`, (error as Error).message)
        stats.errors++
      }
    }

    stats.duration = Date.now() - startTime
    console.log(
      `✅ Analytics-driven warming complete: ${stats.warmed}/${stats.total} warmed, ${stats.errors} errors in ${stats.duration}ms`,
    )

    return { success: true, stats }
  } catch (error) {
    console.error('❌ Analytics-driven warming failed:', (error as Error).message)
    stats.duration = Date.now() - startTime
    return { success: false, error: (error as Error).message, stats }
  }
}

/**
 * Main handler for scheduled cache warming
 * Supports both static popular books and analytics-driven warming
 */
export async function handleScheduledCacheWarming(
  env: Env,
  _ctx: ExecutionContext,
  options: CacheWarmingOptions = {},
): Promise<{ success: boolean; results: CacheWarmingResults; error?: string }> {
  const startTime = Date.now()
  const { staticOnly = false } = options

  console.log(`🔥 Starting scheduled cache warming (${staticOnly ? 'static only' : 'full'})...`)

  const results: CacheWarmingResults = {
    static: null,
    analytics: null,
    totalDuration: 0,
  }

  try {
    if (staticOnly) {
      // Only warm static popular books (runs every 6 hours)
      results.static = await warmStaticPopularBooks(env)
    } else {
      // Full warming: both static and analytics (runs every hour)
      results.static = await warmStaticPopularBooks(env)
      results.analytics = await warmAnalyticsDrivenBooks(env)
    }

    results.totalDuration = Date.now() - startTime

    const totalWarmed =
      (results.static?.stats?.warmed || 0) + (results.analytics?.stats?.warmed || 0)
    const totalErrors =
      (results.static?.stats?.errors || 0) + (results.analytics?.stats?.errors || 0)

    console.log(
      `✅ Overall cache warming complete: ${totalWarmed} books warmed, ${totalErrors} errors in ${results.totalDuration}ms`,
    )

    return { success: true, results }
  } catch (error) {
    console.error('❌ Cache warming failed:', (error as Error).message)
    results.totalDuration = Date.now() - startTime
    return { success: false, error: (error as Error).message, results }
  }
}
