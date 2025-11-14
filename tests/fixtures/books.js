/**
 * Book Test Fixtures
 *
 * Sample book data for testing (WorkDTO format)
 * Based on real books with complete metadata
 */

/**
 * Harry Potter and the Philosopher's Stone
 * Complete canonical work with editions and author
 */
export const harryPotterBook = {
  workId: 'OL45883W',
  title: 'Harry Potter and the Philosopher\'s Stone',
  subtitle: null,
  description: 'A young wizard discovers his magical heritage on his eleventh birthday and attends Hogwarts School of Witchcraft and Wizardry.',
  authors: [
    {
      authorId: 'OL34184A',
      name: 'J.K. Rowling',
      role: 'author'
    }
  ],
  firstPublishDate: '1997-06-26',
  subjects: ['Fantasy', 'Magic', 'Wizards', 'Schools', 'Coming of age', 'British literature'],
  languageCode: 'en',
  editionCount: 45,
  coverUrl: 'https://covers.openlibrary.org/b/id/8739161-L.jpg',
  editions: [
    {
      editionId: 'OL7353617M',
      isbn10: '0439708180',
      isbn13: '9780439708180',
      title: 'Harry Potter and the Philosopher\'s Stone',
      publisher: 'Bloomsbury',
      publishDate: '1998-01-01',
      format: 'Hardcover',
      pageCount: 309,
      languageCode: 'en',
      coverUrl: 'https://covers.openlibrary.org/b/id/8739161-L.jpg'
    },
    {
      editionId: 'OL26884930M',
      isbn10: null,
      isbn13: '9781781100219',
      title: 'Harry Potter and the Philosopher\'s Stone',
      publisher: 'Pottermore Publishing',
      publishDate: '2015-12-08',
      format: 'Kindle Edition',
      pageCount: 352,
      languageCode: 'en',
      coverUrl: null
    }
  ]
}

/**
 * 1984 by George Orwell
 * Classic dystopian novel
 */
export const book1984 = {
  workId: 'OL14933854W',
  title: '1984',
  subtitle: null,
  description: 'A dystopian social science fiction novel about totalitarianism, surveillance, and thought control.',
  authors: [
    {
      authorId: 'OL118077A',
      name: 'George Orwell',
      role: 'author'
    }
  ],
  firstPublishDate: '1949-06-08',
  subjects: ['Dystopia', 'Totalitarianism', 'Surveillance', 'Fiction', 'Classic literature'],
  languageCode: 'en',
  editionCount: 234,
  coverUrl: 'https://covers.openlibrary.org/b/id/7222246-L.jpg',
  editions: [
    {
      editionId: 'OL9161945M',
      isbn10: '0451524934',
      isbn13: '9780451524935',
      title: '1984',
      publisher: 'Signet Classic',
      publishDate: '1950',
      format: 'Mass Market Paperback',
      pageCount: 328,
      languageCode: 'en',
      coverUrl: 'https://covers.openlibrary.org/b/id/7222246-L.jpg'
    }
  ]
}

/**
 * The Great Gatsby
 * American classic novel
 */
export const greatGatsbyBook = {
  workId: 'OL468431W',
  title: 'The Great Gatsby',
  subtitle: null,
  description: 'A tragic love story set in the Jazz Age, exploring themes of wealth, class, and the American Dream.',
  authors: [
    {
      authorId: 'OL9388A',
      name: 'F. Scott Fitzgerald',
      role: 'author'
    }
  ],
  firstPublishDate: '1925-04-10',
  subjects: ['American literature', 'Jazz Age', 'Romance', 'Tragedy', 'Classic'],
  languageCode: 'en',
  editionCount: 189,
  coverUrl: 'https://covers.openlibrary.org/b/id/7883784-L.jpg',
  editions: [
    {
      editionId: 'OL7196193M',
      isbn10: '0743273567',
      isbn13: '9780743273565',
      title: 'The Great Gatsby',
      publisher: 'Scribner',
      publishDate: '2004-09-30',
      format: 'Paperback',
      pageCount: 180,
      languageCode: 'en',
      coverUrl: 'https://covers.openlibrary.org/b/id/7883784-L.jpg'
    }
  ]
}

/**
 * Book with minimal metadata (edge case)
 */
export const minimalBook = {
  workId: 'OL123456W',
  title: 'Unknown Book',
  subtitle: null,
  description: null,
  authors: [],
  firstPublishDate: null,
  subjects: [],
  languageCode: 'en',
  editionCount: 1,
  coverUrl: null,
  editions: [
    {
      editionId: 'OL123456M',
      isbn10: null,
      isbn13: '9780000000000',
      title: 'Unknown Book',
      publisher: 'Unknown Publisher',
      publishDate: null,
      format: null,
      pageCount: null,
      languageCode: 'en',
      coverUrl: null
    }
  ]
}

/**
 * Array of valid ISBNs for batch testing
 */
export const validISBNs = [
  '9780439708180', // Harry Potter
  '9780451524935', // 1984
  '9780743273565', // The Great Gatsby
  '9780061120084', // To Kill a Mockingbird
  '9780142437174', // The Catcher in the Rye
  '9780060935467', // To the Lighthouse
  '9780141439518', // Pride and Prejudice
  '9780486280615', // Frankenstein
  '9780140283334', // Jane Eyre
  '9780679783268'  // Lolita
]

/**
 * Array of invalid ISBNs for error testing
 */
export const invalidISBNs = [
  '123',            // Too short
  'abc123xyz',      // Non-numeric
  '9999999999999',  // Invalid checksum
  '978045152493',   // Too short (12 digits)
  '97804515249351', // Too long (14 digits)
  '',               // Empty
  null,             // Null
  undefined         // Undefined
]

/**
 * Sample CSV data for import testing
 */
export const sampleCSV = `Title,Author,ISBN
Harry Potter and the Philosopher's Stone,J.K. Rowling,9780439708180
1984,George Orwell,9780451524935
The Great Gatsby,F. Scott Fitzgerald,9780743273565
To Kill a Mockingbird,Harper Lee,9780061120084
The Catcher in the Rye,J.D. Salinger,9780142437174`

/**
 * Malformed CSV data for error testing
 */
export const malformedCSV = `Title,Author,ISBN
Harry Potter,J.K. Rowling,invalid-isbn
,George Orwell,9780451524935
The Great Gatsby,,9780743273565
Missing Fields
,,,`

/**
 * Large batch of ISBNs for performance testing (100 items)
 */
export const largeBatchISBNs = Array.from({ length: 100 }, (_, i) => {
  // Generate pseudo-valid ISBN-13s for testing
  const base = '978000000'
  const num = String(i).padStart(3, '0')
  return `${base}${num}0`
})

/**
 * Helper: Create a mock WorkDTO with custom overrides
 */
export function createMockWork(overrides = {}) {
  return {
    workId: overrides.workId || 'OL123456W',
    title: overrides.title || 'Test Book',
    subtitle: overrides.subtitle || null,
    description: overrides.description || 'A test book description',
    authors: overrides.authors || [{ authorId: 'OL1A', name: 'Test Author', role: 'author' }],
    firstPublishDate: overrides.firstPublishDate || '2020-01-01',
    subjects: overrides.subjects || ['Fiction', 'Test'],
    languageCode: overrides.languageCode || 'en',
    editionCount: overrides.editionCount || 1,
    coverUrl: overrides.coverUrl || null,
    editions: overrides.editions || []
  }
}

/**
 * Helper: Create a mock Edition with custom overrides
 */
export function createMockEdition(overrides = {}) {
  return {
    editionId: overrides.editionId || 'OL123456M',
    isbn10: overrides.isbn10 || null,
    isbn13: overrides.isbn13 || '9780000000000',
    title: overrides.title || 'Test Edition',
    publisher: overrides.publisher || 'Test Publisher',
    publishDate: overrides.publishDate || '2020-01-01',
    format: overrides.format || 'Paperback',
    pageCount: overrides.pageCount || 200,
    languageCode: overrides.languageCode || 'en',
    coverUrl: overrides.coverUrl || null
  }
}
