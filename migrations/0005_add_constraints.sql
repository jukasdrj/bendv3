-- Migration 0005: Add Missing Constraints (Grok-4 Code Review)
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23
-- Priority: MEDIUM - Data integrity and performance improvements

-- ========================================================================
-- 1. Add unique constraint for user_library (prevent duplicate books)
-- ========================================================================
-- Issue: Users can add the same book multiple times to their library
-- Severity: MEDIUM
-- Code Review: Grok-4 (Nov 23, 2025)

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_library_user_isbn_unique
ON user_library(user_id, isbn);

-- ========================================================================
-- 2. Add index on books.language for multilingual filtering
-- ========================================================================
-- Issue: No index for language-filtered queries (important for cultural diversity)
-- Severity: MEDIUM
-- Code Review: Grok-4 (Nov 23, 2025)
-- Related: Issue #197 (cultural diversity support)

CREATE INDEX IF NOT EXISTS idx_books_language ON books(language);

-- ========================================================================
-- Notes for Future Migrations (LOW priority - Issues #1-#4)
-- ========================================================================
-- Issue #1: Add auto-update triggers for timestamp fields
-- Issue #2: Add JSON validation CHECK constraints (requires SQLite 3.45+)
-- Issue #3: Add feature flag progression documentation
-- Issue #4: Consider allowing NULL status in user_library
