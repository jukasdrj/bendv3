/**
 * Database Type Definitions for D1 Migration (Sprint 2)
 *
 * Matches schema defined in migrations/0001-create-books-table.sql
 */

/**
 * BookRecord - D1 books table row
 */
export interface BookRecord {
  isbn: string // Primary key
  title: string
  subtitle: string | null
  description: string | null
  publisher: string | null
  publicationDate: string | null // ISO 8601 (YYYY-MM-DD)
  language: string | null // ISO 639-1 (en, es, ja)
  pageCount: number | null

  // Cover images (R2 bucket keys or external URLs)
  coverSmallUrl: string | null
  coverMediumUrl: string | null
  coverLargeUrl: string | null

  // JSON metadata (flexibility + backward compatibility)
  canonicalMetadata: any // Full canonical book object (works, editions, authors)
  providerMetadata: any | null // Raw provider responses (Google Books, OpenLibrary, ISBNdb)

  // Timestamps (Unix epoch in seconds)
  createdAt: number
  updatedAt: number
}

/**
 * AuthorRecord - D1 authors table row
 */
export interface AuthorRecord {
  id: number // AUTOINCREMENT
  name: string
  normalizedName: string // Lowercase for fuzzy matching
  role: 'author' | 'illustrator' | 'translator' | 'editor'

  // Cultural diversity support (Issue #197)
  nativeName: string | null // Original script (e.g., 村上春樹)
  romanizedName: string | null // Romanization (e.g., Murakami Haruki)

  createdAt: number
}

/**
 * BookAuthorRelation - D1 book_authors junction table row
 */
export interface BookAuthorRelation {
  isbn: string
  authorId: number
  authorOrder: number // For multi-author books (0-indexed)
}

/**
 * UserLibraryRecord - D1 user_library table row
 */
export interface UserLibraryRecord {
  id: number // AUTOINCREMENT
  userId: string
  isbn: string

  status: 'to_read' | 'reading' | 'completed' | 'dnf' | null
  rating: number | null // 1-5 stars

  addedAt: number // Unix epoch
  startedAt: number | null
  completedAt: number | null

  notes: string | null
  private: boolean // 1 = private, 0 = public
}

/**
 * MigrationState - Checkpoint data for backfill migration
 * Stored in Durable Object state
 */
export interface MigrationState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  cursor: string | null // KV list cursor for resuming
  processedKeys: number
  successfulMigrations: number
  failedMigrations: number
  lastProcessedKey: string | null
  errors: Array<{ key: string; error: string; timestamp: number }>
  startedAt: number | null
  completedAt: number | null
}
