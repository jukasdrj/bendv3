/**
 * JSON Schemas for Gemini Structured Output
 *
 * These schemas guarantee the structure and types of JSON responses from Gemini API,
 * eliminating manual validation overhead and ensuring type safety at the API level.
 *
 * CRITICAL: Gemini API requires lowercase type names ("array", "object", "string")
 * Per JSON Schema standard: https://ai.google.dev/gemini-api/docs/structured-output
 *
 * @module gemini-schemas
 */

/**
 * Book format types detected from visual cues
 */
type BookFormat = 'hardcover' | 'paperback' | 'mass-market' | 'unknown'

/**
 * Bookshelf Scanner Response Schema
 *
 * Used by: gemini-provider.ts (scanImageWithGemini)
 * Model: Gemini 2.5 Flash
 *
 * Enforces:
 * - All books have title, confidence, boundingBox, format
 * - Confidence range: 0.0-1.0
 * - BoundingBox coordinates: 0.0-1.0 (normalized)
 * - Format enum: hardcover|paperback|mass-market|unknown
 * - ISBN format: 10 or 13 digits (when present)
 *
 * ISBN Validation Rules:
 * - ISBN-10: exactly 10 characters (9 digits + check digit, which may be X)
 * - ISBN-13: exactly 13 digits starting with 978 or 979
 * - All hyphens/spaces must be removed before returning
 * - Invalid/malformed ISBNs should be null, not returned
 */
export const BOOKSHELF_RESPONSE_SCHEMA = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string' as const,
        description: 'Book title extracted from spine',
      },
      author: {
        type: 'string' as const,
        description: 'Author name if visible on spine',
        nullable: true,
      },
      isbn: {
        type: 'string' as const,
        description:
          'ISBN-10 (10 chars, may end in X) or ISBN-13 (13 digits starting with 978/979). Must be valid format or null.',
        nullable: true,
        // Note: Gemini API doesn't support regex patterns in schema, validation is prompt-based
      },
      format: {
        type: 'string' as const,
        enum: ['hardcover', 'paperback', 'mass-market', 'unknown'] as const,
        description: 'Physical format detected from visual cues',
        nullable: true,
      },
      confidence: {
        type: 'number' as const,
        description: 'Detection confidence level (0.0-1.0)',
        minimum: 0.0,
        maximum: 1.0,
        nullable: true,
      },
    },
    required: ['title'] as const,
    // propertyOrdering ensures consistent key order in output (Gemini 2.5+ feature)
    // Order: primary identifiers → physical attributes → metadata
    propertyOrdering: ['title', 'author', 'isbn', 'format', 'confidence'] as const,
  },
} as const

/**
 * TypeScript type inferred from BOOKSHELF_RESPONSE_SCHEMA
 */
export interface BookshelfDetectedBook {
  title: string
  author?: string | null
  isbn?: string | null
  format?: BookFormat | null
  confidence?: number | null
  photoIndex?: number // Added during scan processing for deduplication
}

/**
 * CSV Parser Response Schema (v2)
 *
 * Used by: gemini-csv-provider.ts (parseCSVWithGemini)
 * Model: Gemini 3 Flash Preview / 2.5 Flash Lite
 *
 * Changes in v2 (2026-01-15):
 * - Removed authorGender, authorCulturalRegion (problematic inference)
 * - Removed languageCode (can infer from title/publisher downstream)
 * - Simplified to core book metadata only
 * - Added external ID fields (goodreadsId, openLibraryId, googleBooksId)
 *
 * Enforces:
 * - All books have title and author (required fields)
 * - userRating range: 0-5 (when present)
 * - pageCount minimum: 1 (when present)
 * - dateRead format: YYYY-MM-DD (when present)
 * - ISBN format: 10 or 13 digits (when present)
 *
 * ISBN Validation Rules:
 * - ISBN-10: exactly 10 characters (9 digits + check digit, which may be X)
 * - ISBN-13: exactly 13 digits starting with 978 or 979
 * - All hyphens/spaces must be removed before returning
 * - Invalid/malformed ISBNs should be null, not returned
 */
export const CSV_BOOK_SCHEMA = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string' as const,
        description: 'Book title (required)',
      },
      author: {
        type: 'string' as const,
        description: 'Author name (required)',
        minLength: 1, // Issue #160: Prevent empty strings from bypassing validation
      },
      isbn: {
        type: 'string' as const,
        description:
          'ISBN-10 (10 chars, may end in X) or ISBN-13 (13 digits starting with 978/979). Must be valid format or null.',
        nullable: true,
      },
      openLibraryId: {
        type: 'string' as const,
        description: 'OpenLibrary work ID (e.g., OL45804W)',
        nullable: true,
      },
      googleBooksId: {
        type: 'string' as const,
        description: 'Google Books volume ID',
        nullable: true,
      },
      goodreadsId: {
        type: 'string' as const,
        description: 'Goodreads Book ID',
        nullable: true,
      },
      publishedYear: {
        type: 'integer' as const,
        description: 'Year of publication',
        nullable: true,
      },
      publisher: {
        type: 'string' as const,
        description: 'Publisher name',
        nullable: true,
      },
      pageCount: {
        type: 'integer' as const,
        description: 'Number of pages',
        nullable: true,
        minimum: 1,
      },
      userRating: {
        type: 'number' as const,
        description: 'User rating (0-5 scale)',
        nullable: true,
        minimum: 0,
        maximum: 5,
      },
      readingStatus: {
        type: 'string' as const,
        description: 'Reading status',
        enum: ['read', 'reading', 'to-read', 'wishlist', 'dnf'] as const,
        nullable: true,
      },
      dateRead: {
        type: 'string' as const,
        description: 'Date finished reading (YYYY-MM-DD format)',
        nullable: true,
      },
      shelves: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description: 'User-defined bookshelves/tags',
        nullable: true,
      },
    },
    required: ['title', 'author'] as const,
    // propertyOrdering ensures consistent key order in output (Gemini 2.5+ feature)
    // Order: identifiers → publication metadata → user data
    propertyOrdering: [
      'title',
      'author',
      'isbn',
      'openLibraryId',
      'googleBooksId',
      'goodreadsId',
      'publishedYear',
      'publisher',
      'pageCount',
      'userRating',
      'readingStatus',
      'dateRead',
      'shelves',
    ] as const,
  },
} as const

/**
 * TypeScript type inferred from CSV_BOOK_SCHEMA (v2)
 *
 * CRITICAL: Must match CSV_BOOK_SCHEMA exactly for Gemini structured output
 * Last updated: 2026-01-15 (aligned with schema v2)
 */
export interface CSVParsedBook {
  title: string
  author: string
  isbn?: string | null
  openLibraryId?: string | null
  googleBooksId?: string | null
  goodreadsId?: string | null
  publishedYear?: number | null
  publisher?: string | null
  pageCount?: number | null
  userRating?: number | null
  readingStatus?: 'read' | 'reading' | 'to-read' | 'wishlist' | 'dnf' | null
  dateRead?: string | null
  shelves?: string[] | null
}

/**
 * Type guard to validate Bookshelf response structure
 */
export function isBookshelfDetectedBook(obj: unknown): obj is BookshelfDetectedBook {
  if (typeof obj !== 'object' || obj === null) return false
  const book = obj as Record<string, unknown>

  // Title is required
  if (typeof book.title !== 'string') return false

  // Optional fields validation
  if (book.author !== undefined && book.author !== null && typeof book.author !== 'string') {
    return false
  }
  if (book.isbn !== undefined && book.isbn !== null && typeof book.isbn !== 'string') {
    return false
  }
  if (book.format !== undefined && book.format !== null) {
    if (!['hardcover', 'paperback', 'mass-market', 'unknown'].includes(book.format as string)) {
      return false
    }
  }
  if (book.confidence !== undefined && book.confidence !== null) {
    if (typeof book.confidence !== 'number' || book.confidence < 0 || book.confidence > 1) {
      return false
    }
  }

  return true
}

/**
 * Type guard to validate CSV parsed book structure (v2)
 *
 * CRITICAL: Must validate against CSV_BOOK_SCHEMA v2 fields
 * Last updated: 2026-01-15 (aligned with schema v2)
 */
export function isCSVParsedBook(obj: unknown): obj is CSVParsedBook {
  if (typeof obj !== 'object' || obj === null) return false
  const book = obj as Record<string, unknown>

  // Title and author are required
  if (typeof book.title !== 'string' || typeof book.author !== 'string') return false

  // Author must not be empty (Issue #160)
  if (book.author.length === 0) return false

  // Optional fields validation (schema v2)
  if (book.isbn !== undefined && book.isbn !== null && typeof book.isbn !== 'string') {
    return false
  }
  if (
    book.openLibraryId !== undefined &&
    book.openLibraryId !== null &&
    typeof book.openLibraryId !== 'string'
  ) {
    return false
  }
  if (
    book.googleBooksId !== undefined &&
    book.googleBooksId !== null &&
    typeof book.googleBooksId !== 'string'
  ) {
    return false
  }
  if (
    book.goodreadsId !== undefined &&
    book.goodreadsId !== null &&
    typeof book.goodreadsId !== 'string'
  ) {
    return false
  }
  if (
    book.publishedYear !== undefined &&
    book.publishedYear !== null &&
    typeof book.publishedYear !== 'number'
  ) {
    return false
  }
  if (
    book.publisher !== undefined &&
    book.publisher !== null &&
    typeof book.publisher !== 'string'
  ) {
    return false
  }
  if (book.pageCount !== undefined && book.pageCount !== null) {
    if (typeof book.pageCount !== 'number' || book.pageCount < 1) {
      return false
    }
  }
  if (book.userRating !== undefined && book.userRating !== null) {
    if (typeof book.userRating !== 'number' || book.userRating < 0 || book.userRating > 5) {
      return false
    }
  }
  if (book.readingStatus !== undefined && book.readingStatus !== null) {
    const validStatuses = ['read', 'reading', 'to-read', 'wishlist', 'dnf']
    if (!validStatuses.includes(book.readingStatus as string)) {
      return false
    }
  }
  if (book.dateRead !== undefined && book.dateRead !== null && typeof book.dateRead !== 'string') {
    return false
  }
  if (book.shelves !== undefined && book.shelves !== null) {
    if (!Array.isArray(book.shelves)) {
      return false
    }
    // Validate all elements are strings
    if (!book.shelves.every((shelf) => typeof shelf === 'string')) {
      return false
    }
  }

  return true
}
