/**
 * CACHE PURGE SCRIPT - Nuclear Option for Old Pre-Alexandria Cache
 *
 * PURPOSE: Clear ALL book/cover cache to force Alexandria integration
 * RISK LEVEL: LOW (no user data, just metadata cache)
 * IMPACT: All subsequent lookups will be fresh through Alexandria
 *
 * Run with: npx wrangler dev src/scripts/purge-cache.js
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Safety check - require confirm=yes query param
    if (url.searchParams.get('confirm') !== 'yes') {
      return new Response(
        JSON.stringify({
          error: 'Safety check failed',
          message: 'Add ?confirm=yes to run cache purge',
          warning: 'This will delete ALL book/cover cache entries',
          readyToExecute: false,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const stats = {
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

      return new Response(
        JSON.stringify(
          {
            success: true,
            message: 'Cache purge completed successfully',
            stats: stats,
            nextSteps: [
              'Test fresh ISBN lookups',
              'Verify Alexandria URLs in responses',
              'Monitor cache warming from real requests',
            ],
          },
          null,
          2,
        ),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      )
    } catch (error) {
      stats.errors.push(error.message)

      return new Response(
        JSON.stringify(
          {
            success: false,
            error: error.message,
            stack: error.stack,
            stats: stats,
          },
          null,
          2,
        ),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  },
}

/**
 * Purge all keys matching a prefix pattern
 */
async function purgePattern(kv, prefix, stats) {
  console.log(`🔍 Scanning for pattern: ${prefix}*`)

  const patternStats = {
    pattern: prefix,
    found: 0,
    deleted: 0,
  }

  let cursor
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
        console.error(`   ❌ Failed to delete ${key.name}:`, err)
        stats.errors.push(`Delete failed: ${key.name} - ${err.message}`)
      }
    }

    // Check if there are more keys
    hasMore = !listResult.list_complete
    cursor = listResult.cursor
  }

  console.log(`   ✅ Pattern ${prefix}* complete: ${patternStats.deleted} deleted`)
  stats.patterns.push(patternStats)
}
