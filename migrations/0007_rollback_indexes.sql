-- Migration 0007 Rollback: Remove Performance Indexes
-- Sprint 3: D1 Optimization (Issues #23, #24)
-- Created: 2025-11-25
-- Purpose: Rollback indexes if performance degrades

-- ============================================================================
-- Remove Books Table Indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_books_author;
DROP INDEX IF EXISTS idx_books_author_title;
DROP INDEX IF EXISTS idx_books_publication_year;

-- ============================================================================
-- Remove User Library Table Indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_user_library_status_date;
DROP INDEX IF EXISTS idx_user_library_completed_rating;
DROP INDEX IF EXISTS idx_user_library_started;

-- ============================================================================
-- Note: Author column is NOT removed
-- ============================================================================
-- The 'author' column added to books table is intentionally kept.
-- Removing a column in SQLite requires recreating the table, which is
-- expensive and risky. The column can remain unused if not needed.

-- ============================================================================
-- Re-analyze Tables
-- ============================================================================

ANALYZE books;
ANALYZE user_library;
