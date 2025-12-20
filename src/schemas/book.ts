/**
 * Book Zod Schemas
 *
 * Schemas for book-related data structures following the canonical data model.
 * These match the WorkDTO, EditionDTO, and AuthorDTO TypeScript interfaces.
 *
 * @module schemas/book
 */

import { z } from 'zod'

// ============================================================================
// CORE BOOK SCHEMAS
// ============================================================================

/**
 * Book Schema (Canonical)
 *
 * Minimal book representation for search results and basic book data.
 * This is the flattened format used in most API responses.
 */
export const BookSchema = z
  .object({
    isbn: z.string(),
    isbn13: z.string().optional(),
    title: z.string(),
    authors: z.array(z.string()),
    publisher: z.string().optional(),
    publishedDate: z.string().optional(),
    description: z.string().optional(),
    pageCount: z.number().int().min(0).optional(),
    categories: z.array(z.string()).optional(),
    language: z.string().optional(),
    coverUrl: z.string().url().optional(),
    averageRating: z.number().min(0).max(5).optional(),
    ratingsCount: z.number().int().min(0).optional(),
  })
  .strict()

/**
 * BoundingBox Schema
 *
 * Rectangle coordinates for book spine detection in bookshelf photos.
 * Coordinates are normalized (0.0-1.0).
 */
export const BoundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict()

/**
 * Work Schema (OpenLibrary Canonical DTO)
 *
 * Represents an abstract creative work (e.g., "Harry Potter and the Philosopher's Stone")
 * independent of any specific edition.
 */
export const WorkSchema = z
  .object({
    // Required fields
    title: z.string(),
    subjectTags: z.array(z.string()),

    // Optional metadata
    originalLanguage: z.string().optional(),
    firstPublicationYear: z.number().int().optional(),
    description: z.string().optional(),
    coverImageURL: z.string().url().optional(),

    // Provenance
    synthetic: z.boolean().optional(),
    primaryProvider: z.enum(['google_books', 'open_library', 'isbndb', 'kv_cache']).optional(),
    contributors: z
      .array(z.enum(['google_books', 'open_library', 'isbndb', 'kv_cache']))
      .optional(),

    // External IDs - Legacy
    openLibraryID: z.string().optional(),
    openLibraryWorkID: z.string().optional(),
    isbndbID: z.string().optional(),
    googleBooksVolumeID: z.string().optional(),
    goodreadsID: z.string().optional(),

    // External IDs - Modern
    goodreadsWorkIDs: z.array(z.string()),
    amazonASINs: z.array(z.string()),
    librarythingIDs: z.array(z.string()),
    googleBooksVolumeIDs: z.array(z.string()),

    // Quality metrics
    lastISBNDBSync: z.string().datetime().optional(),
    isbndbQuality: z.number().int().min(0).max(100),

    // Review metadata
    reviewStatus: z.enum(['unverified', 'verified', 'rejected', 'flagged']),
    originalImagePath: z.string().optional(),
    boundingBox: BoundingBoxSchema.optional(),
  })
  .strict()

/**
 * Edition Schema (OpenLibrary Canonical DTO)
 *
 * Represents a specific physical or digital edition of a work
 * (e.g., "2001 Hardcover Scholastic Edition").
 */
export const EditionSchema = z
  .object({
    // Identifiers
    isbn: z.string().optional(),
    isbns: z.array(z.string()),

    // Core metadata
    title: z.string().optional(),
    publisher: z.string().optional(),
    publicationDate: z.string().optional(),
    pageCount: z.number().int().min(0).optional(),
    format: z.enum([
      'hardcover',
      'paperback',
      'ebook',
      'audiobook',
      'mass_market',
      'board_book',
      'unknown',
    ]),
    coverImageURL: z.string().url().optional(),
    editionTitle: z.string().optional(),
    editionDescription: z.string().optional(),
    language: z.string().optional(),

    // Provenance
    primaryProvider: z.enum(['google_books', 'open_library', 'isbndb', 'kv_cache']).optional(),
    contributors: z
      .array(z.enum(['google_books', 'open_library', 'isbndb', 'kv_cache']))
      .optional(),

    // External IDs - Legacy
    openLibraryID: z.string().optional(),
    openLibraryEditionID: z.string().optional(),
    isbndbID: z.string().optional(),
    googleBooksVolumeID: z.string().optional(),
    goodreadsID: z.string().optional(),

    // External IDs - Modern
    amazonASINs: z.array(z.string()),
    googleBooksVolumeIDs: z.array(z.string()),
    librarythingIDs: z.array(z.string()),

    // Quality metrics
    lastISBNDBSync: z.string().datetime().optional(),
    isbndbQuality: z.number().int().min(0).max(100),
  })
  .strict()

/**
 * Author Schema (Canonical DTO)
 *
 * Represents a book author with biographical metadata.
 */
export const AuthorSchema = z
  .object({
    // Required
    name: z.string(),
    gender: z.enum(['male', 'female', 'non_binary', 'unknown']),

    // Optional
    culturalRegion: z
      .enum([
        'north_america',
        'latin_america',
        'europe',
        'asia',
        'africa',
        'middle_east',
        'oceania',
        'unknown',
      ])
      .optional(),
    nationality: z.string().optional(),
    birthYear: z.number().int().optional(),
    deathYear: z.number().int().optional(),

    // External IDs
    openLibraryID: z.string().optional(),
    isbndbID: z.string().optional(),
    googleBooksID: z.string().optional(),
    goodreadsID: z.string().optional(),

    // Statistics
    bookCount: z.number().int().min(0).optional(),
  })
  .strict()

/**
 * Enrichment Data Schema
 *
 * Nested enrichment result from external providers.
 * Used in detected books and enrichment responses.
 */
export const EnrichmentDataSchema = z
  .object({
    status: z.enum(['success', 'not_found', 'error', 'circuit_open']),
    work: WorkSchema.optional(),
    editions: z.array(EditionSchema).optional(),
    authors: z.array(AuthorSchema).optional(),
    provider: z.string().optional(),
    cachedResult: z.boolean().optional(),
    error: z.string().optional(),
    retryAfterMs: z.number().min(0).optional(),
  })
  .strict()

// ============================================================================
// SEARCH RESULT SCHEMAS
// ============================================================================

/**
 * Book Search Result Schema
 *
 * Response format for search endpoints (ISBN, title, author searches).
 */
export const BookSearchResultSchema = z
  .object({
    books: z.array(BookSchema),
    totalResults: z.number().int().min(0),
    query: z.string(),
  })
  .strict()

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Book = z.infer<typeof BookSchema>
export type BoundingBox = z.infer<typeof BoundingBoxSchema>
export type Work = z.infer<typeof WorkSchema>
export type Edition = z.infer<typeof EditionSchema>
export type Author = z.infer<typeof AuthorSchema>
export type EnrichmentData = z.infer<typeof EnrichmentDataSchema>
export type BookSearchResult = z.infer<typeof BookSearchResultSchema>
