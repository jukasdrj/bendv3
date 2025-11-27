# Cache Monitoring and Alerting System

**Status:** Production (Phase 1 MVP Complete)
**Issue:** #81, #99
**Last Updated:** November 27, 2025

---

## Overview

BooksTrack includes a comprehensive cache monitoring system that tracks performance metrics, generates alerts when thresholds are exceeded, and provides real-time visibility through dashboard endpoints.

**Key Features:**
- Automated health checks every 15 minutes via cron
- Configurable alert thresholds (critical/warning levels)
- Alert deduplication (4-hour suppression window)
- Historical alert storage (7-day retention in KV)
- REST API dashboard endpoints
- Console logging for ops visibility

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cron Trigger                             │
│               (Every 15 minutes: */15 * * * *)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            handleScheduledAlerts()                           │
│         (src/handlers/scheduled-alerts.js)                   │
│                                                              │
│  1. Aggregate metrics (last 15 minutes)                     │
│  2. Check alert thresholds                                  │
│  3. Deduplicate alerts (4-hour window)                      │
│  4. Log to console                                          │
│  5. Store alerts in KV (7-day TTL)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Alert Monitor Service                           │
│           (src/services/alert-monitor.js)                    │
│                                                              │
│  - checkAlertThresholds()  → Validate metrics               │
│  - shouldSendAlert()       → Deduplication logic            │
│  - markAlertSent()         → Track in KV                    │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Cache Dashboard Endpoints                       │
│         (src/handlers/cache-dashboard.ts)                    │
│                                                              │
│  GET /api/cache/dashboard  → Full health + alerts + stats   │
│  GET /api/cache/health     → Lightweight health check       │
│  GET /api/cache/alerts     → Alert history only             │
└─────────────────────────────────────────────────────────────┘
```

---

## Alert Thresholds

Thresholds are configured in `wrangler.jsonc` under the `vars` section:

### Critical Alerts (Severity: CRITICAL)

| Metric | Threshold | Description |
|--------|-----------|-------------|
| **Miss Rate** | > 15% | Cache miss rate critically high (inverse of hit rate) |
| **P99 Latency** | > 500ms | 99th percentile latency exceeds 500ms |
| **Error Rate** | > 5% | Endpoint error rate above 5% |
| **Contract Violations** | > 5 in 5min | API contract violations detected |
| **WebSocket Disconnect Rate** | > 10% | WebSocket connections dropping abnormally |

### Warning Alerts (Severity: WARNING)

| Metric | Threshold | Description |
|--------|-----------|-------------|
| **Miss Rate** | > 10% | Cache miss rate elevated |
| **Edge Hit Rate** | < 75% | Edge cache effectiveness below target |
| **D1 P95 Latency** | > 100ms | Database latency elevated for 5+ minutes |
| **KV Storage** | > 1GB | KV namespace size approaching limits |

### Configuration Example

```jsonc
// wrangler.jsonc
{
  "vars": {
    "CACHE_ALERT_HIT_RATE_THRESHOLD_CRITICAL": "0.65",  // 65% (miss rate > 35%)
    "CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING": "0.70",   // 70% (miss rate > 30%)
    "CACHE_ALERT_HOT_CACHE_THRESHOLD_CRITICAL": "0.80",
    "CACHE_ALERT_HOT_CACHE_THRESHOLD_WARNING": "0.85",
    "CACHE_ALERT_DROP_THRESHOLD_CRITICAL": "0.15",      // 15% drop
    "CACHE_ALERT_DROP_THRESHOLD_WARNING": "0.10"        // 10% drop
  }
}
```

---

## Dashboard Endpoints

### 1. Full Dashboard - GET /api/cache/dashboard

Returns comprehensive cache health, recent alerts, and statistics.

**Request:**
```bash
curl https://api.oooefam.net/api/cache/dashboard
```

**Response (ResponseEnvelope v2.0):**
```json
{
  "success": true,
  "data": {
    "health": {
      "healthy": true,
      "status": "healthy",
      "alerts": {
        "critical": 0,
        "warning": 1,
        "total": 1
      },
      "metrics": {
        "hitRate": 87.5,
        "edgeHitRate": 45.2,
        "kvHitRate": 42.3,
        "missRate": 12.5,
        "totalRequests": 15432
      },
      "timestamp": "2025-11-27T10:15:00Z"
    },
    "alerts": {
      "recent": [
        {
          "severity": "warning",
          "type": "edge_hit_rate",
          "value": 72.3,
          "threshold": 75,
          "message": "Edge hit rate below target: 72.3%",
          "timestamp": "2025-11-27T10:00:00Z"
        }
      ],
      "count": 1
    },
    "stats": {
      "current": {
        "period": "15m",
        "hitRate": 87.5,
        "edgeHitRate": 45.2,
        "kvHitRate": 42.3,
        "r2HitRate": 0.0,
        "apiMissRate": 12.5,
        "totalRequests": 15432
      },
      "trends": {
        "oneHour": { "hitRate": 86.1, "totalRequests": 58921 },
        "oneDay": { "hitRate": 88.3, "totalRequests": 1423567 }
      },
      "breakdown": {
        "edge": { "percentage": 45.2, "count": 6975 },
        "kv": { "percentage": 42.3, "count": 6528 },
        "r2": { "percentage": 0.0, "count": 0 },
        "api": { "percentage": 12.5, "count": 1929 }
      }
    }
  },
  "metadata": {
    "source": "cache-dashboard",
    "cached": false,
    "timestamp": "2025-11-27T10:15:00Z"
  }
}
```

### 2. Health Check - GET /api/cache/health

Lightweight health status check (no historical data).

**Request:**
```bash
curl https://api.oooefam.net/api/cache/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "status": "healthy",
    "alerts": {
      "critical": 0,
      "warning": 0,
      "total": 0
    },
    "metrics": {
      "hitRate": 87.5,
      "edgeHitRate": 45.2,
      "kvHitRate": 42.3,
      "missRate": 12.5,
      "totalRequests": 15432
    },
    "timestamp": "2025-11-27T10:15:00Z"
  },
  "metadata": {
    "source": "cache-health",
    "cached": false
  }
}
```

**Status Values:**
- `healthy` - No critical alerts, system operating normally
- `degraded` - Warning alerts present, performance suboptimal
- `critical` - Critical alerts present, immediate attention required
- `unknown` - Health check failed, monitoring system error

### 3. Alert History - GET /api/cache/alerts

Retrieve recent alert history with configurable limit.

**Request:**
```bash
# Default: last 20 alerts
curl https://api.oooefam.net/api/cache/alerts

# Custom limit (1-100)
curl https://api.oooefam.net/api/cache/alerts?limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "alerts": [
          {
            "severity": "warning",
            "type": "miss_rate",
            "value": 11.2,
            "threshold": 10,
            "message": "Cache miss rate elevated: 11.2%"
          }
        ],
        "metrics": {
          "hitRate": 88.8,
          "edgeHitRate": 47.1,
          "kvHitRate": 41.7,
          "totalRequests": 14892
        },
        "timestamp": "2025-11-27T10:00:00Z",
        "key": "alert:stored:1732702800000",
        "storedAt": "2025-11-27T10:00:00Z"
      }
    ],
    "count": 1,
    "limit": 20
  },
  "metadata": {
    "source": "cache-alerts",
    "cached": false
  }
}
```

---

## Alert Deduplication

The system prevents alert spam using a 4-hour suppression window:

**Logic:**
1. Alert types are sorted and combined into a key (e.g., `miss_rate:p99_latency`)
2. Key is stored in KV with timestamp after alert is sent
3. Subsequent identical alerts within 4 hours are suppressed
4. After 4 hours, alert can be sent again

**KV Storage:**
```
Key: alert:miss_rate:p99_latency
Value: 1732702800000 (timestamp)
TTL: 4 hours (14400 seconds)
```

**Console Output (Suppressed Alert):**
```
[Alert Monitor] Alert suppressed (duplicate within 4h window)
```

---

## Monitoring the Monitoring System

### Check Cron Job Status

```bash
# View wrangler cron configuration
cat wrangler.jsonc | grep -A 10 "triggers"

# Expected output:
# "triggers": {
#   "crons": [
#     "0 2 * * *",       # Daily archival
#     "*/15 * * * *",    # Alert monitoring (THIS ONE)
#     "0 3 * * *",       # Cover harvest
#     ...
#   ]
# }
```

### View Recent Alert Logs

```bash
# Stream real-time logs (includes alert checks)
npx wrangler tail

# Filter for alert monitoring only
npx wrangler tail | grep "Alert Monitor"

# Expected output every 15 minutes:
# [Alert Monitor] Running alert check...
# [Alert Monitor] ✅ No alerts triggered - system healthy
```

### Test Alert Generation Manually

You can trigger the scheduled handler manually via Cloudflare dashboard or CLI:

```bash
# Deploy with explicit cron trigger
npx wrangler deploy

# Check Cloudflare dashboard:
# Workers & Pages → api-worker → Triggers → Cron Triggers
# Verify "*/15 * * * *" is listed
```

---

## Alert Storage in KV

Alerts are stored in the `CACHE` KV namespace for dashboard retrieval:

**Key Pattern:**
```
alert:stored:{timestamp}
```

**Example:**
```json
// Key: alert:stored:1732702800000
{
  "alerts": [
    {
      "severity": "critical",
      "type": "miss_rate",
      "value": 17.3,
      "threshold": 15,
      "message": "Cache miss rate critically high: 17.3%"
    }
  ],
  "metrics": {
    "hitRate": 82.7,
    "edgeHitRate": 38.2,
    "kvHitRate": 44.5,
    "totalRequests": 23456
  },
  "timestamp": "2025-11-27T10:00:00Z"
}
```

**Retention:** 7 days (604800 seconds TTL)

**Cleanup:** Automatic via KV expiration

---

## Phase 1 vs Phase 2+ Features

### Phase 1 (MVP) - COMPLETE

- [x] Automated health checks (15-minute cron)
- [x] Alert threshold validation
- [x] Alert deduplication (4-hour window)
- [x] KV-based alert storage (7-day retention)
- [x] Console logging
- [x] Dashboard endpoints (3 endpoints)
- [x] Unit tests (3/3 passing)
- [x] Configuration via wrangler.jsonc

### Phase 2 - PLANNED (Future)

- [ ] Email notifications (Mailgun/SendGrid integration)
- [ ] Slack webhook notifications
- [ ] Secrets setup guide (MAILGUN_API_KEY, SLACK_WEBHOOK_URL)
- [ ] Alert acknowledgment system
- [ ] Per-prefix performance tracking
- [ ] Correlation with deployment events

### Phase 3 - PLANNED (Future)

- [ ] Visual dashboard UI (charts, graphs)
- [ ] Historical trend analysis (7/30/90 days)
- [ ] Manual cache operations (invalidate, warm-up)
- [ ] Alert rule customization

### Phase 4 - PLANNED (Future)

- [ ] Anomaly detection (ML-based)
- [ ] Predictive alerting (forecast issues)
- [ ] Automated remediation (auto-adjust TTLs)
- [ ] Advanced analytics

---

## Email/Slack Notifications (Phase 2)

Email and Slack notifications are currently **disabled by design** (Phase 1 MVP uses console logging only). To enable in the future:

### 1. Set Up Secrets

```bash
# Mailgun configuration
wrangler secret put MAILGUN_API_KEY
wrangler secret put MAILGUN_DOMAIN

# Slack configuration
wrangler secret put SLACK_WEBHOOK_URL
```

### 2. Update wrangler.jsonc

```jsonc
{
  "vars": {
    "ALERT_FROM_EMAIL": "alerts@bookstrack.com",
    "ALERT_TO_EMAIL": "ops@bookstrack.com"
  }
}
```

### 3. Implement sendAlertEmail() Function

Currently stubbed in `src/handlers/scheduled-alerts.js`:

```javascript
// TODO: Uncomment when email alerts are needed
// const alertEmail = env.ALERT_EMAIL || 'nerd@ooheynerds.com';
// await sendAlertEmail(alerts, metrics, alertEmail);
// console.log(`[Alert Monitor] Alert email sent to ${alertEmail}`);
```

Example implementation:

```javascript
async function sendAlertEmail(alerts, metrics, env) {
  const response = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      from: env.ALERT_FROM_EMAIL,
      to: env.ALERT_TO_EMAIL,
      subject: `[BooksTrack] Cache Alert: ${alerts[0].severity.toUpperCase()}`,
      text: formatAlertEmail(alerts, metrics)
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${response.statusText}`);
  }
}

function formatAlertEmail(alerts, metrics) {
  return `
BooksTrack Cache Alert
Time: ${new Date().toISOString()}

ALERTS (${alerts.length}):
${alerts.map(a => `  [${a.severity.toUpperCase()}] ${a.message}`).join('\n')}

METRICS (Last 15 minutes):
  Hit Rate: ${metrics.hitRates.combined.toFixed(1)}%
  Edge: ${metrics.hitRates.edge.toFixed(1)}%
  KV: ${metrics.hitRates.kv.toFixed(1)}%
  Total Requests: ${metrics.volume.total_requests}

Dashboard: https://api.oooefam.net/api/cache/dashboard
  `.trim();
}
```

### 4. Enable in Code

Uncomment lines 90-93 in `src/handlers/scheduled-alerts.js`:

```javascript
// Change from:
// TODO: Uncomment when email alerts are needed
// const alertEmail = env.ALERT_EMAIL || 'nerd@ooheynerds.com';
// await sendAlertEmail(alerts, metrics, alertEmail);

// To:
const alertEmail = env.ALERT_TO_EMAIL || 'nerd@ooheynerds.com';
await sendAlertEmail(alerts, metrics, env);
console.log(`[Alert Monitor] Alert email sent to ${alertEmail}`);
```

---

## Troubleshooting

### No Alerts Appearing in Dashboard

**Check 1: Verify cron is running**
```bash
npx wrangler tail | grep "Alert Monitor"
# Should see output every 15 minutes
```

**Check 2: Check metrics aggregation**
```bash
curl https://api.oooefam.net/api/cache/dashboard
# Look at data.health.metrics
```

**Check 3: Lower thresholds temporarily**
```jsonc
// wrangler.jsonc - Make thresholds easier to trigger
{
  "CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING": "0.95"  // Alert if < 95% hit rate
}
```

### Alerts Not Being Logged

**Check console output:**
```bash
npx wrangler tail --format json | jq 'select(.message | contains("Alert Monitor"))'
```

**Verify handler is registered:**
```javascript
// src/index.js - Check scheduled() function
case "*/15 * * * *":
  console.log("[Cron] Running alert monitoring job");
  await handleScheduledAlerts(env, ctx);
  break;
```

### Dashboard Endpoints Return Errors

**Check KV binding:**
```bash
# Verify CACHE namespace exists
npx wrangler kv:namespace list

# Should include:
# { "id": "...", "title": "api-worker-CACHE" }
```

**Check metrics aggregation:**
```javascript
// Test metrics-aggregator directly
const metrics = await aggregateMetrics(env, '15m');
console.log('Metrics:', metrics);
```

---

## Performance Considerations

### KV Read/Write Costs

**Per 15-minute cron cycle:**
- 1 KV read (check deduplication)
- 1-2 KV writes (store alert if triggered, mark as sent)
- Average: ~3 KV operations per hour
- Daily: ~72 KV operations

**Alert history retrieval:**
- Dashboard endpoint: ~20 KV reads (list keys + fetch alerts)
- Cached at edge (1-minute TTL) to reduce KV load

**Monthly KV usage estimate:**
- Cron: 2,160 operations (72/day × 30 days)
- Dashboard: ~500 operations (assuming 25 checks/day)
- Total: ~2,660 operations/month (well within free tier: 10M reads/month)

### CPU Time

Scheduled handler execution:
- Metrics aggregation: ~50-100ms
- Alert threshold checks: ~10ms
- KV operations: ~20ms
- **Total: ~100-150ms per cycle**

---

## Related Documentation

- **API Contract:** `docs/API_CONTRACT.md` - Cache dashboard endpoint schemas
- **Alert Service:** `src/services/alert-monitor.js` - Threshold logic
- **Dashboard Handler:** `src/handlers/cache-dashboard.ts` - Endpoint implementation
- **Scheduled Handler:** `src/handlers/scheduled-alerts.js` - Cron job handler
- **Issue #81:** https://github.com/jukasdrj/bendv3/issues/81
- **Issue #99:** https://github.com/jukasdrj/bendv3/issues/99

---

## Changelog

**November 27, 2025 - v1.0 (Phase 1 MVP)**
- Initial documentation created
- Phase 1 features documented
- Dashboard endpoints documented
- Email/Slack setup guide added (Phase 2)

---

**Maintained by:** BooksTrack Backend Team
**Contact:** nerd@ooheynerds.com
**Production API:** https://api.oooefam.net
