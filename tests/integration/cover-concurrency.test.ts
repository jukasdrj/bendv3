import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCoverProcessor } from '../../src/utils/concurrency-limiter'

describe('Cover Processing Concurrency Integration', () => {
  let mockEnv: any
  const mockProcessBookCover = vi.fn()

  beforeEach(() => {
    mockEnv = {
      ALEXANDRIA_CLIENT_ID: 'test-id',
      ALEXANDRIA_CLIENT_SECRET: 'test-secret',
    }

    // Mock the dynamic import in createCoverProcessor
    vi.doMock('../../src/services/alexandria-cover-service', () => ({
      processBookCover: mockProcessBookCover,
    }))

    mockProcessBookCover.mockReset()
    vi.clearAllTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.doUnmock('../../src/services/alexandria-cover-service')
  })

  it('should process multiple covers with controlled concurrency', async () => {
    const coverProcessor = createCoverProcessor(mockEnv)

    // Mock successful responses
    mockProcessBookCover.mockResolvedValue({
      success: true,
      urls: {
        small: 'http://test.com/small.jpg',
        medium: 'http://test.com/medium.jpg',
        large: 'http://test.com/large.jpg',
      }
    })

    const tasks = [
      { isbn: '1', workKey: 'OL1W', providerCoverURL: 'http://provider1.com/cover.jpg' },
      { isbn: '2', workKey: 'OL2W', providerCoverURL: 'http://provider2.com/cover.jpg' },
      { isbn: '3', workKey: 'OL3W', providerCoverURL: 'http://provider3.com/cover.jpg' },
    ]

    const start = Date.now()
    const results = await coverProcessor.processCovers(tasks)
    const duration = Date.now() - start

    // Verify all results
    expect(results.size).toBe(3)
    expect(results.get('1')?.success).toBe(true)
    expect(results.get('2')?.success).toBe(true)
    expect(results.get('3')?.success).toBe(true)

    // Verify the service was called for each task
    expect(mockProcessBookCover).toHaveBeenCalledTimes(3)

    // The calls should have been made with correct parameters
    expect(mockProcessBookCover).toHaveBeenNthCalledWith(1, {
      work_key: 'OL1W',
      provider_url: 'http://provider1.com/cover.jpg',
      isbn: '1',
    }, mockEnv, 2)

    // Should complete reasonably quickly (concurrency working)
    expect(duration).toBeLessThan(1000)
  })

  it('should handle cover processing failures gracefully', async () => {
    const coverProcessor = createCoverProcessor(mockEnv)

    // Mock some failures
    mockProcessBookCover
      .mockResolvedValueOnce({
        success: false,
        error: 'Provider URL not accessible',
        urls: { small: 'placeholder', medium: 'placeholder', large: 'placeholder' }
      })
      .mockResolvedValueOnce({
        success: true,
        urls: { small: 'http://test.com/small.jpg', medium: 'http://test.com/medium.jpg', large: 'http://test.com/large.jpg' }
      })
      .mockRejectedValueOnce(new Error('Network timeout'))

    const tasks = [
      { isbn: '1', workKey: 'OL1W', providerCoverURL: 'http://bad-provider.com/cover.jpg' },
      { isbn: '2', workKey: 'OL2W', providerCoverURL: 'http://good-provider.com/cover.jpg' },
      { isbn: '3', workKey: 'OL3W', providerCoverURL: 'http://timeout-provider.com/cover.jpg' },
    ]

    const results = await coverProcessor.processCovers(tasks)

    expect(results.size).toBe(3)

    // First task should have failed gracefully
    expect(results.get('1')?.success).toBe(false)
    expect(results.get('1')?.error).toContain('Provider URL not accessible')

    // Second task should have succeeded
    expect(results.get('2')?.success).toBe(true)
    expect(results.get('2')?.urls?.large).toBe('http://test.com/large.jpg')

    // Third task should have failed with exception
    expect(results.get('3')?.success).toBe(false)
    expect(results.get('3')?.error).toBe('Network timeout')
  })

  it('should respect concurrency limits', async () => {
    const coverProcessor = createCoverProcessor(mockEnv)
    let activeCalls = 0
    let maxConcurrentCalls = 0

    mockProcessBookCover.mockImplementation(async () => {
      activeCalls++
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls)

      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 50))

      activeCalls--
      return {
        success: true,
        urls: { small: 'test', medium: 'test', large: 'test' }
      }
    })

    // Create 20 tasks to test concurrency limit
    const tasks = Array.from({ length: 20 }, (_, i) => ({
      isbn: `${i}`,
      workKey: `OL${i}W`,
      providerCoverURL: `http://provider${i}.com/cover.jpg`
    }))

    await coverProcessor.processCovers(tasks)

    // Should not exceed concurrency limit of 10 (from createCoverProcessor config)
    expect(maxConcurrentCalls).toBeLessThanOrEqual(10)
    expect(maxConcurrentCalls).toBeGreaterThan(1) // Should have used some concurrency
  })

  it('should process large batches with progress tracking', async () => {
    const coverProcessor = createCoverProcessor(mockEnv)
    const progressUpdates: Array<{ completed: number; total: number }> = []

    // Capture progress logs
    const originalLog = console.log
    console.log = vi.fn((message: string) => {
      const match = message.match(/\[CoverProcessor\] Progress: (\d+)\/(\d+) covers processed/)
      if (match) {
        progressUpdates.push({
          completed: parseInt(match[1]),
          total: parseInt(match[2])
        })
      }
      originalLog(message)
    })

    mockProcessBookCover.mockResolvedValue({
      success: true,
      urls: { small: 'test', medium: 'test', large: 'test' }
    })

    // Create 50 tasks to trigger batch processing (batch size is 25)
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      isbn: `${i}`,
      workKey: `OL${i}W`,
      providerCoverURL: `http://provider${i}.com/cover.jpg`
    }))

    await coverProcessor.processCovers(tasks)

    // Restore console.log
    console.log = originalLog

    // Should have progress updates for both batches
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1]).toEqual({
      completed: 50,
      total: 50
    })
  }, 10000) // Increase timeout for this test
})