-- Migration 0010: Add JSON Validation CHECK Constraints
-- Sprint 3: Data Quality (Day 8, Issue #43)
-- Purpose: Ensure canonical_metadata and provider_metadata are valid JSON
-- Created: 2025-11-25

-- ============================================================================
-- Recreate books table with JSON validation constraints
-- ============================================================================

-- Step 1: Create new table with CHECK constraints
CREATE TABLE IF NOT EXISTS books_new (
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
  canonical_metadata TEXT NOT NULL CHECK(json_valid(canonical_metadata)),
  provider_metadata TEXT CHECK(provider_metadata IS NULL OR json_valid(provider_metadata)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Step 2: Copy existing data (validates JSON on insert)
INSERT INTO books_new SELECT * FROM books;

-- Step 3: Drop old table
DROP TABLE books;

-- Step 4: Rename new table
ALTER TABLE books_new RENAME TO books;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_publication_date ON books(publication_date);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);

-- Step 6: Recreate the updated_at trigger
CREATE TRIGGER IF NOT EXISTS trg_books_updated_at
AFTER UPDATE ON books
FOR EACH ROW
BEGIN
  UPDATE books SET updated_at = unixepoch() WHERE isbn = NEW.isbn;
END;
