# BooksTrack Backend - Claude Code Guide

**Version:** 2.2 | **Tech Stack:** Cloudflare Workers, TypeScript | **Updated:** November 18, 2025

> **📋 For universal AI agent instructions, see [`AGENTS.md`](AGENTS.md)**
> This file contains **Claude Code-specific** setup (MCP, slash commands, skills).

---

## Quick Reference

**🤖 AI Context Files:**
- **`AGENTS.md`** - Universal AI agent guide (ALL tools use this)
- **`CLAUDE.md`** - Claude Code-specific (this file)
- **`.ai/SHARED_CONTEXT.md`** - Project-wide context

---

## Shared Knowledge Base

**This project contributes to and references shared learnings across all projects.**

**Knowledge Base Location:** `~/.claude/knowledge-base/`

### Relevant Patterns

- [API Orchestration](~/.claude/knowledge-base/architectures/api-orchestration.md) - Multi-provider API orchestration design (SOURCE PROJECT)

**Patterns from other projects:**
- [Zero Warnings Policy](~/.claude/knowledge-base/decisions/zero-warnings-policy.md) - Adapt for TypeScript/ESLint

---

## MCP Setup

### Available MCP Servers

**Zen MCP Server:**
- **Providers:** Google Gemini ✅, X.AI ✅
- **Models:** Use `listmodels` tool to see all 14 available models
- **Mode:** Auto model selection

---

## Project-Specific Patterns

### Code Style

**TypeScript strict mode:**
```typescript
// Always use explicit types
function processBook(isbn: string): Promise<Book> {
  // Implementation
}

// Use readonly for immutable data
interface Book {
  readonly isbn: string;
  readonly title: string;
}
```

### API Orchestration

**See:** `~/.claude/knowledge-base/architectures/api-orchestration.md`

**Key principle:** ZERO direct client API calls. All external APIs go through orchestrator.

### Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('BookOrchestrator', () => {
  it('should merge results from multiple providers', async () => {
    const orchestrator = new BookOrchestrator(mockProviders);
    const results = await orchestrator.search('effective java');

    expect(results[0]._provider).toMatch(/orchestrated:/);
  });
});
```

---

## TodoWrite Usage

**MUST use TodoWrite for:**
- Complex multi-step tasks (3+ steps)
- API contract changes requiring multiple files
- Migration tasks

---

## Git Workflow

### Commit Messages

```
type: brief description

Optional explanation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:** feat, fix, docs, refactor, test, chore

### PR Checklist

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] API contract documentation updated
- [ ] Provider attribution tags verified

---

## Common Tasks

```bash
# Development
npm run dev

# Testing
npm test
npm run test:watch

# Linting
npm run lint
npm run lint:fix

# Deployment
npm run deploy
```

---

**Last Updated:** November 18, 2025
**Maintained by:** Justin Gardner (oooe/jukasdrj)
**See Also:** [`AGENTS.md`](AGENTS.md), [`~/.claude/knowledge-base/README.md`](~/.claude/knowledge-base/README.md)
