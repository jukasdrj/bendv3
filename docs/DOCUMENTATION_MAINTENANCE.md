# Documentation Maintenance Policy

**Version:** 1.0
**Last Updated:** January 11, 2026
**Owner:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)

---

## Purpose

This document establishes guidelines for maintaining BooksTrack backend documentation to ensure accuracy, discoverability, and relevance over time.

---

## Documentation Categories

### 1. Living Documentation
**Definition:** Documents that describe current state and evolve with the codebase.

**Examples:**
- `SYSTEM_ARCHITECTURE.md` - System design
- `API_V3_OVERVIEW.md` - API endpoints and contracts
- `CACHE_ARCHITECTURE.md` - Caching strategy
- `README.md` - Project overview
- `CLAUDE.md` / `.claude/CLAUDE.md` - AI collaboration guidelines

**Maintenance:**
- Review quarterly or when major changes occur
- Add "Last Reviewed: YYYY-MM-DD" at top of document
- Update immediately when underlying system changes

### 2. Historical Documentation
**Definition:** Documents that capture point-in-time decisions or completed work.

**Examples:**
- Sprint plans (after completion)
- Session reports
- Analysis documents (e.g., test coverage, concurrency analysis)
- Planning documents (after implementation)

**Maintenance:**
- Archive to `docs/archive/YYYY-MM/` after completion
- Add completion status banner at top
- Never delete - maintain for historical reference

### 3. Guides and Tutorials
**Definition:** Step-by-step instructions for specific tasks.

**Examples:**
- `docs/guides/CSV_AB_TESTING_CONSOLIDATED.md`
- `README_TESTING.md`
- Integration guides

**Maintenance:**
- Review when underlying feature changes
- Consolidate redundant guides
- Keep examples up-to-date with current code

### 4. Reference Documentation
**Definition:** Static reference material that rarely changes.

**Examples:**
- OpenAPI specs (auto-generated)
- Type definitions
- Error code catalogs

**Maintenance:**
- Auto-generated docs: Update via code changes
- Manual references: Review annually

---

## Maintenance Schedule

### Quarterly Review (Every 3 months)
**Target:** Living documentation

**Actions:**
1. Review "Last Reviewed" dates
2. Verify accuracy against current codebase
3. Update metrics and status sections
4. Archive completed work

**Trigger:** End of each quarter (March, June, September, December)

### Post-Sprint Review (After major work)
**Target:** Sprint-related documentation

**Actions:**
1. Archive completed sprint plans
2. Update project status in INDEX.md
3. Consolidate redundant planning docs
4. Update TODO.md with new priorities

**Trigger:** Completion of P0/P1 sprints

### Ad-Hoc Review (As needed)
**Target:** Specific documents

**Actions:**
1. Update when feature implementation changes
2. Correct inaccuracies when discovered
3. Add clarifications based on user confusion

**Trigger:** Code changes, bug reports, questions from team

---

## Review Process

### 1. Check for Staleness
**Indicators:**
- "Last Reviewed" date >6 months old
- Status shows "In Progress" for completed work
- References to deprecated features
- Broken links to other documents

### 2. Verify Accuracy
**Questions:**
- Does the document match current code?
- Are code examples up-to-date?
- Are metrics and statistics current?
- Are links valid and pointing to correct locations?

### 3. Update or Archive
**Decision Tree:**
```
Is the document still relevant?
├─ Yes → Update and add "Last Reviewed" date
└─ No → Is it historical?
    ├─ Yes → Archive to docs/archive/YYYY-MM/
    └─ No → Delete (rare - prefer archiving)
```

### 4. Add Review Metadata
**Format:**
```markdown
**Last Reviewed:** January 11, 2026
**Reviewed By:** AI Team
**Status:** Current ✅
```

---

## Archive Structure

### Directory Layout
```
docs/
├── archive/
│   ├── 2025-12/      # December 2025 archives
│   ├── 2026-01/      # January 2026 archives
│   └── README.md     # Archive index
├── guides/           # Current guides
├── plans/            # Active planning docs
└── [living docs]     # Current documentation
```

### Archive Naming
**Convention:** Keep original filename when archiving

**Examples:**
- `SPRINT_PLAN_3_4.md` → `docs/archive/2026-01/SPRINT_PLAN_3_4.md`
- `CODE_QUALITY_SESSION_2026-01-08.md` → `docs/archive/2026-01/CODE_QUALITY_SESSION_2026-01-08.md`

**Why:** Preserves context and makes restoration easier if needed

### Archive Banner
Add at top of archived documents:
```markdown
> **ARCHIVED:** This document was completed on [DATE].
> Current status: [COMPLETION_STATUS]
> See [TODO.md](../../TODO.md) for current project status.
```

---

## Documentation Standards

### File Naming
- Use `UPPERCASE_WITH_UNDERSCORES.md` for root-level docs
- Use `lowercase-with-hyphens.md` for subdirectory docs
- Include dates in session reports: `SESSION_2026-01-11.md`

### Document Structure
**Required Sections:**
```markdown
# Title

**Last Updated:** YYYY-MM-DD
**Status:** [Current|Archived|Draft]

## Overview
[Brief description]

## [Content sections]

---

**Last Reviewed:** YYYY-MM-DD
```

### Version Control
- All documentation lives in git
- Commit messages should reference doc changes
- Use conventional commits: `docs: Update architecture with new caching layer`

---

## Consolidation Guidelines

### When to Consolidate
**Triggers:**
- 3+ documents covering the same topic
- Overlapping content causing confusion
- User questions about "which doc is current?"

### Consolidation Process
1. **Identify:** Find all related documents
2. **Analyze:** Determine unique vs. redundant content
3. **Merge:** Create single authoritative document
4. **Archive:** Move old versions to archive with status banner
5. **Update:** Update INDEX.md and cross-references

**Example:**
- `CSV_AB_TESTING.md` + `CSV_AB_TESTING_EXAMPLE.md` + `CSV_AB_TESTING_UPDATE_JAN_2026.md`
- → `CSV_AB_TESTING_CONSOLIDATED.md`
- Archive old versions to `docs/archive/2026-01/CSV_AB_TESTING_v*.md`

---

## Tooling

### Automated Checks (Future)
- [ ] Lint for broken links
- [ ] Check "Last Reviewed" dates >6 months
- [ ] Validate INDEX.md references all docs
- [ ] Auto-generate OpenAPI docs

### Manual Tools (Current)
- **doc-detective agent** - Periodic audit for staleness
- **grep/find** - Search for stale references
- **git log** - Track when files last changed

---

## Ownership

### Primary Maintainer
**AI Team** (Claude Code, cf-ops-monitor, cf-code-reviewer, PAL MCP)

### Human Owner
**@jukasdrj** - Final approval for major changes

### Contributors
**Anyone** - Can propose updates via PRs or direct edits

---

## Metrics

### Health Indicators
- **Freshness:** % of docs with "Last Reviewed" <6 months
- **Completeness:** % of features with documentation
- **Accuracy:** Issues filed for doc inaccuracies
- **Discoverability:** Time to find relevant doc

### Target Thresholds
- Freshness: >80% reviewed within 6 months
- Completeness: 100% of public APIs documented
- Accuracy: <1 doc issue per month
- Discoverability: All docs linked from INDEX.md

---

## Examples

### Good Documentation ✅
```markdown
# Feature X Documentation

**Last Updated:** January 11, 2026
**Last Reviewed:** January 11, 2026
**Status:** Current ✅

## Overview
Feature X does Y by leveraging Z...

[Content with current code examples]

---

**Maintained By:** AI Team
**Last Reviewed:** January 11, 2026
```

### Outdated Documentation ❌
```markdown
# Feature X Documentation

Created: December 2024
Status: In Progress (this is misleading if complete!)

## Overview
Feature X uses deprecated API v2... (wrong!)

[Old code examples that no longer work]
```

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-11 | Initial version | AI Team |

---

**Next Review:** April 2026 (Quarterly)
**Version:** 1.0
**Status:** Active Policy
