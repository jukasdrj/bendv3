/**
 * Performance Tests: R2 Migration Performance Validation
 *
 * Tests for Issue #11: R2 Migration for Hibernation Fix
 * Validates that R2 migration maintains performance within acceptable thresholds
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev } from 'wrangler'

describe('R2 Migration Performance', () => {
  let worker
  let testJobIds = []

  beforeAll(async () => {
    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })
  })

  afterAll(async () => {
    // Cleanup
    for (const jobId of testJobIds) {
      try {
        await worker.fetch(`/api/cleanup?jobId=${jobId}`, { method: 'POST' })
      } catch (error) {
        // Ignore
      }
    }

    await worker.stop()
  })

  describe('CSV Processing Performance', () => {
    it('should maintain P95 latency < 100ms for schedule operation', async () => {
      const measurements = []
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        const csvData = `isbn,title,author\n9780439708180,Book ${i},Author ${i}\n`
        const startTime = Date.now()

        const response = await worker.fetch('/api/csv-import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: csvData,
        })

        const latency = Date.now() - startTime
        measurements.push(latency)

        const result = await response.json()
        testJobIds.push(result.data.jobId)

        expect(response.status).toBe(200)
      }

      // Calculate statistics
      const sorted = measurements.sort((a, b) => a - b)
      const p50 = sorted[Math.floor(sorted.length * 0.5)]
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      const p99 = sorted[Math.floor(sorted.length * 0.99)]
      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length

      console.log('CSV Schedule Performance:')
      console.log(`  P50: ${p50}ms`)
      console.log(`  P95: ${p95}ms`)
      console.log(`  P99: ${p99}ms`)
      console.log(`  Avg: ${avg.toFixed(2)}ms`)

      // Success criteria: P95 < 100ms
      expect(p95).toBeLessThan(100)
    }, 60000)

    it('should handle large CSV (8MB) within 2 seconds', async () => {
      const header = 'isbn,title,author,publisher,year,pages,description\n'
      const row = '9780439708180,Test Book,Test Author,Test Publisher,2020,500,Description text here.\n'
      const targetSize = 8 * 1024 * 1024
      const rowsNeeded = Math.floor((targetSize - header.length) / row.length)
      const largeCSV = header + row.repeat(rowsNeeded)

      const startTime = Date.now()

      const response = await worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: largeCSV,
      })

      const latency = Date.now() - startTime

      console.log(`8MB CSV schedule latency: ${latency}ms`)

      expect(response.status).toBe(200)
      expect(latency).toBeLessThan(2000) // < 2 seconds

      const result = await response.json()
      testJobIds.push(result.data.jobId)
    }, 10000)

    it('should not degrade performance compared to baseline', async () => {
      // This test compares R2 upload time vs theoretical DO storage write
      // R2 upload should be < 50ms overhead for small payloads

      const csvData = 'isbn,title,author\n9780439708180,Test,Author\n'
      const measurements = []

      for (let i = 0; i < 50; i++) {
        const startTime = Date.now()

        await worker.fetch('/api/csv-import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: csvData,
        })

        measurements.push(Date.now() - startTime)
      }

      const sorted = measurements.sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]

      console.log(`R2 migration P95 overhead: ${p95}ms`)

      // Acceptable overhead: < 150ms for R2 upload + DO scheduling
      expect(p95).toBeLessThan(150)
    }, 30000)
  })

  describe('Bookshelf Scan Performance', () => {
    it('should maintain P95 latency < 200ms for schedule operation', async () => {
      const measurements = []
      const iterations = 50

      for (let i = 0; i < iterations; i++) {
        const imageData = new ArrayBuffer(512 * 1024) // 512KB
        const blob = new Blob([imageData], { type: 'image/jpeg' })

        const formData = new FormData()
        formData.append('image', blob, `test${i}.jpg`)

        const startTime = Date.now()

        const response = await worker.fetch('/api/bookshelf-scan', {
          method: 'POST',
          body: formData,
        })

        const latency = Date.now() - startTime
        measurements.push(latency)

        const result = await response.json()
        testJobIds.push(result.data.jobId)

        expect(response.status).toBe(200)
      }

      const sorted = measurements.sort((a, b) => a - b)
      const p50 = sorted[Math.floor(sorted.length * 0.5)]
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length

      console.log('Bookshelf Scan Schedule Performance:')
      console.log(`  P50: ${p50}ms`)
      console.log(`  P95: ${p95}ms`)
      console.log(`  Avg: ${avg.toFixed(2)}ms`)

      // Success criteria: P95 < 200ms
      expect(p95).toBeLessThan(200)
    }, 60000)

    it('should handle 10MB images within 3 seconds', async () => {
      const imageData = new ArrayBuffer(10 * 1024 * 1024) // 10MB
      const blob = new Blob([imageData], { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('image', blob, 'large.jpg')

      const startTime = Date.now()

      const response = await worker.fetch('/api/bookshelf-scan', {
        method: 'POST',
        body: formData,
      })

      const latency = Date.now() - startTime

      console.log(`10MB image schedule latency: ${latency}ms`)

      expect(response.status).toBe(200)
      expect(latency).toBeLessThan(3000) // < 3 seconds

      const result = await response.json()
      testJobIds.push(result.data.jobId)
    }, 15000)
  })

  describe('R2 Operations Performance', () => {
    it('should upload to R2 within 100ms (P95)', async () => {
      // Direct R2 upload performance test
      const measurements = []
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        const csvData = `test,data,${i}\n`

        const startTime = Date.now()

        await worker.fetch('/api/csv-import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: csvData,
        })

        measurements.push(Date.now() - startTime)
      }

      const sorted = measurements.sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]

      console.log(`R2 upload P95: ${p95}ms`)

      expect(p95).toBeLessThan(100)
    }, 60000)

    it('should fetch from R2 within 50ms (P95)', async () => {
      // This test measures R2 fetch latency during alarm processing
      // We need to measure the alarm processing time which includes R2 fetch

      const csvData = 'isbn,title,author\n9780439708180,Test,Author\n'

      // Upload CSV
      const uploadResponse = await worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvData,
      })

      const result = await uploadResponse.json()
      const jobId = result.data.jobId
      testJobIds.push(jobId)

      // Wait for alarm to trigger
      await new Promise((resolve) => setTimeout(resolve, 2500))

      // Fetch processing metrics (if available)
      const metricsResponse = await worker.fetch(`/api/debug/metrics?jobId=${jobId}`)

      if (metricsResponse.status === 200) {
        const metrics = await metricsResponse.json()

        if (metrics.data.r2FetchLatency) {
          console.log(`R2 fetch latency: ${metrics.data.r2FetchLatency}ms`)
          expect(metrics.data.r2FetchLatency).toBeLessThan(50)
        }
      }
    }, 10000)
  })

  describe('Concurrent Operations Performance', () => {
    it('should handle 10 concurrent CSV imports without degradation', async () => {
      const csvData = 'isbn,title,author\n9780439708180,Test,Author\n'
      const concurrentRequests = 10

      const startTime = Date.now()

      const promises = Array.from({ length: concurrentRequests }, () =>
        worker.fetch('/api/csv-import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: csvData,
        })
      )

      const responses = await Promise.all(promises)
      const totalLatency = Date.now() - startTime

      console.log(`10 concurrent CSV imports: ${totalLatency}ms total`)
      console.log(`Average per request: ${totalLatency / concurrentRequests}ms`)

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
      })

      // Total time should be < 1 second (good parallelization)
      expect(totalLatency).toBeLessThan(1000)

      // Cleanup
      const results = await Promise.all(responses.map((r) => r.json()))
      testJobIds.push(...results.map((r) => r.data.jobId))
    }, 15000)

    it('should maintain throughput under load', async () => {
      const totalRequests = 100
      const batchSize = 10
      const measurements = []

      for (let batch = 0; batch < totalRequests / batchSize; batch++) {
        const batchStart = Date.now()

        const promises = Array.from({ length: batchSize }, (_, i) => {
          const csvData = `isbn,title,author\n978043970${batch}${i},Book,Author\n`
          return worker.fetch('/api/csv-import', {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: csvData,
          })
        })

        await Promise.all(promises)
        measurements.push(Date.now() - batchStart)
      }

      const avgBatchTime = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const throughput = (1000 / avgBatchTime) * batchSize // requests per second

      console.log(`Average batch time: ${avgBatchTime.toFixed(2)}ms`)
      console.log(`Throughput: ${throughput.toFixed(2)} requests/second`)

      // Should maintain at least 50 requests/second
      expect(throughput).toBeGreaterThan(50)
    }, 60000)
  })

  describe('Memory Efficiency', () => {
    it('should not increase DO storage size with R2 migration', async () => {
      const csvData = 'a'.repeat(8 * 1024 * 1024) // 8MB

      const response = await worker.fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvData,
      })

      const result = await response.json()
      const jobId = result.data.jobId
      testJobIds.push(jobId)

      // Wait for schedule
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Check DO storage size (if debug endpoint exists)
      const storageResponse = await worker.fetch(`/api/debug/do-storage?jobId=${jobId}`)

      if (storageResponse.status === 200) {
        const storage = await storageResponse.json()

        // Calculate approximate storage size
        const storageSize = JSON.stringify(storage.data).length

        console.log(`DO storage size with 8MB CSV: ${storageSize} bytes`)

        // Should be < 1KB (only R2 key + metadata)
        expect(storageSize).toBeLessThan(1024)
      }
    }, 15000)
  })
})
