-- Migration: Add user reading preferences table
-- Created: 2026-01-09
-- Purpose: Store user preferences for personalized book recommendations

CREATE TABLE user_reading_preferences (
  user_id TEXT PRIMARY KEY,

  -- Subject preferences (stored as JSON arrays)
  preferred_subjects TEXT,         -- JSON: ["fantasy", "magic", "romance"]
  excluded_subjects TEXT,          -- JSON: ["horror", "erotica"]

  -- Author preferences
  preferred_authors TEXT,          -- JSON: ["Brandon Sanderson", "N.K. Jemisin"]
  excluded_authors TEXT,           -- JSON: []

  -- Reading mood/style
  mood TEXT CHECK(mood IS NULL OR mood IN ('light', 'dark', 'epic', 'cozy', 'thrilling')),

  -- Book constraints
  page_count_min INTEGER,
  page_count_max INTEGER,
  publication_year_min INTEGER,
  publication_year_max INTEGER,

  -- Metadata
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for quick lookups by user
CREATE INDEX idx_preferences_user ON user_reading_preferences(user_id);

-- Index for updated_at (cache invalidation)
CREATE INDEX idx_preferences_updated ON user_reading_preferences(updated_at);
