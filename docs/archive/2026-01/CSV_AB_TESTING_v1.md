# CSV Import A/B Testing Guide

**Feature:** Gemini Model A/B Testing for CSV Parsing
**Status:** Ready for testing (disabled by default)
**Created:** January 7, 2026

---

## Overview

This feature enables A/B testing of different Gemini models for CSV parsing to determine the optimal balance of speed, accuracy, and cost.

### Models Under Test

1. **Baseline (Control):** `gemini-2.5-flash`
   - Current production model
   - Context: 1M tokens
   - Speed: Fast
   - Timeout: 90s

2. **Variant A:** `gemini-3-flash-preview`
   - Newest model with enhanced multimodal understanding
   - Context: 1M tokens
   - Speed: Fast
   - Timeout: 90s
   - Expected: Higher accuracy for complex CSVs

3. **Variant B:** `gemini-2.5-flash-lite`
   - Ultra-lightweight, cost-optimized
   - Context: 1M tokens
   - Speed: Ultra-fast
   - Timeout: 60s
   - Expected: Lower latency, potentially lower accuracy

---

## Configuration

### Feature Flags (wrangler.jsonc)

```jsonc
{
  "vars": {
    // A/B test rollout percentage (0-100)
    // 0 = baseline only (default)
    // 50 = 50% baseline, 25% variant A, 25% variant B
    // 100 = 33.3% each variant (full A/B/C test)
    "CSV_MODEL_AB_TEST_PERCENT": "0",

    // Enable Analytics Engine telemetry
    "ENABLE_CSV_AB_TELEMETRY": "false"
  }
}
```

### Environment Variables (Production Override)

```bash
# Enable 10% A/B test rollout
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 10

# Enable telemetry
wrangler secret put ENABLE_CSV_AB_TELEMETRY
# Enter: true
```

---

## Rollout Strategy

### Phase 1: Internal Testing (0% rollout)
**Duration:** 1-2 days
**Goal:** Validate A/B testing infrastructure

```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "0",
  "ENABLE_CSV_AB_TELEMETRY": "true"
}
```

**Tasks:**
- [ ] Test with sample CSVs (small, medium, large)
- [ ] Verify telemetry logging to Analytics Engine
- [ ] Confirm model selection logic
- [ ] Validate timeout handling

### Phase 2: Canary Rollout (10% rollout)
**Duration:** 3-5 days
**Goal:** Initial production validation

```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "10",
  "ENABLE_CSV_AB_TELEMETRY": "true"
}
```

**Metrics to Monitor:**
- Error rate by model variant
- P95/P99 latency by variant
- Token usage differences
- Validation error rates

**Success Criteria:**
- No increase in overall error rate
- All variants complete within timeout
- Telemetry data flowing correctly

### Phase 3: Gradual Expansion (25% → 50% → 100%)
**Duration:** 1-2 weeks
**Goal:** Gather statistically significant data

```jsonc
// Week 1
"CSV_MODEL_AB_TEST_PERCENT": "25"

// Week 2
"CSV_MODEL_AB_TEST_PERCENT": "50"

// Week 3
"CSV_MODEL_AB_TEST_PERCENT": "100"
```

**Data Collection:**
- Minimum 100 samples per variant
- P95/P99 latency distribution
- Accuracy metrics (validation error rate)
- Cost analysis (token usage × pricing)

### Phase 4: Analysis & Decision
**Duration:** 2-3 days
**Goal:** Select winning variant

**Decision Criteria:**
1. **Error Rate:** Variant must have ≤ baseline error rate
2. **Latency:** P95 latency within 10% of baseline
3. **Accuracy:** Validation error rate ≤ baseline
4. **Cost:** Evaluate token usage × model pricing
5. **User Impact:** No increase in failed imports

---

## Telemetry Events

### Event Schema

```typescript
{
  type: 'CSV_AB_TEST',
  jobId: 'import-abc123',
  userId: 'user-xyz',
  model: 'gemini-3-flash-preview',
  csvMetadata: {
    sizeBytes: 1024,
    estimatedRows: 50
  },
  performance: {
    durationMs: 5234,
    apiLatencyMs: 4821,
    cacheHit: false
  },
  results: {
    validBooks: 48,
    validationErrors: 2,
    errorRate: 0.04
  },
  tokenUsage: {
    promptTokens: 2090,
    outputTokens: 200,
    totalTokens: 2290
  },
  success: true,
  timestamp: '2026-01-07T12:00:00Z'
}
```

### Analytics Engine Queries

**Query by Model:**
```sql
SELECT
  blobs[2] AS model,
  COUNT(*) AS total_runs,
  SUM(CASE WHEN blobs[5] = 'success' THEN 1 ELSE 0 END) / COUNT(*) AS success_rate,
  AVG(doubles[1]) AS avg_duration_ms,
  APPROX_PERCENTILE(doubles[1], 0.95) AS p95_duration_ms,
  AVG(doubles[8]) AS avg_tokens
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
ORDER BY model
```

---

## Test Datasets

### Small CSV (2 books, 114 bytes)
```csv
Title,Author,ISBN
Harry Potter and the Sorcerer's Stone,J.K. Rowling,9780439708180
The Hobbit,J.R.R. Tolkien,9780547928227
```

**Expected:**
- Valid books: 2
- Errors: 0
- Latency: < 10s (all variants)

### Medium CSV (50 books, ~5KB)
```csv
Title,Author,ISBN,Date Read,Rating
Harry Potter and the Sorcerer's Stone,J.K. Rowling,9780439708180,2024-01-15,5
The Hobbit,J.R.R. Tolkien,9780547928227,2024-01-20,5
... (48 more books)
```

**Expected:**
- Valid books: ~45-50
- Errors: 0-5 (validation errors for missing fields)
- Latency: 10-20s

### Large CSV (500 books, ~50KB)
**Expected:**
- Valid books: ~450-500
- Errors: 0-10%
- Latency: 30-60s

---

## Integration Example

### CSV Processing Handler

```typescript
import { parseCSVWithGemini } from '../providers/gemini-csv-provider'
import { selectCSVModel, logABTestEvent } from '../utils/csv-ab-testing'

async function processCsvImport(csvContent: string, userId: string, jobId: string, env: Env) {
  // Select model based on A/B test configuration
  const model = selectCSVModel(userId, env)

  console.log(`[CSV Import] User ${userId} assigned to model: ${model}`)

  // Parse CSV with selected model
  const result = await parseCSVWithGemini(
    csvContent,
    GEMINI_CSV_PROMPT,
    env.GEMINI_API_KEY,
    {
      model,
      jobId,
      userId,
      enableTelemetry: env.ENABLE_CSV_AB_TELEMETRY === 'true',
    }
  )

  // Log telemetry event
  if (result.telemetry) {
    logABTestEvent(env, result.telemetry)
  }

  return result
}
```

---

## Monitoring & Alerts

### Key Metrics

1. **Success Rate by Model**
   - Alert if any variant < 95% success rate

2. **P95 Latency by Model**
   - Alert if any variant > 100s (approaching timeout)

3. **Token Usage Trends**
   - Monitor cost impact of each variant

4. **Error Rate Distribution**
   - Track validation errors by model

### Rollback Procedure

If any variant shows degradation:

1. **Immediate:** Set `CSV_MODEL_AB_TEST_PERCENT=0`
2. **Redeploy:** `wrangler deploy`
3. **Verify:** All traffic returns to baseline
4. **Investigate:** Review telemetry logs for root cause

---

## Cost Analysis

### Model Pricing (Gemini API)

- **gemini-2.5-flash:** $0.075 / 1M input tokens, $0.30 / 1M output
- **gemini-3-flash-preview:** TBD (likely higher than 2.5-flash)
- **gemini-2.5-flash-lite:** TBD (likely lower than 2.5-flash)

### Expected Token Usage per CSV

| CSV Size | Input Tokens | Output Tokens | Total Cost (2.5-flash) |
|----------|--------------|---------------|------------------------|
| Small (2 books) | 2,000 | 200 | $0.00021 |
| Medium (50 books) | 5,000 | 500 | $0.00053 |
| Large (500 books) | 20,000 | 2,000 | $0.00210 |

**Monthly Estimate (1,000 imports/month):**
- Avg cost per import: $0.0005
- Monthly total: $0.50
- Negligible impact vs. API quota limits

---

## Success Metrics

### Primary Goals

1. **Identify fastest model** without sacrificing accuracy
2. **Reduce P95 latency** for CSV imports
3. **Maintain ≥95% success rate** across all variants
4. **Optimize cost** per import job

### Decision Framework

| Metric | Weight | Threshold |
|--------|--------|-----------|
| Success Rate | 40% | ≥ 95% |
| P95 Latency | 30% | ≤ 60s preferred, 90s max |
| Accuracy (Error Rate) | 20% | ≤ 5% validation errors |
| Cost (Token Usage) | 10% | ≤ 110% of baseline |

**Winning Variant:**
- Weighted score calculation
- Must pass all threshold requirements
- At least 100 samples per variant

---

## Timeline

| Phase | Duration | Rollout % | Goal |
|-------|----------|-----------|------|
| Internal Testing | 1-2 days | 0% | Infrastructure validation |
| Canary | 3-5 days | 10% | Initial production data |
| Gradual Expansion | 1-2 weeks | 25% → 50% → 100% | Statistical significance |
| Analysis | 2-3 days | 100% | Select winner |
| **Total** | **3-4 weeks** | - | Production deployment |

---

## References

- **Code:** `src/providers/gemini-csv-provider.ts`
- **Config:** `src/config/gemini-models.ts`
- **Utilities:** `src/utils/csv-ab-testing.ts`
- **Telemetry:** `src/types/analytics.ts`
- **Wrangler:** `wrangler.jsonc` (feature flags)

---

**Last Updated:** January 7, 2026
**Owner:** @jukasdrj
**Status:** Ready for Phase 1 (Internal Testing)
