-- Migration: Add performance indexes
-- Applied: 2025-11-25 19:54:22

-- Books table performance indexes
CREATE INDEX idx_books_author
  ON books(author COLLATE NOCASE);

CREATE INDEX idx_books_author_title
  ON books(author COLLATE NOCASE, title COLLATE NOCASE);

CREATE INDEX idx_books_publication_year
  ON books(publication_date DESC);

-- User library performance indexes
CREATE INDEX idx_user_library_status_date
  ON user_library(user_id, status, added_at DESC);

CREATE INDEX idx_user_library_completed_rating
  ON user_library(user_id, completed_at DESC, rating DESC)
  WHERE status = 'completed' AND rating IS NOT NULL;

CREATE INDEX idx_user_library_started
  ON user_library(user_id, started_at DESC)
  WHERE started_at IS NOT NULL;

-- Books vectorization index
CREATE INDEX idx_books_vectorized ON books(vectorized_at);
