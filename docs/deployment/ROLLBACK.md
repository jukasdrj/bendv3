# Rollback Procedures

**Created:** November 28, 2025
**Status:** TESTED
**Priority:** CRITICAL

---

## Overview

BooksTrack supports 3 levels of rollback, each with different speed and scope trade-offs:

| Level | Speed | Scope | Use When |
|-------|-------|-------|----------|
| **Level 3: Feature Flag** | <2 min | Disable entire feature | Emergency, critical production issue |
| **Level 2: Sprint Rollback** | <15 min | Revert to previous sprint | Multiple endpoints broken, regression detected |
| **Level 1: Endpoint Rollback** | <5 min | Disable single endpoint | Single endpoint causing issues |

---

## Decision Matrix

**Use this to decide which rollback level to execute:**

```
Production Issue Detected
    ↓
Is it a single endpoint causing the problem?
    YES → Level 1: Endpoint Rollback
    NO  → Is it OpenAPI-related or multiple endpoints?
            YES → Level 3: Feature Flag Disable (fastest)
            NO  → Level 2: Sprint Rollback
```

**Examples:**
- `/v1/search/isbn` returning 500s → **Level 1**
- OpenAPI spec validation breaking SDK → **Level 3**
- Entire Sprint 2 endpoints misbehaving → **Level 2**
- Critical security vulnerability in new code → **Level 2**

---

## Level 1: Endpoint Rollback (< 5 minutes)

**Purpose:** Disable a single problematic endpoint while keeping rest of API operational.

**When to use:**
- Single endpoint returning 500s
- Endpoint causing performance degradation
- Endpoint with logic bug (but rest of API is fine)

### Procedure

1. **Identify problematic endpoint**
   ```bash
   # Check logs for error patterns
   npx wrangler tail | grep ERROR
   ```

2. **Comment out endpoint in router**
   ```bash
   # Edit src/router.ts
   # Comment out the problematic route

   # Example:
   # router.get('/v1/search/isbn', handleISBNSearch)
   // router.get('/v1/search/isbn', handleISBNSearch)  // DISABLED: Issue #XXX
   ```

3. **Deploy immediately**
   ```bash
   npx wrangler deploy
   ```

4. **Verify endpoint disabled**
   ```bash
   curl https://api.oooefam.net/v1/search/isbn
   # Should return 404 Not Found
   ```

5. **Monitor for recovery**
   ```bash
   npx wrangler tail
   # Watch for error rate drop
   ```

### Success Criteria
- ✅ Endpoint returns 404
- ✅ Error rate drops to baseline
- ✅ Other endpoints remain operational
- ✅ Rollback completed in < 5 minutes

### Re-enable Procedure
```bash
# Uncomment route in src/router.ts
# Fix the bug
# Re-deploy
npx wrangler deploy
```

---

## Level 2: Sprint Rollback (< 15 minutes)

**Purpose:** Revert codebase to previous sprint tag, undoing all recent changes.

**When to use:**
- Multiple endpoints broken after deployment
- Regression detected across features
- Critical bug introduced in recent sprint
- Need to buy time to investigate

### Procedure

1. **List available sprint tags**
   ```bash
   git tag -l "sprint-*" --sort=-version:refname
   # Output:
   # sprint-3-baseline
   # sprint-2-baseline
   # sprint-1-baseline
   ```

2. **Identify last known good tag**
   ```bash
   # View tag details
   git show sprint-2-baseline
   # Verify this is the version you want
   ```

3. **Create emergency branch**
   ```bash
   # Save current state in emergency branch
   git checkout -b emergency-rollback-$(date +%Y%m%d-%H%M%S)
   git push origin emergency-rollback-$(date +%Y%m%d-%H%M%S)
   ```

4. **Rollback to tag**
   ```bash
   # Checkout last known good tag
   git checkout sprint-2-baseline

   # Create rollback branch
   git checkout -b rollback-to-sprint-2
   ```

5. **Deploy rolled-back version**
   ```bash
   npx wrangler deploy
   ```

6. **Verify service restored**
   ```bash
   # Health check
   curl https://api.oooefam.net/health

   # Check critical endpoints
   curl https://api.oooefam.net/v1/search/isbn?isbn=9780439708180
   curl https://api.oooefam.net/api/v2/capabilities
   ```

7. **Monitor logs**
   ```bash
   npx wrangler tail
   # Watch for error rate normalization
   ```

8. **Update main branch (if rollback is permanent)**
   ```bash
   # Force push rollback to main (USE WITH CAUTION)
   git push origin rollback-to-sprint-2:main --force

   # Or merge rollback branch
   git checkout main
   git merge rollback-to-sprint-2
   git push origin main
   ```

### Success Criteria
- ✅ Service returns to last known good state
- ✅ Error rate back to baseline
- ✅ Critical endpoints operational
- ✅ Rollback completed in < 15 minutes

### Recovery Procedure
```bash
# After fixing the issue in emergency branch
git checkout emergency-rollback-YYYYMMDD-HHMMSS
# Apply fixes
# Test thoroughly
git checkout main
git merge emergency-rollback-YYYYMMDD-HHMMSS
npx wrangler deploy
```

---

## Level 3: Feature Flag Disable (< 2 minutes)

**Purpose:** Emergency kill switch to disable entire OpenAPI system or other major features.

**When to use:**
- OpenAPI spec generation causing outages
- SDK breaking changes deployed by accident
- Critical security vulnerability in new feature
- Need immediate mitigation (fastest option)

### Available Feature Flags

| Flag | Effect | Default |
|------|--------|---------|
| `ENABLE_OPENAPI_ROUTES` | Disable `/doc/*` endpoints | `true` |
| `ENABLE_HONO_ROUTER` | Fallback to legacy router | `true` |
| `ENABLE_WORKFLOW_IMPORT` | Disable Workflow-based imports | `true` |
| `ENABLE_D1_WRITES` | Disable D1 dual-writes | `true` |

### Procedure: Disable OpenAPI Routes

1. **Add feature flag to wrangler.jsonc**
   ```bash
   # Edit wrangler.jsonc
   # Add to vars section:
   "ENABLE_OPENAPI_ROUTES": "false"
   ```

2. **Update router to check flag**
   ```typescript
   // src/router.ts
   // Add conditional registration
   if (env.ENABLE_OPENAPI_ROUTES !== 'false') {
     app.get('/doc', swagger UI...)
     app.get('/doc/openapi.json', openapi spec...)
   }
   ```

3. **Deploy immediately**
   ```bash
   npx wrangler deploy
   ```

4. **Verify endpoints disabled**
   ```bash
   curl https://api.oooefam.net/doc/openapi.json
   # Should return 404

   # Verify core API still works
   curl https://api.oooefam.net/health
   # Should return 200 OK
   ```

### Alternative: Cloudflare Dashboard Method

Even faster - no code changes required:

1. Go to Workers & Pages dashboard
2. Select `api-worker`
3. Settings → Environment Variables
4. Add `ENABLE_OPENAPI_ROUTES = false`
5. Click "Save and Deploy"
6. Wait 10-30 seconds for global propagation

### Success Criteria
- ✅ Feature disabled globally
- ✅ Core API remains operational
- ✅ Rollback completed in < 2 minutes

### Re-enable Procedure
```bash
# Change flag back to true
# wrangler.jsonc:
"ENABLE_OPENAPI_ROUTES": "true"

# Deploy
npx wrangler deploy
```

---

## Testing Rollback Procedures (Week 0)

### Test Level 1: Endpoint Rollback

```bash
# 1. Comment out health endpoint
# Edit src/router.ts, comment out:
# router.get('/health', ...)

# 2. Deploy
npx wrangler deploy

# 3. Verify 404
curl https://api.oooefam.net/health  # Should 404

# 4. Uncomment and redeploy
# Uncomment health endpoint, redeploy
npx wrangler deploy

# 5. Verify restored
curl https://api.oooefam.net/health  # Should 200
```

### Test Level 2: Sprint Rollback

```bash
# 1. Create test tag
git tag sprint-0-baseline

# 2. Make breaking change (test only - do not commit)
# Edit a file with test content

# 3. Test rollback
git checkout sprint-0-baseline

# 4. Verify files reverted
git diff main

# 5. Return to current
git checkout main

# 6. Clean up test tag
git tag -d sprint-0-baseline
```

### Test Level 3: Feature Flag

```bash
# 1. Add flag to wrangler.jsonc (test environment)
# "ENABLE_OPENAPI_ROUTES": "false"

# 2. Update router check (add if not exists)
# Edit src/router.ts to check flag

# 3. Deploy
npx wrangler deploy

# 4. Verify disabled
curl http://localhost:8787/doc/openapi.json  # Should 404

# 5. Re-enable
# "ENABLE_OPENAPI_ROUTES": "true"
npx wrangler deploy

# 6. Verify enabled
curl http://localhost:8787/doc/openapi.json  # Should 200
```

---

## Emergency Contact & Escalation

**On-Call Rotation:** See `docs/deployment/ON_CALL.md`

**Escalation Path:**
1. Detect issue (monitoring, logs, user reports)
2. Execute appropriate rollback level
3. Notify team in #bookstrack-alerts Slack
4. Create incident ticket
5. Post-mortem within 48 hours

**24/7 Emergency Contacts:**
- DevOps Lead: [contact info]
- Backend Lead: [contact info]
- On-Call Engineer: [PagerDuty]

---

## Post-Rollback Checklist

After executing any rollback:

- [ ] Document rollback in incident ticket
- [ ] Notify stakeholders (frontend, mobile, users if needed)
- [ ] Identify root cause
- [ ] Create fix in emergency branch
- [ ] Test fix in staging
- [ ] Create rollback post-mortem
- [ ] Schedule blameless retrospective
- [ ] Update monitoring/alerts to prevent recurrence

---

## Monitoring Rollback Success

**Key Metrics to Watch:**

```bash
# Error rate (should drop immediately)
npx wrangler tail | grep ERROR

# Response time (should normalize)
curl -w "%{time_total}" https://api.oooefam.net/health

# Cloudflare Analytics
# Check Workers Analytics dashboard for:
# - Request success rate
# - CPU time
# - Error rate
```

**Success Indicators:**
- Error rate < 1% (baseline)
- P95 latency < 1s
- Zero 500 errors in last 5 minutes
- Core endpoints returning 200

---

## Sprint Tag Strategy

**Create sprint baseline tags BEFORE starting new sprints:**

```bash
# At end of Sprint 1 (before Sprint 2 begins)
git tag -a sprint-1-baseline -m "Sprint 1 complete, stable baseline"
git push origin sprint-1-baseline

# At end of Sprint 2
git tag -a sprint-2-baseline -m "Sprint 2 complete, stable baseline"
git push origin sprint-2-baseline
```

**Tag Naming Convention:**
- `sprint-{N}-baseline` - Stable baseline after Sprint N
- Format: `sprint-1-baseline`, `sprint-2-baseline`, etc.
- Always annotated tags with description

**When to Create Tags:**
- ✅ After sprint completion, before next sprint
- ✅ After all tests passing
- ✅ After production deployment verified stable
- ❌ Never tag during active development
- ❌ Never tag undeployed code

---

## Related Documentation

- **Deployment Guide:** `docs/deployment/DEPLOYMENT.md`
- **Staging Environment:** `docs/deployment/STAGING.md`
- **Monitoring Guide:** `docs/deployment/MONITORING.md`
- **On-Call Playbook:** `docs/deployment/ON_CALL.md`

---

**Last Updated:** November 28, 2025
**Owner:** DevOps Team
**Status:** Procedures tested and verified in Week 0
