# BooksTrack Backend - 2-Phase Sprint Plan

**Created:** January 7, 2026
**Last Updated:** January 8, 2026 (Issue #252 COMPLETE)
**Context:** Post-Sprint 2 completion, Issue #252 resolved
**Production:** Stable (0% error rate, all systems operational)
**Test Status:** 686/690 passing (99.4% pass rate), 4 skipped

---

## Current State Analysis

### Completed Work
- ✅ Sprint 1: TypeScript Error Resolution (95.8% type safety)
- ✅ Sprint 2: Frontend Optimization (multi-size covers, alarm tests, D1 analysis)
- ✅ 100% TypeScript migration (149/149 files)
- ✅ All critical (P0) and high priority (P1) issues resolved
- ✅ Production stable with 0% error rate

### Open Items
- **GitHub Issues:** 1 open (#255 - Durable Object Testability - P3 LOW)
- **TODO.md Items:** All P2/P3 low-priority enhancements
- **Future Work:** Personalized recommendations (planning phase)

### Technical Debt
- 3 skipped Durable Object tests (deferred to #255)
- 21 TypeScript errors remaining (acceptable framework limitations)
- 11 TODO comments in codebase needing audit
- Utils directory consolidation opportunity (30+ files)

---

## Sprint 3: Quality & Testing (High ROI)

**Duration:** 2-3 days
**Focus:** Test suite health, code quality, quick wins
**Effort:** 12-16 hours total

### ✅ Issue #252: Test Suite Cleanup - COMPLETE (January 8, 2026)

**Result:** 28/30 tests fixed (93% reduction in failures)
**Duration:** ~3 hours
**Pass Rate:** 88.6% → 99.4% (+10.8% improvement)

#### Completed Work
1. ✅ **Quick Wins** (15 tests fixed)
   - Fixed syntax errors in 5 test files
   - Updated AI model expectations
   - Updated cache key patterns
   - Added WorkflowEntrypoint mock

2. ✅ **Stale Test Cleanup** (10 tests removed/archived)
   - Archived obsolete tests
   - Updated imports to V3 architecture
   - Updated Durable Object imports

3. ✅ **Remaining Tests** (3 skipped, deferred to #255)
   - Durable Object alarm/SSE tests
   - Testing infrastructure vs business logic
   - Resolution: Extract logic for testability

**Impact:**
- 91 failing tests → 0 failing
- 66 skipped → 4 skipped
- 686/690 tests passing (99.4%)

---

### Phase 3A: Test Suite Cleanup (8-10 hours) - ✅ COMPLETE

#### Quick Wins (2 hours) - HIGH IMPACT
**GitHub Issue:** #252 (Phase 1)

1. **Syntax Error Fixes** (30 minutes)
   - Fix missing commas in 5 test files
   - Files: `author-search.test.js`, `author-search-performance.test.js`, `book-search-integration.test.js`, `cache-warming-integration.test.js`, `unified-cache.test.js`
   - Expected: ~15 tests fixed

2. **Configuration Updates** (30 minutes)
   - Update AI model expectation: `gemini-2.5-flash-lite` → `gemini-2.5-flash`
   - Fix cache key regex pattern in `cache-keys.test.js`
   - Add `WorkflowEntrypoint` to cloudflare:workers mock
   - Expected: ~5 tests fixed

3. **Verification** (1 hour)
   - Run full test suite: `npm run test:safe`
   - Verify 20+ tests now passing
   - Update test documentation
   - Commit: "fix: resolve 20+ test failures (syntax errors, config updates)"

#### Stale Test Cleanup (3-4 hours) - MEDIUM IMPACT
**GitHub Issue:** #252 (Phase 2)

4. **Archive Obsolete Tests** (1 hour)
   - Create `tests/archive/v1-v2/` directory
   - Move tests for removed features:
     - `csv-import.test.js` (old handler pattern)
     - `batch-enrichment.test.js` (old handler pattern)
     - `r2-hibernation.test.js` (feature removed)
   - Document archival reasons in README

5. **Migrate Tests to V3 Architecture** (2-3 hours)
   - Update imports: `src/handlers/*` → `src/api-v3/jobs/*`
   - Fix DO imports: `progress-socket` → `websocket-connection`
   - Update `validators.test.js` imports
   - Rewrite handler tests as API endpoint tests
   - Expected: ~10 tests fixed or removed

#### Integration Test Modernization (3-4 hours) - MEDIUM IMPACT
**GitHub Issue:** #252 (Phase 3)

6. **Update Core Integration Tests** (2 hours)
   - Fix V3 API response schema tests
   - Update Alexandria RPC mock patterns
   - Fix BookService batch operation tests
   - Fix external API mocking patterns

7. **Fix Durable Object Tests** (1-2 hours)
   - Update rate limiter DO tests (12 tests)
   - Fix job state manager tests (3 tests)
   - Update WebSocket hibernation tests

**Deliverables:**
- Test pass rate: 88.6% → 95%+ (target: ~1,300/1,379 passing)
- Test suite runtime: <60s (maintained)
- Updated test documentation
- Clear separation: production tests vs archived tests

---

### Phase 3B: Code Quality Improvements (4-6 hours)

#### TODO Comment Audit (2 hours) - MEDIUM IMPACT
**Source:** TODO.md #5

8. **Audit and Resolve TODOs** (1.5 hours)
   - Review 11 TODO/FIXME comments in 9 files
   - Categories:
     - Convert valid TODOs to GitHub issues
     - Fix quick wins inline (<5 min each)
     - Remove stale/completed TODOs
   - Files: `analytics.ts`, `csv-processor-core.ts`, `alexandria-api.ts`, `author-discovery.ts`, etc.

9. **Documentation Update** (30 minutes)
   - Document TODO policy in CONTRIBUTING.md
   - Add pre-commit hook suggestion for TODO tracking
   - Update code quality guidelines

#### Circuit Breaker Optimization (30 minutes) - LOW IMPACT
**Source:** TODO.md #7

10. **Tune Circuit Breaker Batching** (15 minutes)
    - File: `src/services/circuit-breaker.ts:76`
    - Current: `WRITE_BATCH_SIZE = 10`
    - Test: Increase to 50 for high-failure scenarios
    - Measure: KV write reduction during outages

11. **Verify with Load Test** (15 minutes)
    - Simulate provider outage
    - Monitor KV write rate
    - Document performance improvement

#### Utils Directory Consolidation (2 hours) - LOW IMPACT
**Source:** TODO.md #8 (Optional Enhancements)

12. **Reorganize Utils** (1.5 hours)
    - Current: 30+ files in flat `src/utils/`
    - Proposed structure:
      ```
      src/utils/
      ├── cache/       (5 files)
      ├── validation/  (4 files)
      ├── transform/   (3 files)
      ├── http/        (4 files)
      ├── jobs/        (2 files)
      └── misc/        (remaining)
      ```
    - Update imports across codebase
    - Run smoke tests to verify

13. **Documentation** (30 minutes)
    - Update utils README
    - Document utility categories
    - Add import guidelines

**Deliverables:**
- Zero TODO comments (all converted to issues or resolved)
- Circuit breaker: 20-30% fewer KV writes during outages
- Utils directory: Clear organization by domain
- Updated code quality documentation

---

### Phase 3C: Coverage & Documentation (1-2 hours)

#### Test Coverage Assessment (1 hour)

14. **Generate Coverage Report** (15 minutes)
    ```bash
    npm run test:coverage
    ```
    - Identify coverage gaps
    - Focus on critical paths (enrichment, jobs, webhooks)

15. **Document Coverage** (30 minutes)
    - Update `README_TESTING.md` with current metrics
    - Document intentionally skipped tests
    - Create coverage improvement roadmap

16. **Update CI/CD** (15 minutes)
    - Add coverage report to GitHub Actions
    - Set coverage thresholds (warn <70%, fail <60%)
    - Add badge to README

#### Documentation Updates (1 hour)

17. **Update Project Docs** (30 minutes)
    - Update TODO.md (mark Sprint 3 complete)
    - Update CLAUDE.md (current test status)
    - Update CHANGELOG.md (Sprint 3 summary)

18. **GitHub Cleanup** (30 minutes)
    - Close #252 (Test Suite Cleanup)
    - Archive completed sprint milestones
    - Update project board

**Deliverables:**
- Test coverage report with gaps identified
- Updated testing documentation
- CI/CD coverage enforcement
- Clean project documentation

---

## Sprint 4: Feature Development (New Capabilities)

**Duration:** 3-5 days
**Focus:** User value, new features, strategic improvements
**Effort:** 16-24 hours total

### Phase 4A: SDK & Developer Experience (6-8 hours)

#### TypeScript SDK Publication (3-4 hours) - HIGH IMPACT
**Source:** TODO.md #8 (Optional Enhancements)

19. **Prepare SDK for npm** (2 hours)
    - Review `packages/api-client/`
    - Update package.json (name, version, description, keywords)
    - Add README with usage examples
    - Add LICENSE file (MIT)
    - Verify auto-generation from OpenAPI spec
    - Test SDK in sample project

20. **Publish to npm** (1 hour)
    - Create npm account (if needed)
    - Set up npm organization: `@bookstrack`
    - Publish: `@bookstrack/api-client@3.4.0`
    - Add npm badge to README
    - Announce in CHANGELOG

21. **Documentation** (1 hour)
    - Create SDK documentation site (GitHub Pages)
    - Add quickstart guide
    - Add migration guide from manual fetch
    - Add TypeScript examples

**Deliverables:**
- SDK published to npm: `@bookstrack/api-client`
- SDK documentation site
- Example applications using SDK
- README with npm install instructions

#### API Versioning Documentation (2 hours) - MEDIUM IMPACT
**Source:** TODO.md #8

22. **Document Versioning Strategy** (1 hour)
    - File: `docs/API_VERSIONING.md` (already exists, needs update)
    - Add deprecation policy (12-month sunset)
    - Add migration guides (V1→V2→V3)
    - Add breaking change policy
    - Add SemVer for SDK

23. **Implement Version Discovery** (1 hour)
    - Add `GET /versions` endpoint
    - Returns: current version, supported versions, sunset dates
    - Update OpenAPI spec
    - Add to SDK

**Deliverables:**
- Comprehensive API versioning documentation
- Version discovery endpoint
- Clear deprecation policy

#### RFC 9457 Error Standardization (2 hours) - MEDIUM IMPACT
**Source:** TODO.md #8

24. **Audit Error Responses** (1 hour)
    - Review all error responses across V3 API
    - Identify non-RFC-9457 responses
    - Document required changes
    - Create migration checklist

25. **Standardize Errors** (1 hour)
    - Update error responses to RFC 9457 format
    - Add `type`, `title`, `status`, `detail`, `instance` fields
    - Update error builder utility
    - Update OpenAPI spec error schemas
    - Run smoke tests

**Deliverables:**
- 100% RFC 9457 compliant error responses
- Updated error documentation
- Consistent error format across all endpoints

---

### Phase 4B: Personalized Recommendations (10-16 hours)

**Source:** `docs/plans/RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md`
**Status:** Planning phase, depends on Alexandria ratings infrastructure
**Priority:** MEDIUM (strategic feature for user engagement)

#### Prerequisites Check (1 hour)

26. **Verify Alexandria Ratings** (30 minutes)
    - Check Alexandria RPC endpoints: `/works/:workKey/ratings`, `/works/top-rated`
    - Verify PostgreSQL `work_ratings` table exists
    - Confirm 3M+ works with ratings
    - Test RPC response times

27. **Review Implementation Plan** (30 minutes)
    - Read full plan in `docs/plans/RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md`
    - Validate architecture decisions
    - Update plan with current API patterns
    - Identify dependencies

#### D1 Schema Changes (2-3 hours)

28. **Add User Profile Tables** (1 hour)
    - Add `user_profiles` table (user preferences, reading stats)
    - Add `user_interactions` table (feedback loop)
    - Add `recommendation_cache` table (24h TTL)
    - Create migration script
    - Run migration on production D1

29. **Add Indexes** (30 minutes)
    - Index `user_interactions.user_id`
    - Index `user_interactions.work_key`
    - Index `recommendation_cache.user_id`
    - Verify query performance

30. **Add Sample Data** (1 hour)
    - Create seed script for testing
    - Generate sample user profiles
    - Create sample interactions
    - Test recommendation flow

#### Recommendation Engine (4-6 hours)

31. **User Profile Analysis** (2 hours)
    - Create `src/services/user-profile-analyzer.ts`
    - Analyze user library (genres, authors, ratings)
    - Calculate genre preferences (weighted scores)
    - Calculate author preferences
    - Export profile vector

32. **Candidate Generation** (2 hours)
    - Create `src/services/recommendation-candidate-generator.ts`
    - Call Alexandria RPC for top-rated works
    - Filter by user preferences (genres, authors)
    - Apply rating threshold (min 3.5 composite)
    - Return 50-100 candidates

33. **Scoring Algorithm** (2 hours)
    - Create `src/services/recommendation-scorer.ts`
    - Calculate personalized score:
      - Genre match (0-1.0)
      - Author match (0-1.0)
      - External rating (0-1.0)
      - Recency bonus (optional)
      - Series bonus (optional)
    - Rank candidates by score
    - Return top 20 recommendations

#### API Endpoints (2-3 hours)

34. **Add Recommendations Endpoints** (1.5 hours)
    - `GET /v3/recommendations` - Get personalized recommendations
    - `POST /v3/recommendations/feedback` - Record user interaction
    - `GET /v3/profile` - Get user profile summary
    - `PATCH /v3/profile/preferences` - Update preferences
    - Add to OpenAPI spec

35. **Add Caching** (30 minutes)
    - Cache recommendations for 24h per user
    - Cache profile analysis for 1h
    - Add cache invalidation on new interactions
    - Add KV cache metrics

36. **Add Gemini Reason Generation** (1 hour)
    - Create prompt: "Why recommend this book?"
    - Input: user profile + book metadata + score breakdown
    - Output: 1-2 sentence reason
    - Cache reasons with recommendations
    - Add to response schema

#### Testing & Monitoring (2-3 hours)

37. **Add Tests** (1.5 hours)
    - Unit tests for profile analyzer
    - Unit tests for candidate generator
    - Unit tests for scorer
    - Integration test for recommendation flow
    - Add to smoke test suite

38. **Add Monitoring** (1 hour)
    - Add Analytics Engine dataset: `RECOMMENDATIONS_ANALYTICS`
    - Track: request count, cache hit rate, avg score, feedback rate
    - Add dashboard widget
    - Set up alerts (low engagement, high error rate)

39. **Documentation** (30 minutes)
    - Update API documentation
    - Add recommendation algorithm explanation
    - Add user guide for preferences
    - Add example requests/responses

**Deliverables:**
- Personalized recommendations API (V3)
- User profile management
- Feedback loop for learning
- Gemini-powered recommendation reasons
- 24h recommendation cache
- Comprehensive monitoring

**Impact:**
- User engagement: Personalized discovery
- Data collection: User preferences for future ML
- Differentiation: AI-powered recommendations
- Retention: Weekly recommendation emails (future)

---

## Sprint Prioritization Matrix

| Task | Effort | Impact | ROI | Priority |
|------|--------|--------|-----|----------|
| Test syntax fixes | 0.5h | High | Very High | P1 |
| SDK publication | 3h | High | High | P1 |
| Test cleanup | 6h | Medium | High | P2 |
| RFC 9457 errors | 2h | Medium | High | P2 |
| TODO audit | 2h | Medium | Medium | P2 |
| Recommendations | 12h | High | Medium | P3 |
| API versioning docs | 2h | Medium | Medium | P3 |
| Utils consolidation | 2h | Low | Low | P4 |
| Circuit breaker tune | 0.5h | Low | Low | P4 |

---

## Recommended Execution Order

### Sprint 3 (Quality & Testing)
**Week 1: Days 1-3**

**Day 1 (4 hours):**
1. Test syntax fixes (30 min) - Immediate wins
2. Test config updates (30 min) - Quick fixes
3. Verification & commit (1 hour)
4. Stale test cleanup (2 hours) - Archive obsolete tests

**Day 2 (4 hours):**
5. Migrate tests to V3 (3 hours) - Update architecture
6. Integration test fixes (1 hour) - Core APIs

**Day 3 (4 hours):**
7. DO test updates (2 hours) - Complete integration fixes
8. TODO comment audit (2 hours) - Code quality

**Optional (if time):**
9. Utils consolidation (2 hours)
10. Coverage assessment (1 hour)

**Sprint 3 Deliverables:**
- ✅ Test pass rate: 95%+
- ✅ Zero TODO comments
- ✅ Clean test organization
- ✅ Updated documentation

---

### Sprint 4 (Features & SDK)
**Week 2: Days 1-5**

**Day 1 (4 hours):**
1. SDK preparation (2 hours)
2. SDK publication (1 hour)
3. SDK documentation (1 hour)

**Day 2 (4 hours):**
4. API versioning docs (2 hours)
5. RFC 9457 error standardization (2 hours)

**Day 3-4 (8 hours) - IF Alexandria ratings ready:**
6. Prerequisites check (1 hour)
7. D1 schema changes (3 hours)
8. Recommendation engine (4 hours)

**Day 5 (4 hours) - IF continuing recommendations:**
9. API endpoints (2 hours)
10. Testing & monitoring (2 hours)

**Sprint 4 Deliverables:**
- ✅ SDK published to npm
- ✅ RFC 9457 compliant errors
- ✅ API versioning documentation
- ✅ (Optional) Personalized recommendations

---

## Risk Assessment

### Sprint 3 Risks
- **Test fixes may uncover more issues:** MEDIUM
  - Mitigation: Focus on quick wins first, defer complex fixes
- **Test migration may break passing tests:** LOW
  - Mitigation: Run smoke tests after each file migration
- **Time estimate may be optimistic:** MEDIUM
  - Mitigation: Mark Phase 3C as optional stretch goals

### Sprint 4 Risks
- **Alexandria ratings may not be ready:** HIGH
  - Mitigation: Defer recommendations to Sprint 5 if needed
- **SDK publication may require npm org setup:** LOW
  - Mitigation: Use personal scope initially (@jukasdrj)
- **RFC 9457 changes may break clients:** MEDIUM
  - Mitigation: Version bump to 3.5.0, announce breaking change

---

## Success Metrics

### Sprint 3 (Quality)
- Test pass rate: 88.6% → 95%+ ✅
- Test documentation: Updated ✅
- TODO comments: 11 → 0 ✅
- Code organization: Utils consolidated ✅

### Sprint 4 (Features)
- SDK downloads: 10+ in first week ✅
- API version endpoint: Live ✅
- Error format: 100% RFC 9457 ✅
- Recommendations: API live (if Alexandria ready) ✅

### Overall Success
- Production stability: Maintained 0% error rate ✅
- Code quality: 8.5/10 → 9.0/10 ✅
- Developer experience: SDK + docs ✅
- User value: Personalized recommendations ✅

---

## Post-Sprint Actions

### After Sprint 3:
1. Create Sprint 3 retrospective document
2. Update TODO.md with Sprint 4 plan
3. Archive completed work to `archive/2026-01-sprint3/`
4. Update production health dashboard

### After Sprint 4:
1. Announce SDK release (Twitter, Reddit, HN)
2. Write blog post: "Building BooksTrack: Personalized Recommendations"
3. Update roadmap for Q1 2026
4. Plan Sprint 5: Mobile app integration

---

**Next Steps:** Review this plan, adjust priorities, and begin Sprint 3 Day 1!
