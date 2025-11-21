# Alerting Rules for BooksTrack API v2.0

**Purpose:** Define alert thresholds and notification procedures for API monitoring  
**Audience:** DevOps Team, Platform Engineers, On-Call Engineers  
**Updated:** November 15, 2025

---

## Table of Contents

1. [Alert Severity Levels](#alert-severity-levels)
2. [Critical Alerts](#critical-alerts)
3. [Warning Alerts](#warning-alerts)
4. [Alert Configuration](#alert-configuration)
5. [Notification Channels](#notification-channels)
6. [Alert Response Procedures](#alert-response-procedures)

---

## Alert Severity Levels

| Level | Response Time | Escalation | Examples |
|-------|---------------|------------|----------|
| **CRITICAL** | Immediate (5 min) | Page on-call engineer | Error rate >10%, API down, data loss |
| **WARNING** | 30 minutes | Slack notification | Error rate >5%, latency >1s, cache degradation |
| **INFO** | Next business day | Email | Quota warnings, scheduled job failures |

---

## Critical Alerts

### 1. High Error Rate (>10%)

**Metric:** `(Total 4xx + 5xx Errors / Total Requests) × 100`

**Threshold:**
- **CRITICAL:** >10% over 5 minutes
- **WARNING:** >5% over 5 minutes

**Query:**
```sql
SELECT 
  (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as error_rate
FROM books_api_performance
WHERE timestamp > NOW() - INTERVAL 5 MINUTE
HAVING error_rate > 10
```

**Alert Message:**
```
🚨 CRITICAL: API Error Rate Exceeds 10%
Current: 12.5%
Threshold: 10%
Timeframe: Last 5 minutes
Action Required: Investigate immediately
Dashboard: https://dash.cloudflare.com/...
```

**Possible Causes:**
- External API failures (Google Books, ISBNdb, Gemini)
- Breaking change deployed
- Invalid client requests (API v2 migration issues)
- Rate limiting triggered

**Response Actions:**
1. Check Cloudflare Worker logs: `wrangler tail --remote --format pretty`
2. Identify error codes: Review `X-Error-Code` headers
3. Check external API status pages
4. Consider rollback if recent deployment

---

### 2. Extreme Latency (>2 seconds P95)

**Metric:** `95th percentile response time`

**Threshold:**
- **CRITICAL:** >2000ms over 10 minutes
- **WARNING:** >1000ms over 10 minutes

**Query:**
```sql
SELECT QUANTILE(double2, 0.95) as p95_latency
FROM books_api_performance
WHERE timestamp > NOW() - INTERVAL 10 MINUTE
HAVING p95_latency > 2000
```

**Alert Message:**
```
🚨 CRITICAL: API Latency P95 > 2 seconds
Current: 2.3s
Threshold: 2.0s
Timeframe: Last 10 minutes
Action Required: Investigate performance issue
```

**Possible Causes:**
- Cache miss storm (KV/R2 unavailable)
- External API slowdowns
- Durable Object contention
- Cold start issues

**Response Actions:**
1. Check cache hit rate (should be >70%)
2. Review external provider latency
3. Check Durable Object logs
4. Consider cache warming or circuit breakers

---

### 3. High 5xx Error Rate (>5%)

**Metric:** `(Total 5xx Errors / Total Requests) × 100`

**Threshold:**
- **CRITICAL:** >5% over 5 minutes
- **WARNING:** >2% over 5 minutes

**Query:**
```sql
SELECT 
  (SUM(CASE WHEN double1 >= 500 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as server_error_rate
FROM books_api_performance
WHERE timestamp > NOW() - INTERVAL 5 MINUTE
HAVING server_error_rate > 5
```

**Alert Message:**
```
🚨 CRITICAL: Server Error Rate (5xx) > 5%
Current: 7.2%
Threshold: 5%
Timeframe: Last 5 minutes
Action Required: Check server health immediately
```

**Possible Causes:**
- Worker exception unhandled
- External API failures
- Database (KV/R2) unavailable
- Secrets expired or invalid

**Response Actions:**
1. Check Worker error logs for stack traces
2. Verify external APIs are reachable
3. Test KV/R2 accessibility
4. Check secrets are valid: `wrangler secret list`

---

### 4. WebSocket Connection Failures (>10% failure rate)

**Metric:** `WebSocket connection errors / Total WS attempts`

**Threshold:**
- **CRITICAL:** >10% over 5 minutes
- **WARNING:** >5% over 5 minutes

**Query:**
```sql
SELECT 
  (SUM(CASE WHEN blob1 = '/ws/progress' AND double1 >= 400 THEN 1 ELSE 0 END) / 
   SUM(CASE WHEN blob1 = '/ws/progress' THEN 1 ELSE 0 END)) * 100 as ws_error_rate
FROM books_api_performance
WHERE timestamp > NOW() - INTERVAL 5 MINUTE
HAVING ws_error_rate > 10
```

**Alert Message:**
```
🚨 CRITICAL: WebSocket Connection Failures > 10%
Current: 12.8%
Threshold: 10%
Timeframe: Last 5 minutes
Action Required: Check Durable Objects health
```

**Possible Causes:**
- Durable Object deployment issues
- Invalid authentication tokens
- Network connectivity problems
- Token expiration not handled

**Response Actions:**
1. Check Durable Object status in Cloudflare Dashboard
2. Review WebSocket authentication logs
3. Verify token refresh endpoint works
4. Check DO migration status

---

### 5. Cache Failure (Hit Rate <30%)

**Metric:** `(Cache Hits / Total Requests) × 100`

**Threshold:**
- **CRITICAL:** <30% over 15 minutes
- **WARNING:** <50% over 15 minutes

**Query:**
```sql
SELECT 
  (SUM(CASE WHEN blob3 = 'HIT' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as cache_hit_rate
FROM books_api_performance
WHERE timestamp > NOW() - INTERVAL 15 MINUTE
HAVING cache_hit_rate < 30
```

**Alert Message:**
```
🚨 CRITICAL: Cache Hit Rate < 30%
Current: 25%
Threshold: 30%
Timeframe: Last 15 minutes
Action Required: Investigate cache system
```

**Possible Causes:**
- KV namespace unavailable
- R2 bucket unavailable
- Cache eviction due to size limits
- Cache warming not running

**Response Actions:**
1. Check KV namespace accessibility
2. Check R2 bucket status
3. Review cache metrics in Cloudflare Dashboard
4. Manually trigger cache warming if needed

---

## Warning Alerts

### 1. Moderate Error Rate (>5%)

**Metric:** `(Total Errors / Total Requests) × 100`

**Threshold:** 5-10% over 10 minutes

**Alert Message:**
```
⚠️ WARNING: API Error Rate Elevated
Current: 6.2%
Threshold: 5%
Timeframe: Last 10 minutes
Action: Monitor for escalation
```

**Response Actions:**
- Monitor error trends
- Review error codes distribution
- Check if pattern matches recent deployment
- Prepare for potential rollback

---

### 2. Elevated Latency (>1 second P95)

**Metric:** `95th percentile response time`

**Threshold:** 1000-2000ms over 10 minutes

**Alert Message:**
```
⚠️ WARNING: API Latency Elevated
Current: 1.2s P95
Threshold: 1.0s
Timeframe: Last 10 minutes
Action: Monitor for degradation
```

**Response Actions:**
- Check cache performance
- Review external API latency
- Monitor for escalation to CRITICAL

---

### 3. Traffic Spike (>200% of baseline)

**Metric:** `Current requests/minute vs 24h average`

**Threshold:** >2x baseline over 5 minutes

**Alert Message:**
```
⚠️ WARNING: Traffic Spike Detected
Current: 500 req/min
Baseline: 200 req/min
Increase: 150%
Action: Monitor for abuse or viral traffic
```

**Response Actions:**
- Check if traffic is legitimate (new feature launch, marketing campaign)
- Review top IP addresses for abuse
- Consider rate limiting adjustments
- Monitor for DDoS patterns

---

### 4. External API Quota Warning (>80% used)

**Metric:** `API quota usage`

**Threshold:** >80% of daily quota

**Alert Message:**
```
⚠️ WARNING: Google Books API Quota at 85%
Current: 8,500 requests
Limit: 10,000 requests/day
Remaining: 1,500 requests
Action: Consider fallback providers
```

**Response Actions:**
- Enable quota tracking
- Switch to alternative providers (OpenLibrary, ISBNdb)
- Increase caching aggressiveness
- Request quota increase from provider

---

### 5. Durable Object Alarm Queue Depth (>100)

**Metric:** `Pending DO alarms`

**Threshold:** >100 pending alarms

**Alert Message:**
```
⚠️ WARNING: Durable Object Alarm Queue Depth High
Current: 120 pending alarms
Threshold: 100
Action: Check DO processing capacity
```

**Response Actions:**
- Check Durable Object logs for processing delays
- Review alarm scheduling logic
- Consider increasing DO concurrency

---

## Alert Configuration

### Cloudflare Workers Alert Script

Deploy a scheduled worker to check metrics every 5 minutes:

```javascript
// workers/alert-monitor.js
export default {
  async scheduled(event, env, ctx) {
    const checks = [
      checkErrorRate(env),
      checkLatency(env),
      check5xxRate(env),
      checkCacheHitRate(env),
      checkWebSocketFailures(env)
    ];
    
    const results = await Promise.all(checks);
    
    for (const result of results) {
      if (result.critical) {
        await sendCriticalAlert(env, result);
      } else if (result.warning) {
        await sendWarningAlert(env, result);
      }
    }
  }
};

async function checkErrorRate(env) {
  const query = `
    SELECT 
      (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as error_rate
    FROM books_api_performance
    WHERE timestamp > NOW() - INTERVAL 5 MINUTE
  `;
  
  const result = await queryAnalytics(env, query);
  const errorRate = result.rows[0]?.error_rate || 0;
  
  return {
    metric: 'error_rate',
    value: errorRate,
    critical: errorRate > 10,
    warning: errorRate > 5,
    message: `Error rate: ${errorRate.toFixed(2)}%`
  };
}

async function sendCriticalAlert(env, alert) {
  // Send to PagerDuty
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: env.PAGERDUTY_KEY,
      event_action: 'trigger',
      payload: {
        summary: `🚨 CRITICAL: ${alert.metric} - ${alert.message}`,
        severity: 'critical',
        source: 'bookstrack-api-monitoring'
      }
    })
  });
  
  // Send to Slack
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 *CRITICAL ALERT*\n${alert.message}`,
      channel: '#bookstrack-alerts'
    })
  });
}
```

### Scheduled Trigger

Add to `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
```

---

## Notification Channels

### 1. PagerDuty (CRITICAL Alerts)

**Integration:** REST API  
**Escalation:** On-call engineer paged immediately  
**Configuration:**
```bash
wrangler secret put PAGERDUTY_KEY
# Enter integration key from PagerDuty dashboard
```

### 2. Slack (WARNING Alerts)

**Integration:** Webhook  
**Channel:** `#bookstrack-alerts`  
**Configuration:**
```bash
wrangler secret put SLACK_WEBHOOK_URL
# Enter webhook URL from Slack app settings
```

### 3. Email (INFO Alerts)

**Integration:** SendGrid or similar  
**Recipients:** engineering@oooefam.net  
**Configuration:**
```bash
wrangler secret put SENDGRID_API_KEY
```

---

## Alert Response Procedures

### Critical Alert Response (5 min SLA)

1. **Acknowledge alert** in PagerDuty/Slack
2. **Check dashboard** for context
3. **Stream logs** for real-time diagnostics: `wrangler tail --remote --format pretty`
4. **Identify root cause** using troubleshooting runbook
5. **Mitigate** (rollback, failover, or hotfix)
6. **Update status page** if customer-impacting
7. **Post-mortem** within 48 hours

### Warning Alert Response (30 min SLA)

1. **Acknowledge alert** in Slack
2. **Monitor trends** for escalation
3. **Investigate** during business hours
4. **Document** findings in issue tracker
5. **Implement fix** in next deployment

---

## Testing Alerts

### Manual Alert Trigger

```bash
# Trigger test alert
curl -X POST https://api.oooefam.net/api/admin/test-alert \
  -H "X-Test-Alert: true" \
  -d '{"type": "error_rate", "severity": "critical"}'
```

### Alert Verification Checklist

- [ ] PagerDuty receives CRITICAL alerts
- [ ] Slack receives WARNING alerts
- [ ] Email receives INFO alerts
- [ ] Alerts include context (metrics, links)
- [ ] Escalation works if not acknowledged
- [ ] Alert fatigue minimized (no false positives)

---

## Best Practices

1. **Tune thresholds** based on baseline traffic patterns
2. **Avoid alert fatigue** - only alert on actionable metrics
3. **Include context** - dashboards links, runbook links
4. **Test regularly** - monthly fire drill
5. **Review and adjust** - quarterly threshold review
6. **Document resolution** - update runbooks after incidents

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2025  
**Maintainer:** DevOps Team
