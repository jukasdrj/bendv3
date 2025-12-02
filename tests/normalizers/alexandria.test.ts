import { describe, it, expect } from 'vitest';
import { normalizeAlexandriaToWork, normalizeAlexandriaToEdition, normalizeAlexandriaToAuthor } from '../../src/services/normalizers/alexandria.js';
import type { AlexandriaResult } from '../../src/services/normalizers/alexandria.js';

describe('normalizeAlexandriaToWork', () => {
  it('should convert Alexandria result to WorkDTO', () => {
    const alexandriaResult: AlexandriaResult = {
      title: '1984',
      author: 'George Orwell',
      isbn: '9780451524935',
      publish_date: '1949-06-08',
      publishers: ['Penguin Books'],
      pages: '328',
      work_title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M',
      openlibrary_work: 'https://openlibrary.org/works/OL45804W'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.title).toBe('1984');
    expect(work.firstPublicationYear).toBe(1949);
    expect(work.subjectTags).toEqual([]); // Alexandria doesn't return subjects
    expect(work.openLibraryWorkID).toBe('OL45804W');
    expect(work.coverImageURL).toContain('covers.openlibrary.org/b/olid/OL7353617M-L.jpg');
    expect(work.primaryProvider).toBe('alexandria');
    expect(work.synthetic).toBe(false);
    expect(work.reviewStatus).toBe('verified');
  });

  it('should prioritize work_title over title', () => {
    const alexandriaResult: AlexandriaResult = {
      title: '1984: Edition Title',
      work_title: '1984',
      isbn: '9780451524935',
      openlibrary_work: 'https://openlibrary.org/works/OL45804W'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.title).toBe('1984');
  });

  it('should fall back to title when work_title is missing', () => {
    const alexandriaResult: AlexandriaResult = {
      title: '1984',
      isbn: '9780451524935'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.title).toBe('1984');
  });

  it('should use "Unknown" when both titles are missing', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.title).toBe('Unknown');
  });

  it('should handle missing optional fields', () => {
    const minimalResult: AlexandriaResult = {
      isbn: '9781234567890',
      title: 'Unknown Book',
      author: 'Unknown Author'
    };

    const work = normalizeAlexandriaToWork(minimalResult);

    expect(work.title).toBe('Unknown Book');
    expect(work.firstPublicationYear).toBeUndefined();
    expect(work.openLibraryWorkID).toBeUndefined();
    expect(work.subjectTags).toEqual([]);
  });

  it('should extract OpenLibrary Work ID from URL', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'https://openlibrary.org/works/OL45804W'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBe('OL45804W');
  });

  it('should extract cover URL from OpenLibrary Edition ID', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.coverImageURL).toBe('https://covers.openlibrary.org/b/olid/OL7353617M-L.jpg');
  });

  it('should use placeholder cover when edition ID is missing', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.coverImageURL).toContain('placehold'); // getPlaceholderCover() returns placehold.co URL
  });

  it('should parse year from various date formats', () => {
    const testDates = [
      { input: '1949-06-08', expected: 1949 },
      { input: '1949', expected: 1949 },
      { input: '2021-01', expected: 2021 }
    ];

    testDates.forEach(({ input, expected }) => {
      const result: AlexandriaResult = {
        isbn: '9780451524935',
        title: 'Test Book',
        publish_date: input
      };
      const work = normalizeAlexandriaToWork(result);
      expect(work.firstPublicationYear).toBe(expected);
    });
  });

  it('should handle invalid OpenLibrary URLs gracefully', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'https://example.com/invalid',
      openlibrary_edition: 'not-a-url'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBeUndefined();
    expect(work.coverImageURL).toContain('placehold');
  });

  it('should initialize empty arrays for external IDs', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.goodreadsWorkIDs).toEqual([]);
    expect(work.amazonASINs).toEqual([]);
    expect(work.librarythingIDs).toEqual([]);
    expect(work.googleBooksVolumeIDs).toEqual([]);
  });

  it('should set provenance fields correctly', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.primaryProvider).toBe('alexandria');
    expect(work.contributors).toEqual(['alexandria']);
    expect(work.synthetic).toBe(false);
    expect(work.isbndbQuality).toBe(0);
  });
});

describe('normalizeAlexandriaToEdition', () => {
  it('should convert Alexandria result to EditionDTO', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      author: 'George Orwell',
      publish_date: '2021-01-05',
      publishers: ['Penguin Books', 'Random House'],
      pages: '328',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.isbn).toBe('9780451524935');
    expect(edition.isbns).toContain('9780451524935');
    expect(edition.title).toBe('1984');
    expect(edition.publisher).toBe('Penguin Books'); // First publisher
    expect(edition.publicationDate).toBe('2021-01-05');
    expect(edition.pageCount).toBe(328);
    expect(edition.format).toBe('Paperback'); // Default format
    expect(edition.coverImageURL).toContain('covers.openlibrary.org/b/olid/OL7353617M-L.jpg');
    expect(edition.openLibraryEditionID).toBe('OL7353617M');
    expect(edition.primaryProvider).toBe('alexandria');
  });

  it('should handle missing publishers array', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.publisher).toBeUndefined();
  });

  it('should handle empty publishers array', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      publishers: []
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.publisher).toBeUndefined();
  });

  it('should parse page count from string', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      pages: '328'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.pageCount).toBe(328);
  });

  it('should handle invalid page count', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      pages: 'not-a-number'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    // parseInt('not-a-number', 10) returns NaN, not undefined
    expect(edition.pageCount).toBeNaN();
  });

  it('should handle missing page count', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.pageCount).toBeUndefined();
  });

  it('should extract OpenLibrary Edition ID from URL', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.openLibraryEditionID).toBe('OL7353617M');
  });

  it('should generate cover URL from edition ID', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.coverImageURL).toBe('https://covers.openlibrary.org/b/olid/OL7353617M-L.jpg');
  });

  it('should use placeholder cover when edition ID is missing', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.coverImageURL).toContain('placehold');
  });

  it('should handle malformed OpenLibrary edition URL', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'not-a-valid-url'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.openLibraryEditionID).toBeUndefined();
    expect(edition.coverImageURL).toContain('placehold');
  });

  it('should always use Paperback as default format', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.format).toBe('Paperback');
  });

  it('should initialize empty arrays for external IDs', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.amazonASINs).toEqual([]);
    expect(edition.googleBooksVolumeIDs).toEqual([]);
    expect(edition.librarythingIDs).toEqual([]);
  });

  it('should set provenance fields correctly', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.primaryProvider).toBe('alexandria');
    expect(edition.contributors).toEqual(['alexandria']);
    expect(edition.isbndbQuality).toBe(0);
  });

  it('should handle all optional fields missing', () => {
    const minimalResult: AlexandriaResult = {
      isbn: '9781234567890'
    };

    const edition = normalizeAlexandriaToEdition(minimalResult);

    expect(edition.isbn).toBe('9781234567890');
    expect(edition.title).toBeUndefined();
    expect(edition.publisher).toBeUndefined();
    expect(edition.publicationDate).toBeUndefined();
    expect(edition.pageCount).toBeUndefined();
    expect(edition.format).toBe('Paperback');
  });
});

describe('normalizeAlexandriaToAuthor', () => {
  it('should convert author name to AuthorDTO', () => {
    const author = normalizeAlexandriaToAuthor('George Orwell');

    expect(author.name).toBe('George Orwell');
    expect(author.gender).toBe('Unknown');
  });

  it('should handle empty author name', () => {
    const author = normalizeAlexandriaToAuthor('');

    expect(author.name).toBe('');
    expect(author.gender).toBe('Unknown');
  });

  it('should handle author name with special characters', () => {
    const author = normalizeAlexandriaToAuthor('José Saramago');

    expect(author.name).toBe('José Saramago');
    expect(author.gender).toBe('Unknown');
  });

  it('should handle author name with multiple words', () => {
    const author = normalizeAlexandriaToAuthor('Gabriel García Márquez');

    expect(author.name).toBe('Gabriel García Márquez');
    expect(author.gender).toBe('Unknown');
  });

  it('should preserve whitespace in author name', () => {
    const author = normalizeAlexandriaToAuthor('  J.K. Rowling  ');

    expect(author.name).toBe('  J.K. Rowling  ');
    expect(author.gender).toBe('Unknown');
  });
});

describe('OLID extraction edge cases', () => {
  it('should extract work OLID with numeric suffix', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'https://openlibrary.org/works/OL45804W'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBe('OL45804W');
  });

  it('should extract edition OLID with M suffix', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.openLibraryEditionID).toBe('OL7353617M');
  });

  it('should handle OLID without protocol', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'openlibrary.org/works/OL45804W'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBe('OL45804W');
  });

  it('should handle OLID with trailing slash', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M/'
    };

    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(edition.openLibraryEditionID).toBe('OL7353617M');
  });

  it('should handle OLID with query parameters', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'https://openlibrary.org/works/OL45804W?view=json'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBe('OL45804W');
  });

  it('should return undefined for null openlibrary_work', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBeUndefined();
  });

  it('should return undefined for malformed URL without OLID pattern', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_work: 'https://example.com/not-an-olid'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);

    expect(work.openLibraryWorkID).toBeUndefined();
  });
});

describe('Cover URL generation', () => {
  it('should generate large cover URL with -L suffix', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);
    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(work.coverImageURL).toContain('-L.jpg');
    expect(edition.coverImageURL).toContain('-L.jpg');
  });

  it('should use covers.openlibrary.org domain', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);
    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(work.coverImageURL).toContain('covers.openlibrary.org');
    expect(edition.coverImageURL).toContain('covers.openlibrary.org');
  });

  it('should use /b/olid/ path format', () => {
    const alexandriaResult: AlexandriaResult = {
      isbn: '9780451524935',
      title: '1984',
      openlibrary_edition: 'https://openlibrary.org/books/OL7353617M'
    };

    const work = normalizeAlexandriaToWork(alexandriaResult);
    const edition = normalizeAlexandriaToEdition(alexandriaResult);

    expect(work.coverImageURL).toContain('/b/olid/');
    expect(edition.coverImageURL).toContain('/b/olid/');
  });
});
