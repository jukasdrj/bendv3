-- Migration: Create book_authors junction table
-- Applied: 2025-11-23 19:31:35

CREATE TABLE book_authors (
  isbn TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  author_order INTEGER DEFAULT 0,  -- For co-authored books (0 = primary author)

  PRIMARY KEY (isbn, author_id),
  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);
