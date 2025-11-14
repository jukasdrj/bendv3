# Deployment Fix: Secrets Store Permission

**Issue:** Deployment failing with error code 10021 - Secrets Store authorization error

**Error Message:**
```
failed to fetch secrets store binding due to authorization error - check deploy permissions and secret scopes [code: 10021]
```

---

## Root Cause

Your `wrangler.toml` uses Cloudflare Secrets Store bindings:

```toml
[[unsafe.bindings]]
type = "secret_store"
id = "b0562ac16fde468c8af12717a6c88400"
```

The Cloudflare API token doesn't have permission to access these bindings during deployment.

---

## Quick Fix (5 minutes)

### Option 1: Add Secrets Store Permission to Token (Recommended)

1. **Go to Cloudflare Dashboard:**
   - https://dash.cloudflare.com/profile/api-tokens

2. **Find your API token:**
   - Look for the token you created (probably named "Edit Cloudflare Workers")
   - Click **"Edit"** (pencil icon)

3. **Add permission:**
   - Scroll down to **"Account Permissions"**
   - Click **"+ Add more"**
   - Find **"Workers Secrets"** → Set to **"Edit"**
   - Click **"Continue to summary"**
   - Click **"Update Token"**

4. **Update GitHub secret:**
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
   ```
   - Paste the **SAME token** (you don't need to regenerate it)
   - Press Enter

5. **Retry deployment:**
   ```bash
   gh workflow run deploy-production.yml --repo jukasdrj/bookstrack-backend
   ```

6. **Watch deployment:**
   ```bash
   gh run watch --repo jukasdrj/bookstrack-backend
   ```

---

### Option 2: Use Standard Secrets (Alternative)

If you don't want to use Secrets Store, you can convert to standard Wrangler secrets:

1. **Remove Secrets Store from wrangler.toml:**
   ```bash
   # Backup first
   cp wrangler.toml wrangler.toml.backup

   # Remove the [[unsafe.bindings]] section for secret_store
   # Keep other bindings (KV, Durable Objects, etc.)
   ```

2. **Set secrets via wrangler:**
   ```bash
   npx wrangler secret put GOOGLE_BOOKS_API_KEY
   # Paste your key when prompted

   npx wrangler secret put GEMINI_API_KEY
   # Paste your key when prompted

   npx wrangler secret put ISBNDB_API_KEY
   # Paste your key when prompted
   ```

3. **Update deployment workflow:**
   No changes needed - npx wrangler secrets work automatically

4. **Retry deployment:**
   ```bash
   gh workflow run deploy-production.yml --repo jukasdrj/bookstrack-backend
   ```

**Note:** This approach is simpler but you lose the centralized Secrets Store management.

---

## Verify Fix

After deployment succeeds:

1. **Check health endpoint:**
   ```bash
   curl https://api.oooefam.net/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "version": "1.0.0",
     "timestamp": "2025-11-13T15:30:00Z"
   }
   ```

2. **Test search endpoint:**
   ```bash
   curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439708180"
   ```

   Should return book data for Harry Potter.

3. **Check iOS app:**
   ```bash
   cd ~/Downloads/xcode/books-tracker-v1
   /sim
   ```
   - Test search
   - Test barcode scanner
   - Test AI bookshelf scan

---

## Why This Happened

### Secrets Store vs. Standard Secrets

**Secrets Store (current):**
- ✅ Centralized secret management across multiple workers
- ✅ Scoped secrets with fine-grained access
- ❌ Requires additional API token permissions
- ❌ More complex setup

**Standard Wrangler Secrets:**
- ✅ Simple to set up
- ✅ Works with basic API token
- ❌ Secrets tied to individual worker
- ❌ No centralized management

Your `wrangler.toml` is using Secrets Store (the `[[unsafe.bindings]]` section), which requires the API token to have `Workers Secrets: Edit` permission.

---

## Recommended Approach

**Use Option 1 (Add Secrets Store Permission)**

Why:
- Your infrastructure is already set up for Secrets Store
- Better for managing secrets across multiple projects
- More secure with scoped access

Only use Option 2 if:
- You're having trouble with token permissions
- You don't need centralized secret management
- You want simpler deployment

---

## Prevention

### For Future API Tokens

When creating Cloudflare API tokens for Workers deployment, always include:

**Required Permissions:**
- `Account > Workers Scripts > Edit`
- `Account > Workers KV Storage > Edit`
- `Account > Workers Secrets > Edit` ← Often missed!
- `Zone > Workers Routes > Edit`

**Cloudflare provides templates:**
- Use **"Edit Cloudflare Workers"** template
- Manually add **"Workers Secrets: Edit"** if not included

---

## Troubleshooting

### Token Update Doesn't Work

**Regenerate token:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **"Roll"** (rotate) on your token
3. Copy the new token
4. Update GitHub secret:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
   ```

### Still Getting Authorization Error

**Check token permissions:**
```bash
# Test token locally
export CLOUDFLARE_API_TOKEN="your-token"
npx wrangler whoami

# Should show your account info
# If error, token is invalid
```

**Check account ID:**
```bash
gh secret list --repo jukasdrj/bookstrack-backend | grep ACCOUNT_ID
```

Verify it matches: `d03bed0be6d976acd8a1707b55052f79`

### Deployment Succeeds But API Returns 500

**Check secret values:**
The secrets might be set incorrectly. Test them:

```bash
# Google Books
curl "https://www.googleapis.com/books/v1/volumes?q=gatsby&key=YOUR_KEY"

# Should return book data, not error
```

**Re-set secrets:**
```bash
npx wrangler secret put GOOGLE_BOOKS_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ISBNDB_API_KEY
```

---

## Summary

**Quick Fix:** Add `Workers Secrets: Edit` permission to your Cloudflare API token

**Steps:**
1. Edit token at https://dash.cloudflare.com/profile/api-tokens
2. Add `Workers Secrets: Edit` permission
3. Update GitHub secret (same token value)
4. Retry deployment

**Time:** 5 minutes
**Difficulty:** Easy

---

**After fixing, deployment should succeed and your backend will be live at `https://api.oooefam.net`**

Let me know if you hit any other issues!
