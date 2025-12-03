# Alexandria RPC Activation - Blocked

**Status:** Service binding cannot resolve target worker
**Date:** December 3, 2025
**Error:** `Could not resolve service binding 'ALEXANDRIA'. Target script 'alexandria-worker' not found.`

## Issue

bendv3 is configured to bind to a worker named `alexandria-worker`, but Cloudflare cannot find this worker in the account.

## Possible Causes

### 1. Worker Name Mismatch

**bendv3 expects:** `alexandria-worker`
**Alexandria deployed as:** ??? (unknown)

**Fix:** Check Alexandria's actual worker name in its wrangler configuration.

```bash
# In Alexandria repository
cat wrangler.toml | grep "name ="
# OR
cat wrangler.jsonc | grep '"name"'
```

Common possibilities:
- `name = "alexandria"` (without "-worker" suffix)
- `name = "alexandria-api"`
- `name = "alex-worker"`
- Different naming convention

### 2. Wrong Cloudflare Account

Alexandria deployed to different account than bendv3.

**Check:** Both workers must be in the same Cloudflare account for service bindings.

### 3. Alexandria Not Actually Deployed

Deployment may have failed or been rolled back.

**Verify:**
```bash
npx wrangler deployments list --name alexandria-worker
# OR try variations:
npx wrangler deployments list --name alexandria
```

### 4. Deployment Pending

Alexandria deployment may still be processing.

**Wait:** 1-2 minutes, then retry bendv3 deployment.

## Solution Steps

### Step 1: Find Alexandria's Actual Worker Name

```bash
# In Alexandria repository
grep -E "^name|\"name\"" wrangler.toml wrangler.jsonc
```

### Step 2: Update bendv3 Service Binding

Edit `bendv3/wrangler.jsonc` line 131:

```jsonc
"services": [
  {
    "binding": "ALEXANDRIA",
    "service": "ACTUAL_WORKER_NAME_HERE",  // ← Update this
    "entrypoint": "default"
  }
]
```

### Step 3: Redeploy bendv3

```bash
cd /path/to/bendv3
npm run deploy
```

## Expected Success Output

After fixing the worker name, deployment should show:

```
env.ALEXANDRIA (ACTUAL_WORKER_NAME#default)    Worker
```

And bendv3 logs should show:

```
🔗 Using Alexandria Service Binding (internal RPC)
```

## Temporary Workaround

If urgent, disable RPC and use fetch fallback:

```jsonc
// wrangler.jsonc
"ENABLE_ALEXANDRIA_RPC": "false"

// Comment out service binding
"// services": [...]
```

This reverts to proven HTTP fetch until worker name is resolved.

---

**Next Action:** Find Alexandria's actual worker name and update line 131 in wrangler.jsonc
