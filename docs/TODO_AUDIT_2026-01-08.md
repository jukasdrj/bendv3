# TODO Comment Audit - January 8, 2026

**Audit Date:** January 8, 2026
**Total Comments Found:** 11
**Status:** All reviewed and categorized

---

## Summary

All TODO/FIXME comments have been reviewed and categorized into three groups:

- **Keep (8)** - Valid future work, well-documented
- **Remove (2)** - Stale/outdated comments
- **Convert to Issue (1)** - Needs GitHub issue tracking

---

## Detailed Review

### 1. ✅ KEEP - Type System Enhancement
**File:** `src/api-v3/jobs/common.ts:305`
**Comment:** `// TODO: Use CanonicalBook[] type when available`
**Context:** Function returns `any[]` instead of typed array
**Rationale:** Valid technical debt. Function signature should use CanonicalBook[] once type is exported from @bookstrack/schemas
**Action:** Keep - Document in type system improvement backlog
**Priority:** P3 (Low)

---

### 2. ✅ KEEP - Feature Enhancement
**File:** `src/utils/jobs/csv-processor-core.ts:462`
**Comment:** `enrichmentFailed: 0, // TODO: Track enrichment failures`
**Context:** CSV import results don't track enrichment failures
**Rationale:** Valid enhancement. CSV import currently doesn't enrich books, but if this changes, failure tracking should be added
**Action:** Keep - Part of future CSV enrichment feature
**Priority:** P3 (Low)

---

### 3. ✅ KEEP - Observability Enhancement
**File:** `src/utils/analytics/analytics.ts:88`
**Comment:** `// TODO: Add error tracking metric (env.ANALYTICS_ERRORS.increment())`
**Context:** Analytics failures are logged but not tracked
**Rationale:** Valid enhancement for observability. Would require new ANALYTICS_ERRORS binding in wrangler.jsonc
**Action:** Keep - Part of observability improvements backlog
**Priority:** P3 (Low)

---

### 4. ✅ KEEP - Platform Limitation Workaround
**File:** `src/utils/analytics/analytics-queries.ts:9`
**Comment:** `* TODO: Implement KV-based access tracking or GraphQL API integration.`
**Context:** Analytics Engine bindings are write-only in Workers
**Rationale:** Valid platform limitation. Function correctly returns empty stats with clear warning
**Action:** Keep - Well-documented workaround, might be addressed in future platform updates
**Priority:** P4 (Nice to Have)

---

### 5. ✅ KEEP - Feature Toggle
**File:** `src/handlers/scheduled-alerts.ts:105`
**Comment:** `// TODO: Uncomment when email alerts are needed`
**Context:** Email alert functionality is implemented but disabled
**Rationale:** Valid feature toggle. Code is ready but waiting for production email configuration
**Action:** Keep - Waiting for ALERT_EMAIL env var configuration
**Priority:** P3 (Low)

---

### 6. ❌ REMOVE - Reference to Non-Existent Document
**File:** `src/services/alexandria-cover-service.ts:10`
**Comment:** `* @see TODO-ALEXANDRIA-COVER-INTEGRATION.md for integration roadmap`
**Context:** References a document that doesn't exist
**Rationale:** STALE - Document was never created or was removed. Alexandria cover integration is already complete via R2
**Action:** Remove - Integration is complete, no roadmap needed
**Priority:** P2 (Medium)

---

### 7. 🎫 CONVERT TO GITHUB ISSUE - Migration Work
**File:** `src/services/alexandria-api.ts:149-150`
**Comments:**
- `* TODO: Enable this once Alexandria exports AppType`
- `* TODO: Remove searchAlexandriaByISBN_Uncached_Fetch once migration complete`
**Context:** Dual RPC/HTTP implementation for Alexandria client
**Rationale:** Valid migration work requiring coordination with Alexandria team
**Action:** Create GitHub issue for Alexandria RPC migration completion
**Priority:** P2 (Medium)
**Issue Title:** "Complete Alexandria RPC migration - Remove HTTP fallback"
**Issue Body:**
```markdown
## Context
Currently maintaining both RPC and HTTP implementations for Alexandria client.

## Tasks
- [ ] Confirm Alexandria exports AppType for Hono RPC
- [ ] Test RPC client in all scenarios
- [ ] Remove `searchAlexandriaByISBN_Uncached_Fetch` function
- [ ] Update all call sites to use RPC-only path
- [ ] Remove HTTP fallback code

## Files Affected
- `src/services/alexandria-api.ts`
- `src/services/enrichment.ts`

## Related
- Service Binding: `ALEXANDRIA`
- Fallback URL: `https://alexandria.ooheynerds.com`
```

---

### 8. ❌ REMOVE - Reference to Non-Existent Document
**File:** `src/services/normalizers/alexandria.ts:10`
**Comment:** `* @see TODO-ALEXANDRIA-INTEGRATION.md for integration plan`
**Context:** References a document that doesn't exist
**Rationale:** STALE - Document was never created or was removed. Alexandria integration is complete
**Action:** Remove - Integration is complete (RPC + HTTP fallback)
**Priority:** P2 (Medium)

---

### 9. ✅ KEEP - Feature Dependency
**File:** `src/services/author-discovery.ts:218`
**Comment:** `// TODO: Implement once CloudKit → D1 sync is active`
**Context:** User library authors feature waiting for CloudKit sync
**Rationale:** Valid future work blocked by infrastructure. Function correctly returns empty array with clear comment
**Action:** Keep - Blocked by CloudKit → D1 sync implementation
**Priority:** P3 (Low)

---

### 10. ✅ KEEP - Historical Context
**File:** `src/services/enrichment.ts:70`
**Comment:** `// This duplicate interface was causing type conflicts (See TODO.md P3 #6)`
**Context:** Explains why duplicate WorkerEnv interface was removed
**Rationale:** Valid historical context for future developers
**Action:** Keep - Explains past issue resolution
**Priority:** P4 (Documentation)

---

## Action Items

### Immediate (This Session)
1. ✅ Remove stale comment from `src/services/alexandria-cover-service.ts:10`
2. ✅ Remove stale comment from `src/services/normalizers/alexandria.ts:10`
3. ✅ Create GitHub issue for Alexandria RPC migration completion
4. ✅ Update TODO.md to reflect completed TODO audit

### Future Work
- 8 TODO comments remain as valid technical debt (documented above)
- All are P3/P4 priority and don't block any work
- No urgent action required

---

## TODO Policy (Going Forward)

### When to Add TODO Comments
1. ✅ **Feature dependencies** - Blocked by external infrastructure
2. ✅ **Type system improvements** - After core functionality works
3. ✅ **Platform limitations** - Workarounds for Workers/Cloudflare constraints
4. ✅ **Feature toggles** - Implemented but waiting for configuration
5. ✅ **Historical context** - Explains past design decisions

### When to Use GitHub Issues Instead
1. ❌ **Multi-file changes** - Requires coordination across codebase
2. ❌ **External dependencies** - Requires coordination with other teams
3. ❌ **Significant effort** - More than 1-2 hours of work
4. ❌ **Tracked milestones** - Part of sprint planning

### When to Remove TODO Comments
1. ❌ **Stale references** - Links to non-existent documents
2. ❌ **Completed work** - Feature already implemented
3. ❌ **Duplicates** - Same issue tracked elsewhere

---

**Last Updated:** January 8, 2026
**Next Audit:** After Sprint 4 completion or in 3 months (April 2026)
