import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleMetricsRequest } from '../../src/handlers/metrics-handler.js'

describe('Metrics Handler Integration Tests', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    // Mock Durable Object stub with getStats method
    const mockDOStub = {
      getStats: vi.fn(async () => ({
        currentMinute: { hits: 100, misses: 10 },
        currentHour: { hits: 1000, misses: 100 },
        currentDay: { hits: 10000, misses: 1000 },
        total: { hits: 50000, misses: 5000, reads: 55000, writes: 1000 },
        websocket: { connectionsEstablished: 50, totalConnectionDuration: 500000 },
        d1: { queryCount: 100, totalLatencyMs: 2000 },
        apiContract: { totalValidations: 1000, validationFailures: 10 },
        externalApi: { googleBooks: { requestCount: 100 }, isbndb: { requestCount: 50 }, gemini: { requestCount: 20 } }
      }))
    }

    mockEnv = {
      METRICS_API_KEY: 'test_metrics_key_123',
      KV_CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {})
      },
      CACHE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      },
      CACHE_METRICS_DO: {
        idFromName: vi.fn(() => 'mock-id'),
        get: vi.fn(() => mockDOStub)
      }
    }

    mockCtx = {
      waitUntil: vi.fn((promise) => promise)
    }
  })

  describe('Authentication', () => {
    it('should return 401 without Authorization header', async () => {
      const request = new Request('https://api.example.com/metrics')

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(response.status).toBe(401)
      // ResponseEnvelope format: no success field, error object present for errors
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('UNAUTHORIZED')
      expect(data.error.message).toContain('Authorization')
    })

    it('should return 401 with malformed Authorization header', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'InvalidFormat'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('UNAUTHORIZED')
    })

    it('should return 403 with invalid token', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer wrong_token'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('should accept valid token', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)

      expect(response.status).toBe(200)
    })

    it('should use default key when METRICS_API_KEY not set', async () => {
      delete mockEnv.METRICS_API_KEY

      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer metrics_default_key'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)

      expect(response.status).toBe(200)
    })
  })

  describe('Response Formats', () => {
    it('should return JSON format by default', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('period')
      expect(data).toHaveProperty('hitRates')
      expect(data).toHaveProperty('volume')
      expect(data).toHaveProperty('costs')
      expect(data).toHaveProperty('health')
    })

    it('should return Prometheus format when requested', async () => {
      const request = new Request('https://api.example.com/metrics?format=prometheus', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const text = await response.text()

      expect(response.headers.get('Content-Type')).toBe('text/plain; version=0.0.4')
      expect(text).toContain('# HELP cache_hit_rate')
      expect(text).toContain('# TYPE cache_hit_rate gauge')
      expect(text).toContain('cache_hit_rate{tier="edge"}')
      expect(text).toContain('cache_hit_rate{tier="kv"}')
      expect(text).toContain('cache_hit_rate{tier="combined"}')
      expect(text).toContain('# HELP cache_requests_total')
      expect(text).toContain('# TYPE cache_requests_total counter')
    })
  })

  describe('Period Parameters', () => {
    it('should support 15m period', async () => {
      const request = new Request('https://api.example.com/metrics?period=15m', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('15m')
    })

    it('should support 1h period (default)', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('1h')
    })

    it('should support 24h period', async () => {
      const request = new Request('https://api.example.com/metrics?period=24h', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('24h')
    })

    it('should support 7d period', async () => {
      const request = new Request('https://api.example.com/metrics?period=7d', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('7d')
    })
  })

  describe('Cache Behavior', () => {
    it('should return cached data when available', async () => {
      const cachedData = JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        period: '1h',
        hitRates: { edge: 80, kv: 15, combined: 95 }
      })

      mockEnv.KV_CACHE.get.mockResolvedValue(cachedData)

      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v1:1h')
      expect(data.timestamp).toBe('2025-01-01T00:00:00Z')
    })

    it('should cache fresh metrics with 5min TTL', async () => {
      const request = new Request('https://api.example.com/metrics?period=24h', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      await handleMetricsRequest(request, mockEnv, mockCtx)

      expect(mockCtx.waitUntil).toHaveBeenCalled()
      await mockCtx.waitUntil.mock.calls[0][0]

      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        'metrics:v1:24h',
        expect.any(String),
        { expirationTtl: 300 }
      )
    })

    it('should use different cache keys for different periods', async () => {
      const request1 = new Request('https://api.example.com/metrics?period=1h', {
        headers: { 'Authorization': 'Bearer test_metrics_key_123' }
      })
      const request2 = new Request('https://api.example.com/metrics?period=24h', {
        headers: { 'Authorization': 'Bearer test_metrics_key_123' }
      })

      await handleMetricsRequest(request1, mockEnv, mockCtx)
      await handleMetricsRequest(request2, mockEnv, mockCtx)

      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v1:1h')
      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v1:24h')
    })
  })

  describe('Metrics Content', () => {
    it('should include cost estimates', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.costs).toBeDefined()
      expect(data.costs).toHaveProperty('kv_reads_estimate')
      expect(data.costs).toHaveProperty('r2_reads')
      expect(data.costs).toHaveProperty('total_estimate')
    })

    it('should include health assessment', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.health).toBeDefined()
      expect(data.health).toHaveProperty('status')
      expect(data.health).toHaveProperty('issues')
      expect(['healthy', 'degraded']).toContain(data.health.status)
    })

    it('should include Analytics Engine limitation notice', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data._limitation).toBeDefined()
      expect(data._solution).toBeDefined()
      expect(data._graphql_endpoint).toBe('https://api.cloudflare.com/client/v4/graphql')
    })
  })

  describe('Error Handling', () => {
    it('should handle aggregation errors gracefully', async () => {
      // Force an error by making KV throw
      mockEnv.KV_CACHE.get.mockRejectedValue(new Error('KV unavailable'))

      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch metrics')
      expect(data.message).toContain('KV unavailable')
    })
  })
})
