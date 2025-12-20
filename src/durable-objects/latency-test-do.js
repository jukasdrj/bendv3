/**
 * LatencyTestDO - RPC Performance Verification
 *
 * Issue #10 (Day 4 - Sprint 1): Verify native RPC is used (not HTTP fetch)
 *
 * This Durable Object measures DO-to-DO RPC call performance to validate
 * that Cloudflare Workers native RPC is being used instead of HTTP fetch.
 *
 * Performance Baseline:
 * - Native RPC: < 10ms P95 (ideal)
 * - Optimized: 10-30ms P95 (acceptable)
 * - HTTP fetch: > 30ms P95 (problem - indicates non-native RPC)
 *
 * Usage:
 *   const stub = env.LATENCY_TEST_DO.get(env.LATENCY_TEST_DO.idFromName('test'))
 *   const stats = await stub.measureLatency(100) // 100 iterations
 *
 * Returns latency statistics:
 *   {
 *     iterations: 100,
 *     measurements: [3.2, 2.8, 3.5, ...],
 *     stats: {
 *       min: 2.1,
 *       max: 8.5,
 *       avg: 3.4,
 *       p50: 3.2,
 *       p95: 5.8,
 *       p99: 7.2
 *     }
 *   }
 */

export class LatencyTestDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  /**
   * RPC Method: Ping - Minimal RPC call to measure latency
   *
   * Returns a timestamp that can be used to measure round-trip latency.
   * This is the simplest possible RPC operation for baseline measurement.
   *
   * @returns {Promise<Object>} {timestamp, nonce}
   */
  async ping() {
    return {
      timestamp: Date.now(),
      nonce: Math.random(),
    }
  }

  /**
   * RPC Method: Get CacheMetrics stub and measure latency
   *
   * Makes multiple RPC calls to CacheMetricsDO and records timing.
   * This validates that we're using native RPC, not HTTP fetch.
   *
   * @param {number} iterations - Number of RPC calls to measure (default: 100)
   * @returns {Promise<Object>} Latency statistics
   */
  async measureLatency(iterations = 100) {
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) {
      throw new Error('iterations must be an integer between 1 and 10000')
    }

    // Get CacheMetricsDO stub for cross-DO RPC measurement
    let cacheMetricsStub
    try {
      const id = this.env.CACHE_METRICS_DO.idFromName('default')
      cacheMetricsStub = this.env.CACHE_METRICS_DO.get(id)
    } catch (error) {
      throw new Error(`CACHE_METRICS_DO binding not available: ${error.message}`)
    }

    const measurements = []
    const startTime = performance.now()

    // Perform RPC calls and measure each one
    for (let i = 0; i < iterations; i++) {
      const callStartTime = performance.now()

      try {
        // Make RPC call to CacheMetricsDO - this uses native RPC if available
        await cacheMetricsStub.getStats()
      } catch (error) {
        // Log error but continue measuring (don't fail entire test)
        console.error(`[LatencyTestDO] RPC call ${i} failed:`, error.message)
        measurements.push(-1) // Mark as error
        continue
      }

      const callEndTime = performance.now()
      const latency = callEndTime - callStartTime

      measurements.push(latency)
    }

    const totalTime = performance.now() - startTime

    // Calculate statistics
    const stats = this.calculateStatistics(measurements)

    console.log(`[LatencyTestDO] Latency measurement complete:
      - Iterations: ${iterations}
      - Total time: ${totalTime.toFixed(2)}ms
      - Avg latency: ${stats.avg.toFixed(3)}ms
      - P95 latency: ${stats.p95.toFixed(3)}ms
      - P99 latency: ${stats.p99.toFixed(3)}ms
      - Min: ${stats.min.toFixed(3)}ms, Max: ${stats.max.toFixed(3)}ms
    `)

    return {
      iterations,
      totalTime,
      measurements,
      stats,
      testType: 'native-rpc',
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Calculate statistical measures from latency measurements
   *
   * Computes min, max, avg, p50, p95, and p99 percentiles.
   * Used to validate that native RPC is being used (< 10ms P95).
   *
   * @param {number[]} measurements - Array of latency measurements in milliseconds
   * @returns {Object} Statistics object with calculated metrics
   * @private
   */
  calculateStatistics(measurements) {
    if (!measurements || measurements.length === 0) {
      throw new Error('No measurements provided')
    }

    // Filter out error markers (-1)
    const validMeasurements = measurements.filter((m) => m >= 0)
    if (validMeasurements.length === 0) {
      throw new Error('All RPC calls failed - unable to calculate statistics')
    }

    // Sort for percentile calculation
    const sorted = validMeasurements.sort((a, b) => a - b)

    // Basic statistics
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length

    // Percentile calculation (linear interpolation)
    const percentile = (p) => {
      const index = (p / 100) * (sorted.length - 1)
      const lower = Math.floor(index)
      const upper = Math.ceil(index)
      const weight = index % 1

      if (lower === upper) {
        return sorted[lower]
      }

      return sorted[lower] * (1 - weight) + sorted[upper] * weight
    }

    return {
      min: parseFloat(min.toFixed(3)),
      max: parseFloat(max.toFixed(3)),
      avg: parseFloat(avg.toFixed(3)),
      p50: parseFloat(percentile(50).toFixed(3)),
      p95: parseFloat(percentile(95).toFixed(3)),
      p99: parseFloat(percentile(99).toFixed(3)),
      count: validMeasurements.length,
      errors: measurements.length - validMeasurements.length,
    }
  }

  /**
   * Handle incoming requests (DEPRECATED - use RPC methods instead)
   * Kept for HTTP fallback during testing
   */
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/ping' && request.method === 'GET') {
      const result = await this.ping()
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } else if (url.pathname === '/measure' && request.method === 'GET') {
      const iterations = parseInt(url.searchParams.get('iterations') || '100', 10)
      const result = await this.measureLatency(iterations)
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Use RPC methods: ping() or measureLatency()', {
      status: 400,
    })
  }
}
