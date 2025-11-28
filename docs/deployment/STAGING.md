# Staging Environment Guide

**Created:** November 28, 2025
**Status:** Active
**URL:** https://api-staging.oooefam.net

---

## Overview

The staging environment provides a safe testing ground for changes before production deployment. It mirrors production configuration but uses separate resources to prevent data contamination.

**Key Differences from Production:**
- Separate DNS: `api-staging.oooefam.net`
- Separate Worker name: `api-worker-staging`
- Isolated KV, R2, D1, and Queue resources
- Debug logging enabled by default
- Same secrets as production (shared API keys)

---

## Initial Setup

### 1. Create Staging Resources

Run these commands ONCE to create staging-specific Cloudflare resources:

```bash
# KV Namespaces
wrangler kv namespace create CACHE --preview false
wrangler kv namespace create RECOMMENDATIONS_CACHE --preview false

# D1 Database
wrangler d1 create bookstrack-library-staging

# R2 Buckets
wrangler r2 bucket create personal-library-data-staging
wrangler r2 bucket create bookshelf-images-staging
wrangler r2 bucket create bookstrack-covers-staging

# Queues
wrangler queues create author-warming-queue-staging
wrangler queues create enrichment-queue-staging
wrangler queues create author-warming-dlq-staging
wrangler queues create enrichment-dlq-staging

# Vectorize Index
wrangler vectorize create book-embeddings-staging --dimensions=768 --metric=cosine
```

### 2. Update wrangler.staging.jsonc

After creating resources, update `wrangler.staging.jsonc` with the actual IDs returned by the commands above:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "<actual-kv-id-from-command>"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_id": "<actual-d1-id-from-command>"
    }
  ]
}
```

### 3. Configure DNS

Add CNAME record in Cloudflare DNS for `oooefam.net`:

- **Name:** `api-staging`
- **Type:** CNAME
- **Target:** `api-worker-staging.workers.dev` (or use Custom Domain in Workers dashboard)
- **Proxied:** Yes (orange cloud)
- **TTL:** Auto

**Alternative (Custom Domain in Cloudflare Dashboard):**
1. Go to Cloudflare Workers & Pages dashboard
2. Select `api-worker-staging` worker
3. Go to "Settings" > "Domains & Routes"
4. Click "Add" > "Custom Domain"
5. Enter `api-staging.oooefam.net`

### 4. Set Secrets

Secrets are shared between staging and production (same API keys):

```bash
# Set secrets for staging worker
wrangler secret put GOOGLE_BOOKS_API_KEY --config wrangler.staging.jsonc
wrangler secret put GEMINI_API_KEY --config wrangler.staging.jsonc
wrangler secret put ISBNDB_API_KEY --config wrangler.staging.jsonc
```

---

## Deployment Workflow

### Deploy to Staging

```bash
# Deploy to staging
npx wrangler deploy --config wrangler.staging.jsonc

# Verify deployment
curl https://api-staging.oooefam.net/health

# Check logs
npx wrangler tail --config wrangler.staging.jsonc
```

### Test in Staging

```bash
# Health check
curl https://api-staging.oooefam.net/health

# OpenAPI spec
curl https://api-staging.oooefam.net/doc/openapi.json | jq .

# Swagger UI
open https://api-staging.oooefam.net/doc

# Test specific endpoint (e.g., capabilities)
curl https://api-staging.oooefam.net/api/v2/capabilities | jq .
```

### Promote to Production

Once staging tests pass:

```bash
# Deploy to production
npx wrangler deploy

# Verify production
curl https://api.oooefam.net/health
```

---

## Staging vs Production

| Aspect | Staging | Production |
|--------|---------|------------|
| **URL** | `api-staging.oooefam.net` | `api.oooefam.net` |
| **Worker Name** | `api-worker-staging` | `api-worker` |
| **LOG_LEVEL** | `debug` | `info` |
| **KV Namespaces** | Staging-specific | Production |
| **D1 Database** | `bookstrack-library-staging` | `bookstrack-library` |
| **R2 Buckets** | `-staging` suffix | Production buckets |
| **Queues** | `-staging` suffix | Production queues |
| **Secrets** | Shared (same API keys) | Shared |
| **Analytics** | Shared datasets | Shared datasets |

---

## Troubleshooting

### Staging deploy fails with "namespace not found"

Update `wrangler.staging.jsonc` with actual resource IDs from creation commands.

### 404 on staging URL

1. Check DNS CNAME is configured
2. Verify Custom Domain in Workers dashboard
3. Wait 5-10 minutes for DNS propagation

### Different behavior than production

1. Check environment variables in `wrangler.staging.jsonc`
2. Verify secrets are set: `wrangler secret list --config wrangler.staging.jsonc`
3. Compare logs: `wrangler tail --config wrangler.staging.jsonc`

### Want to reset staging data

```bash
# Flush KV cache
wrangler kv key list --namespace-id=<staging-kv-id> | jq -r '.[].name' | xargs -I {} wrangler kv key delete {} --namespace-id=<staging-kv-id>

# Reset D1 database
wrangler d1 execute bookstrack-library-staging --command="DROP TABLE IF EXISTS books; DROP TABLE IF EXISTS authors;"
wrangler d1 migrations apply bookstrack-library-staging

# Clear R2 buckets
wrangler r2 object delete personal-library-data-staging --all
```

---

## CI/CD Integration

### GitHub Actions Workflow

Add staging deployment step before production:

```yaml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: npx wrangler deploy --config wrangler.staging.jsonc
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Test staging
        run: |
          curl -f https://api-staging.oooefam.net/health
          curl -f https://api-staging.oooefam.net/doc/openapi.json

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## Maintenance

### Monthly Review

- Check staging resource usage (KV, R2, D1)
- Clear old test data
- Verify staging mirrors production config
- Update staging secrets if changed

### Cost Monitoring

Staging resources are billed separately. Monitor via Cloudflare dashboard:
- Workers Analytics → Filter by `api-worker-staging`
- KV, R2, D1 usage in respective dashboards

---

## Related Documentation

- **Deployment Guide:** `docs/deployment/DEPLOYMENT.md`
- **Rollback Procedures:** `docs/deployment/ROLLBACK.md`
- **Secrets Management:** `docs/deployment/SECRETS_SETUP.md`
- **Main Config:** `wrangler.jsonc` (production)
- **Staging Config:** `wrangler.staging.jsonc`

---

**Last Updated:** November 28, 2025
**Owner:** DevOps Team
