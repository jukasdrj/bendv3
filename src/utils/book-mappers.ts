/**
 * Book Mappers Utility
 *
 * Converts Gemini API responses to BookRecord format for D1 persistence.
 *
 * Used by:
 * - CSV import (Gemini CSV Parser → BookRecord)
 * - Bookshelf scan (Gemini Vision → BookRecord)
 *
 * Related Issues: #1, #2 (Data loss fix - batch operations D1 persistence)
 */

import type { BookRecord } from '../types/database'

/**
 * Validate ISBN format (ISBN-10 or ISBN-13)
 *
 * Accepts:
 * - 10-digit ISBN (e.g., 0439708180)
 * - 13-digit ISBN (e.g., 9780439708180)
 * - ISBNs with hyphens/spaces (automatically stripped)
 *
 * Rejects:
 * - Empty strings
 * - Non-numeric characters (except hyphens/spaces)
 * - Invalid lengths
 *
 * @param isbn - ISBN string to validate
 * @returns true if valid ISBN-10 or ISBN-13
 */
export function isValidISBN(isbn: string | null | undefined): boolean {
  if (!isbn) return false

  // Strip hyphens and spaces
  const cleaned = isbn.replace(/[-\s]/g, '')

  // Must be exactly 10 or 13 digits
  return /^(?:[0-9]{10}|[0-9]{13})$/.test(cleaned)
}

/**
 * Convert Gemini CSV parsed book to BookRecord
 *
 * Maps CSV_BOOK_SCHEMA (gemini-schemas.js) → BookRecord (database.ts)
 *
 * @param geminiBook - Book object from Gemini CSV parser
 * @returns BookRecord ready for bookRepo.save()
 */
export function mapGeminiCSVBookToBookRecord(geminiBook: any): BookRecord {
  // Validate ISBN before creating BookRecord
  if (!isValidISBN(geminiBook.isbn)) {
    throw new Error(`Invalid ISBN: ${geminiBook.isbn} for book "${geminiBook.title}"`)
  }

  const now = Math.floor(Date.now() / 1000)

  return {
    isbn: geminiBook.isbn,
    title: geminiBook.title || 'Unknown',
    subtitle: null, // CSV parser doesn't extract subtitle
    description: geminiBook.notes || null,
    publisher: geminiBook.publisher || null,
    publicationDate: geminiBook.publicationYear ? `${geminiBook.publicationYear}-01-01` : null, // Convert year to ISO 8601 date
    language: 'en', // Default to English (CSV doesn't include language)
    pageCount: geminiBook.pageCount || null,

    // Cover images - CSV doesn't have covers (will be harvested later)
    coverSmallUrl: null,
    coverMediumUrl: null,
    coverLargeUrl: null,

    // Canonical metadata - minimal structure from CSV data
    canonicalMetadata: {
      works: [
        {
          workId: null,
          title: geminiBook.title,
          subtitle: null,
          description: geminiBook.notes || null,
          firstPublicationYear: geminiBook.publicationYear || null,
          genres: geminiBook.genre ? [geminiBook.genre] : [],
          coverImageURL: null,
        },
      ],
      editions: [
        {
          editionId: null,
          isbn: geminiBook.isbn || null,
          title: geminiBook.title,
          publisher: geminiBook.publisher || null,
          publicationDate: geminiBook.publicationYear
            ? `${geminiBook.publicationYear}-01-01`
            : null,
          language: 'en',
          pageCount: geminiBook.pageCount || null,
          format: null, // CSV doesn't include format
          coverImageURL: null,
        },
      ],
      authors: [
        {
          authorId: null,
          name: geminiBook.author,
          role: 'author' as const,
          nativeName: null,
          romanizedName: null,
        },
      ],
    },

    // Provider metadata - store original Gemini parse data
    providerMetadata: {
      source: 'gemini_csv_parser',
      originalData: geminiBook,
      userRating: geminiBook.rating || null,
      dateRead: geminiBook.dateRead || null,
    },

    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Convert Gemini Vision detected book to BookRecord
 *
 * Maps BOOKSHELF_RESPONSE_SCHEMA (gemini-schemas.js) → BookRecord (database.ts)
 *
 * Note: Vision detection provides minimal metadata (title, author, ISBN).
 * Books should be enriched via external APIs before saving.
 *
 * @param detectedBook - Book object from Gemini Vision bookshelf scanner
 * @param enrichedData - Optional enrichment data from external APIs
 * @returns BookRecord ready for bookRepo.save()
 */
export function mapGeminiVisionBookToBookRecord(detectedBook: any, enrichedData?: any): BookRecord {
  // If enriched data is available, use it; otherwise use minimal detection data
  const book = enrichedData || detectedBook

  // Validate ISBN before creating BookRecord
  const isbn = book.isbn || detectedBook.isbn
  if (!isValidISBN(isbn)) {
    throw new Error(`Invalid ISBN: ${isbn} for book "${detectedBook.title}"`)
  }

  const now = Math.floor(Date.now() / 1000)

  return {
    isbn: isbn,
    title: book.title || detectedBook.title || 'Unknown',
    subtitle: book.subtitle || null,
    description: book.description || null,
    publisher: book.publisher || null,
    publicationDate: book.publicationDate || null,
    language: book.language || 'en',
    pageCount: book.pageCount || null,

    // Cover images from enrichment or null
    coverSmallUrl: book.coverImageURL || null,
    coverMediumUrl: book.coverImageURL || null,
    coverLargeUrl: book.coverImageURL || null,

    // Canonical metadata - use enriched data or create minimal structure
    canonicalMetadata: enrichedData
      ? {
          works: enrichedData.works || [],
          editions: enrichedData.editions || [],
          authors: enrichedData.authors || [],
        }
      : {
          works: [
            {
              workId: null,
              title: detectedBook.title,
              subtitle: null,
              description: null,
              firstPublicationYear: null,
              genres: [],
              coverImageURL: null,
            },
          ],
          editions: [
            {
              editionId: null,
              isbn: detectedBook.isbn || null,
              title: detectedBook.title,
              publisher: null,
              publicationDate: null,
              language: 'en',
              pageCount: null,
              format: detectedBook.format || 'unknown',
              coverImageURL: null,
            },
          ],
          authors: detectedBook.author
            ? [
                {
                  authorId: null,
                  name: detectedBook.author,
                  role: 'author' as const,
                  nativeName: null,
                  romanizedName: null,
                },
              ]
            : [],
        },

    // Provider metadata - store original Gemini Vision detection
    providerMetadata: {
      source: 'gemini_vision_scanner',
      detectionConfidence: detectedBook.confidence || null,
      detectionFormat: detectedBook.format || null,
      enrichmentSource: enrichedData ? 'external_apis' : 'vision_only',
    },

    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Deduplicate books by ISBN
 *
 * Uses reduce to create ISBN→Book map, keeping last occurrence.
 *
 * @param books - Array of books with isbn field
 * @returns Deduplicated array (unique ISBNs only)
 */
export function deduplicateBooksByISBN(books: any[]): any[] {
  const uniqueBooksMap = books.reduce(
    (acc, book) => {
      if (book.isbn) {
        // Normalize ISBN (remove non-digits) for deduplication key
        // This ensures 978-0-123... and 9780123... are treated as same book
        const normalizedIsbn = String(book.isbn).replace(/[-\s]/g, '')
        acc[normalizedIsbn] = book // Last occurrence wins
      }
      return acc
    },
    {} as Record<string, any>,
  )

  return Object.values(uniqueBooksMap)
}
