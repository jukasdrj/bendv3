#!/usr/bin/env node
/**
 * Manual Author Bibliography Expansion Script
 *
 * Manually triggers edition discovery and author bibliography expansion
 * with real-time progress monitoring.
 *
 * Usage:
 *   node scripts/trigger-author-expansion.js "Stephen King"
 *   node scripts/trigger-author-expansion.js "Brandon Sanderson" --max-works=30
 *   node scripts/trigger-author-expansion.js "Colleen Hoover" --editions=5 --year=2010
 *
 * Options:
 *   --max-works=N      Maximum works to process (default: 20)
 *   --editions=N       Editions per work (default: 3)
 *   --year=YYYY        Minimum publication year (default: 2000)
 *   --production       Use production API (default: local dev)
 */

import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)

// Parse command line arguments
const args = process.argv.slice(2)
const authorName = args.find(arg => !arg.startsWith('--'))
const maxWorks = parseInt(args.find(arg => arg.startsWith('--max-works='))?.split('=')[1] || '20')
const editionsPerWork = parseInt(args.find(arg => arg.startsWith('--editions='))?.split('=')[1] || '3')
const minYear = parseInt(args.find(arg => arg.startsWith('--year='))?.split('=')[1] || '2000')
const useProduction = args.includes('--production')

if (!authorName) {
  console.error('❌ Error: Author name required')
  console.log('')
  console.log('Usage:')
  console.log('  node scripts/trigger-author-expansion.js "Stephen King"')
  console.log('  node scripts/trigger-author-expansion.js "Brandon Sanderson" --max-works=30')
  console.log('  node scripts/trigger-author-expansion.js "Colleen Hoover" --editions=5 --year=2010')
  console.log('')
  console.log('Options:')
  console.log('  --max-works=N      Maximum works to process (default: 20)')
  console.log('  --editions=N       Editions per work (default: 3)')
  console.log('  --year=YYYY        Minimum publication year (default: 2000)')
  console.log('  --production       Use production API (default: local dev)')
  process.exit(1)
}

const API_BASE = useProduction
  ? 'https://api.oooefam.net'
  : 'http://localhost:8787'

console.log('📚 BooksTrack Author Bibliography Expansion')
console.log('='.repeat(60))
console.log('')
console.log(`Author: ${authorName}`)
console.log(`API: ${API_BASE}`)
console.log(`Max Works: ${maxWorks}`)
console.log(`Editions per Work: ${editionsPerWork}`)
console.log(`Min Publication Year: ${minYear}`)
console.log('')

/**
 * Step 1: Fetch author bibliography from OpenLibrary
 */
async function fetchAuthorWorks() {
  console.log('🔍 Step 1: Fetching author bibliography from OpenLibrary...')

  try {
    // Search for author
    const searchUrl = new URL('https://openlibrary.org/search/authors.json')
    searchUrl.searchParams.set('q', authorName)

    const searchResponse = await fetch(searchUrl.toString())
    const searchData = await searchResponse.json()

    if (!searchData.docs || searchData.docs.length === 0) {
      throw new Error(`Author not found in OpenLibrary: ${authorName}`)
    }

    const authorKey = searchData.docs[0].key
    const canonicalName = searchData.docs[0].name
    console.log(`   ✓ Found OpenLibrary author: ${canonicalName} (${authorKey})`)

    // Fetch works
    const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=500`
    const worksResponse = await fetch(worksUrl)
    const worksData = await worksResponse.json()

    const works = worksData.entries || []
    console.log(`   ✓ Discovered ${works.length} works`)

    // Filter by year
    const filteredWorks = works
      .filter(work => {
        if (!work.title) return false
        const year = parseInt(work.first_publish_year || '0')
        return year === 0 || year >= minYear
      })
      .sort((a, b) => {
        const yearA = parseInt(a.first_publish_year || '0')
        const yearB = parseInt(b.first_publish_year || '0')
        return yearB - yearA
      })
      .slice(0, maxWorks)

    console.log(`   ✓ Filtered to ${filteredWorks.length} works (${minYear}+, limited to ${maxWorks})`)
    console.log('')

    return { canonicalName, works: filteredWorks }
  } catch (error) {
    console.error('   ❌ Failed:', error.message)
    throw error
  }
}

/**
 * Step 2: Discover editions for each work via production API
 */
async function discoverEditionsForWorks(works) {
  console.log(`🔎 Step 2: Discovering ${editionsPerWork} editions per work...`)
  console.log('')

  const allISBNs = new Set()
  const results = []
  let worksProcessed = 0
  let editionsDiscovered = 0
  let skipped = 0

  for (const work of works) {
    worksProcessed++

    try {
      // Use test-multi-edition endpoint (no auth required, perfect for testing)
      // We'll manually discover via Google Books API
      const metadataUrl = new URL('https://www.googleapis.com/books/v1/volumes')
      metadataUrl.searchParams.set('q', `intitle:"${work.title.replace(/"/g, '')}"`)
      metadataUrl.searchParams.set('maxResults', '40')
      metadataUrl.searchParams.set('orderBy', 'relevance')

      const response = await fetch(metadataUrl.toString())
      const data = await response.json()

      if (!data.items || data.items.length === 0) {
        console.log(`   [${worksProcessed}/${works.length}] ⊗ ${work.title} (${work.first_publish_year}): No editions found`)
        skipped++
        continue
      }

      // Score and sort editions
      const editions = data.items
        .map(item => {
          const volumeInfo = item.volumeInfo
          const identifiers = volumeInfo.industryIdentifiers || []
          const isbn13 = identifiers.find(id => id.type === 'ISBN_13')
          const isbn10 = identifiers.find(id => id.type === 'ISBN_10')
          const isbn = isbn13?.identifier || isbn10?.identifier

          if (!isbn) return null

          // Simple score based on image quality
          let score = 0
          if (volumeInfo.imageLinks?.extraLarge) score += 40
          else if (volumeInfo.imageLinks?.large) score += 30
          else if (volumeInfo.imageLinks?.medium) score += 20
          else if (volumeInfo.imageLinks?.thumbnail) score += 10

          return {
            isbn,
            title: volumeInfo.title,
            score,
            imageUrl: volumeInfo.imageLinks?.medium || volumeInfo.imageLinks?.thumbnail
          }
        })
        .filter(ed => ed !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, editionsPerWork)

      if (editions.length === 0) {
        console.log(`   [${worksProcessed}/${works.length}] ⊗ ${work.title} (${work.first_publish_year}): No ISBNs found`)
        skipped++
        continue
      }

      // Add to set
      editions.forEach(ed => {
        allISBNs.add(ed.isbn)
        editionsDiscovered++
      })

      console.log(`   [${worksProcessed}/${works.length}] ✓ ${work.title} (${work.first_publish_year}): ${editions.length} editions (scores: ${editions.map(e => e.score).join(', ')})`)

      results.push({
        work: work.title,
        year: work.first_publish_year,
        editions: editions.map(e => ({ isbn: e.isbn, score: e.score }))
      })

      // Rate limiting: 10 req/sec
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`   [${worksProcessed}/${works.length}] ❌ ${work.title}: ${error.message}`)
      skipped++
    }
  }

  console.log('')
  console.log(`✅ Edition Discovery Complete:`)
  console.log(`   Works processed: ${worksProcessed}`)
  console.log(`   Editions discovered: ${editionsDiscovered}`)
  console.log(`   Unique ISBNs: ${allISBNs.size}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Avg editions/work: ${(editionsDiscovered / worksProcessed).toFixed(1)}`)
  console.log('')

  return { isbns: Array.from(allISBNs), results }
}

/**
 * Step 3: Warm cache for discovered ISBNs
 */
async function warmCache(isbns) {
  console.log(`🔥 Step 3: Warming production cache with ${isbns.length} ISBNs...`)
  console.log('')

  let cached = 0
  let newlyFetched = 0
  let failed = 0

  for (let i = 0; i < isbns.length; i++) {
    const isbn = isbns[i]

    try {
      const response = await fetch(`${API_BASE}/v1/search/isbn?isbn=${isbn}`) // Issue #139: Strict validation
      const data = await response.json()

      if (response.ok && data.data) {
        if (data.metadata?.cached) {
          cached++
        } else {
          newlyFetched++
        }

        if ((i + 1) % 10 === 0 || i === isbns.length - 1) {
          console.log(`   [${i + 1}/${isbns.length}] ✓ ${newlyFetched} new | 💾 ${cached} cached | ❌ ${failed} failed`)
        }
      } else {
        if (response.status === 400 && data.error?.code === 'INVALID_ISBN') {
          console.warn(`Invalid ISBN rejected: ${isbn}`)
        }
        failed++
      }

      // Rate limiting: 5 req/sec
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error) {
      failed++
    }
  }

  console.log('')
  console.log(`✅ Cache Warming Complete:`)
  console.log(`   Newly cached: ${newlyFetched}`)
  console.log(`   Already cached: ${cached}`)
  console.log(`   Failed: ${failed}`)
  console.log('')

  return { newlyFetched, cached, failed }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now()

  try {
    // Step 1: Fetch works from OpenLibrary
    const { canonicalName, works } = await fetchAuthorWorks()

    if (works.length === 0) {
      console.log('⚠️  No works found matching criteria')
      return
    }

    // Step 2: Discover editions via Google Books
    const { isbns, results } = await discoverEditionsForWorks(works)

    if (isbns.length === 0) {
      console.log('⚠️  No ISBNs discovered')
      return
    }

    // Step 3: Warm production cache
    const cacheStats = await warmCache(isbns)

    // Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log('='.repeat(60))
    console.log('🎉 Author Bibliography Expansion Complete!')
    console.log('')
    console.log(`📊 Summary for: ${canonicalName}`)
    console.log(`   Works discovered: ${works.length}`)
    console.log(`   Editions found: ${isbns.length}`)
    console.log(`   Newly cached: ${cacheStats.newlyFetched}`)
    console.log(`   Already cached: ${cacheStats.cached}`)
    console.log(`   Failed: ${cacheStats.failed}`)
    console.log(`   Duration: ${duration}s`)
    console.log('')
    console.log('📖 Top 5 Works with Most Editions:')
    const topWorks = results
      .sort((a, b) => b.editions.length - a.editions.length)
      .slice(0, 5)

    topWorks.forEach((work, idx) => {
      console.log(`   ${idx + 1}. "${work.work}" (${work.year}): ${work.editions.length} editions`)
    })
    console.log('')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('')
    console.error('❌ Fatal error:', error.message)
    process.exit(1)
  }
}

main()
