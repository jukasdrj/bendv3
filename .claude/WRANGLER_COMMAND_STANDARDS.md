# Wrangler Command Standards

**Purpose:** Standardize all `wrangler` command usage across documentation and code.

**Last Updated:** November 14, 2025 (Wrangler v4.37+ with Remote Bindings GA)

---

## 🆕 Breaking Change: Remote Bindings Now GA

As of **Wrangler v4.37.0** (January 2025), remote bindings are now generally available. This fundamentally changes how we use `--remote`:

### Old Way (Deprecated):
```bash
# Old: wrangler dev --remote (connects EVERYTHING to production)
npx wrangler dev --remote  # ❌ Deprecated, don't use
```

### New Way (Recommended):
```toml
# wrangler.toml - Per-binding remote configuration
[kv_namespaces]
binding = "BOOK_CACHE"
id = "abc123"
remote = true  # ✅ This KV connects to production while running locally
```

```bash
# Local dev with selective remote bindings
npx wrangler dev  # ✅ Uses remote bindings from wrangler.toml
```

---

## Core Rules

### 1. Always Use `npx wrangler`
❌ **Wrong:** `wrangler deploy`
✅ **Correct:** `npx wrangler deploy`

**Reason:** Ensures npx wrangler runs from local `node_modules` even if not globally installed.

### 2. Use `--remote` ONLY for Inspection/Monitoring Commands
The `--remote` flag is now **ONLY** for commands that inspect production state, not for `wrangler dev`:

| Command | Use `--remote`? | Example |
|---------|-----------------|---------|
| `tail` | ✅ Yes (production logs) | `npx wrangler tail --remote` |
| `secret list` | ❌ No (defaults to remote) | `npx wrangler secret list` |
| `kv:key` operations | ❌ No (use binding config) | `npx wrangler kv key list --namespace-id=ID` |
| `deployments list` | ❌ No (defaults to remote) | `npx wrangler deployments list` |
| `dev` | ❌ **NEVER** (use `remote: true` in config) | `npx wrangler dev` |
| `deploy` | ❌ No (always targets remote) | `npx wrangler deploy` |
| `rollback` | ❌ No (always targets remote) | `npx wrangler rollback` |

### 3. Remote Bindings Configuration (New Standard)

**Configure per-binding remote access in `wrangler.toml`:**

```toml
# Example: Mix local and remote bindings
[[kv_namespaces]]
binding = "BOOK_CACHE_LOCAL"
id = "local-kv-id"
# remote = false is implicit (local simulation)

[[kv_namespaces]]
binding = "BOOK_CACHE"
id = "prod-kv-id"
remote = true  # ✅ Connects to production KV

[[r2_buckets]]
binding = "COVER_STORAGE"
bucket_name = "prod-covers"
remote = true  # ✅ Connects to production R2

[[d1_databases]]
binding = "DB"
database_id = "prod-db-id"
# Local simulation (no remote flag)
```

**Benefits:**
- Test local code changes against real production data
- Share resources across development team
- Reproduce bugs tied to real data
- No need for `wrangler dev --remote` anymore

---

## Command Reference

### Deployment

```bash
# Deploy to production
npx wrangler deploy

# Deploy to staging (via environment)
npx wrangler deploy --env staging

# Rollback deployment
npx wrangler rollback

# List deployments (production)
npx wrangler deployments list
```

### Log Streaming

```bash
# Stream production logs (use --remote for tail)
npx wrangler tail --remote

# Pretty format
npx wrangler tail --remote --format=pretty

# JSON format with filtering
npx wrangler tail --remote --format=json | jq 'select(.level == "error")'

# Search specific pattern
npx wrangler tail --remote --format=json | jq 'select(.message | contains("ISBN"))'
```

### Secrets Management

```bash
# List production secrets (no --remote needed, defaults to remote)
npx wrangler secret list

# Add/update secret
npx wrangler secret put GOOGLE_BOOKS_API_KEY

# Delete secret
npx wrangler secret delete OLD_API_KEY
```

### KV Storage

**⚠️ Important:** KV access now uses binding configuration, not `--remote` flag.

```bash
# List KV keys (no --remote, specify namespace directly)
npx wrangler kv key list --namespace-id=<NAMESPACE_ID>

# Get specific key
npx wrangler kv key get "book:isbn:9780439708180" --namespace-id=<NAMESPACE_ID>

# Get with metadata
npx wrangler kv key get "book:isbn:9780439708180" --namespace-id=<NAMESPACE_ID> --metadata

# Delete key
npx wrangler kv key delete "book:isbn:9780439708180" --namespace-id=<NAMESPACE_ID>

# Put key (for testing)
npx wrangler kv key put "test:key" "test value" --namespace-id=<NAMESPACE_ID>
```

**For local dev with production KV**, use `remote: true` in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "BOOK_CACHE"
id = "your-kv-id"
remote = true  # Access production KV from local dev
```

### Analytics

```bash
# Query analytics (no --remote needed)
npx wrangler query-analytics \
  --metric "requests" \
  --start-date 2025-11-01 \
  --end-date 2025-11-14
```

### Local Development

```bash
# Local dev server (uses remote bindings from wrangler.toml)
npx wrangler dev

# ❌ DEPRECATED: Don't use --remote flag anymore
# npx wrangler dev --remote  # OLD WAY, DON'T USE

# ✅ NEW WAY: Configure remote bindings in wrangler.toml instead
```

---

## Common Mistakes

### ❌ Missing `npx`
```bash
# Wrong - may fail if wrangler not globally installed
npx wrangler tail --remote
```

```bash
# Correct
npx wrangler tail --remote
```

### ❌ Using Old `--remote` Syntax for KV/Secrets
```bash
# ❌ OLD WAY (Wrangler < v4.37)
npx wrangler kv key list --remote --namespace-id=abc123
npx wrangler secret list
```

```bash
# ✅ NEW WAY (Wrangler v4.37+)
npx wrangler kv key list --namespace-id=abc123
npx wrangler secret list
```

### ❌ Using `wrangler dev --remote`
```bash
# ❌ DEPRECATED - Don't use --remote with dev
npx wrangler dev --remote
```

```bash
# ✅ CORRECT - Configure remote bindings in wrangler.toml
npx wrangler dev

# In wrangler.toml:
# [[kv_namespaces]]
# binding = "BOOK_CACHE"
# id = "abc123"
# remote = true
```

### ❌ Forgetting `--remote` for tail
```bash
# ❌ Wrong - tail still needs --remote for production logs
npx wrangler tail --remote
```

```bash
# ✅ Correct - tail is the exception
npx wrangler tail --remote
```

---

## Environment-Specific Commands

### Production
```bash
# Default environment (production)
npx wrangler tail --remote
npx wrangler deploy
```

### Staging
```bash
# Use --env flag for staging
npx wrangler tail --remote --env staging
npx wrangler deploy --env staging
```

---

## Quick Reference Table (Wrangler v4.37+)

| Operation | Command | Notes |
|-----------|---------|-------|
| **Deploy** | `npx wrangler deploy` | Always remote |
| **Rollback** | `npx wrangler rollback` | Always remote |
| **Stream logs** | `npx wrangler tail --remote` | ✅ Only command needing --remote |
| **List deployments** | `npx wrangler deployments list` | ❌ No --remote needed |
| **List secrets** | `npx wrangler secret list` | ❌ No --remote (defaults to remote) |
| **Add secret** | `npx wrangler secret put KEY` | Always remote |
| **List KV keys** | `npx wrangler kv key list --namespace-id=ID` | ❌ No --remote needed |
| **Get KV value** | `npx wrangler kv key get "key" --namespace-id=ID` | ❌ No --remote needed |
| **Query analytics** | `npx wrangler query-analytics` | ❌ No  needed |
| **Local dev** | `npx wrangler dev` | ❌ **NEVER** use --remote (use config) |
| **Local dev + prod KV** | `npx wrangler dev` | Use `remote: true` in wrangler.toml |

---

## Why `--remote` Behavior Changed

### Before Wrangler v4.37:
```bash
$ npx wrangler tail --remote
Error: No wrangler.toml file found in the current directory.

$ npx wrangler tail --remote  # ✅ Worked
✓ Connected to production worker
```

**Old behavior:** `--remote` was needed for many commands to access production.

### After Wrangler v4.37 (Current):
```bash
$ npx wrangler tail --remote  # ✅ Still needed for tail
✓ Connected to production worker

$ npx wrangler secret list  # ✅ No --remote needed anymore
Name: GOOGLE_BOOKS_API_KEY

$ npx wrangler dev  # ✅ Access production KV via config
# With remote: true in wrangler.toml, connects to production KV
```

**New behavior:**
- `tail` is the **only command** still requiring `--remote`
- Other commands default to remote or use config-based remote bindings
- `wrangler dev --remote` is **deprecated** in favor of per-binding `remote: true`

---

## Documentation Audit Checklist (Wrangler v4.37+)

When writing documentation, ensure:
- [ ] All `wrangler` commands use `npx wrangler`
- [ ] `tail` commands use `--remote` (**only command that needs it**)
- [ ] `secret list` does **NOT** use `--remote`
- [ ] KV operations do **NOT** use `--remote`
- [ ] `deployments list` does **NOT** use `--remote`
- [ ] `deploy`, `rollback`, `publish` do **NOT** use `--remote`
- [ ] `wrangler dev` **NEVER** uses `--remote` flag
- [ ] Remote KV access uses `remote: true` in `wrangler.toml`
- [ ] Code examples are consistent with v4.37+ syntax
- [ ] Hook scripts use correct syntax

---

## Code Example Standards

### Shell Scripts
```bash
#!/bin/bash

# Good: Check for deployment
if [[ "$TOOL_PATH" =~ "wrangler deploy" ]]; then
  echo "Deploying to production..."
fi

# Good: Stream logs
npx wrangler tail --remote | grep "ERROR"
```

### Hooks
```bash
# .claude/hooks/post-tool-use.sh

# Good: Detect wrangler commands
if [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_PATH" | grep -qE "wrangler (deploy|publish)"; then
  INVOKE_AGENT="cf-ops-monitor"
fi
```

### Documentation Examples
````markdown
### Stream Production Logs
```bash
# View all logs in real-time
npx wrangler tail --remote --format=pretty

# Filter for errors only
npx wrangler tail --remote --format=json | jq 'select(.level == "error")'
```
````

---

## Migration Guide (v4.37+ Update)

### Bulk Find & Replace

**Step 1: Add npx prefix**
```bash
# Find all wrangler commands without npx
Find: "wrangler "
Replace: "npx wrangler "
```

**Step 2: Update --remote usage**
```bash
# Remove --remote from secret list
Find: "npx wrangler secret list"
Replace: "npx wrangler secret list"

# Remove --remote from KV commands
Find: "npx wrangler kv key list --remote"
Replace: "npx wrangler kv key list"

Find: "npx wrangler kv key get --remote"
Replace: "npx wrangler kv key get"

# Remove --remote from deployments
Find: "npx wrangler deployments list"
Replace: "npx wrangler deployments list"

# Keep --remote ONLY for tail
Find: "npx wrangler tail --remote\n"  # Without --remote
Replace: "npx wrangler tail --remote\n"
```

**Step 3: Update npx wrangler dev**
```bash
# Deprecate wrangler dev --remote
Find: "npx wrangler dev --remote"
Replace: "npx wrangler dev  # Configure remote: true in wrangler.toml"
```

### Files to Update

**Priority 1 (User-Facing):**
- `README.md`
- `QUICK_START.md`
- `docs/deployment/DEPLOYMENT.md`
- `docs/deployment/SECRETS_SETUP.md`

**Priority 2 (Developer Docs):**
- `.claude/CLAUDE.md`
- `.claude/skills/cf-ops-monitor/skill.md`
- `.claude/prompts/debug-issue.md`
- `.claude/hooks/AUTO_INVOKE_GUIDE.md`

**Priority 3 (Historical/Archives):**
- `docs/archives/*.md`
- `docs/plans/*.md`

---

## Testing Commands

### Verify Production Access
```bash
# Should show production logs
npx wrangler tail --remote

# Should list production secrets
npx wrangler secret list

# Should show production KV data
npx wrangler kv:key list --remote --namespace-id=<NAMESPACE_ID>
```

### Verify Deployment
```bash
# Deploy and verify
npx wrangler deploy

# Check deployment succeeded
npx wrangler deployments list

# Monitor health
npx wrangler tail --remote | grep "health"
```

---

**Last Updated:** November 14, 2025
**Maintained By:** AI Team
**Status:** Standard for all new documentation
