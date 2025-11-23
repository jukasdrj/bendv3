-- Migration 0002: Create Authors Table (Normalized)
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23
-- Purpose: Enable complex author queries ("All books by Haruki Murakami")

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,  -- Lowercase for fuzzy matching
  role TEXT DEFAULT 'author' CHECK(role IN ('author', 'illustrator', 'translator', 'editor')),

  -- Cultural diversity support (Issue #197)
  native_name TEXT,               -- Original script (e.g., 村上春樹)
  romanized_name TEXT,            -- Romanization (e.g., Murakami Haruki)

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Unique constraint: Same name + role combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_name_role
  ON authors(normalized_name, role);

-- Index for native name lookups
CREATE INDEX IF NOT EXISTS idx_authors_native_name
  ON authors(native_name)
  WHERE native_name IS NOT NULL;
