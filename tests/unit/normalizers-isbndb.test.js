/**
 * Unit Tests: ISBNdb Normalizer
 *
 * Tests ISBNdb API response normalization to canonical DTOs
 * Target: 75%+ coverage for src/services/normalizers/isbndb.ts
 *
 * Coverage Areas:
 * - WorkDTO normalization
 * - EditionDTO normalization
 * - AuthorDTO normalization
 * - Format/binding normalization
 * - Date/year extraction
 * - Quality score calculation
 * - Edge cases (missing fields, malformed data)
 *
 * NOTE: These are pure function tests - no HTTP mocking needed
 */

import { describe, it, expect } from "vitest";
import {
  normalizeISBNdbToWork,
  normalizeISBNdbToEdition,
  normalizeISBNdbToAuthor,
} from "../../src/services/normalizers/isbndb.js";

/**
 * WorkDTO Normalization Tests
 */
describe("ISBNdb → WorkDTO Normalization", () => {
  it("should normalize complete ISBNdb book to WorkDTO", () => {
    const isbndbBook = {
      title: "Harry Potter and the Philosopher's Stone",
      isbn13: "9780439708180",
      isbn: "0439708184",
      language: "en",
      date_published: "1998-09-01",
      synopsis: "Harry Potter has never been the star of a Quidditch team...",
      subjects: ["Fiction", "Fantasy", "Magic"],
      authors: ["J.K. Rowling"],
      publisher: "Scholastic",
      pages: 320,
      image: "https://images.isbndb.com/covers/08/18/9780439708180.jpg",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Required fields
    expect(work.title).toBe("Harry Potter and the Philosopher's Stone");
    expect(work.subjectTags).toEqual(
      expect.arrayContaining(["Fiction", "Fantasy"]),
    );
    expect(work.originalLanguage).toBe("en");
    expect(work.firstPublicationYear).toBe(1998);
    expect(work.description).toBe(
      "Harry Potter has never been the star of a Quidditch team...",
    );

    // Metadata fields
    expect(work.synthetic).toBe(false);
    expect(work.primaryProvider).toBe("isbndb");
    expect(work.contributors).toEqual(["isbndb"]);
    expect(work.isbndbID).toBe("9780439708180");
    expect(work.reviewStatus).toBe("verified");

    // Quality score should be high for complete data
    expect(work.isbndbQuality).toBeGreaterThanOrEqual(85);
  });

  it("should handle missing optional fields gracefully", () => {
    const isbndbBook = {
      title: "Minimal Book Data",
      isbn13: "9781234567890",
      // Missing: language, date_published, synopsis, subjects, etc.
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.title).toBe("Minimal Book Data");
    expect(work.originalLanguage).toBeUndefined();
    expect(work.firstPublicationYear).toBeUndefined();
    expect(work.description).toBeUndefined();
    expect(work.subjectTags).toEqual([]); // Genre normalizer returns empty array
    expect(work.isbndbID).toBe("9781234567890");

    // Quality score should be lower for minimal data
    expect(work.isbndbQuality).toBeLessThan(70);
  });

  it('should default to "Unknown" for missing title', () => {
    const isbndbBook = {
      isbn13: "9781234567890",
      // Missing title
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.title).toBe("Unknown");
  });

  it("should fallback to ISBN-10 when ISBN-13 is missing", () => {
    const isbndbBook = {
      title: "Book with only ISBN-10",
      isbn: "0439708184",
      // Missing isbn13
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.isbndbID).toBe("0439708184");
  });

  it("should extract year from full date string (YYYY-MM-DD)", () => {
    const isbndbBook = {
      title: "Test Book",
      date_published: "2020-05-15",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBe(2020);
  });

  it("should extract year from partial date string (YYYY-MM)", () => {
    const isbndbBook = {
      title: "Test Book",
      date_published: "2019-12",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBe(2019);
  });

  it("should extract year from year-only string (YYYY)", () => {
    const isbndbBook = {
      title: "Test Book",
      date_published: "2018",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBe(2018);
  });

  it("should return undefined for malformed date string", () => {
    const isbndbBook = {
      title: "Test Book",
      date_published: "invalid-date",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBeUndefined();
  });
});

/**
 * EditionDTO Normalization Tests
 */
describe("ISBNdb → EditionDTO Normalization", () => {
  it("should normalize complete ISBNdb book to EditionDTO", () => {
    const isbndbBook = {
      title: "Harry Potter and the Philosopher's Stone",
      title_long: "Harry Potter and the Philosopher's Stone (Harry Potter #1)",
      isbn13: "9780439708180",
      isbn: "0439708184",
      publisher: "Scholastic",
      date_published: "1998-09-01",
      pages: 320,
      binding: "Hardcover",
      language: "en",
      synopsis: "Harry Potter has never been the star of a Quidditch team...",
      image: "https://images.isbndb.com/covers/08/18/9780439708180.jpg",
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    // Required fields
    expect(edition.isbn).toBe("9780439708180");
    expect(edition.isbns).toEqual(["9780439708180", "0439708184"]);
    expect(edition.title).toBe("Harry Potter and the Philosopher's Stone");
    expect(edition.publisher).toBe("Scholastic");
    expect(edition.publicationDate).toBe("1998-09-01");
    expect(edition.pageCount).toBe(320);
    expect(edition.format).toBe("Hardcover");
    expect(edition.language).toBe("en");

    // Optional fields
    expect(edition.coverImageURL).toBe(
      "https://images.isbndb.com/covers/08/18/9780439708180.jpg",
    );
    expect(edition.editionTitle).toBe(
      "Harry Potter and the Philosopher's Stone (Harry Potter #1)",
    );
    expect(edition.editionDescription).toBe(
      "Harry Potter has never been the star of a Quidditch team...",
    );

    // Metadata
    expect(edition.primaryProvider).toBe("isbndb");
    expect(edition.contributors).toEqual(["isbndb"]);
    expect(edition.isbndbID).toBe("9780439708180");
  });

  it("should use ISBN-10 if ISBN-13 is missing", () => {
    const isbndbBook = {
      title: "Test Book",
      isbn: "0439708184",
      publisher: "Test Publisher",
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    expect(edition.isbn).toBe("0439708184");
    expect(edition.isbns).toEqual(["0439708184"]);
  });

  it("should not include editionTitle if title_long equals title", () => {
    const isbndbBook = {
      title: "Same Title",
      title_long: "Same Title",
      isbn13: "9781234567890",
      publisher: "Test Publisher",
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    expect(edition.editionTitle).toBeUndefined();
  });

  it("should include editionTitle if title_long differs from title", () => {
    const isbndbBook = {
      title: "Short Title",
      title_long: "Short Title: The Complete Unabridged Edition",
      isbn13: "9781234567890",
      publisher: "Test Publisher",
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    expect(edition.editionTitle).toBe(
      "Short Title: The Complete Unabridged Edition",
    );
  });

  it("should normalize various binding formats to Hardcover", () => {
    const testCases = [
      { binding: "Hardcover", expected: "Hardcover" },
      { binding: "hardcover", expected: "Hardcover" },
      { binding: "Hardback", expected: "Hardcover" },
      { binding: "hardback", expected: "Hardcover" },
      { binding: "Library Binding (Hardcover)", expected: "Hardcover" },
    ];

    testCases.forEach(({ binding, expected }) => {
      const edition = normalizeISBNdbToEdition({
        title: "Test",
        isbn13: "9781234567890",
        publisher: "Test",
        binding,
      });
      expect(edition.format).toBe(expected);
    });
  });

  it("should normalize various binding formats to Paperback", () => {
    const testCases = [
      { binding: "Paperback", expected: "Paperback" },
      { binding: "paperback", expected: "Paperback" },
      { binding: "Mass Market Paperback", expected: "Paperback" },
      { binding: "Trade Paperback", expected: "Paperback" },
      { binding: "Trade Paper", expected: "Paperback" },
    ];

    testCases.forEach(({ binding, expected }) => {
      const edition = normalizeISBNdbToEdition({
        title: "Test",
        isbn13: "9781234567890",
        publisher: "Test",
        binding,
      });
      expect(edition.format).toBe(expected);
    });
  });

  it("should normalize various binding formats to E-book", () => {
    const testCases = [
      { binding: "eBook", expected: "E-book" },
      { binding: "ebook", expected: "E-book" },
      { binding: "Kindle", expected: "E-book" },
      { binding: "kindle edition", expected: "E-book" },
      { binding: "Digital", expected: "E-book" },
    ];

    testCases.forEach(({ binding, expected }) => {
      const edition = normalizeISBNdbToEdition({
        title: "Test",
        isbn13: "9781234567890",
        publisher: "Test",
        binding,
      });
      expect(edition.format).toBe(expected);
    });
  });

  it("should normalize audiobook binding to Audiobook", () => {
    const testCases = [
      { binding: "Audiobook", expected: "Audiobook" },
      { binding: "audiobook", expected: "Audiobook" },
      { binding: "Audio CD", expected: "Audiobook" },
    ];

    testCases.forEach(({ binding, expected }) => {
      const edition = normalizeISBNdbToEdition({
        title: "Test",
        isbn13: "9781234567890",
        publisher: "Test",
        binding,
      });
      expect(edition.format).toBe(expected);
    });
  });

  it("should default to Paperback for unknown binding", () => {
    const edition = normalizeISBNdbToEdition({
      title: "Test",
      isbn13: "9781234567890",
      publisher: "Test",
      binding: "Unknown Format",
    });

    expect(edition.format).toBe("Paperback");
  });

  it("should default to Paperback when binding is missing", () => {
    const edition = normalizeISBNdbToEdition({
      title: "Test",
      isbn13: "9781234567890",
      publisher: "Test",
      // No binding field
    });

    expect(edition.format).toBe("Paperback");
  });
});

/**
 * AuthorDTO Normalization Tests
 */
describe("ISBNdb → AuthorDTO Normalization", () => {
  it("should normalize author name to AuthorDTO", () => {
    const authorName = "J.K. Rowling";

    const author = normalizeISBNdbToAuthor(authorName);

    expect(author.name).toBe("J.K. Rowling");
    expect(author.gender).toBe("Unknown"); // ISBNdb doesn't provide gender
  });

  it("should handle author names with special characters", () => {
    const authorName = "José Saramago";

    const author = normalizeISBNdbToAuthor(authorName);

    expect(author.name).toBe("José Saramago");
    expect(author.gender).toBe("Unknown");
  });

  it("should handle multi-word author names", () => {
    const authorName = "Gabriel García Márquez";

    const author = normalizeISBNdbToAuthor(authorName);

    expect(author.name).toBe("Gabriel García Márquez");
    expect(author.gender).toBe("Unknown");
  });
});

/**
 * Quality Score Calculation Tests
 */
describe("ISBNdb Quality Score Calculation", () => {
  it("should calculate high quality score for complete data", () => {
    const isbndbBook = {
      title: "Complete Book",
      isbn13: "9781234567890",
      image: "https://example.com/cover.jpg",
      synopsis:
        "A very detailed synopsis that is longer than 50 characters for sure",
      pages: 320,
      publisher: "Great Publisher",
      subjects: ["Fiction", "Adventure"],
      authors: ["John Doe"],
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Base: 50 + image: 20 + synopsis: 10 + pages: 5 + publisher: 5 + subjects: 5 + authors: 5 = 100
    expect(work.isbndbQuality).toBe(100);
  });

  it("should calculate medium quality score for partial data", () => {
    const isbndbBook = {
      title: "Partial Book",
      isbn13: "9781234567890",
      image: "https://example.com/cover.jpg",
      synopsis: "Short synopsis",
      pages: 200,
      // Missing: publisher, subjects, authors
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Base: 50 + image: 20 + pages: 5 = 75 (synopsis too short)
    expect(work.isbndbQuality).toBe(75);
  });

  it("should calculate low quality score for minimal data", () => {
    const isbndbBook = {
      title: "Minimal Book",
      isbn13: "9781234567890",
      // Missing everything optional
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Base: 50 only
    expect(work.isbndbQuality).toBe(50);
  });

  it("should cap quality score at 100", () => {
    const isbndbBook = {
      title: "Over-complete Book",
      isbn13: "9781234567890",
      image: "https://example.com/cover.jpg",
      synopsis:
        "A very detailed synopsis that is longer than 50 characters for sure",
      pages: 320,
      publisher: "Great Publisher",
      subjects: ["Fiction", "Adventure", "Drama", "Mystery"],
      authors: ["John Doe", "Jane Smith"],
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Even with extra data, should cap at 100
    expect(work.isbndbQuality).toBe(100);
  });

  it("should never go below 0", () => {
    const isbndbBook = {
      // Completely empty object
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.isbndbQuality).toBeGreaterThanOrEqual(0);
    expect(work.isbndbQuality).toBeLessThanOrEqual(100);
  });

  it("should handle zero pages correctly", () => {
    const isbndbBook = {
      title: "Book",
      isbn13: "9781234567890",
      pages: 0, // Edge case: 0 pages
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Should not add points for 0 pages
    expect(work.isbndbQuality).toBe(50); // Just base score
  });

  it("should handle empty arrays correctly", () => {
    const isbndbBook = {
      title: "Book",
      isbn13: "9781234567890",
      subjects: [], // Empty array
      authors: [], // Empty array
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    // Should not add points for empty arrays
    expect(work.isbndbQuality).toBe(50); // Just base score
  });

  it("should add points for synopsis longer than 50 characters", () => {
    const shortSynopsis = {
      title: "Book",
      isbn13: "9781234567890",
      synopsis: "Short", // Less than 50 chars
    };

    const longSynopsis = {
      title: "Book",
      isbn13: "9781234567890",
      synopsis:
        "This is a much longer synopsis that definitely exceeds fifty characters in length",
    };

    const workShort = normalizeISBNdbToWork(shortSynopsis);
    const workLong = normalizeISBNdbToWork(longSynopsis);

    expect(workShort.isbndbQuality).toBe(50); // No bonus
    expect(workLong.isbndbQuality).toBe(60); // +10 bonus
  });
});

/**
 * Edge Cases and Error Handling
 */
describe("ISBNdb Normalizer Edge Cases", () => {
  it("should handle null values gracefully", () => {
    const isbndbBook = {
      title: "Test Book",
      isbn13: "9781234567890",
      language: null,
      date_published: null,
      synopsis: null,
      subjects: null,
      authors: null,
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.title).toBe("Test Book");
    expect(work.originalLanguage).toBeUndefined();
    expect(work.firstPublicationYear).toBeUndefined();
    expect(work.description).toBeUndefined();
  });

  it("should handle undefined values gracefully", () => {
    const isbndbBook = {
      title: "Test Book",
      isbn13: "9781234567890",
      language: undefined,
      date_published: undefined,
      synopsis: undefined,
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.title).toBe("Test Book");
    expect(work.originalLanguage).toBeUndefined();
    expect(work.firstPublicationYear).toBeUndefined();
    expect(work.description).toBeUndefined();
  });

  it("should handle empty strings gracefully", () => {
    const isbndbBook = {
      title: "", // Empty title should become "Unknown"
      isbn13: "9781234567890",
      language: "",
      synopsis: "",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.title).toBe("Unknown");
    // Empty strings are falsy, so they become undefined per the || undefined pattern
    expect(work.originalLanguage).toBeUndefined();
    expect(work.description).toBeUndefined();
  });

  it("should handle both ISBNs missing by using undefined", () => {
    const isbndbBook = {
      title: "Book without ISBN",
      publisher: "Test Publisher",
      // No isbn or isbn13
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.isbndbID).toBeUndefined();
  });

  it("should filter out falsy ISBN values from isbns array", () => {
    const isbndbBook = {
      title: "Test",
      isbn13: "9781234567890",
      isbn: null, // Falsy value
      publisher: "Test",
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    // Should only include truthy ISBNs
    expect(edition.isbns).toEqual(["9781234567890"]);
  });

  it("should handle extremely long synopsis", () => {
    const longSynopsis = "A".repeat(10000); // 10k characters

    const isbndbBook = {
      title: "Book",
      isbn13: "9781234567890",
      synopsis: longSynopsis,
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.description).toBe(longSynopsis);
    expect(work.isbndbQuality).toBe(60); // Base + synopsis bonus
  });

  it("should handle special characters in all fields", () => {
    const isbndbBook = {
      title: 'Book with "Quotes" & <HTML>',
      isbn13: "9781234567890",
      publisher: "Publisher & Co.",
      synopsis: "Synopsis with émojis 📚 and spëcial çhars",
      binding: "Paperback™",
      language: "en-US",
    };

    const work = normalizeISBNdbToWork(isbndbBook);
    const edition = normalizeISBNdbToEdition(isbndbBook);

    expect(work.title).toBe('Book with "Quotes" & <HTML>');
    expect(edition.publisher).toBe("Publisher & Co.");
    expect(work.description).toBe("Synopsis with émojis 📚 and spëcial çhars");
  });

  it("should handle negative page count", () => {
    const isbndbBook = {
      title: "Book",
      isbn13: "9781234567890",
      pages: -100, // Invalid negative pages
    };

    const edition = normalizeISBNdbToEdition(isbndbBook);

    // Should preserve the value (normalizer doesn't validate)
    expect(edition.pageCount).toBe(-100);
  });

  it("should handle future publication dates", () => {
    const isbndbBook = {
      title: "Future Book",
      isbn13: "9781234567890",
      date_published: "2099-12-31",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBe(2099);
  });

  it("should handle ancient publication dates", () => {
    const isbndbBook = {
      title: "Ancient Book",
      isbn13: "9781234567890",
      date_published: "0001-01-01",
    };

    const work = normalizeISBNdbToWork(isbndbBook);

    expect(work.firstPublicationYear).toBe(1);
  });
});
