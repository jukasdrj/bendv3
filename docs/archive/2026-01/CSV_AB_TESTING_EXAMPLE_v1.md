# CSV A/B Testing - Integration Example

**Quick Start Guide for Testing CSV Model Variants**

---

## Local Testing (Development)

### 1. Update `.env` File

```bash
# Enable A/B testing locally
CSV_MODEL_AB_TEST_PERCENT=100  # Full A/B/C test
ENABLE_CSV_AB_TELEMETRY=true   # Log all telemetry
```

### 2. Run Development Server

```bash
npm run dev
```

### 3. Test with cURL

**Upload Small CSV (2 books):**
```bash
curl -X POST http://localhost:8787/v3/jobs/imports \
  -H "Content-Type: multipart/form-data" \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=test-user-123"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "import-abc123",
    "status": "initialized",
    "streamUrl": "/v3/jobs/imports/import-abc123/stream",
    "statusUrl": "/v3/jobs/imports/import-abc123"
  }
}
```

### 4. Monitor SSE Stream

```bash
curl -N http://localhost:8787/v3/jobs/imports/import-abc123/stream?token=auth-token
```

**Expected Events:**
```
event: progress
data: {"progress": 0.05, "message": "Parsing CSV with gemini-2.5-flash..."}

event: progress
data: {"progress": 0.50, "message": "Validated 2 books"}

event: complete
data: {"totalBooks": 2, "validBooks": 2, "errors": 0, "model": "gemini-2.5-flash"}
```

### 5. Check Telemetry Logs

Look for console output:
```
[CSV A/B Test] {
  "type": "CSV_AB_TEST",
  "model": "gemini-2.5-flash",
  "jobId": "import-abc123",
  "userId": "test-user-123",
  "performance": {
    "durationMs": 5234,
    "apiLatencyMs": 4821,
    "cacheHit": false
  },
  "results": {
    "validBooks": 2,
    "validationErrors": 0,
    "errorRate": 0
  },
  "tokenUsage": {
    "promptTokens": 2090,
    "outputTokens": 200,
    "totalTokens": 2290
  },
  "success": true
}
```

---

## Production Testing

### Phase 1: Canary Deployment (10% Rollout)

**1. Update Production Secrets:**
```bash
# Set 10% rollout
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 10

# Enable telemetry
wrangler secret put ENABLE_CSV_AB_TELEMETRY
# Enter: true
```

**2. Deploy:**
```bash
npm run deploy
```

**3. Verify Distribution:**

Test with multiple user IDs to verify bucketing:
```bash
# User 1 (should get baseline most likely)
curl -X POST https://api.oooefam.net/v3/jobs/imports \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=prod-user-001"

# User 2
curl -X POST https://api.oooefam.net/v3/jobs/imports \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=prod-user-002"

# User 3
curl -X POST https://api.oooefam.net/v3/jobs/imports \
  -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
  -F "userId=prod-user-003"
```

**Expected Distribution (10% rollout):**
- ~90% of users get `gemini-2.5-flash`
- ~5% get `gemini-3-flash-preview`
- ~5% get `gemini-2.5-flash-lite`

---

## Analytics Engine Queries

### 1. Query Success Rate by Model

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

**Expected Output:**
```
┌──────────────────────────┬────────────┬───────────┬──────────────────┐
│ model                    │ total_runs │ successes │ success_rate_pct │
├──────────────────────────┼────────────┼───────────┼──────────────────┤
│ gemini-2.5-flash         │ 450        │ 445       │ 98.89            │
│ gemini-3-flash-preview   │ 25         │ 25        │ 100.00           │
│ gemini-2.5-flash-lite    │ 25         │ 24        │ 96.00            │
└──────────────────────────┴────────────┴───────────┴──────────────────┘
```

### 2. Query P95 Latency by Model

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

**Expected Output:**
```
┌──────────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ model                    │ avg_duration_ms  │ p95_duration_ms  │ p99_duration_ms  │
├──────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ gemini-2.5-flash-lite    │ 3524             │ 5821             │ 7234             │
│ gemini-2.5-flash         │ 5123             │ 8945             │ 12345            │
│ gemini-3-flash-preview   │ 5234             │ 9123             │ 13456            │
└──────────────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### 3. Query Token Usage by Model

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

**Expected Output:**
```
┌──────────────────────────┬────────────────────┬────────────────────┬───────────────────┐
│ model                    │ avg_prompt_tokens  │ avg_output_tokens  │ avg_total_tokens  │
├──────────────────────────┼────────────────────┼────────────────────┼───────────────────┤
│ gemini-2.5-flash-lite    │ 2050               │ 185                │ 2235              │
│ gemini-2.5-flash         │ 2090               │ 200                │ 2290              │
│ gemini-3-flash-preview   │ 2100               │ 210                │ 2310              │
└──────────────────────────┴────────────────────┴────────────────────┴───────────────────┘
```

---

## Validation Checklist

### ✅ Pre-Deployment
- [ ] All unit tests pass (`npm run test:unit -- csv-ab-testing.test.ts`)
- [ ] Linting clean (`npx biome check src/`)
- [ ] Local testing with `small.csv` successful
- [ ] Local testing with `medium.csv` successful
- [ ] Telemetry events logged correctly

### ✅ Canary Deployment (10%)
- [ ] Feature flags deployed to production
- [ ] Model distribution verified (90% baseline, 10% variants)
- [ ] No increase in error rate
- [ ] Telemetry flowing to Analytics Engine
- [ ] All variants completing within timeout

### ✅ Gradual Rollout (25% → 50% → 100%)
- [ ] Minimum 100 samples per variant collected
- [ ] P95 latency within acceptable range
- [ ] Success rate ≥95% for all variants
- [ ] No production incidents

### ✅ Analysis Phase
- [ ] Statistical significance achieved
- [ ] Weighted scores calculated
- [ ] Cost analysis completed
- [ ] Winner selected based on criteria

---

## Decision Framework

### Calculate Weighted Score

```typescript
const scores = {
  'gemini-2.5-flash': {
    successRate: 0.9889,
    p95Latency: 8945,
    errorRate: 0.0111,
    tokenUsage: 2290,
  },
  'gemini-3-flash-preview': {
    successRate: 1.0,
    p95Latency: 9123,
    errorRate: 0.0,
    tokenUsage: 2310,
  },
  'gemini-2.5-flash-lite': {
    successRate: 0.96,
    p95Latency: 5821,
    errorRate: 0.04,
    tokenUsage: 2235,
  },
}

// Weights (must sum to 1.0)
const weights = {
  successRate: 0.4,
  latency: 0.3,
  accuracy: 0.2,
  cost: 0.1,
}

function calculateScore(model: string) {
  const data = scores[model]

  // Normalize metrics (higher is better)
  const successScore = data.successRate
  const latencyScore = 1 - (data.p95Latency / 90000) // Max 90s timeout
  const accuracyScore = 1 - data.errorRate
  const costScore = 1 - (data.tokenUsage / 3000) // Assume 3000 max

  const totalScore =
    weights.successRate * successScore +
    weights.latency * latencyScore +
    weights.accuracy * accuracyScore +
    weights.cost * costScore

  return totalScore
}

// Calculate for all models
console.log('gemini-2.5-flash:', calculateScore('gemini-2.5-flash'))
console.log('gemini-3-flash-preview:', calculateScore('gemini-3-flash-preview'))
console.log('gemini-2.5-flash-lite:', calculateScore('gemini-2.5-flash-lite'))
```

**Example Output:**
```
gemini-2.5-flash: 0.85
gemini-3-flash-preview: 0.88  ← Winner
gemini-2.5-flash-lite: 0.82
```

---

## Rollback Scenario

**Symptom:** gemini-2.5-flash-lite shows 10% error rate

**Immediate Action:**
```bash
# Set to 0% rollout (baseline only)
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 0

# Redeploy
npm run deploy
```

**Verification:**
```bash
# Test with multiple users - all should get baseline
for i in {1..10}; do
  curl -X POST https://api.oooefam.net/v3/jobs/imports \
    -F "file=@tests/fixtures/csv-ab-testing/small.csv" \
    -F "userId=rollback-test-$i" | jq '.data.model'
done
```

**Expected:** All requests return `"gemini-2.5-flash"`

---

## Next Steps After Winner Selected

### 1. Update Default Model
```typescript
// src/config/gemini-models.ts
export const DEFAULT_CSV_MODEL: GeminiCSVModel = 'gemini-3-flash-preview' // ← Update
```

### 2. Disable A/B Testing
```bash
wrangler secret put CSV_MODEL_AB_TEST_PERCENT
# Enter: 0

wrangler secret put ENABLE_CSV_AB_TELEMETRY
# Enter: false
```

### 3. Document Decision
```markdown
# CHANGELOG.md
## [3.5.0] - 2026-01-XX

### Changed
- **CSV Parsing:** Upgraded to gemini-3-flash-preview for improved accuracy
  - 100% success rate (vs. 98.89% baseline)
  - P95 latency: 9.1s (acceptable)
  - Validation: A/B tested over 2 weeks, 500+ samples
```

---

**Last Updated:** January 7, 2026
**Status:** Ready for Phase 1 (Internal Testing)
