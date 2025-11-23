-- Migration 0003: Create Book-Authors Junction Table
-- Sprint 2: KV to D1 Migration
-- Created: 2025-11-23
-- Purpose: Many-to-many relationship between books and authors

CREATE TABLE IF NOT EXISTS book_authors (
  isbn TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  author_order INTEGER DEFAULT 0,  -- For multi-author books (first author = 0)

  PRIMARY KEY (isbn, author_id),
  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

-- Index for querying all books by an author
CREATE INDEX IF NOT EXISTS idx_book_authors_author_id
  ON book_authors(author_id);

-- Index for maintaining author order within a book
CREATE INDEX IF NOT EXISTS idx_book_authors_order
  ON book_authors(isbn, author_order);
