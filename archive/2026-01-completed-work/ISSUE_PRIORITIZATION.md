# GitHub Issues - Prioritization & Labels

**Generated:** January 5, 2026
**Total Open Issues:** 7
**Status:** All issues labeled and prioritized

---

## 🔴 P0 - CRITICAL (2 issues)

### #243 - PR #242: Fix CSV validation silent failure
- **Labels:** `bug`, `priority: critical`, `data-loss`, `api-v3`, `user-facing`
- **Effort:** 3.5 hours
- **Status:** Implementation plan ready (#249)
- **Impact:** Users losing data silently without error feedback
- **Action:** Implement immediately - DO NOT MERGE PR #242 until fixed

### #249 - Implementation Plan for #243
- **Labels:** `enhancement`, `priority: critical`, `api-v3`, `implementation-plan`
- **Effort:** N/A (planning doc)
- **Status:** Complete - ready to execute
- **Impact:** Roadmap to fix critical silent failure
- **Action:** Follow implementation plan to fix #243

---

## 🟠 P1 - HIGH (1 issue)

### #245 - PR #239: Verify CacheMetrics race fix
- **Labels:** `priority: high`, `verification-needed`, `race-condition`, `durable-objects`, `cache`
- **Effort:** 15 minutes verification + 30 min improvements
- **Status:** Needs verification before merge
- **Impact:** Race condition in cache metrics could corrupt state
- **Action:** Verify `setupAlarm()` is inside `blockConcurrencyWhile` before merge

---

## 🟡 P2 - MEDIUM (2 issues)

### #237 - Multi-size cover URL support
- **Labels:** `enhancement`, `priority: medium`, `good first issue`, `cache`, `api-v3`, `performance`, `frontend`
- **Effort:** 2-3 hours
- **Status:** Ready for implementation
- **Impact:** Frontend performance optimization
- **Action:** Implement when bandwidth available - good first issue

### #246 - Add resilience tests for alarm continuity
- **Labels:** `priority: medium`, `testing`, `durable-objects`, `observability`
- **Effort:** 1-2 hours
- **Status:** Optional enhancement to PR #238
- **Impact:** Improve test coverage for critical metrics component
- **Action:** Add 3-6 resilience tests when time permits

---

## 🟢 P3 - LOW (3 issues)

### #247 - Consider reducing D1 concurrency limit
- **Labels:** `enhancement`, `priority: low`, `performance`, `database`, `optional`
- **Effort:** 5 minutes
- **Status:** Optional optimization suggestion
- **Impact:** PR #241 is safe to merge as-is (limit: 20)
- **Action:** Consider reducing to 10-15 for extra safety margin

### #233 - Optional Enhancements & TODO Tracking
- **Labels:** `documentation`, `enhancement`, `priority: low`, `good first issue`
- **Effort:** Various
- **Status:** Meta-issue tracking future improvements
- **Impact:** Backlog of nice-to-have features
- **Action:** Use as reference for future work

### #248 - PR Review Summary
- **Labels:** `documentation`, `priority: low`, `review-summary`, `meta`
- **Effort:** N/A (documentation)
- **Status:** Complete - historical record
- **Impact:** Documents comprehensive review of 5 PRs
- **Action:** Keep for reference

---

## 📊 Priority Distribution

| Priority | Count | Percentage |
|----------|-------|------------|
| P0 (Critical) | 2 | 28.6% |
| P1 (High) | 1 | 14.3% |
| P2 (Medium) | 2 | 28.6% |
| P3 (Low) | 3 | 42.9% |

---

## 🏷️ Label Categories

### Severity
- `priority: critical` (2) - P0 issues blocking production
- `priority: high` (1) - P1 issues needing attention
- `priority: medium` (2) - P2 important enhancements
- `priority: low` (3) - P3 optional improvements

### Type
- `bug` (1) - Defects requiring fixes
- `enhancement` (4) - New features or improvements
- `documentation` (2) - Documentation updates
- `testing` (1) - Test coverage improvements

### Component
- `api-v3` (3) - V3 API related
- `durable-objects` (3) - Durable Objects
- `cache` (2) - Cache related
- `database` (1) - D1 database
- `websockets` (0 open, 1 closed) - WebSocket features

### Status
- `verification-needed` (1) - Needs verification
- `implementation-plan` (1) - Planning document
- `optional` (1) - Optional enhancement
- `good first issue` (2) - Newcomer-friendly

### Impact
- `user-facing` (1) - Direct user impact
- `data-loss` (1) - Potential data loss
- `race-condition` (1) - Concurrency issues
- `performance` (2) - Performance optimization
- `observability` (1) - Monitoring/metrics

---

## 🎯 Recommended Action Order

### Immediate (This Week)
1. **#243** (P0) - Fix CSV validation silent failure (3.5 hours)
   - Follow implementation plan from #249
   - Fix 3 failing tests
   - Add 4 critical test scenarios
   - DO NOT MERGE PR #242 until complete

2. **#245** (P1) - Verify CacheMetrics race fix (15 min)
   - Confirm `setupAlarm()` is inside `blockConcurrencyWhile`
   - Verify PR #239 is correctly applied
   - Safe to merge after verification

### Near-Term (Next 2 Weeks)
3. **#237** (P2) - Multi-size cover URLs (2-3 hours)
   - Good first issue candidate
   - Frontend performance win
   - API schema expansion

4. **#246** (P2) - Resilience tests (1-2 hours)
   - Strengthen CacheMetrics test coverage
   - Add 3-6 edge case tests
   - Improve observability confidence

### Future (Backlog)
5. **#247** (P3) - D1 concurrency tuning (5 min)
   - Optional: reduce from 20 to 10-15
   - Load test first if changing
   - Not blocking

6. **#233** (P3) - Optional enhancements
   - Reference for future work
   - Good first issue candidates
   - No urgency

7. **#248** (P3) - Review summary
   - Keep for historical reference
   - Documents review methodology

---

## 🎓 Key Insights

### Common Patterns
1. **Silent Failures** - Multiple issues involved errors not surfaced to users
2. **Race Conditions** - Several concurrency bugs in Durable Objects
3. **Test Coverage** - Gaps in edge case and error path testing
4. **Error Propagation** - Tendency to log instead of return errors

### Project Health
- **TypeScript Migration:** 98.7% complete (147/149 files)
- **Test Suite:** All 199 tests passing
- **Production:** 0% error rate (7 days)
- **Performance:** P95 145ms (cached), 850ms (cold)

### Technical Debt
- 2 legacy .js files remaining (isbndb-api, author-cache-analyzer)
- Some TODO comments in code (tracked in #233)
- Test coverage could improve for Durable Objects

---

## 📚 Related Documentation

- **Full Guidelines:** [.claude/CLAUDE.md](.claude/CLAUDE.md)
- **Testing Guide:** [README_TESTING.md](README_TESTING.md)
- **API Versioning:** [docs/API_VERSIONING.md](docs/API_VERSIONING.md)
- **TypeScript Status:** [TYPESCRIPT_STATUS.md](TYPESCRIPT_STATUS.md)

---

**Maintained By:** Claude Code (Bend - API Gateway)
**Last Updated:** January 5, 2026
**Next Review:** When new issues created or priorities change
