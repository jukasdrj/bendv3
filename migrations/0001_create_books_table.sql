-- Migration: Create books table
-- Applied: 2025-11-23 19:31:35

CREATE TABLE books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  publication_date TEXT,
  language TEXT,
  page_count INTEGER,

  -- Cover URLs (small, medium, large)
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,

  -- Metadata JSON blobs
  canonical_metadata TEXT NOT NULL,  -- Canonical book object (ResponseEnvelope format)
  provider_metadata TEXT,            -- Raw provider data (Google Books, OpenLibrary, etc.)

  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Denormalized author field (for simple queries)
  author TEXT,

  -- AI vectorization timestamp
  vectorized_at INTEGER
);
