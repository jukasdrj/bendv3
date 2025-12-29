/**
 * Tests for Injectable Book Service
 *
 * Demonstrates the improved testability with dependency injection.
 * All dependencies are easily mocked, making tests fast and isolated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InjectableBookService } from '../../../src/services/book-service-injectable'
import type {
  IBookRepository,
  IEnrichmentService,
  ICoverService,
  IDeduplicationService,
} from '../../../src/services/service-container'
import type { Env } from '../../../src/types/env'

describe('InjectableBookService', () => {
  let bookService: InjectableBookService
  let mockBookRepository: IBookRepository
  let mockEnrichmentService: IEnrichmentService
  let mockCoverService: ICoverService
  let mockDeduplicationService: IDeduplicationService
  let mockEnv: Env

  beforeEach(() => {
    // Create clean mocks for each test
    mockBookRepository = {
      findByISBN: vi.fn(),
      save: vi.fn(),
      findByTitle: vi.fn(),
      findByAuthor: vi.fn(),
    }

    mockEnrichmentService = {
      enrichMultipleBooks: vi.fn(),
    }

    mockCoverService = {
      processBookCover: vi.fn(),
      queueCoverProcessing: vi.fn(),
    }

    mockDeduplicationService = {
      deduplicate: vi.fn().mockImplementation((key, fn) => fn()), // Default passthrough
    }

    mockEnv = {
      CACHE: {} as KVNamespace,
      DB: {} as D1Database,
    } as Env

    // Create service instance with mocked dependencies
    bookService = new InjectableBookService(
      mockBookRepository,
      mockEnrichmentService,
      mockCoverService,
      mockDeduplicationService,
      mockEnv
    )
  })

  describe('findBookByISBN', () => {
    it('should return cached book when found in repository', async () => {
      // Arrange
      const isbn = '9780439708180'
      const cachedBook = {
        isbn,
        canonicalMetadata: {
          works: [{ id: '1', title: 'Harry Potter' }],
          editions: [{ id: '1', isbn13: isbn }],
          authors: [{ id: '1', name: 'J.K. Rowling' }],
        },
      }

      mockBookRepository.findByISBN.mockResolvedValue(cachedBook)

      // Act
      const result = await bookService.findBookByISBN(isbn)

      // Assert
      expect(result.cached).toBe(true)
      expect(result.source).toBe('d1')
      expect(result.works).toHaveLength(1)
      expect(result.works[0].title).toBe('Harry Potter')

      // Verify repository was called but enrichment was not
      expect(mockBookRepository.findByISBN).toHaveBeenCalledWith(isbn)
      expect(mockEnrichmentService.enrichMultipleBooks).not.toHaveBeenCalled()
    })

    it('should fetch from external APIs when not cached', async () => {
      // Arrange
      const isbn = '9780439708180'
      const externalResult = {
        works: [{
          id: '1',
          title: 'Harry Potter',
          coverImageURL: 'https://example.com/cover.jpg',
          openLibraryWorkID: 'OL123W' // Add required field for cover processing
        }],
        editions: [{ id: '1', isbn13: isbn, coverImageURL: 'https://example.com/cover.jpg' }],
        authors: [{ id: '1', name: 'J.K. Rowling' }],
      }

      mockBookRepository.findByISBN.mockResolvedValue(null) // Cache miss
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)
      mockCoverService.processBookCover.mockResolvedValue({
        success: true,
        urls: {
          small: 'https://alexandria.com/small.jpg',
          medium: 'https://alexandria.com/medium.jpg',
          large: 'https://alexandria.com/large.jpg',
        },
      })

      // Act
      const result = await bookService.findBookByISBN(isbn)

      // Assert
      expect(result.cached).toBe(false)
      expect(result.source).toBe('external')
      expect(result.works).toHaveLength(1)

      // Verify flow
      expect(mockBookRepository.findByISBN).toHaveBeenCalledWith(isbn)
      expect(mockEnrichmentService.enrichMultipleBooks).toHaveBeenCalledWith(
        { isbn },
        mockEnv,
        { maxResults: 1 },
        undefined
      )
      expect(mockCoverService.processBookCover).toHaveBeenCalledWith(
        {
          work_key: 'OL123W',
          provider_url: 'https://example.com/cover.jpg',
          isbn: isbn,
        },
        mockEnv,
        1
      )
      expect(mockBookRepository.save).toHaveBeenCalled()
    })

    it('should queue cover processing if immediate processing fails', async () => {
      // Arrange
      const isbn = '9780439708180'
      const externalResult = {
        works: [{
          id: '1',
          title: 'Harry Potter',
          coverImageURL: 'https://example.com/cover.jpg',
          openLibraryWorkID: 'OL123W'
        }],
        editions: [{ id: '1', isbn13: isbn }],
        authors: [],
      }

      mockBookRepository.findByISBN.mockResolvedValue(null)
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)
      mockCoverService.processBookCover.mockResolvedValue({ success: false })

      // Act
      await bookService.findBookByISBN(isbn)

      // Assert
      expect(mockCoverService.queueCoverProcessing).toHaveBeenCalledWith(
        {
          work_key: 'OL123W',
          provider_url: 'https://example.com/cover.jpg',
          isbn,
        },
        mockEnv
      )
    })

    it('should use deduplication service', async () => {
      // Arrange
      const isbn = '9780439708180'
      mockBookRepository.findByISBN.mockResolvedValue(null)
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue({
        works: [],
        editions: [],
        authors: [],
      })

      // Act
      await bookService.findBookByISBN(isbn)

      // Assert
      expect(mockDeduplicationService.deduplicate).toHaveBeenCalledWith(
        `isbn:${isbn}`,
        expect.any(Function)
      )
    })

    it('should handle cached book without works metadata', async () => {
      // Arrange
      const isbn = '9780439708180'
      const cachedBookWithoutWorks = {
        isbn,
        canonicalMetadata: {
          works: [], // Empty works array
          editions: [{ id: '1', isbn13: isbn }],
          authors: [],
        },
      }

      const externalResult = {
        works: [{ id: '1', title: 'Harry Potter' }],
        editions: [{ id: '1', isbn13: isbn }],
        authors: [],
      }

      mockBookRepository.findByISBN.mockResolvedValue(cachedBookWithoutWorks)
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)

      // Act
      const result = await bookService.findBookByISBN(isbn)

      // Assert
      expect(result.cached).toBe(false)
      expect(result.source).toBe('external')
      expect(mockEnrichmentService.enrichMultipleBooks).toHaveBeenCalled()
    })
  })

  describe('findBooksByTitle', () => {
    it('should return cached books when found in repository', async () => {
      // Arrange
      const title = 'Harry Potter'
      const cachedBooks = [
        {
          isbn: '9780439708180',
          canonicalMetadata: {
            works: [{ id: '1', title: 'Harry Potter and the Sorcerer\'s Stone' }],
            editions: [{ id: '1', isbn13: '9780439708180' }],
            authors: [{ id: '1', name: 'J.K. Rowling' }],
          },
        },
      ]

      mockBookRepository.findByTitle.mockResolvedValue(cachedBooks)

      // Act
      const result = await bookService.findBooksByTitle(title)

      // Assert
      expect(result.cached).toBe(true)
      expect(result.works).toHaveLength(1)
      expect(mockBookRepository.findByTitle).toHaveBeenCalledWith(title, { maxResults: 20 })
      expect(mockEnrichmentService.enrichMultipleBooks).not.toHaveBeenCalled()
    })

    it('should fetch from external APIs when not cached', async () => {
      // Arrange
      const title = 'Harry Potter'
      const externalResult = {
        works: [
          { id: '1', title: 'Harry Potter Book 1' },
          { id: '2', title: 'Harry Potter Book 2' },
        ],
        editions: [
          { id: '1', isbn13: '9780439708180' },
          { id: '2', isbn13: '9780439708181' },
        ],
        authors: [{ id: '1', name: 'J.K. Rowling' }],
      }

      mockBookRepository.findByTitle.mockResolvedValue([]) // No cached results
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)

      // Act
      const result = await bookService.findBooksByTitle(title, { maxResults: 10 })

      // Assert
      expect(result.cached).toBe(false)
      expect(result.works).toHaveLength(2)
      expect(mockEnrichmentService.enrichMultipleBooks).toHaveBeenCalledWith(
        { title },
        mockEnv,
        { maxResults: 10 },
        undefined
      )
    })
  })

  describe('findBooksByAuthor', () => {
    it('should handle author search with deduplication', async () => {
      // Arrange
      const author = 'J.K. Rowling'
      mockBookRepository.findByAuthor.mockResolvedValue([])
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue({
        works: [],
        editions: [],
        authors: [],
      })

      // Act
      await bookService.findBooksByAuthor(author)

      // Assert
      expect(mockDeduplicationService.deduplicate).toHaveBeenCalledWith(
        `author:${author}`,
        expect.any(Function)
      )
    })
  })

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      // Arrange
      const isbn = '9780439708180'
      mockBookRepository.findByISBN.mockRejectedValue(new Error('Repository error'))
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue({
        works: [{ id: '1', title: 'Harry Potter' }],
        editions: [],
        authors: [],
      })

      // Act & Assert
      await expect(bookService.findBookByISBN(isbn)).rejects.toThrow('Repository error')
    })

    it('should handle enrichment service errors gracefully', async () => {
      // Arrange
      const isbn = '9780439708180'
      mockBookRepository.findByISBN.mockResolvedValue(null)
      mockEnrichmentService.enrichMultipleBooks.mockRejectedValue(new Error('API error'))

      // Act & Assert
      await expect(bookService.findBookByISBN(isbn)).rejects.toThrow('API error')
    })

    it('should continue when cover processing fails', async () => {
      // Arrange
      const isbn = '9780439708180'
      const externalResult = {
        works: [{
          id: '1',
          title: 'Harry Potter',
          coverImageURL: 'https://example.com/cover.jpg',
          openLibraryWorkID: 'OL123W'
        }],
        editions: [{ id: '1', isbn13: isbn }],
        authors: [],
      }

      mockBookRepository.findByISBN.mockResolvedValue(null)
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)
      mockCoverService.processBookCover.mockRejectedValue(new Error('Cover processing error'))

      // Act
      const result = await bookService.findBookByISBN(isbn)

      // Assert - Should still return the result
      expect(result.works).toHaveLength(1)
      expect(result.works[0].title).toBe('Harry Potter')
    })

    it('should continue when repository save fails', async () => {
      // Arrange
      const isbn = '9780439708180'
      const externalResult = {
        works: [{ id: '1', title: 'Harry Potter' }],
        editions: [{ id: '1', isbn13: isbn }],
        authors: [],
      }

      mockBookRepository.findByISBN.mockResolvedValue(null)
      mockEnrichmentService.enrichMultipleBooks.mockResolvedValue(externalResult)
      mockBookRepository.save.mockRejectedValue(new Error('Save error'))

      // Act
      const result = await bookService.findBookByISBN(isbn)

      // Assert - Should still return the result
      expect(result.works).toHaveLength(1)
      expect(result.works[0].title).toBe('Harry Potter')
    })
  })
})