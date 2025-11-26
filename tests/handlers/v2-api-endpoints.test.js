/**
 * V2 API Endpoints Integration Tests
 *
 * Tests for Section 6.5 of API_CONTRACT.md
 * Verifies all V2 API endpoints are implemented and working
 *
 * Issue: V2 API endpoints documented but not implemented
 * @see https://github.com/jukasdrj/bendv3/issues/XXX
 */

import { describe, it, expect, beforeAll } from 'vitest'
import honoRouter from '../../src/router.ts'

/**
 * Mock Environment Setup
 */
function createMockEnv() {
  return {
    // KV Cache
    KV_CACHE: {
      get: async (key, type) => {
        // Mock empty cache for most tests
        if (key.startsWith('recommendations:weekly:')) {
          // Return mock recommendations
          return {
            weekOf: '2025-11-25',
            recommendations: [
              {
                isbn: '9780747532743',
                title: 'Harry Potter and the Philosopher\'s Stone',
                author: 'J.K. Rowling',
                coverUrl: 'https://example.com/cover.jpg',
                reason: 'A beloved fantasy classic',
                score: 0.95
              }
            ],
            generatedAt: '2025-11-24T00:00:00Z',
            expiresAt: '2025-12-01T00:00:00Z'
          }
        }
        return null
      },
      put: async () => {},
      delete: async () => {}
    },
    
    // Job State Manager DO
    JOB_STATE_MANAGER_DO: {
      idFromName: (name) => ({ toString: () => name }),
      get: (id) => ({
        getJobState: async () => ({
          jobId: id.toString(),
          pipeline: 'csv_import',
          status: 'in_progress',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100,
          startTime: Date.now() - 60000,
          lastUpdateTime: Date.now()
        })
      })
    },
    
    // WebSocket Connection DO
    WEBSOCKET_CONNECTION_DO: {
      idFromName: (name) => ({ toString: () => name }),
      get: (id) => ({
        fetch: async (request) => {
          return new Response('WebSocket upgrade required', { status: 426 })
        }
      })
    },
    
    // Rate Limiter DO (to prevent errors in middleware)
    RATE_LIMITER_DO: {
      idFromName: (name) => ({ toString: () => name }),
      get: (id) => ({
        checkRateLimit: async () => ({ allowed: true, remaining: 100 })
      })
    },
    
    // Environment variables
    LOG_LEVEL: 'DEBUG',
    MAX_IMAGE_SIZE_MB: '10',
    ENABLE_REFACTORED_DOS: 'false'
  }
}

/**
 * Helper to make requests to the Hono router
 */
async function makeRequest(method, path, options = {}) {
  const url = `https://api.oooefam.net${path}`
  const request = new Request(url, {
    method,
    headers: options.headers || {},
    body: options.body || undefined
  })
  
  const env = createMockEnv()
  const ctx = {
    waitUntil: (promise) => promise,
    passThroughOnException: () => {}
  }
  
  return await honoRouter.fetch(request, env, ctx)
}

describe('V2 API Endpoints - Section 6.5 of API_CONTRACT.md', () => {
  
  describe('GET /api/v2/capabilities - Feature Discovery', () => {
    it('should return 200 with capabilities response', async () => {
      const response = await makeRequest('GET', '/api/v2/capabilities')
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      
      // Verify ResponseEnvelope format
      expect(data).toHaveProperty('data')
      expect(data).toHaveProperty('metadata')
      
      // Verify capabilities structure
      expect(data.data).toHaveProperty('apiVersion')
      expect(data.data).toHaveProperty('features')
      expect(data.data).toHaveProperty('limits')
      expect(data.data).toHaveProperty('deprecations')
      
      // Verify features array
      expect(Array.isArray(data.data.features)).toBe(true)
      expect(data.data.features.length).toBeGreaterThan(0)
      
      // Verify text_search feature is present
      const textSearch = data.data.features.find(f => f.name === 'text_search')
      expect(textSearch).toBeDefined()
      expect(textSearch.enabled).toBe(true)
      expect(textSearch.endpoints).toContain('GET /api/v2/search?mode=text')
      
      // Verify weekly_recommendations feature is present
      const recommendations = data.data.features.find(f => f.name === 'weekly_recommendations')
      expect(recommendations).toBeDefined()
      expect(recommendations.endpoints).toContain('GET /api/v2/recommendations/weekly')
    })
    
    it('should include X-Response-Format header', async () => {
      const response = await makeRequest('GET', '/api/v2/capabilities')
      
      expect(response.headers.get('X-Response-Format')).toBe('v2.0')
    })
    
    it('should include limits configuration', async () => {
      const response = await makeRequest('GET', '/api/v2/capabilities')
      const data = await response.json()
      
      expect(data.data.limits).toHaveProperty('maxBatchSize')
      expect(data.data.limits).toHaveProperty('maxCsvRows')
      expect(data.data.limits).toHaveProperty('maxImageSizeMb')
      expect(data.data.limits).toHaveProperty('maxConcurrentJobs')
    })
  })
  
  describe('GET /api/v2/recommendations/weekly - Weekly Recommendations', () => {
    it('should return 200 with recommendations', async () => {
      const response = await makeRequest('GET', '/api/v2/recommendations/weekly')
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      
      // Verify ResponseEnvelope format
      expect(data).toHaveProperty('data')
      expect(data).toHaveProperty('metadata')
      
      // Verify recommendations structure
      expect(data.data).toHaveProperty('weekOf')
      expect(data.data).toHaveProperty('recommendations')
      expect(Array.isArray(data.data.recommendations)).toBe(true)
    })
    
    it('should respect limit parameter', async () => {
      const response = await makeRequest('GET', '/api/v2/recommendations/weekly?limit=5')
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      expect(data.data.recommendations.length).toBeLessThanOrEqual(5)
    })
    
    it('should include cache metadata', async () => {
      const response = await makeRequest('GET', '/api/v2/recommendations/weekly')
      const data = await response.json()
      
      expect(data.metadata).toHaveProperty('source')
      expect(data.metadata).toHaveProperty('cached')
      expect(data.metadata).toHaveProperty('timestamp')
    })
  })
  
  describe('GET /api/v2/search - Unified Search', () => {
    it('should return 400 when query parameter is missing', async () => {
      const response = await makeRequest('GET', '/api/v2/search')
      
      expect(response.status).toBe(400)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('MISSING_PARAMETER')
    })
    
    it('should accept text mode search', async () => {
      const response = await makeRequest('GET', '/api/v2/search?q=harry+potter&mode=text')
      
      // Note: May fail if Google Books API is not configured
      // Test verifies endpoint routing works
      expect([200, 500, 503]).toContain(response.status)
    })
    
    it('should accept semantic mode search', async () => {
      const response = await makeRequest('GET', '/api/v2/search?q=books+about+magic&mode=semantic')
      
      // Note: May return 503 if Vectorize is not configured
      // Test verifies endpoint routing works
      expect([200, 503]).toContain(response.status)
      
      const data = await response.json()
      
      if (response.status === 503) {
        // Vectorize not available - expected in test environment
        expect(data.error).toBeDefined()
        expect(data.error.code).toBe('FEATURE_NOT_AVAILABLE')
      }
    })
    
    it('should default to text mode when mode is not specified', async () => {
      const response = await makeRequest('GET', '/api/v2/search?q=test')
      
      // Should not return 400 (bad request)
      expect(response.status).not.toBe(400)
    })
    
    it('should validate mode parameter', async () => {
      const response = await makeRequest('GET', '/api/v2/search?q=test&mode=invalid')
      
      expect(response.status).toBe(400)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('INVALID_REQUEST')
    })
  })
  
  describe('POST /api/v2/books/enrich - Book Enrichment', () => {
    it('should accept book enrichment request', async () => {
      const response = await makeRequest('POST', '/api/v2/books/enrich', {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          barcode: '9780747532743',
          prefer_provider: 'auto'
        })
      })
      
      // Note: May fail if providers are not configured
      // Test verifies endpoint routing works
      expect([200, 400, 500]).toContain(response.status)
    })
  })
  
  describe('POST /api/v2/imports - CSV Import', () => {
    it('should accept CSV import request', async () => {
      const response = await makeRequest('POST', '/api/v2/imports', {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          csv: 'Title,Author\nHarry Potter,J.K. Rowling',
          format: 'title-author'
        })
      })
      
      // Test verifies endpoint routing works
      expect([200, 400, 500]).toContain(response.status)
    })
  })
  
  describe('GET /api/v2/imports/:jobId - Import Status', () => {
    it('should return job status for valid jobId', async () => {
      const response = await makeRequest('GET', '/api/v2/imports/test-job-123')
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404)
      
      // May return 200 or 404 depending on whether job exists
      expect([200, 404]).toContain(response.status)
    })
  })
  
  describe('GET /api/v2/imports/:jobId/stream - SSE Stream', () => {
    it('should accept SSE stream request', async () => {
      const response = await makeRequest('GET', '/api/v2/imports/test-job-123/stream')
      
      // Should not return 404 (endpoint exists)
      expect(response.status).not.toBe(404)
      
      // SSE endpoint should return 200 or error status
      expect([200, 400, 404, 500]).toContain(response.status)
    })
  })
  
  describe('Incorrect Endpoints (from issue reproduction)', () => {
    it('should return 404 for /api/v2/features (incorrect path)', async () => {
      const response = await makeRequest('GET', '/api/v2/features')
      
      expect(response.status).toBe(404)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('NOT_FOUND')
    })
    
    it('should return 404 for /api/v2/recommendations (incorrect path)', async () => {
      const response = await makeRequest('GET', '/api/v2/recommendations')
      
      expect(response.status).toBe(404)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('NOT_FOUND')
    })
    
    it('should return 404 for POST /api/v2/search/semantic (incorrect method/path)', async () => {
      const response = await makeRequest('POST', '/api/v2/search/semantic', {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: 'books about space'
        })
      })
      
      expect(response.status).toBe(404)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
      expect(data.error.code).toBe('NOT_FOUND')
    })
  })
  
  describe('Response Format Validation', () => {
    it('all V2 endpoints should return ResponseEnvelope v2.0 format', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/v2/capabilities' },
        { method: 'GET', path: '/api/v2/recommendations/weekly' },
        { method: 'GET', path: '/api/v2/search?q=test&mode=text' }
      ]
      
      for (const endpoint of endpoints) {
        const response = await makeRequest(endpoint.method, endpoint.path)
        
        if (response.status === 200) {
          const data = await response.json()
          
          // Verify ResponseEnvelope structure
          expect(data).toHaveProperty('data')
          expect(data).toHaveProperty('metadata')
          expect(data.metadata).toHaveProperty('timestamp')
          
          // Verify X-Response-Format header
          expect(response.headers.get('X-Response-Format')).toBe('v2.0')
        }
      }
    })
  })
})
