-- Migration: Add constraints and indexes
-- Applied: 2025-11-23 19:31:36

-- Books table indexes
CREATE INDEX idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX idx_books_publication_date ON books(publication_date);
CREATE INDEX idx_books_created_at ON books(created_at);

-- Authors table indexes
CREATE UNIQUE INDEX idx_authors_name_role
  ON authors(normalized_name, role);

CREATE INDEX idx_authors_native_name
  ON authors(native_name)
  WHERE native_name IS NOT NULL;

-- Book-Authors junction table indexes
CREATE INDEX idx_book_authors_author_id
  ON book_authors(author_id);

CREATE INDEX idx_book_authors_order
  ON book_authors(isbn, author_order);

-- Books language index
CREATE INDEX idx_books_language ON books(language);

-- User library indexes
CREATE INDEX idx_user_library_user_id
  ON user_library(user_id);

CREATE INDEX idx_user_library_status
  ON user_library(user_id, status);

CREATE INDEX idx_user_library_rating
  ON user_library(user_id, rating)
  WHERE rating IS NOT NULL;

CREATE INDEX idx_user_library_added_at
  ON user_library(user_id, added_at);

CREATE INDEX idx_user_library_complex_query
  ON user_library(user_id, rating, added_at)
  WHERE rating >= 4;

CREATE UNIQUE INDEX idx_user_library_user_isbn_unique
  ON user_library(user_id, isbn);
