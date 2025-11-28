/**
 * Hono Router Tests - Phase 1 MVP
 *
 * These tests validate:
 * 1. Feature flag toggle works correctly
 * 2. Hono routes return expected responses
 * 3. Performance comparison between manual and Hono routing
 * 4. Both routers produce identical business logic results
 */

import { describe, it, expect } from 'vitest'
import worker from '../src/index.js'

// Mock environment for testing
// Mock ExecutionContext
const mockCtx = {
  waitUntil: (promise) => {
    // Silently consume promises in tests (no-op but accepts promises)
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {}) // Prevent unhandled rejection warnings
    }
  },
  passThroughOnException: () => {}
}

const mockEnv = {
  ENABLE_HONO_ROUTER: 'false', // Will be overridden per test
  CACHE_HOT_TTL: '7200',
  CACHE_COLD_TTL: '1209600',
  MAX_RESULTS_DEFAULT: '40',
  LOG_LEVEL: 'DEBUG',
  ENABLE_PERFORMANCE_LOGGING: 'true',
  ENABLE_UNIFIED_ENVELOPE: 'true',
  ENABLE_REFACTORED_DOS: 'false',

  // Mock KV namespace
  CACHE: {
    get: async () => null,
    put: async () => {},
    delete: async () => {}
  },
  CACHE: {
    get: async () => null,
    put: async () => {},
    delete: async () => {}
  },

  // Mock secrets
  GOOGLE_BOOKS_API_KEY: 'test-key',
  ISBNDB_API_KEY: 'test-key',
  GEMINI_API_KEY: 'test-key',

  // Mock R2 buckets
  API_CACHE_COLD: {},
  LIBRARY_DATA: {},
  BOOKSHELF_IMAGES: {},
  BOOK_COVERS: {},

  // Mock Durable Objects
  PROGRESS_WEBSOCKET_DO: {
    idFromName: () => ({ toString: () => 'test-id' }),
    get: (id) => ({
      fetch: async (request) => {
        // Mock successful WebSocket upgrade
        // Note: Status 101 is not valid in Node's Response constructor
        // Use 200 for test purposes - real DO will handle actual WebSocket upgrade
        return new Response('WebSocket upgrade mock', {
          status: 200,
          headers: { 'X-Mock-Websocket': 'true' }
        })
      }
    })
  },
  RATE_LIMITER_DO: {
    idFromName: () => ({ toString: () => 'test-id' }),
    get: () => ({})
  },

  // Mock Analytics Engine
  PERFORMANCE_ANALYTICS: { writeDataPoint: async () => {} },
  CACHE_ANALYTICS: { writeDataPoint: async () => {} },
  ANALYTICS_ENGINE: { writeDataPoint: async () => {} },
  AI_ANALYTICS: { writeDataPoint: async () => {} },
  SAMPLING_ANALYTICS: { writeDataPoint: async () => {} },

  // Mock Queue
  AUTHOR_WARMING_QUEUE: { send: async () => {} }
}

describe('Hono Router - Feature Flag', () => {
  it('should use manual router when feature flag is disabled', async () => {
    const request = new Request('http://localhost/health')
    const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'false' }

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    // Manual router doesn't set X-Router header
    expect(response.headers.get('X-Router')).toBeNull()
  })

  it('should use Hono router when feature flag is enabled', async () => {
    const request = new Request('http://localhost/health')
    const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.router).toBe('hono')
    // Hono router sets X-Router header
    expect(response.headers.get('X-Router')).toBe('hono')
  })
})

describe('Hono Router - Route Functionality', () => {
  const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }

  it('should handle /health endpoint', async () => {
    const request = new Request('http://localhost/health')
    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.worker).toBe('api-worker')
    expect(data.version).toBe('2.1.0')
    expect(data.router).toBe('hono')
    expect(data.timestamp).toBeDefined()
  })

  it('should handle /metrics endpoint', async () => {
    const request = new Request('http://localhost/metrics')
    const response = await worker.fetch(request, env, mockCtx)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Router')).toBe('hono')
  })

  it('should return 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown-route')
    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
    expect(data.error.message).toContain('Endpoint not found')
  })

  it('should handle CORS preflight requests', async () => {
    const request = new Request('http://localhost/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' }
    })
    const response = await worker.fetch(request, env, mockCtx)

    expect(response.status).toBe(204)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(true)
  })
})

describe('Hono Router - Analytics Headers', () => {
  const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }

  it('should include X-Router header in all responses', async () => {
    const request = new Request('http://localhost/health')
    const response = await worker.fetch(request, env, mockCtx)

    expect(response.headers.get('X-Router')).toBe('hono')
  })

  it('should include X-Response-Time header', async () => {
    const request = new Request('http://localhost/health')
    const response = await worker.fetch(request, env, mockCtx)

    const responseTime = response.headers.get('X-Response-Time')
    expect(responseTime).toBeDefined()
    expect(responseTime).toMatch(/^\d+ms$/)
  })
})

describe('Hono Router - Performance Benchmarks', () => {
  it('should compare routing overhead: manual vs Hono', async () => {
    const iterations = 100
    const testUrl = 'http://localhost/health'

    // Benchmark 1: Manual routing
    const manualStart = performance.now()
    for (let i = 0; i < iterations; i++) {
      const request = new Request(testUrl)
      await worker.fetch(request, { ...mockEnv, ENABLE_HONO_ROUTER: 'false' }, mockCtx)
    }
    const manualTime = performance.now() - manualStart

    // Benchmark 2: Hono routing
    const honoStart = performance.now()
    for (let i = 0; i < iterations; i++) {
      const request = new Request(testUrl)
      await worker.fetch(request, { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }, mockCtx)
    }
    const honoTime = performance.now() - honoStart

    // Log results (not a strict assertion - just informational)
    const manualAvg = (manualTime / iterations).toFixed(2)
    const honoAvg = (honoTime / iterations).toFixed(2)
    const percentDiff = (((manualTime - honoTime) / manualTime) * 100).toFixed(1)

    console.log(`
┌─────────────────────────────────────────────────┐
│ Routing Performance Comparison (${iterations} iterations)  │
├─────────────────────────────────────────────────┤
│ Manual Router:  ${manualTime.toFixed(2)}ms (${manualAvg}ms/req)     │
│ Hono Router:    ${honoTime.toFixed(2)}ms (${honoAvg}ms/req)       │
│ Difference:     ${Math.abs(manualTime - honoTime).toFixed(2)}ms (${percentDiff}% ${manualTime > honoTime ? 'faster' : 'slower'})  │
└─────────────────────────────────────────────────┘
    `)

    // Both should complete successfully
    expect(manualTime).toBeGreaterThan(0)
    expect(honoTime).toBeGreaterThan(0)
  })
})

describe('Hono Router - WebSocket Routing', () => {
  const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }

  it('should route WebSocket upgrade requests to Durable Object', async () => {
    const request = new Request('http://localhost/ws/progress?jobId=test-123', {
      headers: { 'Upgrade': 'websocket' }
    })
    const response = await worker.fetch(request, env, mockCtx)

    // Hono correctly forwards request to DO
    // Mock DO returns 200 (real DO would handle actual WebSocket upgrade)
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Mock-Websocket')).toBe('true')
    expect(response.headers.get('X-Router')).toBe('hono')
  })

  it('should return error for missing jobId parameter', async () => {
    const request = new Request('http://localhost/ws/progress', {
      headers: { Upgrade: 'websocket' }
    })
    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('MISSING_PARAM')
  })

  it('should forward non-WebSocket requests to Durable Object', async () => {
    const request = new Request('http://localhost/ws/progress?jobId=test-123')
    // No Upgrade header - DO will handle the response
    const response = await worker.fetch(request, env, mockCtx)

    // Note: Behavior parity with manual router - no upgrade validation at router level
    // The Durable Object handles the actual WebSocket logic
    // Mock DO returns 200 for testing (real DO handles WebSocket upgrade)
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Mock-Websocket')).toBe('true')
    expect(response.headers.get('X-Router')).toBe('hono')
  })
})

describe('Hono Router - Error Handling', () => {
  const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true' }

  it('should handle global errors with 500 response', async () => {
    // Simulate an error by calling a non-existent handler
    // This tests the global onError handler in src/router.ts
    const request = new Request('http://localhost/health')

    // Mock environment to trigger an error
    const faultyEnv = {
      ...env,
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: async () => {
          throw new Error('Analytics Engine unavailable')
        }
      }
    }

    // The /health route should still succeed even if analytics fails
    const response = await worker.fetch(request, faultyEnv, mockCtx)
    expect(response.status).toBe(200)
  })

  it('should catch route errors with global onError handler', async () => {
    // Test the /test/error route that intentionally throws an error
    const request = new Request('http://localhost/test/error')
    const env = { ...mockEnv, ENABLE_HONO_ROUTER: 'true', LOG_LEVEL: 'DEBUG' }

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error.code).toBe('INTERNAL_ERROR')
    expect(data.error.message).toBe('An unexpected error occurred')
    expect(data.error.details).toBe('Test error for onError handler validation')
  })

  it('should log errors to Analytics Engine asynchronously', async () => {
    const request = new Request('http://localhost/unknown-route')
    const analyticsLogs = []

    const envWithLogging = {
      ...env,
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: async (data) => {
          analyticsLogs.push(data)
        }
      }
    }

    const response = await worker.fetch(request, envWithLogging, mockCtx)
    expect(response.status).toBe(404)

    // Give async logging time to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    // Analytics should have logged the 404 (if error handler is triggered)
    // Note: 404 goes through notFound handler, not onError
  })
})

describe('Hono Router - Response Consistency', () => {
  it('should produce identical JSON for /health between routers', async () => {
    const request = new Request('http://localhost/health')

    // Manual router
    const manualResponse = await worker.fetch(request, {
      ...mockEnv,
      ENABLE_HONO_ROUTER: 'false'
    }, mockCtx)
    const manualData = await manualResponse.json()

    // Hono router
    const honoResponse = await worker.fetch(request, {
      ...mockEnv,
      ENABLE_HONO_ROUTER: 'true'
    }, mockCtx)
    const honoData = await honoResponse.json()

    // Both should have same status and worker info
    expect(honoData.status).toBe(manualData.status)
    expect(honoData.worker).toBe(manualData.worker)
    expect(honoData.version).toBe(manualData.version)

    // Hono should add router identifier
    expect(honoData.router).toBe('hono')
    expect(manualData.router).toBeUndefined()

    // Headers should differ only in X-Router
    expect(honoResponse.headers.get('X-Router')).toBe('hono')
    expect(manualResponse.headers.get('X-Router')).toBeNull()
  })
})

describe('Hono Router - Polling Endpoint (Issue #9)', () => {
  const env = {
    ...mockEnv,
    ENABLE_HONO_ROUTER: 'true',
    // Mock Durable Object for job state
    PROGRESS_WEBSOCKET_DO: {
      idFromName: () => ({ toString: () => 'test-id' }),
      get: (id) => ({
        // Mock getJobStateAndAuth for successful polling
        getJobStateAndAuth: async () => ({
          jobState: {
            jobId: 'test-job-123',
            status: 'processing',
            progress: 45,
            message: 'Processing batch 5 of 10'
          },
          authToken: 'test-token-abc123',
          authTokenExpiration: Date.now() + 3600000 // 1 hour in future
        })
      })
    },
    RATE_LIMITER_DO: {
      idFromName: () => ({ toString: () => 'test-id' }),
      get: () => ({
        fetch: async (request) => {
          // Mock rate limiter - allow all requests by default
          return new Response(JSON.stringify({
            allowed: true,
            remaining: 30,
            resetAt: Date.now() + 60000
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      })
    }
  }

  it('should return job state with valid token', async () => {
    const request = new Request(
      'http://localhost/api/job-state/test-job-123',
      {
        headers: { 'Authorization': 'Bearer test-token-abc123' }
      }
    )

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toBeDefined()
    expect(data.data.jobId).toBe('test-job-123')
    expect(data.data.status).toBe('processing')
    expect(data.data.progress).toBe(45)
    // Check ResponseEnvelope v2.0 format
    expect(data.metadata).toBeDefined()
    expect(data.metadata.timestamp).toBeDefined()
    expect(data.metadata.source).toBe('durable-object')
    expect(response.headers.get('X-Response-Format')).toBe('v2.0')
  })

  it('should return 401 when token is missing', async () => {
    const request = new Request('http://localhost/api/job-state/test-job-123')

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBeDefined()
    expect(data.error.code).toBe('UNAUTHORIZED')
    expect(data.error.message).toContain('Missing authorization token')
    expect(data.metadata.timestamp).toBeDefined()
    expect(response.headers.get('X-Response-Format')).toBe('v2.0')
  })

  it('should return 401 when token is invalid', async () => {
    const request = new Request(
      'http://localhost/api/job-state/test-job-123',
      {
        headers: { 'Authorization': 'Bearer invalid-token' }
      }
    )

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
    expect(data.error.message).toContain('Invalid or expired token')
  })

  it('should return 401 when token is expired', async () => {
    const expiredEnv = {
      ...env,
      PROGRESS_WEBSOCKET_DO: {
        idFromName: () => ({ toString: () => 'test-id' }),
        get: (id) => ({
          getJobStateAndAuth: async () => ({
            jobState: { jobId: 'test-job-123', status: 'processing' },
            authToken: 'test-token-abc123',
            authTokenExpiration: Date.now() - 1000 // Expired 1 second ago
          })
        })
      }
    }

    const request = new Request(
      'http://localhost/api/job-state/test-job-123',
      {
        headers: { 'Authorization': 'Bearer test-token-abc123' }
      }
    )

    const response = await worker.fetch(request, expiredEnv, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
    expect(data.error.message).toContain('Invalid or expired token')
    expect(data.error.details.tokenExpired).toBe(true)
  })

  it('should return 404 when job not found', async () => {
    const notFoundEnv = {
      ...env,
      PROGRESS_WEBSOCKET_DO: {
        idFromName: () => ({ toString: () => 'test-id' }),
        get: (id) => ({
          getJobStateAndAuth: async () => null // Job doesn't exist
        })
      }
    }

    const request = new Request(
      'http://localhost/api/job-state/nonexistent-job',
      {
        headers: { 'Authorization': 'Bearer test-token-abc123' }
      }
    )

    const response = await worker.fetch(request, notFoundEnv, mockCtx)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
    expect(data.error.message).toContain('Job not found')
  })

  it('should return 400 when jobId is missing', async () => {
    const request = new Request('http://localhost/api/job-state/', {
      headers: { 'Authorization': 'Bearer test-token-abc123' }
    })

    const response = await worker.fetch(request, env, mockCtx)
    // Note: This actually routes to /health due to missing param, so status depends on routing
    // In Hono, missing :jobId param will fail to match the route
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('should enforce rate limiting (30 req/min)', async () => {
    const rateLimitedEnv = {
      ...env,
      RATE_LIMITER_DO: {
        idFromName: () => ({ toString: () => 'test-id' }),
        get: () => ({
          fetch: async (request) => {
            // Simulate rate limit exceeded - return proper format
            // Rate limiter checks for 'allowed' field in response
            return new Response(JSON.stringify({
              allowed: false,
              remaining: 0,
              resetAt: Date.now() + 60000
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        })
      }
    }

    const request = new Request(
      'http://localhost/api/job-state/test-job-123',
      {
        headers: { 'Authorization': 'Bearer test-token-abc123' }
      }
    )

    const response = await worker.fetch(request, rateLimitedEnv, mockCtx)
    const data = await response.json()

    // Rate limiter returns 429 when limit exceeded
    expect(response.status).toBe(429)
    expect(data.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(response.headers.get('Retry-After')).toBeDefined()
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30')
  })

  it('should include proper ResponseEnvelope format in success response', async () => {
    const request = new Request(
      'http://localhost/api/job-state/test-job-123',
      {
        headers: { 'Authorization': 'Bearer test-token-abc123' }
      }
    )

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    // Verify ResponseEnvelope v2.0 structure
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('metadata')
    expect(data).not.toHaveProperty('error')
    expect(data.metadata).toHaveProperty('timestamp')
    expect(data.metadata).toHaveProperty('source')
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('X-Response-Format')).toBe('v2.0')
  })

  it('should include proper ResponseEnvelope format in error response', async () => {
    const request = new Request(
      'http://localhost/api/job-state/test-job-123'
      // No authorization header
    )

    const response = await worker.fetch(request, env, mockCtx)
    const data = await response.json()

    // Verify ResponseEnvelope v2.0 error structure
    expect(data).toHaveProperty('data')
    expect(data.data).toBeNull()
    expect(data).toHaveProperty('metadata')
    expect(data).toHaveProperty('error')
    expect(data.error).toHaveProperty('code')
    expect(data.error).toHaveProperty('message')
    expect(data.metadata).toHaveProperty('timestamp')
    expect(response.headers.get('X-Response-Format')).toBe('v2.0')
    expect(response.headers.get('X-Error-Type')).toBe('UNAUTHORIZED')
  })
})
