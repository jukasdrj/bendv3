/**
 * CACHE PURGE SCRIPT - Nuclear Option for Old Pre-Alexandria Cache
 *
 * PURPOSE: Clear ALL book/cover cache to force Alexandria integration
 * RISK LEVEL: LOW (no user data, just metadata cache)
 * IMPACT: All subsequent lookups will be fresh through Alexandria
 *
 * Run with: npx wrangler dev src/scripts/purge-cache.ts
 */

import type { Env } from '../types/env'

/**
 * Purge statistics
 */
interface PurgeStats {
  startTime: number
  endTime?: number
  duration?: number
  keysScanned: number
  keysDeleted: number
  patterns: PatternStats[]
  errors: string[]
}

/**
 * Pattern-specific statistics
 */
interface PatternStats {
  pattern: string
  found: number
  deleted: number
}

/**
 * Success response format
 */
interface SuccessResponse {
  success: true
  message: string
  stats: PurgeStats
  nextSteps: string[]
}

/**
 * Error response format
 */
interface ErrorResponse {
  success: false
  error: string
  stack?: string
  stats: PurgeStats
}

/**
 * Safety check response
 */
interface SafetyCheckResponse {
  error: string
  message: string
  warning: string
  readyToExecute: false
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Safety check - require confirm=yes query param
    if (url.searchParams.get('confirm') !== 'yes') {
      const response: SafetyCheckResponse = {
        error: 'Safety check failed',
        message: 'Add ?confirm=yes to run cache purge',
        warning: 'This will delete ALL book/cover cache entries',
        readyToExecute: false,
      }

      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const stats: PurgeStats = {
      startTime: Date.now(),
      keysScanned: 0,
      keysDeleted: 0,
      patterns: [],
      errors: [],
    }

    try {
      console.log('🔥 CACHE PURGE: Starting nuclear option...')

      // Pattern 1: Book ISBN searches (search:isbn:*)
      await purgePattern(env.CACHE, 'search:isbn:', stats)

      // Pattern 2: Cover images (cover:*)
      await purgePattern(env.CACHE, 'cover:', stats)

      // Pattern 3: Title searches (search:title:*)
      await purgePattern(env.CACHE, 'search:title:', stats)

      // Pattern 4: Author searches (auto-search:*)
      await purgePattern(env.CACHE, 'auto-search:', stats)

      stats.endTime = Date.now()
      stats.duration = stats.endTime - stats.startTime

      console.log('✅ CACHE PURGE: Complete!')
      console.log(`   Keys scanned: ${stats.keysScanned}`)
      console.log(`   Keys deleted: ${stats.keysDeleted}`)
      console.log(`   Duration: ${stats.duration}ms`)

      const response: SuccessResponse = {
        success: true,
        message: 'Cache purge completed successfully',
        stats: stats,
        nextSteps: [
          'Test fresh ISBN lookups',
          'Verify Alexandria URLs in responses',
          'Monitor cache warming from real requests',
        ],
      }

      return new Response(JSON.stringify(response, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      const err = error as Error
      stats.errors.push(err.message)

      const response: ErrorResponse = {
        success: false,
        error: err.message,
        stack: err.stack,
        stats: stats,
      }

      return new Response(JSON.stringify(response, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
}

/**
 * Purge all keys matching a prefix pattern
 *
 * @param kv - KV namespace to purge from
 * @param prefix - Key prefix to match
 * @param stats - Statistics object to update
 */
async function purgePattern(kv: KVNamespace, prefix: string, stats: PurgeStats): Promise<void> {
  console.log(`🔍 Scanning for pattern: ${prefix}*`)

  const patternStats: PatternStats = {
    pattern: prefix,
    found: 0,
    deleted: 0,
  }

  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    const listResult = await kv.list({
      prefix: prefix,
      cursor: cursor,
      limit: 1000, // KV list max
    })

    stats.keysScanned += listResult.keys.length
    patternStats.found += listResult.keys.length

    console.log(`   Found ${listResult.keys.length} keys in this batch`)

    // Delete in batches
    for (const key of listResult.keys) {
      try {
        await kv.delete(key.name)
        stats.keysDeleted++
        patternStats.deleted++
      } catch (err) {
        const error = err as Error
        console.error(`   ❌ Failed to delete ${key.name}:`, err)
        stats.errors.push(`Delete failed: ${key.name} - ${error.message}`)
      }
    }

    // Check if there are more keys
    hasMore = !listResult.list_complete
    cursor = listResult.cursor
  }

  console.log(`   ✅ Pattern ${prefix}* complete: ${patternStats.deleted} deleted`)
  stats.patterns.push(patternStats)
}
