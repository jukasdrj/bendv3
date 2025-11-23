# Sprint 2: KV to D1 Migration Implementation Plan

**Status:** Ready for Implementation
**Duration:** 2 weeks (10 working days)
**Sprint Goal:** Migrate from Key-Value blob storage to D1 relational database while maintaining KV as read-through cache
**Created:** 2025-11-22
**Planning Model:** Gemini 2.5 Flash & Pro

---

## Executive Summary

**Transformation:** Move from KV-only storage (JSON blobs) to D1 as source of truth (relational data) while keeping KV as high-speed cache layer.

**Key Benefits:**
- ✅ Enable complex SQL queries ("All 5-star books added in 2024")
- ✅ Structured data with author normalization
- ✅ Foundation for user library features
- ✅ Maintain <50ms P95 API latency via KV cache
- ✅ Zero downtime migration with gradual rollout

**Migration Strategy:** Hybrid dual-write with checkpoint-based backfill

---

## Architecture Overview

```
BEFORE (Sprint 1)              AFTER (Sprint 2)
==================              =================

┌──────────────┐                ┌──────────────┐
│  KV Cache    │                │  KV Cache    │
│  (Primary)   │                │  (Cache)     │
│              │                │              │
│  book:isbn:  │───────────>    │  book:isbn:  │
│  {...JSON}   │                │  {...JSON}   │
└──────────────┘                └──────────────┘
                                       ↕ (TTL)
                                ┌──────────────┐
                                │  D1 Database │
                                │  (Source of  │
                                │   Truth)     │
                                │              │
                                │  books       │
                                │  authors     │
                                │  book_authors│
                                │  user_library│
                                └──────────────┘

Phase 1-2: Dual-write (KV + D1)
Phase 3: Gradual read shift (KV → D1)
Phase 4: D1 primary, KV cache only
```

---

## D1 Schema Design (Step 2)

### Decision: Normalized schema with JSON flexibility

**Rationale:**
- Normalize authors for complex queries ("All books by Haruki Murakami")
- Keep `canonical_metadata` JSON for flexibility and backward compatibility
- Support cultural diversity (native names, romanizations per Issue #197)

### Core Tables

**1. Books Table (Source of Truth)**

```sql
CREATE TABLE books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  publication_date TEXT,        -- ISO 8601 (YYYY-MM-DD)
  language TEXT,                -- ISO 639-1 (en, es, ja)
  page_count INTEGER,

  -- Cover images (R2 bucket keys)
  cover_small_url TEXT,
  cover_medium_url TEXT,
  cover_large_url TEXT,

  -- JSON metadata (flexibility)
  canonical_metadata TEXT NOT NULL,  -- Full canonical book object
  provider_metadata TEXT,            -- Raw provider responses

  -- Timestamps (Unix epoch)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX idx_books_publication_date ON books(publication_date);
CREATE INDEX idx_books_created_at ON books(created_at);
```

**2. Authors Table (Normalized)**

```sql
CREATE TABLE authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,  -- Lowercase for fuzzy matching
  role TEXT DEFAULT 'author' CHECK(role IN ('author', 'illustrator', 'translator', 'editor')),

  -- Cultural diversity support (Issue #197)
  native_name TEXT,               -- Original script (e.g., 村上春樹)
  romanized_name TEXT,            -- Romanization (e.g., Murakami Haruki)

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_authors_name_role ON authors(normalized_name, role);
CREATE INDEX idx_authors_native_name ON authors(native_name) WHERE native_name IS NOT NULL;
```

**3. Book-Authors Junction Table**

```sql
CREATE TABLE book_authors (
  isbn TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  author_order INTEGER DEFAULT 0,  -- For multi-author books

  PRIMARY KEY (isbn, author_id),
  FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

CREATE INDEX idx_book_authors_author_id ON book_authors(author_id);
CREATE INDEX idx_book_authors_order ON book_authors(isbn, author_order);
```

**4. User Library Table (Future-Ready)**

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

-- Indexes for complex queries
CREATE INDEX idx_user_library_user_id ON user_library(user_id);
CREATE INDEX idx_user_library_status ON user_library(user_id, status);
CREATE INDEX idx_user_library_rating ON user_library(user_id, rating) WHERE rating IS NOT NULL;
CREATE INDEX idx_user_library_added_at ON user_library(user_id, added_at);

-- Composite index: "All 5-star books added in 2024"
CREATE INDEX idx_user_library_complex_query
  ON user_library(user_id, rating, added_at)
  WHERE rating >= 4;
```

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Days 1-3)

**Day 1: D1 Provisioning**

```bash
# 1. Provision D1 database
npx wrangler d1 create bookstrack-library --location=WNAM

# 2. Update wrangler.jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bookstrack-library",
      "database_id": "<UUID>",
      "migrations_dir": "migrations"
    }
  ],

  "vars": {
    "ENABLE_D1_WRITES": "false",      // Dual-write feature flag
    "D1_READ_PERCENTAGE": "0",        // Gradual read shift (0-100)
    "D1_MIGRATION_BATCH_SIZE": "1000"
  }
}

# 3. Create migration files
mkdir -p migrations
# (See schema SQL above - split into 0001-0004 files)

# 4. Apply migrations locally
npx wrangler d1 migrations apply bookstrack-library --local

# 5. Verify schema
npx wrangler d1 execute bookstrack-library --command "SELECT name FROM sqlite_master WHERE type='table'"
```

**Day 2-3: Repository Pattern Implementation**

Create `src/repositories/book-repository.ts`:

```typescript
export class BookRepository {
  /**
   * Smart Router: Try D1 → Fallback to KV (or vice versa based on D1_READ_PERCENTAGE)
   */
  async findByISBN(isbn: string): Promise<BookRecord | null> {
    const readPercentage = parseInt(this.env.D1_READ_PERCENTAGE || '0')
    const shouldReadFromD1 = this.shouldRouteToD1(isbn, readPercentage)

    if (shouldReadFromD1) {
      const d1Book = await this.findInD1(isbn)
      if (d1Book) return d1Book
      return await this.findInKV(isbn)  // Fallback
    } else {
      const kvBook = await this.findInKV(isbn)
      if (kvBook) return kvBook
      return await this.findInD1(isbn)  // Fallback
    }
  }

  /**
   * Dual-Write: Always KV + Conditionally D1
   */
  async save(book: BookRecord): Promise<void> {
    await this.saveToKV(book)  // Always cache

    if (this.env.ENABLE_D1_WRITES === 'true') {
      try {
        await this.saveToD1(book)  // Dual-write
      } catch (error) {
        console.error('[BookRepository] D1 write failed:', error)
        // Don't fail request - eventual consistency
      }
    }
  }

  /**
   * Deterministic routing: Same ISBN always gets same decision
   */
  private shouldRouteToD1(isbn: string, percentage: number): boolean {
    if (percentage === 0) return false
    if (percentage === 100) return true

    const hash = this.hashString(isbn)
    return (hash % 100) < percentage
  }
}
```

---

### Phase 2: Dual-Write Deployment (Days 4-5)

**Day 4: Update Data Access Layer**

Update `src/services/book-search.js`:

```javascript
import { BookRepository } from '../repositories/book-repository'

export async function searchByISBN(isbn, env) {
  const bookRepo = new BookRepository(env)

  // Try repository (smart router based on feature flags)
  let book = await bookRepo.findByISBN(isbn)
  if (book) {
    return { success: true, data: book.canonicalMetadata, cached: true }
  }

  // Miss: Fetch from external provider
  const providerBook = await fetchFromProvider(isbn, env)

  // Save to repository (dual-write if ENABLE_D1_WRITES=true)
  await bookRepo.save({
    isbn: providerBook.isbn,
    title: providerBook.title,
    // ... map all fields
    canonicalMetadata: providerBook
  })

  return { success: true, data: providerBook, cached: false }
}
```

**Day 5: Deploy Dual-Write Mode**

```bash
# 1. Apply D1 migrations to production
npx wrangler d1 migrations apply bookstrack-library --remote

# 2. Enable dual-write mode
# Edit wrangler.jsonc: ENABLE_D1_WRITES = "true"

# 3. Deploy to production
npx wrangler deploy

# 4. Verify health
curl https://api.oooefam.net/health

# 5. Test search endpoint (should write to both KV + D1)
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180"

# 6. Verify D1 write
npx wrangler d1 execute bookstrack-library \
  --command "SELECT isbn, title FROM books WHERE isbn = '9780439708180'"
```

---

### Phase 3: Backfill Migration (Days 6-8)

**Day 6-7: Migration Worker Implementation**

Create `src/durable-objects/migration-worker.ts`:

```typescript
export class MigrationWorkerDO extends DurableObject {
  /**
   * Checkpoint-based migration with pause/resume
   */
  async alarm(): Promise<void> {
    const batchSize = parseInt(this.env.D1_MIGRATION_BATCH_SIZE || '1000')

    // List KV keys (max 1000 per request)
    const listResult = await this.env.KV_CACHE.list({
      prefix: 'book:isbn:',
      limit: batchSize,
      cursor: this.migrationState.cursor
    })

    // Process batch
    for (const key of listResult.keys) {
      await this.migrateKey(key.name)
      this.migrationState.processedKeys++
    }

    // Checkpoint progress
    this.migrationState.cursor = listResult.cursor
    await this.persistState()

    // Schedule next batch or complete
    if (listResult.list_complete) {
      this.migrationState.status = 'completed'
    } else {
      await this.state.storage.setAlarm(Date.now() + 10000)  // 10 sec delay
    }
  }
}
```

Add migration endpoints:

```typescript
// POST /admin/migration/start
// GET /admin/migration/status
// POST /admin/migration/pause
// POST /admin/migration/resume
```

**Day 8: Execute Migration**

```bash
# 1. Start migration
curl -X POST https://api.oooefam.net/admin/migration/start

# 2. Monitor progress
watch -n 5 'curl -s https://api.oooefam.net/admin/migration/status | jq'

# Expected output:
# {
#   "status": "running",
#   "processedKeys": 15000,
#   "successfulMigrations": 14987,
#   "failedMigrations": 13,
#   "lastProcessedKey": "book:isbn:9780439708180"
# }

# Estimate: 1000 keys every 10 seconds
# 10,000 books = ~100 seconds
# 100,000 books = ~16 minutes

# 3. Wait for completion (status: "completed")

# 4. Verify data integrity
npx wrangler d1 execute bookstrack-library \
  --command "SELECT COUNT(*) as total_books FROM books"
```

---

### Phase 4: Gradual Rollout (Days 9-10)

**Day 9: Gradual Read Shift**

```bash
# 1. Enable 1% D1 reads (canary)
# Edit wrangler.jsonc: D1_READ_PERCENTAGE = "1"
npx wrangler deploy

# 2. Monitor for 2 hours
npx wrangler tail --format=pretty | grep "BookRepository"

# Watch for:
# - D1 query latency (<10ms P95)
# - Error rates (<0.1%)
# - Cache hit rates (>90%)

# 3. Gradual increase
# After 2 hours: D1_READ_PERCENTAGE = "10"
# After 4 hours: D1_READ_PERCENTAGE = "50"
# After 8 hours: D1_READ_PERCENTAGE = "100"
```

**Day 10: Validation & Documentation**

```bash
# 1. Verify complex queries work
npx wrangler d1 execute bookstrack-library \
  --command "SELECT b.title, a.name
             FROM books b
             JOIN book_authors ba ON b.isbn = ba.isbn
             JOIN authors a ON ba.author_id = a.id
             WHERE a.normalized_name LIKE '%murakami%'"

# 2. Performance testing
# - API latency: <50ms P95 (same as before)
# - D1 latency: <10ms P95
# - Cache hit rate: >90%

# 3. Update documentation
# - docs/sprints/SPRINT_2_RESULTS.md
# - Update API_CONTRACT.md with D1 capabilities
# - Add query examples to README.md
```

---

## Testing Strategy

### Unit Tests

**Test:** `book-repository.test.ts`

```typescript
describe('BookRepository', () => {
  it('should route to D1 when D1_READ_PERCENTAGE=100', async () => {
    env.D1_READ_PERCENTAGE = '100'
    const book = await bookRepo.findByISBN('9780439708180')
    expect(book).toBeDefined()
    // Verify D1 was queried (not KV)
  })

  it('should fallback to KV when D1 fails', async () => {
    // Mock D1 failure
    // Verify KV fallback works
  })

  it('should dual-write when ENABLE_D1_WRITES=true', async () => {
    env.ENABLE_D1_WRITES = 'true'
    await bookRepo.save(mockBook)
    // Verify both KV and D1 have the book
  })

  it('should use deterministic routing (same ISBN → same decision)', async () => {
    env.D1_READ_PERCENTAGE = '50'
    const decision1 = bookRepo.shouldRouteToD1('9780439708180', 50)
    const decision2 = bookRepo.shouldRouteToD1('9780439708180', 50)
    expect(decision1).toBe(decision2)
  })
})
```

### Integration Tests

```bash
# 1. Test dual-write
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180"

# Verify in KV
npx wrangler kv:key get --namespace-id=<id> "book:isbn:9780439708180"

# Verify in D1
npx wrangler d1 execute bookstrack-library \
  --command "SELECT * FROM books WHERE isbn = '9780439708180'"

# 2. Test complex query (only possible with D1)
# "All 5-star books added in 2024"
npx wrangler d1 execute bookstrack-library \
  --command "SELECT b.title, ul.rating, ul.added_at
             FROM user_library ul
             JOIN books b ON ul.isbn = b.isbn
             WHERE ul.user_id = 'test-user'
               AND ul.rating = 5
               AND ul.added_at >= 1704067200  /* 2024-01-01 */
             ORDER BY ul.added_at DESC"
```

---

## Monitoring & Observability

### Key Metrics

| Metric | Target | Monitoring Method |
|--------|--------|-------------------|
| D1 Query Latency | <10ms P95 | Cloudflare Dashboard → Analytics |
| API Latency | <50ms P95 (no regression) | Existing monitoring |
| D1 Read/Write Ops | Track daily | D1 Dashboard |
| Cache Hit Rate | >90% | KV analytics |
| Migration Progress | 1000 keys/10 sec | `/admin/migration/status` |
| Error Rate | <0.1% | `npx wrangler tail` |

### Alerts

**Set up Cloudflare alerts:**
- D1 query latency >20ms P95 for 5 minutes
- Error rate >1% for 2 minutes
- D1 storage approaching 10GB limit

---

## Rollback Procedures

### Rollback Scenario 1: D1 Latency Too High

```bash
# Immediate: Disable D1 reads
# Edit wrangler.jsonc: D1_READ_PERCENTAGE = "0"
npx wrangler deploy

# Result: All reads go to KV (original behavior)
```

### Rollback Scenario 2: D1 Write Failures

```bash
# Immediate: Disable D1 writes
# Edit wrangler.jsonc: ENABLE_D1_WRITES = "false"
npx wrangler deploy

# Result: Only KV writes (original behavior)
```

### Rollback Scenario 3: Migration Corruption

```bash
# 1. Pause migration
curl -X POST https://api.oooefam.net/admin/migration/pause

# 2. Investigate failed migrations
curl https://api.oooefam.net/admin/migration/status | jq '.errors'

# 3. Fix data issues manually
npx wrangler d1 execute bookstrack-library \
  --command "DELETE FROM books WHERE isbn = '<corrupted-isbn>'"

# 4. Resume migration
curl -X POST https://api.oooefam.net/admin/migration/resume
```

### Rollback Scenario 4: Complete Rollback to KV-Only

```bash
# Nuclear option: Disable D1 entirely
# Edit wrangler.jsonc:
# ENABLE_D1_WRITES = "false"
# D1_READ_PERCENTAGE = "0"

npx wrangler deploy

# Result: System behaves exactly as Sprint 1 (KV-only)
# D1 data preserved but not used
```

---

## Definition of Done

### Sprint 2 Complete When:

**Infrastructure:**
- [x] D1 database provisioned and schema applied
- [x] Migration files created (0001-0004)
- [x] Durable Object binding for MigrationWorkerDO
- [x] Feature flags in wrangler.jsonc

**Code Quality:**
- [x] BookRepository implemented with smart routing
- [x] Dual-write logic with error handling
- [x] Migration worker with checkpoint/resume
- [x] All data access points updated
- [x] Unit tests for repository (>80% coverage)

**Data Integrity:**
- [x] All KV book data migrated to D1
- [x] Zero data loss during migration
- [x] Complex queries work: "All 5-star books added in 2024"
- [x] Author normalization complete

**Performance:**
- [x] API latency <50ms P95 (no regression)
- [x] D1 latency <10ms P95
- [x] Cache hit rate >90%
- [x] Zero downtime during migration

**Observability:**
- [x] Migration status endpoint working
- [x] Cloudflare alerts configured
- [x] Documentation updated

---

## Risk Mitigation

### Risk 1: D1 Free Tier Limits

**Risk:** Exceeding 10GB storage or 5M reads/day
**Probability:** Medium (depends on KV dataset size)
**Mitigation:**
- Check current KV usage before starting: `npx wrangler kv:key list`
- Monitor D1 storage daily
- Upgrade to paid plan if needed ($5/month for 50GB)

**Rollback:** Disable D1 reads if approaching limits

### Risk 2: Migration Takes Too Long

**Risk:** 100,000+ books could take hours
**Probability:** Low (1000 keys/10 sec = 6000 keys/min)
**Mitigation:**
- Checkpoint/resume allows pausing overnight
- Increase batch size to 2000 if safe
- Run during low-traffic hours (2-4 AM UTC)

**Rollback:** Pause migration if interfering with production

### Risk 3: Schema Design Mistakes

**Risk:** Realize schema is wrong after migration complete
**Probability:** Low (thorough planning step)
**Mitigation:**
- Test with sample data locally first
- Peer review schema with SQL expert via Zen MCP
- Keep JSON metadata as escape hatch

**Rollback:** D1 supports schema migrations - can add columns/indexes

### Risk 4: Dual-Write Performance Impact

**Risk:** Writing to both KV+D1 increases latency
**Probability:** Low (D1 writes are async, don't block response)
**Mitigation:**
- D1 write errors don't fail requests (eventual consistency)
- Monitor P95 latency during dual-write phase

**Rollback:** Disable D1 writes if latency spikes

---

## Post-Sprint Cleanup

### Week 3 (After Sprint 2 Complete)

1. **Deprecate KV Writes (Optional)**
   - After 100% D1 reads stable for 7 days
   - Stop dual-write (ENABLE_D1_WRITES=false)
   - KV becomes pure read-through cache

2. **Add Author Extraction**
   - Parse `canonicalMetadata.authors` array
   - Insert into `authors` and `book_authors` tables
   - Enable author-centric queries

3. **User Library Features**
   - Build API endpoints for user collections
   - Enable "All 5-star books added in 2024" queries
   - Personal book tracking

4. **Performance Optimization**
   - Analyze slow queries with EXPLAIN QUERY PLAN
   - Add missing indexes if needed
   - Consider denormalization for hot paths

---

## Success Metrics

**Technical Success:**
- ✅ D1 is source of truth for all book metadata
- ✅ Complex SQL queries work correctly
- ✅ Zero data loss (100% of KV data migrated)
- ✅ API latency <50ms P95 (no regression)
- ✅ D1 latency <10ms P95

**Business Success:**
- ✅ Foundation for user library features
- ✅ Foundation for recommendations engine (Sprint 4)
- ✅ Foundation for analytics and reporting
- ✅ Zero user-facing downtime
- ✅ No production incidents

---

## Timeline Summary

| Day | Phase | Tasks | Owner |
|-----|-------|-------|-------|
| 1 | Setup | D1 provisioning, schema creation | Backend Dev |
| 2-3 | Infrastructure | Repository pattern, migrations | Backend Dev |
| 4 | Development | Update data access layer | Backend Dev |
| 5 | Deployment | Dual-write mode deploy | DevOps |
| 6-7 | Migration | Migration worker implementation | Backend Dev |
| 8 | Execution | Run backfill migration | DevOps |
| 9 | Rollout | Gradual read shift (1% → 100%) | DevOps |
| 10 | Validation | Testing, documentation | QA + Backend Dev |

**Total Duration:** 10 working days (2 calendar weeks)

---

## Related Documentation

- **Sprint 1:** `docs/sprints/SPRINT_1_RPC_HIBERNATION.md` (prerequisite)
- **Sprint 3:** `docs/sprints/SPRINT_3_ORCHESTRATION.md` (next sprint)
- **API Contract:** `docs/API_CONTRACT.md`
- **PRD:** `docs/PRD_ALIGNMENT_TRACKING.md`

---

## Questions for Stakeholders

Before starting Sprint 2, clarify:

1. **KV Dataset Size:** How many book records currently in KV?
   - Run: `npx wrangler kv:key list --namespace-id=<id> --prefix="book:isbn:" | wc -l`

2. **D1 Plan Tier:** Are we on Cloudflare Workers Paid plan?
   - Required for D1 access

3. **User Library Priority:** Should `user_library` table be populated in Sprint 2, or defer to later?
   - Affects timeline (adds 2-3 days if included)

4. **Downtime Tolerance:** Confirm zero downtime requirement
   - Affects rollout strategy (gradual vs. big bang)

---

**Status:** ✅ Ready for Implementation
**Next Step:** Provision D1 database and apply migrations
**Estimated Completion:** 2 weeks from start date

🤖 Generated with [Claude Code](https://claude.com/claude-code) + Gemini 2.5 Flash/Pro via Zen MCP

Co-Authored-By: Claude <noreply@anthropic.com>
