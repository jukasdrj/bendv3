import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findBookByISBN, findBooksByTitle, batchEnrichBooks, findBooksByAuthor } from '../../src/services/book-service';
import { BookRepository } from '../../src/repositories/book-repository';
import * as enrichment from '../../src/services/enrichment';
import * as alexandria from '../../src/services/alexandria-cover-service';

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

describe('Book Service', () => {
  let env;
  let mockBookRepository;

  beforeEach(() => {
    env = {
      D1_READ_PERCENTAGE: '0',
      ENABLE_D1_WRITES: 'false',
    };

    // Clear all mocks
    vi.clearAllMocks();

    // Get the mock instance
    mockBookRepository = new BookRepository(env);
    // Since we mocked the class, we need to ensure future instances behave as expected
    // However, findBookByISBN creates a new instance internally.
    // The vi.mock factory above ensures that `new BookRepository()` returns an object with the mocked methods.

    // We need to access the mock methods to set up return values.
    // Since BookRepository is a mock class, we can access the mock instance via .mock.instances
    // But easier is to just grab the prototype methods if they are shared, OR
    // since we control the factory, we know what `new BookRepository()` returns.

    // Actually, the factory `vi.fn()` returns a constructor.
    // `new BookRepository()` returns an object.
    // We want to control what the methods on that object do.

    // Let's adjust how we access the mock methods in the tests.
    // The `mockBookRepository` variable here is just ONE instance.
    // The service creates its own instance.
    // We need to make sure ALL instances share the behavior or configure the specific instance.

    // Simpler approach:
    // The mock factory already sets up the prototype methods as vi.fn().
    // So we can configure `BookRepository.prototype.findByISBN`.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findBookByISBN', () => {
    it('should return cached book when available in repository', async () => {
      const isbn = '9780123456789';
      const mockBook = {
        isbn,
        canonicalMetadata: {
          works: [{ title: 'Cached Book' }],
          editions: [{ publisher: 'Cached Publisher' }],
          authors: [{ name: 'Cached Author' }],
        },
      };

      // Configure the mock
      vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(mockBook);

      const result = await findBookByISBN(isbn, env);

      expect(BookRepository.prototype.findByISBN).toHaveBeenCalledWith(isbn);
      expect(enrichment.enrichMultipleBooks).not.toHaveBeenCalled();
      expect(result).toEqual({
        works: mockBook.canonicalMetadata.works,
        editions: mockBook.canonicalMetadata.editions,
        authors: mockBook.canonicalMetadata.authors,
        cached: true,
        source: 'd1',
      });
    });

    it('should fall through to enrichment if cached book has no works', async () => {
      const isbn = '9780123456789';
      const mockBook = {
        isbn,
        canonicalMetadata: {
          works: [], // Empty works
          editions: [],
          authors: [],
        },
      };

      vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(mockBook);

      const enrichmentResult = {
        works: [{ title: 'Enriched Book', openLibraryWorkID: 'OL123W' }],
        editions: [{ publisher: 'Enriched Publisher', coverImageURL: 'http://example.com/cover.jpg' }],
        authors: [{ name: 'Enriched Author' }],
      };
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentResult);
      // @ts-ignore
      vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({ success: false });

      const result = await findBookByISBN(isbn, env);

      expect(BookRepository.prototype.findByISBN).toHaveBeenCalledWith(isbn);
      expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith({ isbn }, env, { maxResults: 1 }, undefined);
      expect(BookRepository.prototype.save).toHaveBeenCalled();
      expect(result.source).toBe('external');
      expect(result.cached).toBe(false);
    });

    it('should fetch from external API on cache miss and save to repository', async () => {
      const isbn = '9780123456789';
      vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);

      const enrichmentResult = {
        works: [{ title: 'New Book', openLibraryWorkID: 'OL123W' }],
        editions: [{ publisher: 'New Publisher', coverImageURL: 'http://provider.com/cover.jpg' }],
        authors: [{ name: 'New Author' }],
      };

      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentResult);
      // @ts-ignore
      vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({
        success: true,
        urls: {
          small: 'http://alexandria/small.jpg',
          medium: 'http://alexandria/medium.jpg',
          large: 'http://alexandria/large.jpg'
        }
      });

      const result = await findBookByISBN(isbn, env);

      expect(BookRepository.prototype.findByISBN).toHaveBeenCalledWith(isbn);
      expect(enrichment.enrichMultipleBooks).toHaveBeenCalled();
      expect(alexandria.processBookCover).toHaveBeenCalled();

      // Verify save was called with correct data including Alexandria URLs
      expect(BookRepository.prototype.save).toHaveBeenCalledWith(expect.objectContaining({
        isbn,
        title: 'New Book',
        coverLargeUrl: 'http://alexandria/large.jpg',
      }));

      // Verify result contains Alexandria URL
      expect(result.works[0].coverImageURL).toBe('http://alexandria/large.jpg');
      expect(result.source).toBe('external');
    });

    it('should handle save errors gracefully', async () => {
      const isbn = '9780123456789';
      vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);

      const enrichmentResult = {
        works: [{ title: 'Book' }],
        editions: [],
        authors: []
      };

      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentResult);
      vi.mocked(BookRepository.prototype.save).mockRejectedValue(new Error('Save failed'));

      // Should not throw
      const result = await findBookByISBN(isbn, env);

      expect(result.works[0].title).toBe('Book');
    });
  });

  describe('findBooksByTitle', () => {
    it('should call enrichment service directly without checking repository', async () => {
      const title = 'The Hobbit';
      const author = 'Tolkien';

      const enrichmentResult = {
        works: [{ title: 'The Hobbit' }],
        editions: [],
        authors: [{ name: 'J.R.R. Tolkien' }]
      };

      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentResult);

      const result = await findBooksByTitle(title, author, env);

      expect(BookRepository.prototype.findByISBN).not.toHaveBeenCalled();
      expect(enrichment.enrichMultipleBooks).toHaveBeenCalledWith(
        { title, author },
        env,
        { maxResults: 20 },
        undefined
      );
      expect(result.source).toBe('external');
    });
  });

  describe('batchEnrichBooks', () => {
    it('should mix cached results and external fetches', async () => {
      const isbns = ['cached-isbn', 'missing-isbn'];

      // Mock repository behavior
      vi.mocked(BookRepository.prototype.findByISBN).mockImplementation(async (isbn) => {
        if (isbn === 'cached-isbn') {
          return {
            isbn,
            canonicalMetadata: {
              works: [{ title: 'Cached Book' }],
              editions: [],
              authors: []
            }
          };
        }
        return null;
      });

      // Mock enrichment for missing ISBN
      const enrichmentResult = {
        works: [{ title: 'Fetched Book', openLibraryWorkID: 'OL1' }],
        editions: [{ coverImageURL: 'http://provider.com/img.jpg' }],
        authors: []
      };
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue(enrichmentResult);
      // @ts-ignore
      vi.spyOn(alexandria, 'processBookCover').mockResolvedValue({ success: false });

      const results = await batchEnrichBooks(isbns, env);

      expect(results.get('cached-isbn')).toEqual(expect.objectContaining({
        cached: true,
        source: 'd1'
      }));

      expect(results.get('missing-isbn')).toEqual(expect.objectContaining({
        cached: false,
        source: 'external'
      }));

      expect(BookRepository.prototype.save).toHaveBeenCalledTimes(1); // Only for missing ISBN
    });

    it('should handle empty results from external API', async () => {
      const isbns = ['missing-isbn'];
      vi.mocked(BookRepository.prototype.findByISBN).mockResolvedValue(null);

      // Mock enrichment returning empty result
      // @ts-ignore
      vi.spyOn(enrichment, 'enrichMultipleBooks').mockResolvedValue({
        works: [],
        editions: [],
        authors: []
      });

      const results = await batchEnrichBooks(isbns, env);

      expect(results.get('missing-isbn')).toEqual({
        works: [],
        editions: [],
        authors: [],
        cached: false,
        source: 'external'
      });

      expect(BookRepository.prototype.save).not.toHaveBeenCalled();
    });
  });

  describe('findBooksByAuthor', () => {
    it('should return books from repository when found', async () => {
      const authorName = 'J.K. Rowling';
      const mockBooks = [
        {
          isbn: '1',
          canonicalMetadata: {
            works: [{ title: 'Book 1' }],
            editions: [],
            authors: [{ name: 'J.K. Rowling' }]
          }
        },
        {
          isbn: '2',
          canonicalMetadata: {
            works: [{ title: 'Book 2' }],
            editions: [],
            authors: [{ name: 'J.K. Rowling' }]
          }
        }
      ];

      vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

      const result = await findBooksByAuthor(authorName, env);

      expect(BookRepository.prototype.findByAuthor).toHaveBeenCalledWith(authorName, 50);
      expect(result.works).toHaveLength(2);
      expect(result.source).toBe('d1');
    });

    it('should return empty result when no books found', async () => {
      vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue([]);

      const result = await findBooksByAuthor('Unknown Author', env);

      expect(result.works).toHaveLength(0);
      expect(result.source).toBe('d1');
    });

    it('should deduplicate authors', async () => {
      const authorName = 'Test Author';
      const mockBooks = [
        {
          isbn: '1',
          canonicalMetadata: {
            works: [],
            authors: [{ name: 'Author A', role: 'writer' }]
          }
        },
        {
          isbn: '2',
          canonicalMetadata: {
            works: [],
            authors: [{ name: 'Author A', role: 'writer' }, { name: 'Author B' }]
          }
        }
      ];

      vi.mocked(BookRepository.prototype.findByAuthor).mockResolvedValue(mockBooks);

      const result = await findBooksByAuthor(authorName, env);

      expect(result.authors).toHaveLength(2);
      expect(result.authors.map(a => a.name)).toEqual(expect.arrayContaining(['Author A', 'Author B']));
    });
  });
});
