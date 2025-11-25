-- Rollback Migration 0009: Remove Timestamp Triggers
-- Sprint 3: Database Triggers (Day 7, Issue #42)
-- Purpose: Safely rollback trigger creation without data loss
-- Created: 2025-11-25

-- Drop all triggers added by migration 0009
DROP TRIGGER IF EXISTS trg_books_updated_at;
DROP TRIGGER IF EXISTS trg_authors_updated_at;
DROP TRIGGER IF EXISTS trg_user_library_updated_at;

-- Note: Cannot remove columns in SQLite without full table recreation
-- The updated_at columns added to authors and user_library are left in place
-- (safe, no data loss, triggers simply stop firing)
