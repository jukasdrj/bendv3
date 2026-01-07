# CSV Import A/B Testing - Implementation Summary

**Created:** January 7, 2026
**Status:** ✅ Ready for testing (disabled by default)

---

## 🎯 What We Built

A complete A/B testing framework for comparing three Gemini models for CSV parsing:

1. **gemini-2.5-flash** (baseline) - Current production model
2. **gemini-3-flash-preview** (variant A) - Newest, best multimodal
3. **gemini-2.5-flash-lite** (variant B) - Ultra-fast, cost-optimized

---

## 📦 Files Created

### Core Infrastructure
- `src/config/gemini-models.ts` - Model configurations and selection logic
- `src/types/analytics.ts` - Telemetry event schemas
- `src/utils/csv-ab-testing.ts` - Integration utilities
- `src/providers/gemini-csv-provider.ts` - **UPDATED** to support A/B testing

### Configuration
- `wrangler.jsonc` - Feature flags added:
  - `CSV_MODEL_AB_TEST_PERCENT` (0-100)
  - `ENABLE_CSV_AB_TELEMETRY` (true/false)
- `src/types/env.ts` - Environment type definitions updated

### Documentation
- `docs/guides/CSV_AB_TESTING.md` - Complete implementation guide
- `CSV_AB_TEST_SUMMARY.md` - This file

### Test Fixtures
- `tests/fixtures/csv-ab-testing/small.csv` - 2 books (114 bytes)
- `tests/fixtures/csv-ab-testing/medium.csv` - 50 books (~5KB)
- `tests/fixtures/csv-ab-testing/README.md` - Test fixture guide

---

## 🚀 How to Use

### 1. Enable A/B Testing (Production)

```bash
# Set rollout percentage (0-100)
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 10  (10% traffic to variants)

# Enable telemetry
wrangler secret put ENABLE_CSV_AB_TELEMETRY
# Enter: true

# Deploy
npm run deploy
```

### 2. Rollout Strategy

| Phase | Percentage | Duration | Goal |
|-------|------------|----------|------|
| Internal Testing | 0% | 1-2 days | Infrastructure validation |
| Canary | 10% | 3-5 days | Initial production data |
| Gradual Expansion | 25% → 50% → 100% | 1-2 weeks | Statistical significance |
| Analysis | 100% | 2-3 days | Select winner |

### 3. Monitor Telemetry

Check Analytics Engine for `CSV_AB_TEST` events:

```sql
SELECT
  blobs[2] AS model,
  COUNT(*) AS total_runs,
  AVG(doubles[1]) AS avg_duration_ms,
  APPROX_PERCENTILE(doubles[1], 0.95) AS p95_duration_ms
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
```

---

## 🔧 Integration Example

### Before (Current)
```typescript
const result = await parseCSVWithGemini(
  csvContent,
  GEMINI_CSV_PROMPT,
  env.GEMINI_API_KEY
)
```

### After (A/B Testing Enabled)
```typescript
import { selectCSVModel, logABTestEvent } from '../utils/csv-ab-testing'

// Select model based on user ID
const model = selectCSVModel(userId, env)

// Parse with selected model
const result = await parseCSVWithGemini(
  csvContent,
  GEMINI_CSV_PROMPT,
  env.GEMINI_API_KEY,
  {
    model,
    jobId,
    userId,
    enableTelemetry: env.ENABLE_CSV_AB_TELEMETRY === 'true'
  }
)

// Log telemetry
if (result.telemetry) {
  logABTestEvent(env, result.telemetry)
}
```

---

## 📊 Expected Results

### Performance Targets

| Model | P95 Latency | Token Usage | Success Rate |
|-------|-------------|-------------|--------------|
| gemini-2.5-flash | ~15s | ~2,300 | ≥95% |
| gemini-3-flash-preview | ~15s | ~2,300 | ≥95% |
| gemini-2.5-flash-lite | ~10s | ~2,100 | ≥95% |

### Decision Criteria

- **Success Rate:** Must maintain ≥95%
- **P95 Latency:** Target ≤60s, max 90s
- **Accuracy:** Validation error rate ≤5%
- **Cost:** Token usage ≤110% of baseline

---

## 🎛️ Feature Flags

### Current State (Default)
```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "0",  // 100% baseline (disabled)
  "ENABLE_CSV_AB_TELEMETRY": "false" // No telemetry
}
```

### Rollout Example (10%)
```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "10",  // 10% variants, 90% baseline
  "ENABLE_CSV_AB_TELEMETRY": "true"   // Log all events
}
```

### Full A/B/C Test (100%)
```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "100", // 33.3% each variant
  "ENABLE_CSV_AB_TELEMETRY": "true"
}
```

---

## 🔄 Rollback Procedure

If issues arise:

1. **Immediate:** Set `CSV_MODEL_AB_TEST_PERCENT=0` in wrangler.jsonc
2. **Redeploy:** `npm run deploy`
3. **Verify:** All traffic returns to baseline (gemini-2.5-flash)
4. **Investigate:** Review telemetry logs for root cause

---

## 📈 Success Metrics

### Primary Goals
1. ✅ Identify fastest model without sacrificing accuracy
2. ✅ Reduce P95 latency for CSV imports
3. ✅ Maintain ≥95% success rate across variants
4. ✅ Optimize cost per import job

### Telemetry Tracked
- **Performance:** Duration, API latency, cache hit rate
- **Results:** Valid books, validation errors, error rate
- **Tokens:** Prompt, output, total usage
- **Metadata:** CSV size, estimated rows

---

## 🧪 Testing Checklist

### Before Rollout
- [ ] Test with `small.csv` (2 books)
- [ ] Test with `medium.csv` (50 books)
- [ ] Verify telemetry logging
- [ ] Confirm model selection logic (10% → variants, 90% → baseline)
- [ ] Validate timeout handling (90s for 2.5/3-flash, 60s for lite)

### During Rollout
- [ ] Monitor error rate by model
- [ ] Track P95/P99 latency per variant
- [ ] Compare token usage trends
- [ ] Validate cache hit rates
- [ ] Collect minimum 100 samples per variant

### Analysis Phase
- [ ] Calculate weighted scores for each model
- [ ] Compare cost per import job
- [ ] Review accuracy metrics
- [ ] Select winner based on criteria
- [ ] Update production default

---

## 🔗 References

- **Full Guide:** [docs/guides/CSV_AB_TESTING.md](docs/guides/CSV_AB_TESTING.md)
- **Model Config:** [src/config/gemini-models.ts](src/config/gemini-models.ts)
- **Provider:** [src/providers/gemini-csv-provider.ts](src/providers/gemini-csv-provider.ts)
- **Utilities:** [src/utils/csv-ab-testing.ts](src/utils/csv-ab-testing.ts)
- **Test Fixtures:** [tests/fixtures/csv-ab-testing/](tests/fixtures/csv-ab-testing/)

---

## 📝 Next Steps

1. **Internal Testing (You):**
   - Run manual tests with `small.csv` and `medium.csv`
   - Enable `ENABLE_CSV_AB_TELEMETRY=true` locally
   - Verify telemetry events are logged correctly

2. **Canary Deployment:**
   - Set `CSV_MODEL_AB_TEST_PERCENT=10` in production
   - Monitor for 3-5 days
   - Collect initial metrics

3. **Gradual Rollout:**
   - Increase to 25% → 50% → 100% over 1-2 weeks
   - Ensure minimum 100 samples per variant

4. **Analysis:**
   - Review Analytics Engine data
   - Calculate weighted scores
   - Select winning variant

5. **Production Update:**
   - Update default model in code
   - Disable A/B testing (`CSV_MODEL_AB_TEST_PERCENT=0`)
   - Document decision in CHANGELOG

---

**Status:** ✅ All implementation complete, ready for Phase 1 (Internal Testing)

**Owner:** @jukasdrj
**Last Updated:** January 7, 2026
