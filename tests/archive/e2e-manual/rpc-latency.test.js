/**
 * RPC Latency Test Suite
 *
 * Issue #10 (Day 4 - Sprint 1): Verify native RPC is being used
 *
 * Tests measure DO-to-DO RPC call performance to validate that Cloudflare Workers
 * native RPC is being used instead of HTTP fetch.
 *
 * Performance Baseline:
 * - Native RPC: < 10ms P95 (ideal)
 * - Optimized: 10-30ms P95 (acceptable)
 * - HTTP fetch: > 30ms P95 (problem - indicates non-native RPC)
 *
 * Note: These tests validate the RPC latency measurement implementation and
 * should be run with `npm run dev` in a separate terminal, then:
 * npx vitest run tests/rpc-latency.test.js
 *
 * Or tested manually via:
 * curl "http://localhost:8787/test/rpc-latency?iterations=100"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LatencyTestDO } from '../src/durable-objects/latency-test-do.js'

describe('RPC Latency Verification (Issue #10)', () => {
  let mockEnv
  let mockState
  let latencyTestDO

  beforeEach(() => {
    // Mock CacheMetricsDO stub
    const mockCacheMetricsStub = {
      getStats: vi.fn(async () => {
        // Simulate RPC call with small delay
        return new Promise((resolve) => {
          // Realistic RPC latency: 2-5ms
          const delay = Math.random() * 3 + 2
          setTimeout(() => {
            resolve({
              lastUpdated: Date.now(),
              currentMinute: {},
              total: {},
            })
          }, delay)
        })
      }),
    }

    // Mock environment
    mockEnv = {
      CACHE_METRICS_DO: {
        idFromName: vi.fn(() => 'test-id'),
        get: vi.fn(() => mockCacheMetricsStub),
      },
    }

    // Mock Durable Object state
    mockState = {
      storage: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      },
      blockConcurrencyWhile: vi.fn(async (fn) => fn()),
    }

    // Create LatencyTestDO instance
    latencyTestDO = new LatencyTestDO(mockState, mockEnv)
  })

  describe('Latency Test DO - RPC Methods', () => {
    it('should measure latency with default iterations', async () => {
      // Act: Measure latency for 100 RPC calls
      const result = await latencyTestDO.measureLatency(100)

      // Assert: Result structure
      expect(result).toHaveProperty('iterations', 100)
      expect(result).toHaveProperty('measurements')
      expect(result).toHaveProperty('stats')
      expect(result).toHaveProperty('testType', 'native-rpc')
      expect(Array.isArray(result.measurements)).toBe(true)
      expect(result.measurements.length).toBe(100)
    })

    it('should accept custom iteration count', async () => {
      // Act: Measure with custom iterations
      const result = await latencyTestDO.measureLatency(50)

      // Assert: Correct iteration count
      expect(result.iterations).toBe(50)
      expect(result.measurements.length).toBe(50)
    })

    it('should validate iteration count is positive', async () => {
      // Act & Assert: Should throw on invalid count
      await expect(() => latencyTestDO.measureLatency(0)).rejects.toThrow(
        /must be an integer between 1 and 10000/,
      )

      await expect(() => latencyTestDO.measureLatency(-5)).rejects.toThrow()
    })

    it('should validate iteration count is within bounds', async () => {
      // Act & Assert: Should throw on > 10000
      await expect(() => latencyTestDO.measureLatency(10001)).rejects.toThrow(
        /must be an integer between 1 and 10000/,
      )
    })

    it('should validate iteration count is integer', async () => {
      // Act & Assert: Non-integer should fail
      await expect(() =>
        latencyTestDO.measureLatency(100.5),
      ).rejects.toThrow()
    })
  })

  describe('Performance Validation', () => {
    it('should have reasonable latency for RPC calls', async () => {
      // Act: Measure 100 RPC calls
      const result = await latencyTestDO.measureLatency(100)

      // Assert: Statistics are calculated
      const { stats } = result
      expect(stats.min).toBeGreaterThan(0)
      expect(stats.max).toBeGreaterThanOrEqual(stats.min)
      expect(stats.avg).toBeGreaterThanOrEqual(stats.min)
      expect(stats.avg).toBeLessThanOrEqual(stats.max)
      expect(stats.p50).toBeGreaterThanOrEqual(stats.min)
      expect(stats.p50).toBeLessThanOrEqual(stats.max)
      expect(stats.p95).toBeGreaterThanOrEqual(stats.p50)
      expect(stats.p99).toBeGreaterThanOrEqual(stats.p95)
    })

    it('should calculate min and max correctly', async () => {
      // Act: Get measurements
      const result = await latencyTestDO.measureLatency(50)
      const { measurements, stats } = result

      // Calculate expected min/max
      const expectedMin = Math.min(...measurements)
      const expectedMax = Math.max(...measurements)

      // Assert: Stats match expected (within rounding tolerance)
      expect(stats.min).toBeCloseTo(expectedMin, 2)
      expect(stats.max).toBeCloseTo(expectedMax, 2)
    })

    it('should calculate average correctly', async () => {
      // Act: Get measurements
      const result = await latencyTestDO.measureLatency(30)
      const { measurements, stats } = result

      // Calculate expected average
      const expectedAvg =
        measurements.reduce((a, b) => a + b, 0) / measurements.length

      // Assert: Average is close (within rounding error)
      expect(Math.abs(stats.avg - expectedAvg)).toBeLessThan(0.01)
    })

    it('should calculate percentiles correctly', async () => {
      // Act: Get measurements with enough for statistical analysis
      const result = await latencyTestDO.measureLatency(200)
      const { measurements, stats } = result

      // Sort for percentile comparison
      const sorted = [...measurements].sort((a, b) => a - b)

      // Calculate expected percentiles (simple method)
      const getPercentile = (arr, p) => {
        const index = (p / 100) * (arr.length - 1)
        const lower = Math.floor(index)
        const upper = Math.ceil(index)
        const weight = index % 1

        if (lower === upper) return arr[lower]
        return arr[lower] * (1 - weight) + arr[upper] * weight
      }

      const expectedP50 = getPercentile(sorted, 50)
      const expectedP95 = getPercentile(sorted, 95)
      const expectedP99 = getPercentile(sorted, 99)

      // Assert: Percentiles are close (allow small interpolation variance)
      expect(Math.abs(stats.p50 - expectedP50)).toBeLessThan(0.2)
      expect(Math.abs(stats.p95 - expectedP95)).toBeLessThan(0.2)
      expect(Math.abs(stats.p99 - expectedP99)).toBeLessThan(0.2)
    })

    it('should have consistent performance characteristics', async () => {
      // Act: Measure RPC latency
      const result = await latencyTestDO.measureLatency(100)
      const { measurements, stats } = result

      // Calculate standard deviation
      const mean = stats.avg
      const variance =
        measurements.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) /
        measurements.length
      const stdDev = Math.sqrt(variance)

      // Assert: Variance is reasonable (RPC should be consistent)
      // With simulated 2-5ms RPC calls, stdDev should be ~0.8-1.0ms
      expect(stdDev).toBeGreaterThan(0)
      expect(stdDev).toBeLessThan(5)

      // Coefficient of variation (normalized variance)
      const cv = stdDev / mean
      expect(cv).toBeLessThan(1) // < 100% variation
    })

    it('should return valid total time', async () => {
      // Act: Measure with timing
      const result = await latencyTestDO.measureLatency(50)

      // Assert: Total time is reasonable
      // 50 calls at 2-5ms each = ~100-250ms + overhead
      expect(result.totalTime).toBeGreaterThan(0)
      expect(result.totalTime).toBeLessThan(2000) // Should be < 2s
    })
  })

  describe('Ping Method', () => {
    it('should return timestamp for ping()', async () => {
      // Act: Call ping method
      const result = await latencyTestDO.ping()

      // Assert: Result has timestamp
      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('nonce')
      expect(typeof result.timestamp).toBe('number')
      expect(typeof result.nonce).toBe('number')
      expect(result.timestamp).toBeGreaterThan(0)
      expect(result.nonce).toBeGreaterThanOrEqual(0)
      expect(result.nonce).toBeLessThanOrEqual(1)
    })
  })

  describe('Statistical Calculations', () => {
    it('should handle single measurement', async () => {
      // Act: Measure with 1 iteration
      const result = await latencyTestDO.measureLatency(1)

      // Assert: Stats calculated correctly
      expect(result.stats.min).toBe(result.stats.max)
      expect(result.stats.avg).toBe(result.stats.min)
      expect(result.stats.p50).toBe(result.stats.min)
      expect(result.stats.p95).toBe(result.stats.min)
      expect(result.stats.p99).toBe(result.stats.min)
    })

    it('should handle error markers correctly', async () => {
      // This test verifies the implementation handles failed RPC calls
      // If any RPC calls fail, they're marked as -1 and excluded from stats

      // Act: Measure latency
      const result = await latencyTestDO.measureLatency(10)

      // Assert: All measurements are valid (>= 0)
      const allValid = result.measurements.every((m) => m >= 0)
      expect(allValid).toBe(true)

      // Verify count of successful measurements
      expect(result.stats.count).toBeGreaterThanOrEqual(
        result.measurements.length - 1,
      )
    })
  })

  describe('Fetch Handler (HTTP Fallback)', () => {
    it('should handle ping via HTTP GET', async () => {
      // Act: Create fake request to /ping endpoint
      const request = new Request('http://localhost/ping', {
        method: 'GET',
      })
      const response = await latencyTestDO.fetch(request)

      // Assert: Returns JSON response
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')

      const data = await response.json()
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('nonce')
    })

    it('should handle measure via HTTP GET', async () => {
      // Act: Create fake request to /measure endpoint
      const request = new Request('http://localhost/measure?iterations=10', {
        method: 'GET',
      })
      const response = await latencyTestDO.fetch(request)

      // Assert: Returns latency results
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('iterations', 10)
      expect(data).toHaveProperty('measurements')
      expect(data).toHaveProperty('stats')
    })

    it('should return error for unknown endpoint', async () => {
      // Act: Request unknown endpoint
      const request = new Request('http://localhost/unknown', {
        method: 'GET',
      })
      const response = await latencyTestDO.fetch(request)

      // Assert: Returns error
      expect(response.status).toBe(400)
    })
  })
})
