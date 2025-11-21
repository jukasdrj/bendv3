# Deployment Guide

Complete guide for deploying BooksTrack backend to Cloudflare Workers.

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Cloudflare account with Workers enabled
- GitHub CLI (`gh`) installed (for CI/CD setup)
- Node.js 20+ installed

## Initial Setup

### 1. Configure Secrets

See [SECRETS_SETUP.md](SECRETS_SETUP.md) for detailed instructions on configuring GitHub repository secrets.

**Quick Setup:**
```bash
# Get account ID
cd /tmp/bookstrack-backend
npx wrangler whoami

# Set GitHub secrets
gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
gh secret set CLOUDFLARE_ACCOUNT_ID --repo jukasdrj/bookstrack-backend
gh secret set GOOGLE_BOOKS_API_KEY --repo jukasdrj/bookstrack-backend
gh secret set GEMINI_API_KEY --repo jukasdrj/bookstrack-backend
gh secret set ISBNDB_API_KEY --repo jukasdrj/bookstrack-backend
```

### 2. Verify Configuration

```bash
cd /tmp/bookstrack-backend
npm install
npx wrangler dev  # Test locally
```

## Deployment Methods

### Automated Deployment (Recommended)

**Production (main branch):**
```bash
git push origin main
# GitHub Actions automatically deploys to api.oooefam.net
```

**Staging (manual trigger):**
```bash
gh workflow run deploy-staging.yml --repo jukasdrj/bookstrack-backend
```

### Manual Deployment

**Production:**
```bash
cd /tmp/bookstrack-backend
npx wrangler deploy
```

**Staging:**
```bash
cd /tmp/bookstrack-backend
npx wrangler deploy --env staging
```

### Emergency Rollback

If a deployment causes issues:

1. **Revert to Previous Version:**
```bash
git revert HEAD
git push origin main  # Triggers auto-deployment
```

2. **Manual Rollback:**
```bash
# Find previous deployment
npx wrangler deployments list

# Rollback to specific deployment
npx wrangler rollback --message "Rolling back to previous stable version"
```

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://api.oooefam.net/health
```

Expected response:
```json
{
  "status": "ok",
  "worker": "api-worker",
  "version": "1.0.0",
  "endpoints": ["/search/title", "/search/isbn", ...]
}
```

### 2. Search Endpoint Test

```bash
# Title search
curl "https://api.oooefam.net/v1/search/title?q=hamlet"

# ISBN search
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780743273565"
```

### 3. WebSocket Test

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket
wscat -c "wss://api.oooefam.net/ws/progress?jobId=test-123"
```

### 4. Monitor Logs

```bash
npx wrangler tail --remote --format pretty
```

## Custom Domain Setup

The backend is configured to use custom domains on `oooefam.net`.

### DNS Configuration

**Required DNS Records:**

1. **API Endpoint:**
   - Type: `CNAME`
   - Name: `api`
   - Target: `api-worker.jukasdrj.workers.dev`
   - Proxy status: Proxied (orange cloud)

2. **Harvest Dashboard:**
   - Type: `CNAME`
   - Name: `harvest`
   - Target: `api-worker.jukasdrj.workers.dev`
   - Proxy status: Proxied (orange cloud)

### Verify Custom Domains

```bash
# API endpoint
curl https://api.oooefam.net/health

# Harvest dashboard
open https://harvest.oooefam.net
```

## CI/CD Workflows

### Production Deployment (`deploy-production.yml`)

**Triggers:**
- Push to `main` branch
- Manual dispatch via GitHub Actions UI

**Steps:**
1. Checkout code
2. Install Node.js dependencies
3. Deploy via Wrangler
4. Run health check
5. Notify on success/failure

**Monitor:**
```bash
gh run list --workflow=deploy-production.yml --repo jukasdrj/bookstrack-backend
```

### Staging Deployment (`deploy-staging.yml`)

**Triggers:**
- Manual dispatch only

**Usage:**
```bash
gh workflow run deploy-staging.yml --repo jukasdrj/bookstrack-backend
```

### Cache Warming (`cache-warming.yml`)

**Triggers:**
- Cron: Daily at 2 AM UTC
- Manual dispatch

**Purpose:**
- Pre-caches popular book ISBNs
- Improves cache hit rate for frequent searches

## Monitoring & Observability

### Real-Time Logs

```bash
# Stream all logs
npx wrangler tail --remote --format pretty

# Filter by search term
npx wrangler tail --remote --format pretty --search "error"

# Filter by status code
npx wrangler tail --remote --format pretty --status error
```

### Analytics Dashboard

Visit [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → api-worker

**Key Metrics:**
- Requests per second
- Errors per second
- CPU time (ms)
- Duration (p50, p99)

### Harvest Dashboard

Monitor cover harvest stats at:
https://harvest.oooefam.net

**Shows:**
- Total covers cached
- Storage usage
- API quota utilization
- Cache hit rate

## Troubleshooting

### Deployment Fails: "Invalid API Token"

**Solution:**
1. Regenerate Cloudflare API token
2. Update GitHub secret:
```bash
gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
```

### API Returns 500 Errors

**Diagnosis:**
```bash
npx wrangler tail --remote --format pretty --status error
```

**Common Causes:**
- Missing API keys (Google Books, Gemini, ISBNdb)
- Expired secrets
- Rate limit exceeded

**Fix:**
```bash
# Check worker secrets
npx wrangler secret list

# Update expired secrets
npx wrangler secret put GEMINI_API_KEY
```

### WebSocket Connections Fail

**Diagnosis:**
```bash
curl -I https://api.oooefam.net/ws/progress?jobId=test
```

**Common Causes:**
- Durable Object not initialized
- CORS issues
- WebSocket upgrade failed

**Fix:**
1. Check Durable Object status in Cloudflare Dashboard
2. Verify `wrangler.toml` has correct DO bindings
3. Redeploy: `npx wrangler deploy`

### High Latency (>500ms)

**Investigation:**
```bash
# Check Analytics Engine for slow queries
npx wrangler tail --remote --format pretty | grep "duration"
```

**Optimizations:**
- Increase KV cache TTL
- Enable aggressive caching
- Review database query patterns

### DNS Not Resolving

**Diagnosis:**
```bash
dig api.oooefam.net
nslookup api.oooefam.net
```

**Fix:**
1. Verify CNAME records in Cloudflare DNS
2. Ensure "Proxied" (orange cloud) is enabled
3. Wait for DNS propagation (up to 24 hours)

## Production Checklist

Before deploying to production:

- [ ] All 5 GitHub secrets configured
- [ ] Health check passes locally (`npx wrangler dev`)
- [ ] Tests pass (`npm test`)
- [ ] DNS CNAME records created
- [ ] Custom domains verified
- [ ] Rollback plan ready
- [ ] Monitoring dashboards checked
- [ ] API keys have sufficient quota
- [ ] Durable Objects initialized

## Staging Environment

### Overview

The staging environment provides an isolated testing environment for API v2.0 migration and new features before production deployment.

**Staging URL:** `https://staging-api.oooefam.net`
**Configuration:** `wrangler.staging.toml`
**Purpose:** Pre-production testing for iOS/Flutter teams

### Staging Deployment

**Via GitHub Actions:**
```bash
gh workflow run deploy-staging.yml --repo jukasdrj/bookstrack-backend
```

**Manual Deployment:**
```bash
cd /tmp/bookstrack-backend
npx wrangler deploy --config wrangler.staging.toml
```

**Test Staging Endpoint:**
```bash
# Health check
curl https://staging-api.oooefam.net/health

# Test v2 search endpoint
curl "https://staging-api.oooefam.net/v1/search/title?q=hamlet"
```

### Secret Management

Staging shares the same Secrets Store as production. DevOps team manages these secrets centrally:

**Required Secrets:**
- `GOOGLE_BOOKS_API_KEY` - Google Books API access
- `ISBNDB_API_KEY` - ISBNdb API access
- `GEMINI_API_KEY` - Google Gemini AI access

**Setting Secrets (DevOps only):**
```bash
# Secrets are stored in Cloudflare Secrets Store (shared across environments)
# No need to set separately for staging - uses same store_id as production
# See wrangler.staging.toml [[secrets_store_secrets]] sections
```

### KV Namespace Setup

Staging uses dedicated KV namespaces to isolate test data from production.

**Create Staging Namespaces (DevOps):**
```bash
# Create staging cache namespace
npx wrangler kv:namespace create CACHE --env staging
# Returns: id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Update wrangler.staging.toml with actual namespace ID
# Replace STAGING_KV_NAMESPACE_ID_PLACEHOLDER with real ID
```

**Current Status:**
- ⚠️ Placeholder namespace IDs in `wrangler.staging.toml`
- ✅ TODO: DevOps to create staging KV namespaces
- ✅ TODO: Update configuration with actual namespace IDs

### R2 Bucket Setup

Staging uses dedicated R2 buckets to isolate test data.

**Create Staging Buckets (DevOps):**
```bash
# Create staging buckets
npx wrangler r2 bucket create personal-library-data-staging
npx wrangler r2 bucket create bookshelf-images-staging
npx wrangler r2 bucket create bookstrack-covers-staging
```

**Current Status:**
- ⚠️ Placeholder bucket names in `wrangler.staging.toml`
- ✅ TODO: DevOps to create staging R2 buckets

### Analytics Engine

Staging uses separate analytics datasets to avoid polluting production metrics:

**Staging Datasets:**
- `books_api_performance_staging`
- `books_api_cache_metrics_staging`
- `books_api_provider_performance_staging`
- `bookshelf_ai_performance_staging`

Analytics are automatically created on first deployment.

### Verification Checklist

After staging deployment, verify:

**Basic Connectivity:**
- [ ] Health endpoint responds: `curl https://staging-api.oooefam.net/health`
- [ ] WebSocket connection works: `wscat -c "wss://staging-api.oooefam.net/ws/progress?jobId=test&token=test"`

**API v2.0 Response Format:**
- [ ] Responses use `{data, metadata, error?}` envelope (not `{success, data, meta}`)
- [ ] Error responses include `error.code` and `error.message`
- [ ] Metadata includes `timestamp` field

**WebSocket v2.0 Protocol:**
- [ ] Messages include `pipeline` field
- [ ] Messages include `version: "1.0.0"`
- [ ] Payload structure matches v2 schema

**Search Endpoints:**
- [ ] Title search: `curl "https://staging-api.oooefam.net/v1/search/title?q=hamlet"`
- [ ] ISBN search: `curl "https://staging-api.oooefam.net/v1/search/isbn?isbn=9780743273565"`
- [ ] Advanced search works

**Batch Operations:**
- [ ] CSV import endpoint accepts files
- [ ] Batch enrichment processes correctly
- [ ] WebSocket progress updates received

**Secrets & External APIs:**
- [ ] Google Books API accessible
- [ ] ISBNdb API accessible
- [ ] Gemini AI accessible

### DNS Configuration (DevOps)

**Required DNS Record:**

Type: `CNAME`
Name: `staging-api`
Target: `api-worker-staging.jukasdrj.workers.dev`
Proxy: Proxied (orange cloud)

**Verify:**
```bash
dig staging-api.oooefam.net
curl https://staging-api.oooefam.net/health
```

### Staging-Specific Configuration

**Environment Variables:**
- `ENVIRONMENT = "staging"`
- `API_VERSION = "2.0"`
- `LOG_LEVEL = "DEBUG"` (more verbose than production)

**Disabled Features:**
- Cron jobs (scheduled tasks) are commented out in staging
- Cache warming queue disabled by default
- Alert monitoring disabled

**Enable Cron for Testing:**
Uncomment `[triggers]` section in `wrangler.staging.toml` if needed.

### Troubleshooting Staging

**Issue: 401 Unauthorized Errors**
```bash
# Check secrets are accessible
npx wrangler secret list --env staging

# Verify secrets store binding in wrangler.staging.toml
```

**Issue: KV/R2 Not Found**
```bash
# List namespaces
npx wrangler kv:namespace list

# List buckets
npx wrangler r2 bucket list

# Update wrangler.staging.toml with actual IDs
```

**Issue: WebSocket Connection Fails**
```bash
# Check Durable Object status
npx wrangler tail --env staging --format pretty

# Verify DO bindings match production configuration
```

**Issue: DNS Not Resolving**
```bash
# Check DNS propagation
dig staging-api.oooefam.net

# Verify CNAME in Cloudflare Dashboard
# DNS → oooefam.net → staging-api (CNAME)
```

## Support

- **Repository:** https://github.com/jukasdrj/bookstrack-backend
- **Issues:** https://github.com/jukasdrj/bookstrack-backend/issues
- **iOS App:** https://github.com/jukasdrj/books-tracker-v1

---

**Last Updated:** November 13, 2025
**Maintainer:** Claude Code
