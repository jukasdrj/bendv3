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

Test changes in staging before production:

```bash
# Deploy to staging
gh workflow run deploy-staging.yml --repo jukasdrj/bookstrack-backend

# Test staging endpoint
curl https://books-api-proxy-staging.jukasdrj.workers.dev/health
```

## Support

- **Repository:** https://github.com/jukasdrj/bookstrack-backend
- **Issues:** https://github.com/jukasdrj/bookstrack-backend/issues
- **iOS App:** https://github.com/jukasdrj/books-tracker-v1

---

**Last Updated:** November 13, 2025
**Maintainer:** Claude Code
