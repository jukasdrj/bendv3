# BooksTrack Backend - Backlog & Sprint Plan

**Last Updated:** November 25, 2025
**Status:** Launch Blockers Identified

---

## Executive Summary

**Total Open Issues:** 18
**Launch Blockers:** 3 (Cloudflare Workflows #19, #20, #71)
**Production Status:** Stable (11+ days, 72% cost savings achieved)

> **⚠️ CRITICAL:** Cloudflare Workflows implementation is required before launch.
> See [Launch Blockers](#launch-blockers-critical) section below.

---

## Soft Launch Readiness Checklist

### Production Health
- [x] Health endpoint operational (`/health`)
- [x] Metrics endpoint operational (`/metrics`)
- [x] WebSocket hibernation stable (24,000+ cycles, 0 failures)
- [x] R2 storage migration complete
- [x] API Contract v2.6.1 documented
- [x] 90.9% test pass rate (1204/1324)

### Core Features
- [x] Book search by ISBN, title, author
- [x] CSV import with progress tracking
- [x] Bookshelf image scanning (Gemini AI)
- [x] Real-time WebSocket progress updates
- [x] Cache layer (KV + D1)
- [x] Rate limiting

### Documentation
- [x] API_CONTRACT.md (v2.6.1)
- [x] Sprint 1 Retrospective
- [x] R2 Migration Status Report

---

## Backlog Organization

### Label Legend
| Label | Description |
|-------|-------------|
| `launch-blocker` | **CRITICAL** - Required before launch |
| `priority: critical` | Must be completed immediately |
| `post-launch` | Post launch backlog |
| `sprint-2` | Sprint 2: Workflows & Architecture |
| `sprint-3` | Sprint 3: D1 & AI Features |
| `priority: low` | Low priority enhancements |

---

## Launch Blockers (CRITICAL)

**⚠️ These issues MUST be completed before launch.**

| # | Issue | Focus | Effort | Status |
|---|-------|-------|--------|--------|
| 71 | **[MASTER] Cloudflare Workflows Implementation** | Workflows | 20h | Not started |
| 19 | Cloudflare Workflows Configuration & Structure | Workflows | 6h | Not started |
| 20 | Complete Workflow Implementation | Workflows | 6h | Not started |

**Total Effort:** ~20 hours (consolidated - #19/#20 are sub-tasks of #71)

**Why Critical:**
- Current JobStateManagerDO is complex and fragile
- Workflows provide automatic state persistence
- Workflows provide automatic retries on failure
- 60% code reduction expected
- Required for reliable book import pipeline

**Key Deliverables:**
- Native Cloudflare Workflows for book import
- Automatic state persistence and retries
- Simplified error handling
- Production-ready reliability

---

## Sprint 2: Workflows & Architecture (4 issues)

**Theme:** Cloudflare Workflows migration for simplified state management
**Duration:** 4-5 days
**Priority:** LAUNCH BLOCKING (#19, #20) + Post-launch (#21, #22)
**Note:** RPC migration (#17-18) COMPLETE - closed

| # | Issue | Focus | Effort | Status |
|---|-------|-------|--------|--------|
| ~~17~~ | ~~RateLimiterDO Pure RPC Migration~~ | ~~RPC~~ | ~~4h~~ | ✅ CLOSED |
| ~~18~~ | ~~Complete RPC Migration & Unit Tests~~ | ~~RPC~~ | ~~4h~~ | ✅ CLOSED |
| 19 | Cloudflare Workflows Configuration | Workflows | 6h | **LAUNCH BLOCKER** |
| 20 | Complete Workflow Implementation | Workflows | 6h | **LAUNCH BLOCKER** |
| 21 | Integration Testing Harness | Testing | 4h | Post-launch |
| 22 | Data Integrity Validation | Validation | 4h | Post-launch |

**Total Effort:** ~20 hours (8h post-launch)

**Key Deliverables:**
- Native Cloudflare Workflows for book import
- 60% code reduction in JobStateManagerDO
- Automatic state persistence and retries

---

## Sprint 3: D1 & AI Features (7 issues)

**Theme:** Database optimization and AI-powered features
**Duration:** 8 days
**Priority:** Post-launch

| # | Issue | Focus | Effort |
|---|-------|-------|--------|
| 23 | D1 Query Analysis & Index Planning | D1 | 4h |
| 24 | D1 Index Implementation | D1 | 4h |
| 25 | Vectorize Setup & Embedding Infrastructure | AI | 8h |
| 26 | Workflow Integration for Embeddings | AI | 6h |
| 27 | Workflow Testing Infrastructure | Testing | 4h |
| 28 | E2E Workflow Integration Tests | Testing | 4h |
| 30 | Performance Validation & Documentation | Docs | 4h |

**Total Effort:** ~34 hours (1.5 weeks)

**Key Deliverables:**
- D1 performance indexes
- Vectorize for semantic search
- Book embeddings generation
- Recommendation engine foundation

---

## Low Priority Backlog (4 issues)

**Theme:** Enhancements and optimizations
**Priority:** As time permits

| # | Issue | Description | Effort |
|---|-------|-------------|--------|
| 39 | Enhanced Metadata Harvesting | Improve cover/metadata quality | 4h |
| 40 | Background Cache Refresh | Proactive cache warming | 4h |
| 42 | Database Triggers | Auto-update timestamps in D1 | 2h |
| 43 | JSON Validation | Validate D1 metadata fields | 2h |

**Total Effort:** ~12 hours

---

## Completed Sprints

### Phase 2A: KV→D1 Migration (COMPLETE)
**Status:** 100% Complete - Live in Production
**Key Achievement:** D1 database is now source of truth

**Evidence:**
- `wrangler.jsonc`: `ENABLE_D1_WRITES=true`, `D1_READ_PERCENTAGE=100`
- `src/repositories/book-repository.ts`: Smart router with dual-write
- `migrations/`: 6 migration files applied (0001-0006)
- D1 database: `bookstrack-library` (ID: cc19e622-9d0d-45f6-991c-1ab1933f257c)

**What's Operational:**
- D1 database schema (Books, Authors, BookAuthors, UserLibrary)
- Dual-write: KV + D1 (KV as cache layer)
- 100% reads from D1 with KV fallback
- Complex queries (JOINs, filters) available

---

### Sprint 1: Stabilization & Cost Control (COMPLETE)
**Status:** 87.5% Complete (7/8 tasks)
**Duration:** November 14-25, 2025 (11 days)
**Key Achievement:** 72% cost savings delivered

**Closed Issues:**
- #8-15: Original Sprint 1 tasks
- #64-68: Sprint 1 Week 2-3 tasks
- #29: WebSocket Reliability (done via hibernation)
- #35: Prometheus metrics endpoint
- #37: Monitoring Dashboard
- #38: API Contract Validation
- #41: WebSocket Connection Management
- #44: Feature Flag Documentation
- #45: Sprint Review & Cleanup

---

## Recommended Sprint Order

### Pre-Launch (REQUIRED)
**Cloudflare Workflows:** Issues #71 (master), #19, #20
- **Effort:** ~20 hours (2-3 days focused work)
- **Priority:** CRITICAL - Launch blocker
- Implement Cloudflare Workflows for book import pipeline
- Replace complex JobStateManagerDO state management
- Enable automatic retries and state persistence

### Post-Launch Week 1
**Sprint 2 Completion:** Issues #21, #22
- Integration Testing Harness
- Data Integrity Validation

### Post-Launch Week 2-3
**Sprint 3:** Issues #23-30
- D1 optimization (indexes)
- Vectorize & embeddings
- Recommendation engine foundation

### Post-Launch (As Time Permits)
**API v2 Enhancements:** Issues #69, #70
- HTTP Book Enrichment endpoint
- SSE Streaming for CSV import

---

## Quick Reference

### Issue Counts by Label
```
launch-blocker:  3 issues (#71, #19, #20) ⚠️ CRITICAL
sprint-2:        4 issues (2 blocking, 2 post-launch)
sprint-3:        7 issues
priority: low:   4 issues
post-launch:     2 issues (#69, #70 - API v2)
------------------------------------------
Total Open:     18 issues
```

### Production URLs
- **API:** https://api.oooefam.net
- **Health:** https://api.oooefam.net/health
- **Metrics:** https://api.oooefam.net/metrics

---

**Maintained by:** AI Team (Claude Code)
**Last Sprint Completed:** Sprint 1 (Nov 25, 2025)
