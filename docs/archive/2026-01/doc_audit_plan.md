# Documentation Audit Plan

**Audit Date:** January 11, 2026
**Repository:** BooksTrack Backend (bendv3)

## Recommendations

This file will contain prioritized, actionable recommendations organized by:
- HIGH PRIORITY (blocks understanding or onboarding)
- MEDIUM PRIORITY (reduces efficiency)
- LOW PRIORITY (polish)

Each recommendation will include:
- Exact file paths affected
- Specific changes needed
- Rationale for the recommendation

---

## HIGH PRIORITY (Blocks Understanding or Onboarding)

### 1. Consolidate CSV A/B Testing Documentation
**Issue:** 3 active documents + 1 archived covering same feature
**Impact:** Developer confusion - unclear which doc is authoritative

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/guides/CSV_AB_TESTING.md` (KEEP - update)
- `/Users/juju/dev_repos/bendv3/docs/guides/CSV_AB_TESTING_EXAMPLE.md` (ARCHIVE)
- `/Users/juju/dev_repos/bendv3/docs/guides/CSV_AB_TESTING_UPDATE_JAN_2026.md` (ARCHIVE)

**Action:**
1. **Update CSV_AB_TESTING.md:**
   - Add section "Implementation History" at bottom
   - Document Issue #253 resolution (83% failure → fixed Jan 8)
   - Add link: "See archived docs for detailed examples and troubleshooting"
   - Ensure it reflects current production state (disabled by default)

2. **Move to archive:**
   ```bash
   mv docs/guides/CSV_AB_TESTING_EXAMPLE.md docs/archive/2026-01/
   mv docs/guides/CSV_AB_TESTING_UPDATE_JAN_2026.md docs/archive/2026-01/
   ```

3. **Update docs/archive/2026-01/README.md:**
   - Add section "CSV A/B Testing Historical Docs"
   - Link to archived EXAMPLE and UPDATE files
   - Note: "Superseded by consolidated CSV_AB_TESTING.md"

**Rationale:** Single source of truth prevents developers from following outdated guidance

---

### 2. Archive Completed Sprint Planning Documents
**Issue:** Sprint plans show "IN PROGRESS" for completed work
**Impact:** Confusion about project status, duplicated effort risk

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/SPRINT_PLAN_3_4.md` (ARCHIVE)
- `/Users/juju/dev_repos/bendv3/docs/SPRINT_4_SDK_PLAN.md` (UPDATE then ARCHIVE)

**Action:**

**For SPRINT_4_SDK_PLAN.md:**
1. Update Phase 1 status from "🔄 IN PROGRESS" to "✅ COMPLETE"
2. Add completion note:
   ```markdown
   **Status:** ✅ Phase 1 COMPLETE (January 7, 2026)
   **Published:** @jukasdrj/bookstrack-api-client@3.4.2
   **NPM:** https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client
   ```
3. Move to archive:
   ```bash
   mv docs/SPRINT_4_SDK_PLAN.md docs/archive/2026-01/SPRINT_4_SDK_PLAN_PHASE1_COMPLETE.md
   ```

**For SPRINT_PLAN_3_4.md:**
1. Move to archive with completion marker:
   ```bash
   mv docs/SPRINT_PLAN_3_4.md docs/archive/2026-01/SPRINT_PLAN_3_4_COMPLETE.md
   ```

2. **Update docs/archive/2026-01/README.md:**
   - Add section "Sprint Planning (Completed)"
   - Document: Sprint 3 (test architecture) and Sprint 4 Phase 1 (SDK) both complete
   - Link to TODO.md for current sprint status

**Rationale:** Archive completed plans, keep TODO.md as single source of truth for active work

---

### 3. Update Recommendations Implementation Plan Status
**Issue:** Planning doc says "Planning Phase" but implementation 90% complete
**Impact:** Misleading status could cause duplicate work

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/plans/RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md`

**Action:**
1. **Add status banner at top:**
   ```markdown
   > **⚠️ STATUS UPDATE (January 11, 2026):**
   > This implementation is **90% complete** (not in planning phase).
   >
   > **Completed:**
   > - ✅ D1 migration: `migrations/0010_add_reading_preferences.sql` (applied)
   > - ✅ Service layer: `src/services/recommendations.ts` (572 lines)
   > - ✅ API routes: `src/routes/recommendations.ts` (146 lines)
   > - ✅ Router integration complete
   >
   > **Remaining:**
   > - ⛔ Alexandria ratings endpoints (blocked - not deployed)
   > - See Issue #258 for deployment status
   >
   > **For current status, see:** [TODO.md](../../TODO.md) Issue #258
   ```

2. **Update document header:**
   - Change: `**Status:** Planning Phase`
   - To: `**Status:** 90% Complete (Blocked by Alexandria)`

**Rationale:** Prevent confusion about project state, clarify blockers

---

## MEDIUM PRIORITY (Reduces Efficiency)

### 4. Archive Completed Session Reports
**Issue:** Session-specific work logs in active docs directory
**Impact:** Clutter in docs/ root, not discoverable as historical reference

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/sessions/CODE_QUALITY_SESSION_2026-01-08.md`

**Action:**
1. Move session reports to archive:
   ```bash
   mv docs/sessions/CODE_QUALITY_SESSION_2026-01-08.md docs/archive/2026-01/
   ```

2. Consider removing `docs/sessions/` directory if empty:
   ```bash
   rmdir docs/sessions/
   ```

3. Update docs/archive/2026-01/README.md:
   - Add section "Session Reports"
   - Document session-specific work logs archived here

**Rationale:** Session reports are historical artifacts, not active documentation

---

### 5. Archive Superseded Test Cleanup Plan
**Issue:** Document proposes approach that was superseded by actual implementation
**Impact:** Confusion about testing strategy

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/TEST_SUITE_CLEANUP.md`

**Action:**
1. **Add deprecation notice at top:**
   ```markdown
   > **⚠️ SUPERSEDED (January 7, 2026):**
   > This 4-phase plan was superseded by the 3-tier testing architecture.
   >
   > **See instead:** [README_TESTING.md](../README_TESTING.md)
   >
   > **What happened:** Sprint 3 Phase 3 (Jan 7) implemented a different approach:
   > - Tier 1: Smoke tests (100% pass, 5s)
   > - Tier 2: Unit tests (95.7% pass, 20s)
   > - Tier 3: Integration tests (archived for CI/CD)
   >
   > This document remains for historical context only.
   ```

2. Move to archive:
   ```bash
   mv docs/TEST_SUITE_CLEANUP.md docs/archive/2026-01/TEST_SUITE_CLEANUP_SUPERSEDED.md
   ```

3. Update docs/INDEX.md:
   - Remove link to TEST_SUITE_CLEANUP.md
   - Ensure README_TESTING.md is prominently linked

**Rationale:** Prevent developers from following outdated testing strategy

---

### 6. Update docs/INDEX.md Navigation Links
**Issue:** Index may link to archived/moved documents
**Impact:** Broken navigation

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/INDEX.md`

**Action:**
1. **Audit all links in INDEX.md:**
   - Verify each link points to an existing file
   - Update paths for any archived documents
   - Remove links to documents that no longer exist

2. **Add "Archived Documentation" section:**
   ```markdown
   ## 🗄️ Archived Documentation

   Historical documentation from completed sprints and projects:
   - **[archive/2026-01/](archive/2026-01/)** - January 2026 completed work
     - Sprint planning (Sprint 3, Sprint 4 Phase 1)
     - Session reports (code quality, testing)
     - CSV A/B testing historical docs
     - Recommendations system planning
   - **[archive/2026-01-completed-work/](archive/2026-01-completed-work/)** - Pre-January cleanup
   ```

**Rationale:** Maintain navigability after archival operations

---

## LOW PRIORITY (Polish)

### 7. Add "Last Reviewed" Dates to Key Docs
**Issue:** Hard to know if documentation is current without git blame
**Impact:** Developer uncertainty about doc freshness

**Files Affected:**
- `/Users/juju/dev_repos/bendv3/docs/SYSTEM_ARCHITECTURE.md`
- `/Users/juju/dev_repos/bendv3/docs/CACHE_ARCHITECTURE.md`
- `/Users/juju/dev_repos/bendv3/docs/API_V3_OVERVIEW.md`

**Action:**
Add "Last Reviewed" header to living documentation:
```markdown
**Last Updated:** [Date content changed]
**Last Reviewed:** [Date accuracy verified]
```

**Rationale:** Builds confidence in documentation accuracy

---

### 8. Create Documentation Maintenance Policy
**Issue:** No clear guidelines for when to archive vs update
**Impact:** Documentation drift over time

**Action:**
Create `docs/DOCUMENTATION_POLICY.md`:
```markdown
# Documentation Maintenance Policy

## When to Archive
- Sprint plans after sprint completion
- Session reports after session ends
- Implementation plans after feature deployment
- Troubleshooting guides after issue resolution

## When to Update
- System architecture docs (living reference)
- API documentation (reflects current API)
- Testing guides (current test strategy)
- README.md and INDEX.md (always current)

## Archive Structure
- `docs/archive/YYYY-MM/` - Month-based archival
- Each archive has README.md explaining contents
- Active docs link to archived versions for context

## Review Cycle
- Quarterly audit of active documentation
- Annual cleanup of archive directories (consolidate)
```

**Rationale:** Prevent future documentation drift

---

## Summary

**Total Recommendations:** 8
**High Priority:** 3 (blocking issues)
**Medium Priority:** 3 (efficiency reducers)
**Low Priority:** 2 (polish)

**Estimated Effort:**
- High priority: 1-2 hours
- Medium priority: 30 minutes
- Low priority: 30 minutes
- **Total:** 2-3 hours

**Expected Outcome:**
- Clear, non-redundant documentation
- Accurate project status representation
- Improved developer onboarding experience
- Sustainable documentation maintenance process
