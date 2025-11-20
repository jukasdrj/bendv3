/**
 * Test for Hono Analytics Middleware
 * Validates fix for: TypeError: Cannot read properties of undefined (reading 'catch')
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { analyticsMiddleware } from '../../src/middleware/hono-analytics.ts'

describe('Hono Analytics Middleware - TypeError Fix', () => {
  let app

  beforeEach(() => {
    app = new Hono()
    app.use('*', analyticsMiddleware())
    app.get('/test', (c) => c.json({ ok: true }))
  })

  it('should not crash when PERFORMANCE_ANALYTICS is undefined', async () => {
    // Arrange: Create env without PERFORMANCE_ANALYTICS binding
    const env = {
      ENABLE_PERFORMANCE_LOGGING: 'true',
      // PERFORMANCE_ANALYTICS is intentionally undefined
    }

    const mockExecutionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    // Act: Make a request with analytics enabled but binding undefined
    const req = new Request('http://localhost/test')
    const res = await app.fetch(req, env, mockExecutionCtx)

    // Assert: Should succeed without throwing TypeError
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)

    // Should still add router headers
    expect(res.headers.get('X-Router')).toBe('hono')
    expect(res.headers.get('X-Response-Time')).toBeTruthy()

    // waitUntil should NOT be called when PERFORMANCE_ANALYTICS is undefined
    expect(mockExecutionCtx.waitUntil).not.toHaveBeenCalled()
  })

  it('should not crash when PERFORMANCE_ANALYTICS is undefined on subsequent requests', async () => {
    // Arrange: Simulate the scenario from the issue - first request works, second crashes
    const env = {
      ENABLE_PERFORMANCE_LOGGING: 'true',
      // PERFORMANCE_ANALYTICS is intentionally undefined
    }

    const mockExecutionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    // Act: Make FIRST request
    const req1 = new Request('http://localhost/test')
    const res1 = await app.fetch(req1, env, mockExecutionCtx)
    expect(res1.status).toBe(200)

    // Act: Make SECOND request (this used to crash with TypeError)
    const req2 = new Request('http://localhost/test')
    const res2 = await app.fetch(req2, env, mockExecutionCtx)

    // Assert: Should succeed without throwing TypeError
    expect(res2.status).toBe(200)
    const data = await res2.json()
    expect(data.ok).toBe(true)
  })

  it('should call writeDataPoint when PERFORMANCE_ANALYTICS is defined', async () => {
    // Arrange: Create env WITH PERFORMANCE_ANALYTICS binding
    const mockWriteDataPoint = vi.fn().mockResolvedValue(undefined)
    const env = {
      ENABLE_PERFORMANCE_LOGGING: 'true',
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: mockWriteDataPoint,
      },
    }

    const mockExecutionCtx = {
      waitUntil: vi.fn((promise) => promise), // Execute the promise
      passThroughOnException: vi.fn(),
    }

    // Act: Make a request with analytics enabled and binding available
    const req = new Request('http://localhost/test')
    
    // Mock Math.random to always return < 0.1 (within 10% sampling)
    const originalRandom = Math.random
    Math.random = () => 0.05 // Always within 10% sampling rate
    
    const res = await app.fetch(req, env, mockExecutionCtx)
    
    // Restore Math.random
    Math.random = originalRandom

    // Assert: Should succeed
    expect(res.status).toBe(200)

    // waitUntil should be called with the analytics promise
    expect(mockExecutionCtx.waitUntil).toHaveBeenCalled()

    // Wait for the promise to resolve
    await mockExecutionCtx.waitUntil.mock.calls[0][0]

    // writeDataPoint should have been called
    expect(mockWriteDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: expect.arrayContaining(['hono_router', 'GET', '/test']),
        doubles: expect.any(Array),
        indexes: expect.any(Array),
      })
    )
  })

  it('should handle writeDataPoint errors gracefully', async () => {
    // Arrange: Create env with PERFORMANCE_ANALYTICS that throws an error
    const mockWriteDataPoint = vi.fn().mockRejectedValue(new Error('Analytics Engine error'))
    const env = {
      ENABLE_PERFORMANCE_LOGGING: 'true',
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: mockWriteDataPoint,
      },
    }

    const mockExecutionCtx = {
      waitUntil: vi.fn((promise) => promise),
      passThroughOnException: vi.fn(),
    }

    // Mock console.error to suppress error output
    const originalError = console.error
    console.error = vi.fn()

    // Act: Make a request
    const req = new Request('http://localhost/test')
    
    // Mock Math.random to always return < 0.1 (within 10% sampling)
    const originalRandom = Math.random
    Math.random = () => 0.05
    
    const res = await app.fetch(req, env, mockExecutionCtx)
    
    // Restore
    Math.random = originalRandom
    console.error = originalError

    // Assert: Should succeed despite analytics error
    expect(res.status).toBe(200)

    // writeDataPoint should have been called and thrown error
    expect(mockWriteDataPoint).toHaveBeenCalled()

    // Error should have been caught by .catch()
    try {
      await mockExecutionCtx.waitUntil.mock.calls[0][0]
    } catch (e) {
      // Should not throw - error is caught by .catch() in middleware
      expect(true).toBe(false) // This should not execute
    }
  })

  it('should not log analytics when sampling rate filters it out', async () => {
    // Arrange
    const mockWriteDataPoint = vi.fn().mockResolvedValue(undefined)
    const env = {
      ENABLE_PERFORMANCE_LOGGING: 'true',
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: mockWriteDataPoint,
      },
    }

    const mockExecutionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    // Mock Math.random to return > 0.1 (outside 10% sampling)
    const originalRandom = Math.random
    Math.random = () => 0.95 // Outside 10% sampling rate
    
    // Act
    const req = new Request('http://localhost/test')
    const res = await app.fetch(req, env, mockExecutionCtx)
    
    // Restore
    Math.random = originalRandom

    // Assert
    expect(res.status).toBe(200)
    
    // waitUntil should NOT be called (filtered by sampling)
    expect(mockExecutionCtx.waitUntil).not.toHaveBeenCalled()
    expect(mockWriteDataPoint).not.toHaveBeenCalled()
  })
})
