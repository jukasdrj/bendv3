-- Migration 0006: Allow NULL status in user_library
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23
-- Issue: #4 - Allow NULL status in user_library for 'shelved' books
-- Priority: MEDIUM - Affects user experience

-- ========================================================================
-- Background
-- ========================================================================
-- The current CHECK constraint doesn't allow NULL values for status:
--   status TEXT CHECK(status IN ('to_read', 'reading', 'completed', 'dnf'))
--
-- This prevents users from adding books to their library without immediately
-- assigning a reading status (e.g., "shelved" or "owned but not planned").
--
-- The TypeScript interface (src/types/database.ts:67) already allows NULL:
--   status: 'to_read' | 'reading' | 'completed' | 'dnf' | null
--
-- This migration aligns the database schema with the TypeScript interface.

-- ========================================================================
-- Solution: Recreate table with NULL-friendly CHECK constraint
-- ========================================================================
-- SQLite doesn't support ALTER TABLE MODIFY COLUMN, so we need to:
-- 1. Create new table with corrected constraint
-- 2. Copy data from old table
-- 3. Drop old table
-- 4. Rename new table
-- 5. Recreate indexes

-- ========================================================================
-- Note: D1 automatically wraps migrations in transactions
-- Do NOT use BEGIN TRANSACTION explicitly (causes error in D1)
-- ========================================================================

-- Step 1: Create new table with NULL-friendly constraint
CREATE TABLE IF NOT EXISTS user_library_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,

  -- Allow NULL status for "shelved" books (no reading status assigned)
  status TEXT CHECK(status IS NULL OR status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),

  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  notes TEXT,
  private INTEGER DEFAULT 1,

  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE
);

-- Step 2: Copy existing data (temporarily disable FK checks for safety)
PRAGMA foreign_keys = OFF;
INSERT INTO user_library_new (id, user_id, isbn, status, rating, added_at, started_at, completed_at, notes, private)
SELECT id, user_id, isbn, status, rating, added_at, started_at, completed_at, notes, private
FROM user_library;
PRAGMA foreign_keys = ON;

-- Step 3: Drop old table
DROP TABLE user_library;

-- Step 4: Rename new table
ALTER TABLE user_library_new RENAME TO user_library;

-- Step 5: Reset AUTOINCREMENT sequence to prevent ID conflicts
DELETE FROM sqlite_sequence WHERE name='user_library';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'user_library', COALESCE(MAX(id), 0) FROM user_library;

-- Step 6: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_user_library_user_id
  ON user_library(user_id);

CREATE INDEX IF NOT EXISTS idx_user_library_status
  ON user_library(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_library_rating
  ON user_library(user_id, rating)
  WHERE rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_library_added_at
  ON user_library(user_id, added_at);

CREATE INDEX IF NOT EXISTS idx_user_library_complex_query
  ON user_library(user_id, rating, added_at)
  WHERE rating >= 4;

-- Step 7: Recreate unique constraint from migration 0005 (DEPENDENCY: Requires 0005)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_library_user_isbn_unique
  ON user_library(user_id, isbn);

-- D1 automatically commits the transaction

-- ========================================================================
-- Verification
-- ========================================================================
-- After applying this migration, these should work:

-- Add a book without status (shelved/owned but not planned)
-- INSERT INTO user_library (user_id, isbn, status) VALUES ('user123', '9780439708180', NULL);

-- Add a book with status (traditional workflow)
-- INSERT INTO user_library (user_id, isbn, status) VALUES ('user123', '9781234567890', 'to_read');

-- Query shelved books (no status assigned)
-- SELECT * FROM user_library WHERE user_id = 'user123' AND status IS NULL;

-- Query books with specific status
-- SELECT * FROM user_library WHERE user_id = 'user123' AND status = 'reading';
