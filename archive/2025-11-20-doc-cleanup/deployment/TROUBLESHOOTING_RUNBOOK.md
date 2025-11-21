# Troubleshooting Runbook for BooksTrack API

**Purpose:** Diagnostic procedures and solutions for common production issues  
**Audience:** On-Call Engineers, DevOps Team  
**Updated:** November 15, 2025

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [High 4xx Errors](#high-4xx-errors)
3. [High 5xx Errors](#high-5xx-errors)
4. [Extreme Latency](#extreme-latency)
5. [WebSocket Disconnections](#websocket-disconnections)
6. [Cache Miss Storm](#cache-miss-storm)
7. [External API Failures](#external-api-failures)
8. [Durable Object Issues](#durable-object-issues)
9. [Diagnostic Commands](#diagnostic-commands)

---

## Quick Reference

| Issue | Most Likely Cause | Quick Fix | Doc Section |
|-------|-------------------|-----------|-------------|
| High 4xx errors | API v2 migration issues | Check error codes | [#high-4xx-errors](#high-4xx-errors) |
| High 5xx errors | External API failures | Check provider status | [#high-5xx-errors](#high-5xx-errors) |
| Extreme latency | Cache miss storm | Warm cache | [#extreme-latency](#extreme-latency) |
| WS disconnections | DO migration issues | Check DO status | [#websocket-disconnections](#websocket-disconnections) |
| Cache failures | KV/R2 unavailable | Check bindings | [#cache-miss-storm](#cache-miss-storm) |

---

## High 4xx Errors

### Symptoms

- Error rate >10%, mostly 4xx status codes
- `X-Error-Code` headers show client errors
- Started after API v2.0 migration

### Root Cause

Clients using **old API v1 format** after v2.0 deployment.

### Diagnosis

```bash
# Check error distribution
wrangler tail --remote --format pretty --status error | grep -o "X-Error-Code: [A-Z_]*" | sort | uniq -c

# Common v2 migration errors:
#   50 X-Error-Code: INVALID_REQUEST
#   30 X-Error-Code: INVALID_ISBN
#   20 X-Error-Code: MISSING_PARAM
```

**If you see:**
- `INVALID_REQUEST` → Client sending old format
- `UNAUTHORIZED` → Client using expired tokens
- `MISSING_PARAM` → Client not sending required v2 fields

### Solution

#### Immediate Mitigation

**Option 1: Extend v1 compatibility (if available)**

If v1 compatibility layer exists:
```bash
# Enable v1 fallback via environment variable
wrangler secret put ENABLE_V1_COMPAT
# Enter: true

# Redeploy
wrangler deploy
```

**Option 2: Communicate with clients**

```markdown
# Slack #bookstrack-api-support
@channel We're seeing high 4xx errors from v1 API clients.

**Action Required:**
- iOS: Update to v2 response parser (see docs/WEBSOCKET_MIGRATION_IOS.md)
- Flutter: Update to v2 response parser
- Test against staging: https://staging-api.oooefam.net

**Deadline:** Immediate (production v1 disabled)
```

#### Long-term Fix

1. **Improve error messages**
   - Add helpful hints in 400 responses
   - Link to migration guide
   
   ```javascript
   // In error responses
   {
     "error": {
       "code": "INVALID_REQUEST",
       "message": "Invalid request format. Are you using API v1? Please migrate to v2.",
       "migrationGuide": "https://docs.oooefam.net/API_V2_MIGRATION_NOTICE.md"
     }
   }
   ```

2. **Add metrics by client version**
   - Track user-agent or client version
   - Identify which clients need updates

---

## High 5xx Errors

### Symptoms

- Error rate >5%, mostly 5xx status codes
- `X-Error-Code` headers show server errors
- Worker logs show exceptions or timeouts

### Root Cause

**Most Common:**
1. External API failures (Google Books, ISBNdb, Gemini)
2. Secrets expired or invalid
3. Worker exception not caught
4. KV/R2 unavailable

### Diagnosis

```bash
# Stream logs to identify error source
wrangler tail --remote --format pretty --status error

# Look for patterns:
# - "Google Books API timeout" → External API issue
# - "GEMINI_API_KEY not found" → Secrets issue
# - "TypeError: Cannot read" → Code exception
# - "KV namespace not found" → Binding issue
```

### Solution by Root Cause

#### Case 1: External API Failures

**Symptoms:**
```
Error: Google Books API returned 503
Error: ISBNdb request timeout after 5000ms
Error: Gemini API rate limit exceeded
```

**Solution:**
```bash
# Check external API status
curl -I https://www.googleapis.com/books/v1/volumes?q=test
curl -I https://api2.isbndb.com/books/9780743273565

# If down, enable fallback providers
# (automatic if circuit breaker implemented)

# Monitor recovery
wrangler tail --remote --format pretty | grep -i "provider"
```

**Long-term Fix:**
- Implement circuit breaker pattern
- Add provider fallback chain: Google Books → OpenLibrary → ISBNdb → Cache
- Increase provider timeout tolerances

---

#### Case 2: Secrets Expired or Invalid

**Symptoms:**
```
Error: GOOGLE_BOOKS_API_KEY is undefined
Error: GEMINI_API_KEY authentication failed
Error: ISBNdb returned 401 Unauthorized
```

**Solution:**
```bash
# List current secrets
wrangler secret list

# Check which secret is missing
# GOOGLE_BOOKS_API_KEY ✅
# ISBNDB_API_KEY ✅
# GEMINI_API_KEY ❌ (missing!)

# Add missing secret
wrangler secret put GEMINI_API_KEY
# Enter new API key

# Verify deployment
curl https://api.oooefam.net/health
```

**Prevention:**
- Set up secret expiration monitoring
- Rotate secrets before expiration
- Use Cloudflare Secrets Store with auto-rotation

---

#### Case 3: Worker Exception Not Caught

**Symptoms:**
```
TypeError: Cannot read property 'title' of undefined
ReferenceError: bookData is not defined
```

**Solution:**
```bash
# Identify failing endpoint from logs
wrangler tail --remote --format pretty | grep "TypeError"

# Example: /v1/search/title causing errors

# Quick fix: Add defensive null checks
# Long-term: Add comprehensive tests

# Deploy fix
git checkout -b hotfix/null-check-title-search
# Add null checks
git commit -m "Hotfix: Add null checks to title search"
git push origin hotfix/null-check-title-search
# Merge and deploy
```

**Prevention:**
- Add unit tests for null/undefined cases
- Use TypeScript for type safety
- Add integration tests

---

#### Case 4: KV/R2 Unavailable

**Symptoms:**
```
Error: KV namespace 'CACHE' not found
Error: R2 bucket 'API_CACHE_COLD' inaccessible
```

**Solution:**
```bash
# Verify KV binding
wrangler kv:namespace list

# Verify KV namespace ID matches wrangler.toml
cat wrangler.toml | grep -A 2 "kv_namespaces"

# If mismatch, update wrangler.toml and redeploy
wrangler deploy

# Verify R2 binding
wrangler r2 bucket list

# Check if bucket exists
wrangler r2 bucket get personal-library-data
```

**Prevention:**
- Validate bindings in CI/CD
- Add health check for KV/R2 accessibility
- Use remote bindings for local testing

---

## Extreme Latency

### Symptoms

- P95 response time >2 seconds
- Slow endpoint responses
- Cache hit rate abnormally low

### Root Cause

1. **Cache miss storm** - Cache evicted, all requests hit external APIs
2. **External API slowdown** - Provider experiencing high latency
3. **Durable Object contention** - Too many concurrent DO operations
4. **Cold starts** - Worker not warmed up

### Diagnosis

```bash
# Check response times
wrangler tail --remote --format pretty | grep "X-Response-Time"

# Check cache hit rate
wrangler analytics query \
  --dataset books_api_performance \
  --query "SELECT blob3 as cache_status, COUNT(*) as count FROM books_api_performance WHERE timestamp > NOW() - INTERVAL 10 MINUTE GROUP BY blob3"

# Expected:
# HIT: 7000 (70%)
# MISS: 3000 (30%)

# If actual:
# HIT: 1000 (10%)  ← CACHE MISS STORM!
# MISS: 9000 (90%)
```

### Solution by Root Cause

#### Case 1: Cache Miss Storm

**Cause:** KV cache evicted or expired

**Solution:**
```bash
# Manually warm cache for popular books
curl -X POST https://api.oooefam.net/admin/cache/warm \
  -H "X-Cache-Warm-Secret: $CACHE_WARM_SECRET" \
  -d '{
    "isbns": [
      "9780743273565",  # Great Gatsby
      "9780439708180",  # Harry Potter
      "9780061120084"   # To Kill a Mockingbird
    ]
  }'

# Enable aggressive caching
# (if AGGRESSIVE_CACHING already true in wrangler.toml)

# Monitor cache recovery
watch -n 5 'curl https://api.oooefam.net/admin/cache-metrics'
```

**Long-term Fix:**
- Increase cache TTL
- Schedule periodic cache warming (cron job)
- Use R2 for cold storage (longer retention)

---

#### Case 2: External API Slowdown

**Diagnosis:**
```bash
# Check provider analytics
wrangler analytics query \
  --dataset books_api_provider_performance \
  --query "SELECT blob1 as provider, AVG(double2) as avg_latency FROM books_api_provider_performance GROUP BY provider"

# Expected:
# google_books: 200ms
# isbndb: 300ms

# If actual:
# google_books: 2500ms  ← SLOW!
# isbndb: 300ms
```

**Solution:**
```bash
# Switch provider priority
# Edit src/providers/provider-chain.js
# Change priority: isbndb → google_books → openlibrary

# Or enable circuit breaker
# (automatic if implemented)

# Monitor provider recovery
wrangler tail --remote --format pretty | grep "provider_latency"
```

---

#### Case 3: Durable Object Contention

**Symptoms:**
```
WebSocket latency high
Progress updates delayed
DO alarm queue depth >100
```

**Solution:**
```bash
# Check DO status
# Cloudflare Dashboard → Durable Objects → ProgressWebSocketDO

# Check alarm queue depth
wrangler tail --remote | grep "DO alarm queue"

# If contention, increase DO concurrency
# (Contact Cloudflare Support for DO tuning)

# Temporary mitigation: Rate limit WebSocket connections
```

---

## WebSocket Disconnections

### Symptoms

- WebSocket connection failures >10%
- 401 Unauthorized errors on WS upgrade
- Clients unable to receive progress updates

### Root Cause

1. **Invalid authentication tokens** - Tokens expired or incorrect
2. **Durable Object migration issues** - DO not initialized
3. **Network timeouts** - Keep-alive pings not working
4. **Token expiration** - Tokens not refreshed for long jobs

### Diagnosis

```bash
# Check WebSocket error rate
wrangler tail --remote --format pretty | grep "/ws/progress" | grep -c "401"

# Check DO logs
wrangler tail --remote | grep "ProgressDO"

# Common errors:
# "WebSocket authentication failed - invalid token"
# "WebSocket authentication failed - token expired"
# "Durable Object not found"
```

### Solution by Root Cause

#### Case 1: Invalid Authentication Tokens

**Solution:**
```bash
# Verify token flow:
# 1. Client requests job → Server returns jobId + token
# 2. Client connects WS with jobId + token
# 3. Server validates token against DO storage

# If tokens not matching, check:
wrangler tail --remote | grep "Auth token set"
wrangler tail --remote | grep "WebSocket authentication"

# Ensure client uses exact token from job creation response
```

**Client-side fix:**
```swift
// iOS: Ensure token is passed correctly
let wsURL = "wss://api.oooefam.net/ws/progress?jobId=\(jobId)&token=\(token)"
// NOT: "wss://...?jobId=\(jobId)" (missing token)
```

---

#### Case 2: Durable Object Migration Issues

**Solution:**
```bash
# Check DO migration status
wrangler deployments list

# Verify DO bindings in wrangler.toml
cat wrangler.toml | grep -A 5 "durable_objects"

# If migration pending, force migration
wrangler deploy --force

# Monitor DO initialization
wrangler tail --remote | grep "ProgressDO.*initialized"
```

---

#### Case 3: Token Expiration (Long Jobs)

**Solution:**
```bash
# Tokens expire after 2 hours
# For jobs >90 minutes, client must refresh token

# Check if token refresh endpoint works
curl -X POST https://api.oooefam.net/api/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"jobId": "test", "oldToken": "old-token-here"}'

# Expected: {"token": "new-token", "expiresIn": 7200}
```

**Client-side fix:**
```swift
// iOS: Implement token refresh timer
Timer.scheduledTimer(withTimeInterval: 90 * 60, repeats: true) { _ in
    refreshToken(jobId: jobId, oldToken: token) { newToken in
        // Reconnect WebSocket with new token
    }
}
```

---

## Cache Miss Storm

### Symptoms

- Cache hit rate drops from 70% → <30%
- Latency spikes
- External API rate limits hit
- High provider costs

### Root Cause

1. **Cache eviction** - KV storage full or TTL expired
2. **Cache key changes** - Code change invalidated cache keys
3. **KV unavailable** - Cloudflare KV outage
4. **Deployment cleared cache** - Cache not persistent across deploys

### Diagnosis

```bash
# Check cache hit rate trend
wrangler analytics query \
  --dataset books_api_performance \
  --query "SELECT DATE(timestamp) as date, (SUM(CASE WHEN blob3 = 'HIT' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as hit_rate FROM books_api_performance GROUP BY date ORDER BY date DESC LIMIT 7"

# Expected (7 days):
# 2025-11-15: 72%
# 2025-11-14: 70%
# 2025-11-13: 15%  ← CACHE CLEARED!

# Check KV storage usage
wrangler kv:namespace list

# Check KV keys count
wrangler kv:key list --namespace-id=b9cade63b6db48fd80c109a013f38fdb | wc -l
```

### Solution

```bash
# Warm cache manually
curl -X POST https://api.oooefam.net/admin/cache/warm \
  -H "X-Cache-Warm-Secret: $SECRET"

# Or trigger cache warming queue
wrangler queue send author-warming-queue \
  '{"authors": ["J.K. Rowling", "Stephen King"]}'

# Monitor cache recovery
watch -n 30 'wrangler analytics query --dataset books_api_performance --query "SELECT (SUM(CASE WHEN blob3 = \"HIT\" THEN 1 ELSE 0 END) / COUNT(*)) * 100 FROM books_api_performance WHERE timestamp > NOW() - INTERVAL 5 MINUTE"'
```

**Prevention:**
- Increase KV cache TTL
- Use R2 for cold storage (persistent)
- Schedule periodic cache warming
- Monitor cache hit rate alerting

---

## External API Failures

### Symptoms

- Errors: "Provider timeout", "Provider 5xx error"
- Specific provider failing (Google Books, ISBNdb, Gemini)
- Fallback providers working

### Diagnosis

```bash
# Check provider status
curl -I https://www.googleapis.com/books/v1/volumes?q=test
curl -I https://api2.isbndb.com/books/9780743273565

# Check provider error rate
wrangler tail --remote | grep -o "provider: [a-z_]*" | sort | uniq -c

# Expected (distributed):
# 500 provider: google_books
# 300 provider: openlibrary
# 200 provider: isbndb

# Actual (Google Books down):
# 0 provider: google_books  ← PROVIDER DOWN!
# 800 provider: openlibrary
# 200 provider: isbndb
```

### Solution

**Automatic Fallback (if implemented):**
```javascript
// src/providers/provider-chain.js already implements fallback
// Order: Google Books → OpenLibrary → ISBNdb → Cache
// No action needed if circuit breaker working
```

**Manual Fallback:**
```bash
# Temporarily prioritize working providers
# Edit src/providers/provider-chain.js
# Change order: OpenLibrary → ISBNdb → Google Books

# Redeploy
wrangler deploy
```

**Monitor Recovery:**
```bash
# Check provider status periodically
watch -n 60 'curl -I https://www.googleapis.com/books/v1/volumes?q=test'

# Re-enable primary provider when recovered
```

---

## Durable Object Issues

### Symptoms

- WebSocket connections fail
- DO alarms not executing
- DO storage errors

### Diagnosis

```bash
# Check DO status in Cloudflare Dashboard
# Navigate to: Dashboard → Durable Objects → ProgressWebSocketDO

# Check DO logs
wrangler tail --remote | grep "ProgressDO\|RateLimiterDO"

# Common errors:
# "DO storage.get() failed"
# "DO alarm execution timeout"
# "DO instance restarted unexpectedly"
```

### Solution

```bash
# Force DO re-initialization
wrangler deploy --force

# Check DO migration status
wrangler deployments list

# If DO migrations stuck, contact Cloudflare Support
```

---

## Diagnostic Commands

### Essential Commands

```bash
# 1. Stream real-time logs
wrangler tail --remote --format pretty

# 2. Filter error logs only
wrangler tail --remote --format pretty --status error

# 3. Check deployments
wrangler deployments list

# 4. Check health
curl https://api.oooefam.net/health

# 5. Check secrets
wrangler secret list

# 6. Check KV namespaces
wrangler kv:namespace list

# 7. Check R2 buckets
wrangler r2 bucket list

# 8. Query analytics
wrangler analytics query --dataset books_api_performance --query "SELECT COUNT(*) FROM books_api_performance WHERE timestamp > NOW() - INTERVAL 1 HOUR"
```

### Advanced Diagnostics

```bash
# Check specific endpoint error rate
wrangler tail --remote | grep "/v1/search/title" | grep -c "error"

# Check cache effectiveness
wrangler tail --remote | grep -o "X-Cache-Status: [A-Z]*" | sort | uniq -c

# Check response time distribution
wrangler tail --remote | grep -o "X-Response-Time: [0-9]*ms" | sed 's/X-Response-Time: //;s/ms//' | sort -n | tail -20

# Check provider distribution
wrangler tail --remote | grep -o "provider: [a-z_]*" | sort | uniq -c
```

---

## Escalation Contacts

If issue persists after troubleshooting:

| Issue Type | Contact | Channel |
|------------|---------|---------|
| **Critical Production Outage** | On-Call Engineer | PagerDuty |
| **Platform Issue (CF)** | Cloudflare Support | Dashboard Ticket |
| **Code/Logic Issue** | Engineering Lead | Slack #engineering |
| **External API Issue** | Provider Support | Email/Dashboard |

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2025  
**Maintainer:** DevOps Team
