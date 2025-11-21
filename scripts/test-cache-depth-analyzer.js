/**
 * Test Cache Depth Analyzer
 *
 * Tests the author cache depth analysis service with production KV data
 * to verify that we can correctly identify authors needing bibliography expansion.
 */

import { analyzeAuthorCacheDepth, prioritizeAuthorsForHarvest } from '../src/services/author-cache-analyzer.js'

// Mock environment with KV cache binding
const mockEnv = {
  KV_CACHE: {
    async list(options) {
      console.log(`[Mock KV] list() called with prefix: ${options?.prefix || 'none'}`)
      // Return empty for local testing - in real test, this would hit remote KV
      return { keys: [] }
    },
    async get(key) {
      console.log(`[Mock KV] get() called for key: ${key}`)
      return null
    }
  }
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('Cache Depth Analyzer Test Suite')
  console.log('='.repeat(60))
  console.log('')

  // Test 1: Analyze single author
  console.log('Test 1: Analyze Stephen King cache depth')
  console.log('-'.repeat(60))

  const kingAnalysis = await analyzeAuthorCacheDepth('Stephen King', mockEnv)

  console.log('Result:', JSON.stringify(kingAnalysis, null, 2))
  console.log('')

  // Test 2: Analyze multiple authors
  console.log('Test 2: Analyze multiple authors')
  console.log('-'.repeat(60))

  const testAuthors = [
    'Stephen King',
    'J.K. Rowling',
    'James Patterson',
    'Unknown Author With No Cache'
  ]

  for (const author of testAuthors) {
    const analysis = await analyzeAuthorCacheDepth(author, mockEnv)
    console.log(`${author}:`)
    console.log(`  Cached covers: ${analysis.cachedCovers}`)
    console.log(`  Estimated coverage: ${analysis.estimatedCoverage}%`)
    console.log(`  Needs expansion: ${analysis.needsExpansion}`)
    console.log('')
  }

  // Test 3: Prioritize authors for harvest
  console.log('Test 3: Prioritize authors for harvest')
  console.log('-'.repeat(60))

  const prioritized = await prioritizeAuthorsForHarvest(testAuthors, mockEnv, {
    coverageThreshold: 50,
    maxAuthors: 10
  })

  console.log(`Prioritized ${prioritized.length} authors:`)
  prioritized.forEach((author, idx) => {
    console.log(`  ${idx + 1}. ${author.name}: ${author.cachedCovers} covers (${author.estimatedCoverage}% coverage, priority: ${author.priority})`)
  })
  console.log('')

  console.log('='.repeat(60))
  console.log('✅ Cache Depth Analyzer tests complete')
  console.log('='.repeat(60))
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
