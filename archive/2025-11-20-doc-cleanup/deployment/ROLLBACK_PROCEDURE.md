# Rollback Procedure for BooksTrack API

**Purpose:** Step-by-step guide for rolling back failed deployments  
**Audience:** DevOps Team, On-Call Engineers  
**Updated:** November 15, 2025

---

## Table of Contents

1. [When to Rollback](#when-to-rollback)
2. [Pre-Rollback Checklist](#pre-rollback-checklist)
3. [Rollback Methods](#rollback-methods)
4. [Verification Steps](#verification-steps)
5. [Communication Procedures](#communication-procedures)
6. [Post-Rollback Actions](#post-rollback-actions)

---

## When to Rollback

### Immediate Rollback Triggers (No Approval Needed)

Roll back **immediately** if any of the following occur within 30 minutes of deployment:

| Trigger | Threshold | Impact |
|---------|-----------|--------|
| **Error Rate Spike** | >10% | Critical - API unusable |
| **5xx Error Rate** | >5% | Critical - Server failures |
| **Complete Outage** | Health check fails | Critical - API down |
| **WebSocket Failures** | >10% failure rate | Critical - Real-time features broken |
| **Data Loss** | Any confirmed data loss | Critical - User data affected |

### Approval Required Rollback Triggers

Roll back **after approval** from engineering lead if:

| Trigger | Threshold | Impact |
|---------|-----------|--------|
| **Moderate Error Rate** | 5-10% | High - Degraded service |
| **Latency Spike** | P95 >2s | High - Poor UX |
| **Cache Failure** | Hit rate <30% | Medium - Performance degraded |
| **External API Issues** | Provider timeouts | Medium - Fallback working |

---

## Pre-Rollback Checklist

Before executing rollback, verify:

- [ ] Issue is **not transient** (lasted >5 minutes)
- [ ] Issue is **deployment-related** (started after recent deploy)
- [ ] **Metrics confirm** the issue (not anecdotal)
- [ ] **No ongoing migration** (database, schema changes)
- [ ] **Rollback target identified** (previous stable deployment)

### Quick Diagnostics

```bash
# Check current deployment version
wrangler deployments list

# Check error rate (last 10 minutes)
wrangler tail --remote --format pretty --status error | head -50

# Check health endpoint
curl https://api.oooefam.net/health
```

**If diagnostics show:**
- ✅ Errors started after deployment → **ROLLBACK**
- ❌ Errors existed before deployment → **DO NOT ROLLBACK** (investigate root cause)

---

## Rollback Methods

### Method 1: Wrangler Rollback (Recommended)

**Speed:** 2-3 minutes  
**Risk:** Low  
**Use Case:** Standard rollback for Workers deployment

#### Steps

1. **List recent deployments:**
```bash
wrangler deployments list

# Output:
# 📋 Deployments (last 10)
# Created     ID                               Message
# 2025-11-15  abc123-deployment-id-current     Deploy v2.0 API changes
# 2025-11-14  def456-deployment-id-previous    Hotfix cache issue
# 2025-11-13  ghi789-deployment-id-stable      Stable release
```

2. **Identify target deployment:**
```bash
# Usually the previous deployment (def456 in example above)
TARGET_DEPLOYMENT="def456-deployment-id-previous"
```

3. **Execute rollback:**
```bash
wrangler rollback --message "Rollback due to high error rate (Issue #123)"
```

4. **Verify rollback:**
```bash
# Check health endpoint
curl https://api.oooefam.net/health

# Should return previous version
# {
#   "data": {
#     "version": "1.9.0",  # Previous version, not 2.0
#     "status": "ok"
#   }
# }
```

5. **Monitor metrics:**
```bash
# Stream logs for 5 minutes
wrangler tail --remote --format pretty

# Check error rate drops back to normal
```

**Expected Duration:** 2-3 minutes  
**Downtime:** <30 seconds (brief traffic switch)

---

### Method 2: Git Revert + Redeploy

**Speed:** 5-10 minutes  
**Risk:** Medium  
**Use Case:** Rollback + preserve in git history

#### Steps

1. **Identify problematic commit:**
```bash
git log --oneline -5

# Output:
# abc123 Deploy v2.0 API changes  ← Problem commit
# def456 Hotfix cache issue
# ghi789 Stable release
```

2. **Revert the commit:**
```bash
git revert abc123 --no-edit
git push origin main
```

3. **GitHub Actions will auto-deploy** (if CI/CD enabled)
   - Or manually deploy: `wrangler deploy`

4. **Verify deployment:**
```bash
curl https://api.oooefam.net/health
wrangler tail --remote --format pretty
```

**Expected Duration:** 5-10 minutes (includes CI/CD pipeline)  
**Downtime:** <30 seconds

---

### Method 3: Emergency Manual Deploy

**Speed:** 3-5 minutes  
**Risk:** High (skips CI/CD checks)  
**Use Case:** CI/CD broken, immediate rollback needed

#### Steps

1. **Checkout stable commit:**
```bash
git fetch origin
git checkout def456  # Previous stable commit
```

2. **Deploy directly:**
```bash
wrangler deploy --env production
```

3. **Verify:**
```bash
curl https://api.oooefam.net/health
```

4. **Fix git history later:**
```bash
# After emergency resolved, clean up git
git checkout main
git revert abc123
git push origin main
```

**Expected Duration:** 3-5 minutes  
**Downtime:** <30 seconds  
**⚠️ Warning:** Use only in emergencies (skips tests, linting, approval)

---

## Verification Steps

After executing rollback, verify recovery:

### 1. Health Check (Immediate)

```bash
curl https://api.oooefam.net/health

# Expected response:
# {
#   "data": {
#     "status": "ok",
#     "version": "1.9.0",  # Previous version
#     "worker": "api-worker"
#   }
# }
```

**✅ Pass:** Status "ok", version matches target  
**❌ Fail:** 500 error or wrong version → Rollback failed

---

### 2. Error Rate (5 minutes)

```bash
# Monitor error rate for 5 minutes
wrangler tail --remote --format pretty --status error

# Count errors per minute - should drop below 5%
```

**✅ Pass:** Error rate <5%  
**❌ Fail:** Error rate still >5% → Issue not deployment-related

---

### 3. Response Time (5 minutes)

```bash
# Test critical endpoints
time curl "https://api.oooefam.net/v1/search/title?q=hamlet"
time curl "https://api.oooefam.net/v1/search/isbn?isbn=9780743273565"

# P95 should be <1s
```

**✅ Pass:** Response times <1s  
**❌ Fail:** Still slow → May be external API issue

---

### 4. WebSocket Connectivity

```bash
# Install wscat if needed
npm install -g wscat

# Test WebSocket connection
wscat -c "wss://api.oooefam.net/ws/progress?jobId=test&token=test"

# Should connect successfully
```

**✅ Pass:** Connection established  
**❌ Fail:** 401/500 error → Durable Object issue persists

---

### 5. Cache Performance

```bash
# Check cache hit rate via dashboard
# Navigate to: Cloudflare Dashboard → Workers → Analytics

# Or query Analytics Engine
wrangler analytics query \
  --dataset books_api_performance \
  --query "SELECT (SUM(CASE WHEN blob3 = 'HIT' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as hit_rate FROM books_api_performance WHERE timestamp > NOW() - INTERVAL 10 MINUTE"
```

**✅ Pass:** Hit rate >50%  
**❌ Fail:** Hit rate <50% → Cache issue not deployment-related

---

## Communication Procedures

### 1. Notify Stakeholders (During Rollback)

**Slack Channels:**
- `#bookstrack-alerts` (immediate)
- `#engineering` (for awareness)

**Message Template:**
```
🚨 **ROLLBACK IN PROGRESS**

Deployment: v2.0 API changes (abc123)
Reason: Error rate spiked to 12% after deployment
Action: Rolling back to v1.9.0 (def456)
ETA: 5 minutes
Status Page: https://status.oooefam.net (updated)

– On-Call Engineer
```

---

### 2. Update Status Page

If customer-impacting:

```bash
# Update Cloudflare status page or equivalent
# Status: "Investigating" → "Identified" → "Monitoring" → "Resolved"
```

**Template:**
```
[INVESTIGATING] API Error Rate Elevated
We are investigating elevated error rates on the BooksTrack API.
Mitigation in progress. ETA: 5 minutes.
Last Update: 2025-11-15 14:30 UTC
```

---

### 3. Post-Rollback Communication

**After successful rollback:**

**Slack:**
```
✅ **ROLLBACK COMPLETE**

Deployment: Rolled back to v1.9.0
Verification: All checks passed
Error Rate: Back to normal (2%)
Response Time: P95 400ms
Next Steps: Root cause analysis, fix-forward plan

Dashboard: https://dash.cloudflare.com/...
Incident: #INC-2025-123
```

**Status Page:**
```
[RESOLVED] API Error Rate Elevated
The issue has been resolved by rolling back to a previous stable version.
All systems operating normally.
Post-mortem will be published within 48 hours.
Resolved: 2025-11-15 14:35 UTC
```

---

## Post-Rollback Actions

### Immediate (Within 1 hour)

- [ ] **Document incident** in incident tracker
- [ ] **Create GitHub issue** for root cause analysis
- [ ] **Preserve logs** from failed deployment
  ```bash
  wrangler tail --remote --format json > incident-logs-$(date +%Y%m%d-%H%M%S).log
  ```
- [ ] **Tag stakeholders** in post-mortem issue
- [ ] **Update monitoring** if new failure mode discovered

### Short-term (Within 24 hours)

- [ ] **Root cause analysis** 
  - Why did the deployment fail?
  - Why didn't pre-production testing catch it?
  - What metrics would have detected it earlier?

- [ ] **Fix-forward plan**
  - Fix the root cause
  - Add tests to prevent recurrence
  - Deploy to staging first
  - Gradual rollout to production

- [ ] **Improve CI/CD**
  - Add smoke tests
  - Add canary deployment
  - Improve staging parity

### Long-term (Within 1 week)

- [ ] **Post-mortem document**
  - Timeline of events
  - Root cause
  - Impact assessment
  - Action items
  - Lessons learned

- [ ] **Process improvements**
  - Update deployment checklist
  - Improve monitoring
  - Add safeguards

---

## Recovery Plan (If Rollback Fails)

If rollback doesn't resolve the issue:

### 1. Escalate Immediately

**Contact:**
- Engineering Lead
- Platform Team
- Cloudflare Support (if platform issue)

### 2. Alternative Mitigation

```bash
# Option A: Deploy emergency hotfix
git checkout main
# Apply minimal fix
git commit -m "Hotfix: Emergency fix for rollback issue"
wrangler deploy --env production

# Option B: Enable maintenance mode
# Redirect all traffic to static maintenance page
```

### 3. Data Recovery

If data loss occurred:

```bash
# Restore from R2 backup
wrangler r2 object get personal-library-data/backup-$(date -d yesterday +%Y%m%d).json

# Restore KV from snapshot (if available)
# Contact Cloudflare Support for KV restore
```

---

## Rollback Decision Tree

```
                   ┌─────────────────┐
                   │ Issue Detected  │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Issue started   │
                   │ after deploy?   │
                   └────┬────────┬───┘
                  Yes   │        │ No
                        ▼        ▼
              ┌─────────────┐   ┌──────────────┐
              │ Is it       │   │ Investigate  │
              │ CRITICAL?   │   │ Root Cause   │
              └──┬──────┬───┘   └──────────────┘
           Yes   │      │ No
                 ▼      ▼
       ┌──────────┐  ┌───────────────┐
       │ ROLLBACK │  │ Get Approval  │
       │ NOW      │  │ Then Rollback │
       └──────────┘  └───────────────┘
```

---

## Testing Rollback Procedure

### Quarterly Rollback Drill

1. **Schedule drill** (non-production hours)
2. **Deploy test change** to staging
3. **Simulate failure** (inject errors)
4. **Execute rollback** following procedure
5. **Measure metrics:**
   - Time to detect (should be <5 min)
   - Time to rollback (should be <5 min)
   - Total recovery time (should be <10 min)
6. **Document lessons learned**

---

## Frequently Asked Questions

### Q: Can I rollback during high traffic periods?

**A:** Yes, rollback is safer than keeping broken deployment live. Brief traffic blip (<30s) is acceptable during emergency.

### Q: What if the previous deployment also had issues?

**A:** Roll back to the last **known stable** deployment, not just the previous one. Check deployment history.

### Q: Will rollback lose data?

**A:** No. Rollback only changes code, not data. KV/R2/Durable Objects retain state.

### Q: Can I rollback just one feature?

**A:** No. Cloudflare Workers deploy atomically. Use feature flags for gradual rollouts.

### Q: How far back can I rollback?

**A:** Cloudflare retains last ~50 deployments. For older versions, redeploy from git.

---

## Related Documents

- [ALERTING_RULES.md](./ALERTING_RULES.md) - Alert thresholds that trigger rollbacks
- [TROUBLESHOOTING_RUNBOOK.md](./TROUBLESHOOTING_RUNBOOK.md) - Debugging before rollback
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Standard deployment procedures

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2025  
**Maintainer:** DevOps Team
