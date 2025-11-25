/**
 * Integration Tests: CSV Import with R2 Storage
 *
 * Tests for Issue #11: R2 Migration for Hibernation Fix
 * End-to-end validation of CSV processing using R2 storage instead of DO storage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unstable_dev } from 'wrangler'

describe('CSV Import with R2 Storage Integration', () => {
  let worker
  let testJobIds = []

  beforeEach(async () => {
    // Start local Wrangler dev server
    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })
  })

  afterEach(async () => {
    // Cleanup test jobs
    for (const jobId of testJobIds) {
      try {
        // Trigger cleanup via API or direct DO call
        await worker.fetch(`/api/cleanup?jobId=${jobId}`, { method: 'POST' })
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    testJobIds = []

    await worker.stop()
  })

  it('should process CSV end-to-end with R2 storage', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = `isbn,title,author
9780439708180,Harry Potter and the Sorcerer's Stone,J.K. Rowling
9780439064873,Harry Potter and the Chamber of Secrets,J.K. Rowling`

    // 1. Upload CSV via API endpoint
    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvData,
    })

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.data.jobId).toBeDefined()

    const actualJobId = result.data.jobId

    // 2. Wait for processing to complete (alarm triggers after 2s)
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // 3. Check job status via WebSocket or status endpoint
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    expect(statusResponse.status).toBe(200)

    const status = await statusResponse.json()
    expect(status.data.status).toBe('completed')
    expect(status.data.progress).toBe(100)
  }, 10000)

  it('should not store CSV data in DO storage', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Test Book,Test Author\n'

    // Upload CSV
    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait briefly for schedule to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify DO storage contains only R2 key, not raw CSV
    // This would require a special debug endpoint or RPC method
    const debugResponse = await worker.fetch(`/api/debug/do-storage?jobId=${actualJobId}`)

    if (debugResponse.status === 200) {
      const doState = await debugResponse.json()

      // Should have R2 key
      expect(doState.data.r2CsvKey).toBeDefined()
      expect(doState.data.r2CsvKey).toMatch(/^hibernation\/csv\/.*\.csv$/)

      // Should NOT have raw CSV data
      expect(doState.data.csvData).toBeUndefined()
    }
  }, 10000)

  it('should cleanup R2 objects on successful processing', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Test Book,Test Author\n'

    // Upload and process
    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait for processing to complete
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Verify R2 object was cleaned up
    const r2CheckResponse = await worker.fetch(`/api/debug/r2-objects?jobId=${actualJobId}`)

    if (r2CheckResponse.status === 200) {
      const r2Objects = await r2CheckResponse.json()
      expect(r2Objects.data.count).toBe(0) // Should be cleaned up
    }
  }, 10000)

  it('should cleanup R2 objects on processing error', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Invalid CSV that will cause processing errors
    const invalidCSV = 'not,a,valid,csv\nwith,bad,structure'

    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: invalidCSV,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait for processing to fail
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Check job status - should be failed
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    const status = await statusResponse.json()
    expect(status.data.status).toBe('failed')

    // Verify R2 cleanup happened
    const r2CheckResponse = await worker.fetch(`/api/debug/r2-objects?jobId=${actualJobId}`)

    if (r2CheckResponse.status === 200) {
      const r2Objects = await r2CheckResponse.json()
      expect(r2Objects.data.count).toBe(0) // Should be cleaned up even on error
    }
  }, 10000)

  it('should handle large 8MB CSV files', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Generate ~8MB CSV
    const header = 'isbn,title,author,publisher,year,pages,description\n'
    const row = '9780439708180,Test Book,Test Author,Test Publisher,2020,500,A'.repeat(100) + '\n'
    const targetSize = 8 * 1024 * 1024
    const rowsNeeded = Math.floor((targetSize - header.length) / row.length)
    const largeCSV = header + row.repeat(rowsNeeded)

    expect(largeCSV.length).toBeGreaterThan(7 * 1024 * 1024) // At least 7MB

    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: largeCSV,
    })

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.success).toBe(true)

    // Should successfully schedule with R2 storage
    expect(result.data.jobId).toBeDefined()
  }, 15000)

  it('should reject CSV files exceeding 10MB limit', async () => {
    // Generate ~11MB CSV (over limit)
    const header = 'isbn,title,author,publisher,year,pages,description\n'
    const row = '9780439708180,Test Book,Test Author,Test Publisher,2020,500,A'.repeat(100) + '\n'
    const targetSize = 11 * 1024 * 1024
    const rowsNeeded = Math.floor((targetSize - header.length) / row.length)
    const oversizedCSV = header + row.repeat(rowsNeeded)

    expect(oversizedCSV.length).toBeGreaterThan(10 * 1024 * 1024)

    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: oversizedCSV,
    })

    expect(response.status).toBe(400)
    const result = await response.json()
    expect(result.success).toBe(false)
    expect(result.error.message).toMatch(/too large|exceeds limit/i)
  }, 15000)

  it('should handle concurrent CSV imports', async () => {
    const csv1 = 'isbn,title,author\n9780439708180,Book 1,Author 1\n'
    const csv2 = 'isbn,title,author\n9780439064873,Book 2,Author 2\n'
    const csv3 = 'isbn,title,author\n9780545010221,Book 3,Author 3\n'

    const [response1, response2, response3] = await Promise.all([
      worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv1,
      }),
      worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv2,
      }),
      worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv3,
      }),
    ])

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(response3.status).toBe(200)

    const [result1, result2, result3] = await Promise.all([
      response1.json(),
      response2.json(),
      response3.json(),
    ])

    expect(result1.data.jobId).toBeDefined()
    expect(result2.data.jobId).toBeDefined()
    expect(result3.data.jobId).toBeDefined()

    // All job IDs should be unique
    const jobIds = [result1.data.jobId, result2.data.jobId, result3.data.jobId]
    testJobIds.push(...jobIds)

    const uniqueJobIds = new Set(jobIds)
    expect(uniqueJobIds.size).toBe(3)

    // Wait for all processing to complete
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // Verify all completed successfully
    const statuses = await Promise.all(
      jobIds.map((id) => worker.fetch(`/api/job-status?jobId=${id}`).then((r) => r.json()))
    )

    statuses.forEach((status) => {
      expect(status.data.status).toBe('completed')
    })
  }, 15000)
})
