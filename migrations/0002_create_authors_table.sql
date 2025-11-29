-- Migration: Create authors table
-- Applied: 2025-11-23 19:31:35

CREATE TABLE authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,  -- Lowercase, no diacritics (for deduplication)
  role TEXT DEFAULT 'author' CHECK(role IN ('author', 'illustrator', 'translator', 'editor')),

  -- Internationalization support
  native_name TEXT,               -- Native script (e.g., 村上春樹)
  romanized_name TEXT,            -- Romanized version (e.g., Haruki Murakami)

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
