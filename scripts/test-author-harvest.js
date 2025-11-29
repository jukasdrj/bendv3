#!/usr/bin/env node
/**
 * Test Author Expansion Harvest
 *
 * Quick test script to verify the author expansion harvest works before deploying.
 * Tests with 3 authors instead of 25 to avoid quota usage.
 *
 * Usage:
 *   node scripts/test-author-harvest.js
 */

console.log('🧪 Testing Author Expansion Harvest (3 authors)')
console.log('='.repeat(60))
console.log('')

// Mock environment for testing
const mockEnv = {
  ISBNDB_API_KEY: process.env.ISBNDB_API_KEY
}

if (!mockEnv.ISBNDB_API_KEY) {
  console.error('❌ Error: ISBNDB_API_KEY environment variable not set')
  console.log('')
  console.log('Please set your ISBNdb API key:')
  console.log('  export ISBNDB_API_KEY="your_key_here"')
  console.log('')
  process.exit(1)
}

async function testHarvest() {
  try {
    // Import the harvest handler
    const { executeAuthorExpansionHarvest } = await import('../src/handlers/author-expansion-harvest.js')

    // Test with 3 authors, 50 books per author
    const result = await executeAuthorExpansionHarvest(mockEnv, 3, 50)

    if (result.success) {
      console.log('')
      console.log('✅ Test completed successfully!')
      console.log('')
      console.log('📊 Quick Stats:')
      console.log(`   Authors processed: ${result.stats.authorsProcessed}`)
      console.log(`   ISBNs harvested: ${result.stats.totalISBNsHarvested}`)
      console.log(`   Newly cached: ${result.stats.newlyCached}`)
      console.log(`   Already cached: ${result.stats.alreadyCached}`)
      console.log('')
    } else {
      console.error('❌ Test failed:', result.error)
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Fatal error:', error)
    process.exit(1)
  }
}

testHarvest()
