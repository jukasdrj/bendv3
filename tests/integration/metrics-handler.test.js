import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleMetricsRequest } from '../../src/handlers/metrics-handler.js'

describe('Metrics Handler Integration Tests', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    // Mock Durable Object stub with getStats method
    const mockDOStub = {
      getStats: vi.fn(async () => ({
        currentMinute: {
          total: { hits: 100, misses: 10, reads: 110, writes: 5, churns: 1 },
          websocket: {}, d1: {}, apiContract: {}, externalApi: {}
        },
        currentHour: {
          total: { hits: 1000, misses: 100, reads: 1100, writes: 50, churns: 10 },
          websocket: {}, d1: {}, apiContract: {}, externalApi: {}
        },
        currentDay: {
          total: { hits: 10000, misses: 1000, reads: 11000, writes: 500, churns: 100 },
          websocket: {}, d1: {}, apiContract: {}, externalApi: {}
        },
        total: {
          hits: 50000,
          misses: 5000,
          reads: 55000,
          writes: 1000,
          churns: 200
        },
        websocket: {
          total: { connectionsEstablished: 50, totalConnectionDuration: 500000 }
        },
        d1: {
          total: { queryCount: 100, totalLatencyMs: 2000 }
        },
        apiContract: {
          total: { totalValidations: 1000, validationFailures: 10 }
        },
        externalApi: {
          total: {
            googleBooks: { requestCount: 100, quotaRemaining: 900 },
            isbndb: { requestCount: 50, quotaRemaining: 4950 },
            gemini: { requestCount: 20, tokensUsed: 20000 }
          }
        }
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
      expect(data).toHaveProperty('cache')
      expect(data).toHaveProperty('health')
      expect(data).toHaveProperty('derived')
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
      expect(text).toContain('# HELP cache_operations_total Total cache operations by type')
      expect(text).toContain('# TYPE cache_operations_total counter')
      expect(text).toContain('d1_queries_total{type="read"}')
      expect(text).toContain('websocket_connections_total')
      expect(text).toContain('external_api_requests_total{provider="google_books"}')
      expect(text).toContain('system_health')
    })
  })

  describe('Period Parameters', () => {
    it('should support "minute" period', async () => {
      const request = new Request('https://api.example.com/metrics?period=minute', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('minute')
    })

    it('should support "hour" period (default)', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('hour')
    })

    it('should support "day" period', async () => {
      const request = new Request('https://api.example.com/metrics?period=day', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('day')
    })

    it('should support "total" period', async () => {
      const request = new Request('https://api.example.com/metrics?period=total', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.period).toBe('total')
    })
  })

  describe('Cache Behavior', () => {
    it('should return cached data when available', async () => {
      const cachedData = JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        period: 'hour',
        cache: { currentHour: { hits: 80, misses: 20 } }
      })

      mockEnv.KV_CACHE.get.mockResolvedValue(cachedData)

      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v2:hour')
      expect(data.timestamp).toBe('2025-01-01T00:00:00Z')
    })

    it('should cache fresh metrics with 5min TTL', async () => {
      const request = new Request('https://api.example.com/metrics?period=day', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      await handleMetricsRequest(request, mockEnv, mockCtx)

      expect(mockCtx.waitUntil).toHaveBeenCalled()
      await mockCtx.waitUntil.mock.calls[0][0]

      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        'metrics:v2:day',
        expect.any(String),
        { expirationTtl: 300 }
      )
    })

    it('should use different cache keys for different periods', async () => {
      const request1 = new Request('https://api.example.com/metrics?period=hour', {
        headers: { 'Authorization': 'Bearer test_metrics_key_123' }
      })
      const request2 = new Request('https://api.example.com/metrics?period=day', {
        headers: { 'Authorization': 'Bearer test_metrics_key_123' }
      })

      await handleMetricsRequest(request1, mockEnv, mockCtx)
      await handleMetricsRequest(request2, mockEnv, mockCtx)

      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v2:hour')
      expect(mockEnv.KV_CACHE.get).toHaveBeenCalledWith('metrics:v2:day')
    })
  })

  describe('Metrics Content', () => {
    it('should include derived metrics', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data.derived).toBeDefined()
      expect(data.derived).toHaveProperty('websocket')
      expect(data.derived).toHaveProperty('d1')
      expect(data.derived).toHaveProperty('apiContract')
      expect(data.derived).toHaveProperty('externalApi')
      expect(data.derived).toHaveProperty('cache')
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
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.health.status)
    })

    it('should not include GraphQL endpoint info', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: {
          'Authorization': 'Bearer test_metrics_key_123'
        }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const data = await response.json()

      expect(data._limitation).toBeUndefined()
      expect(data._solution).toBeUndefined()
      expect(data._graphql_endpoint).toBeUndefined()
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
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('INTERNAL_ERROR')
      expect(data.error.message).toBe('Failed to fetch metrics')
      expect(data.error.details.details).toContain('KV unavailable')
    })
  })
})
