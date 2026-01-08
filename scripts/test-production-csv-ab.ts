// scripts/test-production-csv-ab.ts
// Test A/B framework via production API endpoint

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const API_BASE_URL = 'https://api.oooefam.net'
const CSV_DIRECTORY =
  '/Users/juju/Library/Mobile Documents/com~apple~CloudDocs/oooe_books/csv-expansion'

interface ImportJobResponse {
  success: boolean
  data: {
    jobId: string
    status: string
    streamUrl: string
    statusUrl: string
  }
}

interface JobStatusResponse {
  success: boolean
  data: {
    jobId: string
    status: 'initialized' | 'processing' | 'completed' | 'failed' | 'canceled'
    progress: number
    totalBooks?: number
    processedBooks?: number
    validBooks?: number
    errors?: number
    createdAt: string
    updatedAt: string
    completedAt?: string
    errorMessage?: string
  }
}

interface TestResult {
  csvFile: string
  csvSizeBytes: number
  jobId: string
  success: boolean
  totalBooks?: number
  validBooks?: number
  errors?: number
  durationMs?: number
  errorMessage?: string
}

async function uploadCSV(csvFile: string, csvContent: string): Promise<ImportJobResponse> {
  console.log(`\n📤 Uploading: ${csvFile}...`)

  const formData = new FormData()
  const blob = new Blob([csvContent], { type: 'text/csv' })
  formData.append('file', blob, csvFile)
  formData.append('userId', `ab-test-${Date.now()}`)

  const response = await fetch(`${API_BASE_URL}/v3/jobs/imports`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Upload failed: ${response.status} - ${error}`)
  }

  return response.json()
}

async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/v3/jobs/imports/${jobId}`)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Status check failed: ${response.status} - ${error}`)
  }

  return response.json()
}

async function waitForCompletion(jobId: string): Promise<JobStatusResponse> {
  console.log(`   ⏳ Waiting for job ${jobId} to complete...`)

  const startTime = Date.now()
  const maxWaitMs = 120_000 // 2 minutes max

  while (Date.now() - startTime < maxWaitMs) {
    const status = await pollJobStatus(jobId)

    if (status.data.status === 'completed') {
      console.log(
        `   ✅ Completed: ${status.data.validBooks} books, ${status.data.errors || 0} errors (${Date.now() - startTime}ms)`,
      )
      return status
    }

    if (status.data.status === 'failed' || status.data.status === 'canceled') {
      console.log(`   ❌ Failed: ${status.data.errorMessage || 'Unknown error'}`)
      return status
    }

    // Still processing, wait and retry
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(`Job timed out after ${maxWaitMs}ms`)
}

async function testCSVFile(csvFile: string, csvContent: string): Promise<TestResult> {
  const startTime = Date.now()

  try {
    // Upload CSV
    const uploadResponse = await uploadCSV(csvFile, csvContent)
    const jobId = uploadResponse.data.jobId

    // Wait for completion
    const finalStatus = await waitForCompletion(jobId)
    const durationMs = Date.now() - startTime

    return {
      csvFile,
      csvSizeBytes: csvContent.length,
      jobId,
      success: finalStatus.data.status === 'completed',
      totalBooks: finalStatus.data.totalBooks,
      validBooks: finalStatus.data.validBooks,
      errors: finalStatus.data.errors,
      durationMs,
      errorMessage: finalStatus.data.errorMessage,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.log(`   ❌ Test failed: ${errorMessage}`)

    return {
      csvFile,
      csvSizeBytes: csvContent.length,
      jobId: 'unknown',
      success: false,
      durationMs,
      errorMessage,
    }
  }
}

async function runTests() {
  console.log('📊 Production CSV A/B Testing\n')
  console.log(`API Endpoint: ${API_BASE_URL}`)
  console.log('A/B Test Config: 100% rollout (33.3% each variant)\n')

  // Get CSV files
  const files = readdirSync(CSV_DIRECTORY)
    .filter((f) => f.endsWith('.csv'))
    .filter((f) => {
      const path = join(CSV_DIRECTORY, f)
      const stats = statSync(path)
      return stats.size < 50_000 // Max 50KB for testing
    })
    .sort()
    .slice(0, 6) // Test first 6 files for quick results

  console.log(`📁 Testing ${files.length} CSV files\n`)

  const results: TestResult[] = []

  for (const file of files) {
    console.log('='.repeat(80))
    const csvPath = join(CSV_DIRECTORY, file)
    const csvContent = readFileSync(csvPath, 'utf-8')

    console.log(`📄 ${file} (${(csvContent.length / 1024).toFixed(2)} KB)`)

    const result = await testCSVFile(file, csvContent)
    results.push(result)

    // Small delay between uploads
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(80))

  const successCount = results.filter((r) => r.success).length
  const totalBooks = results.reduce((sum, r) => sum + (r.validBooks || 0), 0)
  const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0)
  const avgDuration =
    results.length > 0 ? results.reduce((sum, r) => sum + (r.durationMs || 0), 0) / results.length : 0

  console.log(`\n✅ Success Rate: ${successCount}/${results.length} (${(successCount / results.length * 100).toFixed(1)}%)`)
  console.log(`📚 Total Books:  ${totalBooks}`)
  console.log(`❌ Total Errors: ${totalErrors}`)
  console.log(`⏱️  Avg Duration: ${avgDuration.toFixed(0)}ms`)

  console.log('\n📋 Detailed Results:')
  for (const result of results) {
    const status = result.success ? '✅' : '❌'
    console.log(
      `   ${status} ${result.csvFile.padEnd(25)} - ${result.validBooks || 0} books, ${result.errors || 0} errors (${result.durationMs}ms)`,
    )
  }

  console.log('\n💡 Check telemetry in Analytics Engine (AI_ANALYTICS dataset):')
  console.log('   Query for CSV_AB_TEST events to see model distribution')
  console.log('   Job IDs:', results.map((r) => r.jobId).join(', '))

  console.log('\n✅ Testing complete!\n')
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
