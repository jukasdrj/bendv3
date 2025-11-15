/**
 * Unit Tests: CSV Processor Service
 * 
 * Tests the extracted CSV processing business logic.
 * This service is now independent of Durable Objects.
 * 
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CSV Processor Service', () => {
  let mockProgressReporter;
  let mockEnv;
  let processCSVImport;

  beforeEach(async () => {
    // Mock progress reporter interface
    mockProgressReporter = {
      waitForReady: vi.fn(async () => ({ timedOut: false, disconnected: false })),
      updateProgress: vi.fn(async () => ({ success: true })),
      complete: vi.fn(async () => ({ success: true })),
      sendError: vi.fn(async () => ({ success: true }))
    };

    // Mock environment
    mockEnv = {
      KV_CACHE: {
        get: vi.fn(async () => null), // Cache miss by default
        put: vi.fn(async () => {})
      },
      GEMINI_API_KEY: 'test-api-key'
    };

    // Import the service (dynamic to reset mocks)
    const module = await import('../../src/services/csv-processor.js');
    processCSVImport = module.processCSVImport;
  });

  describe('Client Ready Signal', () => {
    it('should wait for client ready before processing', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      // Mock Gemini response
      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.waitForReady).toHaveBeenCalledWith(10000);
    });

    it('should continue processing if client ready times out', async () => {
      mockProgressReporter.waitForReady.mockResolvedValue({
        timedOut: true,
        disconnected: false
      });

      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      // Should not throw
      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalled();
    });

    it('should continue processing if client disconnected', async () => {
      mockProgressReporter.waitForReady.mockResolvedValue({
        timedOut: false,
        disconnected: true
      });

      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalled();
    });
  });

  describe('Progress Reporting', () => {
    it('should report validation progress', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.02,
          status: expect.stringContaining('Validating')
        })
      );
    });

    it('should report Gemini upload progress', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.05,
          status: expect.stringContaining('Gemini')
        })
      );
    });

    it('should report parsed books count', async () => {
      const csvText = 'title,author\nBook 1,Author 1\nBook 2,Author 2';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Book 1', author: 'Author 1' },
          { title: 'Book 2', author: 'Author 2' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.75,
          status: expect.stringContaining('2 books'),
          processedCount: 2
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should send error for invalid CSV', async () => {
      // Mock CSV validator to fail
      vi.doMock('../../src/utils/csv-validator.js', () => ({
        validateCSV: vi.fn(() => ({
          valid: false,
          error: 'Missing required columns'
        }))
      }));

      const csvText = 'invalid,csv\ndata';

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          code: 'E_CSV_PROCESSING_FAILED',
          message: expect.stringContaining('Invalid CSV')
        })
      );
    });

    it('should handle Gemini API errors', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => {
          throw new Error('Gemini API rate limit exceeded');
        })
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          code: 'E_CSV_PROCESSING_FAILED',
          retryable: true
        })
      );
    });

    it('should handle empty Gemini response', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          message: expect.stringContaining('No valid books found')
        })
      );
    });
  });

  describe('Caching', () => {
    it('should check cache before calling Gemini', async () => {
      const csvText = 'title,author\nTest Book,Test Author';
      const cachedBooks = [
        { title: 'Cached Book', author: 'Cached Author' }
      ];

      mockEnv.KV_CACHE.get.mockResolvedValue(cachedBooks);

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockEnv.KV_CACHE.get).toHaveBeenCalled();
      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          books: expect.arrayContaining([
            expect.objectContaining({
              title: 'Cached Book',
              author: 'Cached Author'
            })
          ])
        })
      );
    });

    it('should cache Gemini results', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Test Book', author: 'Test Author' }
        ])
      }));

      mockEnv.KV_CACHE.get.mockResolvedValue(null); // Cache miss

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Test Book'),
        expect.objectContaining({
          expirationTtl: 604800 // 7 days
        })
      );
    });
  });

  describe('Book Validation', () => {
    it('should filter out books without title', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Valid Book', author: 'Valid Author' },
          { author: 'No Title Author' }, // Missing title
          { title: 'Another Book', author: 'Another Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          books: expect.arrayContaining([
            expect.objectContaining({ title: 'Valid Book' }),
            expect.objectContaining({ title: 'Another Book' })
          ])
        })
      );

      const completeCall = mockProgressReporter.complete.mock.calls[0];
      const books = completeCall[1].books;
      expect(books).toHaveLength(2);
    });

    it('should filter out books without author', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Valid Book', author: 'Valid Author' },
          { title: 'No Author Book' }, // Missing author
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      const completeCall = mockProgressReporter.complete.mock.calls[0];
      const books = completeCall[1].books;
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Valid Book');
    });

    it('should trim whitespace from book data', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: '  Spaced Book  ', author: '  Spaced Author  ', isbn: '  1234567890  ' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          books: [
            {
              title: 'Spaced Book',
              author: 'Spaced Author',
              isbn: '1234567890'
            }
          ]
        })
      );
    });

    it('should handle optional ISBN field', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Book With ISBN', author: 'Author', isbn: '1234567890' },
          { title: 'Book Without ISBN', author: 'Author' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      const completeCall = mockProgressReporter.complete.mock.calls[0];
      const books = completeCall[1].books;
      
      expect(books[0].isbn).toBe('1234567890');
      expect(books[1].isbn).toBeUndefined();
    });
  });

  describe('Completion', () => {
    it('should complete with validated books', async () => {
      const csvText = 'title,author\nBook 1,Author 1\nBook 2,Author 2';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Book 1', author: 'Author 1' },
          { title: 'Book 2', author: 'Author 2' }
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          books: expect.arrayContaining([
            { title: 'Book 1', author: 'Author 1', isbn: undefined },
            { title: 'Book 2', author: 'Author 2', isbn: undefined }
          ]),
          errors: [],
          successRate: '2/2'
        })
      );
    });

    it('should include success rate in completion', async () => {
      const csvText = 'title,author\nTest Book,Test Author';

      vi.doMock('../../src/providers/gemini-csv-provider.js', () => ({
        parseCSVWithGemini: vi.fn(async () => [
          { title: 'Book 1', author: 'Author 1' },
          { title: 'Book 2', author: 'Author 2' },
          { title: 'Book 3' } // Missing author, will be filtered
        ])
      }));

      await processCSVImport(csvText, mockProgressReporter, mockEnv);

      expect(mockProgressReporter.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          successRate: '2/3'
        })
      );
    });
  });
});
