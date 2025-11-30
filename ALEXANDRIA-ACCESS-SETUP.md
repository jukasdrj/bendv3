# Alexandria Cloudflare Access Setup Guide

**Issue**: Alexandria Worker is protected by Cloudflare Access, blocking bendv3 API calls  
**Solution**: Service Token bypass for Worker-to-Worker authentication  
**Date**: November 29, 2025

---

## Problem Summary

Alexandria Worker (https://alexandria.ooheynerds.com) returns 403 Forbidden when bendv3 tries to call it:

```
Status code: 403
Message: "You don't have permission to view this"
```

This causes Alexandria to fail and bendv3 falls back to Google Books/OpenLibrary/ISBNdb, defeating the purpose of the local database.

---

## Solution: Service Token Bypass

Create a Cloudflare Access service token that allows bendv3 to bypass authentication when calling Alexandria.

---

## Step-by-Step Setup

### Step 1: Create Service Token in Cloudflare Zero Trust

1. **Open Cloudflare Zero Trust Dashboard:**
   - Go to https://one.dash.cloudflare.com/
   - Navigate to **Access** → **Service Auth** → **Service Tokens**

2. **Create New Service Token:**
   - Click **"Create Service Token"**
   - Name: `bendv3-to-alexandria`
   - Duration: **Non-expiring** (or 1 year)
   - Click **"Generate Token"**

3. **⚠️ IMPORTANT: Copy credentials (shown only once):**
   ```
   Client ID: <copy and save>
   Client Secret: <copy and save>
   ```

---

### Step 2: Add Bypass Rule to Alexandria Access Policy

1. **Navigate to Access Application:**
   - Zero Trust Dashboard → **Access** → **Applications**
   - Find `alexandria.ooheynerds.com`
   - Click **Edit**

2. **Add Service Token Bypass Rule:**
   - Scroll to **Policies** section
   - Click **"Add a Rule"** (above existing policies)
   - Configure:
     - Rule name: `Allow bendv3 Service Token`
     - Action: **Bypass**
     - Include: **Service Token** → Select `bendv3-to-alexandria`
   - Click **Save**

3. **⚠️ CRITICAL: Reorder Policies**
   - Drag the new **Bypass** rule to **position #1** (must be first!)
   - Bypass rules only work if they're evaluated before Allow/Block rules
   - Save application

---

### Step 3: Add Secrets to bendv3 Worker

1. **Add secrets via Wrangler CLI:**

```bash
cd /Users/juju/dev_repos/bendv3

# Add Client ID
npx wrangler secret put ALEXANDRIA_CLIENT_ID
# Paste the Client ID when prompted

# Add Client Secret  
npx wrangler secret put ALEXANDRIA_CLIENT_SECRET
# Paste the Client Secret when prompted
```

2. **Verify secrets were added:**

```bash
npx wrangler secret list
```

You should see:
- ALEXANDRIA_CLIENT_ID
- ALEXANDRIA_CLIENT_SECRET
- (plus existing secrets)

---

### Step 4: Deploy Updated Code

The code changes have already been made:
- ✅ `wrangler.jsonc` - Added secret bindings
- ✅ `src/services/alexandria-api.ts` - Added CF-Access headers
- ✅ `src/services/external-apis.ts` - Updated type definitions
- ✅ `src/services/enrichment.ts` - Updated type definitions

Deploy to production:

```bash
cd /Users/juju/dev_repos/bendv3
npx wrangler deploy
```

---

## Testing

### Test 1: Direct Alexandria API Call

```bash
# Should now work with service token headers
curl -H "CF-Access-Client-Id: YOUR_CLIENT_ID" \
     -H "CF-Access-Client-Secret: YOUR_CLIENT_SECRET" \
     "https://alexandria.ooheynerds.com/api/isbn?isbn=9780439064873"
```

Expected: JSON response with book data

### Test 2: bendv3 ISBN Lookup

```bash
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439064873"
```

Check response metadata - should show:
```json
{
  "metadata": {
    "provider": "alexandria"  // ← Should be "alexandria", not "google-books"
  }
}
```

### Test 3: Verify Logs

```bash
npx wrangler tail
```

Look for:
- ✅ `Alexandria ISBN search for "9780439064873"`
- ✅ `Cache HIT: Alexandria ISBN 9780439064873` (on subsequent calls)
- ❌ Should NOT see: `Alexandria error` or `Google Books fallback`

---

## Architecture Flow (After Setup)

```
bendv3 Worker
  ↓
enrichMultipleBooks() [ISBN lookup]
  ↓
searchAlexandriaByISBN()
  ↓
fetch("https://alexandria.ooheynerds.com/api/isbn?isbn=...")
  + headers:
    - CF-Access-Client-Id: <from secret>
    - CF-Access-Client-Secret: <from secret>
  ↓
Cloudflare Access
  ↓
Check policies (in order):
  1. ✅ Bypass: Service Token = bendv3-to-alexandria
  2. (skipped) Allow: Email domain = ooheynerds.com
  ↓
Alexandria Worker
  ↓
PostgreSQL (Tower, 192.168.1.240:5432)
  ↓
Return book data to bendv3
```

---

## Troubleshooting

### Issue: Still getting 403 Forbidden

**Check:**
1. Service token was created in the correct Cloudflare account
2. Bypass rule is in **position #1** in policies (drag to reorder)
3. Secrets were added correctly: `npx wrangler secret list`
4. Worker was deployed after adding secrets: `npx wrangler deploy`

### Issue: "Service Token not found" error

**Fix:**
- Service token must exist in **Service Auth** before adding to policy
- Recreate token if accidentally deleted

### Issue: Provider still shows "google-books"

**Check:**
1. Alexandria Worker is actually running: `curl https://alexandria.ooheynerds.com/health`
2. ISBN exists in Alexandria database (only 49.3M ISBNs available)
3. Circuit breaker may be open from previous failures (wait 60s and retry)

---

## Rollback Plan

If this causes issues:

1. **Remove bypass rule:**
   - Zero Trust → Access → Applications → alexandria.ooheynerds.com
   - Delete "Allow bendv3 Service Token" policy

2. **Remove secrets:**
```bash
npx wrangler secret delete ALEXANDRIA_CLIENT_ID
npx wrangler secret delete ALEXANDRIA_CLIENT_SECRET
```

3. **Revert code changes:**
```bash
git checkout HEAD -- src/services/alexandria-api.ts
git checkout HEAD -- src/services/external-apis.ts
git checkout HEAD -- src/services/enrichment.ts
git checkout HEAD -- wrangler.jsonc
npx wrangler deploy
```

bendv3 will seamlessly fall back to Google Books/OpenLibrary without Alexandria.

---

## Security Notes

✅ **Service tokens are secure** - only this Worker can use them  
✅ **Scoped to specific application** - only bypasses alexandria.ooheynerds.com  
✅ **Logged in Access audit logs** - all requests tracked  
✅ **Can be rotated** - create new token, update secrets, delete old token  

⚠️ **Never commit secrets to git** - use Wrangler CLI only  
⚠️ **Bypass rule must be first** - or it won't be evaluated  

---

## Success Metrics

After deployment, expect:

- **80%+ ISBN lookups from Alexandria** (instead of Google Books)
- **Sub-100ms latency** for Alexandria hits
- **Zero Google Books API costs** for ISBN lookups
- **49.3M ISBNs available** locally

---

## Related Files

- `/Users/juju/dev_repos/bendv3/src/services/alexandria-api.ts` - API client
- `/Users/juju/dev_repos/bendv3/src/services/enrichment.ts` - Provider orchestration
- `/Users/juju/dev_repos/bendv3/TODO-ALEXANDRIA-INTEGRATION.md` - Integration plan
- `/Users/juju/dev_repos/alex/CLAUDE_CODE.md` - Alexandria Worker docs

---

**Next Steps:**
1. Complete Step 1-3 above (create token, add bypass rule, add secrets)
2. Deploy: `npx wrangler deploy`
3. Test: Check logs and metadata for `provider: "alexandria"`
4. Monitor: Cache hit rates and latency in Analytics

---

**Status**: ✅ Code ready, awaiting Cloudflare Access configuration
