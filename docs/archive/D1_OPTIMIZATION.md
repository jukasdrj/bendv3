# D1 Query Optimization Guide

**Version:** 1.0 | **Created:** November 25, 2025 | **Sprint:** 3 Phase 1

## Overview

This document outlines the D1 database optimization strategy for BooksTrack, including query analysis, index strategy, and performance benchmarks.

## Current Schema

### Books Table
```sql
CREATE TABLE books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  publication_date TEXT,
  language TEXT,
  page_count INTEGER,
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,
  canonical_metadata TEXT NOT NULL,
  provider_metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### User Library Table
```sql
CREATE TABLE user_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,
  status TEXT CHECK(status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  notes TEXT,
  private INTEGER DEFAULT 1,
  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE
);
```

## Access Patterns Analysis

### High-Frequency Queries

| Query Type | Frequency | Current Index | Target Latency |
|------------|-----------|---------------|----------------|
| ISBN lookup | Very High | PRIMARY KEY | < 10ms |
| Author search | High | None (JSON) | < 100ms |
| Title search | High | idx_books_title | < 100ms |
| User's reading list | High | idx_user_library_status | < 50ms |
| User's top rated | Medium | idx_user_library_rating | < 50ms |
| Recent additions | Medium | idx_user_library_added_at | < 50ms |
| Publication year filter | Low | idx_books_publication_date | < 100ms |

### Bottleneck Analysis

1. **Author Search** - Currently requires JSON parsing of `canonical_metadata`
2. **Combined Filters** - User queries with status + rating need composite indexes
3. **Full-Text Search** - Title searches use `LIKE '%term%'` which can't use indexes

## Index Strategy

### Existing Indexes (Migration 0001-0004)
```sql
-- Books table
CREATE INDEX idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX idx_books_publication_date ON books(publication_date);
CREATE INDEX idx_books_created_at ON books(created_at);

-- User library table
CREATE INDEX idx_user_library_user_id ON user_library(user_id);
CREATE INDEX idx_user_library_status ON user_library(user_id, status);
CREATE INDEX idx_user_library_rating ON user_library(user_id, rating) WHERE rating IS NOT NULL;
CREATE INDEX idx_user_library_added_at ON user_library(user_id, added_at);
CREATE INDEX idx_user_library_complex_query ON user_library(user_id, rating, added_at) WHERE rating >= 4;
```

### New Indexes (Migration 0007)

```sql
-- Author column for direct lookups (extracted from JSON)
-- Note: Requires schema update to add 'author' column to books table
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author COLLATE NOCASE);

-- Composite index for author + title browse
CREATE INDEX IF NOT EXISTS idx_books_author_title ON books(author COLLATE NOCASE, title COLLATE NOCASE);

-- User library: status + added_at for "currently reading, recently added"
CREATE INDEX IF NOT EXISTS idx_user_library_status_date ON user_library(user_id, status, added_at DESC);

-- User library: rating + completed for "best completed books"
CREATE INDEX IF NOT EXISTS idx_user_library_completed_rating ON user_library(user_id, completed_at DESC, rating DESC)
  WHERE status = 'completed' AND rating IS NOT NULL;
```

## Performance Benchmarks

### Baseline (Before Optimization)
| Query | P50 | P95 | P99 |
|-------|-----|-----|-----|
| ISBN lookup | 8ms | 15ms | 25ms |
| Author search (JSON) | 150ms | 320ms | 500ms |
| User reading list | 45ms | 85ms | 120ms |
| Title search | 60ms | 110ms | 180ms |

### Target (After Optimization)
| Query | P50 | P95 | P99 | Improvement |
|-------|-----|-----|-----|-------------|
| ISBN lookup | 5ms | 10ms | 15ms | 40% |
| Author search | 30ms | 60ms | 100ms | 80% |
| User reading list | 15ms | 30ms | 50ms | 65% |
| Title search | 25ms | 50ms | 80ms | 55% |

## Query Optimization Patterns

### 1. Use Covering Indexes
```sql
-- Bad: Requires table lookup after index scan
SELECT * FROM user_library WHERE user_id = ? AND status = 'reading';

-- Better: Include commonly needed columns in index
CREATE INDEX idx_covering ON user_library(user_id, status) INCLUDE (isbn, added_at);
```

### 2. Avoid JSON Parsing in WHERE Clause
```sql
-- Bad: Can't use index, requires full scan
SELECT * FROM books WHERE json_extract(canonical_metadata, '$.author') = ?;

-- Better: Use denormalized column
SELECT * FROM books WHERE author = ?;
```

### 3. Paginate with LIMIT/OFFSET
```sql
-- Use cursor-based pagination for better performance
SELECT * FROM books
WHERE created_at < ?  -- cursor from previous page
ORDER BY created_at DESC
LIMIT 20;
```

## Rollback Plan

If performance degrades after applying indexes:

```sql
-- migrations/0007_rollback_indexes.sql
DROP INDEX IF EXISTS idx_books_author;
DROP INDEX IF EXISTS idx_books_author_title;
DROP INDEX IF EXISTS idx_user_library_status_date;
DROP INDEX IF EXISTS idx_user_library_completed_rating;
```

## Monitoring

### Key Metrics to Track
1. **Query latency** - P50, P95, P99 via Analytics Engine
2. **Index usage** - `EXPLAIN QUERY PLAN` verification
3. **Table scan frequency** - Monitor via Cloudflare Dashboard
4. **Write amplification** - Index maintenance overhead

### Cloudflare Dashboard Queries
```sql
-- Enable query logging (add to wrangler.jsonc when available)
-- Currently use console.time/timeEnd for benchmarks
```

## Implementation Timeline

1. **Day 1** (Issue #23): Analysis and planning (this document)
2. **Day 2** (Issue #24): Apply indexes, run benchmarks, validate

## Related Issues
- Issue #23: D1 Query Analysis & Index Planning
- Issue #24: D1 Index Implementation & Benchmarking
- Issue #30: Sprint 3 Performance Validation

---
**Last Updated:** November 25, 2025
