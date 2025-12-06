/**
 * V3 API Endpoint Integration Tests
 *
 * Tests V3 API components and validates behavior:
 * - Router creation and route registration
 * - Schema validation for request/response formats
 * - Error response format (RFC 9457 Problem Details)
 * - HATEOAS link generation
 *
 * Note: Full HTTP-level tests require a running worker. These tests validate
 * the V3 router components in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createV3Router } from '../../src/api-v3/index'
import {
  SearchRequestSchema,
  SearchResponseSchema,
  EnrichRequestSchema,
  EnrichResponseSchema,
  BookSchema,
  ISBNSchema,
  JobInitResponseSchema,
  JobStatusResponseSchema
} from '@bookstrack/schemas'
import { createProblemDetails } from '@bookstrack/schemas/errors'

describe('V3 API Router', () => {
  let app: ReturnType<typeof createV3Router>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createV3Router()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Router Creation', () => {
    it('should create V3 router successfully', () => {
      expect(app).toBeDefined()
      expect(app.fetch).toBeDefined()
      expect(typeof app.fetch).toBe('function')
    })

    it('should register OpenAPI routes', () => {
      // The router should have the openAPIRegistry
      expect(app.openAPIRegistry).toBeDefined()
    })
  })
})

describe('V3 API Request Schemas', () => {
  describe('SearchRequestSchema', () => {
    it('should validate valid search request', () => {
      const result = SearchRequestSchema.safeParse({
        q: 'Harry Potter',
        mode: 'text',
        page: 1,
        limit: 20
      })
      expect(result.success).toBe(true)
    })

    it('should require query parameter', () => {
      const result = SearchRequestSchema.safeParse({
        mode: 'text'
      })
      expect(result.success).toBe(false)
    })

    it('should default mode to text', () => {
      const result = SearchRequestSchema.safeParse({ q: 'test' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.mode).toBe('text')
      }
    })

    it('should default page to 1', () => {
      const result = SearchRequestSchema.safeParse({ q: 'test' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
      }
    })

    it('should default limit to 20', () => {
      const result = SearchRequestSchema.safeParse({ q: 'test' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(20)
      }
    })

    it('should reject invalid page values', () => {
      const result = SearchRequestSchema.safeParse({
        q: 'test',
        page: 0
      })
      expect(result.success).toBe(false)
    })

    it('should reject limit > 100', () => {
      const result = SearchRequestSchema.safeParse({
        q: 'test',
        limit: 101
      })
      expect(result.success).toBe(false)
    })
  })

  describe('EnrichRequestSchema', () => {
    it('should validate valid enrich request with isbns', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: ['9780439708180'],
        includeEmbedding: false
      })
      expect(result.success).toBe(true)
    })

    it('should validate valid enrich request with barcodes', () => {
      const result = EnrichRequestSchema.safeParse({
        barcodes: ['9780439708180'],
        includeEmbedding: false
      })
      expect(result.success).toBe(true)
    })

    it('should support async flag', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: ['9780439708180'],
        async: true
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.async).toBe(true)
      }
    })

    it('should default async to false', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: ['9780439708180']
      })
      expect(result.success).toBe(true)
    })

    it('should enforce 50 ISBN limit in sync mode', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: Array(51).fill('9780439708180'),
        async: false
      })
      expect(result.success).toBe(false)
    })

    it('should allow 500 ISBNs in async mode', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: Array(500).fill('9780439708180'),
        async: true
      })
      expect(result.success).toBe(true)
    })

    it('should reject > 500 ISBNs', () => {
      const result = EnrichRequestSchema.safeParse({
        isbns: Array(501).fill('9780439708180'),
        async: true
      })
      expect(result.success).toBe(false)
    })

    it('should require either isbns or barcodes', () => {
      const result = EnrichRequestSchema.safeParse({
        includeEmbedding: false
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ISBNSchema', () => {
    it('should validate ISBN-13', () => {
      const result = ISBNSchema.safeParse('9780439708180')
      expect(result.success).toBe(true)
    })

    it('should validate ISBN-10', () => {
      const result = ISBNSchema.safeParse('0439708184')
      expect(result.success).toBe(true)
    })

    it('should reject invalid ISBN format', () => {
      const result = ISBNSchema.safeParse('invalid')
      expect(result.success).toBe(false)
    })

    it('should reject ISBN with wrong length', () => {
      const result = ISBNSchema.safeParse('123456')
      expect(result.success).toBe(false)
    })
  })
})

describe('V3 API Response Schemas', () => {
  describe('SearchResponseSchema', () => {
    it('should validate valid search response', () => {
      const response = {
        success: true,
        data: {
          books: [],
          total: 0,
          query: { q: 'test', mode: 'text' },
          pagination: {
            type: 'offset',
            page: 1,
            limit: 20,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          cached: false,
          processingTimeMs: 100
        }
      }
      const result = SearchResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })

    it('should validate response with books', () => {
      const response = {
        success: true,
        data: {
          books: [{
            isbn: '9780439708180',
            title: 'Harry Potter',
            authors: ['J.K. Rowling'],
            provider: 'alexandria',
            quality: 95
          }],
          total: 1,
          query: { q: 'harry', mode: 'text' },
          pagination: {
            type: 'offset',
            page: 1,
            limit: 20,
            totalPages: 1,
            hasNext: false,
            hasPrev: false
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: '123e4567-e89b-12d3-a456-426614174000'
        }
      }
      const result = SearchResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })
  })

  describe('EnrichResponseSchema', () => {
    it('should validate sync enrichment response', () => {
      const response = {
        success: true,
        data: {
          books: [{
            isbn: '9780439708180',
            title: 'Harry Potter',
            authors: ['J.K. Rowling'],
            provider: 'alexandria',
            quality: 95,
            vectorized: false // Required by EnrichedBookSchema
          }],
          requested: 1,
          found: 1
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          processingTimeMs: 500
        }
      }
      const result = EnrichResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })

    it('should include notFound array', () => {
      const response = {
        success: true,
        data: {
          books: [],
          requested: 1,
          found: 0,
          notFound: ['9999999999999']
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: '123e4567-e89b-12d3-a456-426614174000'
        }
      }
      const result = EnrichResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })
  })

  describe('JobInitResponseSchema', () => {
    it('should validate job init response', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          streamUrl: 'https://api.example.com/v3/jobs/enrichment/550e8400/stream',
          token: 'abc123def456'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: '123e4567-e89b-12d3-a456-426614174000'
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })

    it('should require streamUrl', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          token: 'abc123def456'
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should require token', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          streamUrl: 'https://api.example.com/v3/jobs/enrichment/550e8400/stream'
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(false)
    })
  })
})

describe('V3 API Error Handling', () => {
  describe('RFC 9457 Problem Details', () => {
    it('should create valid problem details for NOT_FOUND', () => {
      const problem = createProblemDetails('NOT_FOUND', 'Book not found', {
        requestId: '123e4567-e89b-12d3-a456-426614174000',
        instance: '/v3/books/9999999999999'
      })

      // Type uses kebab-case URL format per RFC 9457
      expect(problem.type).toContain('not-found')
      expect(problem.title).toBeDefined()
      expect(problem.status).toBe(404)
      expect(problem.detail).toBe('Book not found')
    })

    it('should create valid problem details for INVALID_REQUEST', () => {
      const problem = createProblemDetails('INVALID_REQUEST', 'Missing required field', {
        requestId: '123e4567-e89b-12d3-a456-426614174000'
      })

      expect(problem.type).toContain('invalid-request')
      expect(problem.status).toBe(400)
    })

    it('should create valid problem details for INTERNAL_ERROR', () => {
      const problem = createProblemDetails('INTERNAL_ERROR', 'Database connection failed', {
        requestId: '123e4567-e89b-12d3-a456-426614174000'
      })

      expect(problem.type).toContain('internal-error')
      expect(problem.status).toBe(500)
    })

    it('should include requestId in metadata', () => {
      const problem = createProblemDetails('NOT_FOUND', 'Book not found', {
        requestId: 'test-request-id'
      })

      // requestId is in metadata, not directly on the problem object
      expect(problem.metadata?.requestId).toBe('test-request-id')
    })

    it('should include instance when provided', () => {
      const problem = createProblemDetails('NOT_FOUND', 'Book not found', {
        instance: '/v3/books/123'
      })

      expect(problem.instance).toBe('/v3/books/123')
    })
  })
})

describe('V3 API Common Utilities', () => {
  describe('generateAuthToken', () => {
    it('should generate 64-character hex token', async () => {
      const { generateAuthToken } = await import('../../src/api-v3/jobs/common')
      const token = generateAuthToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should generate unique tokens', async () => {
      const { generateAuthToken } = await import('../../src/api-v3/jobs/common')
      const tokens = new Set()
      for (let i = 0; i < 100; i++) {
        tokens.add(generateAuthToken())
      }
      expect(tokens.size).toBe(100)
    })
  })

  describe('validateTokenFormat', () => {
    it('should validate correct token format', async () => {
      const { validateTokenFormat } = await import('../../src/api-v3/jobs/common')
      const validToken = 'a'.repeat(64)
      expect(validateTokenFormat(validToken)).toBe(true)
    })

    it('should reject invalid token', async () => {
      const { validateTokenFormat } = await import('../../src/api-v3/jobs/common')
      expect(validateTokenFormat('short')).toBe(false)
      expect(validateTokenFormat('')).toBe(false)
      expect(validateTokenFormat(undefined)).toBe(false)
    })
  })

  describe('buildStreamUrl', () => {
    it('should build stream URL for imports', async () => {
      const { buildStreamUrl } = await import('../../src/api-v3/jobs/common')
      const url = buildStreamUrl('https://api.example.com/v3/jobs/imports', 'imports', 'job-123')
      expect(url).toContain('/v3/jobs/imports/job-123/stream')
    })

    it('should build stream URL for enrichment', async () => {
      const { buildStreamUrl } = await import('../../src/api-v3/jobs/common')
      const url = buildStreamUrl('https://api.example.com/v3/books/enrich', 'enrichment', 'job-456')
      expect(url).toContain('/v3/jobs/enrichment/job-456/stream')
    })

    it('should build stream URL for scans', async () => {
      const { buildStreamUrl } = await import('../../src/api-v3/jobs/common')
      const url = buildStreamUrl('https://api.example.com/v3/jobs/scans', 'scans', 'job-789')
      expect(url).toContain('/v3/jobs/scans/job-789/stream')
    })
  })

  describe('createJobLinks', () => {
    it('should create HATEOAS links for jobs', async () => {
      const { createJobLinks } = await import('../../src/api-v3/jobs/common')
      const links = createJobLinks('imports', 'job-123', 'https://api.example.com/stream')

      expect(links.self).toBeDefined()
      expect(links.self.href).toContain('/v3/jobs/imports/job-123')
      expect(links.self.method).toBe('GET')

      expect(links.stream).toBeDefined()
      expect(links.stream.href).toBe('https://api.example.com/stream')

      expect(links.cancel).toBeDefined()
      expect(links.cancel.method).toBe('DELETE')
    })
  })
})

describe('V3 API Book Schema', () => {
  describe('BookSchema', () => {
    it('should validate minimal book', () => {
      const book = {
        isbn: '9780439708180',
        title: 'Harry Potter',
        authors: ['J.K. Rowling'],
        provider: 'alexandria',
        quality: 95
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(true)
    })

    it('should validate complete book', () => {
      const book = {
        isbn: '9780439708180',
        isbn10: '0439708184',
        title: 'Harry Potter and the Sorcerer\'s Stone',
        subtitle: 'Book 1',
        authors: ['J.K. Rowling'],
        publisher: 'Scholastic',
        publishedDate: '1998',
        description: 'The first Harry Potter book',
        pageCount: 309,
        categories: ['Fantasy', 'Young Adult'],
        language: 'en',
        coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
        thumbnailUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
        workKey: 'OL82563W',
        editionKey: 'OL12345M',
        provider: 'alexandria',
        quality: 95,
        vectorized: false
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(true)
    })

    it('should require isbn', () => {
      const book = {
        title: 'Harry Potter',
        authors: ['J.K. Rowling'],
        provider: 'alexandria',
        quality: 95
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(false)
    })

    it('should require title', () => {
      const book = {
        isbn: '9780439708180',
        authors: ['J.K. Rowling'],
        provider: 'alexandria',
        quality: 95
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(false)
    })

    it('should require authors array', () => {
      const book = {
        isbn: '9780439708180',
        title: 'Harry Potter',
        provider: 'alexandria',
        quality: 95
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(false)
    })

    it('should require provider', () => {
      const book = {
        isbn: '9780439708180',
        title: 'Harry Potter',
        authors: ['J.K. Rowling'],
        quality: 95
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(false)
    })

    it('should require quality score', () => {
      const book = {
        isbn: '9780439708180',
        title: 'Harry Potter',
        authors: ['J.K. Rowling'],
        provider: 'alexandria'
      }
      const result = BookSchema.safeParse(book)
      expect(result.success).toBe(false)
    })
  })
})
