# Hono Migration - Operations Runbook

**Purpose:** Step-by-step procedures for deploying, monitoring, and troubleshooting the Hono router migration.

**Audience:** DevOps, SRE, On-call Engineers

**Last Updated:** November 17, 2025

---

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Procedures](#deployment-procedures)
3. [Monitoring & Observability](#monitoring--observability)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Emergency Contacts](#emergency-contacts)

---

## ✅ Pre-Deployment Checklist

### Phase 1 MVP Deployment

- [ ] **Tests Passing:**
  ```bash
  npm test tests/hono-router.test.js
  # Expected: 15 tests passing
  ```

- [ ] **Local Validation:**
  ```bash
  # Test with Hono enabled
  echo "ENABLE_HONO_ROUTER=true" >> .dev.vars
  npx wrangler dev
  curl http://localhost:8787/health
  # Expected: {"status":"ok","router":"hono",...}

  # Test with Hono disabled
  echo "ENABLE_HONO_ROUTER=false" >> .dev.vars
  npx wrangler dev
  curl http://localhost:8787/health
  # Expected: {"status":"ok",...} (no "router" field)
  ```

- [ ] **Dependencies Installed:**
  ```bash
  npm ls hono
  # Expected: hono@^4.10.6
  ```

- [ ] **TypeScript Compilation:**
  ```bash
  npx tsc --noEmit
  # Expected: No errors
  ```

- [ ] **Bundle Size Check:**
  ```bash
  npx wrangler deploy --dry-run
  # Expected: Bundle size < 1MB (Hono adds ~10KB)
  ```

- [ ] **Feature Flag Configured:**
  ```bash
  grep "ENABLE_HONO_ROUTER" wrangler.toml
  # Expected: ENABLE_HONO_ROUTER = "false"
  ```

- [ ] **Code Review Approved:**
  - PR reviewed by at least 1 engineer
  - Grok-4 review feedback addressed
  - No security concerns raised

- [ ] **Stakeholder Notification:**
  - Mobile team notified (no breaking changes expected)
  - Monitoring team alerted (new `X-Router` header)

---

## 🚀 Deployment Procedures

### Step 1: Deploy with Feature Flag OFF (Safe Deploy)

**Goal:** Get Hono code into production without activating it.

```bash
# 1. Verify feature flag is disabled
grep "ENABLE_HONO_ROUTER" wrangler.toml
# Expected: ENABLE_HONO_ROUTER = "false"

# 2. Deploy to production
npx wrangler deploy

# 3. Verify deployment
curl https://api.oooefam.net/health
# Expected: {"status":"ok",...} (no "router":"hono")

# 4. Check logs for errors
npx wrangler tail --format pretty | head -n 20
# Expected: No errors, "[Router] Using manual router" logs
```

**Success Criteria:**
- ✅ Deployment completes without errors
- ✅ `/health` endpoint returns 200 OK
- ✅ No `X-Router: hono` header present
- ✅ Error rate remains at baseline (<2%)

**Rollback:** Not needed (Hono is inactive)

---

### Step 2: Enable Hono for 10% of Traffic (A/B Test)

**Goal:** Route 10% of requests through Hono for performance comparison.

**⚠️ Warning:** This changes production behavior. Monitor closely.

#### Option A: Global Flag (All Routes)
```bash
# 1. Update wrangler.toml
sed -i '' 's/ENABLE_HONO_ROUTER = "false"/ENABLE_HONO_ROUTER = "true"/' wrangler.toml

# 2. Deploy
npx wrangler deploy

# 3. Verify Hono is active
curl https://api.oooefam.net/health
# Expected: {"status":"ok","router":"hono",...}
# Expected header: X-Router: hono
```

#### Option B: Gradual Rollout via Cloudflare Dashboard (Recommended)
1. Deploy with flag OFF (Step 1)
2. Go to Cloudflare Dashboard → Workers → api-worker
3. Navigate to "Environment Variables"
4. Add override: `ENABLE_HONO_ROUTER = "true"`
5. Use Cloudflare's gradual rollout feature:
   - Set traffic split: 10% Hono, 90% Manual
   - Enable canary deployment

**Monitoring Window:** 24-48 hours

**Success Criteria:**
- ✅ 10% of requests show `X-Router: hono` in logs
- ✅ Response times within 10% of manual router
- ✅ Error rate unchanged (<2%)
- ✅ No 500 errors from Hono routes

**Rollback:** See [Rollback Procedures](#rollback-procedures)

---

### Step 3: Increase to 50% Traffic

**Prerequisites:**
- Step 2 success criteria met
- No anomalies in 24h monitoring window

```bash
# Update Cloudflare Dashboard traffic split
# 50% Hono, 50% Manual
```

**Monitoring Window:** 12-24 hours

---

### Step 4: Increase to 100% Traffic

**Prerequisites:**
- Step 3 success criteria met
- Performance metrics stable

```bash
# Update wrangler.toml
ENABLE_HONO_ROUTER = "true"

# Deploy
npx wrangler deploy

# Verify all traffic uses Hono
npx wrangler tail | grep "X-Router"
# Expected: All requests show X-Router: hono
```

**Monitoring Window:** 7 days (ensure stability before Phase 2)

---

## 📊 Monitoring & Observability

### Key Metrics to Track

#### 1. Response Time Comparison
```sql
-- Query Analytics Engine (via Cloudflare GraphQL API)
SELECT
  index[1] as router,  -- 'hono' or 'manual'
  AVG(double1) as avg_response_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY double1) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY double1) as p99_ms
FROM PERFORMANCE_ANALYTICS
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY router
```

**Expected Results:**
- Hono P95: ~5-10ms faster than manual
- Hono P99: ~10-20ms faster than manual

**Alert Condition:** Hono P95 > Manual P95 + 20ms

---

#### 2. Error Rate by Router
```bash
# Stream logs and filter for errors
npx wrangler tail --format json | jq 'select(.outcome == "exception")'

# Count errors by router
npx wrangler tail --format json | \
  jq -r 'select(.logs[]?.message | contains("Router")) | .logs[].message' | \
  grep "Router" | sort | uniq -c
```

**Expected Results:**
- Error rate should be identical between routers
- No "Hono" errors in logs

**Alert Condition:** Error rate increases by >50%

---

#### 3. Traffic Distribution
```bash
# Count requests by router (from X-Router header)
npx wrangler tail --format json | \
  jq -r '.logs[]? | select(.message | contains("X-Router")) | .message' | \
  grep -oP 'X-Router: \K\w+' | sort | uniq -c
```

**Expected Results:**
- 10% traffic: ~10% hono, ~90% manual
- 100% traffic: ~100% hono

**Alert Condition:** Traffic split deviates by >10% from target

---

#### 4. Route-Specific Metrics
Focus on the 4 MVP routes:

| Route | Metric | Threshold | Alert |
|-------|--------|-----------|-------|
| `/health` | Response time | <10ms P95 | >20ms |
| `/v1/search/isbn` | Response time | <400ms P95 | >600ms |
| `/v1/search/isbn` | Cache hit rate | >75% | <60% |
| `/metrics` | Response time | <50ms P95 | >100ms |
| `/ws/progress` | Upgrade success | >99% | <95% |

---

### Cloudflare Dashboards

**Workers Analytics:**
1. Go to Cloudflare Dashboard → Workers & Pages → api-worker
2. Click "Metrics & Analytics"
3. View:
   - Request count (should remain stable)
   - Error rate (should remain <2%)
   - CPU time (may decrease slightly with Hono)

**Custom Dashboard (Optional):**
Create a Grafana dashboard querying Analytics Engine:
- Panel 1: Response time by router (line graph)
- Panel 2: Request count by router (pie chart)
- Panel 3: Error rate by router (line graph)

---

### Log Queries

**Find all Hono errors:**
```bash
npx wrangler tail | grep -i "hono.*error"
```

**Find slow Hono requests (>1s):**
```bash
npx wrangler tail --format json | \
  jq 'select(.logs[]?.message | contains("X-Response-Time")) |
      select(.logs[].message | test("X-Response-Time: [1-9]\\d{3,}ms"))'
```

**Find feature flag toggles:**
```bash
npx wrangler tail | grep "Using.*router"
```

---

## 🔄 Rollback Procedures

### Scenario 1: Hono is Slower Than Expected

**Symptoms:**
- Hono P95 response time > Manual P95 + 50ms
- User complaints about slowness
- Timeout errors (HTTP 524)

**Rollback Steps:**
```bash
# 1. Disable Hono immediately
sed -i '' 's/ENABLE_HONO_ROUTER = "true"/ENABLE_HONO_ROUTER = "false"/' wrangler.toml

# 2. Deploy (takes ~30-60 seconds)
npx wrangler deploy

# 3. Verify manual router is active
curl https://api.oooefam.net/health
# Expected: No "router":"hono" field

# 4. Monitor for recovery
npx wrangler tail | grep "Using manual router"
# Expected: All requests use manual router
```

**Recovery Time:** <60 seconds

---

### Scenario 2: Hono Causes Errors

**Symptoms:**
- 500 errors with "Hono" in stack trace
- Error rate increases by >50%
- Specific routes failing (e.g., `/v1/search/isbn` returns 500)

**Rollback Steps:**
```bash
# Same as Scenario 1
sed -i '' 's/ENABLE_HONO_ROUTER = "true"/ENABLE_HONO_ROUTER = "false"/' wrangler.toml
npx wrangler deploy

# Verify error rate drops
npx wrangler tail | grep -c "exception"
# Expected: Error count returns to baseline
```

**Post-Rollback Investigation:**
```bash
# Collect last 1000 log lines
npx wrangler tail --format json | head -n 1000 > hono-errors.jsonl

# Filter for Hono errors
jq 'select(.logs[]?.message | contains("Hono") and contains("error"))' hono-errors.jsonl

# Share with team for debugging
```

---

### Scenario 3: Feature Flag Stuck (Rare)

**Symptoms:**
- Redeploying with `ENABLE_HONO_ROUTER=false` doesn't disable Hono
- Logs still show "Using Hono router"

**Emergency Rollback:**
```bash
# 1. Rollback to previous deployment
npx wrangler deployments list
# Example output:
#   Deployment ID: abc123 (current)
#   Deployment ID: def456 (previous)

# 2. Rollback to previous version
npx wrangler rollback --message "Emergency rollback: Hono flag not working"

# 3. Verify rollback
curl https://api.oooefam.net/health
# Expected: Manual router (no "router" field)
```

**Recovery Time:** ~2-3 minutes

---

### Scenario 4: WebSocket Connections Failing

**Symptoms:**
- Mobile app can't connect to WebSocket
- `/ws/progress` returns 426 or 400 instead of 101
- Batch jobs stuck (no progress updates)

**Diagnosis:**
```bash
# Test WebSocket upgrade
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  "https://api.oooefam.net/ws/progress?jobId=test-123"

# Expected: HTTP/1.1 101 Switching Protocols
# If error: Check logs
npx wrangler tail | grep "ws/progress"
```

**Rollback:** Same as Scenario 1

---

## 🔧 Troubleshooting Guide

### Issue: "TypeError: Cannot read property 'fetch' of undefined"

**Cause:** Hono router not properly exported or imported

**Solution:**
```bash
# Check src/index.js imports
grep "import honoRouter" src/index.js

# Expected: import honoRouter from "./router.ts";

# If missing, add the import and redeploy
```

---

### Issue: "X-Router header missing"

**Cause:** Analytics middleware not running

**Diagnosis:**
```bash
# Check if middleware is registered
grep "analyticsMiddleware" src/router.ts

# Expected: app.use('*', analyticsMiddleware())
```

**Solution:**
- Verify `src/middleware/hono-analytics.ts` exists
- Check middleware order (analytics should run first)
- Redeploy

---

### Issue: CORS errors in browser console

**Cause:** Hono CORS configuration differs from manual router

**Diagnosis:**
```bash
# Test OPTIONS preflight
curl -i -X OPTIONS https://api.oooefam.net/health \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET"

# Expected headers:
#   Access-Control-Allow-Origin: *
#   Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
```

**Solution:**
- Check `src/router.ts` CORS config (should be `origin: '*'`)
- Compare with `src/middleware/cors.js` (manual router)

---

### Issue: Performance regression on `/v1/search/isbn`

**Cause:** Hono adds latency to handler invocation

**Diagnosis:**
```bash
# Compare response times
# Manual router
curl -w "@curl-format.txt" "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180" \
  -H "X-Force-Router: manual"

# Hono router
curl -w "@curl-format.txt" "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180" \
  -H "X-Force-Router: hono"

# curl-format.txt:
# time_total: %{time_total}s\n
```

**Solution:**
- If difference >100ms: Investigate middleware overhead
- Check if `handleSearchISBN` is being awaited properly
- Verify no unnecessary async operations in middleware

---

### Issue: Tests failing locally but passing in CI

**Cause:** Environment variable mismatch

**Diagnosis:**
```bash
# Check local env vars
cat .dev.vars

# Expected: ENABLE_HONO_ROUTER=false (or true for testing)

# Run tests with explicit env
ENABLE_HONO_ROUTER=true npm test tests/hono-router.test.js
```

**Solution:**
- Ensure `.dev.vars` matches test expectations
- Clear `wrangler dev` cache: `rm -rf .wrangler`

---

## 📞 Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| **Primary On-Call** | @jukasdrj | 24/7 |
| **Backend Lead** | TBD | Business hours |
| **Mobile Team (iOS)** | TBD | Business hours |
| **DevOps/SRE** | TBD | 24/7 |

**Escalation Path:**
1. On-call engineer attempts rollback (Scenario 1-4)
2. If rollback fails → Contact Backend Lead
3. If production outage → Page DevOps/SRE

**Communication Channels:**
- **Slack:** #bookstrack-backend
- **Incident:** Create in PagerDuty/Opsgenie
- **Status Page:** https://status.oooefam.net (TBD)

---

## 📚 Additional Resources

- **Phase 1 Summary:** `PHASE_1_MVP_SUMMARY.md`
- **API Routes:** `API_ROUTES.md`
- **Rollback Procedures:** See [Rollback Procedures](#rollback-procedures) above
- **Hono Documentation:** https://hono.dev/
- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/

---

**Maintained By:** AI Team (Claude Code, Grok-4)
**Human Owner:** @jukasdrj
**Last Updated:** November 17, 2025
