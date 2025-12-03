/**
 * Unit tests for enrichment-queue-consumer
 *
 * Tests the processEnrichmentBatch function and updateLibraryWithCover helper.
 * Verifies that background enrichment correctly updates user libraries with cover images.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processEnrichmentBatch } from '../../src/handlers/enrichment-queue-consumer.ts'
import type { MessageBatch, ExecutionContext } from '@cloudflare/workers-types'
import type { Env } from '../../src/types/env.js'

// Mock the enrichMultipleBooks service
vi.mock('../../src/services/enrichment.js', () => ({
  enrichMultipleBooks: vi.fn(),
}))

// Create a mock book repository instance
const mockBookRepoInstance = {
  findByISBN: vi.fn(),
  save: vi.fn(),
}

// Mock the BookRepository
vi.mock('../../src/repositories/book-repository.js', () => ({
  BookRepository: vi.fn(function() {
    return mockBookRepoInstance
  }),
}))

import { enrichMultipleBooks } from '../../src/services/enrichment.js'
import { BookRepository } from '../../src/repositories/book-repository.js'

// Helper to create mock environment
const createMockEnv = (): Env => ({
  PERFORMANCE_ANALYTICS: {
    writeDataPoint: vi.fn(),
  },
  BOOK_CACHE: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  },
  D1: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true }),
    }),
  },
} as unknown as Env)

// Helper to create mock execution context
const createMockContext = (): ExecutionContext => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
})

// Helper to create mock queue message
const createMockMessage = (isbn: string, source = 'csv_import') => ({
  id: `msg-${isbn}`,
  timestamp: new Date(),
  body: {
    entity_type: 'edition' as const,
    isbn,
    source: source as 'csv_import' | 'batch_enrichment' | 'scan_import',
    priority: 5,
  },
  ack: vi.fn(),
  retry: vi.fn(),
})

describe('processEnrichmentBatch', () => {
  let mockEnv: Env
  let mockCtx: ExecutionContext

  beforeEach(() => {
    mockEnv = createMockEnv()
    mockCtx = createMockContext()

    // Reset mocks
    vi.clearAllMocks()
  })

  describe('Basic queue processing', () => {
    it('should process batch of messages and update analytics', async () => {
      const messages = [
        createMockMessage('9780439708180'),
        createMockMessage('9780451524935'),
      ]

      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      // Mock enrichMultipleBooks to return successful results
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: 'https://example.com/cover.jpg',
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to return no existing book (will skip update)
      mockBookRepoInstance.findByISBN.mockResolvedValue(null)

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify messages were acknowledged
      expect(messages[0].ack).toHaveBeenCalled()
      expect(messages[1].ack).toHaveBeenCalled()

      // Verify analytics were logged
      expect(mockEnv.PERFORMANCE_ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          blobs: ['enrichment_queue', 'batch_processed'],
          indexes: ['enrichment_queue'],
        }),
      )
    })

    it('should skip messages without ISBN', async () => {
      const messages = [createMockMessage('')]
      messages[0].body.isbn = '' // Invalid ISBN

      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Should ack but not enrich
      expect(messages[0].ack).toHaveBeenCalled()
      expect(enrichMultipleBooks).not.toHaveBeenCalled()
    })

    it('should retry failed enrichments', async () => {
      const messages = [createMockMessage('9780439708180')]

      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      // Mock enrichMultipleBooks to throw error
      vi.mocked(enrichMultipleBooks).mockRejectedValue(new Error('Provider timeout'))

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Should retry, not ack
      expect(messages[0].retry).toHaveBeenCalled()
      expect(messages[0].ack).not.toHaveBeenCalled()
    })
  })

  describe('updateLibraryWithCover (via integration)', () => {
    it('should update library with cover URL when book exists and has no cover', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      const coverUrl = 'https://covers.openlibrary.org/b/isbn/9780439708180-L.jpg'

      // Mock enrichMultipleBooks to return result with cover
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: coverUrl,
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to return existing book without cover
      mockBookRepoInstance.findByISBN.mockResolvedValue({
        isbn,
        title: 'Harry Potter',
        coverSmallUrl: null,
        coverMediumUrl: null,
        coverLargeUrl: null,
        canonicalMetadata: {
          works: [],
          editions: [],
          authors: [],
        },
      })

      // Mock save to succeed
      mockBookRepoInstance.save.mockResolvedValue(undefined)

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify findByISBN was called
      expect(mockBookRepoInstance.findByISBN).toHaveBeenCalledWith(isbn)

      // Verify save was called with updated book
      expect(mockBookRepoInstance.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isbn,
          coverSmallUrl: coverUrl,
          coverMediumUrl: coverUrl,
          coverLargeUrl: coverUrl,
          canonicalMetadata: expect.objectContaining({
            works: expect.arrayContaining([
              expect.objectContaining({
                title: 'Harry Potter',
              }),
            ]),
          }),
        }),
      )
    })

    it('should skip update when book not found in library', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      // Mock enrichMultipleBooks to return result with cover
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: 'https://example.com/cover.jpg',
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to return null (book not in library)
      mockBookRepoInstance.findByISBN.mockResolvedValue(null)

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify save was NOT called
      expect(mockBookRepoInstance.save).not.toHaveBeenCalled()

      // Message should still be acknowledged
      expect(messages[0].ack).toHaveBeenCalled()
    })

    it('should skip update when book already has covers', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      // Mock enrichMultipleBooks to return result with cover
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: 'https://example.com/new-cover.jpg',
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to return book with existing cover
      mockBookRepoInstance.findByISBN.mockResolvedValue({
        isbn,
        title: 'Harry Potter',
        coverSmallUrl: 'https://example.com/old-cover-small.jpg',
        coverMediumUrl: 'https://example.com/old-cover-medium.jpg',
        coverLargeUrl: 'https://example.com/old-cover-large.jpg',
      })

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify save was NOT called
      expect(mockBookRepoInstance.save).not.toHaveBeenCalled()

      // Message should still be acknowledged
      expect(messages[0].ack).toHaveBeenCalled()
    })

    it('should preserve existing user data (ratings, notes) during update', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      const coverUrl = 'https://example.com/cover.jpg'

      // Mock enrichMultipleBooks
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: coverUrl,
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to return book with user data
      mockBookRepoInstance.findByISBN.mockResolvedValue({
        isbn,
        title: 'Harry Potter',
        rating: 5,
        notes: 'My favorite book!',
        readStatus: 'read',
        coverSmallUrl: null,
        coverMediumUrl: null,
        coverLargeUrl: null,
        canonicalMetadata: {
          works: [],
          editions: [],
          authors: [],
        },
      })

      mockBookRepoInstance.save.mockResolvedValue(undefined)

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify save was called with preserved user data
      expect(mockBookRepoInstance.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isbn,
          rating: 5,
          notes: 'My favorite book!',
          readStatus: 'read',
          coverSmallUrl: coverUrl,
          coverMediumUrl: coverUrl,
          coverLargeUrl: coverUrl,
        }),
      )
    })

    it('should handle errors gracefully without failing enrichment', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      // Mock enrichMultipleBooks to succeed
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: 'https://example.com/cover.jpg',
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [],
        authors: [],
      })

      // Mock findByISBN to throw error
      mockBookRepoInstance.findByISBN.mockRejectedValue(new Error('Database connection lost'))

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Message should still be acknowledged (non-fatal error)
      expect(messages[0].ack).toHaveBeenCalled()
    })

    it('should preserve existing canonical metadata when enrichment returns empty arrays', async () => {
      const isbn = '9780439708180'
      const messages = [createMockMessage(isbn)]
      const batch: MessageBatch<any> = {
        queue: 'ENRICHMENT_QUEUE',
        messages,
      }

      const coverUrl = 'https://example.com/cover.jpg'

      // Mock enrichMultipleBooks with work but no editions/authors
      vi.mocked(enrichMultipleBooks).mockResolvedValue({
        works: [
          {
            title: 'Harry Potter',
            subjectTags: ['fantasy'],
            coverImageURL: coverUrl,
            goodreadsWorkIDs: [],
            amazonASINs: [],
            librarythingIDs: [],
            googleBooksVolumeIDs: [],
            isbndbQuality: 100,
            reviewStatus: 'pending',
            primaryProvider: 'google_books',
          },
        ],
        editions: [], // Empty!
        authors: [], // Empty!
      })

      // Mock existing book with canonical metadata
      const existingEdition = {
        isbn,
        title: 'Harry Potter',
        format: 'hardcover',
        isbns: [isbn],
        amazonASINs: [],
        googleBooksVolumeIDs: [],
        librarythingIDs: [],
        isbndbQuality: 100,
        primaryProvider: 'google_books',
      }
      const existingAuthor = {
        name: 'J.K. Rowling',
        gender: 'female',
      }

      mockBookRepoInstance.findByISBN.mockResolvedValue({
        isbn,
        title: 'Harry Potter',
        coverSmallUrl: null,
        coverMediumUrl: null,
        coverLargeUrl: null,
        canonicalMetadata: {
          works: [],
          editions: [existingEdition],
          authors: [existingAuthor],
        },
      })

      mockBookRepoInstance.save.mockResolvedValue(undefined)

      await processEnrichmentBatch(batch, mockEnv, mockCtx)

      // Verify existing editions/authors were preserved
      expect(mockBookRepoInstance.save).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalMetadata: expect.objectContaining({
            editions: [existingEdition],
            authors: [existingAuthor],
          }),
        }),
      )
    })
  })
})
