# CSV A/B Testing Update - January 8, 2026

**Issue:** #253
**Status:** ✅ Complete
**Impact:** Critical reliability improvement

---

## 🎯 Problem Summary

Production testing of the original CSV A/B testing framework revealed a critical issue:

- **83% failure rate** with gemini-2.5-flash
- **Error:** "Unterminated string in JSON at position X"
- **Root Cause:** Known Gemini API token truncation issue

### Research Findings

Using the PAL MCP `apilookup` tool, we confirmed:

1. **Gemini 2.5 Flash has documented JSON reliability issues**
   - Random/intermittent failures
   - Token limit truncation mid-string
   - Community-reported issue across multiple use cases

2. **Gemini 3 Flash Preview specifically addresses these issues**
   - "Broad quality improvements across reasoning and reliability"
   - "Reduces syntax hallucinations and failure loops"
   - Recommended by Google AI documentation (2026)

3. **Official Solutions**
   - Increase `maxOutputTokens` to 8000 (from 4000)
   - Upgrade to Gemini 3 Flash Preview
   - Implement JSON repair/validation layer

---

## 🛠️ Changes Implemented

### 1. Baseline Model Switch

**Before:**
```typescript
// gemini-2.5-flash (83% failure rate)
```

**After:**
```typescript
// gemini-3-flash-preview (expected >95% success rate)
```

**Impact:**
- All users (when `CSV_MODEL_AB_TEST_PERCENT=0`) now get the reliable model
- Removes flaky model from production entirely

---

### 2. JSON Repair Safety Net

**New File:** `src/utils/json-repair.ts`

**Features:**
- Automatic detection of "Unterminated string" errors
- Bracket/brace balancing
- Trailing comma removal
- Up to 3 repair attempts before failure

**Usage in Provider:**
```typescript
const parseResult = parseJSONWithRepair<CSVParsedBook[]>(textResponse, {
  includeRawText: true,
  maxRepairAttempts: 3,
})

if (!parseResult.success) {
  throw new Error(`Invalid JSON: ${parseResult.error}`)
}

const books = parseResult.data!
```

**Logging:**
- Warns when repair is applied (indicates potential token limit issues)
- Includes raw text for debugging

---

### 3. Updated A/B Test Structure

**Previous (3-way A/B/C test):**
- gemini-2.5-flash (baseline)
- gemini-3-flash-preview (variant A)
- gemini-2.5-flash-lite (variant B)

**Current (2-way A/B test):**
- gemini-3-flash-preview (baseline - reliability)
- gemini-2.5-flash-lite (variant - cost optimization)

**Distribution Logic:**
```typescript
// 0% → 100% gemini-3-flash-preview
// 10% → 90% baseline, 10% lite
// 50% → 50% baseline, 50% lite
// 100% → 50% baseline, 50% lite (full A/B test)
```

---

### 4. Feature Flag Defaults

**Updated `wrangler.jsonc`:**
```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "0",     // Disabled by default
  "ENABLE_CSV_AB_TELEMETRY": "false"    // No telemetry
}
```

**Rollout Strategy:**
1. Deploy with 0% (100% gemini-3-flash-preview)
2. Monitor for 3-5 days, expect >95% success rate
3. Enable 50% rollout to compare cost/performance
4. Collect 100+ samples per variant
5. Analyze and select winner

---

## 📊 Files Modified

| File | Change | Lines |
|------|--------|-------|
| `src/config/gemini-models.ts` | Updated baseline + selection logic | ~50 |
| `src/utils/json-repair.ts` | **NEW** JSON repair utility | ~200 |
| `src/providers/gemini-csv-provider.ts` | Integrated JSON repair | ~30 |
| `wrangler.jsonc` | Reset feature flags | ~5 |
| `tests/unit/csv-ab-testing.test.ts` | Updated test expectations | ~50 |
| `CSV_AB_TEST_SUMMARY.md` | Updated documentation | ~30 |

**Total:** ~365 lines changed/added

---

## ✅ Testing Results

### Unit Tests (12/12 Passing)

```bash
✓ Gemini Model Configuration (5 tests)
  - Model configs present
  - Baseline is gemini-3-flash-preview
  - Deprecated model marked correctly

✓ Model Selection Logic (4 tests)
  - 0% → 100% baseline
  - 100% → 50/50 split
  - Consistent bucketing
  - Gradual rollout percentages

✓ A/B Test Configuration (3 tests)
  - Env parsing
  - Defaults
  - Clamping
```

### Smoke Tests (293/293 Passing)

- All existing smoke tests still pass
- No regressions introduced
- JSON repair utility validated

---

## 🚀 Deployment Plan

### Phase 1: Immediate (Today)

1. ✅ Merge changes to main
2. ✅ Deploy with `CSV_MODEL_AB_TEST_PERCENT=0`
3. ✅ Monitor error rates in production

**Expected Results:**
- Success rate: >95% (vs 17% with gemini-2.5-flash)
- Latency: ~90s timeout (unchanged)
- Cost: Slightly higher (gemini-3-flash-preview is "high cost")

### Phase 2: Cost Optimization (1-2 weeks)

1. Enable `CSV_MODEL_AB_TEST_PERCENT=50`
2. Split traffic: 50% gemini-3-flash-preview, 50% gemini-2.5-flash-lite
3. Monitor for 3-5 days
4. Collect metrics:
   - Success rate (target: ≥95%)
   - P95 latency (target: ≤90s)
   - Token usage (cost comparison)
   - Accuracy (validation error rate)

### Phase 3: Winner Selection (2-3 days)

Query Analytics Engine for telemetry:

```sql
SELECT
  blobs[2] AS model,
  COUNT(*) AS total_runs,
  AVG(doubles[1]) AS avg_duration_ms,
  APPROX_PERCENTILE(doubles[1], 0.95) AS p95_duration_ms,
  SUM(CASE WHEN blobs[5] = 'true' THEN 1 ELSE 0 END) / COUNT(*) AS success_rate
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
```

**Decision Criteria:**
- Success Rate: 40% weight (must be ≥95%)
- P95 Latency: 30% weight (target ≤60s)
- Accuracy: 20% weight (error rate ≤5%)
- Cost: 10% weight (token usage comparison)

**Outcome:**
- If gemini-2.5-flash-lite matches quality: Switch to lite (cost savings)
- If baseline is significantly better: Keep gemini-3-flash-preview (reliability)

---

## 📚 Key Learnings

1. **Always research before implementing fixes**
   - PAL MCP `apilookup` tool saved hours of trial-and-error
   - Official documentation confirmed the issue and solution

2. **Belt-and-suspenders approach**
   - Model upgrade (primary fix)
   - JSON repair (safety net)
   - Both work together for maximum reliability

3. **Test-driven updates**
   - Updated tests first to reflect new expectations
   - Caught logic bug in 100% rollout distribution
   - All 12 unit tests passing validates implementation

4. **Feature flags are critical**
   - Easy rollback: Set `CSV_MODEL_AB_TEST_PERCENT=0`
   - Gradual rollout: 0% → 10% → 50% → 100%
   - Production safety net

---

## 🔗 References

- **Issue:** #253
- **Research Tool:** PAL MCP `apilookup`
- **Documentation:** [CSV_AB_TEST_SUMMARY.md](../../CSV_AB_TEST_SUMMARY.md)
- **Code:** `src/config/gemini-models.ts`, `src/utils/json-repair.ts`
- **Tests:** `tests/unit/csv-ab-testing.test.ts`

### External Sources

- [Gemini Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini 3 Flash Release Notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash)
- [Gemini API - Controlled Generation](https://medium.com/google-cloud/how-to-consistently-output-json-with-the-gemini-api-using-controlled-generation-887220525ae0)

---

**Status:** ✅ Complete and deployed
**Next Review:** Monitor production for 3-5 days
**Owner:** @jukasdrj
**Last Updated:** January 8, 2026
