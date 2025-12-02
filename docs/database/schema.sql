-- BooksTrack D1 Database Schema
-- Production database: bookstrack-library
-- Database ID: cc19e622-9d0d-45f6-991c-1ab1933f257c

-- ============================================================================
-- User Library Table
-- Stores books added to each user's personal library
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_library (
  user_id TEXT NOT NULL,                      -- User ID from JWT (sub claim)
  isbn TEXT NOT NULL,                          -- 13-digit ISBN
  status TEXT NOT NULL                         -- Reading status
    CHECK (status IN ('to-read', 'reading', 'read')),
  rating INTEGER                               -- User rating (1-5 stars, nullable)
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes TEXT,                                  -- User notes (max 1000 chars via API validation)
  added_at TEXT NOT NULL,                      -- ISO 8601 timestamp when added
  updated_at TEXT NOT NULL,                    -- ISO 8601 timestamp of last update
  PRIMARY KEY (user_id, isbn)                  -- Composite primary key
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_user_library_user_id
  ON user_library(user_id);

CREATE INDEX IF NOT EXISTS idx_user_library_status
  ON user_library(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_library_updated
  ON user_library(updated_at DESC);

-- ============================================================================
-- Example Queries
-- ============================================================================

-- Get all books for a user
-- SELECT * FROM user_library WHERE user_id = ? ORDER BY updated_at DESC;

-- Get books by status
-- SELECT * FROM user_library WHERE user_id = ? AND status = 'reading';

-- Check if book exists in library
-- SELECT isbn FROM user_library WHERE user_id = ? AND isbn = ?;

-- Add book to library
-- INSERT INTO user_library (user_id, isbn, status, rating, notes, added_at, updated_at)
-- VALUES (?, ?, ?, ?, ?, ?, ?);

-- Update book status
-- UPDATE user_library SET status = ?, updated_at = ? WHERE user_id = ? AND isbn = ?;

-- Remove book from library
-- DELETE FROM user_library WHERE user_id = ? AND isbn = ?;

-- ============================================================================
-- Migration Notes
-- ============================================================================

-- This schema is currently used by:
-- - POST /v3/library (add book to library)
-- - GET /v3/library (list user library) - TODO
-- - DELETE /v3/library/:isbn (remove book) - TODO

-- Future enhancements:
-- - Add user_id foreign key constraint when user table is created
-- - Add full-text search on notes column
-- - Add tags/collections support
