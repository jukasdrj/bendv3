# Issue Resolution Plans

**Date:** 2025-11-21
**Author:** Jules

This document outlines the resolution plans for the currently active issues listed in `.claude/CLAUDE.md` and `docs/PRD_ALIGNMENT_TRACKING.md`.

## Summary of Active Issues

| Issue | Priority | Title | Status | Target |
|-------|----------|-------|--------|--------|
| #240  | P2       | PRD Alignment Tracking | In Progress | Q4 2025 |
| #241  | P3       | Content-based recommendations engine | Planned | Q1 2026 |
| #174  | P3       | Monitoring Dashboard | Planned | Q1 2026 |
| #161  | P3       | Set up Copilot instructions | Planned | Q1 2026 |
| #147  | P3       | Phase 4 advanced concurrency & edge case tests | Deferred | Q2 2026 |
| #47   | P3       | Phase 2 test refactoring & duplicate removal | Deferred | Q3 2026 |

---

## Detailed Resolution Plans

### #240: PRD Alignment Tracking
**Goal:** Create and maintain a living document tracking alignment with PRD.
**Current Status:** `docs/PRD_ALIGNMENT_TRACKING.md` exists and is comprehensive (Nov 21, 2025).
**Resolution Plan:**
1.  **Verify Currency:** Ensure `docs/PRD_ALIGNMENT_TRACKING.md` reflects the latest codebase state.
2.  **Regular Updates:** Schedule monthly reviews (next: Dec 15, 2025).
3.  **Linkage:** Ensure `README.md` and `AGENTS.md` point to this document.
4.  **Close Issue:** Since the document exists and is active, the initial task of *creating* it is done. The issue can be closed or converted to a recurring maintenance task.

### #241: Content-based recommendations engine
**Goal:** Implement a system to suggest books based on content/metadata.
**Resolution Plan (6 Phases):**
1.  **Phase 1: Analysis (Week 1-2):** Analyze distribution of subject tags and authors in existing DB. Determine feasibility of TF-IDF on Workers (memory constraints).
2.  **Phase 2: Design (Week 3):** Define `RecommendationService`. Design API: `GET /v1/recommendations/{isbn}`.
3.  **Phase 3: Prototype (Week 4-5):** Implement simple Jaccard similarity or Cosine similarity on `subjectTags`.
4.  **Phase 4: API Implementation (Week 6):** create route and handler. Add caching (critical for compute-heavy ops).
5.  **Phase 5: Optimization (Week 7):** Move computation to a scheduled Durable Object or separate worker if too heavy.
6.  **Phase 6: Rollout (Week 8):** Feature flag release.

### #174: Monitoring Dashboard
**Goal:** Comprehensive observability.
**Resolution Plan:**
1.  **Metrics Definition:** Identify key metrics missing from current Analytics Engine (e.g., custom business logic errors).
2.  **Dashboard Page:** Enhance `dashboard/` (Harvest) to include a "Health" tab.
3.  **Alerting:** Implementation of programmatic alerts is limited in Workers without external service. Plan to use email/webhook notifications via `fetch` in `cf-ops-monitor` or a scheduled cron trigger that checks metrics.
4.  **Integration:** Ensure all new endpoints record metrics to Analytics Engine.

### #161: Set up Copilot instructions
**Goal:** Configure Copilot for the project.
**Current Status:** `.github/copilot-instructions.md` exists.
**Resolution Plan:**
1.  **Review:** Check if `.github/copilot-instructions.md` covers all recent changes (Hono router, ResponseEnvelope v2.0).
2.  **Refinement:** Add examples of *bad* patterns to avoid (e.g., blocking the event loop).
3.  **Team Adoption:** Share with the team (if applicable).
4.  **Close Issue:** Mark as complete if no further changes needed.

### #147: Phase 4 advanced concurrency & edge case tests
**Goal:** Verify system stability under load.
**Resolution Plan:**
1.  **Scope:** Focus on `ProgressWebSocketDO` and Batch Enrichment.
2.  **Tooling:** Use `k6` or `miniflare`'s ability to run multiple requests.
3.  **Test Cases:**
    *   Simultaneous updates to the same `jobId`.
    *   Race conditions in KV cache writes.
    *   Rate limit saturation behavior.
4.  **Implementation:** Add `tests/concurrency/` suite.

### #47: Phase 2 test refactoring & duplicate removal
**Goal:** Clean up test suite.
**Resolution Plan:**
1.  **Identification:** Use `jscpd` or similar tool to find duplicates.
2.  **Abstraction:** Create `MockProvider` factory in `tests/utils`.
3.  **Refactor:** Rewrite tests in `tests/handlers/` to use new factories.
4.  **Verification:** Ensure no regression in test coverage.
