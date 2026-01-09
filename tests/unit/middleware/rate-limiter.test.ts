/**
 * Rate Limiter Middleware - RFC 9457 Compliance Tests
 *
 * Validates that rate limit responses follow RFC 9457 Problem Details standard.
 *
 * Test Coverage:
 * - RFC 9457 response structure
 * - HTTP headers (Content-Type, Retry-After, X-RateLimit-*)
 * - Request correlation (X-Request-ID)
 * - Retry logic (retryable, retryAfterMs)
 * - Endpoint-specific rate limits
 * - Fail-open behavior on Durable Object errors
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { checkRateLimit } from '../../../src/middleware/rate-limiter'
import type { Env } from '../../../src/types/env'

// Mock Durable Object stub
interface MockRateLimiterStub {
  fetch: ReturnType<typeof vi.fn>
}

describe('Rate Limiter - RFC 9457 Compliance', () => {
  let mockEnv: Partial<Env>
  let mockRequest: Request
  let mockRateLimiterStub: MockRateLimiterStub

  beforeEach(() => {
    // Reset mocks
    mockRateLimiterStub = {
      fetch: vi.fn(),
    }

    mockEnv = {
      RATE_LIMITER_DO: {
        idFromName: vi.fn().mockReturnValue('mock-do-id'),
        get: vi.fn().mockReturnValue(mockRateLimiterStub),
      } as any,
    }

    mockRequest = new Request('https://api.oooefam.net/v3/books/search?q=test', {
      method: 'GET',
      headers: {
        'CF-Connecting-IP': '192.168.1.100',
      },
    })
  })

  // =============================================================================
  // RFC 9457 Response Structure Tests
  // =============================================================================

  describe('RFC 9457 Response Structure', () => {
    it('should return RFC 9457 Problem Details when rate limit exceeded', async () => {
      // Mock DO response: rate limit exceeded
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000, // 60 seconds from now
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      expect(response).not.toBeNull()
      expect(response?.status).toBe(429)

      const body = await response?.json()

      // RFC 9457 Required Fields
      expect(body.type).toBe('https://api.oooefam.net/errors/rate-limit-exceeded')
      expect(body.title).toBe('Rate Limit Exceeded')
      expect(body.status).toBe(429)
      expect(body.detail).toContain('Rate limit exceeded')

      // RFC 9457 Optional Fields
      expect(body.instance).toBe('https://api.oooefam.net/v3/books/search?q=test')

      // BooksTrack Extensions
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(body.retryable).toBe(true)
      expect(body.retryAfterMs).toBeGreaterThan(0)
      expect(body.metadata).toBeDefined()
      expect(body.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should set success discriminator to false', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const body = await response?.json()

      expect(body.success).toBe(false)
    })

    it('should include instance field with full URL (not just pathname)', async () => {
      const requestWithQuery = new Request(
        'https://api.oooefam.net/v3/books/search?q=harry+potter&limit=50',
        {
          method: 'GET',
          headers: { 'CF-Connecting-IP': '192.168.1.100' },
        },
      )

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(requestWithQuery, mockEnv as Env)
      const body = await response?.json()

      // Should include query parameters (full URL, not just pathname)
      expect(body.instance).toBe('https://api.oooefam.net/v3/books/search?q=harry+potter&limit=50')
      expect(body.instance).toContain('?q=')
      expect(body.instance).toContain('&limit=')
    })
  })

  // =============================================================================
  // HTTP Headers Tests
  // =============================================================================

  describe('HTTP Headers Compliance', () => {
    it('should set Content-Type to application/problem+json', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      expect(response?.headers.get('Content-Type')).toBe('application/problem+json')
    })

    it('should include RFC 6585 Retry-After header in seconds', async () => {
      const resetAt = Date.now() + 30000 // 30 seconds from now

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const retryAfter = response?.headers.get('Retry-After')

      expect(retryAfter).toBeDefined()
      expect(Number.parseInt(retryAfter!)).toBeGreaterThan(0)
      expect(Number.parseInt(retryAfter!)).toBeLessThanOrEqual(30)
    })

    it('should include X-RateLimit-* headers', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      expect(response?.headers.get('X-RateLimit-Limit')).toBe('100') // Default limit
      expect(response?.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response?.headers.get('X-RateLimit-Reset')).toBeDefined()
    })

    it('should match retryAfterMs in body with Retry-After header', async () => {
      const resetAt = Date.now() + 45000 // 45 seconds from now

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const body = await response?.json()
      const retryAfterHeader = response?.headers.get('Retry-After')

      // Header is in seconds, body is in milliseconds
      const headerSeconds = Number.parseInt(retryAfterHeader!)
      const bodyMs = body.retryAfterMs

      expect(bodyMs).toBe(headerSeconds * 1000)
    })
  })

  // =============================================================================
  // Request Correlation Tests
  // =============================================================================

  describe('Request ID Correlation', () => {
    it('should extract X-Request-ID from headers when present', async () => {
      const requestWithId = new Request('https://api.oooefam.net/v3/books/search', {
        method: 'GET',
        headers: {
          'CF-Connecting-IP': '192.168.1.100',
          'X-Request-ID': '550e8400-e29b-41d4-a716-446655440000',
        },
      })

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(requestWithId, mockEnv as Env)
      const body = await response?.json()

      expect(body.metadata.requestId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('should handle missing X-Request-ID gracefully (rate limiter runs before request-context middleware)', async () => {
      // Request without X-Request-ID header (typical case)
      const requestWithoutId = new Request('https://api.oooefam.net/v3/books/search', {
        method: 'GET',
        headers: { 'CF-Connecting-IP': '192.168.1.100' },
      })

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(requestWithoutId, mockEnv as Env)
      const body = await response?.json()

      // requestId should be undefined (optional field per RFC 9457)
      expect(body.metadata.requestId).toBeUndefined()
    })
  })

  // =============================================================================
  // Retry Logic Tests
  // =============================================================================

  describe('Retry Guidance', () => {
    it('should mark error as retryable', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const body = await response?.json()

      expect(body.retryable).toBe(true)
    })

    it('should calculate retryAfterMs correctly', async () => {
      const resetAt = Date.now() + 90000 // 90 seconds from now

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const body = await response?.json()

      expect(body.retryAfterMs).toBeGreaterThan(85000) // At least 85 seconds
      expect(body.retryAfterMs).toBeLessThanOrEqual(90000) // At most 90 seconds
    })

    it('should ensure minimum retry time of 1 second', async () => {
      const resetAt = Date.now() - 1000 // 1 second in the past (edge case)

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)
      const body = await response?.json()

      // Should be at least 1 second (Math.max(1, retryAfterSeconds))
      expect(body.retryAfterMs).toBeGreaterThanOrEqual(1000)
      expect(response?.headers.get('Retry-After')).toBe('1')
    })
  })

  // =============================================================================
  // Endpoint-Specific Rate Limits
  // =============================================================================

  describe('Endpoint-Specific Rate Limits', () => {
    it('should apply default limit (100 req/min) for standard endpoints', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      expect(response?.headers.get('X-RateLimit-Limit')).toBe('100')
    })

    it('should apply custom limit when provided', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env, 30)

      expect(response?.headers.get('X-RateLimit-Limit')).toBe('30')
    })

    it('should pass endpoint-specific limit to Durable Object', async () => {
      const aiRequest = new Request('https://api.oooefam.net/api/batch-scan', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '192.168.1.100' },
      })

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 })),
      )

      await checkRateLimit(aiRequest, mockEnv as Env)

      // Verify DO was called with AI endpoint limit (5 req/min)
      const doRequest = mockRateLimiterStub.fetch.mock.calls[0][0] as Request
      expect(doRequest.headers.get('X-Rate-Limit-Max')).toBe('5')
    })
  })

  // =============================================================================
  // Pass-Through Behavior
  // =============================================================================

  describe('Pass-Through When Under Limit', () => {
    it('should return null when request is allowed', async () => {
      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: true,
            remaining: 95,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      expect(response).toBeNull()
    })
  })

  // =============================================================================
  // Fail-Open Behavior
  // =============================================================================

  describe('Fail-Open on Durable Object Errors', () => {
    it('should return null (allow request) when Durable Object fails', async () => {
      mockRateLimiterStub.fetch.mockRejectedValue(new Error('DO fetch failed'))

      const response = await checkRateLimit(mockRequest, mockEnv as Env)

      // Should fail open (return null) to maintain availability
      expect(response).toBeNull()
    })

    it('should log error when Durable Object fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockRateLimiterStub.fetch.mockRejectedValue(new Error('DO connection timeout'))

      await checkRateLimit(mockRequest, mockEnv as Env)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Rate Limit] Error checking rate limit:',
        expect.any(Error),
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Rate Limit] Failing open - allowing request despite error',
      )

      consoleErrorSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    })
  })

  // =============================================================================
  // Privacy & Security Tests
  // =============================================================================

  describe('Privacy & Security', () => {
    it('should mask client IP in console logs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
          }),
        ),
      )

      await checkRateLimit(mockRequest, mockEnv as Env)

      // Should mask IP (only show first 8 chars)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('192.168.'),
        // Should NOT contain full IP
      )
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('192.168.1.100'))

      consoleWarnSpy.mockRestore()
    })

    it('should handle unknown client IP gracefully', async () => {
      const requestWithoutIP = new Request('https://api.oooefam.net/v3/books/search', {
        method: 'GET',
        // No CF-Connecting-IP header
      })

      mockRateLimiterStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })),
      )

      const response = await checkRateLimit(requestWithoutIP, mockEnv as Env)

      // Should use 'unknown' as fallback and not crash
      expect(response).toBeNull()
      expect(mockEnv.RATE_LIMITER_DO?.idFromName).toHaveBeenCalledWith('unknown')
    })
  })
})
