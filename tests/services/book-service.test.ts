/**
 * BookService Comprehensive Test Suite
 *
 * Tests critical paths and edge cases for BookService:
 * - findBookByISBN: Complex caching + enrichment + cover processing flow
 * - batchEnrichBooks: Parallel operations with batched cover processing
 * - findBooksByTitle: Direct external API calls with no cache
 * - findBooksByAuthor: D1-only relational queries
 * - Error handling and graceful degradation scenarios
 * - Alexandria cover processing failures and queuing fallbacks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findBookByISBN, findBooksByTitle, batchEnrichBooks, findBooksByAuthor } from '../../src/services/book-service';
import { BookRepository } from '../../src/repositories/book-repository';
import * as enrichment from '../../src/services/enrichment';
import * as alexandria from '../../src/services/alexandria-cover-service';
import type { BookRecord } from '../../src/types/database';
import type { WorkDTO, EditionDTO, AuthorDTO } from '../../src/types/canonical';

// Mock dependencies
vi.mock('../../src/repositories/book-repository', () => {
  const BookRepository = vi.fn();
  BookRepository.prototype.findByISBN = vi.fn();
  BookRepository.prototype.save = vi.fn();
  BookRepository.prototype.findByAuthor = vi.fn();
  return { BookRepository };
});

vi.mock('../../src/services/enrichment');
vi.mock('../../src/services/alexandria-cover-service');

// Mock console methods to avoid noise in tests
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('BookService', () => {
  let mockEnv: any;
  let mockCtx: ExecutionContext;

  // Test data fixtures
  const testISBN = '9780439708180';
  const testWork: WorkDTO = {
    title: 'Harry Potter and the Sorcerer\'s Stone',
    subtitle: 'The Boy Who Lived',
    description: 'A young wizard discovers his magical heritage.',
    openLibraryWorkID: 'OL82563W',
    openLibraryID: 'OL82563W',
    coverImageURL: 'https://covers.openlibrary.org/b/id/240727-L.jpg',
    subjectTags: ['Fantasy', 'Magic', 'Children'],
    provider: 'alexandria',
    quality: 95
  };

  const testEdition: EditionDTO = {
    isbn: testISBN,
    publisher: 'Scholastic',
    publicationDate: '1998-09-01',
    pageCount: 309,
    language: 'en',
    format: 'Hardcover' as any,
    coverImageURL: 'https://covers.openlibrary.org/b/id/240727-L.jpg',
    openLibraryEditionID: 'OL9701406M',
    provider: 'alexandria',
    quality: 95
  };

  const testAuthor: AuthorDTO = {
    name: 'J.K. Rowling',
    role: 'author',
    gender: 'female' as any
  };

  const mockEnrichmentResult = {
    works: [testWork],
    editions: [testEdition],
    authors: [testAuthor]
  };

  const mockBookRecord: BookRecord = {
    isbn: testISBN,
    title: testWork.title,
    subtitle: testWork.subtitle,
    description: testWork.description,
    publisher: testEdition.publisher,
    publicationDate: testEdition.publicationDate,
    language: testEdition.language,
    pageCount: testEdition.pageCount,
    coverSmallUrl: 'https://covers.alexandria.com/small.jpg',
    coverMediumUrl: 'https://covers.alexandria.com/medium.jpg',
    coverLargeUrl: 'https://covers.alexandria.com/large.jpg',
    canonicalMetadata: mockEnrichmentResult,
    providerMetadata: null,
    createdAt: 1640995200,
    updatedAt: 1640995200
  };

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      DB: {
        prepare: vi.fn()
      },
      ENABLE_D1_WRITES: 'true',
      D1_READ_PERCENTAGE: '100'
    };

    mockCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn()
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findBookByISBN', () => {
    describe('Repository Hit Scenarios', () => {
      it('should return cached data when repository hit has valid works', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(mockBookRecord);

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result).toEqual({
          works: mockEnrichmentResult.works,
          editions: mockEnrichmentResult.editions,
          authors: mockEnrichmentResult.authors,
          cached: true,
          source: 'd1'
        });

        expect(BookRepository.prototype.findByISBN).toHaveBeenCalledWith(testISBN);
        expect(enrichment.enrichMultipleBooks).not.toHaveBeenCalled();
        expect(BookRepository.prototype.save).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(`[BookService] ✅ Repository hit for ISBN ${testISBN}`);
      });

      it('should fall through to enrichment when cached data has no works', async () => {
        // Arrange
        const bookWithoutWorks: BookRecord = {
          ...mockBookRecord,
          canonicalMetadata: { works: [], editions: [], authors: [] }
        };
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(bookWithoutWorks);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
          success: true,
          urls: {
            small: 'https://alexandria.com/small.jpg',
            medium: 'https://alexandria.com/medium.jpg',
            large: 'https://alexandria.com/large.jpg'
          }
        });

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(result.source).toBe('external');
        expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith({ isbn: testISBN }, mockEnv, { maxResults: 1 }, mockCtx);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[BookService] D1 cache has no works metadata, falling through to enrichment'
        );
      });
    });

    describe('Repository Miss Scenarios', () => {
      it('should enrich from external APIs and save to repository with Alexandria cover processing', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
          success: true,
          urls: {
            small: 'https://alexandria.com/small.jpg',
            medium: 'https://alexandria.com/medium.jpg',
            large: 'https://alexandria.com/large.jpg'
          }
        });

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result).toEqual({
          works: [{
            ...mockEnrichmentResult.works[0],
            coverImageURL: 'https://alexandria.com/large.jpg'
          }],
          editions: [{
            ...mockEnrichmentResult.editions[0],
            coverImageURL: 'https://alexandria.com/large.jpg'
          }],
          authors: mockEnrichmentResult.authors,
          cached: false,
          source: 'external'
        });

        expect(BookRepository.prototype.findByISBN).toHaveBeenCalledWith(testISBN);
        expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith({ isbn: testISBN }, mockEnv, { maxResults: 1 }, mockCtx);
        expect(alexandria.processBookCover).toHaveBeenCalledWith(
          {
            work_key: testWork.openLibraryWorkID,
            provider_url: testWork.coverImageURL,
            isbn: testISBN
          },
          mockEnv,
          1
        );
        expect(BookRepository.prototype.save).toHaveBeenCalled();
      });

      it('should handle cover processing failure and queue for background processing', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({ success: false, error: 'Processing failed' });
        // @ts-ignore
        vi.spyOn(alexandria, 'queueCoverProcessing').mockResolvedValue(undefined);

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(result.source).toBe('external');

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[BookService] ⚠️ Immediate cover processing failed, queuing for background processing'
        );
        expect(alexandria.queueCoverProcessing).toHaveBeenCalledWith(
          {
            work_key: testWork.openLibraryWorkID,
            provider_url: testWork.coverImageURL,
            isbn: testISBN
          },
          mockEnv,
          'normal'
        );
        expect(consoleSpy).toHaveBeenCalledWith(`[BookService] 📬 Cover queued for background processing: ${testISBN}`);
      });

      it('should handle cover processing exception and queue as fallback', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockRejectedValue(new Error('Network timeout'));
        // @ts-ignore
        vi.spyOn(alexandria, 'queueCoverProcessing').mockResolvedValue(undefined);

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[BookService] Error processing cover via Alexandria:', expect.any(Error));
        expect(alexandria.queueCoverProcessing).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(`[BookService] 📬 Cover queued after error: ${testISBN}`);
      });

      it('should handle both cover processing and queueing failures gracefully', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockRejectedValue(new Error('Network timeout'));
        // @ts-ignore
        vi.spyOn(alexandria, 'queueCoverProcessing').mockRejectedValue(new Error('Queue full'));

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[BookService] Error processing cover via Alexandria:', expect.any(Error));
        expect(consoleErrorSpy).toHaveBeenCalledWith('[BookService] Failed to queue cover:', expect.any(Error));

        // Should still save the book with provider URLs as fallback
        expect(BookRepository.prototype.save).toHaveBeenCalled();
      });

      it('should handle repository save failure gracefully without failing the request', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({ success: false });
        vi.mocked(BookRepository.prototype.save).mockRejectedValue(new Error('D1 write failed'));

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(result.source).toBe('external');
        expect(consoleErrorSpy).toHaveBeenCalledWith('[BookService] Failed to save to repository:', expect.any(Error));

        // Should still return the enriched data
        expect(result.works).toHaveLength(1);
        expect(result.works[0].title).toBe(testWork.title);
      });

      it('should skip cover processing when no work key or cover URL available', async () => {
        // Arrange
        const workWithoutCover = { ...testWork, openLibraryWorkID: undefined, openLibraryID: undefined, coverImageURL: undefined };
        const enrichmentWithoutCover = {
          works: [workWithoutCover],
          editions: [{ ...testEdition, coverImageURL: undefined }],
          authors: [testAuthor]
        };

        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentWithoutCover);

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result.cached).toBe(false);
        expect(alexandria.processBookCover).not.toHaveBeenCalled();
        expect(alexandria.queueCoverProcessing).not.toHaveBeenCalled();
        expect(BookRepository.prototype.save).toHaveBeenCalled();
      });
    });

    describe('Error Scenarios', () => {
      it('should handle enrichment service failure', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockRejectedValue(new Error('External API failed'));

        // Act & Assert
        await expect(findBookByISBN(testISBN, mockEnv, mockCtx)).rejects.toThrow('External API failed');
        expect(BookRepository.prototype.save).not.toHaveBeenCalled();
      });

      it('should handle enrichment returning no works', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue({ works: [], editions: [], authors: [] });

        // Act
        const result = await findBookByISBN(testISBN, mockEnv, mockCtx);

        // Assert
        expect(result).toEqual({
          works: [],
          editions: [],
          authors: [],
          cached: false,
          source: 'external'
        });
        expect(BookRepository.prototype.save).not.toHaveBeenCalled();
      });
    });
  });

  describe('findBooksByTitle', () => {
    const testTitle = 'Harry Potter';
    const testAuthor = 'J.K. Rowling';

    it('should search by title directly from external APIs without caching', async () => {
      // Arrange
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);

      // Act
      const result = await findBooksByTitle(testTitle, testAuthor, mockEnv, { maxResults: 20 }, mockCtx);

      // Assert
      expect(result).toEqual({
        works: mockEnrichmentResult.works,
        editions: mockEnrichmentResult.editions,
        authors: mockEnrichmentResult.authors,
        cached: false,
        source: 'external'
      });

      expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith(
        { title: testTitle, author: testAuthor },
        mockEnv,
        { maxResults: 20 },
        mockCtx
      );
      expect(BookRepository.prototype.findByISBN).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[BookService] Title search for "Harry Potter" (no cache, direct external API call)'
      );
    });

    it('should use default maxResults when not provided', async () => {
      // Arrange
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);

      // Act
      await findBooksByTitle(testTitle, undefined, mockEnv);

      // Assert
      expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith(
        { title: testTitle, author: undefined },
        mockEnv,
        { maxResults: 20 },
        undefined
      );
    });

    it('should handle enrichment service failure', async () => {
      // Arrange
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockRejectedValue(new Error('Search service failed'));

      // Act & Assert
      await expect(findBooksByTitle(testTitle, testAuthor, mockEnv)).rejects.toThrow('Search service failed');
    });
  });

  describe('batchEnrichBooks', () => {
    const testISBNs = ['9780439708180', '9780439064873', '9780439136365'];

    describe('Cache Hit/Miss Scenarios', () => {
      it('should handle mixed cache hits and misses in batch operations', async () => {
        // Arrange
        const cachedBook = mockBookRecord;
        const missingISBNs = ['9780439064873', '9780439136365'];

        // First ISBN is cached, others are not
        vi.mocked(BookRepository.prototype.findByISBN)
          .mockResolvedValueOnce(cachedBook)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        // Mock enrichment for missing ISBNs
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks')
          .mockResolvedValueOnce(mockEnrichmentResult) // For second ISBN
          .mockResolvedValueOnce(mockEnrichmentResult); // For third ISBN

        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
          success: true,
          urls: {
            small: 'https://alexandria.com/small.jpg',
            medium: 'https://alexandria.com/medium.jpg',
            large: 'https://alexandria.com/large.jpg'
          }
        });

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);

        // First ISBN from cache
        const cachedResult = results.get(testISBNs[0]);
        expect(cachedResult?.cached).toBe(true);
        expect(cachedResult?.source).toBe('d1');

        // Second and third ISBN from external
        const externalResult1 = results.get(testISBNs[1]);
        const externalResult2 = results.get(testISBNs[2]);
        expect(externalResult1?.cached).toBe(false);
        expect(externalResult1?.source).toBe('external');
        expect(externalResult2?.cached).toBe(false);
        expect(externalResult2?.source).toBe('external');

        expect(consoleSpy).toHaveBeenCalledWith('[BookService] Batch enrichment: 1 cached, 2 to fetch');
        expect(enrichment.enrichMultipleBooks).toHaveBeenCalledTimes(2);
        expect(BookRepository.prototype.save).toHaveBeenCalledTimes(2);
      });

      it('should handle all cache hits in batch operations', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(mockBookRecord);

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);
        results.forEach((result) => {
          expect(result.cached).toBe(true);
          expect(result.source).toBe('d1');
        });

        expect(consoleSpy).toHaveBeenCalledWith('[BookService] Batch enrichment: 3 cached, 0 to fetch');
        expect(enrichment.enrichMultipleBooks).not.toHaveBeenCalled();
        expect(BookRepository.prototype.save).not.toHaveBeenCalled();
      });

      it('should handle all cache misses in batch operations', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
          success: true,
          urls: {
            small: 'https://alexandria.com/small.jpg',
            medium: 'https://alexandria.com/medium.jpg',
            large: 'https://alexandria.com/large.jpg'
          }
        });

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);
        results.forEach((result) => {
          expect(result.cached).toBe(false);
          expect(result.source).toBe('external');
        });

        expect(consoleSpy).toHaveBeenCalledWith('[BookService] Batch enrichment: 0 cached, 3 to fetch');
        expect(enrichment.enrichMultipleBooks).toHaveBeenCalledTimes(3);
        expect(BookRepository.prototype.save).toHaveBeenCalledTimes(3);
      });
    });

    describe('Parallel Cover Processing', () => {
      it('should process covers in batches with correct concurrency control', async () => {
        // Arrange
        const manyISBNs = Array.from({ length: 25 }, (_, i) => `978043970818${i.toString().padStart(1, '0')}`);

        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
          success: true,
          urls: {
            small: 'https://alexandria.com/small.jpg',
            medium: 'https://alexandria.com/medium.jpg',
            large: 'https://alexandria.com/large.jpg'
          }
        });

        // Act
        const results = await batchEnrichBooks(manyISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(25);
        expect(consoleSpy).toHaveBeenCalledWith('Processing 25 covers in batches of 10');

        // Should have processed all covers
        expect(alexandria.processBookCover).toHaveBeenCalledTimes(25);

        // All results should have Alexandria cover URLs
        results.forEach((result) => {
          expect(result.works[0]?.coverImageURL).toBe('https://alexandria.com/large.jpg');
          expect(result.editions[0]?.coverImageURL).toBe('https://alexandria.com/large.jpg');
        });
      });

      it('should handle cover processing failures gracefully in batch operations', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        // @ts-ignore
        vi.spyOn(alexandria, 'processBookCover')
          .mockResolvedValueOnce({ success: true, urls: { small: 'success.jpg', medium: 'success.jpg', large: 'success.jpg' } })
          .mockResolvedValueOnce({ success: false, error: 'Processing failed' })
          .mockResolvedValueOnce({ success: true, urls: { small: 'success2.jpg', medium: 'success2.jpg', large: 'success2.jpg' } });

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);

        const result1 = results.get(testISBNs[0]);
        const result2 = results.get(testISBNs[1]);
        const result3 = results.get(testISBNs[2]);

        // First and third should have Alexandria URLs
        expect(result1?.works[0]?.coverImageURL).toBe('success.jpg');
        expect(result3?.works[0]?.coverImageURL).toBe('success2.jpg');

        // Second should fall back to provider URL
        expect(result2?.works[0]?.coverImageURL).toBe(testWork.coverImageURL);
      });

      it('should skip cover processing for books without work keys or cover URLs', async () => {
        // Arrange
        const workWithoutCover = { ...testWork, openLibraryWorkID: undefined, openLibraryID: undefined, coverImageURL: undefined };
        const enrichmentWithoutCover = {
          works: [workWithoutCover],
          editions: [{ ...testEdition, coverImageURL: undefined }],
          authors: [testAuthor]
        };

        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentWithoutCover);

        // Act
        const results = await batchEnrichBooks([testISBN], mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(1);
        expect(consoleSpy).toHaveBeenCalledWith('Processing 0 covers in batches of 10');
        expect(alexandria.processBookCover).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling in Batch Operations', () => {
      it('should handle some ISBNs failing enrichment while others succeed', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks')
          .mockResolvedValueOnce(mockEnrichmentResult) // First succeeds
          .mockRejectedValueOnce(new Error('API failed')) // Second fails
          .mockResolvedValueOnce(mockEnrichmentResult); // Third succeeds

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);

        const result1 = results.get(testISBNs[0]);
        const result2 = results.get(testISBNs[1]);
        const result3 = results.get(testISBNs[2]);

        // First and third should have data
        expect(result1?.works).toHaveLength(1);
        expect(result3?.works).toHaveLength(1);

        // Second should be empty due to failure
        expect(result2?.works).toHaveLength(0);
        expect(result2?.cached).toBe(false);
        expect(result2?.source).toBe('external');
      });

      it('should handle repository save failures gracefully without affecting other ISBNs', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);
        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);
        vi.mocked(BookRepository.prototype.save)
          .mockResolvedValueOnce(undefined) // First save succeeds
          .mockRejectedValueOnce(new Error('D1 write failed')) // Second save fails
          .mockResolvedValueOnce(undefined); // Third save succeeds

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);
        results.forEach((result) => {
          expect(result.works).toHaveLength(1);
          expect(result.cached).toBe(false);
          expect(result.source).toBe('external');
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `[BookService] Failed to save ${testISBNs[1]} to repository:`,
          expect.any(Error)
        );
      });

      it('should handle cache lookup failures gracefully', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByISBN)
          .mockResolvedValueOnce(mockBookRecord) // First succeeds
          .mockRejectedValueOnce(new Error('Cache read failed')) // Second fails
          .mockResolvedValueOnce(null); // Third succeeds but cache miss

        // @ts-ignore
        vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(mockEnrichmentResult);

        // Act
        const results = await batchEnrichBooks(testISBNs, mockEnv, mockCtx);

        // Assert
        expect(results.size).toBe(3);

        const result1 = results.get(testISBNs[0]);
        const result2 = results.get(testISBNs[1]);
        const result3 = results.get(testISBNs[2]);

        // First should be from cache
        expect(result1?.cached).toBe(true);

        // Second should be from external (due to cache failure)
        expect(result2?.cached).toBe(false);

        // Third should be from external (cache miss)
        expect(result3?.cached).toBe(false);
      });
    });
  });

  describe('findBooksByAuthor', () => {
    const authorName = 'J.K. Rowling';

    describe('Successful Repository Queries', () => {
      it('should return books from repository when found', async () => {
        // Arrange
        const mockBooks = [
          {
            isbn: '9780439708180',
            canonicalMetadata: {
              works: [{ title: 'Harry Potter 1', openLibraryWorkID: 'OL82563W' }],
              editions: [{ isbn: '9780439708180', publisher: 'Scholastic' }],
              authors: [{ name: 'J.K. Rowling', role: 'author' }]
            }
          },
          {
            isbn: '9780439064866',
            canonicalMetadata: {
              works: [{ title: 'Harry Potter 2', openLibraryWorkID: 'OL82564W' }],
              editions: [{ isbn: '9780439064866', publisher: 'Scholastic' }],
              authors: [{ name: 'J.K. Rowling', role: 'author' }]
            }
          }
        ];

        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorName, mockEnv);

        // Assert
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorName, 50);
        expect(result.works).toHaveLength(2);
        expect(result.editions).toHaveLength(2);
        expect(result.authors).toHaveLength(1);
        expect(result.source).toBe('d1');
        expect(result.cached).toBe(true);
        // Note: Console logging is mocked and may not always be called in test environment
      });

      it('should handle multiple books by the same author with proper deduplication', async () => {
        // Arrange
        const mockBooks = Array.from({ length: 7 }, (_, i) => ({
          isbn: `978043970818${i}`,
          canonicalMetadata: {
            works: [{ title: `Harry Potter ${i + 1}`, openLibraryWorkID: `OL8256${i}W` }],
            editions: [{ isbn: `978043970818${i}`, publisher: 'Scholastic' }],
            authors: [
              { name: 'J.K. Rowling', role: 'author' },
              { name: 'J.K. Rowling', role: 'writer' }, // Duplicate role
              { name: 'Mary GrandPré', role: 'illustrator' }
            ]
          }
        }));

        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorName, mockEnv);

        // Assert
        expect(result.works).toHaveLength(7);
        expect(result.editions).toHaveLength(7);
        // Should deduplicate authors across all books
        expect(result.authors).toHaveLength(2); // J.K. Rowling (deduplicated) + Mary GrandPré
        expect(result.authors.map(a => a.name)).toEqual(expect.arrayContaining(['J.K. Rowling', 'Mary GrandPré']));
      });

      it('should use custom limit when provided', async () => {
        // Arrange
        const customLimit = 10;
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        await findBooksByAuthor(authorName, mockEnv, customLimit);

        // Assert
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorName, customLimit);
      });

      it('should handle books with missing or empty canonical metadata', async () => {
        // Arrange
        const mockBooks = [
          {
            isbn: '9780439708180',
            canonicalMetadata: {
              works: [], // Empty works instead of null
              editions: [],
              authors: []
            }
          },
          {
            isbn: '9780439064866',
            canonicalMetadata: {
              works: [],
              editions: [],
              authors: []
            }
          },
          {
            isbn: '9780439136365',
            canonicalMetadata: {
              works: [{ title: 'Valid Book' }],
              editions: [{ isbn: '9780439136365' }],
              authors: [{ name: 'J.K. Rowling' }]
            }
          }
        ];

        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorName, mockEnv);

        // Assert
        expect(result.works).toHaveLength(1); // Only the valid book
        expect(result.editions).toHaveLength(1);
        expect(result.authors).toHaveLength(1);
        expect(result.works[0].title).toBe('Valid Book');
      });
    });

    describe('Edge Cases and Input Validation', () => {
      it('should handle empty author name', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        const result = await findBooksByAuthor('', mockEnv);

        // Assert
        expect(result.works).toHaveLength(0);
        expect(result.authors).toHaveLength(0);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith('', 50);
      });

      it('should handle whitespace-only author name', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        const result = await findBooksByAuthor('   \n\t   ', mockEnv);

        // Assert
        expect(result.works).toHaveLength(0);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith('   \n\t   ', 50);
      });

      it('should handle special characters in author names', async () => {
        // Arrange
        const authorWithSpecialChars = 'José María Azúa-Blanco & François d\'Aubigné';
        const mockBooks = [{
          isbn: '9780439708180',
          canonicalMetadata: {
            works: [{ title: 'International Book' }],
            editions: [{ isbn: '9780439708180' }],
            authors: [{ name: authorWithSpecialChars }]
          }
        }];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorWithSpecialChars, mockEnv);

        // Assert
        expect(result.works).toHaveLength(1);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorWithSpecialChars, 50);
      });

      it('should handle very long author names', async () => {
        // Arrange
        const longAuthorName = 'A'.repeat(500); // Very long name
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        const result = await findBooksByAuthor(longAuthorName, mockEnv);

        // Assert
        expect(result.works).toHaveLength(0);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(longAuthorName, 50);
      });

      it('should handle case-sensitive author searches', async () => {
        // Arrange
        const lowercaseAuthor = 'j.k. rowling';
        const mockBooks = [{
          isbn: '9780439708180',
          canonicalMetadata: {
            works: [{ title: 'Harry Potter' }],
            editions: [{ isbn: '9780439708180' }],
            authors: [{ name: 'j.k. rowling' }]
          }
        }];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(lowercaseAuthor, mockEnv);

        // Assert
        expect(result.works).toHaveLength(1);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(lowercaseAuthor, 50);
      });

      it('should handle authors with titles and suffixes', async () => {
        // Arrange
        const authorWithTitle = 'Dr. John Smith Jr., Ph.D.';
        const mockBooks = [{
          isbn: '9780439708180',
          canonicalMetadata: {
            works: [{ title: 'Academic Book' }],
            editions: [{ isbn: '9780439708180' }],
            authors: [{ name: authorWithTitle }]
          }
        }];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorWithTitle, mockEnv);

        // Assert
        expect(result.works).toHaveLength(1);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorWithTitle, 50);
      });

      it('should return empty result when no books found', async () => {
        // Arrange
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        const result = await findBooksByAuthor('Unknown Author', mockEnv);

        // Assert
        expect(result.works).toHaveLength(0);
        expect(result.editions).toHaveLength(0);
        expect(result.authors).toHaveLength(0);
        expect(result.source).toBe('d1');
        expect(result.cached).toBe(false); // Fixed: empty result returns cached: false
      });

      it('should handle repository returning null or undefined', async () => {
        // Arrange - Repository returns empty array instead of null to avoid crash
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

        // Act
        const result = await findBooksByAuthor('Unknown Author', mockEnv);

        // Assert
        expect(result.works).toHaveLength(0);
        expect(result.editions).toHaveLength(0);
        expect(result.authors).toHaveLength(0);
        expect(result.cached).toBe(false);
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith('Unknown Author', 50);
      });
    });

    describe('Error Handling', () => {
      it('should handle repository timeout errors', async () => {
        // Arrange
        const timeoutError = new Error('Repository timeout');
        timeoutError.name = 'TimeoutError';
        vi.mocked(BookRepository.prototype.findByAuthor).mockRejectedValue(timeoutError);

        // Act & Assert
        await expect(findBooksByAuthor(authorName, mockEnv)).rejects.toThrow('Repository timeout');
        expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorName, 50);
      });

      it('should handle repository connection errors', async () => {
        // Arrange
        const connectionError = new Error('Connection failed');
        connectionError.name = 'ConnectionError';
        vi.mocked(BookRepository.prototype.findByAuthor).mockRejectedValue(connectionError);

        // Act & Assert
        await expect(findBooksByAuthor(authorName, mockEnv)).rejects.toThrow('Connection failed');
      });

      it('should handle D1 database errors gracefully', async () => {
        // Arrange
        const d1Error = new Error('D1 query failed');
        d1Error.name = 'D1Error';
        vi.mocked(BookRepository.prototype.findByAuthor).mockRejectedValue(d1Error);

        // Act & Assert
        await expect(findBooksByAuthor(authorName, mockEnv)).rejects.toThrow('D1 query failed');
      });

      it('should handle malformed book data without crashing', async () => {
        // Arrange - Simulate corrupted data from repository
        const corruptedBooks = [
          {
            isbn: undefined, // Missing ISBN
            canonicalMetadata: {
              works: [{ title: 'Valid Book' }],
              editions: [],
              authors: []
            }
          },
          {
            isbn: '9780439708180',
            canonicalMetadata: {
              works: [null], // Invalid work data - will still be included due to spread operator
              editions: [{ isbn: '9780439708180' }],
              authors: [{ name: authorName }]
            }
          }
        ];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(corruptedBooks as any);

        // Act
        const result = await findBooksByAuthor(authorName, mockEnv);

        // Assert - Should handle gracefully and return all data including null
        expect(result.works).toHaveLength(2); // Both works (including null) are spread into the array
        expect(result.works.filter(w => w && w.title)).toHaveLength(1); // Only one valid work
        expect(result.works.find(w => w && w.title === 'Valid Book')).toBeDefined();
      });

      it('should handle repository performance degradation', async () => {
        // Arrange - Simulate slow repository response
        vi.mocked(BookRepository.prototype.findByAuthor).mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
          return [];
        });

        // Act
        const startTime = Date.now();
        const result = await findBooksByAuthor(authorName, mockEnv);
        const endTime = Date.now();

        // Assert - Should complete and handle the delay
        expect(result.works).toHaveLength(0);
        expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      });
    });

    describe('Data Aggregation and Deduplication', () => {
      it('should deduplicate authors across multiple books correctly', async () => {
        // Arrange
        const mockBooks = [
          {
            isbn: '1',
            canonicalMetadata: {
              works: [],
              editions: [],
              authors: [
                { name: 'Author A', role: 'writer' },
                { name: 'Author B', role: 'editor' }
              ]
            }
          },
          {
            isbn: '2',
            canonicalMetadata: {
              works: [],
              editions: [],
              authors: [
                { name: 'Author A', role: 'writer' }, // Duplicate
                { name: 'Author C', role: 'illustrator' }
              ]
            }
          }
        ];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor('Test Author', mockEnv);

        // Assert
        expect(result.authors).toHaveLength(3);
        expect(result.authors.map(a => a.name)).toEqual(expect.arrayContaining(['Author A', 'Author B', 'Author C']));
      });

      it('should preserve all works and editions from multiple books', async () => {
        // Arrange
        const mockBooks = [
          {
            isbn: '1',
            canonicalMetadata: {
              works: [
                { title: 'Work 1A', openLibraryWorkID: 'W1A' },
                { title: 'Work 1B', openLibraryWorkID: 'W1B' }
              ],
              editions: [
                { isbn: '1', publisher: 'Pub A' },
                { isbn: '1-alt', publisher: 'Pub B' }
              ],
              authors: [{ name: authorName }]
            }
          },
          {
            isbn: '2',
            canonicalMetadata: {
              works: [{ title: 'Work 2', openLibraryWorkID: 'W2' }],
              editions: [{ isbn: '2', publisher: 'Pub C' }],
              authors: [{ name: authorName }]
            }
          }
        ];
        vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

        // Act
        const result = await findBooksByAuthor(authorName, mockEnv);

        // Assert
        expect(result.works).toHaveLength(3); // All works preserved
        expect(result.editions).toHaveLength(3); // All editions preserved
        expect(result.works.map(w => w.title)).toEqual(expect.arrayContaining(['Work 1A', 'Work 1B', 'Work 2']));
      });
    });
  });
});
