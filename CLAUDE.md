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

**Routing:**
- ✅ Hono router (`src/router.ts`) - DEFAULT, add all new routes here
- ⚠️ Manual router (`src/index.js`) - DEPRECATED, removal March 2026

**Testing:**
- Vitest framework
- Mock external APIs (no real calls)
- 75%+ coverage target

---

## 📊 Current Sprint Status

**Active Issues:** 11 (as of Nov 21, 2025)
- **P1:** 2 (API contract, CORS security)
- **P2:** 4 (Hono router deprecation, PRD tracking, CSV duplication, WebSocket limits)
- **P3:** 5 (Recommendations, monitoring, tests)

**Recent Completions:**
- ✅ Issue #243 Phase 1: Manual router deprecation warnings (Nov 21)
- ✅ Sprint 2: 6 documentation issues (Nov 20)
- ✅ Sprint 3 Phase 1: 2 reliability fixes (Nov 20)

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
