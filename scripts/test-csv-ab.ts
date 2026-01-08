// scripts/test-csv-ab.ts
// A/B Testing Script - Compare Gemini models on real CSV files

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { GeminiCSVModel } from '../src/config/gemini-models'
import { getModelConfig } from '../src/config/gemini-models'
import { parseCSVWithGemini } from '../src/providers/gemini-csv-provider'

// Test configuration
const CSV_DIRECTORY = '/Users/juju/Library/Mobile Documents/com~apple~CloudDocs/oooe_books/csv-expansion'
const MODELS: GeminiCSVModel[] = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite']

// Check for API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable not set')
  console.error('\nPlease provide your Gemini API key:')
  console.error('  export GEMINI_API_KEY="your-api-key-here"')
  console.error('  npx tsx scripts/test-csv-ab.ts')
  console.error('\nOr use wrangler to get it from secrets:')
  console.error('  GEMINI_API_KEY=$(wrangler secret get GEMINI_API_KEY) npx tsx scripts/test-csv-ab.ts')
  process.exit(1)
}

// Simple CSV parsing prompt (using the production prompt)
const GEMINI_CSV_PROMPT = `You are a CSV parser for book library data. Extract book information from the CSV below.

Expected fields:
- Title (required)
- Author (required)
- ISBN13 (optional)
- Year (optional)
- Rating (optional)

Return a JSON array of books. Each book must have title and author (non-empty strings).

Example:
[
  {
    "title": "Harry Potter and the Sorcerer's Stone",
    "author": "J.K. Rowling",
    "isbn13": "9780439708180"
  }
]`

interface TestResult {
  model: GeminiCSVModel
  csvFile: string
  csvSizeBytes: number
  success: boolean
  durationMs: number
  apiLatencyMs: number
  validBooks: number
  validationErrors: number
  errorRate: number
  tokenUsage: {
    promptTokens: number
    outputTokens: number
    totalTokens: number
  }
  errorMessage?: string
}

async function testModel(
  model: GeminiCSVModel,
  csvFile: string,
  csvContent: string,
): Promise<TestResult> {
  const startTime = Date.now()
  const modelConfig = getModelConfig(model)

  console.log(`\n🧪 Testing ${modelConfig.displayName} on ${csvFile}...`)

  try {
    const result = await parseCSVWithGemini(csvContent, GEMINI_CSV_PROMPT, GEMINI_API_KEY, {
      model,
      jobId: `test-${Date.now()}`,
      userId: 'ab-test-script',
      enableTelemetry: true,
    })

    const durationMs = Date.now() - startTime
    const telemetry = result.telemetry!

    console.log(
      `   ✅ Success: ${result.books.length} books, ${result.errors.length} errors, ${durationMs}ms`,
    )

    return {
      model,
      csvFile,
      csvSizeBytes: csvContent.length,
      success: true,
      durationMs,
      apiLatencyMs: telemetry.performance.apiLatencyMs,
      validBooks: result.books.length,
      validationErrors: result.errors.length,
      errorRate: telemetry.results.errorRate,
      tokenUsage: telemetry.tokenUsage,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.log(`   ❌ Failed: ${errorMessage}`)

    return {
      model,
      csvFile,
      csvSizeBytes: csvContent.length,
      success: false,
      durationMs,
      apiLatencyMs: 0,
      validBooks: 0,
      validationErrors: 0,
      errorRate: 1.0,
      tokenUsage: {
        promptTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      errorMessage,
    }
  }
}

async function runTests() {
  console.log('📊 CSV A/B Testing - Gemini Model Comparison\n')
  console.log('Models under test:')
  for (const model of MODELS) {
    const config = getModelConfig(model)
    console.log(
      `  - ${config.displayName} (${config.characteristics.speed}, ${config.characteristics.accuracy} accuracy)`,
    )
  }

  // Get all CSV files from directory
  const files = readdirSync(CSV_DIRECTORY)
    .filter((f) => f.endsWith('.csv'))
    .filter((f) => {
      // Skip the combine script and very large files
      const path = join(CSV_DIRECTORY, f)
      const stats = statSync(path)
      return stats.size < 100_000 // Max 100KB for testing
    })
    .sort()

  console.log(`\n📁 Found ${files.length} CSV files to test\n`)

  const allResults: TestResult[] = []

  // Test each CSV file with all models
  for (const file of files) {
    const csvPath = join(CSV_DIRECTORY, file)
    const csvContent = readFileSync(csvPath, 'utf-8')

    console.log(`\n${'='.repeat(80)}`)
    console.log(`📄 Testing: ${file} (${(csvContent.length / 1024).toFixed(2)} KB)`)
    console.log('='.repeat(80))

    for (const model of MODELS) {
      const result = await testModel(model, file, csvContent)
      allResults.push(result)

      // Small delay between API calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  // Generate summary report
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(80))

  // Group results by model
  const resultsByModel = MODELS.reduce(
    (acc, model) => {
      acc[model] = allResults.filter((r) => r.model === model)
      return acc
    },
    {} as Record<GeminiCSVModel, TestResult[]>,
  )

  // Calculate statistics for each model
  for (const model of MODELS) {
    const results = resultsByModel[model]
    const config = getModelConfig(model)

    const successCount = results.filter((r) => r.success).length
    const successRate = results.length > 0 ? (successCount / results.length) * 100 : 0

    const avgDuration =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
        : 0

    const avgLatency =
      results.filter((r) => r.success).length > 0
        ? results.filter((r) => r.success).reduce((sum, r) => sum + r.apiLatencyMs, 0) /
          results.filter((r) => r.success).length
        : 0

    const totalBooks = results.reduce((sum, r) => sum + r.validBooks, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.validationErrors, 0)

    const avgTokens =
      results.filter((r) => r.success).length > 0
        ? results
            .filter((r) => r.success)
            .reduce((sum, r) => sum + r.tokenUsage.totalTokens, 0) /
          results.filter((r) => r.success).length
        : 0

    console.log(`\n🤖 ${config.displayName}`)
    console.log('─'.repeat(80))
    console.log(`   Success Rate:     ${successRate.toFixed(1)}% (${successCount}/${results.length})`)
    console.log(`   Avg Duration:     ${avgDuration.toFixed(0)}ms`)
    console.log(`   Avg API Latency:  ${avgLatency.toFixed(0)}ms`)
    console.log(`   Total Books:      ${totalBooks}`)
    console.log(`   Total Errors:     ${totalErrors}`)
    console.log(`   Avg Tokens:       ${avgTokens.toFixed(0)}`)

    if (results.some((r) => !r.success)) {
      console.log('\n   ❌ Failures:')
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`      - ${r.csvFile}: ${r.errorMessage}`)
        })
    }
  }

  // Winner selection
  console.log('\n\n' + '='.repeat(80))
  console.log('🏆 WINNER SELECTION')
  console.log('='.repeat(80))

  const scores = MODELS.map((model) => {
    const results = resultsByModel[model]
    const successRate = results.filter((r) => r.success).length / results.length
    const avgDuration =
      results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
    const avgTokens =
      results.filter((r) => r.success).length > 0
        ? results
            .filter((r) => r.success)
            .reduce((sum, r) => sum + r.tokenUsage.totalTokens, 0) /
          results.filter((r) => r.success).length
        : 0
    const totalErrors = results.reduce((sum, r) => sum + r.validationErrors, 0)
    const totalBooks = results.reduce((sum, r) => sum + r.validBooks, 0)
    const errorRate = totalBooks > 0 ? totalErrors / (totalBooks + totalErrors) : 0

    // Weighted score calculation
    const weights = {
      successRate: 0.4,
      latency: 0.3,
      accuracy: 0.2,
      cost: 0.1,
    }

    const successScore = successRate
    const latencyScore = 1 - avgDuration / 90000 // Normalize to 90s max
    const accuracyScore = 1 - errorRate
    const costScore = 1 - avgTokens / 5000 // Normalize to 5000 tokens max

    const weightedScore =
      weights.successRate * successScore +
      weights.latency * latencyScore +
      weights.accuracy * accuracyScore +
      weights.cost * costScore

    return {
      model,
      weightedScore,
      successRate,
      avgDuration,
      errorRate,
      avgTokens,
    }
  }).sort((a, b) => b.weightedScore - a.weightedScore)

  scores.forEach((score, index) => {
    const config = getModelConfig(score.model)
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'
    console.log(
      `\n${medal} ${config.displayName}: ${(score.weightedScore * 100).toFixed(1)} points`,
    )
    console.log(`   Success Rate: ${(score.successRate * 100).toFixed(1)}%`)
    console.log(`   Avg Duration: ${score.avgDuration.toFixed(0)}ms`)
    console.log(`   Error Rate:   ${(score.errorRate * 100).toFixed(1)}%`)
    console.log(`   Avg Tokens:   ${score.avgTokens.toFixed(0)}`)
  })

  console.log('\n\n✅ Testing complete!\n')
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
