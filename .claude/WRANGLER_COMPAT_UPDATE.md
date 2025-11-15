# Cloudflare Workers Compatibility Flags Update

**Date:** November 14, 2025
**Current Compatibility Date:** `2024-10-01`
**Recommended Update:** `2025-11-14` (latest available as of Nov 14, 2025)

---

## Recommended Changes to `wrangler.toml`

### **1. Update Compatibility Date**

```toml
# OLD
compatibility_date = "2024-10-01"

# NEW
compatibility_date = "2025-11-14"  # Latest available (update to 2025-11-17 when released)
```

**Benefits:**
- ✅ `ctx.exports` API for easier DO bindings
- ✅ Node.js `process` v2 implementation
- ✅ HTTP server modules (`node:http`, `node:https`)
- ✅ `navigator.language` support
- ✅ `FinalizationRegistry` and `WeakRef`
- ✅ Better standards compliance

---

### **2. Add Recommended Compatibility Flags**

```toml
# OLD
compatibility_flags = ["nodejs_compat"]

# NEW
compatibility_flags = [
  "nodejs_compat",                      # Node.js APIs (already enabled)
  "enable_request_signal",              # Cancel requests on client disconnect
  "cache_no_cache_enabled",             # Better cache control
  "fixup-transform-stream-backpressure" # Streaming performance fix
]
```

**Why These Flags:**

1. **`enable_request_signal`** - Cancel expensive AI calls when clients disconnect
   - **Use case:** iOS app closes during bookshelf scan
   - **Benefit:** Save Gemini API credits on abandoned requests

2. **`cache_no_cache_enabled`** - Force cache revalidation
   - **Use case:** Critical book metadata updates
   - **Benefit:** Better control over KV cache vs fresh data

3. **`fixup-transform-stream-backpressure`** - Proper streaming backpressure
   - **Use case:** WebSocket progress updates during batch scans
   - **Benefit:** Prevent memory bloat on large batches

---

## Auto-Enabled Features (with compat date 2025-11-17)

### **1. `ctx.exports` API**

**Before:**
```javascript
const id = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
const stub = env.PROGRESS_WEBSOCKET_DO.get(id);
```

**After:**
```javascript
const id = ctx.exports.ProgressWebSocketDO.idFromName(jobId);
const stub = ctx.exports.ProgressWebSocketDO.get(id);
```

**Benefit:** Less configuration, cleaner code.

---

### **2. `process.env` Auto-Population**

**Before:**
```javascript
const apiKey = env.GEMINI_API_KEY;
const logLevel = env.LOG_LEVEL || 'info';
```

**After:**
```javascript
const apiKey = process.env.GEMINI_API_KEY;
const logLevel = process.env.LOG_LEVEL || 'info';
```

**Benefit:** Standard Node.js patterns, easier library compatibility.

---

### **3. Node.js HTTP Modules**

**Before:** Not available

**After:**
```javascript
import http from 'node:http';

// Compatible with Node.js HTTP libraries
const agent = new http.Agent({ keepAlive: true });
```

**Benefit:** Use standard Node.js HTTP libraries and middleware.

---

## Code Changes Needed

### **1. Use Request Signal for Cancellation**

**File:** `src/handlers/bookshelf-scan.js`

```javascript
export async function handleBookshelfScan(request, env, ctx) {
  // NEW: Attach abort listener
  request.signal.addEventListener('abort', () => {
    console.log('[Scan] Client disconnected - cleaning up');
  });

  try {
    const result = await env.AI.run('@cf/google/gemini-2.0-flash', {
      prompt: buildScanPrompt(imageUrl),
      signal: request.signal  // NEW: Pass through cancellation
    });

    return jsonResponse({ success: true, data: result });
  } catch (err) {
    if (err.name === 'AbortError') {
      // Client disconnected - don't charge for incomplete work
      console.log('[Scan] Aborted by client disconnect');
      return;
    }
    throw err;
  }
}
```

---

### **2. Use `cache: 'no-cache'` for Critical Data**

**File:** `src/providers/google-books.js`

```javascript
export async function fetchBookByISBN(isbn, env) {
  // Check KV cache first
  const cached = await env.KV_CACHE.get(`book:${isbn}`, 'json');
  if (cached && !shouldRevalidate(cached)) {
    return cached;
  }

  // NEW: Use cache: 'no-cache' to force revalidation
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
    {
      cache: 'no-cache',  // Force revalidation with Google Books
      headers: {
        'User-Agent': env.USER_AGENT
      }
    }
  );

  const book = await response.json();

  // Update KV cache
  await env.KV_CACHE.put(`book:${isbn}`, JSON.stringify(book), {
    expirationTtl: 86400  // 24 hours
  });

  return book;
}
```

---

### **3. Optional: Use `ctx.exports` for DO Bindings**

**File:** `src/handlers/websocket.js`

```javascript
// Before
export async function handleWebSocketUpgrade(request, env) {
  const jobId = new URL(request.url).searchParams.get('jobId');
  const id = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
  const stub = env.PROGRESS_WEBSOCKET_DO.get(id);
  return stub.fetch(request);
}

// After (optional, cleaner)
export async function handleWebSocketUpgrade(request, env, ctx) {
  const jobId = new URL(request.url).searchParams.get('jobId');
  const id = ctx.exports.ProgressWebSocketDO.idFromName(jobId);
  const stub = ctx.exports.ProgressWebSocketDO.get(id);
  return stub.fetch(request);
}
```

---

## Testing Checklist

After updating compatibility flags:

- [ ] Run `npx wrangler dev` locally
- [ ] Test bookshelf scan endpoint
- [ ] Test WebSocket progress updates
- [ ] Verify Google Books API calls
- [ ] Check rate limiter DO functionality
- [ ] Test client disconnect scenarios
- [ ] Deploy to staging: `npx wrangler deploy --env staging`
- [ ] Smoke test staging endpoints
- [ ] Deploy to production: `npx wrangler deploy`

---

## Rollback Plan

If issues arise:

1. **Revert compatibility date:**
   ```toml
   compatibility_date = "2024-10-01"
   ```

2. **Remove new flags:**
   ```toml
   compatibility_flags = ["nodejs_compat"]
   ```

3. **Redeploy:**
   ```bash
   npx wrangler deploy
   ```

---

## Cost Impact

**Expected:** $0 additional cost

**Reasoning:**
- `enable_request_signal` → **SAVES money** (cancels abandoned AI calls)
- `cache_no_cache_enabled` → Neutral (better control, same usage)
- `fixup-transform-stream-backpressure` → Performance fix (no cost impact)

**Estimated Savings:** $10-30/month from canceled AI calls when clients disconnect.

---

## Timeline

**Phase 1: Local Testing** (Week 1)
- Update `wrangler.toml`
- Test locally with `wrangler dev`
- Implement request signal cancellation

**Phase 2: Staging** (Week 1)
- Deploy to staging environment
- Test all endpoints
- Monitor for 2-3 days

**Phase 3: Production** (Week 2)
- Deploy to production
- Monitor for 1 week
- Rollback if issues

---

## References

- [Cloudflare Compatibility Flags Docs](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Node.js Compatibility in Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Request Signal API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Request/signal)

---

**Last Updated:** November 14, 2025
**Owner:** @jukasdrj
**Reviewer:** Claude Code (Sonnet 4.5)
