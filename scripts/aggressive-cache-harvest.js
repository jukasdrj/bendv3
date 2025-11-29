#!/usr/bin/env node
/**
 * Aggressive Cache Harvest Script
 *
 * Extracts all ISBNs from CSV files and warms production cache via API calls.
 * Rate-limited to respect API quotas while maximizing cache population.
 *
 * CSV Sources:
 * - docs/testImages/csv-expansion/*.csv (~2,500 books)
 * - docs/testImages/goodreads_library_export.csv
 *
 * Strategy:
 * 1. Extract unique ISBNs from all CSV files
 * 2. Deduplicate (same book may appear in multiple CSVs)
 * 3. Batch request to production API (5 req/sec to avoid rate limits)
 * 4. Track success/failure rates
 * 5. Report cache warming stats
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PRODUCTION_API = 'https://api.oooefam.net'
const RATE_LIMIT_MS = 200 // 5 requests/second
const BATCH_SIZE = 50 // Report progress every N books
const MAX_CONCURRENT = 3 // Parallel requests

/**
 * Simple CSV parser (no dependencies)
 */
function parseSimpleCSV(content) {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line)
  if (lines.length === 0) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const records = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const record = {}

    headers.forEach((header, index) => {
      record[header] = values[index] || ''
    })

    records.push(record)
  }

  return records
}

/**
 * Extract ISBNs from CSV file
 */
function extractISBNsFromCSV(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const records = parseSimpleCSV(content)

    const isbns = []
    for (const record of records) {
      // Try common ISBN column names
      const isbn = record['ISBN-13'] || record['ISBN13'] || record['ISBN'] ||
                   record['isbn'] || record['isbn13'] || record['isbn-13']

      if (isbn && isbn.trim() && /^\d{10,13}$/.test(isbn.trim())) {
        isbns.push(isbn.trim())
      }
    }

    return isbns
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error.message)
    return []
  }
}

/**
 * Find all CSV files in directory
 */
function findCSVFiles(dir) {
  const files = []

  function traverse(currentDir) {
    if (!fs.existsSync(currentDir)) return

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        traverse(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.csv')) {
        files.push(fullPath)
      }
    }
  }

  traverse(dir)
  return files
}

/**
 * Warm cache for single ISBN
 */
async function warmISBN(isbn) {
  try {
    // Issue #139: Strict ISBN validation (no lenient mode)
    const response = await fetch(`${PRODUCTION_API}/v1/search/isbn?isbn=${isbn}`)
    const data = await response.json()

    // Canonical response format: {data: {works, editions, authors}, metadata: {cached, ...}}
    if (response.ok && data.data) {
      return { success: true, isbn, cached: data.metadata?.cached || false }
    } else if (response.status === 400 && data.error?.code === 'INVALID_ISBN') {
      return { success: false, isbn, error: 'Invalid ISBN checksum' }
    } else {
      return { success: false, isbn, error: data.error?.message || 'Unknown error' }
    }
  } catch (error) {
    return { success: false, isbn, error: error.message }
  }
}

/**
 * Warm cache with rate limiting
 */
async function warmCacheBatch(isbns) {
  const results = {
    total: isbns.length,
    success: 0,
    alreadyCached: 0,
    failed: 0,
    errors: []
  }

  console.log(`\n🔥 Starting aggressive cache warming for ${isbns.length} ISBNs...`)
  console.log(`📊 Rate limit: ${1000/RATE_LIMIT_MS} req/sec, Concurrent: ${MAX_CONCURRENT}`)
  console.log(`⏱️  Estimated time: ${Math.ceil(isbns.length * RATE_LIMIT_MS / 1000 / 60)} minutes\n`)

  const startTime = Date.now()

  // Process in batches with concurrency control
  for (let i = 0; i < isbns.length; i += MAX_CONCURRENT) {
    const batch = isbns.slice(i, i + MAX_CONCURRENT)

    const promises = batch.map(async (isbn) => {
      const result = await warmISBN(isbn)

      if (result.success) {
        if (result.cached) {
          results.alreadyCached++
        } else {
          results.success++
        }
      } else {
        results.failed++
        if (results.errors.length < 10) { // Keep first 10 errors
          results.errors.push({ isbn, error: result.error })
        }
      }

      return result
    })

    await Promise.all(promises)

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))

    // Progress report every BATCH_SIZE books
    if ((i + MAX_CONCURRENT) % BATCH_SIZE === 0 || i + MAX_CONCURRENT >= isbns.length) {
      const processed = Math.min(i + MAX_CONCURRENT, isbns.length)
      const percent = ((processed / isbns.length) * 100).toFixed(1)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)

      console.log(`📈 Progress: ${processed}/${isbns.length} (${percent}%) | ` +
                  `✅ ${results.success} new | 💾 ${results.alreadyCached} cached | ` +
                  `❌ ${results.failed} failed | ⏱️  ${elapsed}s`)
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`\n✅ Cache warming complete!`)
  console.log(`📊 Results:`)
  console.log(`   - Total ISBNs: ${results.total}`)
  console.log(`   - Newly cached: ${results.success}`)
  console.log(`   - Already cached: ${results.alreadyCached}`)
  console.log(`   - Failed: ${results.failed}`)
  console.log(`   - Duration: ${duration}s (${(results.total / duration).toFixed(1)} req/sec)`)

  if (results.errors.length > 0) {
    console.log(`\n❌ First ${results.errors.length} errors:`)
    results.errors.forEach(({ isbn, error }) => {
      console.log(`   - ${isbn}: ${error}`)
    })
  }

  return results
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 BooksTrack Aggressive Cache Harvest')
  console.log('=' .repeat(60))

  // Find all CSV files
  const projectRoot = path.resolve(__dirname, '..')
  const csvDirs = [
    path.join(projectRoot, 'docs/testImages/csv-expansion'),
    path.join(projectRoot, 'docs/testImages')
  ]

  let allCSVFiles = []
  for (const dir of csvDirs) {
    if (fs.existsSync(dir)) {
      const files = findCSVFiles(dir)
      allCSVFiles = allCSVFiles.concat(files)
    }
  }

  console.log(`\n📁 Found ${allCSVFiles.length} CSV files:`)
  allCSVFiles.forEach(file => {
    console.log(`   - ${path.relative(projectRoot, file)}`)
  })

  // Extract all ISBNs
  console.log(`\n📖 Extracting ISBNs from CSV files...`)
  const allISBNs = []

  for (const file of allCSVFiles) {
    const isbns = extractISBNsFromCSV(file)
    allISBNs.push(...isbns)
    console.log(`   ${path.basename(file)}: ${isbns.length} ISBNs`)
  }

  // Deduplicate
  const uniqueISBNs = [...new Set(allISBNs)]
  console.log(`\n🔍 Deduplication:`)
  console.log(`   - Total ISBNs: ${allISBNs.length}`)
  console.log(`   - Unique ISBNs: ${uniqueISBNs.length}`)
  console.log(`   - Duplicates removed: ${allISBNs.length - uniqueISBNs.length}`)

  // Confirm before proceeding
  console.log(`\n⚠️  About to warm production cache with ${uniqueISBNs.length} ISBNs`)
  console.log(`   This will make ~${uniqueISBNs.length} API calls to ${PRODUCTION_API}`)
  console.log(`   Estimated time: ${Math.ceil(uniqueISBNs.length * RATE_LIMIT_MS / 1000 / 60)} minutes`)

  // Auto-proceed (remove this if you want manual confirmation)
  console.log(`\n▶️  Starting in 3 seconds...`)
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Warm cache
  const results = await warmCacheBatch(uniqueISBNs)

  // Final summary
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🎉 Cache harvest complete!`)
  console.log(`📦 Cache now contains ${results.success + results.alreadyCached} ISBNs`)
  console.log(`🚀 Production API ready for frontend with warmed cache`)
  console.log(`${'='.repeat(60)}\n`)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
