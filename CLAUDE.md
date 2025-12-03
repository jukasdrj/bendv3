# BooksTrack Backend - Claude Code Quick Reference

**Version:** 2.5 | **Tech Stack:** Cloudflare Workers, TypeScript | **Updated:** December 3, 2025

> **📖 For comprehensive Claude Code guidelines, see [`.claude/CLAUDE.md`](.claude/CLAUDE.md)**
>
> This file is a lightweight quick reference. For detailed patterns, architecture, and AI collaboration workflows, refer to the full documentation.

---

## 🚨 CRITICAL: API Version Status

**Current:** V3 (Native Hono OpenAPI) - December 2025
**Sunset Dates:** V1 (March 1, 2026) | V2 (TBD, 90 days after V3 GA)

### Documentation
- **[docs/openapi.yaml](docs/openapi.yaml)** - V2 OpenAPI 3.1 spec (source of truth)
- **[docs/V3_MIGRATION_COMPLETE.md](docs/V3_MIGRATION_COMPLETE.md)** - V3 migration guide

### Endpoint Status
| Path | Status | Notes |
|------|--------|-------|
| `/v3/*` | 🚀 CURRENT | Native Hono OpenAPI, full zod@4 support |
| `/api/v2/*` | ✅ STABLE | Production ready, deprecation TBD |
| `/v1/*` | ⚠️ DEPRECATED | Sunset March 2026 (deprecation headers active) |
| `/search/*` | ⛔ REMOVED | Legacy routes removed |

### Key V3 Endpoints (NEW!)
- `GET /v3/books/:isbn` - Get book by ISBN with full metadata
- `GET /v3/openapi.json` - OpenAPI 3.1 specification
- `GET /v3/docs` - Interactive Swagger UI

### Key V2 Endpoints
- `GET /api/v2/search` - Unified search (replaces all V1 search)
- `POST /api/v2/books/enrich` - Single book enrichment
- `POST /api/v2/imports` - CSV import workflow
- `GET /api/v2/imports/:id/stream` - SSE progress (replaces WebSocket)

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
- `/rewind` - Undo last change and revert conversation

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
- Per-provider circuits (google-books, open-library, isbndb, alexandria)
- 5 failures → OPEN, 2 successes → CLOSED, 60s cooldown
- KV-backed state with 5min TTL
- Analytics logging for observability

**Cache Architecture (v3.0 - Alexandria-First):**
- KV-only for book metadata (removed R2 cold storage tier)
- Alexandria as PRIMARY provider (49M+ ISBNs, 0 cost, <100ms)
- Hot/Cold TTL strategy (2h effectiveness window, 14d expiration)
- Edge cache retained for covers/static assets only
- ISBNdb harvest deprecated (Alexandria replaces)
- See [docs/CACHE_ARCHITECTURE.md](docs/CACHE_ARCHITECTURE.md) for details

**Testing:**
- Vitest framework (forks pool, max 2 forks)
- Mock external APIs (no real calls)
- 75%+ coverage target
- Resource-aware modes: `test:smoke` (5s), `test:safe` (512MB limit)
- See [README_TESTING.md](README_TESTING.md) for laptop-safe practices

---

## 📊 Current Sprint Status

**Active Issues:** 0 (as of Dec 3, 2025) - ALL COMPLETE! 🎉

**Recent Completions (Dec 3, 2025):**
- ✅ **Alexandria Worker v2.1.0** - Updated package integration
  - Added `CombinedSearchQuery` and `CombinedSearchResult` types
  - New `/api/search/combined` endpoint support available
  - `SearchResult.count` deprecated in favor of `pagination.total`
  - Full backward compatibility maintained (BooksTrack uses ISBN lookups only)
- ✅ **Cache Architecture v3.0** - Alexandria-first optimization
  - Removed R2 cold storage tier (Alexandria provides persistence)
  - Removed legacy cache format backward compatibility
  - Simplified unified-cache to KV-only path
  - Deprecated ISBNdb harvest (Alexandria replaces)
  - Added V1 deprecation headers (RFC 8594)

**Previous Major Milestones:**
- ✅ V3 API Complete (Dec 2025): Native Hono OpenAPI, zod@4 validation
- ✅ Circuit Breaker Chain (Nov 27): All 9 external APIs protected
- ✅ Sprint 3 Phase 2 (Nov 21): ResponseEnvelope v2.0, Hono migration
- ✅ Sprint 3 Phase 1 (Nov 20): R2 cleanup, WebSocket fixes

**See [.claude/CLAUDE.md](.claude/CLAUDE.md) for full architectural details.**

---

## 🔗 Quick Links

- **Production API:** https://api.oooefam.net
- **Health Endpoint:** https://api.oooefam.net/health
- **Full Guidelines:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **Architecture Overview:** [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md)

---

**Last Updated:** December 3, 2025
**Maintained by:** Justin Gardner (@jukasdrj)
**Full Documentation:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
