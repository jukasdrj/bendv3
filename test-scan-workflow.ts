/**
 * AI Shelf Scan Workflow End-to-End Validation Script
 *
 * Tests the complete scan workflow against production:
 * 1. POST /v3/jobs/scans - Upload photo
 * 2. Poll GET /v3/jobs/scans/:jobId - Monitor status
 * 3. GET /v3/jobs/scans/:jobId/results - Fetch results
 * 4. Validate schema compliance with @bookstrack/schemas
 *
 * Usage: bun run test-scan-workflow.ts <path-to-image>
 */

import {
  JobInitResponseSchema,
  JobStatusResponseSchema,
  JobResultsResponseSchema,
  type Job,
  type JobInitData,
  type JobResultsData,
} from '@bookstrack/schemas'
import { readFileSync } from 'fs'

// Production API base URL
const API_BASE = 'https://api.oooefam.net'

interface TestResult {
  phase: string
  success: boolean
  duration: number
  data?: any
  error?: string
  validationErrors?: string[]
}

const results: TestResult[] = []

function log(phase: string, message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${phase}] ${message}`)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function logError(phase: string, error: string) {
  console.error(`❌ [${phase}] ${error}`)
}

function logSuccess(phase: string, message: string) {
  console.log(`✅ [${phase}] ${message}`)
}

/**
 * Phase 1: POST /v3/jobs/scans
 */
async function testJobCreation(imagePath: string): Promise<JobInitData> {
  const phase = 'POST /v3/jobs/scans'
  const startTime = Date.now()

  try {
    log(phase, 'Reading image from disk...')
    const imageBuffer = readFileSync(imagePath)
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' })

    log(phase, `Image loaded: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`)

    // Create FormData with photos[] field
    const formData = new FormData()
    formData.append('photos[]', imageBlob, 'bookshelf.jpg')

    log(phase, 'Sending POST request...')
    const response = await fetch(`${API_BASE}/v3/jobs/scans`, {
      method: 'POST',
      body: formData,
    })

    const duration = Date.now() - startTime
    const responseData = await response.json()

    log(phase, `Response received (${response.status}) in ${duration}ms`)

    // Validate response status
    if (response.status !== 202) {
      throw new Error(`Expected 202 Accepted, got ${response.status}`)
    }

    // Validate schema
    const validationErrors: string[] = []
    const parseResult = JobInitResponseSchema.safeParse(responseData)

    if (!parseResult.success) {
      validationErrors.push(`Schema validation failed: ${parseResult.error.message}`)
      logError(phase, `Schema validation failed`)
      console.error(parseResult.error.errors)
    }

    // Validate required fields
    if (!responseData.success) {
      validationErrors.push('Missing success field or not true')
    }
    if (!responseData.data?.jobId) {
      validationErrors.push('Missing data.jobId')
    }
    if (!responseData.data?.streamUrl) {
      validationErrors.push('Missing data.streamUrl')
    }
    if (!responseData.data?.token) {
      validationErrors.push('Missing data.token')
    }
    if (responseData.data?.status !== 'queued') {
      validationErrors.push(`Expected status=queued, got ${responseData.data?.status}`)
    }

    results.push({
      phase,
      success: validationErrors.length === 0,
      duration,
      data: responseData,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    })

    if (validationErrors.length > 0) {
      logError(phase, `Validation errors: ${validationErrors.join(', ')}`)
      throw new Error('Schema validation failed')
    }

    logSuccess(phase, `Job created: ${responseData.data.jobId} (${duration}ms)`)
    return responseData.data as JobInitData
  } catch (error: any) {
    const duration = Date.now() - startTime
    results.push({
      phase,
      success: false,
      duration,
      error: error.message,
    })
    throw error
  }
}

/**
 * Phase 2: GET /v3/jobs/scans/:jobId (polling)
 */
async function pollJobStatus(
  jobId: string,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<Job> {
  const phase = 'GET /v3/jobs/scans/:jobId'
  let attempt = 0
  let lastProgress = -1

  log(phase, `Starting status polling (max ${maxAttempts} attempts, ${intervalMs}ms interval)`)

  while (attempt < maxAttempts) {
    attempt++
    const startTime = Date.now()

    try {
      const response = await fetch(`${API_BASE}/v3/jobs/scans/${jobId}`)
      const duration = Date.now() - startTime
      const responseData = await response.json()

      // Validate status code
      if (response.status !== 200) {
        throw new Error(`Expected 200 OK, got ${response.status}`)
      }

      // Validate schema
      const parseResult = JobStatusResponseSchema.safeParse(responseData)
      if (!parseResult.success) {
        logError(phase, `Schema validation failed on attempt ${attempt}`)
        console.error(parseResult.error.errors)
      }

      const job = responseData.data as Job

      // Validate progress monotonicity (Grok warned about this!)
      if (job.progress < lastProgress) {
        logError(
          phase,
          `Progress went backwards! ${lastProgress.toFixed(2)} → ${job.progress.toFixed(2)}`,
        )
      }
      lastProgress = job.progress

      log(
        phase,
        `Attempt ${attempt}: status=${job.status}, progress=${(job.progress * 100).toFixed(1)}% (${job.processedCount}/${job.totalCount}) [${duration}ms]`,
      )

      // Check for terminal states
      if (job.status === 'completed') {
        logSuccess(phase, `Job completed in ${attempt} polls`)
        results.push({
          phase,
          success: true,
          duration: Date.now() - startTime,
          data: job,
        })
        return job
      }

      if (job.status === 'failed') {
        throw new Error(`Job failed: ${job.error?.message || 'Unknown error'}`)
      }

      if (job.status === 'canceled') {
        throw new Error('Job was canceled')
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    } catch (error: any) {
      results.push({
        phase,
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
      })
      throw error
    }
  }

  throw new Error(`Job did not complete within ${maxAttempts} attempts`)
}

/**
 * Phase 3: GET /v3/jobs/scans/:jobId/results
 */
async function fetchJobResults(jobId: string): Promise<JobResultsData> {
  const phase = 'GET /v3/jobs/scans/:jobId/results'
  const startTime = Date.now()

  try {
    log(phase, 'Fetching job results...')
    const response = await fetch(`${API_BASE}/v3/jobs/scans/${jobId}/results`)
    const duration = Date.now() - startTime
    const responseData = await response.json()

    log(phase, `Response received (${response.status}) in ${duration}ms`)

    // Validate status code
    if (response.status !== 200) {
      throw new Error(`Expected 200 OK, got ${response.status}`)
    }

    // Validate schema
    const validationErrors: string[] = []
    const parseResult = JobResultsResponseSchema.safeParse(responseData)

    if (!parseResult.success) {
      validationErrors.push(`Schema validation failed: ${parseResult.error.message}`)
      logError(phase, 'Results schema validation failed')
      console.error(parseResult.error.errors)
    }

    const resultsData = responseData.data as JobResultsData

    // Validate required fields
    if (!resultsData.jobId) {
      validationErrors.push('Missing jobId')
    }
    if (resultsData.jobId !== jobId) {
      validationErrors.push(`jobId mismatch: expected ${jobId}, got ${resultsData.jobId}`)
    }
    if (resultsData.status !== 'completed') {
      validationErrors.push(`Expected status=completed, got ${resultsData.status}`)
    }
    if (!Array.isArray(resultsData.results)) {
      validationErrors.push('results is not an array')
    }

    results.push({
      phase,
      success: validationErrors.length === 0,
      duration,
      data: resultsData,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    })

    if (validationErrors.length > 0) {
      logError(phase, `Validation errors: ${validationErrors.join(', ')}`)
      throw new Error('Results validation failed')
    }

    logSuccess(
      phase,
      `Results fetched: ${resultsData.results.length} books detected (${duration}ms)`,
    )
    return resultsData
  } catch (error: any) {
    const duration = Date.now() - startTime
    results.push({
      phase,
      success: false,
      duration,
      error: error.message,
    })
    throw error
  }
}

/**
 * Phase 4: Validate individual book results
 */
function validateBookResults(resultsData: JobResultsData): void {
  const phase = 'Book Results Validation'
  const validationErrors: string[] = []

  log(phase, `Validating ${resultsData.results.length} books...`)

  for (let i = 0; i < resultsData.results.length; i++) {
    const book = resultsData.results[i] as any

    // Check required fields
    if (!book.title && !book.isbn) {
      validationErrors.push(`Book ${i}: Missing both title and ISBN`)
    }

    // Validate confidence if present
    if (book.confidence !== undefined) {
      if (typeof book.confidence !== 'number') {
        validationErrors.push(`Book ${i}: confidence is not a number`)
      } else if (book.confidence < 0 || book.confidence > 1) {
        validationErrors.push(`Book ${i}: confidence out of range (${book.confidence})`)
      }
    }

    // Validate bounding box if present
    if (book.boundingBox) {
      const bb = book.boundingBox
      if (bb.x < 0 || bb.x > 1) {
        validationErrors.push(`Book ${i}: boundingBox.x out of range (${bb.x})`)
      }
      if (bb.y < 0 || bb.y > 1) {
        validationErrors.push(`Book ${i}: boundingBox.y out of range (${bb.y})`)
      }
      if (bb.width < 0 || bb.width > 1) {
        validationErrors.push(`Book ${i}: boundingBox.width out of range (${bb.width})`)
      }
      if (bb.height < 0 || bb.height > 1) {
        validationErrors.push(`Book ${i}: boundingBox.height out of range (${bb.height})`)
      }
    }

    // Validate enrichment status if present
    if (book.enrichmentStatus) {
      const validStatuses = ['pending', 'success', 'not_found', 'error', 'circuit_open']
      if (!validStatuses.includes(book.enrichmentStatus)) {
        validationErrors.push(
          `Book ${i}: invalid enrichmentStatus (${book.enrichmentStatus})`,
        )
      }
    }

    // Log book details
    console.log(
      `  Book ${i + 1}: ${book.title || '(no title)'} by ${book.author || '(no author)'} [confidence: ${book.confidence?.toFixed(2) || 'N/A'}]`,
    )
  }

  results.push({
    phase,
    success: validationErrors.length === 0,
    duration: 0,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
  })

  if (validationErrors.length > 0) {
    logError(phase, `Found ${validationErrors.length} validation errors`)
    validationErrors.forEach((err) => console.error(`  - ${err}`))
  } else {
    logSuccess(phase, 'All book results valid')
  }
}

/**
 * Generate final test report
 */
function generateReport(): void {
  console.log('\n' + '='.repeat(80))
  console.log('VALIDATION REPORT')
  console.log('='.repeat(80) + '\n')

  let totalDuration = 0
  let passedCount = 0
  let failedCount = 0

  for (const result of results) {
    totalDuration += result.duration
    if (result.success) {
      passedCount++
      console.log(`✅ ${result.phase} - ${result.duration}ms`)
    } else {
      failedCount++
      console.log(`❌ ${result.phase} - ${result.duration}ms`)
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      }
      if (result.validationErrors) {
        result.validationErrors.forEach((err) => console.log(`   - ${err}`))
      }
    }
  }

  console.log('\n' + '-'.repeat(80))
  console.log(`Total Duration: ${totalDuration}ms`)
  console.log(`Passed: ${passedCount}/${results.length}`)
  console.log(`Failed: ${failedCount}/${results.length}`)
  console.log('='.repeat(80) + '\n')

  if (failedCount === 0) {
    console.log('🎉 ALL TESTS PASSED!')
  } else {
    console.log(`⚠️  ${failedCount} TEST(S) FAILED`)
    process.exit(1)
  }
}

/**
 * Main execution
 */
async function main() {
  const imagePath = process.argv[2]

  if (!imagePath) {
    console.error('Usage: bun run test-scan-workflow.ts <path-to-image>')
    process.exit(1)
  }

  console.log('🚀 Starting AI Shelf Scan Workflow Validation\n')
  console.log(`Production API: ${API_BASE}`)
  console.log(`Test Image: ${imagePath}\n`)

  try {
    // Phase 1: Create scan job
    const jobInitData = await testJobCreation(imagePath)

    // Phase 2: Poll job status until completion
    const completedJob = await pollJobStatus(jobInitData.jobId)

    // Phase 3: Fetch results
    const resultsData = await fetchJobResults(jobInitData.jobId)

    // Phase 4: Validate book results
    validateBookResults(resultsData)

    // Generate final report
    generateReport()
  } catch (error: any) {
    console.error('\n❌ VALIDATION FAILED\n')
    console.error(error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }

    generateReport()
  }
}

main()
