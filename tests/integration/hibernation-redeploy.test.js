/**
 * Integration Tests: Hibernation During Code Deployment
 *
 * Tests for Issue #11: R2 Migration for Hibernation Fix
 * Validates that hibernated DOs survive code deployments without "code has been updated" errors
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { unstable_dev } from 'wrangler'
import { execSync } from 'child_process'

describe('Hibernation During Code Updates', () => {
  let worker
  let testJobIds = []

  beforeAll(async () => {
    // Verify hibernation is enabled
    const config = JSON.parse(execSync('cat wrangler.jsonc').toString())
    const hibernationEnabled = config.vars.ENABLE_HIBERNATION_WEBSOCKET === 'true'

    if (!hibernationEnabled) {
      throw new Error(
        'ENABLE_HIBERNATION_WEBSOCKET must be true for hibernation tests'
      )
    }

    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })
  })

  afterAll(async () => {
    // Cleanup all test jobs
    for (const jobId of testJobIds) {
      try {
        await worker.fetch(`/api/cleanup?jobId=${jobId}`, { method: 'POST' })
      } catch (error) {
        // Ignore
      }
    }

    await worker.stop()
  })

  beforeEach(() => {
    testJobIds = []
  })

  it('should survive code deployment without "code has been updated" errors', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Harry Potter,J.K. Rowling\n'

    // 1. Start CSV processing
    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // 2. DO hibernates during alarm delay (2 seconds)
    // This is when the DO stores state and goes to sleep

    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 3. Simulate code update by restarting worker
    // In production, this would be `wrangler deploy`
    // For testing, we restart the dev server
    console.log('[Test] Simulating code deployment (worker restart)...')
    await worker.stop()

    worker = await unstable_dev('src/index.js', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })

    // 4. Wait for hibernated DO to wake and process alarm
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // 5. Verify no "code has been updated" errors
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    const status = await statusResponse.json()

    // Job should complete successfully (or still be processing)
    expect(['completed', 'processing']).toContain(status.data.status)
    expect(status.data.error).toBeUndefined()

    // If there's a logs endpoint, verify no hibernation errors
    const logsResponse = await worker.fetch(`/api/debug/logs?jobId=${actualJobId}`)
    if (logsResponse.status === 200) {
      const logs = await logsResponse.text()
      expect(logs).not.toContain('code has been updated')
      expect(logs).not.toContain('hibernation failed')
    }
  }, 30000)

  it('should successfully wake from hibernation with R2 keys intact', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Test Book,Test Author\n'

    // Schedule CSV processing
    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Allow hibernation
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Get DO state before wake-up (if debug endpoint exists)
    const preWakeState = await worker.fetch(`/api/debug/do-storage?jobId=${actualJobId}`)
    let r2KeyBeforeWake

    if (preWakeState.status === 200) {
      const state = await preWakeState.json()
      r2KeyBeforeWake = state.data.r2CsvKey
      expect(r2KeyBeforeWake).toBeDefined()
      expect(r2KeyBeforeWake).toMatch(/^hibernation\/csv\/.*\.csv$/)
    }

    // Trigger alarm (wakes DO from hibernation)
    await new Promise((resolve) => setTimeout(resolve, 2500))

    // Verify DO woke successfully and processed CSV
    const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
    const status = await statusResponse.json()

    expect(status.data.status).toBe('completed')
    expect(status.data.progress).toBe(100)

    // Verify R2 key was used successfully (cleanup would have happened)
    const postWakeState = await worker.fetch(`/api/debug/do-storage?jobId=${actualJobId}`)

    if (postWakeState.status === 200) {
      const state = await postWakeState.json()
      // R2 key should be cleaned up after successful processing
      expect(state.data.r2CsvKey).toBeUndefined()
    }
  }, 15000)

  it('should maintain WebSocket connection through hibernation', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Establish WebSocket connection
    const ws = new WebSocket(`ws://localhost:8787/ws/progress?jobId=${jobId}`)

    await new Promise((resolve) => {
      ws.onopen = resolve
    })

    const messages = []
    ws.onmessage = (event) => {
      messages.push(JSON.parse(event.data))
    }

    // Start CSV processing
    const csvData = 'isbn,title,author\n9780439708180,Test Book,Test Author\n'
    await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', 'X-Job-ID': jobId },
      body: csvData,
    })

    // Wait for DO to hibernate and wake
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // Verify WebSocket received progress messages
    expect(messages.length).toBeGreaterThan(0)

    const progressMessages = messages.filter((m) => m.type === 'progress')
    expect(progressMessages.length).toBeGreaterThan(0)

    // Final message should show completion
    const lastMessage = messages[messages.length - 1]
    expect(lastMessage.progress).toBe(100)

    ws.close()
  }, 15000)

  it('should handle multiple hibernation cycles', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    // Create a job that will hibernate multiple times
    // (In real scenario: batch processing with multiple alarms)

    const csvData = 'isbn,title,author\n' + '9780439708180,Book,Author\n'.repeat(100)

    const response = await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    })

    const result = await response.json()
    const actualJobId = result.data.jobId

    // Monitor progress through multiple wake/sleep cycles
    const maxWaitTime = 20000
    const checkInterval = 1000
    let elapsed = 0
    let finalStatus

    while (elapsed < maxWaitTime) {
      const statusResponse = await worker.fetch(`/api/job-status?jobId=${actualJobId}`)
      const status = await statusResponse.json()

      if (status.data.status === 'completed' || status.data.status === 'failed') {
        finalStatus = status
        break
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval))
      elapsed += checkInterval
    }

    expect(finalStatus).toBeDefined()
    expect(finalStatus.data.status).toBe('completed')
    expect(finalStatus.data.error).toBeUndefined()

    // Verify no hibernation errors in logs
    const logsResponse = await worker.fetch(`/api/debug/logs?jobId=${actualJobId}`)
    if (logsResponse.status === 200) {
      const logs = await logsResponse.text()
      expect(logs).not.toContain('code has been updated')
      expect(logs).not.toContain('deserialization failed')
    }
  }, 30000)

  it('should preserve DO storage after hibernation', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Test,Author\n'

    await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    })

    // Allow hibernation
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Check DO storage contains only strings (R2 keys), not blobs
    const storageResponse = await worker.fetch(`/api/debug/do-storage?jobId=${jobId}`)

    if (storageResponse.status === 200) {
      const storage = await storageResponse.json()

      // Verify all stored values are strings or numbers (serializable)
      Object.entries(storage.data).forEach(([key, value]) => {
        const type = typeof value
        expect(['string', 'number', 'boolean', 'undefined']).toContain(type)

        // Should NOT have large objects or ArrayBuffers
        if (type === 'string') {
          expect(value.length).toBeLessThan(1024) // R2 keys are short
        }
      })
    }

    // Wait for wake and completion
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const statusResponse = await worker.fetch(`/api/job-status?jobId=${jobId}`)
    const status = await statusResponse.json()
    expect(status.data.status).toBe('completed')
  }, 15000)

  it('should handle rapid deploy cycles without data loss', async () => {
    const jobId = crypto.randomUUID()
    testJobIds.push(jobId)

    const csvData = 'isbn,title,author\n9780439708180,Test,Author\n'

    await worker.fetch('/api/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    })

    // Simulate multiple rapid deployments
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500))

      console.log(`[Test] Simulating deployment ${i + 1}/3...`)
      await worker.stop()

      worker = await unstable_dev('src/index.js', {
        experimental: { disableExperimentalWarning: true },
        local: true,
      })
    }

    // Wait for final processing
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const statusResponse = await worker.fetch(`/api/job-status?jobId=${jobId}`)
    const status = await statusResponse.json()

    // Should still complete successfully despite rapid deployments
    expect(['completed', 'processing']).toContain(status.data.status)
    expect(status.data.error).toBeUndefined()
  }, 30000)
})
