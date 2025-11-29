/**
 * Author Expansion Harvest Handler
 *
 * Automated harvest using ISBNdb batch API and author search.
 * Processes 25 popular authors to expand cache with complete bibliographies.
 *
 * Flow:
 * 1. Load 25 curated authors from config
 * 2. For each author, search ISBNdb directly (up to 1000 books/author)
 * 3. Use batch API to fetch metadata for up to 1000 ISBNs at once
 * 4. Warm production cache via lenient ISBN search
 *
 * Benefits over manual expansion:
 * - Uses ISBNdb's native author search (more reliable than OpenLibrary)
 * - Batch API reduces from 1000 requests to 1 request per author
 * - Direct access to ISBNdb's complete catalog (not limited by Google Books)
 *
 * Scheduled: Daily 3 AM UTC via cron
 */

import { ISBNdbAPI } from '../services/isbndb-api.js'
import { getTopAuthors } from '../config/popular-authors.js'

/**
 * Execute author expansion harvest
 * @param {Object} env - Cloudflare environment bindings
 * @param {number} authorCount - Number of authors to process (default: 25)
 * @param {number} booksPerAuthor - Max books per author (default: 200)
 * @returns {Promise<{success: boolean, stats: Object}>}
 */
export async function executeAuthorExpansionHarvest(env, authorCount = 25, booksPerAuthor = 200) {
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

        // Step 3c: ISBNdb provides full metadata in search results, no need for batch call
        // Books already have covers, titles, authors from the search
        // We can directly warm the cache

        // Step 3d: Warm production cache (batch of 50 at a time to avoid overload)
        const CACHE_BATCH_SIZE = 50
        let authorNewlyCached = 0
        let authorAlreadyCached = 0

        for (let j = 0; j < isbns.length; j += CACHE_BATCH_SIZE) {
          const batch = isbns.slice(j, j + CACHE_BATCH_SIZE)

          for (const isbn of batch) {
            try {
              const cacheResult = await warmCacheSingle(isbn, env)
              stats.cacheWarmingCalls++

              if (cacheResult.cached) {
                authorAlreadyCached++
                stats.alreadyCached++
              } else {
                authorNewlyCached++
                stats.newlyCached++
              }

              // Rate limiting: 3 req/sec (Premium plan)
              await new Promise(resolve => setTimeout(resolve, 333))
            } catch (error) {
              console.warn(`   ⚠️  Cache warming failed for ${isbn}:`, error.message)
            }
          }

          // Progress update every batch
          const processed = Math.min(j + CACHE_BATCH_SIZE, isbns.length)
          console.log(`   📦 Cache warming: ${processed}/${isbns.length} (${authorNewlyCached} new, ${authorAlreadyCached} cached)`)
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
 * Warm cache for a single ISBN via production API
 * @param {string} isbn - ISBN to warm
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<{success: boolean, cached: boolean}>}
 */
async function warmCacheSingle(isbn, env) {
  // Use internal handler directly to avoid HTTP overhead
  const { handleSearchISBN } = await import('./v1/search-isbn.ts')

  try {
    // Create minimal request object for strict ISBN validation (Issue #139)
    const mockRequest = {
      url: `https://api.oooefam.net/v1/search/isbn?isbn=${isbn}`
    }

    const response = await handleSearchISBN(isbn, env, mockRequest)
    const data = await response.json()

    // Log invalid ISBNs for monitoring (Issue #139)
    if (response.status === 400 && data.error?.code === 'INVALID_ISBN') {
      console.warn(`[ISBN Validation] Invalid ISBN rejected: ${isbn} (checksum failed)`)
      stats.errors.push({ isbn, error: 'Invalid ISBN checksum' })
      return { success: false, cached: false, invalidISBN: true }
    }

    return {
      success: response.status === 200 && data.data,
      cached: data.metadata?.cached || false
    }
  } catch (error) {
    console.error(`warmCacheSingle failed for ${isbn}:`, error.message)
    return { success: false, cached: false }
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
