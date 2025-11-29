# D1 Database Migration Guide

**Last Updated:** November 29, 2025
**BooksTrack Backend Version:** 2.3+
**D1 Database:** `bookstrack-library` (ID: `cc19e622-9d0d-45f6-991c-1ab1933f257c`)

---

## Overview

This guide documents the D1 database schema, migration process, and troubleshooting for the BooksTrack backend. The D1 database is used for:

- **Books metadata** (ISBN, title, author, covers, etc.)
- **Authors** (normalized names, internationalization)
- **User libraries** (reading status, ratings, notes)
- **Recommendations** (weekly AI-generated suggestions)
- **Import job auditing** (CSV imports, batch enrichment)

---

## Database Architecture

### Tables

```
bookstrack-library/
├── books                  - Book metadata with covers
├── authors                - Author names and roles
├── book_authors           - Many-to-many junction table
├── user_library           - User book collections
├── recommendations        - Weekly AI recommendations
└── import_jobs_audit      - Job tracking and metrics
```

### Key Relationships

```
books (1) ←→ (N) book_authors (N) ←→ (1) authors
books (1) ←→ (N) user_library
```

---

## Migration Files

All migration files are stored in `migrations/` and numbered sequentially:

```
migrations/
├── 0001_create_books_table.sql
├── 0002_create_authors_table.sql
├── 0003_create_book_authors_table.sql
├── 0004_create_user_library_table.sql
├── 0005_add_constraints.sql
├── 0006_allow_null_status.sql
├── 0007_rollback_indexes.sql
├── 0007_add_performance_indexes.sql
├── 0008_add_recommendations.sql
├── 0009_add_import_jobs_audit.sql
└── seed_popular_authors.sql
```

**Important:** Migrations 0006 and 0007_rollback are historical no-ops for new databases. They exist for compatibility with production schema evolution.

---

## Local Development Setup

### First-Time Setup

```bash
# 1. Apply all migrations to local database
npx wrangler d1 execute bookstrack-library --file=migrations/0001_create_books_table.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0002_create_authors_table.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0003_create_book_authors_table.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0004_create_user_library_table.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0005_add_constraints.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0007_add_performance_indexes.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0008_add_recommendations.sql
npx wrangler d1 execute bookstrack-library --file=migrations/0009_add_import_jobs_audit.sql

# 2. Seed popular authors (25 curated authors for cron harvest)
npx wrangler d1 execute bookstrack-library --file=migrations/seed_popular_authors.sql

# 3. Verify setup
npx wrangler d1 execute bookstrack-library --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npx wrangler d1 execute bookstrack-library --command "SELECT COUNT(*) as total FROM authors;"
```

**Expected Output:**
- 8 tables (including `sqlite_sequence`, excluding `_cf_METADATA`)
- 25 authors in `authors` table

### Quick Reset (Development Only)

```bash
# WARNING: This deletes ALL local data!
rm -rf .wrangler/state/v3/d1
npx wrangler dev  # Recreates empty database
# Re-run first-time setup steps above
```

---

## Production Deployment

### Applying New Migrations

```bash
# 1. Test migration locally first
npx wrangler d1 execute bookstrack-library --file=migrations/XXXX_new_migration.sql

# 2. Verify no errors
npx wrangler d1 execute bookstrack-library --command "SELECT * FROM new_table LIMIT 1;"

# 3. Apply to production (REQUIRES APPROVAL)
npx wrangler d1 execute bookstrack-library --remote --file=migrations/XXXX_new_migration.sql

# 4. Verify production
npx wrangler d1 execute bookstrack-library --remote --command "SELECT COUNT(*) FROM new_table;"
```

**Safety Checklist:**
- [ ] Migration tested locally
- [ ] Backup plan documented (rollback SQL)
- [ ] Downtime window communicated (if needed)
- [ ] Production verification query prepared

---

## Schema Details

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

  -- Cover URLs
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,

  -- Metadata JSON
  canonical_metadata TEXT NOT NULL,  -- ResponseEnvelope format
  provider_metadata TEXT,            -- Raw provider data

  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Denormalized fields
  author TEXT,                       -- Primary author for simple queries
  vectorized_at INTEGER              -- AI embedding timestamp
);
```

**Indexes:**
- `idx_books_title` - Case-insensitive title search
- `idx_books_author` - Author name search
- `idx_books_author_title` - Combined author + title search
- `idx_books_publication_date` - Chronological sorting
- `idx_books_language` - Language filtering
- `idx_books_vectorized` - AI recommendation queries

### Authors Table

```sql
CREATE TABLE authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,  -- Lowercase, no diacritics
  role TEXT DEFAULT 'author' CHECK(role IN ('author', 'illustrator', 'translator', 'editor')),

  -- Internationalization
  native_name TEXT,               -- Native script (e.g., 村上春樹)
  romanized_name TEXT,            -- Romanized version

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Indexes:**
- `idx_authors_name_role` - UNIQUE constraint on (normalized_name, role)
- `idx_authors_native_name` - Partial index for non-null native names

### User Library Table

```sql
CREATE TABLE user_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,

  status TEXT CHECK(status IS NULL OR status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),

  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,

  notes TEXT,
  private INTEGER DEFAULT 1,

  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_user_library_user_isbn_unique` - UNIQUE constraint on (user_id, isbn)
- `idx_user_library_status_date` - User library by status and date
- `idx_user_library_completed_rating` - High-rated completed books

---

## Troubleshooting

### Issue: "D1 database is empty"

**Symptoms:**
- `wrangler d1 execute` shows only `_cf_METADATA` table
- Author discovery returns 0 results
- Cron harvest falls back to hardcoded ISBNs

**Solution:**
```bash
# Check if you're using local vs remote database
npx wrangler d1 execute bookstrack-library --command "SELECT name FROM sqlite_master WHERE type='table';"
# Local database (default)

npx wrangler d1 execute bookstrack-library --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
# Remote/production database

# If local is empty, run first-time setup (see above)
```

### Issue: "Migrations applied but tables still missing"

**Symptoms:**
- Migration commands succeed but tables don't appear
- `sqlite_master` shows no tables

**Solution:**
```bash
# Check database location
ls -la .wrangler/state/v3/d1/

# Verify database ID matches wrangler.jsonc
npx wrangler d1 list

# Reset and re-apply migrations
rm -rf .wrangler/state/v3/d1
# Re-run first-time setup
```

### Issue: "Local and remote databases out of sync"

**Symptoms:**
- Remote has 613 authors, local has 25
- Different table counts between environments

**Solution:**
```bash
# This is EXPECTED behavior!
# - Local: Fresh database with only seeded data
# - Remote: Production database with real user data

# To sync production data to local (CAUTION):
# 1. Export from production
npx wrangler d1 export bookstrack-library --remote --output=backup.sql

# 2. Import to local
npx wrangler d1 execute bookstrack-library --file=backup.sql

# 3. Verify
npx wrangler d1 execute bookstrack-library --command "SELECT COUNT(*) FROM authors;"
```

---

## Maintenance

### Checking Migration Status

```bash
# Remote database
npx wrangler d1 execute bookstrack-library --remote --command "SELECT * FROM d1_migrations ORDER BY id;"

# Local database (no d1_migrations table - manually tracked)
npx wrangler d1 execute bookstrack-library --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### Adding New Authors

```sql
-- Use INSERT OR IGNORE to prevent duplicates
INSERT OR IGNORE INTO authors (name, normalized_name, role)
VALUES ('New Author', 'new author', 'author');
```

### Querying Popular Authors

```sql
-- Get top 25 popular authors (by name match with popular-authors.js)
SELECT name FROM authors
WHERE normalized_name IN (
  'colleen hoover', 'taylor jenkins reid', 'brandon sanderson',
  'sarah j. maas', 'stephen king', 'freida mcfadden', 'riley sager'
  -- ... (full list in seed_popular_authors.sql)
)
ORDER BY name;
```

---

## References

- **Issue #145:** Fix D1 Migration - Initialize books table and populate author data
- **Issue #143:** Scale to 25 Authors (parent issue)
- **Wrangler Docs:** https://developers.cloudflare.com/d1/
- **Schema Source:** Remote production database (exported Nov 29, 2025)
- **Popular Authors:** `src/config/popular-authors.js`

---

**Last Verified:** November 29, 2025
**Next Review:** After Issue #143 completion
