-- Migration: Add recommendations table
-- Applied: 2025-11-25 19:54:23

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL UNIQUE,           -- ISO week (e.g., '2025-W47')
  book_isbns TEXT NOT NULL,               -- Comma-separated list of ISBNs analyzed
  recommendations_json TEXT NOT NULL,     -- JSON array of recommendation objects
  generated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,            -- Unix timestamp for cache expiration
  model_used TEXT DEFAULT 'gemini-2.0-flash-exp'
);

-- Recommendations table indexes
CREATE INDEX idx_recommendations_week ON recommendations(week_of);
CREATE INDEX idx_recommendations_expires ON recommendations(expires_at);
