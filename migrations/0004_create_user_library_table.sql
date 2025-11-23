-- Migration 0004: Create User Library Table (Future-Ready)
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23
-- Purpose: Support personal book collections and complex queries

CREATE TABLE IF NOT EXISTS user_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,

  status TEXT CHECK(status IS NULL OR status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),

  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  notes TEXT,
  private INTEGER DEFAULT 1,  -- SQLite uses INTEGER for boolean (1=true, 0=false)

  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE
);

-- Indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_user_library_user_id
  ON user_library(user_id);

CREATE INDEX IF NOT EXISTS idx_user_library_status
  ON user_library(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_library_rating
  ON user_library(user_id, rating)
  WHERE rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_library_added_at
  ON user_library(user_id, added_at);

-- Composite index for "All 5-star books added in 2024" type queries
CREATE INDEX IF NOT EXISTS idx_user_library_complex_query
  ON user_library(user_id, rating, added_at)
  WHERE rating >= 4;
