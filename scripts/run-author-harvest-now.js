#!/usr/bin/env node
/**
 * Run Author Expansion Harvest NOW (Production)
 *
 * Directly executes the harvest against production API.
 * Tests with 5 authors instead of 25 to verify it works.
 */

import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)

const PRODUCTION_API = 'https://api.oooefam.net'
const TEST_AUTHORS = [
  'Colleen Hoover',
  'Brandon Sanderson',
  'Freida McFadden',
  'Stephen King',
  'Taylor Jenkins Reid'
]
const BOOKS_PER_AUTHOR = 100

console.log('🚀 Author Expansion Harvest - PRODUCTION RUN')
console.log('='.repeat(60))
console.log(`API: ${PRODUCTION_API}`)
console.log(`Authors: ${TEST_AUTHORS.length}`)
console.log(`Books per author: ${BOOKS_PER_AUTHOR}`)
console.log('')

const stats = {
  authorsProcessed: 0,
  authorsFailed: 0,
  totalISBNs: 0,
  newlyCached: 0,
  alreadyCached: 0,
  errors: []
}

/**
 * Search ISBNdb for author's books
 */
async function searchISBNdbAuthor(authorName, apiKey) {
  const url = new URL(`https://api2.isbndb.com/author/${encodeURIComponent(authorName)}`)
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', BOOKS_PER_AUTHOR.toString())

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': apiKey,
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    if (response.status === 404) {
      return { total: 0, books: [] }
    }
    const text = await response.text()
    throw new Error(`ISBNdb error ${response.status}: ${text}`)
  }

  const data = await response.json()

  // ISBNdb returns {author: "Name", books: [...]} format
  const books = data.books || []

  return {
    total: books.length, // ISBNdb doesn't return total, use books array length
    books: books.map(book => ({
      isbn: book.isbn13 || book.isbn || null,
      title: book.title || 'Unknown',
      image: book.image || null
    })).filter(book => book.isbn)
  }
}

/**
 * Warm cache via production API
 */
async function warmCache(isbn) {
  try {
    const response = await fetch(`${PRODUCTION_API}/v1/search/isbn?isbn=${isbn}`) // Issue #139: Strict validation
    const data = await response.json()

    // Log invalid ISBNs (Issue #139)
    if (response.status === 400 && data.error?.code === 'INVALID_ISBN') {
      stats.errors.push({ isbn, error: 'Invalid ISBN checksum' })
      return { success: false, cached: false }
    }

    return {
      success: response.ok && data.data,
      cached: data.metadata?.cached || false
    }
  } catch (error) {
    return { success: false, cached: false }
  }
}

/**
 * Main execution
 */
async function main() {
  const apiKey = process.env.ISBNDB_API_KEY

  if (!apiKey) {
    console.error('❌ ISBNDB_API_KEY environment variable not set')
    console.log('')
    console.log('Set it with:')
    console.log('  export ISBNDB_API_KEY="your_key_here"')
    process.exit(1)
  }

  const startTime = Date.now()

  for (let i = 0; i < TEST_AUTHORS.length; i++) {
    const authorName = TEST_AUTHORS[i]
    console.log(`[${i + 1}/${TEST_AUTHORS.length}] Processing: ${authorName}`)

    try {
      // Step 1: Search ISBNdb
      const result = await searchISBNdbAuthor(authorName, apiKey)

      if (result.total === 0) {
        console.log(`   ⊗ No books found`)
        stats.authorsFailed++
        console.log('')
        continue
      }

      console.log(`   ✓ Found ${result.books.length} books (total: ${result.total})`)
      stats.totalISBNs += result.books.length

      // Step 2: Warm cache (batch of 50)
      let authorNew = 0
      let authorCached = 0

      for (let j = 0; j < result.books.length; j++) {
        const book = result.books[j]

        const cacheResult = await warmCache(book.isbn)

        if (cacheResult.success) {
          if (cacheResult.cached) {
            authorCached++
            stats.alreadyCached++
          } else {
            authorNew++
            stats.newlyCached++
          }
        }

        // Progress every 20 books
        if ((j + 1) % 20 === 0 || j === result.books.length - 1) {
          console.log(`   📦 Progress: ${j + 1}/${result.books.length} (${authorNew} new, ${authorCached} cached)`)
        }

        // Rate limit: 3 req/sec
        await new Promise(resolve => setTimeout(resolve, 333))
      }

      console.log(`   ✅ ${authorName}: ${authorNew} newly cached, ${authorCached} already cached`)
      stats.authorsProcessed++

    } catch (error) {
      console.error(`   ❌ Failed:`, error.message)
      stats.authorsFailed++
      stats.errors.push({ author: authorName, error: error.message })
    }

    console.log('')
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('='.repeat(60))
  console.log('🎉 Harvest Complete!')
  console.log('')
  console.log('📊 Final Stats:')
  console.log(`   Authors processed: ${stats.authorsProcessed}/${TEST_AUTHORS.length}`)
  console.log(`   Authors failed: ${stats.authorsFailed}`)
  console.log(`   Total ISBNs: ${stats.totalISBNs}`)
  console.log(`   Newly cached: ${stats.newlyCached}`)
  console.log(`   Already cached: ${stats.alreadyCached}`)
  console.log(`   Duration: ${duration}s`)
  console.log('')

  if (stats.errors.length > 0) {
    console.log('❌ Errors:')
    stats.errors.forEach(({ author, error }) => {
      console.log(`   - ${author}: ${error}`)
    })
    console.log('')
  }

  console.log('='.repeat(60))

  if (stats.authorsProcessed === 0) {
    console.error('💥 NO AUTHORS PROCESSED - CHECK ERRORS ABOVE')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
