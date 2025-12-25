# Archived Agent Documentation

**Date:** December 25, 2025  
**Reason:** Consolidated into CLAUDE.md files and docs/SYSTEM_ARCHITECTURE.md

## What Was Archived

### bendv3
- `deprecated-ai-context/` - Former `.ai/` folder (context.md, prompts)
- `deprecated-github-agents/` - Former `.github/agents/` (cf.agent.md)
- `AGENTS.md.bak` - Former root AGENTS.md (merged into CLAUDE.md)

### books-v3
- `deprecated-ai-context/` - Former `.ai/` folder (SHARED_CONTEXT.md, gemini-config.md)
- `deprecated-github-agents/` - Former `.github/agents/` (Docs_dude.md, archy.md, etc.)

### alex
- `docs/archive/AGENTS.md.bak` - Former root AGENTS.md (merged into CLAUDE.md)

## What Was Kept

- `books-v3/AGENTS.md` - 847 lines of unique iOS/Swift patterns (valuable reference)
- `bendv3/docs/AGENTS.md` - Documents automation agents (different purpose)
- `.github/workflows/` - All GitHub Actions workflows
- `.github/commands/` - Gemini Code Assist commands (used by workflows)
- `.claude/` folders - Claude Code settings (required)

## New Structure

The consolidated documentation now lives in:
- `CLAUDE.md` (each repo) - AI context with Agent Role section
- `bendv3/docs/SYSTEM_ARCHITECTURE.md` - Cross-repo hub
- `*/docs/CROSS_REPO.md` - Pointers to hub
