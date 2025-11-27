# BooksTrack Backend - Claude Code Quick Reference

**Version:** 2.3 | **Tech Stack:** Cloudflare Workers, TypeScript | **Updated:** November 21, 2025

> **📖 For comprehensive Claude Code guidelines, see [`.claude/CLAUDE.md`](.claude/CLAUDE.md)**
>
> This file is a lightweight quick reference. For detailed patterns, architecture, and AI collaboration workflows, refer to the full documentation.

---

## 🚀 Quick Start

```bash
# Development
npm install
npm run dev                    # Start local Wrangler dev server

# Testing
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage

# Deployment
npm run deploy                 # Deploy to production
```

---

## 📋 Documentation Map

**Core Documentation:**
- **[.claude/CLAUDE.md](.claude/CLAUDE.md)** - Full Claude Code guidelines (architecture, patterns, AI workflows)
- **[AGENTS.md](AGENTS.md)** - Universal AI agent guide (all tools)
- **[README.md](README.md)** - Project overview and setup
- **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)** - API contract (source of truth)

**AI Context:**
- `.ai/` - AI-specific prompts and templates
- `.claude/` - Claude Code configuration (MCP, commands, agents)
- `.github/` - GitHub agents (Jules, Copilot)

**Deployment & Operations:**
- `docs/deployment/` - Deployment, secrets, monitoring, rollback
- `docs/guides/` - Feature-specific guides

---

## 🤖 AI Tools Quick Reference

**Autonomous Agents:**
- `/deploy` - Deploy with monitoring (@cf-ops-monitor)
- `/review` - Code quality review (@cf-code-reviewer)
- `/logs [filter]` - Stream production logs
- `/rollback` - Rollback deployment
- `/cache-check` - KV cache performance

**MCP Tools (Zen):**
- `mcp__zen__debug` - Deep debugging (Grok-4)
- `mcp__zen__codereview` - Architecture review
- `mcp__zen__secaudit` - Security audit
- `mcp__zen__chat` - Collaborative thinking

---

## ⚡ Common Patterns

**Code Style:**
- TypeScript strict mode
- ES6+ features (async/await, destructuring)
- No semicolons (ASI)
- 2-space indentation

**API Design:**
- Canonical response format (see API_CONTRACT.md)
- ZERO direct client API calls
- Multi-provider orchestration
- Circuit breaker pattern for external APIs

**Routing:**
- ✅ Hono router (`src/router.ts`) - DEFAULT, add all new routes here
- ⚠️ Manual router (`src/index.js`) - DEPRECATED, removal March 2026

**Error Handling:**
- Structured errors with `success` discriminator
- Circuit breaker errors: `CIRCUIT_OPEN`, `RATE_LIMIT`, `API_ERROR`
- Retryable flag + `retryAfterMs` for intelligent retry
- Provider-specific error context

**Circuit Breaker:**
- Per-provider circuits (google-books, open-library, isbndb)
- 5 failures → OPEN, 2 successes → CLOSED, 60s cooldown
- KV-backed state with 5min TTL
- Analytics logging for observability

**Testing:**
- Vitest framework
- Mock external APIs (no real calls)
- 75%+ coverage target

---

## 📊 Current Sprint Status

**Active Issues:** 2 (as of Nov 26, 2025) - DOWN FROM 11! 🎉
- **P1:** 0 (ALL COMPLETE ✅)
- **P2:** 1 (PRD tracking #240)
- **P3:** 1 (Documentation #96)

**Recent Completions:**
- ✅ **Circuit Breaker Chain (Nov 26)** - Issues #80, #77, #97, #98
  - Core CircuitBreaker class with CLOSED/OPEN/HALF_OPEN states
  - All 9 external API functions protected
  - Structured error differentiation (NOT_FOUND, CIRCUIT_OPEN, RATE_LIMIT, etc)
  - 16 comprehensive unit tests passing
  - Full API contract documentation (v2.7.1)
- ✅ Sprint 3 Phase 2: 6 P1/P2 issues complete (Nov 21)
  - #245: Cache-metrics v2.0 migration
  - #242: ResponseEnvelope migration complete
  - #239: CORS policy consolidated
  - #243: Manual router deprecated
  - #180: CSV duplication eliminated
  - #170: WebSocket limits added
- ✅ Sprint 3 Phase 1: 2 reliability fixes (Nov 20)
- ✅ Sprint 2: 6 documentation issues (Nov 20)

**See [.claude/CLAUDE.md](.claude/CLAUDE.md) for full issue tracking.**

---

## 🔗 Quick Links

- **Production API:** https://api.oooefam.net
- **Health Endpoint:** https://api.oooefam.net/health
- **Full Guidelines:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **Architecture Overview:** [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)

---

**Last Updated:** November 21, 2025
**Maintained by:** Justin Gardner (@jukasdrj)
**Full Documentation:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
