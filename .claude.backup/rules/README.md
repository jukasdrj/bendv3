# BooksTrack Rules

This directory contains project-specific rules for Claude Code (v2.0.64+).

Rules are automatically loaded and provide context-aware guidance during development.

## Rule Files

| File | Purpose |
|------|---------|
| `cloudflare-workers.md` | Workers-specific patterns, env bindings, async |
| `api-design.md` | V3 API contract, response format, circuit breaker |
| `testing.md` | Resource-aware testing, coverage requirements |

## How Rules Work

- Rules are loaded at session start
- They provide persistent context throughout the session
- Rules supplement (don't replace) `.claude/CLAUDE.md` guidelines

## Adding New Rules

1. Create a `.md` file in this directory
2. Keep rules concise and actionable
3. Focus on project-specific constraints
4. Update this README with the new rule file

---

**Feature:** Claude Code 2.0.64+ `.claude/rules/` support
**Documentation:** https://code.claude.com/docs/en/memory
