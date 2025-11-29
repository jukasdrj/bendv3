-- Migration: Create user_library table
-- Applied: 2025-11-23 19:31:36

CREATE TABLE "user_library" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,

  -- Reading status and rating
  status TEXT CHECK(status IS NULL OR status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),

  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  notes TEXT,
  private INTEGER DEFAULT 1,

  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE
);
