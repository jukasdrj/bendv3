/**
 * Full Harvest System Dry Run
 *
 * Tests the complete author-driven harvest flow end-to-end without actually
 * harvesting covers or consuming ISBNdb API quota.
 *
 * Flow:
 * 1. Discover popular authors
 * 2. Analyze cache depth
 * 3. Prioritize authors for harvest
 * 4. Expand author bibliographies
 * 5. Collect ISBNs (dry run - no actual harvest)
 */

import { discoverPopularAuthors } from '../src/services/author-discovery.js'
import { prioritizeAuthorsForHarvest } from '../src/services/author-cache-analyzer.js'
import { expandAuthorBibliography } from '../src/services/author-bibliography-expansion.js'

// Mock environment
const mockEnv = {
  CF_ACCOUNT_ID: undefined,
  CF_API_TOKEN: undefined,
  GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY || 'test-key',
  KV_CACHE: {
    async list(options) {
      console.log(`[Mock KV] list() called with prefix: ${options?.prefix || 'none'}`)
      return { keys: [] }
    },
    async get(key) {
      return null
    }
  }
}

async function runDryRun() {
  console.log('='.repeat(60))
  console.log('Full Harvest System - DRY RUN')
  console.log('='.repeat(60))
  console.log('')
  console.log('⚠️  This is a DRY RUN - no actual covers will be harvested')
  console.log('⚠️  ISBNdb API will NOT be called')
  console.log('')

  const DAILY_QUOTA = 5000
  const allISBNs = new Set()

  console.log('🌾 Starting Author-Driven Harvest with Cache Depth Checking...')
  console.log('')

  // Step 1: Discover popular authors
  console.log('📊 Step 1: Discover Popular Authors')
  console.log('-'.repeat(60))

  const popularAuthors = await discoverPopularAuthors(mockEnv, { maxAuthors: 100 })
  console.log(`✅ Discovered ${popularAuthors.length} popular authors`)
  console.log('')

  // Step 2: Prioritize authors by cache depth
  console.log('🔍 Step 2: Analyze Cache Depth & Prioritize')
  console.log('-'.repeat(60))

  const authorsToHarvest = await prioritizeAuthorsForHarvest(
    popularAuthors.map(a => a.name),
    mockEnv,
    {
      coverageThreshold: 50,
      maxAuthors: 10 // Limit to 10 for testing (full run would be 50)
    }
  )

  console.log(`✅ Prioritized ${authorsToHarvest.length} authors for harvest`)
  console.log('')

  // Step 3: Allocate quota
  console.log('📦 Step 3: Quota Allocation')
  console.log('-'.repeat(60))

  const quotaPerAuthor = Math.floor(DAILY_QUOTA / authorsToHarvest.length)
  const maxWorksPerAuthor = Math.floor(quotaPerAuthor / 3)

  console.log(`Total quota: ${DAILY_QUOTA} ISBNs/day`)
  console.log(`Authors to process: ${authorsToHarvest.length}`)
  console.log(`ISBNs per author: ${quotaPerAuthor}`)
  console.log(`Works per author: ${maxWorksPerAuthor}`)
  console.log('')

  // Step 4: Expand bibliographies (dry run - limit to 3 authors)
  console.log('📚 Step 4: Expand Author Bibliographies (Dry Run)')
  console.log('-'.repeat(60))
  console.log('⚠️  Limited to 3 authors for testing')
  console.log('')

  const TEST_AUTHORS_LIMIT = 3
  const authorsToTest = authorsToHarvest.slice(0, TEST_AUTHORS_LIMIT)

  for (const author of authorsToTest) {
    console.log(`Processing: ${author.name} (${author.estimatedCoverage}% cached)`)

    try {
      const result = await expandAuthorBibliography(author.name, mockEnv, {
        maxWorks: 5, // Limit to 5 works for testing
        editionsPerWork: 2,
        minPublicationYear: 1990
      })

      if (result.success) {
        result.isbns.forEach(isbn => allISBNs.add(isbn))
        console.log(`  ✅ ${result.stats.isbnsHarvested} ISBNs discovered`)
        console.log(`  Works processed: ${result.stats.worksProcessed}/${result.stats.worksDiscovered}`)
        console.log(`  Editions discovered: ${result.stats.editionsDiscovered}`)
      } else {
        console.log(`  ❌ Failed: ${result.error}`)
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`)
    }

    console.log('')

    // Stop early if quota reached (shouldn't happen in dry run)
    if (allISBNs.size >= DAILY_QUOTA) {
      console.warn(`⚠️ Quota reached (${allISBNs.size}/${DAILY_QUOTA})`)
      break
    }
  }

  // Step 5: Summary
  console.log('='.repeat(60))
  console.log('📊 Dry Run Summary')
  console.log('='.repeat(60))
  console.log('')
  console.log(`Authors discovered: ${popularAuthors.length}`)
  console.log(`Authors prioritized: ${authorsToHarvest.length}`)
  console.log(`Authors tested: ${authorsToTest.length}`)
  console.log(`ISBNs collected: ${allISBNs.size}`)
  console.log(`Quota used: ${allISBNs.size}/${DAILY_QUOTA} (${((allISBNs.size / DAILY_QUOTA) * 100).toFixed(1)}%)`)
  console.log('')

  if (allISBNs.size > 0) {
    console.log(`Sample ISBNs (first 10):`)
    Array.from(allISBNs).slice(0, 10).forEach((isbn, idx) => {
      console.log(`  ${idx + 1}. ${isbn}`)
    })
    console.log('')
  }

  console.log('='.repeat(60))
  console.log('✅ Dry run complete')
  console.log('='.repeat(60))
  console.log('')
  console.log('📝 Next Steps:')
  console.log('   1. Review test output for errors')
  console.log('   2. Verify ISBNs are being discovered correctly')
  console.log('   3. Deploy to production with `npm run deploy`')
  console.log('   4. Monitor first harvest run at 3 AM UTC')
  console.log('')
}

// Run dry run
runDryRun().catch(error => {
  console.error('❌ Dry run failed:', error)
  process.exit(1)
})
