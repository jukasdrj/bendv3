# Rollback Procedures for BooksTrack API

**Document Version:** 1.0
**Last Updated:** November 16, 2025
**Related Issue:** #93 - Configure monitoring dashboard for API v2.0 rollout
**Production URL:** https://api.oooefam.net

---

## Table of Contents
1. [When to Rollback](#when-to-rollback)
2. [Rollback Triggers](#rollback-triggers)
3. [Pre-Rollback Checklist](#pre-rollback-checklist)
4. [Rollback Execution](#rollback-execution)
5. [Post-Rollback Verification](#post-rollback-verification)
6. [Incident Response](#incident-response)
7. [Common Issues](#common-issues)

---

## When to Rollback

### Critical Scenarios (Immediate Rollback Required)

1. **Error Rate Spike** (>10% for any endpoint, 5-minute window)
   - Indicates fundamental API breakage
   - Example: v2.0 response format breaking iOS client parsing

2. **P95 Latency Degradation** (>2 seconds, 5-minute window)
   - Indicates performance regression or resource exhaustion
   - May lead to client timeouts and poor user experience

3. **WebSocket Instability** (>20% disconnection rate, 10-minute window)
   - Breaks real-time progress updates for batch jobs
   - Critical for bookshelf scanning and enrichment features

4. **Complete Service Outage** (5xx errors for all endpoints)
   - Total API unavailability
   - Deploy rollback immediately, investigate later

### Warning Scenarios (Investigate Before Rollback)

1. **Moderate Error Rate** (5-10%, 1-hour window)
   - Could be temporary spike or specific client issue
   - Monitor for 15 minutes before deciding

2. **Elevated Latency** (P95: 500ms-2s, 15-minute window)
   - Check if isolated to specific endpoints
   - May indicate cache warming needed

3. **Low Cache Hit Rate** (<50%, persistent)
   - Could indicate cache invalidation bug
   - May not require rollback if errors aren't elevated

---

## Rollback Triggers

### Automated Triggers (Recommended for Production)

```javascript
// Example: Scheduled alert handler (runs every 15 minutes)
// Location: src/handlers/scheduled-alerts.js

const ROLLBACK_THRESHOLDS = {
  errorRate: {
    critical: 0.10,  // 10% - immediate rollback
    warning: 0.05    // 5% - alert only
  },
  latencyP95: {
    critical: 2000,  // 2 seconds - immediate rollback
    warning: 500     // 500ms - alert only
  },
  websocketDisconnectRate: {
    critical: 0.20,  // 20% - immediate rollback
    warning: 0.10    // 10% - alert only
  }
};
```

### Manual Triggers

Human judgment required for:
- **Response format violations** (legacy `{success}` appearing in v2.0 endpoints)
- **Client-reported bugs** (iOS app crashing due to API changes)
- **Security vulnerabilities** (discovered after deployment)
- **Data corruption** (incorrect metadata being returned)

---

## Pre-Rollback Checklist

Before executing rollback, verify:

- [ ] **Confirm Issue Scope**
  - Which endpoints are affected?
  - Is it impacting all users or specific regions?
  - What percentage of requests are failing?

- [ ] **Check Recent Deployments**
  ```bash
  npx wrangler deployments list
  ```
  - Note the deployment ID to rollback from
  - Note the deployment ID to rollback to (previous stable version)

- [ ] **Verify Rollback Target**
  ```bash
  npx wrangler deployments view <DEPLOYMENT_ID>
  ```
  - Confirm the previous version was stable
  - Check git commit message for context

- [ ] **Notify Team**
  - Post in #engineering Slack channel
  - Tag @on-call engineer
  - Include: Issue description, rollback decision, ETA

---

## Rollback Execution

### Method 1: Wrangler CLI (Recommended)

**Step 1: List Recent Deployments**
```bash
npx wrangler deployments list
```

Example output:
```
Created:             Deployment ID:                       Version:
2025-11-16T10:30:00Z a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6 Current
2025-11-15T14:20:00Z b2c3d4e5-6f7g-8h9i-0j1k-l2m3n4o5p6q7 Stable ✅
2025-11-14T09:15:00Z c3d4e5f6-7g8h-9i0j-1k2l-m3n4o5p6q7r8
```

**Step 2: Rollback to Previous Version**
```bash
npx wrangler rollback --message "Rolling back v2.0 due to <ISSUE>"
```

This command:
- Reverts to the immediately previous deployment
- Adds rollback message to deployment history
- Takes effect within 30 seconds globally

**Step 3: Verify Rollback**
```bash
curl https://api.oooefam.net/health
```

Expected response (legacy format if rolling back from v2.0):
```json
{
  "status": "ok",
  "worker": "api-worker",
  "version": "1.0.0"
}
```

**Step 4: Monitor Recovery**
```bash
npx wrangler tail --format pretty
```

Watch for:
- Error rate dropping to <1%
- Latency returning to baseline (<200ms P95)
- Successful responses from all endpoints

### Method 2: Cloudflare Dashboard (Backup Method)

If Wrangler CLI is unavailable:

1. Navigate to: https://dash.cloudflare.com/
2. Select **Workers & Pages** → **api-worker**
3. Click **Deployments** tab
4. Find previous stable deployment
5. Click **...** menu → **Rollback to this deployment**
6. Confirm rollback

---

## Post-Rollback Verification

### Immediate Verification (0-5 minutes)

**1. Health Check**
```bash
curl -i https://api.oooefam.net/health
```

✅ Expect:
- Status: 200 OK
- Response time: <100ms
- Valid JSON body

**2. Test Critical Endpoints**

```bash
# ISBN Search
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180"

# Title Search
curl "https://api.oooefam.net/v1/search/title?q=Harry+Potter"

# WebSocket Health (manually via iOS Simulator)
# - Connect to /ws/progress?jobId=test&token=test
# - Should receive connection refused or proper error (not 500)
```

✅ Expect:
- All endpoints return valid responses
- Error rate <1%
- Cache headers present (`X-Cache-Status`)

**3. Check Analytics Dashboard**

Navigate to: https://dash.cloudflare.com/ → Workers → api-worker → Analytics

Verify within 5 minutes:
- Request volume returns to normal
- Error rate drops below 1%
- P95 latency returns to baseline (<200ms for search)

### Extended Verification (5-30 minutes)

**1. Monitor Error Logs**
```bash
npx wrangler tail --format pretty | grep ERROR
```

Watch for:
- No new errors appearing
- Previous error patterns disappeared
- Cache warming logs (normal background activity)

**2. iOS Client Testing** (if rollback was due to client breakage)

Test on iOS Simulator:
- [ ] Search by ISBN works
- [ ] Search by title works
- [ ] Batch enrichment completes successfully
- [ ] Bookshelf scanning with WebSocket progress works
- [ ] CSV import completes successfully

**3. Cache Performance**

```bash
curl -I "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180"
```

Check headers:
```
X-Cache-Status: HIT  (after first request)
X-Response-Time: <50ms  (for cached responses)
```

---

## Incident Response

### Communication Template

**Slack Message to #engineering:**

```
🚨 ROLLBACK EXECUTED - API Worker

Issue: [Brief description, e.g., "v2.0 response format causing iOS parsing errors"]
Rollback Time: [HH:MM UTC]
Deployment Rolled Back: [Deployment ID]
Current Version: [Deployment ID]
Status: ✅ Stable / ⚠️ Monitoring / ❌ Investigating

Impact:
- Error rate: [%]
- Affected endpoints: [list]
- User-facing impact: [description]

Next Steps:
1. [Root cause analysis]
2. [Fix development]
3. [Re-deployment plan]

On-call: @engineer-name
Incident Channel: #incident-YYYYMMDD
```

### Incident Postmortem (Within 24 hours)

Create GitHub Issue with template:

```markdown
## Rollback Incident - [Date]

**Related PRs:** #86 (API v2.0)
**Rollback Trigger:** [Automated / Manual]
**Downtime:** [Duration]
**User Impact:** [Severity]

### Timeline
- [HH:MM UTC] Deployment of v2.0
- [HH:MM UTC] Issue detected
- [HH:MM UTC] Rollback decision made
- [HH:MM UTC] Rollback executed
- [HH:MM UTC] Service restored

### Root Cause
[Detailed analysis]

### Lessons Learned
- What went well?
- What could be improved?
- Action items for next deployment

### Prevention Measures
- [ ] Additional tests added
- [ ] Staging environment validation improved
- [ ] Monitoring alerts tuned
```

---

## Common Issues

### Issue 1: Rollback Doesn't Fix Error Rate

**Symptoms:**
- Rollback executed successfully
- Error rate remains high (>5%)
- Previous version also showing errors

**Possible Causes:**
- External API outage (Google Books, ISBNdb)
- KV cache corruption
- Durable Object state corruption
- Rate limiting triggered

**Resolution:**
```bash
# Check external API health
curl "https://www.googleapis.com/books/v1/volumes?q=test&key=YOUR_KEY"

# Check KV cache status
# (via Cloudflare Dashboard → KV → CACHE namespace)

# Clear corrupted cache (if needed)
npx wrangler kv:key delete --namespace-id=CACHE_ID "problematic-key"
```

### Issue 2: Rollback Causes Cache Miss Storm

**Symptoms:**
- Rollback successful
- Latency spike to 500ms+ (previously <100ms)
- Cache hit rate drops to 0%

**Cause:**
- Code change altered cache key format
- Rolling back invalidates all existing cache entries

**Resolution:**
```bash
# This is expected and self-healing
# Cache will warm up over 15-30 minutes

# Monitor cache warming:
npx wrangler tail | grep "Cache: MISS"

# If critical, trigger cache warming:
# POST to /api/warming/upload with CSV of popular ISBNs
```

### Issue 3: WebSocket Reconnection Failures After Rollback

**Symptoms:**
- iOS clients can't reconnect to existing jobs
- "Unauthorized" errors on WebSocket upgrade
- Jobs appear stuck at previous progress

**Cause:**
- Durable Object auth token format changed between versions
- Existing tokens incompatible with rolled-back code

**Resolution:**
```javascript
// Clients must restart jobs (cannot resume)
// Add to incident comms:

"Users with in-progress jobs (batch enrichment, scans) must restart.
Progress cannot be recovered due to rollback. Affected jobs: <count>"
```

**Prevention:**
- Maintain token format compatibility across versions
- Add token version field for future migrations

### Issue 4: Staging Passed But Production Failed

**Symptoms:**
- Staging environment tests passed
- Production rollback required within hours

**Common Causes:**
1. **Data Differences**
   - Staging uses synthetic data
   - Production has edge cases not in staging

2. **Traffic Patterns**
   - Staging low-volume
   - Production high-volume triggers race conditions

3. **Geographic Distribution**
   - Staging single-region
   - Production multi-region cache inconsistencies

**Resolution:**
- Implement canary deployment (5% production traffic)
- Add production data sampling to staging
- Require 24-hour soak test before full rollout

---

## Rollback Decision Matrix

| Metric | Green ✅ | Yellow ⚠️ | Red 🚨 |
|--------|---------|-----------|--------|
| **Error Rate** | <1% | 1-5% | >5% → ROLLBACK |
| **P95 Latency** | <200ms | 200-500ms | >500ms → MONITOR |
| **P95 Latency** | <500ms | 500ms-2s | >2s → ROLLBACK |
| **WebSocket Disconnect** | <5% | 5-10% | >10% → INVESTIGATE |
| **WebSocket Disconnect** | <10% | 10-20% | >20% → ROLLBACK |
| **Cache Hit Rate** | >80% | 50-80% | <50% → INVESTIGATE |
| **5xx Error Rate** | 0% | <0.1% | >0.1% → ROLLBACK |

**Action Rules:**
- **Green:** All systems normal, continue monitoring
- **Yellow:** Increase monitoring frequency (every 5 min), alert team
- **Red:** Execute rollback, notify on-call, create incident

---

## Testing Rollback Procedure

**Recommended:** Test rollback in staging monthly

```bash
# Deploy test change to staging
npx wrangler deploy --env staging

# Verify deployment
curl https://staging-api.oooefam.net/health

# Execute rollback
npx wrangler rollback --env staging --message "Rollback test - YYYY-MM-DD"

# Verify rollback
curl https://staging-api.oooefam.net/health

# Document timing and any issues
```

Expected timing:
- Rollback command: 5-10 seconds
- Global propagation: 30-60 seconds
- Cache warming: 5-15 minutes

---

## Related Documentation

- `docs/DEPLOYMENT.md` - Deployment procedures
- `docs/MONITORING_GUIDE.md` - Dashboard usage and alerting
- `docs/API_CONTRACT.md` - API v2.0 specification
- `.claude/commands/rollback.md` - Slash command for quick rollback

---

**Document Maintenance:**
This document should be updated after every production incident or rollback event.
Review quarterly to ensure procedures match current infrastructure.

**Last Reviewed:** November 16, 2025
**Next Review:** February 16, 2026
**Owner:** @jukasdrj
