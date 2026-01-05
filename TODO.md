# BooksTrack Backend - Master TODO

**Last Updated:** January 5, 2026
**Production:** https://api.oooefam.net
**Health:** 🟢 0% error rate, all systems operational

---

## 🎯 Current Sprint: TypeScript Error Resolution

**Active Work:** TypeScript Error Fixes - Phase 3 In Progress
**Status:** 468 errors remaining (38 fixed, 7.5% reduction)
**Started:** January 4, 2026
**Target:** Reduce to <100 errors

### Phase 3: Type Safety (IN PROGRESS)
- **Focus:** Null/undefined checks, type guards, optional chaining
- **High-Impact Files:**
  - `src/durable-objects/job-state-manager.ts` (~100 errors)
  - `src/handlers/book-search.ts` (~40 errors)
  - `src/services/external-apis.ts` (~30 errors)
  - `src/services/book-service.ts` (~25 errors)
- **Effort:** ~4 hours estimated
- **Risk:** ⚠️ MEDIUM (requires careful testing)
- **Documentation:** See `TYPESCRIPT_STATUS.md` for details

### Commands
```bash
# Check current error count
npx tsc --noEmit 2>&1 | grep "^src/" | wc -l

# Run smoke tests after changes
npm run test:smoke

# Validate before commit
npm run validate
```

---

## 🔥 Critical Issues (P0) - **BLOCKED - DO NOT MERGE PR #242**

### 1. CSV Validation Silent Failure (#243)
- **Priority:** P0 - CRITICAL
- **Status:** Implementation plan ready (#249)
- **Effort:** 3.5 hours
- **Impact:** Users losing data silently without error feedback
- **Blocker:** PR #242 cannot merge until fixed
- **Files:** `src/api-v3/jobs/imports.ts`, `src/utils/csv-processor-core.ts`
- **Action:** Follow implementation plan in #249
  - Fix 3 failing tests
  - Add 4 critical test scenarios
  - Implement proper error propagation

---

## 🟠 High Priority (P1)

### 2. Verify CacheMetrics Race Fix (#245)
- **Priority:** P1 - HIGH
- **Status:** Needs verification before merge (PR #239)
- **Effort:** 15 minutes verification + 30 min improvements
- **Impact:** Race condition in cache metrics could corrupt state
- **Action:** Verify `setupAlarm()` is inside `blockConcurrencyWhile`
- **File:** `src/durable-objects/cache-metrics.ts`

---

## 🟡 Medium Priority (P2)

### 3. Multi-Size Cover URL Support (#237)
- **Priority:** P2 - MEDIUM
- **Status:** Ready for implementation
- **Effort:** 2-3 hours
- **Impact:** Frontend performance optimization (responsive images)
- **Labels:** `good-first-issue`, `frontend`, `api-v3`
- **Action:** Add `coverUrls: {small, medium, large}` to book schema

### 4. Resilience Tests for Alarm Continuity (#246)
- **Priority:** P2 - MEDIUM
- **Status:** Optional enhancement to PR #238
- **Effort:** 1-2 hours
- **Impact:** Improve test coverage for cache metrics
- **Action:** Add 3-6 edge case tests for alarm persistence

---

## 🟢 Low Priority (P3) - Backlog

### 5. D1 Concurrency Limit Tuning (#247)
- **Priority:** P3 - LOW
- **Status:** Optional optimization
- **Effort:** 5 minutes
- **Impact:** Extra safety margin for D1 queries
- **Action:** Consider reducing from 20 to 10-15 (requires load testing)
- **File:** `src/repositories/book-repository.ts`

### 6. Optional Enhancements (#233)
- **Priority:** P3 - LOW
- **Status:** Backlog of nice-to-have features
- **Tracking:** Meta-issue for future improvements
- **Items:**
  - Publish SDK to npm (Ready to publish)
  - Consolidate utils directory (30+ files → domain folders)
  - Standardize RFC 9457 error responses
  - Document API versioning strategy
  - Integrate dependency injection across handlers
  - Resolve TODO comments in code (11 found)

---

## 📋 Technical Debt

### TypeScript Migration
- **Progress:** 149/149 files (100% complete) ✅
- **Current:** Fixing remaining type errors (468 errors)
- **Quality:** Zero `any` types policy maintained
- **Tests:** 199/199 smoke tests passing

### Code Quality
- **Linter:** Biome enforced, zero warnings
- **Test Coverage:** 75%+ overall
- **Documentation:** Up to date in `.claude/CLAUDE.md`

### Legacy Code
- **Status:** All JavaScript files migrated to TypeScript ✅
- **Cleanup:** No legacy .js files remain

---

## 🎓 Sprint Planning

### Sprint 1: Critical Fixes (This Week)
**Goal:** Resolve P0/P1 issues
1. ✅ Complete TypeScript Phase 3 (4 hours)
2. 🔥 Fix CSV validation silent failure (#243) - 3.5 hours
3. ✅ Verify CacheMetrics race fix (#245) - 15 min

**Total Effort:** ~8 hours
**Deliverable:** Clean TypeScript build, PR #242 ready to merge

### Sprint 2: Frontend Optimization (Next Week)
**Goal:** Improve API responses for frontend
1. Multi-size cover URLs (#237) - 2-3 hours
2. Resilience tests (#246) - 1-2 hours
3. D1 concurrency tuning (#247) - 5 min + testing

**Total Effort:** ~4 hours
**Deliverable:** Enhanced book metadata, better test coverage

### Sprint 3: Polish & Publish (Future)
**Goal:** Package improvements
1. Publish TypeScript SDK to npm
2. Consolidate utils directory
3. RFC 9457 error standardization
4. API versioning documentation

**Total Effort:** ~8 hours
**Deliverable:** Public SDK, cleaner codebase structure

---

## 📊 Project Health Metrics

### Production Status
- **Error Rate:** 0% (7 days) ✅
- **P95 Latency:** 145ms (cached), 850ms (cold) ✅
- **Cache Hit Rate:** 73% (target: 60%) ✅
- **Uptime:** 100% ✅

### Test Coverage
| Component | Target | Status |
|-----------|--------|--------|
| Validators | 100% | ✅ Met |
| Normalizers | 100% | ✅ Met |
| Auth | 100% | ✅ Met |
| Cache | 90%+ | ✅ Met |
| External APIs | 85%+ | ✅ Met |
| Enrichment | 85%+ | ✅ Met |
| WebSocket DO | 80%+ | ✅ Met |
| Handlers | 75%+ | ✅ Met |
| Services | 70%+ | ✅ Met |

### API Status
- **V3 API:** Production ready ✅
- **V2 API:** Removed (March 2026 sunset) ✅
- **V1 API:** Removed (December 2025 sunset) ✅
- **OpenAPI Spec:** Auto-generated from Zod schemas ✅
- **TypeScript SDK:** Ready to publish 📦

---

## 🔗 Quick Links

### Documentation
- **[README.md](README.md)** - Project overview
- **[CLAUDE.md](CLAUDE.md)** - Quick reference (links to full guide)
- **[.claude/CLAUDE.md](.claude/CLAUDE.md)** - Comprehensive AI guidelines
- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[TYPESCRIPT_STATUS.md](TYPESCRIPT_STATUS.md)** - TypeScript error tracking

### API
- **Production:** https://api.oooefam.net
- **Health:** https://api.oooefam.net/health
- **OpenAPI:** https://api.oooefam.net/v3/openapi.json
- **Docs:** https://api.oooefam.net/v3/docs

### Monitoring
- **Dashboard:** https://harvest.oooefam.net
- **Logs:** `npx wrangler tail --remote --format pretty`
- **Analytics:** Cloudflare Workers Analytics

### GitHub
- **Issues:** https://github.com/jukasdrj/bendv3/issues
- **PRs:** https://github.com/jukasdrj/bendv3/pulls

---

## 📝 Notes

### Recent Completions (January 2026)
- ✅ TypeScript migration 100% complete (149/149 files)
- ✅ All Durable Objects migrated to TypeScript
- ✅ Biome linter/formatter integrated
- ✅ Vitest Workers pool migration
- ✅ V2 API removal (sunset complete)
- ✅ Alexandria RPC integration
- ✅ Circuit breaker chain for all providers

### Archived Documentation
Completed work moved to `archive/2026-01-completed-work/`:
- Phase 2/3/4 implementation docs
- PR #242 documentation
- TypeScript migration phase docs
- Code review summaries
- Implementation plans

### AI Tools
- `/deploy` - Deploy with monitoring
- `/review` - Code quality review
- `/logs` - Stream production logs
- `/rollback` - Rollback deployment
- `/cache-check` - Cache performance

---

**Maintained By:** @jukasdrj
**Last Sprint Review:** January 5, 2026
**Next Review:** After Sprint 1 completion
