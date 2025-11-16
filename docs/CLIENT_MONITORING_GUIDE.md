# Client Implementation Monitoring Guide

**Target Audience:** Backend Team, DevOps
**Purpose:** Monitor iOS/Flutter v2.0 adoption and health during migration
**Effective Date:** November 16, 2025 - March 1, 2026

---

## 📋 Table of Contents

1. [Monitoring Overview](#1-monitoring-overview)
2. [Key Metrics](#2-key-metrics)
3. [Monitoring Dashboard](#3-monitoring-dashboard)
4. [Alert Configuration](#4-alert-configuration)
5. [Client Adoption Tracking](#5-client-adoption-tracking)
6. [Error Pattern Analysis](#6-error-pattern-analysis)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Weekly Health Reports](#8-weekly-health-reports)

---

## 1. Monitoring Overview

### 1.1 Monitoring Phases

| Phase | Duration | Focus | Alerts |
|-------|----------|-------|--------|
| **Pre-Migration** | Nov 16-23 | Baseline v1.x metrics | Critical only |
| **Client Implementation** | Nov 23 - Dec 21 | v2.0 adoption rate, error patterns | All alerts |
| **Production Launch** | Dec 21 (4 hours) | Real-time error monitoring | Zero tolerance |
| **Post-Launch** | Dec 21 - Jan 4 | Stability validation | Gradual reduction |
| **Legacy Deprecation** | Jan 4 - Mar 1 | v1.x usage decline | Deprecation warnings |

### 1.2 Data Sources

- **Analytics Engine:** Request metrics, error rates, latency
- **Cloudflare Logs:** IP addresses, user agents, request paths
- **KV Cache:** Hit rates, TTL effectiveness
- **Durable Objects:** WebSocket connection health
- **Feature Flags:** v2.0 adoption rate via remote config

---

## 2. Key Metrics

### 2.1 Adoption Metrics

**Endpoint Usage:**
- `requests_v1_total` - Requests to legacy `/search/*` endpoints
- `requests_v2_total` - Requests to `/v1/*` endpoints
- `adoption_rate` - `v2 / (v1 + v2)` × 100%

**Target:**
- Week 1 (Nov 23-30): 10% v2.0 adoption
- Week 2 (Nov 30-Dec 7): 30% v2.0 adoption
- Week 3 (Dec 7-14): 60% v2.0 adoption
- Week 4 (Dec 14-21): 100% v2.0 adoption

**Query:**
```sql
SELECT
  CASE
    WHEN blob1 LIKE '/v1/%' THEN 'v2'
    WHEN blob1 LIKE '/search/%' OR blob1 = '/api/enrichment/start' THEN 'v1'
    ELSE 'other'
  END AS api_version,
  COUNT(*) AS requests
FROM PERFORMANCE_ANALYTICS
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY api_version
```

---

### 2.2 Error Metrics

**Error Rates by Endpoint:**
- `error_rate_v1` - Errors on legacy endpoints (%)
- `error_rate_v2` - Errors on v2.0 endpoints (%)
- `error_codes` - Distribution of error codes (400, 404, 500, etc.)

**Target:**
- Overall error rate: < 2%
- v2.0 error rate: < 3% (acceptable during migration)
- 5xx errors: < 0.5%

**Query:**
```sql
SELECT
  blob1 AS endpoint,
  blob2 AS error_code,
  COUNT(*) AS error_count,
  AVG(double2) AS avg_processing_time_ms
FROM PERFORMANCE_ANALYTICS
WHERE
  double1 >= 400  -- HTTP status code
  AND timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY endpoint, error_code
ORDER BY error_count DESC
LIMIT 20
```

---

### 2.3 Performance Metrics

**Latency:**
- `p50_latency_ms` - Median response time
- `p95_latency_ms` - 95th percentile response time
- `p99_latency_ms` - 99th percentile response time

**Target (API Contract §8.2):**
- `/v1/search/*` P95: < 500ms (uncached), < 50ms (cached)
- `/v1/scan/results/*` P95: < 50ms (always cached)

**Query:**
```sql
SELECT
  blob1 AS endpoint,
  APPROX_QUANTILE(double2, 0.50) AS p50_ms,
  APPROX_QUANTILE(double2, 0.95) AS p95_ms,
  APPROX_QUANTILE(double2, 0.99) AS p99_ms
FROM PERFORMANCE_ANALYTICS
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY endpoint
```

---

### 2.4 WebSocket Metrics

**Connection Health:**
- `ws_connections_total` - Active WebSocket connections
- `ws_disconnect_rate` - Disconnects / connections (%)
- `ws_reconnect_success_rate` - Successful reconnections (%)

**Target:**
- Disconnect rate: < 10%
- Reconnect success rate: > 90%
- Message latency: < 50ms

**Durable Object Tracking:**
```javascript
// In ProgressWebSocketDO.js
this.env.PERFORMANCE_ANALYTICS.writeDataPoint({
  blobs: ['websocket', closeCode.toString(), reconnect ? 'reconnect' : 'initial'],
  doubles: [connectionDuration, messagesSent],
  indexes: ['websocket']
})
```

---

## 3. Monitoring Dashboard

### 3.1 Dashboard URL

**Production:** https://api.oooefam.net/metrics

### 3.2 Dashboard Sections

#### Section 1: Adoption Overview

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 API v2.0 Adoption (Last 24 Hours)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
v1.x Requests:  12,453  ████████░░ 45%
v2.0 Requests:  15,234  ████████████ 55%

Target: 60% by Dec 7 → ✅ ON TRACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Section 2: Error Rates

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Error Rates (Last 1 Hour)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoint                   Errors  Rate
──────────────────────────────────────
/v1/search/title              12  0.8%  ✅
/v1/search/isbn                5  0.3%  ✅
/search/title (legacy)        45  2.1%  ⚠️
/api/enrichment/start         78  4.5%  🔴

Top Error Codes:
  400 INVALID_ISBN: 23
  404 NOT_FOUND: 18
  429 RATE_LIMIT: 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Section 3: Performance

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Performance (P95 Latency)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/v1/search/title        234 ms  ✅  (target: <500ms)
/v1/search/isbn         189 ms  ✅
/v1/scan/results/{id}    32 ms  ✅  (target: <50ms)

Cache Hit Rate:  78.3%  ✅  (target: >70%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Section 4: WebSocket Health

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 WebSocket Health (Last 1 Hour)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Active Connections:      342
Disconnect Rate:        8.7%  ✅  (target: <10%)
Reconnect Success:     94.2%  ✅  (target: >90%)
Avg Message Latency:    28 ms ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 4. Alert Configuration

### 4.1 Critical Alerts (Immediate Response)

**Trigger:** Error rate > 5% for 5 minutes

**Action:**
1. **Instant rollback** via remote config (disable v2.0 feature flag)
2. Page on-call engineer
3. Post in #bookstrack-api Slack

**Rollback Procedure:**
```bash
# Update Firebase Remote Config (or your feature flag service)
# Set useV2API: false (affects all clients within 60 seconds)

# No deployment needed - feature flag change is instant
```

**Alert Implementation:**
```javascript
// In handleScheduledAlerts (src/handlers/scheduled-alerts.js)
const errorRate = errors / totalRequests

if (errorRate > 0.05) {
  await sendSlackAlert({
    channel: '#bookstrack-api',
    severity: 'critical',
    message: `Error rate: ${(errorRate * 100).toFixed(1)}% - DISABLE V2 FEATURE FLAG NOW`,
    runbook: 'https://docs.oooefam.net/runbooks/rollback-v2'
  })
}
```

---

### 4.2 Warning Alerts (Monitor)

**Trigger:** P95 latency > 1000ms for 15 minutes

**Action:**
1. Post in #bookstrack-api Slack
2. Check KV cache hit rate
3. Monitor external API providers

**Trigger:** Cache hit rate < 60% for 30 minutes

**Action:**
1. Investigate cache expiration
2. Check KV namespace health
3. Verify cache warming queue

---

### 4.3 Deprecation Warnings

**Trigger:** v1.x usage > 5% after Jan 4, 2026

**Action:**
1. Email iOS/Flutter teams with list of non-migrated devices
2. Post deprecation warning in Slack
3. Prepare sunset communication

---

## 5. Client Adoption Tracking

### 5.1 User Agent Analysis

**Track iOS/Flutter client versions:**
```sql
SELECT
  REGEXP_EXTRACT(blob3, 'BooksTrack-iOS/([0-9.]+)', 1) AS ios_version,
  COUNT(*) AS requests,
  SUM(CASE WHEN blob1 LIKE '/v1/%' THEN 1 ELSE 0 END) AS v2_requests
FROM PERFORMANCE_ANALYTICS
WHERE blob3 LIKE '%BooksTrack-iOS%'
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY ios_version
ORDER BY requests DESC
```

**Expected Output:**
```
ios_version  requests  v2_requests  adoption_rate
3.2.0        45,123    45,123       100.0%  ✅ Migrated
3.1.0        12,456     9,123        73.2%  ⚠️ Partial
3.0.0         3,421         0         0.0%  🔴 Legacy
```

**Action:**
- Email users on 3.0.0 to update app
- Push notification for mandatory update after Jan 4

---

### 5.2 IP-Based Segmentation

**Identify early adopters vs. laggards:**
```sql
SELECT
  blob4 AS client_ip,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN blob1 LIKE '/v1/%' THEN 1 ELSE 0 END) AS v2_requests,
  ROUND(SUM(CASE WHEN blob1 LIKE '/v1/%' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS v2_percentage
FROM PERFORMANCE_ANALYTICS
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY client_ip
HAVING total_requests > 100
ORDER BY v2_percentage ASC
LIMIT 100
```

**Use Cases:**
- Identify TestFlight users (100% v2.0 expected)
- Find devices stuck on legacy endpoints
- Contact power users for early feedback

---

## 6. Error Pattern Analysis

### 6.1 Common Migration Errors

**Error Pattern 1: Response Parsing**
```
Error: "Key 'success' not found in JSON"
Cause: iOS parsing legacy response format from v2.0 endpoint
Action: Check feature flag, verify API version in client
```

**Error Pattern 2: ISBN Array Access**
```
Error: "Index out of bounds: isbns[0]"
Cause: Empty isbns array in EditionDTO
Action: Update iOS to check array.isEmpty before accessing
```

**Error Pattern 3: WebSocket Results**
```
Error: "Results not found for job {uuid}"
Cause: Fetching results after 24-hour TTL
Action: iOS should show error, allow re-scan
```

---

### 6.2 Error Correlation Query

**Find errors by client version:**
```sql
SELECT
  REGEXP_EXTRACT(blob3, 'BooksTrack-iOS/([0-9.]+)', 1) AS ios_version,
  blob2 AS error_code,
  COUNT(*) AS error_count
FROM PERFORMANCE_ANALYTICS
WHERE double1 >= 400  -- HTTP error
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY ios_version, error_code
ORDER BY error_count DESC
```

---

## 7. Performance Benchmarks

### 7.1 Expected Performance

| Metric | v1.x Baseline | v2.0 Target | Acceptable Range |
|--------|---------------|-------------|------------------|
| P95 Latency (uncached) | 450ms | 400ms | 300-500ms |
| P95 Latency (cached) | 45ms | 40ms | 30-50ms |
| Cache Hit Rate | 75% | 80% | 70-85% |
| Error Rate | 1.8% | 1.5% | <3% |

### 7.2 Regression Detection

**Alert if:**
- v2.0 P95 latency > 1.2× v1.x baseline
- v2.0 cache hit rate < 0.9× v1.x baseline
- v2.0 error rate > 1.5× v1.x baseline

---

## 8. Weekly Health Reports

### 8.1 Automated Reports

**Delivered:** Every Monday 9 AM EST to #bookstrack-api Slack

**Contents:**
1. Adoption progress vs. target
2. Top 10 errors by count
3. Performance summary (latency, cache hit rate)
4. Client version distribution
5. Action items for upcoming week

**Implementation:**
```bash
# Cron trigger: 0 9 * * 1 (every Monday 9 AM UTC)
npx wrangler triggers add --cron "0 9 * * 1" --name "weekly-health-report"
```

---

### 8.2 Manual Review Checklist

**Every Friday 2 PM EST:**

- [ ] Review adoption rate vs. target (on track?)
- [ ] Check error rate trend (increasing or stable?)
- [ ] Verify staging environment health
- [ ] Review client feedback from Slack/email
- [ ] Update migration timeline if needed
- [ ] Prepare rollback plan if adoption < 50%

---

## Appendix A: Dashboard Implementation

### A.1 Metrics Endpoint

**File:** `src/handlers/metrics-handler.js`

```javascript
export async function handleMetricsRequest(request, env, ctx) {
  const now = Date.now()
  const oneDayAgo = now - 86400000

  // Query Analytics Engine
  const v1Requests = await queryAnalytics(env, {
    filter: "blob1 LIKE '/search/%' OR blob1 = '/api/enrichment/start'",
    start: oneDayAgo,
    end: now
  })

  const v2Requests = await queryAnalytics(env, {
    filter: "blob1 LIKE '/v1/%'",
    start: oneDayAgo,
    end: now
  })

  const adoptionRate = (v2Requests / (v1Requests + v2Requests)) * 100

  return jsonResponse({
    adoption: {
      v1: v1Requests,
      v2: v2Requests,
      rate: adoptionRate.toFixed(1)
    },
    errors: await getErrorSummary(env),
    performance: await getPerformanceSummary(env),
    websocket: await getWebSocketHealth(env)
  })
}
```

---

### A.2 Slack Alert Integration

```javascript
async function sendSlackAlert(payload) {
  const webhookURL = env.SLACK_WEBHOOK_URL

  await fetch(webhookURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 ${payload.severity.toUpperCase()}: ${payload.message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${payload.message}*\n\n<${payload.runbook}|View Runbook>`
          }
        }
      ]
    })
  })
}
```

---

**Last Updated:** November 16, 2025
**Maintained By:** Backend Team
**Review Frequency:** Weekly during migration phase
**Related Docs:** [MONITORING_GUIDE.md](./MONITORING_GUIDE.md), [V2_MIGRATION_GUIDE.md](./V2_MIGRATION_GUIDE.md)
