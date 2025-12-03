# Alexandria + bendv3 Sprint Coordination

**Status:** Sprint 1 Complete (Both Repos Ready)
**Last Updated:** December 3, 2025

## Overview

This document coordinates the Alexandria Hono RPC migration across both repositories. Both sides are now **100% ready** for activation.

---

## Completion Status

### ✅ Alexandria Repository (COMPLETE)

**TypeScript Migration:**
- [x] Migrated `worker/index.js` → TypeScript
- [x] Added Zod validation to all endpoints
- [x] Exported `AlexandriaAppType` for type inference
- [x] Published types as `@ooheynerds/alexandria-worker`

**Package Structure:**
```
@ooheynerds/alexandria-worker
├── /types          - All TypeScript interfaces and Zod schemas
│   ├── SearchQuery
│   ├── SearchResult
│   ├── BookResult
│   ├── ProcessCover
│   ├── EnrichmentTypes
│   └── ENDPOINTS constants
├── AlexandriaAppType - Hono route type export
└── README.md       - Integration guide
```

**Deployment:**
- Worker name: `alexandria-worker`
- Production URL: https://alexandria.ooheynerds.com
- Service binding enabled

---

### ✅ bendv3 Repository (COMPLETE)

**Infrastructure:**
- [x] Service binding configuration in `wrangler.jsonc`
- [x] Environment types updated with `ALEXANDRIA?: Fetcher`
- [x] RPC client factory: `src/services/alexandria-client.ts`
- [x] Feature flag system: `isAlexandriaRPCEnabled(env)`
- [x] Dual implementation paths (RPC + legacy fetch)
- [x] Cloudflare Access fallback headers
- [x] Comprehensive migration documentation

**Code Review:**
- Grok-4 approved with **EXCELLENT** rating
- No critical or high-severity issues
- All recommended improvements applied

**Testing:**
- ✅ Smoke tests: 8/8 passed
- ✅ Type checks: No blocking errors
- ✅ Feature flag validation: Working

---

## Activation Checklist

### Phase 1: Package Installation ✅ READY

**bendv3 actions:**
```bash
cd /path/to/bendv3
npm install @ooheynerds/alexandria-worker@latest
```

**Verify installation:**
```bash
npm ls @ooheynerds/alexandria-worker
# Should show: @ooheynerds/alexandria-worker@2.0.0 (or current version)
```

---

### Phase 2: Type Replacement ⏳ PENDING

**File:** `bendv3/src/types/alexandria-types.ts`

**Current (placeholder):**
```typescript
// TEMPORARY PLACEHOLDER: Alexandria's exported AppType
export interface AlexandriaAppType extends Hono {
  // Placeholder - routes will be auto-inferred from Alexandria's AppType export
}

// ... duplicated type definitions ...
```

**Replace with:**
```typescript
/**
 * Alexandria API Type Definitions
 *
 * Official types from @ooheynerds/alexandria-worker package.
 * Provides full type safety for Hono RPC client.
 */
export type {
  AlexandriaAppType,
  SearchQuery,
  SearchResult,
  BookResult,
  ProcessCover,
  CoverProcessResult,
  EnrichEdition,
  EnrichWork,
  EnrichAuthor,
  ErrorResponse,
  ENDPOINTS,
} from '@ooheynerds/alexandria-worker/types'
```

**Action:** Delete all placeholder interfaces, replace with single export statement

---

### Phase 3: Feature Flag Activation ⏳ PENDING

**File:** `bendv3/wrangler.jsonc`

**Add to `vars` section:**
```jsonc
{
  "vars": {
    // ... existing vars ...

    "//": "========================================================================",
    "//": "Alexandria Hono RPC Migration (Sprint 1 - Activation)",
    "//": "Enable sub-millisecond RPC calls to Alexandria via Service Binding",
    "//": "========================================================================",
    "ENABLE_ALEXANDRIA_RPC": "true"
  }
}
```

**Location:** After line 111 (after `VALIDATE_DUAL_WRITES`)

---

### Phase 4: Service Binding Verification ⏳ PENDING

**Verify Alexandria worker name matches binding:**

**bendv3 wrangler.jsonc (line 121):**
```jsonc
{
  "binding": "ALEXANDRIA",
  "service": "alexandria-worker",  // ← Must match Alexandria's worker name
  "entrypoint": "default"
}
```

**Alexandria wrangler.toml/wrangler.jsonc:**
```toml
name = "alexandria-worker"  # ← Must match this
```

**Action:** Confirm both names match exactly

---

### Phase 5: Deployment 🚀 READY

#### Step 1: Deploy Alexandria First
```bash
cd /path/to/alexandria
npm run deploy

# Verify deployment
curl https://alexandria.ooheynerds.com/health | jq
# Should show: { "status": "ok", "database": "connected" }
```

#### Step 2: Deploy bendv3
```bash
cd /path/to/bendv3
npm run deploy

# Monitor logs for RPC confirmation
wrangler tail --format pretty
```

**Success indicators:**
```
🔗 Using Alexandria Service Binding (internal RPC)
🔗 Alexandria RPC search for ISBN "9780439708180"
```

**Failure indicators (requires troubleshooting):**
```
⚠️ Alexandria Service Binding not available, using external URL
🌐 Using Alexandria external URL: https://alexandria.ooheynerds.com
```

---

## Expected Behavior After Activation

### RPC Path (Target Behavior)

**When:** `ENABLE_ALEXANDRIA_RPC="true"` AND service binding configured

**Flow:**
```
bendv3 Worker
    ↓
  isAlexandriaRPCEnabled(env) → true
    ↓
  searchAlexandriaByISBN_Uncached_RPC(isbn, env)
    ↓
  createAlexandriaClient(env)
    ↓
  env.ALEXANDRIA.fetch() [internal service binding]
    ↓
Alexandria Worker (sub-millisecond)
```

**Log Output:**
```
🔗 Using Alexandria Service Binding (internal RPC)
🔗 Alexandria RPC search for ISBN "9780439708180"
```

**Performance:**
- P50 latency: <1ms (down from 75ms)
- P95 latency: <2ms (down from 150ms)
- P99 latency: <5ms (down from 300ms)

---

### Fetch Path (Fallback Behavior)

**When:** `ENABLE_ALEXANDRIA_RPC="false"` OR service binding unavailable

**Flow:**
```
bendv3 Worker
    ↓
  isAlexandriaRPCEnabled(env) → false
    ↓
  searchAlexandriaByISBN_Uncached_Fetch(isbn, env)
    ↓
  fetch(https://alexandria.ooheynerds.com/api/search?isbn=...)
    ↓
  [Cloudflare Access authentication]
    ↓
Alexandria Worker (50-150ms)
```

**Log Output:**
```
⚠️ Alexandria Service Binding not available, using external URL
🌐 Using Alexandria external URL: https://alexandria.ooheynerds.com
Alexandria ISBN search for "9780439708180"
```

**Performance:**
- P50 latency: 75ms (current baseline)
- P95 latency: 150ms
- P99 latency: 300ms

---

## Troubleshooting

### Issue 1: Service Binding Not Found

**Symptoms:**
```
⚠️ Alexandria Service Binding not available, using external URL
```

**Causes:**
1. Worker name mismatch (bendv3 `service:` ≠ Alexandria `name:`)
2. Alexandria worker not deployed
3. Binding not in same Cloudflare account
4. Typo in `wrangler.jsonc` service binding configuration

**Fix:**
```bash
# 1. Check Alexandria worker name
cd /path/to/alexandria
grep "name" wrangler.toml

# 2. Check bendv3 binding
cd /path/to/bendv3
grep -A3 '"services"' wrangler.jsonc

# 3. Ensure names match exactly
# 4. Redeploy both workers
```

---

### Issue 2: Type Errors After Package Installation

**Symptoms:**
```
Property 'api' does not exist on type 'Client'
```

**Causes:**
1. Placeholder types not replaced with package import
2. Package version mismatch
3. TypeScript cache stale

**Fix:**
```bash
# 1. Verify package installed
npm ls @ooheynerds/alexandria-worker

# 2. Replace placeholder types (see Phase 2)
# Edit: src/types/alexandria-types.ts

# 3. Clear TypeScript cache
rm -rf node_modules/.cache
npm run dev  # Restart dev server
```

---

### Issue 3: 404 Errors from Alexandria

**Symptoms:**
```
Alexandria RPC error: 404 Not Found
```

**Causes:**
1. Route mismatch (bendv3 expecting `/api/search`, Alexandria has different route)
2. Zod validation failing on Alexandria side
3. Query parameters not matching schema

**Fix:**
```bash
# 1. Test Alexandria endpoint directly
curl "https://alexandria.ooheynerds.com/api/search?isbn=9780439708180" | jq

# 2. Check Alexandria logs
cd /path/to/alexandria
wrangler tail --format pretty

# 3. Verify Zod schema matches bendv3 query structure
```

---

### Issue 4: Performance Not Improved

**Symptoms:**
- Latency still 50-150ms after activation
- RPC logs present but no speed improvement

**Diagnostic:**
```bash
# Check Analytics Engine for latency metrics
wrangler analytics ENGINE_NAME

# Monitor real-time latency
wrangler tail --format pretty | grep "Alexandria"
```

**Causes:**
1. Service binding using external URL (check logs for warning)
2. Circuit breaker OPEN (check circuit breaker state in KV)
3. Alexandria database slow (check Hyperdrive latency)

**Fix:**
```bash
# 1. Verify service binding active (no "external URL" warnings)
# 2. Check circuit breaker state
wrangler kv:key get --namespace-id=xxx "circuit:alexandria"

# 3. Check Alexandria health
curl https://alexandria.ooheynerds.com/health | jq .hyperdrive_latency_ms
# Should be <10ms
```

---

## Rollback Procedure

### Emergency Rollback (Instant)

**If issues detected after activation:**

**Step 1: Disable feature flag**
```jsonc
// bendv3/wrangler.jsonc
{
  "vars": {
    "ENABLE_ALEXANDRIA_RPC": "false"  // ← Set to false
  }
}
```

**Step 2: Redeploy bendv3**
```bash
cd /path/to/bendv3
npm run deploy
```

**Result:** Instant rollback to fetch-based implementation (proven stable)

---

### Full Rollback (If Service Binding Issues)

**If service binding causes systemic issues:**

**Step 1: Remove service binding**
```jsonc
// bendv3/wrangler.jsonc
// Comment out or remove services array
/*
"services": [
  {
    "binding": "ALEXANDRIA",
    "service": "alexandria-worker",
    "entrypoint": "default"
  }
],
*/
```

**Step 2: Redeploy**
```bash
npm run deploy
```

**Result:** Complete removal of service binding, back to 100% fetch-based

---

## Performance Monitoring

### Key Metrics to Track

**1. Latency (Analytics Engine)**
```sql
-- Query PERFORMANCE_ANALYTICS dataset
SELECT
  AVG(duration_ms) as avg_latency,
  QUANTILE(duration_ms, 0.50) as p50,
  QUANTILE(duration_ms, 0.95) as p95,
  QUANTILE(duration_ms, 0.99) as p99
FROM alexandria_calls
WHERE timestamp > NOW() - INTERVAL 1 HOUR
GROUP BY rpc_enabled
```

**Target (RPC enabled):**
- P50: <1ms
- P95: <2ms
- P99: <5ms

**Baseline (Fetch):**
- P50: 75ms
- P95: 150ms
- P99: 300ms

---

**2. Error Rate**
```bash
# Monitor for increased errors after activation
wrangler tail --format pretty | grep -i error | wc -l
# Should remain at baseline levels
```

---

**3. Service Binding Usage**
```bash
# Count RPC vs Fetch calls
wrangler tail --format pretty | grep "Alexandria" | grep -c "RPC"
wrangler tail --format pretty | grep "Alexandria" | grep -c "external URL"
# RPC count should be 100% if feature flag enabled
```

---

## Success Criteria

### Phase 1: Initial Activation (First 1 Hour)

- [ ] No increase in error rate (compared to last 24h baseline)
- [ ] Service binding logs present ("🔗 Using Alexandria Service Binding")
- [ ] No "external URL" warnings in logs
- [ ] P95 latency <10ms (improved from 150ms baseline)

---

### Phase 2: Stabilization (First 24 Hours)

- [ ] P95 latency sustained <5ms
- [ ] Error rate <0.1% (same as baseline)
- [ ] No circuit breaker trips
- [ ] Cache hit rate unchanged (73% baseline)
- [ ] No customer reports of issues

---

### Phase 3: Full Migration (First 7 Days)

- [ ] Legacy fetch code can be removed (confidence high)
- [ ] Performance metrics stable
- [ ] Ready to move enrichment logic to Alexandria (Sprint 2)

---

## Communication Plan

### Pre-Activation Notification

**Recipients:** Engineering team, DevOps, Product
**Timing:** 24 hours before activation
**Content:**
- Activation date/time
- Expected behavior changes (latency improvement)
- Rollback procedure
- On-call rotation

---

### Post-Activation Report

**Recipients:** Engineering team, Product, Leadership
**Timing:** 1 hour, 24 hours, 7 days after activation
**Content:**
- Performance metrics (before/after)
- Error rates
- Any issues encountered
- Next steps (Sprint 2 planning)

---

## Next Steps (Sprint 2)

**After Sprint 1 stabilizes (7+ days), begin Sprint 2:**

### Goals:
1. Move enrichment logic from bendv3 to Alexandria
2. Alexandria becomes "Smart Provider" (handles Google Books/OpenLibrary fallbacks)
3. Remove external API calls from bendv3
4. Delete `src/services/external-apis.ts` (obsolete)

### Benefits:
- Further latency reduction (fewer network hops)
- Simplified bendv3 codebase
- Centralized book data orchestration
- Cost optimization (Alexandria manages API quotas)

**Estimated Timeline:** 2-3 weeks after Sprint 1 activation

---

## Contact Information

**Alexandria Owner:** @jukasdrj
**bendv3 Owner:** @jukasdrj
**Production API:** https://alexandria.ooheynerds.com
**Documentation:** See `docs/ALEXANDRIA_INTEGRATION.md` (Alexandria repo)

---

**Last Updated:** December 3, 2025
**Status:** Both repos ready for activation
**Next Action:** Install `@ooheynerds/alexandria-worker` in bendv3 and activate feature flag
