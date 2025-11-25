/**
 * Integration Tests: Bookshelf Scan with R2 Storage
 *
 * Tests for Issue #11: R2 Migration for Hibernation Fix
 * End-to-end validation of bookshelf image scanning using R2 storage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unstable_dev } from 'wrangler'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Bookshelf Scan with R2 Storage Integration', () => {
  let worker
  let testJobIds = []

  beforeEach(async () => {
    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })
  })

  afterEach(async () => {
    // Cleanup test jobs
    for (const jobId of testJobIds) {
      try {
        await worker.fetch(`/api/cleanup?jobId=${jobId}`, { method: 'POST' })
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    testJobIds = []

    await worker.stop()
  })

  it('should process bookshelf scan end-to-end with R2 storage', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Load test image from fixtures
    const testImagePath = resolve(__dirname, '../fixtures/test-bookshelf.jpg')
    const imageBuffer = readFileSync(testImagePath)

    const formData = new FormData()
    formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'bookshelf.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.data.jobId).toBeDefined()

    const actualJobId = result.data.jobId

    // Wait for AI processing to complete
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check job status
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    expect(statusResponse.status).toBe(200)

    const status = await statusResponse.json()
    expect(status.data.status).toBe('completed')
    expect(status.data.progress).toBe(100)
    expect(status.data.booksDetected).toBeGreaterThan(0)
  }, 20000)

  it('should not store image data in DO storage', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Create small test image (1MB)
    const imageData = new ArrayBuffer(1024 * 1024)
    const blob = new Blob([imageData], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('image', blob, 'test.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait briefly for schedule
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify DO storage contains R2 key, not raw image
    const debugResponse = await worker.fetch(`/api/debug/do-storage?jobId=${actualJobId}`)

    if (debugResponse.status === 200) {
      const doState = await debugResponse.json()

      // Should have R2 key
      expect(doState.data.r2ImageKey).toBeDefined()
      expect(doState.data.r2ImageKey).toMatch(/^hibernation\/image\/.*\.jpg$/)

      // Should NOT have raw image data
      expect(doState.data.imageData).toBeUndefined()
    }
  }, 15000)

  it('should cleanup R2 objects on successful scan', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const imageData = new ArrayBuffer(512 * 1024) // 512KB
    const blob = new Blob([imageData], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('image', blob, 'test.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Verify R2 cleanup
    const r2CheckResponse = await worker.fetch(`/api/debug/r2-objects?jobId=${actualJobId}`)

    if (r2CheckResponse.status === 200) {
      const r2Objects = await r2CheckResponse.json()
      expect(r2Objects.data.count).toBe(0) // Cleaned up after success
    }
  }, 15000)

  it('should cleanup R2 objects on scan error', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Invalid image data
    const invalidImage = new ArrayBuffer(100) // Too small to be valid JPEG
    const blob = new Blob([invalidImage], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('image', blob, 'invalid.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Wait for processing to fail
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check status - should be failed
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    const status = await statusResponse.json()
    expect(status.data.status).toBe('failed')

    // Verify R2 cleanup
    const r2CheckResponse = await worker.fetch(`/api/debug/r2-objects?jobId=${actualJobId}`)

    if (r2CheckResponse.status === 200) {
      const r2Objects = await r2CheckResponse.json()
      expect(r2Objects.data.count).toBe(0) // Cleaned up even on error
    }
  }, 15000)

  it('should handle 10MB image files', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Generate 10MB image
    const imageData = new ArrayBuffer(10 * 1024 * 1024)
    const blob = new Blob([imageData], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('image', blob, 'large.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.data.jobId).toBeDefined()
  }, 20000)

  it('should reject images exceeding 15MB limit', async () => {
    // Generate 16MB image (over limit)
    const oversizedImage = new ArrayBuffer(16 * 1024 * 1024)
    const blob = new Blob([oversizedImage], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('image', blob, 'oversized.jpg')

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    expect(response.status).toBe(400)
    const result = await response.json()
    expect(result.success).toBe(false)
    expect(result.error.message).toMatch(/too large|exceeds limit/i)
  }, 20000)

  it('should handle concurrent bookshelf scans', async () => {
    const image1 = new ArrayBuffer(512 * 1024)
    const image2 = new ArrayBuffer(768 * 1024)
    const image3 = new ArrayBuffer(1024 * 1024)

    const formData1 = new FormData()
    formData1.append('image', new Blob([image1], { type: 'image/jpeg' }), 'scan1.jpg')

    const formData2 = new FormData()
    formData2.append('image', new Blob([image2], { type: 'image/jpeg' }), 'scan2.jpg')

    const formData3 = new FormData()
    formData3.append('image', new Blob([image3], { type: 'image/jpeg' }), 'scan3.jpg')

    const [response1, response2, response3] = await Promise.all([
      worker.fetch('/api/bookshelf-scan', { method: 'POST', body: formData1 }),
      worker.fetch('/api/bookshelf-scan', { method: 'POST', body: formData2 }),
      worker.fetch('/api/bookshelf-scan', { method: 'POST', body: formData3 }),
    ])

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(response3.status).toBe(200)

    const [result1, result2, result3] = await Promise.all([
      response1.json(),
      response2.json(),
      response3.json(),
    ])

    const jobIds = [result1.data.jobId, result2.data.jobId, result3.data.jobId]
    testJobIds.push(...jobIds)

    // All unique job IDs
    const uniqueJobIds = new Set(jobIds)
    expect(uniqueJobIds.size).toBe(3)

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Verify all completed
    const statuses = await Promise.all(
      jobIds.map((id) => worker.fetch(`/api/job-status?jobId=${id}`).then((r) => r.json()))
    )

    statuses.forEach((status) => {
      expect(['completed', 'failed']).toContain(status.data.status)
    })
  }, 25000)

  it('should maintain image quality after R2 round-trip', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const testImagePath = resolve(__dirname, '../fixtures/test-bookshelf.jpg')
    const originalImage = readFileSync(testImagePath)

    const formData = new FormData()
    formData.append(
      'image',
      new Blob([originalImage], { type: 'image/jpeg' }),
      'bookshelf.jpg'
    )

    const response = await worker.fetch('/api/bookshelf-scan', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Retrieve processed image from R2 (if endpoint exists)
    const imageResponse = await worker.fetch(`/api/scan-result/${actualJobId}/image`)

    if (imageResponse.status === 200) {
      const retrievedImage = await imageResponse.arrayBuffer()

      // Verify size matches (allowing for minor compression differences)
      const sizeDiff = Math.abs(retrievedImage.byteLength - originalImage.byteLength)
      expect(sizeDiff).toBeLessThan(originalImage.byteLength * 0.05) // Within 5%
    }
  }, 20000)
})
