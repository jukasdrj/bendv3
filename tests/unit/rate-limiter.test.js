/**
 * Unit Tests: Rate Limiter Middleware
 *
 * Tests for Durable Object-based rate limiter with atomic operations.
 * CRITICAL: Tests race condition fix (TOCTOU vulnerability in KV-based version)
 *
 * Security Context:
 * - Prevents denial-of-wallet attacks (~$10+/min cost exposure)
 * - Protects expensive AI/enrichment endpoints
 * - Rate limit: 10 requests per minute per IP
 *
 * Implementation: Durable Objects guarantee atomic read-modify-write
 * See: src/durable-objects/rate-limiter.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkRateLimit } from '../../src/middleware/rate-limiter.js'

// Mock DurableObject base class for testing
class MockDurableObject {
  constructor(state, env) {
    this.state = state
    this.env = env
  }
}

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}))

// Import after mocking
const { RateLimiterDO } = await import(
  '../../src/durable-objects/rate-limiter.js'
)

/**
 * RateLimiterDO Core Logic Tests
 * Validates atomic counter operations and window management
 */
describe('RateLimiterDO - Core Logic', () => {
  let mockState
  let rateLimiter

  beforeEach(() => {
    // Mock Durable Object storage
    let storage = {}
    mockState = {
      storage: {
        get: vi.fn(async (key) => storage[key]),
        put: vi.fn(async (key, value) => {
          storage[key] = value
        }),
      },
    }

    rateLimiter = new RateLimiterDO(mockState, {})
  })

  it('should allow first request from new IP', async () => {
    const result = await rateLimiter.checkAndIncrement()

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9) // 10 - 1 = 9 remaining
    expect(result.resetAt).toBeGreaterThan(Date.now())
    expect(mockState.storage.put).toHaveBeenCalledTimes(1)
  })

  it('should allow up to 10 requests within window', async () => {
    // Make 10 sequential requests
    for (let i = 0; i < 10; i++) {
      const result = await rateLimiter.checkAndIncrement()
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9 - i)
    }
  })

  it('should block 11th request (rate limit exceeded)', async () => {
    // Make 10 allowed requests
    for (let i = 0; i < 10; i++) {
      await rateLimiter.checkAndIncrement()
    }

    // 11th request should be blocked
    const result = await rateLimiter.checkAndIncrement()

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    // Counter should NOT increment when blocked
    const state = await mockState.storage.get('counters')
    expect(state.count).toBe(10) // Still 10, not 11
  })

  it('should reset counter after window expires', async () => {
    // Make 10 requests (exhaust limit)
    for (let i = 0; i < 10; i++) {
      await rateLimiter.checkAndIncrement()
    }

    // 11th request blocked
    const blocked = await rateLimiter.checkAndIncrement()
    expect(blocked.allowed).toBe(false)

    // Simulate time passage (61 seconds)
    const state = await mockState.storage.get('counters')
    state.resetAt = Date.now() - 1000 // Expire window
    await mockState.storage.put('counters', state)

    // Next request should reset counter and allow
    const afterReset = await rateLimiter.checkAndIncrement()
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(9)

    // Verify counter was reset
    const newState = await mockState.storage.get('counters')
    expect(newState.count).toBe(1) // Reset and incremented
  })

  it('should not increment counter when request is blocked', async () => {
    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      await rateLimiter.checkAndIncrement()
    }

    const beforeBlock = await mockState.storage.get('counters')
    const countBefore = beforeBlock.count

    // Attempt 5 more requests (all should be blocked)
    for (let i = 0; i < 5; i++) {
      const result = await rateLimiter.checkAndIncrement()
      expect(result.allowed).toBe(false)
    }

    const afterBlock = await mockState.storage.get('counters')
    // Counter should remain unchanged
    expect(afterBlock.count).toBe(countBefore)
  })

  it('should return correct remaining count', async () => {
    // Test remaining count decreases correctly
    const results = []
    for (let i = 0; i < 10; i++) {
      const result = await rateLimiter.checkAndIncrement()
      results.push(result.remaining)
    }

    expect(results).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
  })
})

/**
 * RateLimiterDO Fetch Handler Tests
 * Validates HTTP interface for middleware integration
 */
describe('RateLimiterDO - Fetch Handler', () => {
  let mockState
  let rateLimiter

  beforeEach(() => {
    let storage = {}
    mockState = {
      storage: {
        get: vi.fn(async (key) => storage[key]),
        put: vi.fn(async (key, value) => {
          storage[key] = value
        }),
      },
    }

    rateLimiter = new RateLimiterDO(mockState, {})
  })

  it('should handle POST request and return JSON', async () => {
    const request = new Request('http://localhost/check', {
      method: 'POST',
    })

    const response = await rateLimiter.fetch(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')

    const data = await response.json()
    expect(data).toHaveProperty('allowed')
    expect(data).toHaveProperty('remaining')
    expect(data).toHaveProperty('resetAt')
  })

  it('should reject non-POST requests', async () => {
    const request = new Request('http://localhost/check', {
      method: 'GET',
    })

    const response = await rateLimiter.fetch(request)

    expect(response.status).toBe(405)
    expect(await response.text()).toBe('Method not allowed')
  })
})

/**
 * Rate Limiter Middleware Tests
 * Validates integration with Worker routing
 */
describe('Rate Limiter Middleware', () => {
  let mockEnv

  beforeEach(() => {
    // Mock Durable Object stub
    let rateLimiterState = {
      count: 0,
      resetAt: Date.now() + 60000,
    }

    const mockDOStub = {
      fetch: vi.fn(async () => {
        // Simulate checkAndIncrement logic
        const allowed = rateLimiterState.count < 10

        if (allowed) {
          rateLimiterState.count++
        }

        const remaining = Math.max(0, 10 - rateLimiterState.count)

        return new Response(
          JSON.stringify({
            allowed,
            remaining,
            resetAt: rateLimiterState.resetAt,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }),
    }

    mockEnv = {
      RATE_LIMITER_DO: {
        idFromName: vi.fn(() => 'mock-id'),
        get: vi.fn(() => mockDOStub),
      },
    }
  })

  it('should allow request when under limit', async () => {
    const request = new Request('http://localhost/api/search', {
      headers: { 'CF-Connecting-IP': '192.168.1.100' },
    })

    const result = await checkRateLimit(request, mockEnv)

    expect(result).toBeNull() // null = allowed
    expect(mockEnv.RATE_LIMITER_DO.idFromName).toHaveBeenCalledWith(
      '192.168.1.100',
    )
  })

  it('should block request when limit exceeded', async () => {
    const request = new Request('http://localhost/api/search', {
      headers: { 'CF-Connecting-IP': '192.168.1.200' },
    })

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(request, mockEnv)
    }

    // 11th request should be blocked
    const result = await checkRateLimit(request, mockEnv)

    expect(result).not.toBeNull()
    expect(result.status).toBe(429)

    const body = await result.json()
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(body.error).toContain('Rate limit exceeded')
    expect(body.details.retryAfter).toBeGreaterThan(0)
    expect(body.details.requestsLimit).toBe(10)
  })

  it('should include rate limit headers in 429 response', async () => {
    const request = new Request('http://localhost/api/search', {
      headers: { 'CF-Connecting-IP': '192.168.1.300' },
    })

    // Exhaust limit
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(request, mockEnv)
    }

    const result = await checkRateLimit(request, mockEnv)

    expect(result.headers.get('Retry-After')).toBeTruthy()
    expect(result.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(result.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(result.headers.get('X-RateLimit-Reset')).toBeTruthy()
  })

  it('should handle missing CF-Connecting-IP header', async () => {
    const request = new Request('http://localhost/api/search', {
      headers: {},
    })

    const result = await checkRateLimit(request, mockEnv)

    // Should use "unknown" as fallback
    expect(mockEnv.RATE_LIMITER_DO.idFromName).toHaveBeenCalledWith('unknown')
  })

  it('should fail open when Durable Object throws error', async () => {
    const mockEnvError = {
      RATE_LIMITER_DO: {
        idFromName: vi.fn(() => 'mock-id'),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => {
            throw new Error('DO unavailable')
          }),
        })),
      },
    }

    const request = new Request('http://localhost/api/search', {
      headers: { 'CF-Connecting-IP': '192.168.1.400' },
    })

    const result = await checkRateLimit(request, mockEnvError)

    // Should allow request (fail open)
    expect(result).toBeNull()
  })
})

/**
 * CRITICAL: Race Condition Prevention Tests
 * Validates fix for TOCTOU vulnerability (Issue #41)
 */
describe('Race Condition Prevention (Issue #41)', () => {
  it('should serialize concurrent requests through single DO instance', async () => {
    let storage = {}
    const mockState = {
      storage: {
        get: vi.fn(async (key) => storage[key]),
        put: vi.fn(async (key, value) => {
          storage[key] = value
        }),
      },
    }

    const rateLimiter = new RateLimiterDO(mockState, {})

    // Simulate 100 concurrent requests (race condition scenario)
    // In production, the DO's single-threaded execution model serializes these
    // In tests, we validate that sequential processing respects the limit
    const results = []
    for (let i = 0; i < 100; i++) {
      const result = await rateLimiter.checkAndIncrement()
      results.push(result)
    }

    // Count how many were allowed
    const allowedCount = results.filter((r) => r.allowed).length

    // CRITICAL: Exactly 10 should be allowed (atomic guarantee)
    // KV-based implementation would have race condition vulnerability
    // DO's single-threaded execution prevents this
    expect(allowedCount).toBe(10)

    // Verify final counter state
    const finalState = await mockState.storage.get('counters')
    expect(finalState.count).toBe(10) // Not 100!

    // Verify the first 10 were allowed, rest were blocked
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true)
    expect(results.slice(10).every((r) => !r.allowed)).toBe(true)
  })

  it('should maintain atomic counter integrity under high concurrency', async () => {
    let storage = {}
    const mockState = {
      storage: {
        get: vi.fn(async (key) => storage[key]),
        put: vi.fn(async (key, value) => {
          storage[key] = value
        }),
      },
    }

    const rateLimiter = new RateLimiterDO(mockState, {})

    // 5 waves of 20 concurrent requests each
    for (let wave = 0; wave < 5; wave++) {
      const requests = Array.from({ length: 20 }, () =>
        rateLimiter.checkAndIncrement(),
      )

      await Promise.all(requests)
    }

    const finalState = await mockState.storage.get('counters')

    // Counter should be exactly 10 (limit enforced atomically)
    expect(finalState.count).toBe(10)
  })
})
