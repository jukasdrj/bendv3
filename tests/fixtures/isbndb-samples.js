/**
 * ISBNdb Test Fixtures
 *
 * Reusable sample data for ISBNdb normalizer tests
 * Eliminates duplication and provides consistent test data
 */

/**
 * Complete ISBNdb book response with all fields populated
 * Used for testing happy path normalization
 */
export const completeIsbndbBook = {
  title: "Harry Potter and the Philosopher's Stone",
  title_long: "Harry Potter and the Philosopher's Stone (Harry Potter #1)",
  isbn13: "9780439708180",
  isbn: "0439708184",
  language: "en",
  date_published: "1998-09-01",
  synopsis: "Harry Potter has never been the star of a Quidditch team...",
  subjects: ["Fiction", "Fantasy", "Magic"],
  authors: ["J.K. Rowling"],
  publisher: "Scholastic",
  pages: 320,
  binding: "Hardcover",
  image: "https://images.isbndb.com/covers/08/18/9780439708180.jpg",
};

/**
 * Minimal ISBNdb book response with only required fields
 * Used for testing default value handling
 */
export const minimalIsbndbBook = {
  title: "Minimal Book Data",
  isbn13: "9781234567890",
};

/**
 * ISBNdb book with ISBN-10 only (no ISBN-13)
 * Tests ISBN fallback logic
 */
export const isbn10OnlyBook = {
  title: "Book with only ISBN-10",
  isbn: "0439708184",
};

/**
 * ISBNdb book with no ISBNs
 * Tests edge case handling
 */
export const noIsbnBook = {
  title: "Book without ISBN",
  publisher: "Test Publisher",
};
