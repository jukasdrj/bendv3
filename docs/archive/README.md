# Documentation Archive

This directory contains historical documentation from completed work, superseded planning files, and session reports.

## Purpose

Archived documents are preserved for:
- **Historical reference** - Understanding past decisions and context
- **Audit trail** - Tracking what was planned vs. implemented
- **Knowledge preservation** - Maintaining institutional memory

## Archive Structure

```
archive/
├── 2026-01/          # January 2026 artifacts
│   ├── README.md     # Month-specific archive index
│   └── *.md          # Archived planning files
└── README.md         # This file
```

## When Documents Are Archived

Documents are moved here when:
1. **Work is completed** - Planning files for finished features/sprints
2. **Documentation is superseded** - Replaced by newer/better docs
3. **Artifacts are stale** - No longer relevant to active development
4. **Cleanup is needed** - Root directory decluttering

## Accessing Archived Content

Archived files are **not indexed** in the main documentation navigation ([docs/INDEX.md](../INDEX.md)). To find archived content:

1. Browse this directory by date
2. Check month-specific README files for indexes
3. Use git history: `git log -- docs/archive/`

## Archive Policy

- **Retention:** Indefinite (git history preserves all)
- **Organization:** By year-month (YYYY-MM)
- **Format:** Markdown files as-is (no modifications)
- **Deletion:** Never (use git if you need to remove)

## Active Documentation

For current project documentation, see:
- **[docs/INDEX.md](../INDEX.md)** - Main documentation hub
- **[README.md](../../README.md)** - Project overview
- **[TODO.md](../../TODO.md)** - Current sprint work
- **[.claude/CLAUDE.md](../../.claude/CLAUDE.md)** - AI collaboration guidelines

---

**Archive Created:** January 11, 2026
**Maintained by:** AI Team (doc-detective agent)
