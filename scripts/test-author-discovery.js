/**
 * Test Author Discovery Service
 *
 * Tests the author discovery system to verify we can correctly identify
 * popular authors from curated lists, analytics, and user libraries.
 */

import { discoverPopularAuthors, extractCuratedAuthors } from '../src/services/author-discovery.js'

// Mock environment (no actual API calls needed for curated list)
const mockEnv = {
  CF_ACCOUNT_ID: undefined, // Intentionally undefined to skip Analytics
  CF_API_TOKEN: undefined
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('Author Discovery Test Suite')
  console.log('='.repeat(60))
  console.log('')

  // Test 1: Extract curated authors
  console.log('Test 1: Extract curated authors')
  console.log('-'.repeat(60))

  const curatedAuthors = await extractCuratedAuthors()

  console.log(`Found ${curatedAuthors.length} curated authors`)
  console.log('Top 10 curated authors:')
  curatedAuthors.slice(0, 10).forEach((author, idx) => {
    console.log(`  ${idx + 1}. ${author.name} (frequency: ${author.frequency}, priority: ${author.priority})`)
  })
  console.log('')

  // Test 2: Discover popular authors (all sources)
  console.log('Test 2: Discover popular authors (all sources)')
  console.log('-'.repeat(60))

  const popularAuthors = await discoverPopularAuthors(mockEnv, { maxAuthors: 100 })

  console.log(`Discovered ${popularAuthors.length} unique popular authors`)
  console.log('')

  // Analyze priority distribution
  const priorityCounts = {}
  popularAuthors.forEach(author => {
    priorityCounts[author.priority] = (priorityCounts[author.priority] || 0) + 1
  })

  console.log('Priority distribution:')
  Object.entries(priorityCounts).forEach(([priority, count]) => {
    console.log(`  Priority ${priority}: ${count} authors`)
  })
  console.log('')

  // Test 3: Top 20 authors
  console.log('Test 3: Top 20 popular authors')
  console.log('-'.repeat(60))

  popularAuthors.slice(0, 20).forEach((author, idx) => {
    console.log(`  ${idx + 1}. ${author.name}`)
    console.log(`      Frequency: ${author.frequency}`)
    console.log(`      Priority: ${author.priority}`)
    console.log(`      Sources: ${author.sources.join(', ')}`)
  })
  console.log('')

  // Test 4: Verify expected authors are present
  console.log('Test 4: Verify expected bestselling authors present')
  console.log('-'.repeat(60))

  const expectedAuthors = [
    'Stephen King',
    'J.K. Rowling',
    'James Patterson',
    'Dan Brown',
    'John Grisham'
  ]

  expectedAuthors.forEach(expectedAuthor => {
    const found = popularAuthors.find(a => a.name === expectedAuthor)
    if (found) {
      console.log(`  ✅ ${expectedAuthor} found (priority: ${found.priority}, frequency: ${found.frequency})`)
    } else {
      console.log(`  ❌ ${expectedAuthor} NOT FOUND (this is unexpected!)`)
    }
  })
  console.log('')

  console.log('='.repeat(60))
  console.log('✅ Author Discovery tests complete')
  console.log('='.repeat(60))
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
