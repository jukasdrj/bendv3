# Sprint Plan: Hono Migration - Phase 1

**Project:** BooksTrack Backend (Cloudflare Workers)
**Sprint Goal:** Establish Hono framework foundation and migrate HTTP endpoints
**Related Issues:** #173 (Hono evaluation), #163 (WebSocket security - Phase 2)
**Created:** 2025-11-18
**Status:** Planning

---

## 1. SPRINT OVERVIEW

### Sprint Goal
Migrate BooksTrack backend from manual routing (`src/index.js`) to Hono framework for HTTP endpoints only. Establish infrastructure, testing patterns, and feature flag system for gradual rollout. WebSocket endpoints remain in manual router (deferred to Phase 2).

### Scope

**In Scope:**
- Bootstrap Hono application with TypeScript support
- Migrate V1 Search API (`/v1/search/isbn`, `/v1/search/title`, `/v1/search/author`)
- Migrate batch endpoints (`/v1/enrichment/batch`, `/v1/scan/bookshelf`, `/v1/scan/csv`)
- Migrate legacy search (`/search/title`, `/search/isbn`, etc.)
- Migrate utility endpoints (`/health`, `/metrics`)
- Feature flag system (ENABLE_HONO_ROUTER)
- Analytics tracking for A/B testing

**Out of Scope:**
- WebSocket routing (`/ws/progress`) - stays in manual router
- Durable Object routing changes
- Custom domain routing (harvest.oooefam.net)
- Authentication/JWT changes (Phase 2)

### Timeline Estimate
- **Total Story Points:** 34
- **Sprint Duration:** 2 weeks (10 working days, ~6-8 hours/day)
- **Team:** 1 Backend Engineer (you!)

---

## 2. TASK BREAKDOWN

### Infrastructure Setup (11 SP)

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **INF-1** | Install Hono (~4.6.14) and create `src/router.ts` skeleton | 2 | BE |
| **INF-2** | Configure TypeScript for Hono compatibility (tsconfig.json) | 2 | BE |
| **INF-3** | Create `src/utils/request-analytics.ts` for unified analytics | 2 | BE |
| **INF-4** | Implement feature flag toggle in `src/index.js` | 3 | BE |
| **INF-5** | Add `ENABLE_HONO_ROUTER=false` to `wrangler.toml` | 1 | BE |
| **INF-6** | Create Hono test harness using Vitest patterns | 1 | BE |

**Deliverable:** Hono app skeleton with feature flag, both routers coexist

---

### Route Migration (15 SP)

**Group A: Simple Endpoints (3 SP)**

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **MIG-1** | Migrate `/health` endpoint to Hono (proof of concept) | 1 | BE |
| **MIG-2** | Migrate `/metrics` endpoint with analytics tracking | 2 | BE |

**Group B: V1 Search API (5 SP)**

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **MIG-3** | Migrate `/v1/search/isbn` with handler → service pattern | 2 | BE |
| **MIG-4** | Migrate `/v1/search/title` and `/v1/search/author` | 3 | BE |

**Group C: Batch Endpoints (4 SP)**

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **MIG-5** | Migrate `/v1/enrichment/batch` | 2 | BE |
| **MIG-6** | Migrate `/v1/scan/bookshelf` and `/v1/scan/csv` | 2 | BE |

**Group D: Legacy Search (3 SP)**

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **MIG-7** | Migrate legacy endpoints (`/search/title`, `/search/isbn`, etc.) | 3 | BE |

**Deliverable:** All HTTP endpoints migrated to Hono, manual router handles WebSocket only

---

### Testing (5 SP)

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **TEST-1** | Run existing 728+ tests against Hono router | 2 | BE |
| **TEST-2** | Add Hono-specific route tests (404, CORS, errors) | 2 | BE |
| **TEST-3** | Performance baseline comparison (Hono vs manual) | 1 | BE |

**Deliverable:** All tests pass with both routers, performance metrics collected

---

### Deployment & Rollout (3 SP)

| ID | Task | Story Points | Owner |
|----|------|--------------|-------|
| **DEP-1** | Enable Hono in dev environment for internal testing | 1 | BE |
| **DEP-2** | Deploy with feature flag OFF to production (safety check) | 1 | BE |
| **DEP-3** | Gradual rollout plan documentation | 1 | BE |

**Deliverable:** Hono deployed but inactive, ready for A/B test activation

---

## 3. DEPENDENCY MAP

### Task Dependencies

```
[INF-1: Bootstrap Hono] -> [MIG-1: /health endpoint]
        |
        +-> [INF-2: TypeScript] -> [MIG-3: V1 Search]
        |                              |
        +-> [INF-3: Analytics] --------+-> [MIG-4: More V1]
        |                              |
        +-> [INF-4: Feature Flag] -----+-> [MIG-5: Batch]
                                       |
                                       +-> [MIG-6: Scan]
                                       |
                                       +-> [MIG-7: Legacy]
                                       |
                                       v
                            [TEST-1: Run All Tests]
                                       |
                                       v
                            [TEST-2: Hono-specific]
                                       |
                                       v
                            [DEP-1: Enable in Dev]
                                       |
                                       v
                            [DEP-2: Deploy to Prod (OFF)]
```

### Critical Path
**INF-1 → INF-2 → MIG-3 → MIG-4 → TEST-1 → DEP-2** (16 SP, ~8 working days)

---

## 4. RISK ASSESSMENT

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Hono incompatible with Cloudflare Workers env bindings | HIGH | LOW | Early POC with `/health` endpoint (MIG-1) validates Hono + Workers integration |
| Existing handlers don't translate cleanly to Hono patterns | MEDIUM | MEDIUM | Maintain handler → service separation, only router layer changes |
| TypeScript compilation errors in production | MEDIUM | LOW | Feature flag allows instant rollback, TypeScript is optional |
| Performance regression with Hono overhead | LOW | LOW | TEST-3 baseline comparison, Hono is designed for Workers (lightweight) |

### Testing Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Tests are coupled to manual routing internals | HIGH | MEDIUM | Tests should validate behavior, not routing mechanism. If tests fail, fix tests OR adapter pattern |
| Missing edge cases in Hono migration | MEDIUM | MEDIUM | Run FULL test suite (728+ tests) against both routers before enabling |
| Integration tests don't cover Hono-specific features | LOW | HIGH | TEST-2 adds Hono-specific tests (404 handling, CORS, error middleware) |

### Production Rollout Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Feature flag doesn't work, Hono activates unexpectedly | CRITICAL | LOW | Test flag in dev/staging first (DEP-1), deploy with flag OFF (DEP-2) |
| Hono router breaks critical API endpoints | HIGH | LOW | Gradual rollout: 0% → 10% → 50% → 100% over 1 week, monitor error rates |
| Rollback takes too long (>60s) | MEDIUM | LOW | Feature flag rollback is instant (< 60s via wrangler secret update) |
| Analytics data inconsistent between routers | LOW | MEDIUM | INF-3 creates unified analytics helper, both routers use same tracking |

---

## 5. SUCCESS CRITERIA

### Functional Requirements
- [ ] All 728+ existing tests pass with `ENABLE_HONO_ROUTER=true`
- [ ] All migrated endpoints return identical responses (format, status codes, headers)
- [ ] Feature flag toggles between routers without deployment
- [ ] Canonical response format preserved (`{ success, data, metadata }`)
- [ ] Error handling consistent with `API_CONTRACT.md` Section 6

### Performance Requirements
- [ ] P95 latency ≤ manual router baseline ± 5%
- [ ] Cold start time ≤ 100ms (Hono is lightweight)
- [ ] Memory usage < 128MB per request (unchanged from current)
- [ ] No increase in KV read/write operations

### Quality Gates
- [ ] Code review approved by @cf-code-reviewer agent
- [ ] Security review passed (no new vulnerabilities)
- [ ] TypeScript compilation successful (if used)
- [ ] Vitest unit tests ≥ 80% coverage for new Hono routes
- [ ] Integration tests pass in CI/CD pipeline

---

## 6. ROLLOUT STRATEGY

### Phase 1: Local Development
- Developer tests with `ENABLE_HONO_ROUTER=true` in `.dev.vars`
- All tests pass locally
- Manual testing with `wrangler dev`

### Phase 2: CI/CD Validation
- Deploy to staging with feature flag OFF
- Run full test suite (728+ tests)
- Performance baseline comparison (TEST-3)
- Enable Hono in staging, re-run tests
- Verify no regressions

### Phase 3: Production Deployment (Flag OFF)
- Deploy to production with `ENABLE_HONO_ROUTER=false`
- Health check: `/health` returns 200 OK
- Monitor for 24 hours (ensure no deployment issues)

### Phase 4: A/B Test (Gradual Rollout)

**Week 1:**
- **Day 1-2:** 10% of traffic → Hono router
  - Monitor: Error rate, P95 latency, cache hit rate
  - Rollback threshold: Error rate > 1% OR P95 > +10%

- **Day 3-4:** 50% of traffic → Hono router
  - Monitor: Same metrics as 10% phase
  - Rollback threshold: Error rate > 0.5% OR P95 > +5%

- **Day 5-7:** 100% of traffic → Hono router
  - Monitor: Same metrics for 72 hours
  - If stable, mark manual router for deprecation

**Rollback Procedure:**
```bash
# Instant rollback (<60s)
wrangler secret put ENABLE_HONO_ROUTER
# Enter: false
# Confirm deployment
```

### Phase 5: Cleanup (Sprint 2 or later)
- Remove manual routing code from `src/index.js` (after 100% stable for 2 weeks)
- Update `API_CONTRACT.md` with Hono router details (if relevant)
- Document Hono patterns in `.claude/CLAUDE.md`

---

## 7. MONITORING & OBSERVABILITY

### Key Metrics to Track

**Application Metrics:**
- Request volume by router (`router: 'hono'` vs `router: 'manual'`)
- Error rate (4xx, 5xx) by router
- P50, P95, P99 latency by router and endpoint
- Cache hit rate (should remain unchanged)

**Infrastructure Metrics:**
- CPU time per request
- Memory usage
- Cold start frequency
- KV read/write operations

**Business Metrics:**
- Search success rate
- Batch job completion rate
- WebSocket connection stability (should be unaffected in Phase 1)

### Alerting Thresholds
- Error rate > 1% for Hono router → Alert + investigate
- P95 latency > +20% vs manual router → Alert + consider rollback
- CPU time > 5 seconds → Critical alert (Workers timeout risk)

---

## 8. OPEN QUESTIONS & DECISIONS

### Decisions Required Before Sprint Start
- [ ] **TypeScript adoption:** Use `.ts` files or keep `.js`? (Recommendation: Start with `.ts` for new Hono code)
- [ ] **Middleware strategy:** Use Hono built-in middleware (CORS, compression) or custom? (Recommendation: Built-in where possible)
- [ ] **Error handling:** Centralized error handler in Hono or per-route? (Recommendation: Centralized via `app.onError()`)
- [ ] **Testing approach:** Adapter pattern for existing tests or rewrite? (Recommendation: Adapter if feasible)

### Post-Sprint Review Topics
- Lessons learned from Phase 1 migration
- Hono framework evaluation (pros/cons)
- Readiness assessment for Phase 2 (WebSocket security)
- Performance impact analysis

---

## 9. APPENDIX: CODE TEMPLATES

### A. Hono Router Skeleton (`src/router.ts`)
```typescript
import { Hono } from 'hono'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

// Health check (MIG-1)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    worker: 'api-worker',
    version: '2.1.0',
    router: 'hono',
    timestamp: new Date().toISOString()
  })
})

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${c.req.method} ${c.req.path}`,
      statusCode: 404
    }
  }, 404)
})

// Global error handler
app.onError((err, c) => {
  console.error('[Hono] Unhandled error:', err)
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500
    }
  }, 500)
})

export default app
```

### B. Feature Flag Integration (`src/index.js`)
```javascript
import honoRouter from './router'

export default {
  async fetch(request, env, ctx) {
    // Feature flag toggle
    const useHono = env.ENABLE_HONO_ROUTER === 'true'

    if (useHono) {
      return honoRouter.fetch(request, env, ctx)
    }

    // Existing manual routing (unchanged)
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return handleHealth()
    }
    // ... rest of manual routing
  }
}
```

### C. Analytics Helper (`src/utils/request-analytics.ts`)
```typescript
export function trackRequest(
  env: Env,
  router: 'hono' | 'manual',
  endpoint: string,
  statusCode: number,
  latencyMs: number
) {
  // Unified analytics for A/B testing comparison
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    router,
    endpoint,
    statusCode,
    latencyMs,
    environment: env.ENVIRONMENT || 'production'
  }))
}
```

---

**Sprint Owner:** Backend Team
**Stakeholders:** Frontend Teams (iOS, Flutter, Web)
**Next Review:** End of Week 1 (progress check)
**Sprint End:** End of Week 2 (retrospective + Phase 2 planning)
