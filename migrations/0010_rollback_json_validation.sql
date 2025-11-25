-- Rollback Migration 0010: Remove JSON Validation CHECK Constraints
-- Sprint 3: Data Quality (Day 8, Issue #43)
-- Use: npx wrangler d1 execute bookstrack-db --file=migrations/0010_rollback_json_validation.sql
-- Created: 2025-11-25

-- ============================================================================
-- Recreate books table without JSON validation constraints
-- ============================================================================

-- Step 1: Create new table without CHECK constraints
CREATE TABLE IF NOT EXISTS books_no_check (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  publication_date TEXT,
  language TEXT,
  page_count INTEGER,
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,
  canonical_metadata TEXT NOT NULL,
  provider_metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Step 2: Copy all data
INSERT INTO books_no_check SELECT * FROM books;

-- Step 3: Drop old table
DROP TABLE books;

-- Step 4: Rename new table
ALTER TABLE books_no_check RENAME TO books;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_publication_date ON books(publication_date);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);

-- Step 6: Recreate trigger
CREATE TRIGGER IF NOT EXISTS trg_books_updated_at
AFTER UPDATE ON books
FOR EACH ROW
BEGIN
  UPDATE books SET updated_at = unixepoch() WHERE isbn = NEW.isbn;
END;
