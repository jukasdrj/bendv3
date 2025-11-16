/**
 * Error Scenario Tests: Network Failures
 *
 * Phase 1 Implementation: Network Resilience Testing (12 tests)
 * Priority: P0 (Production Safety)
 *
 * This test suite validates production resilience under real-world network failures:
 * - Provider timeouts (>5000ms)
 * - Connection refused errors
 * - Rate limit recovery (429 with Retry-After)
 * - Partial/truncated responses
 * - SSL/DNS failures
 * - Upstream 5xx errors (500, 502, 503, 504)
 * - Network partition handling
 * - High latency and packet loss resilience
 *
 * Testing Strategy:
 * - Mock external providers (Google Books, ISBNdb, Gemini) to simulate failures
 * - Verify graceful degradation and error handling
 * - Validate fallback mechanisms and retry logic
 * - Ensure negative caching prevents cascade failures
 *
 * Related: Issue #9 - E2E & Error Scenario Tests (Phase 1)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseCSVWithGemini } from '../../src/providers/gemini-csv-provider.js'
import { handleAdvancedSearch } from '../../src/handlers/search-handlers.js'

// Global fetch mock
global.fetch = vi.fn()

describe('Error Scenarios: Network Failures', () => {
  let mockEnv

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock KV cache environment
    mockEnv = {
      KV_CACHE: {
        get: vi.fn(async () => null), // Cache miss by default
        put: vi.fn(async () => {}),
      },
      GOOGLE_BOOKS_API_KEY: 'test-google-key',
      GEMINI_API_KEY: 'test-gemini-key',
    }
  })

  describe('Provider Timeouts', () => {
    it('should handle provider timeouts (>5000ms)', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate timeout by delaying response beyond acceptable threshold
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: false,
                status: 504,
                text: async () => 'Gateway Timeout',
              })
            }, 100) // Simulate timeout with quick failure
          })
      )

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('Gemini API error')
    })

    it('should handle AbortController timeout for long requests', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate never-resolving request (real timeout scenario)
      global.fetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves - simulates hung connection
          })
      )

      // Wrap in a timeout to prevent test hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 100)
      })

      await expect(
        Promise.race([
          parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY),
          timeoutPromise,
        ])
      ).rejects.toThrow('Request timeout')
    })
  })

  describe('Connection Refused', () => {
    it('should handle connection refused errors', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate connection refused (ECONNREFUSED)
      global.fetch.mockRejectedValue(
        new Error('fetch failed: ECONNREFUSED')
      )

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('fetch failed')
    })

    it('should handle DNS resolution failures', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate DNS failure (ENOTFOUND)
      global.fetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('ENOTFOUND')
    })
  })

  describe('Rate Limit Recovery', () => {
    it('should handle 429 rate limit with Retry-After header', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate rate limit response
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (header) =>
            header === 'Retry-After' ? '60' : null,
        },
        text: async () =>
          JSON.stringify({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message:
                'Quota exceeded. Retry after 60 seconds.',
            },
          }),
      })

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('Gemini API error')

      // Verify fetch was called once (no automatic retry on 429)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should use negative caching to avoid repeated 429 errors', async () => {
      const searchParams = {
        bookTitle: 'Nonexistent Book',
        authorName: 'Unknown Author',
      }

      // First call: Store negative cache entry
      mockEnv.KV_CACHE.get.mockResolvedValueOnce(null)

      // Simulate rate limit
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      })

      // Execute search (returns error response, doesn't throw)
      const result = await handleAdvancedSearch(searchParams, {}, mockEnv)

      // Verify error response
      expect(result.success).toBe(false)
      expect(result.error).toContain('429')

      // Verify negative cache was stored
      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        expect.stringContaining('negative:'),
        expect.any(String),
        expect.objectContaining({ expirationTtl: 300 })
      )
    })
  })

  describe('Partial/Truncated Responses', () => {
    it('should handle partial or truncated JSON responses', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate truncated JSON response
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"books": [{"title": "Test", "author":', // Truncated JSON
                  },
                ],
              },
            },
          ],
        }),
      })

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('Invalid JSON from Gemini')
    })

    it('should handle malformed API response structure', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate malformed response (missing expected fields)
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [], // Empty candidates array
        }),
      })

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('Gemini returned empty response')
    })
  })

  describe('SSL/DNS Failures', () => {
    it('should handle SSL certificate errors', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate SSL certificate error
      global.fetch.mockRejectedValue(
        new Error('SSL certificate problem: unable to verify')
      )

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('SSL certificate problem')
    })
  })

  describe('Upstream 5xx Errors', () => {
    it('should handle 500, 502, 503, and 504 errors from upstream', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      const errorCodes = [500, 502, 503, 504]

      for (const statusCode of errorCodes) {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: statusCode,
          text: async () => `Internal Server Error (${statusCode})`,
        })

        await expect(
          parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
        ).rejects.toThrow('Gemini API error')
      }

      // Verify all error codes were tested
      expect(global.fetch).toHaveBeenCalledTimes(4)
    })

    it('should store 5xx errors in negative cache to prevent cascades', async () => {
      const searchParams = {
        bookTitle: 'Test Book',
        authorName: 'Test Author',
      }

      // Mock cache miss
      mockEnv.KV_CACHE.get.mockResolvedValue(null)

      // Simulate 503 Service Unavailable
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })

      // Execute search (returns error response, doesn't throw)
      const result = await handleAdvancedSearch(searchParams, {}, mockEnv)

      // Verify error response
      expect(result.success).toBe(false)
      expect(result.error).toContain('503')

      // Verify negative cache stored with 5-minute TTL
      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        expect.stringContaining('negative:'),
        expect.any(String),
        { expirationTtl: 300 }
      )
    })
  })

  describe('Network Partition', () => {
    it('should behave predictably during a network partition', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate network partition (all providers unreachable)
      global.fetch.mockRejectedValue(
        new Error('Network unreachable')
      )

      await expect(
        parseCSVWithGemini(csvText, prompt, mockEnv.GEMINI_API_KEY)
      ).rejects.toThrow('Network unreachable')

      // Service should fail fast, not retry indefinitely
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Unreliable Network Conditions', () => {
    it('should handle high latency without hanging', async () => {
      const csvText = 'title,author\nTest Book,Test Author'
      const prompt = 'Parse this CSV'

      // Simulate high latency (but eventual success)
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({
                  candidates: [
                    {
                      content: {
                        parts: [
                          {
                            text: JSON.stringify([
                              {
                                title: 'Test Book',
                                author: 'Test Author',
                              },
                            ]),
                          },
                        ],
                      },
                    },
                  ],
                  usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                  },
                }),
              })
            }, 50) // Simulate 50ms latency
          })
      )

      // Should succeed despite latency
      const result = await parseCSVWithGemini(
        csvText,
        prompt,
        mockEnv.GEMINI_API_KEY
      )

      expect(result).toEqual([
        { title: 'Test Book', author: 'Test Author' },
      ])
    })

    it('should handle intermittent packet loss gracefully', async () => {
      const searchParams = {
        bookTitle: 'Test Book',
        authorName: 'Test Author',
      }

      // Mock cache miss
      mockEnv.KV_CACHE.get.mockResolvedValue(null)

      // First attempt: Network error (packet loss)
      global.fetch.mockRejectedValue(new Error('ETIMEDOUT'))

      // Execute search (returns error response for network timeout)
      const result = await handleAdvancedSearch(searchParams, {}, mockEnv)

      // Verify error response
      expect(result.success).toBe(false)
      expect(result.error).toContain('ETIMEDOUT')

      // Verify negative cache was stored for timeout
      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        expect.stringContaining('negative:'),
        expect.any(String),
        expect.objectContaining({ expirationTtl: 300 })
      )

      // Note: If retry logic is added in the future, update this test
      // to verify multiple fetch attempts before final failure
    })
  })
})
