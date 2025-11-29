-- Migration: Add import_jobs_audit table
-- Applied: Inferred from remote schema (not in d1_migrations)

CREATE TABLE import_jobs_audit (
  job_id TEXT PRIMARY KEY,
  user_id TEXT,
  job_type TEXT NOT NULL,                 -- 'csv_import', 'batch_enrichment', 'ai_scan'
  status TEXT NOT NULL,                   -- 'initialized', 'processing', 'completed', 'failed', 'canceled'
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  successful_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  metadata TEXT                           -- JSON blob for job-specific data
);

-- Import jobs audit indexes
CREATE INDEX idx_import_jobs_status ON import_jobs_audit(status);
CREATE INDEX idx_import_jobs_created ON import_jobs_audit(created_at);
