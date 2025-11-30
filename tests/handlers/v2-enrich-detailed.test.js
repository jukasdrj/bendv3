/**
 * Integration test for V2 enrich detailed handler - Issue #150
 *
 * Verifies that the V2 detailed enrich handler returns nested canonical DTOs
 * (WorkDTO, EditionDTO, AuthorDTO) instead of a flat structure.
 *
 * This endpoint provides richer metadata for clients that need the full data model,
 * while maintaining backward compatibility with the flat `/api/v2/books/enrich` endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEnrichBookDetailed } from '../../src/handlers/v2/enrich-detailed.ts'

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
          primaryProvider: 'alexandria',
          synthetic: false,
          goodreadsWorkIDs: ['OL82537W'],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: ['abc123'],
          isbndbQuality: 85,
          reviewStatus: 'verified',
          firstPublicationYear: 1997,
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
          googleBooksVolumeIDs: ['abc123'],
          librarythingIDs: [],
          isbndbQuality: 85,
        }],
        authors: [{
          name: 'J.K. Rowling',
          gender: 'FEMALE',
          culturalRegion: 'EUROPE',
          nationality: 'British',
          birthYear: 1965,
        }],
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

describe('V2 Enrich Detailed Handler - Issue #150: Nested canonical DTOs', () => {
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

  it('should return nested canonical DTOs (WorkDTO, EditionDTO, AuthorDTO)', async () => {
    // Create a POST request with ISBN
    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    // Call handler
    const response = await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Verify success response
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    // Verify top-level fields
    expect(data.data).toBeDefined()
    expect(data.data.isbn).toBe('9780439708180')
    expect(data.data.title).toBe('Harry Potter and the Philosopher\'s Stone')
    expect(data.data.provider).toBe('alexandria')
    expect(data.data.enrichedAt).toBeDefined()
    expect(data.data.vectorized).toBe(false)

    // CRITICAL: Verify nested WorkDTO
    expect(data.data.work).toBeDefined()
    expect(data.data.work.title).toBe('Harry Potter and the Philosopher\'s Stone')
    expect(data.data.work.subjectTags).toEqual(['Fantasy', 'Magic', 'Children\'s'])
    expect(data.data.work.description).toBe('A young wizard discovers his magical heritage')
    expect(data.data.work.coverImageURL).toBe('https://example.com/cover.jpg')
    expect(data.data.work.primaryProvider).toBe('alexandria')
    expect(data.data.work.firstPublicationYear).toBe(1997)
    expect(data.data.work.synthetic).toBe(false)
    expect(data.data.work.goodreadsWorkIDs).toEqual(['OL82537W'])
    expect(data.data.work.isbndbQuality).toBe(85)
    expect(data.data.work.reviewStatus).toBe('verified')

    // CRITICAL: Verify nested EditionDTO
    expect(data.data.edition).toBeDefined()
    expect(data.data.edition.isbn).toBe('9780439708180')
    expect(data.data.edition.isbns).toEqual(['9780439708180'])
    expect(data.data.edition.publisher).toBe('Bloomsbury')
    expect(data.data.edition.publicationDate).toBe('1997-06-26')
    expect(data.data.edition.pageCount).toBe(309)
    expect(data.data.edition.format).toBe('HARDCOVER')
    expect(data.data.edition.coverImageURL).toBe('https://example.com/cover.jpg')
    expect(data.data.edition.primaryProvider).toBe('alexandria')

    // CRITICAL: Verify nested AuthorDTO array
    expect(data.data.authors).toBeDefined()
    expect(data.data.authors).toHaveLength(1)
    expect(data.data.authors[0].name).toBe('J.K. Rowling')
    expect(data.data.authors[0].gender).toBe('FEMALE')
    expect(data.data.authors[0].culturalRegion).toBe('EUROPE')
    expect(data.data.authors[0].nationality).toBe('British')
    expect(data.data.authors[0].birthYear).toBe(1965)

    // Verify metadata
    expect(data.metadata.source).toBe('alexandria')
    expect(data.metadata.cached).toBe(false)
  })

  it('should use enrichMultipleBooks for ISBN lookups', async () => {
    const { enrichMultipleBooks } = await import('../../src/services/enrichment')

    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)

    // Verify enrichMultipleBooks was called with correct parameters
    expect(enrichMultipleBooks).toHaveBeenCalledWith(
      { isbn: '9780439708180' },
      mockEnv,
      { maxResults: 1 },
      mockCtx
    )
  })

  it('should handle empty results gracefully', async () => {
    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9999999999999' }), // ISBN with no results
    })

    const response = await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Should return 404 when book not found
    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('NOT_FOUND')
  })

  it('should accept barcode parameter (contract-compliant)', async () => {
    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ barcode: '9780439708180' }), // Using 'barcode' instead of 'isbn'
    })

    const response = await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Should work with barcode parameter
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Harry Potter and the Philosopher\'s Stone')
  })

  it('should cache detailed responses separately from flat responses', async () => {
    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)

    // Verify cache key is different from flat endpoint
    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'book:isbn:detailed:9780439708180',
      expect.any(String),
      expect.objectContaining({ expirationTtl: 86400 })
    )
  })

  it('should return cached detailed response when available', async () => {
    // Mock cached detailed response
    const cachedResponse = {
      isbn: '9780439708180',
      title: 'Cached Book',
      work: {
        title: 'Cached Book',
        subjectTags: ['Cached'],
        primaryProvider: 'cache',
        synthetic: false,
        goodreadsWorkIDs: [],
        amazonASINs: [],
        librarythingIDs: [],
        googleBooksVolumeIDs: [],
        isbndbQuality: 100,
        reviewStatus: 'verified',
      },
      edition: {
        isbn: '9780439708180',
        isbns: ['9780439708180'],
        format: 'PAPERBACK',
        primaryProvider: 'cache',
        amazonASINs: [],
        googleBooksVolumeIDs: [],
        librarythingIDs: [],
        isbndbQuality: 100,
      },
      authors: [{ name: 'Cached Author', gender: 'UNKNOWN' }],
      provider: 'cache',
      enrichedAt: '2025-11-30T00:00:00.000Z',
      vectorized: false,
    }

    mockEnv.CACHE.get = vi.fn().mockResolvedValue(cachedResponse)

    const mockRequest = new Request('http://localhost/api/v2/books/enrich/detailed', {
      method: 'POST',
      body: JSON.stringify({ isbn: '9780439708180' }),
    })

    const response = await handleEnrichBookDetailed(mockRequest, mockEnv, mockCtx)
    const data = await response.json()

    // Verify cached response is returned
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.title).toBe('Cached Book')
    expect(data.data.work.primaryProvider).toBe('cache')
    expect(data.metadata.cached).toBe(true)
    expect(data.metadata.source).toBe('kv-cache')
  })
})
