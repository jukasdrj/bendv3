-- Migration 0001: Create Books Table
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23

CREATE TABLE IF NOT EXISTS books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  publication_date TEXT,        -- ISO 8601 (YYYY-MM-DD)
  language TEXT,                -- ISO 639-1 (en, es, ja)
  page_count INTEGER,

  -- Cover images (R2 bucket keys or external URLs)
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,

  -- JSON metadata (flexibility + backward compatibility)
  canonical_metadata TEXT NOT NULL,  -- Full canonical book object
  provider_metadata TEXT,            -- Raw provider responses

  -- Timestamps (Unix epoch)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_books_publication_date ON books(publication_date);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);
