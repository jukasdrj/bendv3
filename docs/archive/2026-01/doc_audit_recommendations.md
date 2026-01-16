# Documentation Audit - Prioritized Recommendations

**Audit Date:** 2026-01-16
**Repository:** BooksTrack Backend (bendv3)
**Overall Health:** 8.5/10 - Excellent core docs, minor cleanup needed

---

## HIGH PRIORITY (Blocks Understanding or Onboarding)

### 1. Update CHANGELOG.md ⚠️ CRITICAL
**Impact:** Users/developers can't track API changes or breaking updates
**Effort:** 30 minutes

**Missing Entries (Jan 6-16):**
```markdown
## [3.4.2] - 2026-01-16

### Fixed
- Bookshelf scan workflow: Fixed Secrets Store access pattern for Gemini API
- Scan results extraction: Fixed results.books property extraction
- CSV import: Improved error handling and validation

## [3.4.1] - 2026-01-14

### Added
- Genre taxonomy expansion: 44 → 92 canonical genres
  - Added 2026 trends: Cozy Fantasy, Romantasy, Techno-Thriller, Folk Horror
  - Backward compatible, no breaking changes

### Changed
- Upgraded Alexandria dependency from v2.4.0 → v2.8.0
  - Improved Service Provider Framework
  - Analytics tracking utilities available (opt-in)

## [3.4.0] - 2026-01-11

### Changed
- **BREAKING:** All API routes now use RFC 9457 Problem Details for errors
  - Previous format: `{ error: { code, message } }`
  - New format: `{ type, title, status, detail, instance, code, retryable }`
  - See [docs/migration/rfc-9457-migration.md](docs/migration/rfc-9457-migration.md)

### Fixed
- Test suite: 100% pass rate achieved (1,097 tests passing, 0 failures)
- Rate limiter: Updated to RFC 9457 error format
- Analytics: Fixed flaky tests with Math.random() mocking
```

**Files to Update:**
- `/Users/juju/dev_repos/bendv3/CHANGELOG.md`

### 2. Consolidate Planning Files to .claude/plans/ ⚠️ CRITICAL
**Impact:** Claude Code 2.1.9+ expects files in unified location
**Effort:** 5 minutes (simple move)

**Current State:**
```
bendv3/
├── task_plan.md          # ACTIVE - shelf scan validation
├── findings.md           # ACTIVE - shelf scan validation
├── progress.md           # ACTIVE - shelf scan validation
└── .claude/plans/
    ├── README.md         # Setup docs only
    └── SETUP.md          # No active planning files!
```

**Recommended Action:**
```bash
# Option A: If shelf scan work is COMPLETE, archive it
mv task_plan.md docs/archive/2026-01/task_plan_shelf_scan.md
mv findings.md docs/archive/2026-01/findings_shelf_scan.md
mv progress.md docs/archive/2026-01/progress_shelf_scan.md

# Option B: If shelf scan work is ACTIVE, move to .claude/plans/
mv task_plan.md .claude/plans/task_plan.md
mv findings.md .claude/plans/findings.md
mv progress.md .claude/plans/progress.md
```

**Files to Move:**
- `/Users/juju/dev_repos/bendv3/task_plan.md`
- `/Users/juju/dev_repos/bendv3/findings.md`
- `/Users/juju/dev_repos/bendv3/progress.md`

**Destination:**
- If complete: `/Users/juju/dev_repos/bendv3/docs/archive/2026-01/`
- If active: `/Users/juju/dev_repos/bendv3/.claude/plans/`

**Recommendation:** ARCHIVE (work appears complete per findings.md)

### 3. Archive Completed Work Docs from Root ⚠️ HIGH
**Impact:** Root directory cluttered with 5 completed work docs
**Effort:** 2 minutes

**Files to Archive:**
```bash
# Move to docs/archive/2026-01/
mv CSV_IMPORT_FIX_SUMMARY.md docs/archive/2026-01/
mv CSV_IMPORT_INTEGRATION.md docs/archive/2026-01/
mv MANUAL_TEST_GUIDE.md docs/archive/2026-01/
mv SHELF_SCAN_VALIDATION_SUMMARY.md docs/archive/2026-01/
mv VALIDATION_REPORT.md docs/archive/2026-01/
```

**Files:**
- `/Users/juju/dev_repos/bendv3/CSV_IMPORT_FIX_SUMMARY.md`
- `/Users/juju/dev_repos/bendv3/CSV_IMPORT_INTEGRATION.md`
- `/Users/juju/dev_repos/bendv3/MANUAL_TEST_GUIDE.md`
- `/Users/juju/dev_repos/bendv3/SHELF_SCAN_VALIDATION_SUMMARY.md`
- `/Users/juju/dev_repos/bendv3/VALIDATION_REPORT.md`

**Destination:** `/Users/juju/dev_repos/bendv3/docs/archive/2026-01/`

---

## MEDIUM PRIORITY (Reduces Efficiency)

### 4. Create RFC 9457 Migration Guide for External Consumers ⚠️ MEDIUM
**Impact:** External API consumers need migration instructions
**Effort:** 1-2 hours

**Create New File:** `/Users/juju/dev_repos/bendv3/docs/migration/rfc-9457-migration.md`

**Contents:**
```markdown
# RFC 9457 Error Migration Guide

**Effective Date:** January 11, 2026
**API Version:** V3 (all routes)
**Breaking Change:** Yes

## Overview

All BooksTrack API endpoints now return errors in RFC 9457 Problem Details format
for consistency and better error handling.

## Changes

### Before (Legacy Format)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests"
  }
}
```

### After (RFC 9457 Format)
```json
{
  "success": false,
  "type": "https://api.oooefam.net/errors/rate-limit",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "You have exceeded the rate limit of 100 requests per minute",
  "instance": "/v3/books/search?q=test",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryable": true,
  "retryAfterMs": 60000,
  "metadata": {
    "timestamp": "2026-01-16T12:00:00.000Z",
    "requestId": "abc-123"
  }
}
```

## Migration Steps

### TypeScript SDK Users
```typescript
// Old way
if (!response.success) {
  console.error(response.error.message)
}

// New way (3.4.0+)
if (!response.success) {
  console.error(response.detail) // Human-readable error
  if (response.retryable) {
    setTimeout(() => retry(), response.retryAfterMs)
  }
}
```

### JavaScript/Fetch Users
```javascript
// Check for retryable errors
const response = await fetch('/v3/books/search?q=test')
const data = await response.json()

if (!data.success) {
  // RFC 9457 fields available
  console.error(`${data.title}: ${data.detail}`)
  console.log(`Status: ${data.status}, Code: ${data.code}`)

  if (data.retryable && data.retryAfterMs) {
    console.log(`Retry after ${data.retryAfterMs}ms`)
  }
}
```

## Timeline

- **January 11, 2026:** RFC 9457 format deployed to production
- **No deprecation period:** Immediate breaking change (V3 API contract)
- **SDK v3.4.0+:** Full RFC 9457 support in TypeScript SDK

## Benefits

1. **Standard format:** Industry-standard error representation
2. **Better context:** `type` URLs provide error documentation
3. **Retry logic:** `retryable` + `retryAfterMs` simplify retry handling
4. **Debugging:** `requestId` for support requests

## Resources

- [RFC 9457 Specification](https://www.rfc-editor.org/rfc/rfc9457.html)
- [TypeScript SDK](https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client)
- [API Documentation](https://api.oooefam.net/v3/docs)
```

**Also Update:**
- CHANGELOG.md (see recommendation #1)
- docs/API_V3_OVERVIEW.md (add migration link)

### 5. Validate V1/V2 References Are Intentional ⚠️ MEDIUM
**Impact:** Ensure no accidental legacy API references
**Effort:** 30 minutes (audit 21 files)

**Files Found (21 total):**
Most appear intentional (migration guides, archives), but validate:

**Intentional (No Action):**
- docs/migration/v2-to-v3.md ✅
- docs/API_VERSIONING.md ✅
- tests/archived/legacy-v1-v2/README.md ✅
- packages/api-client/V3_MIGRATION.md ✅

**Review These:**
- packages/api-client/CHANGELOG.md (check for stale references)
- docs/V3_FRONTEND_HANDOFF.md (ensure no legacy endpoints)
- docs/PRD.md (product requirements current?)

**Action:** Quick grep review, no changes expected

### 6. Update planning-with-files Skill to Default to .claude/plans/ ⚠️ MEDIUM
**Impact:** Prevent future planning file scatter
**Effort:** 10 minutes (update skill configuration)

**File to Update:**
`.claude/skills/planning-with-files/SKILL.md`

**Change:**
```markdown
# BEFORE (current)
Your planning files should be created in **your project directory**

# AFTER (recommended)
Your planning files should be created in **.claude/plans/** (unified plans directory)
```

**Also Update:**
- `.claude/settings.json` (ensure plansDirectory is set)
- Skill templates to reference .claude/plans/

---

## LOW PRIORITY (Polish)

### 7. Document Genre Taxonomy Expansion ⚠️ LOW
**Impact:** Rationale for 44→92 genre expansion not documented
**Effort:** 30 minutes

**Create:** `/Users/juju/dev_repos/bendv3/docs/GENRE_TAXONOMY.md`

**Contents:**
- Rationale for expansion
- 2026 trends added (Cozy Fantasy, Romantasy, etc.)
- Genre mapping examples
- Detection accuracy improvements

**Reference:** PR #259, Issue #185

### 8. Create Configuration Guide ⚠️ LOW
**Impact:** Centralize scattered configuration docs
**Effort:** 1 hour

**Create:** `/Users/juju/dev_repos/bendv3/docs/CONFIGURATION.md`

**Contents:**
- All environment variables
- Feature flag rollout procedures
- Secrets management
- wrangler.jsonc explanation
- Development vs production configs

**Current State:** Configuration docs scattered in comments

### 9. Document Test Suite Architecture Evolution ⚠️ LOW
**Impact:** Test architecture decisions undocumented
**Effort:** 1 hour

**Create:** `/Users/juju/dev_repos/bendv3/docs/TEST_ARCHITECTURE.md`

**Contents:**
- Dual pool rationale (Workers vs Node)
- Resource-aware testing motivation
- Test organization strategy
- Integration test archival decision
- Coverage targets and rationale

**Reference:** Sprint 3 completion, README_TESTING.md

---

## OPTIONAL (Future Improvements)

### 10. Create INDEX.md for docs/ Directory ⚠️ OPTIONAL
**Impact:** Easier navigation for large docs/ folder
**Effort:** 30 minutes

**File Exists:** `/Users/juju/dev_repos/bendv3/docs/INDEX.md` (check if current)

**Update with:**
- Quick links to frequently accessed docs
- Organization by category (API, Architecture, Migration, etc.)
- Last updated dates

### 11. Add CONTRIBUTING.md Guidelines ⚠️ OPTIONAL
**Impact:** Help external contributors
**Effort:** 1 hour

**File Exists:** `.github/CONTRIBUTING.md` (check if current)

**Update with:**
- Documentation update expectations
- CHANGELOG update requirements
- Planning file usage (.claude/plans/)
- Code review checklist

---

## Execution Plan

### Phase 1: Quick Wins (30 minutes)
1. ✅ Move planning files to .claude/plans/ or archive (5 min)
2. ✅ Archive 5 completed work docs (2 min)
3. ✅ Update CHANGELOG.md with missing entries (20 min)
4. ✅ Validate V1/V2 references (3 min grep check)

### Phase 2: Migration Documentation (2 hours)
1. ✅ Create RFC 9457 migration guide (1.5 hours)
2. ✅ Update API_V3_OVERVIEW.md with migration link (10 min)
3. ✅ Update CHANGELOG.md with RFC 9457 breaking change (10 min)
4. ✅ Update planning-with-files skill config (10 min)

### Phase 3: Polish (3-4 hours, optional)
1. Document genre taxonomy expansion
2. Create configuration guide
3. Document test architecture evolution
4. Update docs/INDEX.md
5. Review CONTRIBUTING.md

---

## Success Metrics

**After Phase 1:**
- ✅ Root directory: 16 → 8 .md files (50% reduction)
- ✅ .claude/plans/ in use (0 → 3 files OR 0 archived)
- ✅ CHANGELOG current through Jan 16

**After Phase 2:**
- ✅ External consumers have RFC 9457 migration guide
- ✅ Future planning files auto-go to .claude/plans/
- ✅ All breaking changes documented

**After Phase 3:**
- ✅ All recent architectural decisions documented
- ✅ Configuration centralized
- ✅ Test strategy explained

**Final Health Score Target:** 9.5/10 (from 8.5/10)

---

## Files Created/Modified Summary

### High Priority (Phase 1)
- **Modified:** CHANGELOG.md
- **Moved:** task_plan.md, findings.md, progress.md → .claude/plans/ OR docs/archive/2026-01/
- **Moved:** 5 completed docs → docs/archive/2026-01/

### Medium Priority (Phase 2)
- **Created:** docs/migration/rfc-9457-migration.md
- **Modified:** docs/API_V3_OVERVIEW.md, CHANGELOG.md
- **Modified:** .claude/skills/planning-with-files/SKILL.md

### Low Priority (Phase 3)
- **Created:** docs/GENRE_TAXONOMY.md
- **Created:** docs/CONFIGURATION.md
- **Created:** docs/TEST_ARCHITECTURE.md
- **Modified:** docs/INDEX.md, .github/CONTRIBUTING.md

---

**Total Recommendations:** 11 (3 high, 3 medium, 3 low, 2 optional)
**Estimated Total Effort:** 8-10 hours (all phases)
**Minimum Viable Cleanup:** 30 minutes (Phase 1 only)
