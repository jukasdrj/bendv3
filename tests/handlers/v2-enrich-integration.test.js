/**
 * Integration test for V2 enrich handler - Issue #151
 *
 * Verifies that the V2 enrich handler uses enrichMultipleBooks service
 * which includes Alexandria in the provider pipeline.
 *
 * Before fix: V2 handler made direct API calls to Google Books/OpenLibrary,
 * bypassing Alexandria (causing provider to never be Alexandria).
 *
 * After fix: V2 handler uses enrichMultipleBooks which orchestrates:
 * 1. Alexandria (local, free, fast)
 * 2. Google Books (comprehensive metadata)
 * 3. OpenLibrary (free fallback)
 * 4. ISBNdb (cover images)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEnrichBook } from '../../src/handlers/v2/enrich.ts'

// Mock enrichment service to verify it's being called
vi.mock('../../src/services/enrichment', () => ({
  enrichMultipleBooks: vi.fn(async ({ isbn }, env, options, ctx) => {
    // Simulate Alexandria response (primary provider in pipeline)
    if (isbn === '9780439708180') {
      return {
        works: [{
          title: 'Harry Potter and the Philosopher\'s Stone',
          subjectTags: ['Fantasy', 'Magic', 'Children\'s'],
          description: 'A young wizard discovers his magical heritage',
          coverImageURL: 'https://example.com/cover.jpg',
          primaryProvider: 'alexandria', // KEY: Alexandria provider from enrichMultipleBooks
          synthetic: false,
          goodreadsWorkIDs: [],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 85,
          reviewStatus: 'verified',
        }],
        editions: [{
          isbn: '9780439708180',
          isbns: ['9780439708180'],
          publisher: 'Bloomsbury',
          publicationDate: '1997-06-26',
          pageCount: 309,
          format: 'HARDCOVER',
          coverImageURL: 'https://example.com/cover.jpg',
          primaryProvider: 'alexandria',
          amazonASINs: [],
          googleBooksVolumeIDs: [],
          librarythingIDs: [],
          isbndbQuality: 85,
        }],
        authors: [
          { name: 'J.K. Rowling' }
        ],
      }
    }
    return { works: [], editions: [], authors: [] }
  })
}))

// Mock embedding service
vi.mock('../../src/services/embedding-service', () => ({
  generateBookEmbedding: vi.fn().mockResolvedValue(null),
  storeEmbedding: vi.fn().mockResolvedValue(false),
}))

describe('V2 Enrich Handler - Issue #151: Alexandria provider integration', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn().mockResolvedValue(null), // No cache hit
        put: vi.fn().mockResolvedValue(undefined),
      },
      DB: null,
      AI: null,
    }

    mockCtx = {
      waitUntil: vi.fn(),
    }
  })

  it('should use enrichMultipleBooks for ISBN lookups', async () => {
    // Create a POST request with ISBN
    const mockRequest = new Request('http://localhost/api/v2/books/enrich', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    // Call handler
    const response = await handleEnrichBook(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Verify success response
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    // Verify book data is returned
    expect(data.data).toBeDefined()
    expect(data.data.title).toBe('Harry Potter and the Philosopher\'s Stone')
    expect(data.data.authors).toContain('J.K. Rowling')
    expect(data.data.publisher).toBe('Bloomsbury')
    expect(data.data.pageCount).toBe(309)

    // CRITICAL: Verify Alexandria provider appears in metadata
    // This is the key fix for issue #151
    expect(data.metadata.source).toBe('alexandria')
    expect(data.data.provider).toBe('alexandria')
  })

  it('should pass ExecutionContext to enrichMultipleBooks', async () => {
    const { enrichMultipleBooks } = await import('../../src/services/enrichment')

    const mockRequest = new Request('http://localhost/api/v2/books/enrich', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    await handleEnrichBook(mockRequest, mockEnv, mockCtx)

    // Verify enrichMultipleBooks was called with ctx parameter
    expect(enrichMultipleBooks).toHaveBeenCalledWith(
      { isbn: '9780439708180' },
      mockEnv,
      { maxResults: 1 },
      mockCtx
    )
  })

  it('should handle empty results gracefully', async () => {
    const mockRequest = new Request('http://localhost/api/v2/books/enrich', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9999999999999' }), // ISBN with no results
    })

    const response = await handleEnrichBook(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Should return 404 when book not found
    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('NOT_FOUND')
  })

  it('should accept barcode parameter (contract-compliant)', async () => {
    const mockRequest = new Request('http://localhost/api/v2/books/enrich', {
      method: 'POST',
      body: JSON.stringify({ barcode: '9780439708180' }), // Using 'barcode' instead of 'isbn'
    })

    const response = await handleEnrichBook(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Should work with barcode parameter
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Harry Potter and the Philosopher\'s Stone')
  })
})
