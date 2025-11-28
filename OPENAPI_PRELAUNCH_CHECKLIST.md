# OpenAPI Migration - Pre-Launch Checklist

**Status:** In Progress
**Date:** November 28, 2025
**Sprint 1 Start Date:** TBD (after this checklist complete)

---

## Executive Summary

This checklist covers **all 10 critical blockers** identified in the OpenAPI Fast-Track plan review. Items 1-4 are ✅ COMPLETE. Items 5-10 require attention before Sprint 1 execution.

---

## Critical Blockers Status

### ✅ RESOLVED (Items 1-4)

| # | Blocker | Status | Resolution |
|---|---------|--------|------------|
| 1 | SDK Generation Tooling | ✅ COMPLETE | `openapi-typescript` + `openapi-fetch` installed |
| 2 | Frontend Repository Reference | ✅ COMPLETE | GitHub Packages delivery (no filesystem coupling) |
| 3 | Breaking Change Detection | ✅ COMPLETE | Script + CI/CD workflow created |
| 4 | Contract Validation Middleware | ✅ COMPLETE | Enabled in monitoring mode |

**See:** `OPENAPI_BLOCKERS_RESOLUTION.md` and `OPENAPI_BLOCKERS_3_4_RESOLUTION.md`

---

### ⏳ IN PROGRESS (Items 5-10)

## 5. OpenAPI Spec Auto-Generation ⚠️ VERIFY NEEDED

**Issue:** Plan assumes `/doc/openapi.json` endpoint exists and auto-generates from Zod schemas.

**Current State:**
- ✅ Swagger UI endpoint exists: `/doc` (src/router.ts:1851)
- ✅ OpenAPI JSON endpoint exists: `/doc/openapi.json` (src/router.ts:1854)
- ✅ Using OpenAPIHono for auto-generation
- ⚠️ Only 1 POC endpoint migrated: `/api/v2/capabilities`

**Testing Required:**
```bash
# Start local dev server
npm run dev

# Test endpoints (in another terminal)
curl http://localhost:8787/doc/openapi.json | jq .

# Expected output: Valid OpenAPI 3.0.3 spec with paths
# Should include: /health, /api/v2/capabilities, and any other migrated routes

# Validate spec
npx @stoplight/spectral-cli lint http://localhost:8787/doc/openapi.json
```

**Success Criteria:**
- [ ] `/doc/openapi.json` returns valid OpenAPI 3.0.3 spec
- [ ] Spec includes `/api/v2/capabilities` route
- [ ] Spec passes Spectral validation (no critical errors)
- [ ] Swagger UI renders correctly at `/doc`

**Impact if Failed:** SDK generation will fail on Sprint 1, Day 6-7

**Remediation:**
- If endpoint doesn't work, debug OpenAPIHono integration
- Verify all migrated routes use `app.openapi()` not `app.get()`
- Check if Zod schemas are properly exported

---

## 6. npm Registry Setup for SDK Publishing ⚠️ DECISION NEEDED

**Issue:** No npm registry configured for SDK publishing.

**Current State:**
- ✅ SDK package created: `packages/api-client/`
- ✅ GitHub Actions workflow created: `.github/workflows/publish-sdk.yml`
- ✅ Configured for GitHub Packages (default)
- ⏳ NOT TESTED end-to-end yet

**Decision Matrix:**

| Registry | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **GitHub Packages** | Free for private repos, integrated with repo, no external account | Requires GitHub auth token, less discoverable | ✅ **RECOMMENDED** |
| **npm Public** | Public discoverability, standard workflow | Public exposure, costs $$ for private | ❌ Not recommended (private API) |
| **npm Private** | Standard workflow, private | Costs $7/user/month | ❌ Overkill for single team |

**Recommended: GitHub Packages** ✅

**Setup Steps:**
1. ✅ Package configured for GitHub Packages (`publishConfig.registry` in package.json)
2. ⏳ Test manual publish locally (optional):
   ```bash
   cd packages/api-client
   npm run generate
   npm run build
   # Requires GitHub PAT with packages:write scope
   npm publish
   ```
3. ⏳ Verify GitHub Actions workflow:
   - Check `GITHUB_TOKEN` permissions in workflow (auto-provided)
   - Test by pushing to `main` branch with changes to `docs/openapi.yaml`

**Frontend Team Setup:**
```bash
# Add to frontend/.npmrc
@bookstrack:registry=https://npm.pkg.github.com

# Install SDK
npm install @bookstrack/api-client
```

**Success Criteria:**
- [ ] SDK publishes to GitHub Packages successfully
- [ ] Frontend team can install SDK via `npm install @bookstrack/api-client`
- [ ] SDK version increments automatically on publish

**Impact if Failed:** Sprint 1 Day 7 and auto-publish workflow will fail

---

## 7. Dependabot Frontend Integration ⏳ FUTURE SPRINT

**Issue:** Frontend repo may not have Dependabot configured for SDK auto-updates.

**Current State:**
- ⏳ Frontend repository location: Unknown (separate repo assumed)
- ⏳ Dependabot configuration: Not verified

**Required Actions:**
1. ⏳ Confirm frontend repository location
2. ⏳ Add `.github/dependabot.yml` to frontend repo:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: "/"
       schedule:
         interval: daily
       allow:
         - dependency-name: "@bookstrack/api-client"
   ```
3. ⏳ Test Dependabot creates PR when SDK version updates

**Timeline:** Sprint 2, Day 18 (not a Sprint 1 blocker)

**Impact if Failed:** Auto-update workflow won't work, frontend team must manually update SDK

**Workaround:** Frontend team can manually update SDK weekly

---

## 8. Rollback Testing 🚨 CRITICAL - NOT TESTED

**Issue:** 3 rollback levels described in plan but none have been tested.

**Rollback Levels:**

### Level 1: Endpoint Rollback (<5 minutes)
```typescript
// src/router.ts
// Comment out problematic endpoint
// app.openapi(problematicRoute, handler)  // TEMPORARILY DISABLED

// Add legacy fallback (if needed)
app.get('/v1/search/isbn', legacyHandler)
```

**Test Plan:**
```bash
# 1. Comment out /health endpoint in src/router.ts
# 2. Deploy: npx wrangler deploy
# 3. Verify /health returns 404
# 4. Uncomment endpoint
# 5. Deploy again
# 6. Verify /health works
```

### Level 2: Sprint Rollback (<15 minutes)
```bash
# Git rollback to previous sprint tag
git checkout sprint-1-stable  # Or previous known-good commit
npx wrangler deploy

# Verify health check
curl -f https://api.oooefam.net/health
```

**Test Plan:**
```bash
# 1. Create a sprint tag: git tag sprint-0-baseline
# 2. Make breaking changes
# 3. Test rollback: git checkout sprint-0-baseline
# 4. Deploy: npx wrangler deploy
# 5. Verify service works
```

### Level 3: Feature Flag Disable (<2 minutes)
```typescript
// wrangler.jsonc
"vars": {
  "ENABLE_OPENAPI_ROUTES": "false"  // Emergency disable
}

// src/router.ts
if (env.ENABLE_OPENAPI_ROUTES === 'true') {
  // OpenAPI routes
} else {
  // Legacy routes (must remain in codebase!)
}
```

**Test Plan:**
```bash
# 1. Add ENABLE_OPENAPI_ROUTES to wrangler.jsonc
# 2. Deploy with flag=true, verify OpenAPI routes work
# 3. Deploy with flag=false, verify legacy routes work
# 4. Switch back to flag=true
```

**Action Items:**
- [ ] Test Level 1 rollback in local dev
- [ ] Test Level 2 rollback with git tags
- [ ] Implement Level 3 feature flag (not in current plan)
- [ ] Document rollback procedures in `docs/deployment/ROLLBACK.md`
- [ ] Add rollback section to `/deploy` slash command

**Success Criteria:**
- [ ] All 3 levels tested successfully
- [ ] Rollback time < documented limits
- [ ] Service remains available during rollback

**Impact if Failed:** Production incident recovery will be slower and riskier

---

## 9. Staging Environment Setup 🚨 CRITICAL - MISSING

**Issue:** No staging environment configured. Deploys go directly to production.

**Current State:**
- ✅ Production configured: `routes[0].pattern = "api.oooefam.net/*"`
- ❌ No staging environment in `wrangler.jsonc`

**Recommended Setup:**

Create `wrangler.staging.jsonc`:
```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "api-worker-staging",
  "extends": "wrangler.jsonc",
  "routes": [
    {
      "pattern": "api-staging.oooefam.net/*",
      "zone_name": "oooefam.net"
    }
  ],
  "vars": {
    "LOG_LEVEL": "debug",
    "ENABLE_OPENAPI_ROUTES": "true"
  }
}
```

**Deployment Workflow:**
```bash
# Deploy to staging
npx wrangler deploy --config wrangler.staging.jsonc

# Test in staging
curl https://api-staging.oooefam.net/health

# If tests pass, deploy to production
npx wrangler deploy
```

**DNS Setup:**
```bash
# Add CNAME record in Cloudflare DNS
# api-staging.oooefam.net → api-worker-staging.workers.dev
```

**Action Items:**
- [ ] Create `wrangler.staging.jsonc` (extends base config)
- [ ] Set up DNS for `api-staging.oooefam.net`
- [ ] Test staging deployment
- [ ] Update `.github/workflows/` to deploy to staging first
- [ ] Document staging workflow in `docs/deployment/STAGING.md`

**Success Criteria:**
- [ ] Staging environment accessible at `https://api-staging.oooefam.net`
- [ ] All changes tested in staging before production
- [ ] Staging uses separate KV/D1 namespaces (or production with caution)

**Impact if Failed:** High risk of production issues, no safe testing ground

---

## 10. Timeline Buffer Analysis ⏳ PLANNING ADJUSTMENT

**Issue:** 30-day timeline may be aggressive for complex endpoints.

**Analysis from Plan:**

| Sprint | Endpoints | Days | Rate | Complexity | Risk |
|--------|-----------|------|------|------------|------|
| Sprint 1 | 3 | 3 | 1.0/day | LOW | ✅ Low |
| Sprint 2 | 10 | 6 | 1.7/day | MEDIUM-HIGH | ⚠️ Medium |
| Sprint 3 | 7 | 3 | 2.3/day | MEDIUM | ⚠️ Medium |

**High-Risk Endpoints:**
- Batch operations (Sprint 2): "VERY HIGH complexity"
- Job management (Sprint 2): 7 endpoints, complex state schemas
- Semantic search (Sprint 3): ML integration

**Recommended Adjustments:**

### Option A: Add 30% Buffer (Conservative)
- Sprint 1: 3 days → 4 days
- Sprint 2: 10 days → 13 days
- Sprint 3: 10 days → 13 days
- **Total: 30 days → 39 days (9 weeks)**

### Option B: Cut Scope (Aggressive)
- Sprint 1: 3 endpoints (keep as-is)
- Sprint 2: 7 endpoints instead of 10 (drop 3 lowest priority)
- Sprint 3: 5 endpoints instead of 7 (drop 2 lowest priority)
- **Total: 15 endpoints in 30 days**

### Option C: Hybrid (Recommended) ✅
- Sprint 1: 3 days → 4 days (learning curve buffer)
- Sprint 2: 10 days → 11 days (add 1 day for batch complexity)
- Sprint 3: 10 days → 10 days (team is experienced by now)
- **Total: 30 days → 35 days (7 weeks)**

**Must-Have vs Nice-to-Have:**

**Must-Have (Core User Flows):**
1. `/v1/search/isbn`, `/v1/search/title` (Sprint 1)
2. `POST /api/v2/imports`, `GET /api/v2/imports/:jobId` (Sprint 2)
3. `POST /api/batch-scan`, `POST /api/import/csv-gemini` (Sprint 2)

**Nice-to-Have (Can Defer):**
- `/v1/search/similar` (Sprint 3)
- `/v1/search/semantic` (Sprint 3)
- Legacy job endpoints (if new ones work)

**Recommended Timeline:**
- **Target:** 35 days (7 weeks) with 5-day buffer
- **Minimum Viable:** 15 endpoints (core user flows only)
- **Full Coverage:** 20 endpoints (if timeline permits)

**Action Items:**
- [ ] Review timeline with frontend team
- [ ] Identify must-have vs nice-to-have endpoints
- [ ] Add 5-day buffer to schedule
- [ ] Plan Sprint 1 kickoff meeting

---

## Pre-Launch Checklist Summary

### 🚨 Critical (Must Complete Before Sprint 1)

- [ ] **#5:** Test `/doc/openapi.json` endpoint works
- [ ] **#8:** Test all 3 rollback procedures
- [ ] **#9:** Set up staging environment (`wrangler.staging.jsonc`)

### ⚠️ Important (Should Complete Before Sprint 1)

- [ ] **#6:** Test SDK publishing to GitHub Packages end-to-end
- [ ] **#10:** Add 5-day buffer to timeline, identify must-have endpoints

### ⏳ Future Sprint (Can Defer to Sprint 2)

- [ ] **#7:** Configure Dependabot in frontend repository

---

## Recommended Action Plan

### Week 0 (Before Sprint 1 Kickoff)

**Day 1:**
- [ ] Test `/doc/openapi.json` endpoint (Issue #5)
- [ ] Create `wrangler.staging.jsonc` (Issue #9)
- [ ] Set up DNS for `api-staging.oooefam.net`

**Day 2:**
- [ ] Test all 3 rollback procedures (Issue #8)
- [ ] Document rollback steps in `docs/deployment/ROLLBACK.md`
- [ ] Deploy to staging and verify health

**Day 3:**
- [ ] Test SDK publishing manually (Issue #6)
- [ ] Verify frontend can install SDK from GitHub Packages
- [ ] Create staging deployment workflow

**Day 4:**
- [ ] Sprint planning meeting
- [ ] Review timeline and add buffers (Issue #10)
- [ ] Finalize must-have endpoint list
- [ ] Schedule Sprint 1 kickoff

**Day 5:**
- [ ] Final pre-launch review
- [ ] Sign-off from all stakeholders
- [ ] **GO/NO-GO decision**

### Sprint 1 Kickoff (Week 1)

**Prerequisites:**
- ✅ All critical blockers resolved
- ✅ Staging environment tested
- ✅ Rollback procedures tested
- ✅ SDK publishing verified

---

## Sign-Off Checklist

Before starting Sprint 1, confirm:

- [ ] All 4 resolved blockers verified (Items 1-4)
- [ ] OpenAPI endpoint tested and working (Item 5)
- [ ] SDK publishing tested end-to-end (Item 6)
- [ ] Rollback procedures tested (Item 8)
- [ ] Staging environment deployed (Item 9)
- [ ] Timeline reviewed and buffer added (Item 10)
- [ ] Frontend team aligned on SDK workflow
- [ ] Emergency contacts documented
- [ ] Monitoring dashboards configured

**Sign-Off:**
- [ ] Technical Lead: _______________ Date: ___________
- [ ] Frontend Lead: _______________ Date: ___________
- [ ] DevOps Lead: _______________ Date: ___________

---

**Document Version:** 1.0
**Created:** November 28, 2025
**Author:** Claude Code
**Status:** In Progress - Week 0 Testing Required

**Next Steps:**
1. Complete Week 0 testing plan (Days 1-5)
2. Hold GO/NO-GO meeting
3. If GO: Start Sprint 1
4. If NO-GO: Address blockers and retry
