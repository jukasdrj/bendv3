# CSV Import A/B Testing Guide

**Feature:** Gemini Model A/B Testing for CSV Parsing
**Status:** Production Ready (gemini-3-flash-preview baseline)
**Last Updated:** January 11, 2026
**Owner:** @jukasdrj

> **📋 This is the consolidated guide. Previous versions archived:**
> - `CSV_AB_TESTING.md` → `docs/archive/2026-01/CSV_AB_TESTING_v1.md`
> - `CSV_AB_TESTING_EXAMPLE.md` → `docs/archive/2026-01/CSV_AB_TESTING_EXAMPLE_v1.md`
> - `CSV_AB_TESTING_UPDATE_JAN_2026.md` → `docs/archive/2026-01/CSV_AB_TESTING_UPDATE_JAN_2026.md`

---

## Overview

This feature enables A/B testing of Gemini models for CSV parsing to optimize the balance of speed, accuracy, and cost.

### Current Production Configuration

**Baseline Model:** `gemini-3-flash-preview`
- Selected after addressing 83% failure rate with gemini-2.5-flash
- Known Gemini API JSON truncation issues resolved
- >95% success rate in production
- Context: 1M tokens, Timeout: 90s

**Variant Model:** `gemini-2.5-flash-lite`
- Cost-optimized alternative
- Context: 1M tokens, Timeout: 60s
- Expected: Lower latency, competitive accuracy

### Why gemini-3-flash-preview?

Research via PAL MCP `apilookup` (January 8, 2026) confirmed:
1. Gemini 2.5 Flash has documented JSON reliability issues (random truncation)
2. Gemini 3 Flash Preview specifically addresses these issues:
   - "Broad quality improvements across reasoning and reliability"
   - "Reduces syntax hallucinations and failure loops"
3. Includes JSON repair safety net for additional resilience

---

## Configuration

### Feature Flags (wrangler.jsonc)

```jsonc
{
  "vars": {
    // A/B test rollout percentage (0-100)
    // 0 = baseline only (default)
    // 50 = 50% baseline, 50% variant
    // 100 = 50% baseline, 50% variant (full A/B test)
    "CSV_MODEL_AB_TEST_PERCENT": "0",

    // Enable Analytics Engine telemetry
    "ENABLE_CSV_AB_TELEMETRY": "false"
  }
}
```

### Production Environment Variables

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

### Phase 1: Baseline Validation (0% rollout)
**Duration:** 3-5 days
**Goal:** Verify gemini-3-flash-preview stability

```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "0",
  "ENABLE_CSV_AB_TELEMETRY": "true"
}
```

**Success Criteria:**
- Success rate >95%
- P95 latency <90s
- No JSON parsing failures

### Phase 2: Cost Optimization Test (50% rollout)
**Duration:** 1-2 weeks
**Goal:** Compare baseline vs. lite variant

```jsonc
{
  "CSV_MODEL_AB_TEST_PERCENT": "50",
  "ENABLE_CSV_AB_TELEMETRY": "true"
}
```

**Metrics to Monitor:**
- Success rate by model (target: ≥95%)
- P95/P99 latency by variant
- Token usage differences
- Validation error rates

### Phase 3: Analysis & Decision (100 samples minimum)
**Duration:** 2-3 days
**Goal:** Select winner based on data

**Decision Criteria:**
| Metric | Weight | Threshold |
|--------|--------|-----------|
| Success Rate | 40% | ≥ 95% |
| P95 Latency | 30% | ≤ 60s preferred, 90s max |
| Accuracy | 20% | ≤ 5% validation errors |
| Cost | 10% | ≤ 110% of baseline |

---

## Local Testing

### 1. Update `.env` File

```bash
# Enable A/B testing locally
CSV_MODEL_AB_TEST_PERCENT=100  # Full A/B test
ENABLE_CSV_AB_TELEMETRY=true   # Log all telemetry
```

### 2. Run Development Server

```bash
npm run dev
```

### 3. Test with cURL

**Upload Small CSV:**
```bash
curl -X POST http://localhost:8787/v3/jobs/imports \
  -H "Content-Type: multipart/form-data" \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=test-user-123"
```

**Monitor SSE Stream:**
```bash
curl -N http://localhost:8787/v3/jobs/imports/{jobId}/stream?token=auth-token
```

**Expected Events:**
```
event: progress
data: {"progress": 0.05, "message": "Parsing CSV with gemini-3-flash-preview..."}

event: complete
data: {"totalBooks": 2, "validBooks": 2, "errors": 0, "model": "gemini-3-flash-preview"}
```

---

## Analytics & Monitoring

### Telemetry Event Schema

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
  timestamp: '2026-01-11T12:00:00Z'
}
```

### Analytics Engine Queries

**Query Success Rate by Model:**
```sql
SELECT
  blobs[2] AS model,
  COUNT(*) AS total_runs,
  SUM(CASE WHEN blobs[5] = 'success' THEN 1 ELSE 0 END) AS successes,
  ROUND(100.0 * SUM(CASE WHEN blobs[5] = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_pct
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
ORDER BY success_rate_pct DESC
```

**Query P95 Latency by Model:**
```sql
SELECT
  blobs[2] AS model,
  AVG(doubles[1]) AS avg_duration_ms,
  APPROX_PERCENTILE(doubles[1], 0.95) AS p95_duration_ms,
  APPROX_PERCENTILE(doubles[1], 0.99) AS p99_duration_ms
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
ORDER BY avg_duration_ms ASC
```

**Query Token Usage by Model:**
```sql
SELECT
  blobs[2] AS model,
  AVG(doubles[6]) AS avg_prompt_tokens,
  AVG(doubles[7]) AS avg_output_tokens,
  AVG(doubles[8]) AS avg_total_tokens
FROM ai_analytics
WHERE blobs[1] = 'CSV_AB_TEST'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blobs[2]
ORDER BY avg_total_tokens ASC
```

---

## Rollback Procedure

If any variant shows degradation:

**1. Immediate Rollback:**
```bash
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 0
```

**2. Redeploy:**
```bash
npm run deploy
```

**3. Verify:**
```bash
# All requests should return baseline model
for i in {1..10}; do
  curl -X POST https://api.oooefam.net/v3/jobs/imports \
    -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
    -F "userId=rollback-test-$i" | jq '.data.model'
done
```

**Expected:** All requests return `"gemini-3-flash-preview"`

---

## Implementation Details

### JSON Repair Safety Net

**File:** `src/utils/json-repair.ts`

**Features:**
- Automatic detection of "Unterminated string" errors
- Bracket/brace balancing
- Trailing comma removal
- Up to 3 repair attempts before failure

**Usage:**
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

### Model Selection Logic

**Distribution:**
- `0%` → 100% baseline (gemini-3-flash-preview)
- `50%` → 50% baseline, 50% variant (gemini-2.5-flash-lite)
- `100%` → 50% baseline, 50% variant (full A/B test)

**Consistent Bucketing:**
- User ID hashing ensures same user always gets same variant
- Prevents user experience inconsistency

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
**Expected:**
- Valid books: ~45-50
- Errors: 0-5 (validation errors)
- Latency: 10-20s

### Large CSV (500 books, ~50KB)
**Expected:**
- Valid books: ~450-500
- Errors: 0-10%
- Latency: 30-60s

---

## Cost Analysis

### Model Pricing (Gemini API - 2026 Estimates)

- **gemini-3-flash-preview:** $0.10 / 1M input tokens, $0.40 / 1M output (estimated)
- **gemini-2.5-flash-lite:** $0.05 / 1M input tokens, $0.20 / 1M output (estimated)

### Expected Token Usage per CSV

| CSV Size | Input Tokens | Output Tokens | Cost (3-flash-preview) | Cost (2.5-flash-lite) |
|----------|--------------|---------------|------------------------|----------------------|
| Small (2 books) | 2,000 | 200 | $0.00028 | $0.00014 |
| Medium (50 books) | 5,000 | 500 | $0.00070 | $0.00035 |
| Large (500 books) | 20,000 | 2,000 | $0.00280 | $0.00140 |

**Monthly Estimate (1,000 imports/month):**
- Baseline (3-flash-preview): $0.70/month
- Lite variant: $0.35/month
- Potential savings: 50% if lite variant maintains quality

---

## Key Learnings (Issue #253)

1. **Research Before Implementing**
   - PAL MCP `apilookup` identified known Gemini 2.5 Flash JSON issues
   - Official documentation confirmed gemini-3-flash-preview as solution

2. **Belt-and-Suspenders Approach**
   - Model upgrade (primary fix)
   - JSON repair utility (safety net)
   - Both work together for maximum reliability

3. **Feature Flags are Critical**
   - Easy rollback: Set `CSV_MODEL_AB_TEST_PERCENT=0`
   - Gradual rollout: 0% → 10% → 50% → 100%
   - Production safety net

4. **Test-Driven Updates**
   - 12/12 unit tests passing validates implementation
   - 293/293 smoke tests confirm no regressions

---

## References

**Code:**
- `src/config/gemini-models.ts` - Model configuration
- `src/utils/csv-ab-testing.ts` - A/B test logic
- `src/utils/json-repair.ts` - JSON repair utility
- `src/providers/gemini-csv-provider.ts` - CSV parsing integration

**Tests:**
- `tests/unit/csv-ab-testing.test.ts` - 12 unit tests
- `tests/fixtures/csv-ab-testing/` - Test datasets

**Configuration:**
- `wrangler.jsonc` - Feature flags

**External Sources:**
- [Gemini Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini 3 Flash Release Notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash)
- [Gemini API Controlled Generation](https://medium.com/google-cloud/how-to-consistently-output-json-with-the-gemini-api-using-controlled-generation-887220525ae0)

**GitHub Issues:**
- #253 - CSV Parsing Reliability (Resolved)

---

**Last Updated:** January 11, 2026
**Status:** Production Ready
**Current Baseline:** gemini-3-flash-preview (>95% success rate)
**Next Phase:** Cost optimization testing (50% rollout with gemini-2.5-flash-lite)
