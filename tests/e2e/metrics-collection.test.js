import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleMetricsRequest } from '../../src/handlers/metrics-handler.js'
import { aggregateMetrics } from '../../src/services/metrics-aggregator.ts'

describe('End-to-End Metrics Collection', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    mockEnv = {
      METRICS_API_KEY: 'e2e_test_key',
      CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      },
      CACHE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      }
    }

    mockCtx = {
      waitUntil: vi.fn((promise) => promise)
    }
  })

  describe('Full Metrics Workflow', () => {
    it('should complete end-to-end metrics collection flow', async () => {
      // Step 1: Make API request to /metrics
      const request = new Request('https://api.example.com/metrics?period=1h', {
        headers: {
          'Authorization': 'Bearer e2e_test_key'
        }
      })

      // Step 2: Handler processes request
      const response = await handleMetricsRequest(request, mockEnv, mockCtx)

      // Step 3: Validate response
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      // Step 4: Parse and validate metrics data
      const metrics = await response.json()

      expect(metrics).toHaveProperty('timestamp')
      expect(metrics).toHaveProperty('period', '1h')
      expect(metrics).toHaveProperty('hitRates')
      expect(metrics).toHaveProperty('volume')
      expect(metrics).toHaveProperty('latency')
      expect(metrics).toHaveProperty('costs')
      expect(metrics).toHaveProperty('health')

      // Step 5: Verify metrics were cached
      expect(mockCtx.waitUntil).toHaveBeenCalled()
      await mockCtx.waitUntil.mock.calls[0][0]

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        'metrics:v1:1h',
        expect.any(String),
        { expirationTtl: 300 }
      )

      // Verify cached data matches response
      const cachedData = mockEnv.CACHE.put.mock.calls[0][1]
      const cachedMetrics = JSON.parse(cachedData)

      expect(cachedMetrics.timestamp).toBe(metrics.timestamp)
      expect(cachedMetrics.period).toBe(metrics.period)
    })

    it('should serve metrics from cache on subsequent requests', async () => {
      // First request - cache miss
      const firstRequest = new Request('https://api.example.com/metrics?period=24h', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const firstResponse = await handleMetricsRequest(firstRequest, mockEnv, mockCtx)
      const firstMetrics = await firstResponse.json()

      // Simulate cache hit for second request
      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(firstMetrics))

      // Second request - cache hit
      const secondRequest = new Request('https://api.example.com/metrics?period=24h', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const secondResponse = await handleMetricsRequest(secondRequest, mockEnv, mockCtx)
      const secondMetrics = await secondResponse.json()

      // Verify cache was checked
      expect(mockEnv.CACHE.get).toHaveBeenCalledWith('metrics:v1:24h')

      // Verify same data returned
      expect(secondMetrics.timestamp).toBe(firstMetrics.timestamp)
    })
  })

  describe('Metrics Data Integrity', () => {
    it('should maintain consistent data structure across formats', async () => {
      // Request JSON format
      const jsonRequest = new Request('https://api.example.com/metrics?format=json', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const jsonResponse = await handleMetricsRequest(jsonRequest, mockEnv, mockCtx)
      const jsonMetrics = await jsonResponse.json()

      // Request Prometheus format (reset cache)
      mockEnv.CACHE.get.mockResolvedValue(null)

      const prometheusRequest = new Request('https://api.example.com/metrics?format=prometheus', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const prometheusResponse = await handleMetricsRequest(prometheusRequest, mockEnv, mockCtx)
      const prometheusText = await prometheusResponse.text()

      // Verify JSON data is reflected in Prometheus format
      expect(prometheusText).toContain(`cache_hit_rate{tier="edge"} ${jsonMetrics.hitRates.edge}`)
      expect(prometheusText).toContain(`cache_hit_rate{tier="kv"} ${jsonMetrics.hitRates.kv}`)
      expect(prometheusText).toContain(`cache_hit_rate{tier="combined"} ${jsonMetrics.hitRates.combined}`)
    })

    it('should include all required fields in metrics response', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const metrics = await response.json()

      // Verify structure completeness
      const requiredFields = [
        'timestamp',
        'period',
        'hitRates',
        'volume',
        'latency',
        'costs',
        'health'
      ]

      for (const field of requiredFields) {
        expect(metrics).toHaveProperty(field)
      }

      // Verify nested structures
      expect(metrics.hitRates).toHaveProperty('edge')
      expect(metrics.hitRates).toHaveProperty('kv')
      expect(metrics.hitRates).toHaveProperty('combined')

      expect(metrics.volume).toHaveProperty('total_requests')
      expect(metrics.volume).toHaveProperty('edge_hits')
      expect(metrics.volume).toHaveProperty('kv_hits')

      expect(metrics.costs).toHaveProperty('total_estimate')
      expect(metrics.health).toHaveProperty('status')
      expect(metrics.health).toHaveProperty('issues')
    })
  })

  describe('Health Assessment Integration', () => {
    it('should assess health status based on hit rate thresholds', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const metrics = await response.json()

      // Default metrics (no data, 0% hit rates) trigger degraded status
      // because combined hit rate (0%) < 90% threshold
      expect(metrics.health.status).toBe('degraded')
      expect(metrics.health.issues.length).toBeGreaterThan(0)

      // Verify warning messages are present
      const warningMessages = metrics.health.issues.map(i => i.message).join(' ')
      expect(warningMessages).toContain('hit rate')
    })
  })

  describe('Cost Estimation Integration', () => {
    it('should calculate costs based on volume metrics', async () => {
      const request = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const metrics = await response.json()

      expect(metrics.costs).toHaveProperty('kv_reads_estimate')
      expect(metrics.costs).toHaveProperty('r2_reads')
      expect(metrics.costs).toHaveProperty('total_estimate')

      // Cost strings should be properly formatted
      expect(metrics.costs.kv_reads_estimate).toMatch(/^\$\d+\.\d{4}\/period$/)
      expect(metrics.costs.r2_reads).toMatch(/^\$\d+\.\d{4}\/period$/)
      expect(metrics.costs.total_estimate).toMatch(/^\$\d+\.\d{4}\/period$/)
    })
  })

  describe('Error Recovery', () => {
    it('should handle aggregation service errors gracefully', async () => {
      // Force aggregateMetrics to throw by making KV.get throw during caching
      mockEnv.CACHE.get.mockRejectedValue(new Error('KV service unavailable'))

      const request = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)

      expect(response.status).toBe(500)
      const errorData = await response.json()

      expect(errorData).toHaveProperty('error')
      expect(errorData).toHaveProperty('message')
      expect(errorData.message).toContain('KV service unavailable')
    })

    it('should continue working after cache failures', async () => {
      // First request - cache put fails
      mockEnv.CACHE.put.mockRejectedValue(new Error('Cache write failed'))

      const firstRequest = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const firstResponse = await handleMetricsRequest(firstRequest, mockEnv, mockCtx)

      // Request still succeeds despite cache failure
      expect(firstResponse.status).toBe(200)

      // Second request - reset mock and succeed
      mockEnv.CACHE.get.mockResolvedValue(null)
      mockEnv.CACHE.put.mockResolvedValue(undefined)

      const secondRequest = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const secondResponse = await handleMetricsRequest(secondRequest, mockEnv, mockCtx)

      expect(secondResponse.status).toBe(200)
    })
  })

  describe('Multi-Period Support', () => {
    it('should handle multiple period requests independently', async () => {
      const periods = ['15m', '1h', '24h', '7d']
      const responses = []

      for (const period of periods) {
        mockEnv.CACHE.get.mockResolvedValue(null) // Force fresh fetch

        const request = new Request(`https://api.example.com/metrics?period=${period}`, {
          headers: { 'Authorization': 'Bearer e2e_test_key' }
        })

        const response = await handleMetricsRequest(request, mockEnv, mockCtx)
        const metrics = await response.json()

        responses.push({ period, metrics })
      }

      // Verify each period returned correctly
      for (const { period, metrics } of responses) {
        expect(metrics.period).toBe(period)
      }

      // Verify different cache keys used
      const cacheKeys = mockEnv.CACHE.get.mock.calls.map(call => call[0])
      expect(cacheKeys).toContain('metrics:v1:15m')
      expect(cacheKeys).toContain('metrics:v1:1h')
      expect(cacheKeys).toContain('metrics:v1:24h')
      expect(cacheKeys).toContain('metrics:v1:7d')
    })
  })

  describe('Analytics Engine Integration Notes', () => {
    it('should document Analytics Engine limitations in response', async () => {
      // This test documents the current limitation where Analytics Engine
      // can only write data points, not query them from Workers
      const request = new Request('https://api.example.com/metrics', {
        headers: { 'Authorization': 'Bearer e2e_test_key' }
      })

      const response = await handleMetricsRequest(request, mockEnv, mockCtx)
      const metrics = await response.json()

      // Current implementation returns placeholder with instructions
      expect(metrics._limitation).toBeDefined()
      expect(metrics._solution).toBeDefined()
      expect(metrics._graphql_endpoint).toBe('https://api.cloudflare.com/client/v4/graphql')

      // This documents that real metrics require Cloudflare GraphQL API
      expect(metrics._limitation).toContain('Analytics Engine queries not available')
    })
  })
})
