/**
 * @deprecated ISBNdb harvest now replaced by Alexandria integration (2025-12-03)
 *
 * Author Expansion Harvest Handler - DEPRECATED
 *
 * This handler has been disabled during Alexandria Phase 2 rollout.
 * Alexandria now provides:
 * - 49.3M+ ISBNs at zero API cost (vs ISBNdb's 5000/day limit)
 * - Sub-100ms response times (vs ISBNdb's 300-500ms)
 * - Real-time cover processing via alexandria-cover-service.ts
 *
 * Migration Status:
 * - Phase 1 (Complete): Alexandria ISBN lookup primary
 * - Phase 2 (Complete): Alexandria cover processing replaces ISBNdb harvest
 * - Phase 3 (Pending): Alexandria title/author search
 *
 * This file will be removed after March 2026 sunset.
 *
 * @see src/services/alexandria-api.ts for new implementation
 * @see src/services/alexandria-cover-service.ts for cover processing
 * @see docs/CACHE_ARCHITECTURE.md for updated architecture
 */

import { ISBNdbAPI } from '../services/isbndb-api.js'
import { getTopAuthors } from '../config/popular-authors.js'
import { writeISBNdbBooksToCache } from '../services/cache-direct-write.ts'

/**
 * Execute author expansion harvest
 * @param {Object} env - Cloudflare environment bindings
 * @param {number} authorCount - Number of authors to process (default: 25)
 * @param {number} booksPerAuthor - Max books per author (default: 200)
 * @returns {Promise<{success: boolean, stats: Object}>}
 */
export async function executeAuthorExpansionHarvest(env, authorCount = 25, booksPerAuthor = 200) {
  // DEPRECATED: Return early with deprecation notice
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("⚠️  DEPRECATED: author-expansion-harvest.js")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("")
  console.log("This harvest has been disabled as of 2025-12-03.")
  console.log("Book metadata now provided by Alexandria (49M+ ISBNs, zero cost).")
  console.log("Cover processing handled by alexandria-cover-service.ts")
  console.log("")
  console.log("Benefits of Alexandria:")
  console.log("  ✅ 49.3M+ ISBNs at zero API cost")
  console.log("  ✅ Sub-100ms response times")
  console.log("  ✅ No daily quota limits (vs ISBNdb 5000/day)")
  console.log("  ✅ Real-time processing, no batch jobs needed")
  console.log("")
  console.log("This file will be removed after March 2026 sunset.")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

  return {
    success: true,
    deprecated: true,
    disabledDate: "2025-12-03",
    message: "ISBNdb harvest disabled - using Alexandria real-time processing",
    stats: {
      authorsProcessed: 0,
      authorsFailed: 0,
      totalBooksDiscovered: 0,
      totalISBNsHarvested: 0,
      isbndbBatchCalls: 0,
      cacheWarmingCalls: 0,
      newlyCached: 0,
      alreadyCached: 0,
      errors: []
    }
  }

  // Original implementation below (preserved for reference, unreachable)
  const startTime = Date.now()

  const stats = {
    authorsProcessed: 0,
    authorsFailed: 0,
    totalBooksDiscovered: 0,
    totalISBNsHarvested: 0,
    isbndbBatchCalls: 0,
    cacheWarmingCalls: 0,
    newlyCached: 0,
    alreadyCached: 0,
    errors: []
  }

  console.log('🚀 Author Expansion Harvest Started')
  console.log('='.repeat(60))
  console.log(`Authors to process: ${authorCount}`)
  console.log(`Max books per author: ${booksPerAuthor}`)
  console.log('')

  try {
    // Step 1: Load curated authors
    const authors = getTopAuthors(authorCount)
    console.log(`📚 Loaded ${authors.length} curated authors`)
    console.log('')

    // Step 2: Initialize ISBNdb API
    if (!env.ISBNDB_API_KEY) {
      throw new Error('ISBNDB_API_KEY not configured')
    }

    const isbndb = new ISBNdbAPI(env.ISBNDB_API_KEY)

    // Step 3: Process each author
    for (let i = 0; i < authors.length; i++) {
      const authorName = authors[i]
      console.log(`[${i + 1}/${authors.length}] Processing: ${authorName}`)

      try {
        // Step 3a: Search ISBNdb for all books by this author
        const searchResult = await isbndb.searchByAuthor(authorName, 1, booksPerAuthor)

        if (searchResult.total === 0) {
          console.log(`   ⊗ No books found in ISBNdb`)
          stats.authorsFailed++
          continue
        }

        console.log(`   ✓ Found ${searchResult.books.length} books (total: ${searchResult.total})`)
        stats.totalBooksDiscovered += searchResult.books.length

        // Step 3b: Extract ISBNs
        const isbns = searchResult.books
          .map(book => book.isbn)
          .filter(isbn => isbn && /^\d{10,13}$/.test(isbn))

        if (isbns.length === 0) {
          console.log(`   ⊗ No valid ISBNs found`)
          stats.authorsFailed++
          continue
        }

        console.log(`   ✓ Extracted ${isbns.length} ISBNs`)
        stats.totalISBNsHarvested += isbns.length

        // Step 3c: Write ISBNdb metadata directly to cache (Issue #140)
        // No need to call Google Books/OpenLibrary - ISBNdb provides full metadata
        console.log(`   📝 Writing ISBNdb metadata directly to cache...`)

        const writeResults = await writeISBNdbBooksToCache(searchResult.books, env)

        const authorNewlyCached = writeResults.filter(r => r.success && !r.cached).length
        const authorAlreadyCached = writeResults.filter(r => r.success && r.cached).length
        const authorFailed = writeResults.filter(r => !r.success).length

        stats.newlyCached += authorNewlyCached
        stats.alreadyCached += authorAlreadyCached
        stats.cacheWarmingCalls += writeResults.length

        if (authorFailed > 0) {
          console.warn(`   ⚠️  ${authorFailed} books failed to cache`)
        }

        console.log(`   ✅ ${authorName}: ${authorNewlyCached} newly cached, ${authorAlreadyCached} already cached`)
        stats.authorsProcessed++

      } catch (error) {
        console.error(`   ❌ ${authorName} failed:`, error.message)
        stats.authorsFailed++
        stats.errors.push({ author: authorName, error: error.message })
      }

      console.log('')

      // Safety check: Stop if we've used too many API calls (5000/day limit)
      if (stats.cacheWarmingCalls >= 4500) {
        console.warn('⚠️  Approaching daily ISBNdb quota limit (4500/5000), stopping early')
        break
      }
    }

    // Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('='.repeat(60))
    console.log('🎉 Author Expansion Harvest Complete!')
    console.log('')
    console.log('📊 Final Stats:')
    console.log(`   Authors processed: ${stats.authorsProcessed}/${authors.length}`)
    console.log(`   Authors failed: ${stats.authorsFailed}`)
    console.log(`   Books discovered: ${stats.totalBooksDiscovered}`)
    console.log(`   ISBNs harvested: ${stats.totalISBNsHarvested}`)
    console.log(`   Newly cached: ${stats.newlyCached}`)
    console.log(`   Already cached: ${stats.alreadyCached}`)
    console.log(`   Cache warming calls: ${stats.cacheWarmingCalls}`)
    console.log(`   Duration: ${duration}s`)
    console.log('')

    if (stats.errors.length > 0) {
      console.log(`❌ Errors (${stats.errors.length}):`)
      stats.errors.slice(0, 5).forEach(({ author, error }) => {
        console.log(`   - ${author}: ${error}`)
      })
      if (stats.errors.length > 5) {
        console.log(`   ... and ${stats.errors.length - 5} more`)
      }
      console.log('')
    }

    console.log('='.repeat(60))

    return { success: true, stats }

  } catch (error) {
    console.error('💥 Fatal error in author expansion harvest:', error)
    return {
      success: false,
      error: error.message,
      stats
    }
  }
}

/**
 * Manual trigger for testing (exported for scripts)
 * @param {Object} env - Cloudflare environment bindings
 */
export async function manualTrigger(env) {
  console.log('🔧 Manual Author Expansion Harvest Trigger')
  console.log('')

  const result = await executeAuthorExpansionHarvest(env, 25, 200)

  if (result.success) {
    console.log('✅ Harvest completed successfully')
  } else {
    console.error('❌ Harvest failed:', result.error)
  }

  return result
}
