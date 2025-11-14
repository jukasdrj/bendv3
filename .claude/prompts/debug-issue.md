# Backend Debug Prompt

Use this prompt with Zen MCP for debugging complex issues:

```bash
/mcp zen debug
```

## Common Backend Issues

### 1. Rate Limiting Problems
**Symptoms:** 429 errors, users blocked unexpectedly

**Debug steps:**
1. Check Cloudflare Analytics for request volume
2. Review rate limiter configuration in `src/utils/rate-limiter.js`
3. Verify IP extraction (behind Cloudflare proxy)
4. Check if rate limits are too aggressive

```bash
mcp zen debug --issue "Users getting rate limited after 5 requests"
```

### 2. Cache Not Working
**Symptoms:** Slow responses, high external API usage

**Debug steps:**
1. Verify KV namespace binding in `wrangler.toml`
2. Check cache key format (must be consistent)
3. Review TTL configuration
4. Confirm cache reads before API calls

```bash
mcp zen debug --issue "Cache hit rate is 0%, all requests hitting Google Books"
```

### 3. WebSocket Disconnects
**Symptoms:** Progress updates stop, clients lose connection

**Debug steps:**
1. Check Durable Object state persistence
2. Verify WebSocket upgrade headers
3. Review connection timeout settings
4. Check if progress messages are being sent

```bash
mcp zen debug --issue "WebSocket connections drop after 30 seconds"
```

### 4. Enrichment Batch Failures
**Symptoms:** Batch jobs timeout, incomplete results

**Debug steps:**
1. Check batch size (max 100 ISBNs)
2. Verify parallel processing limits
3. Review external API rate limits
4. Check for Promise.all failures without error handling

```bash
mcp zen debug --issue "Batch enrichment fails at 50 ISBNs"
```

### 5. AI Scanning Errors
**Symptoms:** Gemini API errors, low confidence scores

**Debug steps:**
1. Verify image size (max 10MB)
2. Check Gemini API quota
3. Review prompt engineering
4. Test with different image formats

```bash
mcp zen debug --issue "Bookshelf scanning returns low confidence scores"
```

### 6. CORS Errors
**Symptoms:** Browser blocks requests, preflight fails

**Debug steps:**
1. Check allowed origins in CORS config
2. Verify OPTIONS handler for preflight
3. Review response headers
4. Test from multiple origins (web, iOS app)

```bash
mcp zen debug --issue "iOS app getting CORS errors on /v1/search/isbn"
```

## Debug Workflow

### Step 1: Reproduce Locally
```bash
# Start local dev server
npm run dev

# Test endpoint
curl http://localhost:8787/v1/search/isbn?isbn=9780439708180

# Watch logs
npx wrangler tail --remote
```

### Step 2: Check Production Logs
```bash
# Tail production logs
npx wrangler tail --remote --format pretty

# Filter for errors
npx wrangler tail --remote | grep "ERROR"

# Search for specific job ID
npx wrangler tail --remote | grep "job-123"
```

### Step 3: Use Zen MCP Debug
```bash
# Full investigation with multi-model consensus
mcp zen debug \
  --issue "Description of the problem" \
  --files src/handlers/search.js,src/services/book-service.js \
  --thinking-mode high
```

### Step 4: Test Fix
```bash
# Deploy to staging first
npm run deploy-staging

# Run health check
curl https://staging-api.oooefam.net/health

# Test specific endpoint
curl https://staging-api.oooefam.net/v1/search/isbn?isbn=TEST
```

## Models to Use

- **Simple issues:** Haiku (local, fast)
- **Complex debugging:** Gemini 2.5 Pro (best reasoning)
- **Multi-model consensus:** O3 Pro + Grok 4 + Gemini 2.5 Pro

## Cloudflare-Specific Debugging

### Check Worker Metrics
```bash
# View analytics in dashboard
open https://dash.cloudflare.com

# Or use wrangler
npx wrangler metrics
```

### Inspect KV Storage
```bash
# List keys
npx wrangler kv:key list --namespace-id=$KV_NAMESPACE_ID

# Get specific key
npx wrangler kv:key get "book:isbn:9780439708180" --namespace-id=$KV_NAMESPACE_ID

# Delete key (for testing)
npx wrangler kv:key delete "book:isbn:9780439708180" --namespace-id=$KV_NAMESPACE_ID
```

### Test Durable Object
```bash
# Get DO instance ID
curl "https://api.oooefam.net/ws/progress?jobId=test-123" --include

# Check DO logs
npx wrangler tail --remote --format json | jq 'select(.durableObject != null)'
```

## When to Escalate

Use **multi-model consensus** for:
- Security vulnerabilities
- Data corruption issues
- Performance degradation affecting all users
- Mysterious errors with no clear cause

```bash
mcp zen consensus \
  --models "gemini-2.5-pro,o3-pro,grok-4" \
  --prompt "Analyze this production error pattern..."
```
