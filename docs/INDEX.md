# BooksTrack Backend Documentation

**Last Updated:** January 11, 2026

This is the central navigation hub for all BooksTrack backend documentation.

---

## 🚀 Quick Start

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview, setup instructions, testing guide |
| [CLAUDE.md](../CLAUDE.md) | Quick reference for Claude Code (lightweight) |
| [.claude/CLAUDE.md](../.claude/CLAUDE.md) | **Full guidelines** - architecture, patterns, AI workflows |
| [TODO.md](../TODO.md) | Current sprint planning and prioritized work items |

---

## 📖 Core Documentation

### System Architecture
- **[SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)** - Cross-repo architecture (Bend + Alexandria)
- **[CACHE_ARCHITECTURE.md](CACHE_ARCHITECTURE.md)** - KV + D1 dual-storage, Alexandria-first caching
- **[AGENTS.md](AGENTS.md)** - Autonomous agent system (cf-ops-monitor, cf-code-reviewer)
- **[PRD.md](PRD.md)** - Product requirements and roadmap

### API Documentation
- **[API_V3_OVERVIEW.md](API_V3_OVERVIEW.md)** - V3 API guide (OpenAPI, routes, examples)
- **[API_VERSIONING.md](API_VERSIONING.md)** - Versioning strategy, deprecation policy
- **[V3_FRONTEND_HANDOFF.md](V3_FRONTEND_HANDOFF.md)** - iOS integration guide
- **[V3_CONTRACT_TESTING.md](V3_CONTRACT_TESTING.md)** - Contract testing patterns

---

## 🔧 Development Guides

### Testing
- **[README_TESTING.md](../README_TESTING.md)** - Resource-aware testing (smoke, safe, full)
- **[TEST_SUITE_CLEANUP.md](TEST_SUITE_CLEANUP.md)** - Test organization and cleanup
- **[TEST_COVERAGE_ANALYSIS_2026-01-09.md](TEST_COVERAGE_ANALYSIS_2026-01-09.md)** - Coverage analysis

### Code Organization
- **[UTILS_ORGANIZATION.md](UTILS_ORGANIZATION.md)** - Utility file organization
- **[D1_CONCURRENCY_ANALYSIS.md](D1_CONCURRENCY_ANALYSIS.md)** - D1 database patterns

### Integration
- **[ALEXANDRIA-CONTRACT-TESTING.md](ALEXANDRIA-CONTRACT-TESTING.md)** - Alexandria RPC testing
- **[ALEXANDRIA_VERSION_SYNC.md](ALEXANDRIA_VERSION_SYNC.md)** - Cross-repo version management
- **[CI_CONTRACT_CHECK_MIGRATION.md](CI_CONTRACT_CHECK_MIGRATION.md)** - CI/CD contract validation
- **[EXTERNAL_ID_RESOLUTION.md](EXTERNAL_ID_RESOLUTION.md)** - External ID handling

---

## 📋 Sprint Planning

### Active Sprints
- **[SPRINT_4_SDK_PLAN.md](SPRINT_4_SDK_PLAN.md)** - Current sprint (SDK publication)
- **[SPRINT_PLAN_3_4.md](SPRINT_PLAN_3_4.md)** - Sprint 3 & 4 roadmap

### Sprint History
- **[TODO_AUDIT_2026-01-08.md](TODO_AUDIT_2026-01-08.md)** - Sprint 2 completion audit

---

## 📦 Deployment

### Production
- **Production API:** https://api.oooefam.net
- **Health Check:** https://api.oooefam.net/health
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **API Docs:** https://api.oooefam.net/v3/docs

### Deployment Guides
See `deployment/` subdirectory (if exists) or refer to [.claude/CLAUDE.md](../.claude/CLAUDE.md) for deployment patterns.

---

## 🗄️ Archive

Historical documentation and completed project artifacts:
- **[archive/](archive/)** - Archived planning docs, session reports, completed work

---

## 🤖 AI Context Files

Claude Code configuration and guidelines:
- **[.claude/CLAUDE.md](../.claude/CLAUDE.md)** - Complete AI collaboration guidelines
- **[.claude/rules/](../.claude/rules/)** - Project-specific rules (API, testing, Workers patterns)

---

## 📊 Project Status

**Current Phase:** Sprint 4 - SDK Publication (Phase 1 in progress)

**Recent Completions:**
- ✅ Sprint 2: Frontend Optimization (Jan 6, 2026)
- ✅ Sprint 1: TypeScript Error Resolution (95.8% type safety)
- ✅ TypeScript Migration: 100% complete (149/149 files)
- ✅ V1/V2 API Removal: Legacy endpoints removed
- ✅ Alexandria RPC Migration: Thin client architecture

**Production Health:**
- 0% error rate (7 days)
- P95 latency: 145ms (cached), 850ms (cold)
- Cache hit ratio: 73%
- Test coverage: 75%+

---

## 🔗 External Links

- **TypeScript SDK:** https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client
- **GitHub Repository:** https://github.com/jukasdrj/bendv3
- **Cloudflare Dashboard:** (see wrangler.jsonc for account IDs)

---

**Maintained by:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer, Jules, PAL MCP)
**Human Owner:** @jukasdrj
