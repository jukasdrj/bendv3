# Documentation Audit Plan

**Date:** January 11, 2026
**Repository:** BooksTrack Backend (bendv3)
**Scope:** Comprehensive cleanup post-Sprint 2

---

## Executive Summary

**Total Files to Process:** 19 planning/session files
**Root Directory Cleanup:** Move 16 files to archives
**docs/ Directory:** Reorganize 5-8 files, create INDEX.md
**Estimated Time:** 2-3 hours
**Risk Level:** LOW (no deletions, fully reversible)

---

## HIGH PRIORITY Actions

### 1. Archive Completed Planning Artifacts (Root → docs/archive/)

#### 1A: Alexandria Setup Files (3 files)
**Target:** `docs/archive/alexandria-setup/2026-01-09/`

Files:
- `ALEXANDRIA_NEXT_STEPS.md` (8.2K)
- `ALEXANDRIA_PLANNING_SETUP.md` (10.3K)
- `ALEXANDRIA_SETUP_SUMMARY.md` (11.4K)

**Rationale:** Cross-repo setup complete, Alexandria now has planning-with-files skill

```bash
mkdir -p docs/archive/alexandria-setup/2026-01-09
mv ALEXANDRIA_*.md docs/archive/alexandria-setup/2026-01-09/
```

#### 1B: Recommendation Implementation Files (3 files)
**Target:** `docs/archive/recommendations/2026-01-implementation/`

Files:
- `findings_recommendations.md` (17.5K)
- `progress_recommendations.md` (8.9K)
- `task_plan_recommendations.md` (9.5K)

**Rationale:** Backend operational, ready for frontend (per progress.md Session 4)

```bash
mkdir -p docs/archive/recommendations/2026-01-implementation
mv *_recommendations.md docs/archive/recommendations/2026-01-implementation/
```

#### 1C: Documentation Audit Files (5 files)
**Target:** `docs/archive/doc-audits/2026-01-09-recommendations/`

Files:
- `doc_audit_findings.md` (6.8K) [OLD - from Jan 9]
- `doc_audit_plan.md` (3.3K) [OLD]
- `doc_audit_progress.md` (3.7K) [OLD]
- `DOC_AUDIT_EXECUTIVE_SUMMARY.md` (8.0K)
- `RECOMMENDATION_DOCS_CLEANUP_PLAN.md` (7.6K)

**Rationale:** Limited scope audit (recommendations only), superseded by this comprehensive audit

```bash
mkdir -p docs/archive/doc-audits/2026-01-09-recommendations
mv DOC_AUDIT_EXECUTIVE_SUMMARY.md docs/archive/doc-audits/2026-01-09-recommendations/
mv RECOMMENDATION_DOCS_CLEANUP_PLAN.md docs/archive/doc-audits/2026-01-09-recommendations/
# Note: Keep NEW audit files (this audit) until cleanup complete
```

#### 1D: Issue #256 Planning Files (3 files)
**Target:** `docs/archive/issues/256-v3-testing/`

Files:
- `findings.md` (8.7K) - Issue #256 findings
- `task_plan.md` (7.8K) - Issue #256 task plan
- `progress.md` (3.6K) - Issue #256 progress

**Rationale:** Issue #256 closed as "Not Planned" on Jan 9 (per TODO.md)

```bash
mkdir -p docs/archive/issues/256-v3-testing
mv findings.md docs/archive/issues/256-v3-testing/
mv task_plan.md docs/archive/issues/256-v3-testing/
mv progress.md docs/archive/issues/256-v3-testing/
```

#### 1E: Session Reports (3 files)
**Target:** `docs/archive/sessions/2026-01/`

Files:
- `CSV_AB_TEST_SUMMARY.md` (8.9K, Jan 8)
- `FAILURE_DETAILS.md` (4.8K, Jan 7)
- `TEST_VERIFICATION_REPORT.md` (10.9K, Jan 7)

**Rationale:** Session-specific reports, work completed

**Action:** Review for TODO migration first, then:
```bash
mkdir -p docs/archive/sessions/2026-01
mv CSV_AB_TEST_SUMMARY.md docs/archive/sessions/2026-01/
mv FAILURE_DETAILS.md docs/archive/sessions/2026-01/
mv TEST_VERIFICATION_REPORT.md docs/archive/sessions/2026-01/
```

### 2. Create Archive README Files

#### 2A: Master Archive README
**File:** `docs/archive/README.md`

```markdown
# Archive - Completed Work & Historical Context

This directory contains completed planning artifacts, session logs, and historical documentation.

## Structure

- **alexandria-setup/** - Cross-repo planning setup (Jan 2026)
- **recommendations/** - Recommendation feature implementation (Jan 2026)
- **doc-audits/** - Documentation audit history
- **issues/** - Issue-specific planning files (closed issues)
- **sessions/** - Session-specific reports and logs
- **sprints/** - Completed sprint planning and retrospectives
- **completed-reviews/** - Architectural reviews and PRs
- **utils-consolidation/** - Utils refactoring project

## Archive Policy

**Archive when:**
- Planning work is complete
- Sprint/issue is closed
- Session work is finished
- Feature is in production

**Keep active when:**
- Work is ongoing
- Reference is needed for current development
- Part of core documentation

## Restoration

To restore archived files:
```bash
cp docs/archive/path/to/file.md ./
```

All files are preserved with full content for historical reference.
```

#### 2B: Specific Archive READMEs

**File:** `docs/archive/recommendations/2026-01-implementation/README.md`

```markdown
# Recommendation Feature Implementation

**Date:** January 9, 2026
**Status:** Backend complete, ready for frontend integration
**Planning Method:** Manus-style planning-with-files

## Files

- `task_plan_recommendations.md` - 7-phase implementation plan
- `findings_recommendations.md` - Alexandria metadata analysis + API design
- `progress_recommendations.md` - 4-session progress log

## Outcome

Backend implementation complete:
- D1 schema: `user_reading_preferences` table
- Alexandria API: `/api/recommendations/subjects`, `/api/recommendations/similar`
- bendv3 API: `/api/recommendations`, `/api/recommendations/debug`
- Frontend guide: `docs/FRONTEND_RECOMMENDATION_INTEGRATION.md` (active)
- iOS guide: `docs/IOS_RECOMMENDATIONS_UX_DESIGN.md` (active)

## Distribution Docs

Active documentation (NOT archived):
- `docs/FRONTEND_RECOMMENDATION_INTEGRATION.md`
- `docs/IOS_RECOMMENDATIONS_UX_DESIGN.md`

See these files for current integration instructions.
```

### 3. Verify Sprint Status vs TODO.md

**Check:** `docs/SPRINT_4_SDK_PLAN.md`

**Status:** ACTIVE (Phase 1 in progress per file content)
- Sprint 4 started January 7, 2026
- Tasks: SDK publication, API docs, RFC 9457 audit
- Current: Task 1.1-1.5 (SDK publication)
- **Action:** KEEP ACTIVE - Not complete yet

**No Sprint 3 plan found** - appears to have been skipped or never created

---

## MEDIUM PRIORITY Actions

### 4. Create docs/INDEX.md (NEW)

**File:** `docs/INDEX.md`

```markdown
# BooksTrack Backend Documentation

**Project:** BooksTrack Cloudflare Workers API
**Version:** 3.4.2
**Last Updated:** January 11, 2026

## Quick Links

- **[System Architecture](SYSTEM_ARCHITECTURE.md)** - Cross-repo architecture overview
- **[API V3 Overview](API_V3_OVERVIEW.md)** - Current API specification
- **[Testing Guide](../README_TESTING.md)** - Testing practices and architecture
- **[TODO List](../TODO.md)** - Current sprint planning and tasks

---

## Documentation Categories

### API Documentation
- **[API V3 Overview](API_V3_OVERVIEW.md)** - V3 endpoints and usage (Jan 9)
- **[API Versioning](API_VERSIONING.md)** - Versioning policy and migration
- **[PRD](PRD.md)** - Product requirements document

### Architecture
- **[System Architecture](SYSTEM_ARCHITECTURE.md)** - Cross-repo design
- **[Cache Architecture](CACHE_ARCHITECTURE.md)** - KV + D1 caching strategy
- **[D1 Concurrency Analysis](D1_CONCURRENCY_ANALYSIS.md)** - Database performance (Jan 6)
- **[External ID Resolution](EXTERNAL_ID_RESOLUTION.md)** - ISBN/work_key mapping

### Cross-Repository Integration
- **[Agents](AGENTS.md)** - AI collaboration agents
- **[Alexandria Version Sync](ALEXANDRIA_VERSION_SYNC.md)** - Cross-repo versioning
- **[Alexandria Contract Testing](ALEXANDRIA-CONTRACT-TESTING.md)** - Contract tests
- **[CI Contract Check Migration](CI_CONTRACT_CHECK_MIGRATION.md)** - CI setup

### Frontend Integration
- **[V3 Frontend Handoff](V3_FRONTEND_HANDOFF.md)** - Frontend integration guide
- **[Recommendation Integration](FRONTEND_RECOMMENDATION_INTEGRATION.md)** - React integration (Jan 9)
- **[iOS Recommendations UX](IOS_RECOMMENDATIONS_UX_DESIGN.md)** - iOS design spec (Jan 9)

### Development Guides
- **[Utils Organization](UTILS_ORGANIZATION.md)** - Utility modules structure (Jan 8)
- **[Testing Guide](../README_TESTING.md)** - 3-tier testing architecture
- **[CSV A/B Testing](guides/CSV_AB_TESTING.md)** - A/B testing workflow
- **[Dependency Injection Migration](guides/dependency-injection-migration.md)** - DI patterns

### Migration Guides
- **[V2 to V3 Migration](migration/v2-to-v3.md)** - API migration guide
- **[Migration Overview](migration/README.md)** - Migration process

### Sprint Planning
- **[Sprint 4 Plan](SPRINT_4_SDK_PLAN.md)** - SDK & developer experience (ACTIVE)
- **[TODO List](../TODO.md)** - Current sprint tasks

### Testing & Quality
- **[Test Coverage Analysis](TEST_COVERAGE_ANALYSIS_2026-01-09.md)** - Coverage report (Jan 9)
- **[Test Suite Cleanup](TEST_SUITE_CLEANUP.md)** - Test refactoring
- **[V3 Contract Testing](V3_CONTRACT_TESTING.md)** - Contract testing strategy

### Session Logs
- **[Code Quality Session](sessions/CODE_QUALITY_SESSION_2026-01-08.md)** - Code review (Jan 8)
- **[TODO Audit](TODO_AUDIT_2026-01-08.md)** - TODO comment audit (Jan 8)

### Planning Documents
- **[Ratings Implementation (Alexandria)](plans/RATINGS_IMPLEMENTATION_PLAN_ALEXANDRIA.md)**
- **[Ratings Implementation (BooksTrack)](plans/RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md)**

### Archive
- **[Archive](archive/README.md)** - Completed work and historical docs

---

## Document Status Key

- 📍 **CURRENT** - Actively maintained, reflects current state
- 🔄 **ACTIVE** - Work in progress (sprints, sessions)
- 📦 **REFERENCE** - Stable reference material
- 📁 **ARCHIVED** - Completed work, historical context

---

## Contributing

When adding new documentation:
1. Place in appropriate category folder
2. Add entry to this INDEX.md
3. Link from related docs
4. Update "Last Updated" date

For session logs and completed work:
1. Create in appropriate location
2. Archive when work is complete (see [archive policy](archive/README.md))
3. Update references in active docs

---

**Maintained by:** Documentation Detective
**Review Frequency:** Monthly or after major changes
```

### 5. Reorganize docs/ Directory Structure

**Current issues:**
- Session logs at docs/ root
- No clear folder organization
- Inconsistent file naming

**Proposed structure:**
```
docs/
├── INDEX.md (NEW)
├── api/
│   ├── API_V3_OVERVIEW.md
│   ├── API_VERSIONING.md
│   └── openapi.yaml (if exists)
├── architecture/
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── CACHE_ARCHITECTURE.md
│   ├── D1_CONCURRENCY_ANALYSIS.md
│   └── EXTERNAL_ID_RESOLUTION.md
├── cross-repo/
│   ├── AGENTS.md
│   ├── ALEXANDRIA_VERSION_SYNC.md
│   ├── ALEXANDRIA-CONTRACT-TESTING.md
│   └── CI_CONTRACT_CHECK_MIGRATION.md
├── frontend/
│   ├── V3_FRONTEND_HANDOFF.md
│   ├── FRONTEND_RECOMMENDATION_INTEGRATION.md
│   └── IOS_RECOMMENDATIONS_UX_DESIGN.md
├── guides/
│   ├── CSV_AB_TESTING.md
│   ├── CSV_AB_TESTING_EXAMPLE.md
│   ├── CSV_AB_TESTING_UPDATE_JAN_2026.md
│   └── dependency-injection-migration.md
├── migration/
│   ├── README.md
│   └── v2-to-v3.md
├── plans/
│   ├── RATINGS_IMPLEMENTATION_PLAN_ALEXANDRIA.md
│   └── RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md
├── sessions/
│   ├── CODE_QUALITY_SESSION_2026-01-08.md
│   └── TODO_AUDIT_2026-01-08.md
├── testing/
│   ├── TEST_COVERAGE_ANALYSIS_2026-01-09.md
│   ├── TEST_SUITE_CLEANUP.md
│   └── V3_CONTRACT_TESTING.md
├── development/
│   └── UTILS_ORGANIZATION.md
├── sprints/
│   └── SPRINT_4_SDK_PLAN.md (keep active)
├── archive/
│   └── (see archive structure above)
└── PRD.md (keep at root)
```

**Implementation:**
```bash
# Create category folders
mkdir -p docs/{api,architecture,cross-repo,frontend,testing,development,sprints}

# Move files to categories
mv docs/API_V3_OVERVIEW.md docs/api/
mv docs/API_VERSIONING.md docs/api/
# ... (continue for all files)
```

### 6. Archive Completed Session Logs

**Target:** `docs/archive/sessions/2026-01/`

Files already in docs/:
- `CODE_QUALITY_SESSION_2026-01-08.md`
- `TEST_COVERAGE_ANALYSIS_2026-01-09.md`
- `TODO_AUDIT_2026-01-08.md`

**Action:**
```bash
mv docs/CODE_QUALITY_SESSION_2026-01-08.md docs/archive/sessions/2026-01/
mv docs/TEST_COVERAGE_ANALYSIS_2026-01-09.md docs/archive/sessions/2026-01/
mv docs/TODO_AUDIT_2026-01-08.md docs/archive/sessions/2026-01/
```

---

## LOW PRIORITY Actions

### 7. Standardize File Naming

**Current inconsistency:**
- Underscores: `CSV_AB_TEST_SUMMARY.md`
- Hyphens: `ALEXANDRIA-CONTRACT-TESTING.md`
- Mixed case: Some files all-caps, some mixed

**Decision:** Use CAPS with hyphens for acronyms, underscores for multi-word concepts
- API_V3_OVERVIEW.md (API = acronym)
- CACHE_ARCHITECTURE.md (multi-word concept)
- ALEXANDRIA-CONTRACT-TESTING.md (project-component-type)

**Action:** Document standard in `docs/README.md` (if created), don't rename existing files

### 8. Consolidate CSV A/B Testing Docs

**Current:** 3 files in docs/guides/
- `CSV_AB_TESTING.md`
- `CSV_AB_TESTING_EXAMPLE.md`
- `CSV_AB_TESTING_UPDATE_JAN_2026.md`

**Analysis needed:** Determine if these can be merged or if all three provide unique value

**Deferred:** Low priority, all three may be necessary

---

## Verification Checklist

After cleanup:

### Root Directory (Should have ≤10 .md files)
- [ ] README.md
- [ ] CLAUDE.md
- [ ] TODO.md
- [ ] CHANGELOG.md
- [ ] README_TESTING.md
- [ ] TYPESCRIPT_STATUS.md
- [ ] No planning files (*_recommendations.md, findings.md, etc.)
- [ ] No session reports (CSV_AB_TEST_SUMMARY.md, etc.)

### docs/ Directory
- [ ] INDEX.md exists
- [ ] All categories have appropriate folders
- [ ] Session logs archived
- [ ] Sprint 4 plan active (SPRINT_4_SDK_PLAN.md)
- [ ] Archive README exists

### Archive Structure
- [ ] docs/archive/README.md exists
- [ ] docs/archive/recommendations/2026-01-implementation/ has 3 files + README
- [ ] docs/archive/alexandria-setup/2026-01-09/ has 3 files
- [ ] docs/archive/doc-audits/2026-01-09-recommendations/ has 5 files
- [ ] docs/archive/issues/256-v3-testing/ has 3 files
- [ ] docs/archive/sessions/2026-01/ has 6 files (3 from root + 3 from docs/)

### Documentation Links
- [ ] All links in INDEX.md work
- [ ] Archive READMEs are accurate
- [ ] No broken references in active docs

---

## Rollback Procedure

If cleanup causes issues:

```bash
# Restore from archive
cp -r docs/archive/recommendations/2026-01-implementation/*.md ./
cp -r docs/archive/alexandria-setup/2026-01-09/*.md ./
# ... etc
```

All files are preserved, making rollback trivial.

---

## Execution Order

1. **Verify TODO.md alignment** (check for unreported tasks in session reports)
2. **Create archive structure** (mkdir commands)
3. **Move root planning files** (16 files)
4. **Move docs/ session logs** (3-6 files)
5. **Create archive READMEs** (document what was moved)
6. **Create docs/INDEX.md** (navigation hub)
7. **Verify links** (no broken references)
8. **Commit changes** (git commit with detailed message)
9. **(Optional) Reorganize docs/** (LOW priority, deferred)

---

## Git Commit Message

```
docs: Archive completed planning artifacts and organize documentation

- Archive 16 root planning files (Alexandria setup, recommendations, Issue #256)
- Archive 6 session reports (CSV A/B, test verification, quality reviews)
- Create docs/INDEX.md for navigation
- Add archive READMEs explaining archived content
- Preserve all files for historical reference (zero deletions)

Archived:
- Alexandria planning-with-files setup (3 files, Jan 9)
- Recommendation implementation planning (3 files, Jan 9)
- Previous doc audit (5 files, Jan 9)
- Issue #256 V3 testing planning (3 files, Jan 9)
- Session reports (6 files, Jan 6-9)

Active docs remain:
- FRONTEND_RECOMMENDATION_INTEGRATION.md
- IOS_RECOMMENDATIONS_UX_DESIGN.md
- SPRINT_4_SDK_PLAN.md (in progress)
- All core reference docs (TODO.md, CLAUDE.md, README.md, etc.)

See docs/archive/README.md for archive policy.

Closes: #NNN (if doc cleanup issue exists)
```

---

## Time Estimates

- **Phase 1 (Root cleanup):** 30 minutes
- **Phase 2 (Archive READMEs):** 15 minutes
- **Phase 3 (docs/INDEX.md):** 30 minutes
- **Phase 4 (Verify links):** 15 minutes
- **Phase 5 (Commit):** 10 minutes
- **Total:** ~1.5-2 hours

**Optional reorganization:** +1-2 hours

---

**Plan Status:** Ready for execution
**Next Step:** Execute root cleanup (Phase 1)

