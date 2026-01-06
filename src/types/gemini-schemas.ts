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
 * CSV Parser Response Schema
 *
 * Used by: gemini-csv-provider.ts (parseCSVWithGemini)
 * Model: Gemini 2.5 Flash-Lite
 *
 * Enforces:
 * - All books have title and author (required fields)
 * - Rating range: 0-5 (when present)
 * - PageCount minimum: 1 (when present)
 * - DateRead format: YYYY-MM-DD (when present)
 * - ISBN format: 10 or 13 digits (when present)
 *
 * ISBN Validation Rules:
 * - ISBN-10: exactly 10 characters (9 digits + check digit, which may be X)
 * - ISBN-13: exactly 13 digits starting with 978 or 979
 * - All hyphens/spaces must be removed before returning
 * - Invalid/malformed ISBNs should be null, not returned
 *
 * Note: Schema guarantees no books will be returned without title+author,
 * eliminating the need for manual filtering loops in csv-import.js
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
        // Note: Gemini API doesn't support regex patterns in schema, validation is prompt-based
      },
      publicationYear: {
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
      genre: {
        type: 'string' as const,
        description: 'Primary genre or subject',
        nullable: true,
      },
      rating: {
        type: 'number' as const,
        description: 'User rating (0-5 scale)',
        nullable: true,
        minimum: 0,
        maximum: 5,
      },
      dateRead: {
        type: 'string' as const,
        description: 'Date finished reading (YYYY-MM-DD format)',
        nullable: true,
      },
      notes: {
        type: 'string' as const,
        description: 'User notes or review',
        nullable: true,
      },
    },
    required: ['title', 'author'] as const,
    // propertyOrdering ensures consistent key order in output (Gemini 2.5+ feature)
    // Order: primary identifiers → publication metadata → user-specific data
    propertyOrdering: [
      'title',
      'author',
      'isbn',
      'publicationYear',
      'publisher',
      'pageCount',
      'genre',
      'rating',
      'dateRead',
      'notes',
    ] as const,
  },
} as const

/**
 * TypeScript type inferred from CSV_BOOK_SCHEMA
 */
export interface CSVParsedBook {
  title: string
  author: string
  isbn?: string | null
  publicationYear?: number | null
  publisher?: string | null
  pageCount?: number | null
  genre?: string | null
  rating?: number | null
  dateRead?: string | null
  notes?: string | null
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
 * Type guard to validate CSV parsed book structure
 */
export function isCSVParsedBook(obj: unknown): obj is CSVParsedBook {
  if (typeof obj !== 'object' || obj === null) return false
  const book = obj as Record<string, unknown>

  // Title and author are required
  if (typeof book.title !== 'string' || typeof book.author !== 'string') return false

  // Author must not be empty (Issue #160)
  if (book.author.length === 0) return false

  // Optional fields validation
  if (book.isbn !== undefined && book.isbn !== null && typeof book.isbn !== 'string') {
    return false
  }
  if (
    book.publicationYear !== undefined &&
    book.publicationYear !== null &&
    typeof book.publicationYear !== 'number'
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
  if (book.genre !== undefined && book.genre !== null && typeof book.genre !== 'string') {
    return false
  }
  if (book.rating !== undefined && book.rating !== null) {
    if (typeof book.rating !== 'number' || book.rating < 0 || book.rating > 5) {
      return false
    }
  }
  if (book.dateRead !== undefined && book.dateRead !== null && typeof book.dateRead !== 'string') {
    return false
  }
  if (book.notes !== undefined && book.notes !== null && typeof book.notes !== 'string') {
    return false
  }

  return true
}
