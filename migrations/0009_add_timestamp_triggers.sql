-- Migration 0009: Add Timestamp Triggers
-- Sprint 3: Database Triggers (Day 7, Issue #42)
-- Purpose: Auto-update updated_at on row modifications
-- Created: 2025-11-25

-- ============================================================================
-- Add updated_at columns to tables that don't have them
-- ============================================================================

-- Add updated_at to authors table
ALTER TABLE authors ADD COLUMN updated_at INTEGER DEFAULT (unixepoch());

-- Add updated_at to user_library table (if not already present)
ALTER TABLE user_library ADD COLUMN updated_at INTEGER DEFAULT (unixepoch());

-- ============================================================================
-- Create triggers for automatic timestamp updates
-- ============================================================================

-- Trigger for books table: Auto-update updated_at on any UPDATE
-- Fires AFTER UPDATE to capture modified data before trigger fires
CREATE TRIGGER IF NOT EXISTS trg_books_updated_at
AFTER UPDATE ON books
FOR EACH ROW
BEGIN
  UPDATE books SET updated_at = unixepoch() WHERE isbn = NEW.isbn;
END;

-- Trigger for authors table: Auto-update updated_at on any UPDATE
-- Fires AFTER UPDATE to capture modified data before trigger fires
CREATE TRIGGER IF NOT EXISTS trg_authors_updated_at
AFTER UPDATE ON authors
FOR EACH ROW
BEGIN
  UPDATE authors SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Trigger for user_library table: Auto-update updated_at on any UPDATE
-- Fires AFTER UPDATE to capture modified data before trigger fires
CREATE TRIGGER IF NOT EXISTS trg_user_library_updated_at
AFTER UPDATE ON user_library
FOR EACH ROW
BEGIN
  UPDATE user_library SET updated_at = unixepoch() WHERE id = NEW.id;
END;
