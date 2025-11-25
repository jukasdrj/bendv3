-- Migration 0008: Add Recommendations Support
-- Sprint 3: Semantic Search & Weekly Recommendations
-- Created: 2025-11-25

-- Add vectorized_at column to books (tracks when embedding was generated)
ALTER TABLE books ADD COLUMN vectorized_at INTEGER;

-- Index for finding books that need vectorization
CREATE INDEX IF NOT EXISTS idx_books_vectorized ON books(vectorized_at);

-- Recommendations table (cron-generated weekly picks)
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL UNIQUE,           -- ISO date of Monday: "2026-01-06"
  book_isbns TEXT NOT NULL,               -- JSON array of ISBNs
  recommendations_json TEXT NOT NULL,     -- Full data: [{isbn, title, author, reason}, ...]
  generated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,            -- Unix timestamp when to refresh
  model_used TEXT DEFAULT 'gemini-2.0-flash-exp'
);

-- Index for looking up current week's recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_week ON recommendations(week_of);

-- Index for finding expired recommendations (cron cleanup)
CREATE INDEX IF NOT EXISTS idx_recommendations_expires ON recommendations(expires_at);

-- Import jobs audit log (optional - supplements Durable Object state)
CREATE TABLE IF NOT EXISTS import_jobs_audit (
  job_id TEXT PRIMARY KEY,
  user_id TEXT,
  job_type TEXT NOT NULL,                 -- 'csv_import', 'batch_enrichment', 'ai_scan'
  status TEXT NOT NULL,                   -- 'queued', 'processing', 'complete', 'failed'
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  successful_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  metadata TEXT                           -- JSON for additional job-specific data
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs_audit(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs_audit(created_at);
