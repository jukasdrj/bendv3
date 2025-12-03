# Alexandria Hono RPC Migration Guide

**Status:** Sprint 1 - Infrastructure Ready, Awaiting Alexandria TypeScript Export
**Last Updated:** December 3, 2025

## Overview

This document tracks the migration from HTTP fetch-based Alexandria API calls to Hono RPC with Cloudflare Service Bindings. This migration provides sub-millisecond latency and full type safety.

## Architecture

### Before (Fetch-based)
```
bendv3 Worker
    ↓
  fetch() over public internet
    ↓
Alexandria Worker (https://alexandria.ooheynerds.com)
```

**Latency:** 50-150ms (public internet round-trip)
**Type Safety:** None (manual URL construction, untyped responses)

### After (Service Binding RPC)
```
bendv3 Worker
    ↓
  Service Binding (internal)
    ↓
Alexandria Worker (same Cloudflare account)
```

**Latency:** <1ms (direct worker-to-worker IPC)
**Type Safety:** Full (TypeScript knows all routes and response types)

## Benefits

1. **Performance:** Sub-millisecond latency (no public internet)
2. **Type Safety:** Compile-time route validation via `AlexandriaAppType`
3. **Developer Experience:** IDE autocomplete for all routes/parameters
4. **Validation:** Automatic Zod schema validation on requests/responses
5. **Simplicity:** No manual URL construction or error handling boilerplate

## Migration Status

### ✅ Completed (Sprint 1 - December 3, 2025)

#### bendv3 (Consumer) Repository
- [x] Added `services` binding in `wrangler.jsonc` (lines 113-124)
- [x] Updated `Env` interface with `ALEXANDRIA?: Fetcher` type (src/types/env.ts:100)
- [x] Created `src/types/alexandria-types.ts` (placeholder for types package)
- [x] Implemented `src/services/alexandria-client.ts` (typed RPC client)
- [x] Added `ENABLE_ALEXANDRIA_RPC` feature flag (src/services/alexandria-api.ts:55)
- [x] Created `searchAlexandriaByISBN_Uncached_RPC()` function (ready to enable)
- [x] Updated cache paths to use feature flag routing
- [x] Created this migration documentation

### ⏳ Pending (Alexandria Repository)

#### Required Changes to Alexandria
1. **Rename `worker/index.js` → `worker/index.ts`**
   - Add TypeScript support
   - Export `AppType` for type inference

2. **Add Zod validation to routes**
   ```typescript
   import { z } from 'zod'
   import { zValidator } from '@hono/zod-validator'

   const SearchSchema = z.object({
     isbn: z.string().optional(),
     title: z.string().optional(),
     author: z.string().optional(),
     limit: z.string().optional(),
   })

   app.get('/api/search', zValidator('query', SearchSchema), async (c) => {
     const { isbn, title, author, limit } = c.req.valid('query')
     // ... existing logic ...
   })
   ```

3. **Export AppType**
   ```typescript
   const routes = app
     .get('/api/search', ...)
     .get('/health', ...)

   export type AlexandriaAppType = typeof routes

   export default {
     fetch: app.fetch,
   }
   ```

4. **Publish Types Package (Option 1: Monorepo)**
   ```bash
   # In alexandria/package.json
   {
     "name": "@ooheynerds/alexandria-types",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "files": ["dist"]
   }
   ```

   **Or Option 2: Separate Package**
   ```bash
   npm init -y
   npm install --save-dev typescript
   # Export just the type definitions
   ```

### 🔄 Activation Steps (Once Alexandria Complete)

#### Step 1: Update bendv3 Dependencies
```bash
# In bendv3 repository
npm install @ooheynerds/alexandria-types@latest
```

#### Step 2: Replace Placeholder Types
```typescript
// In src/types/alexandria-types.ts
export type { AlexandriaAppType } from '@ooheynerds/alexandria-types'
```

#### Step 3: Enable Feature Flag
```typescript
// In src/services/alexandria-api.ts
const ENABLE_ALEXANDRIA_RPC = true // Change from false
```

#### Step 4: Deploy Both Workers
```bash
# Deploy Alexandria first
cd /path/to/alexandria
npm run deploy

# Then deploy bendv3
cd /path/to/bendv3
npm run deploy
```

#### Step 5: Verify Service Binding
```bash
# Check logs for RPC confirmation
wrangler tail

# Should see: "🔗 Using Alexandria Service Binding (internal RPC)"
# Not: "⚠️ Alexandria Service Binding not available, using external URL"
```

#### Step 6: Monitor Performance
```bash
# Check latency improvements in Analytics Engine
# Expected: <1ms for Alexandria calls (down from 50-150ms)
```

## Code Structure

### Key Files

| File | Purpose |
|------|---------|
| `src/services/alexandria-client.ts` | Hono RPC client factory |
| `src/services/alexandria-api.ts` | Main Alexandria integration (feature flag routing) |
| `src/types/alexandria-types.ts` | Type definitions (placeholder → package import) |
| `src/types/env.ts` | Environment bindings (ALEXANDRIA Fetcher) |
| `wrangler.jsonc` | Service binding configuration |

### Feature Flag Flow

```typescript
// Feature flag controls which implementation is used
const ENABLE_ALEXANDRIA_RPC = false // Currently disabled

// Route to appropriate implementation
const uncachedFn = ENABLE_ALEXANDRIA_RPC
  ? searchAlexandriaByISBN_Uncached_RPC  // ← New (ready but disabled)
  : searchAlexandriaByISBN_Uncached_Fetch // ← Current (active)
```

### RPC Client Usage (When Enabled)

```typescript
import { createAlexandriaClient } from './alexandria-client'

const client = createAlexandriaClient(env)

// TypeScript knows this route exists and enforces types
const response = await client.api.search.$get({
  query: { isbn: '9780439708180' }
})

if (response.ok) {
  const data = await response.json() // Fully typed!
}
```

## Testing Strategy

### Phase 1: Local Development Testing
```bash
# In alexandria repo
npm run dev  # Starts on localhost:8788

# In bendv3 repo
# Update .env with fallback URL
ALEXANDRIA_BASE_URL=http://localhost:8788

npm run dev
npm run test:safe
```

### Phase 2: Staging Deployment
```bash
# Deploy to staging environment with service binding
wrangler deploy --env staging

# Monitor logs for RPC confirmation
wrangler tail --env staging
```

### Phase 3: Gradual Production Rollout
1. Deploy both workers to production
2. Enable `ENABLE_ALEXANDRIA_RPC = true`
3. Monitor error rates and latency
4. Rollback if issues detected (set flag to `false`)

## Rollback Plan

### Emergency Rollback (Immediate)
```typescript
// In src/services/alexandria-api.ts
const ENABLE_ALEXANDRIA_RPC = false // Instant rollback to fetch
```

Deploy bendv3:
```bash
npm run deploy
```

### Full Rollback (If Service Binding Issues)
```jsonc
// In wrangler.jsonc - remove service binding
// "services": [
//   {
//     "binding": "ALEXANDRIA",
//     "service": "alexandria-worker"
//   }
// ],
```

## Performance Expectations

| Metric | Before (Fetch) | After (RPC) | Improvement |
|--------|---------------|-------------|-------------|
| P50 Latency | 75ms | <1ms | 75x faster |
| P95 Latency | 150ms | <2ms | 75x faster |
| P99 Latency | 300ms | <5ms | 60x faster |
| Cold Start | 200ms | <10ms | 20x faster |

## Security Considerations

### Service Binding Security
- Service bindings are **account-scoped** (only workers in same CF account)
- No public internet exposure (internal IPC only)
- No need for Cloudflare Access tokens (bypassed via service binding)

### Authentication Migration
```typescript
// Before (Fetch): Cloudflare Access tokens required
headers: {
  "CF-Access-Client-Id": env.ALEXANDRIA_CLIENT_ID,
  "CF-Access-Client-Secret": env.ALEXANDRIA_CLIENT_SECRET,
}

// After (RPC): Service binding bypasses Access
// No authentication headers needed (internal binding)
```

### Secrets Cleanup (Post-Migration)
Once RPC is stable, remove unused secrets:
```bash
# These will be obsolete with service bindings
wrangler secret delete ALEXANDRIA_CLIENT_ID
wrangler secret delete ALEXANDRIA_CLIENT_SECRET
```

## Dependencies

### bendv3 Current Dependencies
- `hono@^4.10.7` ✅ (already installed)
- `zod@^4.1.13` ✅ (already installed)

### Alexandria Required Dependencies (Pending)
- `hono@^4.x` (install if not present)
- `zod@^3.x or ^4.x` (for validation)
- `@hono/zod-validator@^0.x` (for route validation)
- `typescript@^5.x` (for .ts support)

## Troubleshooting

### Issue: Service Binding Not Found
```
⚠️ Alexandria Service Binding not available, using external URL
```

**Causes:**
1. Service binding not configured in `wrangler.jsonc`
2. Alexandria worker not deployed
3. Wrong service name (must match Alexandria's worker name)

**Fix:**
```jsonc
// Verify in wrangler.jsonc
"services": [
  {
    "binding": "ALEXANDRIA",
    "service": "alexandria-worker", // Must match Alexandria's worker name
    "entrypoint": "default"
  }
]
```

### Issue: Type Errors on RPC Calls
```
Property 'api' does not exist on type 'Client'
```

**Cause:** Alexandria hasn't exported `AlexandriaAppType` yet

**Fix:** Wait for Alexandria TypeScript migration, or use `any` temporarily:
```typescript
const client = createAlexandriaClient(env) as any
```

### Issue: 404 on RPC Calls
```
Alexandria RPC error: 404 Not Found
```

**Causes:**
1. Alexandria routes don't match expected structure
2. Alexandria hasn't migrated to Hono with zValidator

**Fix:** Verify Alexandria has `/api/search` route with zValidator

## Next Steps

### Immediate (bendv3)
- ✅ Infrastructure ready
- ✅ Feature flag in place
- ✅ Documentation complete

### Next (Alexandria)
1. Rename `index.js` → `index.ts`
2. Add Zod validation to routes
3. Export `AlexandriaAppType`
4. Publish types package

### Future (Sprint 2)
1. Move Google Books/OpenLibrary logic into Alexandria
2. Implement "Smart Provider" pattern (Alexandria handles fallbacks)
3. Remove external API calls from bendv3
4. Delete `src/services/external-apis.ts` (obsolete)

## References

- **Hono RPC Docs:** https://hono.dev/docs/guides/rpc
- **Service Bindings Docs:** https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- **Zod Validation:** https://github.com/honojs/middleware/tree/main/packages/zod-validator

---

**Last Updated:** December 3, 2025
**Owner:** @jukasdrj
**Status:** ✅ Sprint 1 Complete (bendv3 ready, awaiting Alexandria)
