# Sprint 3: Optimization & Observability

**Duration:** 10 days (Nov 24 - Dec 3, 2025)
**Theme:** Production hardening, monitoring, and performance optimization
**Prerequisites:** Sprint 2 Complete (D1 migration operational)

---

## 🎯 Sprint Goals

1. **Production Monitoring** - Comprehensive observability and alerting
2. **Performance Optimization** - Cache improvements and metadata harvesting
3. **Technical Debt** - Resolve outstanding P3 issues from Sprint 2
4. **Data Quality** - Automated triggers and validation

---

## 📊 Current State Assessment

### **Completed (Sprint 2):**
- ✅ D1 database migration (KV → D1 primary)
- ✅ Dual-write mode operational
- ✅ BookRepository with feature flag routing
- ✅ Migration 0006 production-safe (transaction wrapper)
- ✅ Issue #4 resolved (NULL status support)

### **Outstanding Technical Debt (6 issues):**
- #1: Auto-update triggers for timestamp fields (P3 - LOW)
- #2: JSON validation for D1 metadata fields (P3 - LOW)
- #3: Feature flag progression documentation (P3 - LOW)
- #5: Metadata harvesting in scheduled-harvest (P3 - LOW)
- #6: Hono async promise chain error (P3 - LOW)
- #7: Backfill historical KV data to D1 (OPTIONAL)

### **TODOs in Codebase:**
- `src/services/author-discovery.js:162` - User library authors query
- `src/services/unified-cache.js:115` - Background refresh logic
- `src/handlers/scheduled-alerts.js:66` - Email alerts implementation
- `src/handlers/scheduled-harvest.js:244` - CloudKit ISBN collection

---

## 🗓️ Sprint 3 Phases

### **Phase 1: Production Observability (Days 1-3)**

**Objective:** Comprehensive monitoring dashboard and alerting system

#### **Day 1: Metrics Collection**
- [ ] Create `/metrics` endpoint (Prometheus format)
- [ ] Track D1 read/write latency
- [ ] Track KV cache hit/miss rates
- [ ] Track external API quota usage (Google Books, ISBNdb, Gemini)
- [ ] Track WebSocket connection count and disconnects

**Deliverable:** Prometheus metrics endpoint returning:
```
# HELP bookstrack_d1_read_duration_ms D1 read operation duration
# TYPE bookstrack_d1_read_duration_ms histogram
bookstrack_d1_read_duration_ms_bucket{le="10"} 45
bookstrack_d1_read_duration_ms_bucket{le="50"} 89
...

# HELP bookstrack_kv_cache_hit_rate KV cache hit rate percentage
# TYPE bookstrack_kv_cache_hit_rate gauge
bookstrack_kv_cache_hit_rate 0.87
```

#### **Day 2: Monitoring Dashboard**
- [ ] Create `/admin/dashboard` endpoint (HTML + Charts.js)
- [ ] Real-time metrics visualization
- [ ] 24-hour trend graphs (latency, error rate, cache hits)
- [ ] WebSocket connection health
- [ ] External API quota gauges

**Deliverable:** Admin dashboard at `/admin/dashboard` with:
- D1 performance graphs
- Cache efficiency metrics
- API quota usage (Google Books: 1000/day, ISBNdb: 5000/day)
- Error rate trends

#### **Day 3: Alerting System**
- [ ] Complete email alert implementation (`scheduled-alerts.js:66`)
- [ ] Alert on D1 latency > 100ms (P95)
- [ ] Alert on error rate > 5%
- [ ] Alert on cache hit rate < 75%
- [ ] Alert on API quota > 90%

**Deliverable:** Automated alerting via email for production issues

**Resolves:**
- ✅ Issue #6 investigation (Hono async error) - Monitor and alert if recurring

---

### **Phase 2: Performance Optimization (Days 4-6)**

**Objective:** Improve cache efficiency and reduce external API calls

#### **Day 4: Metadata Harvesting Enhancement**
- [ ] Implement Issue #5: Add metadata to `scheduled-harvest.js`
- [ ] Fetch book metadata (not just covers) from ISBNdb
- [ ] Dual-write harvested books to KV + D1
- [ ] Rate limiting: 10 req/sec (respect ISBNdb limits)
- [ ] Harvest job statistics logging

**Before:**
```javascript
// scheduled-harvest.js (current)
async function harvestCovers(isbns) {
  // Only fetches cover images
  for (const isbn of isbns) {
    const cover = await isbndb.getCover(isbn)
    await env.BOOK_CACHE.put(`cover:${isbn}`, cover)
  }
}
```

**After:**
```javascript
// scheduled-harvest.js (enhanced)
async function harvestBooksWithMetadata(isbns, env) {
  const rateLimiter = new RateLimiter(10) // 10 req/sec

  for (const isbn of isbns) {
    await rateLimiter.wait()

    try {
      // Triggers dual-write (KV + D1) via BookRepository
      await findBookByISBN(isbn, env)
      console.log(`✅ Harvested metadata for ${isbn}`)
    } catch (error) {
      console.error(`❌ Failed to harvest ${isbn}:`, error)
    }
  }
}
```

**Deliverable:** Enhanced scheduled-harvest with metadata caching

**Resolves:**
- ✅ Issue #5: Metadata harvesting to D1

#### **Day 5: Background Cache Refresh**
- [ ] Implement `unified-cache.js:115` background refresh
- [ ] Stale-while-revalidate pattern for popular books
- [ ] Refresh cache 1 hour before expiration
- [ ] Track refresh success/failure rates

**Deliverable:** Proactive cache warming for popular books

#### **Day 6: Historical Data Backfill (Optional)**
- [ ] Implement Issue #7: KV → D1 backfill migration
- [ ] Create `MigrationWorkerDO` Durable Object
- [ ] Admin endpoints: `/admin/migration/start|status|pause`
- [ ] Checkpoint-based migration (1000 keys per batch)
- [ ] Progress tracking and error handling

**Deliverable:** Admin-controlled backfill tool (optional, non-blocking)

**Resolves:**
- ✅ Issue #7: Historical KV backfill (if time permits)

---

### **Phase 3: Data Quality & Schema Enhancements (Days 7-8)**

**Objective:** Automated data integrity and validation

#### **Day 7: Database Triggers**
- [ ] Implement Issue #1: Auto-update triggers
- [ ] Create `migrations/0007_add_timestamp_triggers.sql`
- [ ] Trigger for `books.updated_at` on UPDATE
- [ ] Add `updated_at` to `authors` and `user_library`
- [ ] Test triggers with UPDATE statements

**Migration 0007:**
```sql
-- Auto-update books.updated_at
CREATE TRIGGER IF NOT EXISTS trigger_books_updated_at
AFTER UPDATE ON books
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE books SET updated_at = unixepoch() WHERE isbn = NEW.isbn;
END;

-- Add updated_at to authors
ALTER TABLE authors ADD COLUMN updated_at INTEGER;
UPDATE authors SET updated_at = created_at WHERE updated_at IS NULL;

-- Add updated_at to user_library
ALTER TABLE user_library ADD COLUMN updated_at INTEGER;
UPDATE user_library SET updated_at = added_at WHERE updated_at IS NULL;
```

**Deliverable:** Migration 0007 with automated timestamp updates

**Resolves:**
- ✅ Issue #1: Auto-update triggers

#### **Day 8: JSON Validation**
- [ ] Implement Issue #2: JSON validation CHECK constraints
- [ ] Verify Cloudflare D1 SQLite version supports `json_valid()`
- [ ] Create `migrations/0008_add_json_validation.sql`
- [ ] Test with invalid JSON to verify rejection

**Migration 0008:**
```sql
-- Verify SQLite version supports json_valid()
SELECT sqlite_version(); -- Requires 3.45+

-- Recreate books table with JSON validation
-- (Similar pattern to migration 0006)
BEGIN TRANSACTION;

CREATE TABLE books_new (
  isbn TEXT PRIMARY KEY,
  -- ... other fields ...
  canonical_metadata TEXT NOT NULL CHECK (json_valid(canonical_metadata)),
  provider_metadata TEXT CHECK (provider_metadata IS NULL OR json_valid(provider_metadata)),
  -- ... timestamps ...
);

-- Copy data, drop old, rename
INSERT INTO books_new SELECT * FROM books;
DROP TABLE books;
ALTER TABLE books_new RENAME TO books;

COMMIT;
```

**Deliverable:** Migration 0008 with JSON validation

**Resolves:**
- ✅ Issue #2: JSON validation

---

### **Phase 4: Documentation & Polish (Days 9-10)**

**Objective:** Complete documentation and feature flag clarity

#### **Day 9: Feature Flag Documentation**
- [ ] Implement Issue #3: Document D1 feature flag progression
- [ ] Add comments to `wrangler.jsonc`
- [ ] Update `docs/DEPLOYMENT.md` with rollout phases
- [ ] Document rollback procedures

**wrangler.jsonc (enhanced):**
```jsonc
{
  "//": "D1 Migration Feature Flags - Progression Guide:",
  "//": "  Phase 1 (Testing): ENABLE_D1_WRITES='false', D1_READ_PERCENTAGE='0'",
  "//": "  Phase 2 (Dual-Write): ENABLE_D1_WRITES='true', D1_READ_PERCENTAGE='0'",
  "//": "  Phase 3 (Canary): ENABLE_D1_WRITES='true', D1_READ_PERCENTAGE='1'",
  "//": "  Phase 4 (Ramp-up): D1_READ_PERCENTAGE='10' → '25' → '50' → '75'",
  "//": "  Phase 5 (Complete): D1_READ_PERCENTAGE='100' (KV becomes fallback)",
  "//": "  Rollback: Decrease D1_READ_PERCENTAGE or set to '0'",

  "vars": {
    "ENABLE_D1_WRITES": "true",       // Currently: Phase 5 (D1-primary mode)
    "D1_READ_PERCENTAGE": "100",      // 100% of reads from D1
    "D1_MIGRATION_BATCH_SIZE": "1000" // Keys per checkpoint (backfill)
  }
}
```

**Deliverable:** Clear feature flag progression guide

**Resolves:**
- ✅ Issue #3: Feature flag documentation

#### **Day 10: Sprint Review & Cleanup**
- [ ] Close all resolved issues (#1, #2, #3, #5, #7)
- [ ] Update CLAUDE.md with Sprint 3 completion
- [ ] Create Sprint 3 retrospective document
- [ ] Archive Sprint 3 plan to `docs/sprints/archive/`
- [ ] Plan Sprint 4 themes (if needed)

---

## 🎯 Success Criteria

### **Must Have (P0):**
- ✅ Metrics endpoint operational (`/metrics`)
- ✅ Monitoring dashboard accessible (`/admin/dashboard`)
- ✅ Automated alerting configured
- ✅ Metadata harvesting dual-writes to D1
- ✅ Migration 0007 applied (timestamp triggers)

### **Should Have (P1):**
- ✅ Background cache refresh implemented
- ✅ Migration 0008 applied (JSON validation)
- ✅ Feature flag documentation complete
- ✅ All P3 issues closed

### **Nice to Have (P2):**
- ⚠️ Historical KV backfill tool (Issue #7)
- ⚠️ Email alerting fully configured
- ⚠️ User library authors query implemented

---

## 📈 Expected Outcomes

### **Performance Improvements:**
- **D1 read hit rate:** 95%+ (up from ~85%)
- **Cache efficiency:** 90%+ hit rate (proactive warming)
- **External API calls:** -30% (better harvesting)
- **P95 latency:** < 100ms (D1 reads)

### **Operational Improvements:**
- **MTTR (Mean Time to Recovery):** < 5 minutes (automated alerts)
- **Visibility:** Real-time metrics dashboard
- **Data integrity:** Automated timestamp updates
- **Schema safety:** JSON validation prevents corrupt data

### **Technical Debt:**
- **6 P3 issues resolved** (down to 0-1 open issues)
- **3 TODOs resolved** (codebase cleanup)
- **Documentation complete** (feature flags, deployment)

---

## 🚧 Risks & Mitigations

### **Risk 1: SQLite Version Compatibility (Issue #2)**
**Risk:** D1 may not support `json_valid()` (requires SQLite 3.45+)
**Mitigation:** Verify version first, skip JSON validation if unsupported
**Fallback:** Document as "Future Enhancement" if D1 SQLite < 3.45

### **Risk 2: Backfill Performance (Issue #7)**
**Risk:** Backfilling large KV datasets may timeout or fail
**Mitigation:** Checkpoint-based migration with resume capability
**Fallback:** Mark as "Optional" if time constraints

### **Risk 3: Hono Async Error Recurrence (Issue #6)**
**Risk:** Async error may reappear after code changes
**Mitigation:** Add monitoring/alerting to track error rate
**Fallback:** Investigate deeper if error rate > 5%

---

## 📋 Sprint 3 Checklist

### **Week 1: Observability (Days 1-3)**
- [ ] Day 1: Metrics endpoint (`/metrics`)
- [ ] Day 2: Monitoring dashboard (`/admin/dashboard`)
- [ ] Day 3: Email alerting system

### **Week 2: Optimization (Days 4-6)**
- [ ] Day 4: Metadata harvesting (Issue #5)
- [ ] Day 5: Background cache refresh
- [ ] Day 6: Historical backfill (Issue #7, optional)

### **Week 3: Data Quality (Days 7-8)**
- [ ] Day 7: Timestamp triggers (Issue #1)
- [ ] Day 8: JSON validation (Issue #2)

### **Week 4: Documentation (Days 9-10)**
- [ ] Day 9: Feature flag docs (Issue #3)
- [ ] Day 10: Sprint review and cleanup

---

## 🔗 Related Documentation

- **Sprint 2 Plan:** `docs/sprints/SPRINT_2_KV_TO_D1_MIGRATION.md`
- **API Contract:** `docs/API_CONTRACT.md`
- **Deployment Guide:** `docs/DEPLOYMENT.md`
- **Migration README:** `migrations/README.md`

---

**Last Updated:** November 23, 2025
**Sprint Owner:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)
**Human Approver:** @jukasdrj
