# BooksTrack D1 Migrations

**Sprint 2: KV to D1 Migration**

This directory contains SQL migrations for the BooksTrack D1 database schema.

## Migration Order

### Fresh Deployments (Nov 25, 2025 onwards)
Apply migrations in numerical order (skip 0006):

1. **0001_create_books_table.sql** - Core books table with metadata
2. **0002_create_authors_table.sql** - Authors with cultural diversity support
3. **0003_create_book_authors_junction.sql** - Many-to-many relationship
4. **0004_create_user_library_table.sql** - User reading lists (includes NULL status)
5. **0005_add_constraints.sql** - Unique indexes and performance improvements
6. ~~**0006_allow_null_status.sql**~~ - **SKIP** (0004 already includes fix)
7. **0007_add_performance_indexes.sql** - Additional query optimization indexes
8. **0008_add_recommendations.sql** - Recommendations table and indexes
9. **0009_add_timestamp_triggers.sql** - Auto-update timestamps on row modifications

### Existing Deployments (Need to Fix Old 0004)
Apply migrations in this order:

1. **0001_create_books_table.sql** - Already applied
2. **0002_create_authors_table.sql** - Already applied
3. **0003_create_book_authors_junction.sql** - Already applied
4. **0004_create_user_library_table.sql** - Already applied (old constraint)
5. **0005_add_constraints.sql** - **Apply first** (0006 depends on this)
6. **0006_allow_null_status.sql** - **Apply to fix NULL status constraint**

## Applying Migrations

### Development (Local D1)
```bash
# Apply all migrations
for file in migrations/*.sql; do
  npx wrangler d1 execute bookstrack-db --local --file="$file"
done

# Apply single migration
npx wrangler d1 execute bookstrack-db --local --file=migrations/0001_create_books_table.sql
```

### Production
```bash
# Apply all migrations
for file in migrations/*.sql; do
  npx wrangler d1 execute bookstrack-db --file="$file"
done

# Apply single migration
npx wrangler d1 execute bookstrack-db --file=migrations/0001_create_books_table.sql
```

## Migration Details

### 0001: Books Table
- Primary key: `isbn` (TEXT)
- Metadata: `canonical_metadata` (JSON), `provider_metadata` (JSON)
- Cover images: R2 bucket keys or external URLs
- Timestamps: Unix epoch (seconds)

### 0002: Authors Table
- Cultural diversity support (Issue #197)
- Native names, romanized names
- Author roles: author, illustrator, translator, editor

### 0003: Book-Authors Junction
- Many-to-many relationship
- Author ordering support for multi-author books

### 0004: User Library Table
- Reading statuses: `to_read`, `reading`, `completed`, `dnf`, **NULL (shelved)**
- Ratings: 1-5 stars
- Private/public toggle
- Notes support

**Issue #4 Resolution:**
- `status` allows NULL values for "shelved" books (no reading status assigned)
- Users can add books without immediately setting a status
- TypeScript interface already supported this (line 67 in `src/types/database.ts`)

### 0005: Constraints & Indexes
- Unique constraint: `(user_id, isbn)` - Prevent duplicate books in library
- Language index: Support multilingual filtering
- Performance indexes for complex queries

### 0006: Allow NULL Status (Conditional - Read Carefully)

**When to apply:**
- ✅ **REQUIRED** if you deployed 0004 with the old constraint (before Nov 23, 2025)
- ❌ **SKIP** if deploying fresh (0004 already includes NULL-friendly constraint)

**Dependencies:**
- **MUST apply migration 0005 FIRST** (0006 depends on unique index from 0005)
- Correct order: 0004 → 0005 → 0006

**What it does:**
- Recreates `user_library` table with NULL-friendly CHECK constraint
- Preserves all existing data (wrapped in transaction)
- Resets AUTOINCREMENT sequence to prevent ID conflicts
- Recreates all indexes from 0004 + 0005

**Safety features:**
- Wrapped in `BEGIN TRANSACTION` / `COMMIT` (all-or-nothing)
- Foreign key checks temporarily disabled during data copy
- AUTOINCREMENT sequence properly reset after table recreation

### 0009: Timestamp Triggers

**Purpose:** Auto-update `updated_at` columns on row modifications (Issue #42)

**Tables Affected:**
- `books` - Added trigger `trg_books_updated_at`
- `authors` - Added `updated_at` column + trigger `trg_authors_updated_at`
- `user_library` - Added `updated_at` column + trigger `trg_user_library_updated_at`

**What it does:**
- Adds `updated_at` column to `authors` table (books already has it)
- Adds `updated_at` column to `user_library` table
- Creates AFTER UPDATE triggers that automatically set `updated_at = unixepoch()` on modifications
- Timestamp defaults to current Unix epoch on INSERT

**Design:**
- Triggers fire AFTER UPDATE (not on INSERT, created_at handles inserts)
- Uses `unixepoch()` for consistency with existing timestamp columns
- Removes need for manual timestamp management in application code

**Benefits:**
- Automatic timestamp updates reduce bugs from forgot-to-update errors
- Consistent across all tables (single source of truth: database)
- Simpler repository code (no need to manually set updated_at)

**Example:**
```sql
-- Before: Manual update required in application
UPDATE books SET updated_at = unixepoch() WHERE isbn = ?

-- After: Trigger handles it automatically
UPDATE books SET title = ? WHERE isbn = ?  -- updated_at auto-set by trg_books_updated_at
```

**Verification:**
```bash
# List all triggers
npx wrangler d1 execute bookstrack-db --command "SELECT name FROM sqlite_master WHERE type='trigger'"

# Verify trigger fires
npx wrangler d1 execute bookstrack-db --command "SELECT updated_at FROM books WHERE isbn = '9780439708180' LIMIT 1"
```

**Rollback:**
```bash
npx wrangler d1 execute bookstrack-db --file=migrations/0009_rollback_triggers.sql
```

**Note:** Rollback drops triggers but leaves columns in place (safe, no data loss)

## Design Decisions

### Status: NULL vs 'shelved'
**Decision:** Allow NULL status (Issue #4)

**Rationale:**
- Simpler API (no need to add 'shelved' to status enum)
- TypeScript interface already supported NULL
- NULL semantically means "no status assigned yet"
- Queries remain simple: `WHERE status IS NULL` vs `WHERE status = 'shelved'`
- Backward compatible with existing code

**Use Cases:**
- **NULL:** User adds book to library without planning to read it yet
- **'to_read':** User explicitly plans to read the book
- **'reading':** User is currently reading
- **'completed':** User finished reading
- **'dnf':** User did not finish (abandoned)

**Example Queries:**
```sql
-- Get all shelved books (no status)
SELECT * FROM user_library WHERE user_id = ? AND status IS NULL;

-- Get reading list (excluding shelved)
SELECT * FROM user_library WHERE user_id = ? AND status IS NOT NULL;

-- Get specific status
SELECT * FROM user_library WHERE user_id = ? AND status = 'reading';
```

## Verification

### Check Applied Migrations
```bash
# List all tables
npx wrangler d1 execute bookstrack-db --command "SELECT name FROM sqlite_master WHERE type='table'"

# Check user_library schema
npx wrangler d1 execute bookstrack-db --command "PRAGMA table_info(user_library)"

# Verify NULL status works
npx wrangler d1 execute bookstrack-db --command "INSERT INTO user_library (user_id, isbn, status) VALUES ('test', '9780439708180', NULL); SELECT * FROM user_library WHERE user_id = 'test';"
```

### Test Queries
```bash
# Count books by status (including NULL)
npx wrangler d1 execute bookstrack-db --command "SELECT status, COUNT(*) as count FROM user_library WHERE user_id = 'test' GROUP BY status"

# Get shelved books
npx wrangler d1 execute bookstrack-db --command "SELECT * FROM user_library WHERE user_id = 'test' AND status IS NULL"
```

## Rollback

D1 doesn't support automatic rollbacks. To rollback:

1. **Drop affected tables:**
   ```bash
   npx wrangler d1 execute bookstrack-db --command "DROP TABLE IF EXISTS user_library"
   ```

2. **Reapply previous migration:**
   ```bash
   npx wrangler d1 execute bookstrack-db --file=migrations/0004_create_user_library_table.sql
   ```

3. **Restore data from backup** (if applicable)

**Recommendation:** Test migrations locally first with `--local` flag.

## Related Documentation

- **Sprint 2 Plan:** `docs/sprints/SPRINT_2_KV_TO_D1_MIGRATION.md`
- **Schema Types:** `src/types/database.ts`
- **BookRepository:** `src/repositories/book-repository.ts`
- **Issue #4:** https://github.com/jukasdrj/bendv3/issues/4

---

**Last Updated:** November 23, 2025
**Maintained By:** AI Team (Claude Code, cf-code-reviewer, Grok-4)
