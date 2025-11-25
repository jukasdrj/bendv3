import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateResponse, getMissingFields, validateApiContract } from '../../src/middleware/api-contract-validator.js'

describe('API Contract Validator', () => {
  describe('validateResponse', () => {
    describe('Success Responses', () => {
      it('should validate correct success response', () => {
        const response = {
          success: true,
          data: { isbn: '9780439708180', title: 'Harry Potter' },
          metadata: {
            source: 'google_books',
            cached: true,
            timestamp: '2025-01-10T12:00:00Z'
          }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(true)
        expect(result.failures).toHaveLength(0)
      })

      it('should require success field', () => {
        const response = {
          data: { isbn: '123' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_success_field')
      })

      it('should require data field for success=true', () => {
        const response = {
          success: true,
          metadata: { source: 'api' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_data_field')
      })

      it('should warn about missing metadata', () => {
        const response = {
          success: true,
          data: { isbn: '123' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_metadata_field')
      })

      it('should validate metadata type', () => {
        const response = {
          success: true,
          data: { isbn: '123' },
          metadata: 'invalid string'
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('invalid_metadata_type')
      })

      it('should accept response with data as null', () => {
        const response = {
          success: true,
          data: null,
          metadata: { source: 'api' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(true)
      })

      it('should accept response with empty data object', () => {
        const response = {
          success: true,
          data: {},
          metadata: { source: 'api' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(true)
      })
    })

    describe('Error Responses', () => {
      it('should validate correct error response', () => {
        const response = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Book not found',
            statusCode: 404
          }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(true)
        expect(result.failures).toHaveLength(0)
      })

      it('should require error field for success=false', () => {
        const response = {
          success: false
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_error_field')
      })

      it('should require error.code', () => {
        const response = {
          success: false,
          error: {
            message: 'Something went wrong'
          }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_error_code')
      })

      it('should require error.message', () => {
        const response = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR'
          }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_error_message')
      })

      it('should accept error with additional fields', () => {
        const response = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            statusCode: 400,
            details: { field: 'isbn', reason: 'Invalid format' }
          }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(true)
      })
    })

    describe('Invalid Responses', () => {
      it('should reject non-object responses', () => {
        const result1 = validateResponse(null)
        expect(result1.valid).toBe(false)
        expect(result1.failures).toContain('response_not_object')

        const result2 = validateResponse('string')
        expect(result2.valid).toBe(false)

        const result3 = validateResponse(123)
        expect(result3.valid).toBe(false)

        const result4 = validateResponse([])
        expect(result4.valid).toBe(false)
      })

      it('should reject empty object', () => {
        const response = {}

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_success_field')
      })

      it('should reject success field with wrong type', () => {
        const response = {
          success: 'true', // String instead of boolean
          data: { isbn: '123' }
        }

        const result = validateResponse(response)
        expect(result.valid).toBe(false)
        expect(result.failures).toContain('missing_success_field')
      })
    })
  })

  describe('getMissingFields', () => {
    it('should identify missing fields', () => {
      const body = {
        success: true,
        data: { isbn: '123' }
      }

      const missing = getMissingFields(body, ['success', 'data', 'metadata'])
      expect(missing).toEqual(['metadata'])
    })

    it('should return empty array when all fields present', () => {
      const body = {
        success: true,
        data: { isbn: '123' },
        metadata: { source: 'api' }
      }

      const missing = getMissingFields(body, ['success', 'data', 'metadata'])
      expect(missing).toHaveLength(0)
    })

    it('should handle multiple missing fields', () => {
      const body = {
        success: true
      }

      const missing = getMissingFields(body, ['success', 'data', 'metadata', 'error'])
      expect(missing).toContain('data')
      expect(missing).toContain('metadata')
      expect(missing).toContain('error')
    })
  })

  describe('Hono Middleware', () => {
    let mockContext
    let mockStub
    let next

    beforeEach(() => {
      mockStub = {
        recordApiContractMetrics: vi.fn(async () => {})
      }

      mockContext = {
        req: {
          path: '/v1/search/isbn'
        },
        res: new Response(
          JSON.stringify({
            success: true,
            data: { isbn: '123' },
            metadata: { source: 'api' }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
        env: {
          CACHE_METRICS_DO: {
            idFromName: vi.fn(() => 'mock-id'),
            get: vi.fn(() => mockStub)
          }
        }
      }

      next = vi.fn(async () => {})
    })

    it('should validate response and record metrics', async () => {
      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(next).toHaveBeenCalled()
      expect(mockStub.recordApiContractMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/v1/search/isbn',
          status: 200,
          valid: true,
          failures: []
        })
      )
    })

    it('should skip non-JSON responses', async () => {
      mockContext.res = new Response('Hello World', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })

      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).not.toHaveBeenCalled()
    })

    it('should skip non-API endpoints', async () => {
      mockContext.req.path = '/health'

      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).not.toHaveBeenCalled()
    })

    it('should validate /v1/ endpoints', async () => {
      mockContext.req.path = '/v1/books/123'

      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).toHaveBeenCalled()
    })

    it('should validate /api/ endpoints', async () => {
      mockContext.req.path = '/api/batch-enrich'

      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).toHaveBeenCalled()
    })

    it('should record validation failures', async () => {
      mockContext.res = new Response(
        JSON.stringify({
          success: true
          // Missing data and metadata fields
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )

      const middleware = validateApiContract({ logFailures: true })
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          failures: expect.arrayContaining(['missing_data_field', 'missing_metadata_field'])
        })
      )
    })

    it('should handle strict mode', async () => {
      mockContext.res = new Response(
        JSON.stringify({
          success: true
          // Invalid response
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )

      const middleware = validateApiContract({ strict: true })
      await middleware(mockContext, next)

      // Response should be replaced with error
      const body = await mockContext.res.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('API_CONTRACT_VIOLATION')
      expect(mockContext.res.status).toBe(500)
    })

    it('should not replace response in non-strict mode', async () => {
      mockContext.res = new Response(
        JSON.stringify({
          success: true,
          data: { isbn: '123' }
          // Missing metadata - still invalid
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )

      const originalResponse = mockContext.res

      const middleware = validateApiContract({ strict: false })
      await middleware(mockContext, next)

      // Response should NOT be replaced
      expect(mockContext.res).toBe(originalResponse)
    })

    it('should handle JSON parse errors', async () => {
      mockContext.res = new Response(
        'invalid json{',
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )

      const middleware = validateApiContract()
      await middleware(mockContext, next)

      expect(mockStub.recordApiContractMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          failures: ['response_parse_error']
        })
      )
    })

    it('should not throw if metrics recording fails', async () => {
      mockStub.recordApiContractMetrics.mockRejectedValue(new Error('Metrics unavailable'))

      const middleware = validateApiContract()

      // Should not throw
      await expect(
        middleware(mockContext, next)
      ).resolves.toBeUndefined()
    })

    it('should handle missing CACHE_METRICS_DO gracefully', async () => {
      mockContext.env = {} // No metrics DO

      const middleware = validateApiContract()

      // Should not throw
      await expect(
        middleware(mockContext, next)
      ).resolves.toBeUndefined()
    })
  })

  describe('Configuration Options', () => {
    let mockContext
    let next

    beforeEach(() => {
      mockContext = {
        req: { path: '/v1/test' },
        res: new Response(
          JSON.stringify({ success: true, data: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
        env: {
          CACHE_METRICS_DO: {
            idFromName: vi.fn(() => 'id'),
            get: vi.fn(() => ({
              recordApiContractMetrics: vi.fn(async () => {})
            }))
          }
        }
      }
      next = vi.fn(async () => {})
    })

    it('should respect logFailures option', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Invalid response
      mockContext.res = new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

      const middleware = validateApiContract({ logFailures: true })
      await middleware(mockContext, next)

      expect(consoleWarn).toHaveBeenCalled()

      consoleWarn.mockRestore()
    })

    it('should not log when logFailures is false', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockContext.res = new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

      const middleware = validateApiContract({ logFailures: false })
      await middleware(mockContext, next)

      expect(consoleWarn).not.toHaveBeenCalled()

      consoleWarn.mockRestore()
    })
  })
})
