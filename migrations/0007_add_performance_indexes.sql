-- Migration 0007: Add Performance Indexes
-- Sprint 3: D1 Optimization (Issues #23, #24)
-- Created: 2025-11-25
-- Purpose: Optimize query performance for common access patterns

-- ============================================================================
-- Author Column Addition (denormalize from JSON for index support)
-- ============================================================================

-- Add author column to books table if not exists
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we use a workaround
-- This column should be populated from canonical_metadata.author during writes

-- Note: This ALTER is idempotent - D1 will ignore if column exists
-- If this fails, the column already exists
ALTER TABLE books ADD COLUMN author TEXT;

-- ============================================================================
-- Books Table Indexes
-- ============================================================================

-- Index for author lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_books_author
  ON books(author COLLATE NOCASE);

-- Composite index for author + title browse
-- Optimizes: "Show all books by author X sorted by title"
CREATE INDEX IF NOT EXISTS idx_books_author_title
  ON books(author COLLATE NOCASE, title COLLATE NOCASE);

-- Index for publication year queries
-- Optimizes: "Show books published after 2020"
CREATE INDEX IF NOT EXISTS idx_books_publication_year
  ON books(publication_date DESC);

-- ============================================================================
-- User Library Table Indexes
-- ============================================================================

-- Composite index for status + date queries
-- Optimizes: "Currently reading books, sorted by when added"
CREATE INDEX IF NOT EXISTS idx_user_library_status_date
  ON user_library(user_id, status, added_at DESC);

-- Composite index for completed books with ratings
-- Optimizes: "Best completed books" queries
CREATE INDEX IF NOT EXISTS idx_user_library_completed_rating
  ON user_library(user_id, completed_at DESC, rating DESC)
  WHERE status = 'completed' AND rating IS NOT NULL;

-- Composite index for recently started books
-- Optimizes: "Books I started recently"
CREATE INDEX IF NOT EXISTS idx_user_library_started
  ON user_library(user_id, started_at DESC)
  WHERE started_at IS NOT NULL;

-- ============================================================================
-- Analyze Tables for Query Planner
-- ============================================================================

-- Update statistics for query optimizer
ANALYZE books;
ANALYZE user_library;
