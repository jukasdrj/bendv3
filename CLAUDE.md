# BooksTrack Backend - Claude Code Quick Reference

**Version:** 2.3 | **Tech Stack:** Cloudflare Workers, TypeScript | **Updated:** November 27, 2025

> **📖 For comprehensive Claude Code guidelines, see [`.claude/CLAUDE.md`](.claude/CLAUDE.md)**
>
> This file is a lightweight quick reference. For detailed patterns, architecture, and AI collaboration workflows, refer to the full documentation.

---

## 🚀 Quick Start

```bash
# Development
npm install
npm run dev                    # Start local Wrangler dev server

# Testing (Resource-Aware - Prevents Laptop Crashes)
npm run test:smoke             # ⚡ Quick validation (5s, minimal resources)
npm run test:safe              # 🛡️ Full suite with limits (60s, 512MB max)
npm run test:unit              # 🎯 Unit tests only (skip integration)
npm run validate               # ✅ Pre-commit check (smoke + lint)

# Testing (Advanced - Use on 16GB+ RAM or CI/CD)
npm test                       # Full test suite (may overwhelm 8GB laptops)
npm run test:watch             # Watch mode (high CPU usage)
npm run test:coverage          # Coverage analysis (memory-intensive)

# Deployment
npm run deploy                 # Deploy to production
```

**💡 Testing Guide:** See [README_TESTING.md](README_TESTING.md) for laptop-safe testing practices

---

## 📋 Documentation Map

**Core Documentation:**
- **[.claude/CLAUDE.md](.claude/CLAUDE.md)** - Full Claude Code guidelines (architecture, patterns, AI workflows)
- **[AGENTS.md](AGENTS.md)** - Universal AI agent guide (all tools)
- **[README.md](README.md)** - Project overview and setup
- **[docs/openapi.yaml](docs/openapi.yaml)** - OpenAPI 3.1 spec (source of truth)

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
- Canonical response format (see openapi.yaml)
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
- Vitest framework (forks pool, max 2 forks)
- Mock external APIs (no real calls)
- 75%+ coverage target
- Resource-aware modes: `test:smoke` (5s), `test:safe` (512MB limit)
- See [README_TESTING.md](README_TESTING.md) for laptop-safe practices

---

## 📊 Current Sprint Status

**Active Issues:** 0 (as of Nov 27, 2025) - ALL COMPLETE! 🎉
- **P1:** 0 ✅
- **P2:** 0 ✅
- **P3:** 0 ✅

**Recent Completions (Nov 26-27, 2025):**
- ✅ **Circuit Breaker Chain Complete** - Issues #80, #77, #97, #98, #99, #100, #81
  - Core CircuitBreaker class with CLOSED/OPEN/HALF_OPEN states
  - All 9 external API functions protected
  - Structured error differentiation (NOT_FOUND, CIRCUIT_OPEN, RATE_LIMIT, etc)
  - Cache monitoring and alerting integrated
  - 16 comprehensive unit tests passing
  - Full API contract documentation (v2.7.1)
  - 100% production deployment success

**Previous Major Milestones:**
- ✅ Sprint 3 Phase 2 (Nov 21): ResponseEnvelope v2.0, Hono migration, CORS consolidation
- ✅ Sprint 3 Phase 1 (Nov 20): R2 cleanup, WebSocket race condition fixes
- ✅ Sprint 2 (Nov 20): 6 documentation issues

**See [.claude/CLAUDE.md](.claude/CLAUDE.md) for full architectural details.**

---

## 🔗 Quick Links

- **Production API:** https://api.oooefam.net
- **Health Endpoint:** https://api.oooefam.net/health
- **Full Guidelines:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **Architecture Overview:** [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)

---

**Last Updated:** November 28, 2025
**Maintained by:** Justin Gardner (@jukasdrj)
**Full Documentation:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
