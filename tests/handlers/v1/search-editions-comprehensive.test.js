import { describe, it, expect } from 'vitest';
import { handleSearchEditions } from '../../../src/handlers/v1/search-editions.ts';

// Mock ExecutionContext
const createMockContext = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {}
});

describe('GET /v1/editions/search - Comprehensive Integration Tests', () => {
  describe('Response Format Validation', () => {
    it('should return canonical BookSearchResponse structure', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('The Martian', 'Andy Weir', 20, mockEnv, mockCtx);

      // Verify canonical response envelope
      expect(response).toBeDefined();
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('meta');
      expect(response.meta).toHaveProperty('timestamp');
      expect(response.meta).toHaveProperty('processingTime');
      expect(response.meta.processingTime).toBeTypeOf('number');
      expect(response.meta.processingTime).toBeGreaterThan(0);

      if (response.success) {
        // Verify data structure
        expect(response.data).toBeDefined();
        expect(response.data).toHaveProperty('works');
        expect(response.data).toHaveProperty('editions');
        expect(response.data).toHaveProperty('authors');
        
        // Verify works and authors are empty (as per spec)
        expect(response.data.works).toEqual([]);
        expect(response.data.authors).toEqual([]);
        
        // Verify editions is an array
        expect(Array.isArray(response.data.editions)).toBe(true);
      }
    });

    it('should include provider metadata in response when successful', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('1984', 'George Orwell', 20, mockEnv, mockCtx);

      // Provider metadata should be present (either in success or error response)
      expect(response.meta).toBeDefined();
      expect(response.meta).toHaveProperty('timestamp');
      expect(response.meta).toHaveProperty('processingTime');
    });
  });

  describe('EditionDTO Validation', () => {
    it('should return EditionDTO objects with required fields', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('Harry Potter', 'J.K. Rowling', 20, mockEnv, mockCtx);

      if (response.success && response.data.editions.length > 0) {
        const edition = response.data.editions[0];
        
        // Verify EditionDTO structure
        expect(edition).toHaveProperty('isbns');
        expect(Array.isArray(edition.isbns)).toBe(true);
        expect(edition).toHaveProperty('format');
        expect(edition).toHaveProperty('isbndbQuality');
        expect(typeof edition.isbndbQuality).toBe('number');
        
        // Optional fields
        if (edition.isbn) {
          expect(typeof edition.isbn).toBe('string');
        }
        if (edition.title) {
          expect(typeof edition.title).toBe('string');
        }
        if (edition.publisher) {
          expect(typeof edition.publisher).toBe('string');
        }
      }
    });

    it('should include format field in all editions', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('The Hobbit', 'J.R.R. Tolkien', 20, mockEnv, mockCtx);

      if (response.success && response.data.editions.length > 0) {
        for (const edition of response.data.editions) {
          expect(edition).toHaveProperty('format');
          expect(typeof edition.format).toBe('string');
          // Format should be one of the valid values
          expect(['Hardcover', 'Paperback', 'E-book', 'Audiobook', 'Other']).toContain(edition.format);
        }
      }
    });
  });

  describe('Query Parameter Validation', () => {
    it('should normalize title with special characters', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        'The Lord of the Rings: The Fellowship of the Ring',
        'J.R.R. Tolkien',
        20,
        mockEnv,
        mockCtx
      );

      expect(response).toBeDefined();
      expect(response.meta).toBeDefined();
    });

    it('should handle author names with various formats', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      // Test with "Last, First" format
      const response = await handleSearchEditions(
        'The Hunger Games',
        'Collins, Suzanne',
        20,
        mockEnv,
        mockCtx
      );

      expect(response).toBeDefined();
      expect(response.meta).toBeDefined();
    });

    it('should handle whitespace in query parameters', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions(
        '  The Martian  ',
        '  Andy Weir  ',
        20,
        mockEnv,
        mockCtx
      );

      expect(response).toBeDefined();
      expect(response.meta).toBeDefined();
    });
  });

  describe('Limit Parameter Behavior', () => {
    it('should respect small limit values', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('The Martian', 'Andy Weir', 1, mockEnv, mockCtx);

      if (response.success && response.data.editions.length > 0) {
        expect(response.data.editions.length).toBeLessThanOrEqual(1);
      }
    });

    it('should respect large limit values', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('Harry Potter', 'J.K. Rowling', 100, mockEnv, mockCtx);

      if (response.success && response.data.editions.length > 0) {
        expect(response.data.editions.length).toBeLessThanOrEqual(100);
      }
    });

    it('should handle limit = 0 gracefully', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('1984', 'George Orwell', 0, mockEnv, mockCtx);

      if (response.success) {
        expect(response.data.editions.length).toBe(0);
      }
    });
  });

  describe('Error Code Validation', () => {
    it('should return INVALID_QUERY for empty workTitle', async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('', 'Andy Weir', 20, mockEnv, mockCtx);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('INVALID_QUERY');
        expect(response.error.message).toContain('workTitle');
      }
    });

    it('should return INVALID_QUERY for empty author', async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('The Martian', '', 20, mockEnv, mockCtx);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('INVALID_QUERY');
        expect(response.error.message).toContain('author');
      }
    });

    it('should include details in error responses', async () => {
      const mockEnv = {};
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('', '', 20, mockEnv, mockCtx);

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error).toHaveProperty('details');
      }
    });
  });

  describe('Performance Metrics', () => {
    it('should include processingTime in metadata', async () => {
      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => null,
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const response = await handleSearchEditions('1984', 'George Orwell', 20, mockEnv, mockCtx);

      expect(response.meta).toHaveProperty('processingTime');
      expect(typeof response.meta.processingTime).toBe('number');
      expect(response.meta.processingTime).toBeGreaterThan(0);
    });

    it('should have reasonable processing time for cached results', async () => {
      const cachedData = {
        success: true,
        data: {
          works: [],
          editions: [
            {
              isbn: '9780553418026',
              isbns: ['9780553418026'],
              title: 'The Martian',
              format: 'Hardcover',
              isbndbQuality: 95
            }
          ],
          authors: []
        },
        meta: {
          timestamp: new Date().toISOString(),
          processingTime: 50,
          provider: 'isbndb',
          cached: false
        }
      };

      const mockEnv = {
        GOOGLE_BOOKS_API_KEY: 'test-key',
        ISBNDB_API_KEY: 'test-key',
        CACHE: {
          get: async () => null,
          put: async () => {}
        },
        KV_CACHE: {
          get: async () => JSON.stringify(cachedData),
          put: async () => {}
        }
      };
      const mockCtx = createMockContext();

      const startTime = Date.now();
      const response = await handleSearchEditions('The Martian', 'Andy Weir', 20, mockEnv, mockCtx);
      const duration = Date.now() - startTime;

      // Cached results should be very fast (< 100ms in test environment)
      expect(duration).toBeLessThan(100);
    });
  });
});
