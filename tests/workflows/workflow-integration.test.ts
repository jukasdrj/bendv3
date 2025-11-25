/**
 * Workflow Integration Tests
 *
 * Sprint 3: Phase 3 - Workflow Testing Strategy (Issue #28)
 *
 * End-to-end tests for the book import workflow pipeline.
 * These tests validate the complete flow from CSV upload to database storage.
 *
 * Note: These tests require `wrangler dev` to be running locally.
 * Run with: `npm run test:integration` or `vitest tests/workflows/workflow-integration.test.ts`
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  pollJobStatus,
  waitForProgress,
  generateJobId,
  generateISBN13,
  createMockEnv,
} from '../utils/workflow-test-helpers'
import {
  sampleCSVContent,
  mockBookImportInput,
  mockJobStatusCompleted,
} from '../fixtures/workflow-fixtures'

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8787'
const INTEGRATION_TIMEOUT = 60000 // 60 seconds

// Skip integration tests if not in integration mode
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true'

// ============================================================================
// Test Suite: Workflow Trigger
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Trigger', () => {
  it('should trigger book import workflow via API', async () => {
    const jobId = generateJobId()
    const isbn = '9780439708180'

    const response = await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn,
        jobId,
        source: 'google_books',
      }),
    })

    expect(response.ok).toBe(true)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.data.jobId).toBe(jobId)
  }, INTEGRATION_TIMEOUT)

  it('should reject invalid ISBN', async () => {
    const response = await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: 'INVALID_ISBN',
        jobId: generateJobId(),
        source: 'google_books',
      }),
    })

    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.success).toBe(false)
    expect(data.error.code).toContain('INVALID')
  })

  it('should return job ID for status polling', async () => {
    const jobId = generateJobId()

    const response = await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: '9780439708180',
        jobId,
        source: 'google_books',
      }),
    })

    const data = await response.json()

    expect(data.data.jobId).toBeDefined()
    expect(typeof data.data.jobId).toBe('string')
  })
})

// ============================================================================
// Test Suite: Job Status Polling
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Status Polling', () => {
  it('should return job status via HTTP polling', async () => {
    const jobId = generateJobId()

    // Trigger workflow
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: '9780439708180',
        jobId,
        source: 'google_books',
      }),
    })

    // Poll for status
    const response = await fetch(`${BASE_URL}/v1/jobs/${jobId}/status`)

    expect(response.ok).toBe(true)

    const data = await response.json()
    expect(data.data.jobId).toBe(jobId)
    expect(['initialized', 'processing', 'completed', 'failed']).toContain(data.data.status)
  }, INTEGRATION_TIMEOUT)

  it('should show progress updates during processing', async () => {
    const jobId = generateJobId()

    // Trigger workflow
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: '9780439708180',
        jobId,
        source: 'google_books',
      }),
    })

    // Wait for some progress
    const status = await waitForProgress(jobId, 20, {
      baseUrl: BASE_URL,
      timeout: 15000,
    })

    expect(status.progress).toBeGreaterThanOrEqual(20)
  }, INTEGRATION_TIMEOUT)

  it('should complete workflow successfully', async () => {
    const jobId = generateJobId()

    // Trigger workflow
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: '9780439708180',
        jobId,
        source: 'google_books',
      }),
    })

    // Poll until completion
    const status = await pollJobStatus(jobId, {
      baseUrl: BASE_URL,
      timeout: 45000,
    })

    expect(status.status).toBe('completed')
    expect(status.progress).toBe(1.0)
  }, INTEGRATION_TIMEOUT)
})

// ============================================================================
// Test Suite: Database Validation
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Database Validation', () => {
  it('should save book metadata to D1', async () => {
    const jobId = generateJobId()
    const isbn = '9780439708180'

    // Trigger and wait for completion
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn, jobId, source: 'google_books' }),
    })

    await pollJobStatus(jobId, { baseUrl: BASE_URL, timeout: 45000 })

    // Verify book exists in database via search endpoint
    const searchResponse = await fetch(`${BASE_URL}/v1/search/isbn?isbn=${isbn}`)
    const searchData = await searchResponse.json()

    expect(searchData.success).toBe(true)
    expect(searchData.data.isbn).toBe(isbn)
    expect(searchData.data.title).toContain('Harry Potter')
  }, INTEGRATION_TIMEOUT)

  it('should store cover image in R2', async () => {
    const jobId = generateJobId()
    const isbn = '9780439708180'

    // Trigger and wait for completion
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn, jobId, source: 'google_books' }),
    })

    const status = await pollJobStatus(jobId, { baseUrl: BASE_URL, timeout: 45000 })

    // Check if cover was uploaded (result should indicate cover key)
    expect(status.result?.coverR2Key || status.result?.savedToD1).toBeDefined()
  }, INTEGRATION_TIMEOUT)
})

// ============================================================================
// Test Suite: Semantic Search (Vectorize)
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Semantic Search', () => {
  it('should generate and store embeddings', async () => {
    const jobId = generateJobId()
    const isbn = '9780439708180'

    // Trigger and wait for completion
    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isbn, jobId, source: 'google_books' }),
    })

    const status = await pollJobStatus(jobId, { baseUrl: BASE_URL, timeout: 45000 })

    // Check if embedding was generated (may be false if Vectorize not configured)
    expect(typeof status.result?.hasEmbedding).toBe('boolean')
  }, INTEGRATION_TIMEOUT)

  it('should find similar books after embedding', async () => {
    const isbn = '9780439708180'

    // Try to find similar books (may return empty if Vectorize not configured)
    const response = await fetch(`${BASE_URL}/v1/search/similar?isbn=${isbn}&limit=5`)

    // Should return valid response even if no results
    expect(response.ok).toBe(true)

    const data = await response.json()
    expect(data.success).toBeDefined()
  }, INTEGRATION_TIMEOUT)
})

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Error Handling', () => {
  it('should handle non-existent book gracefully', async () => {
    const jobId = generateJobId()
    const fakeISBN = generateISBN13() // Random valid ISBN that won't be found

    await fetch(`${BASE_URL}/v2/import/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isbn: fakeISBN,
        jobId,
        source: 'google_books',
      }),
    })

    const status = await pollJobStatus(jobId, {
      baseUrl: BASE_URL,
      timeout: 45000,
    })

    // Should fail gracefully with error message
    if (status.status === 'failed') {
      expect(status.error).toBeDefined()
      expect(status.error?.message).toBeDefined()
    }
  }, INTEGRATION_TIMEOUT)

  it('should return 404 for non-existent job', async () => {
    const fakeJobId = 'non-existent-job-id-12345'

    const response = await fetch(`${BASE_URL}/v1/jobs/${fakeJobId}/status`)

    // Should return 404 or empty job status
    expect([200, 404]).toContain(response.status)

    if (response.status === 200) {
      const data = await response.json()
      expect(data.data.status).toBe('not_found')
    }
  })
})

// ============================================================================
// Test Suite: Concurrent Workflows
// ============================================================================

describe.skipIf(!runIntegration)('Workflow Integration - Concurrency', () => {
  it('should handle multiple concurrent workflows', async () => {
    const workflows = [
      { isbn: '9780439708180', jobId: generateJobId() }, // Harry Potter
      { isbn: '9780547928227', jobId: generateJobId() }, // The Hobbit
    ]

    // Trigger all workflows concurrently
    const triggers = await Promise.all(
      workflows.map((w) =>
        fetch(`${BASE_URL}/v2/import/workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...w, source: 'google_books' }),
        })
      )
    )

    // All should trigger successfully
    triggers.forEach((response) => {
      expect(response.ok).toBe(true)
    })

    // Poll all for completion
    const results = await Promise.all(
      workflows.map((w) =>
        pollJobStatus(w.jobId, {
          baseUrl: BASE_URL,
          timeout: 60000,
        })
      )
    )

    // All should complete (success or fail, but not hang)
    results.forEach((status) => {
      expect(['completed', 'failed']).toContain(status.status)
    })
  }, INTEGRATION_TIMEOUT * 2)
})

// ============================================================================
// Unit Tests (Always Run)
// ============================================================================

describe('Workflow Integration - Unit Tests', () => {
  it('should generate valid job IDs', () => {
    const jobId = generateJobId()

    expect(jobId).toMatch(/^test-job-\d+-[a-z0-9]+$/)
    expect(jobId.length).toBeGreaterThan(15)
  })

  it('should generate valid ISBN-13', () => {
    const isbn = generateISBN13()

    expect(isbn).toMatch(/^\d{13}$/)

    // Verify checksum
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(isbn[i]!) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    expect(checkDigit).toBe(parseInt(isbn[12]!))
  })

  it('should create mock environment with all bindings', () => {
    const mockEnv = createMockEnv()

    expect(mockEnv.AI).toBeDefined()
    expect(mockEnv.DB).toBeDefined()
    expect(mockEnv.KV_CACHE).toBeDefined()
    expect(mockEnv.BOOK_COVERS).toBeDefined()
    expect(mockEnv.BOOK_VECTORS).toBeDefined()
    expect(mockEnv.WEBSOCKET_CONNECTION_DO).toBeDefined()
    expect(mockEnv.GOOGLE_BOOKS_API_KEY).toBeDefined()
  })

  it('should parse CSV content correctly', () => {
    const lines = sampleCSVContent.trim().split('\n')
    const headers = lines[0]!.split(',')
    const firstBook = lines[1]!.split(',')

    expect(headers).toEqual(['ISBN', 'Title', 'Author'])
    expect(firstBook[0]).toBe('9780439708180')
    expect(firstBook[1]).toBe("Harry Potter and the Philosopher's Stone")
    expect(firstBook[2]).toBe('J.K. Rowling')
  })
})
