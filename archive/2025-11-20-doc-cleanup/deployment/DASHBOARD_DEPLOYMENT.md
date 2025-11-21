# Harvest Dashboard Deployment Guide

**Target URL:** https://harvest.oooefam.net
**Project Name:** harvest-dashboard
**Platform:** Cloudflare Pages

## Deployment Methods

### Method 1: Automatic Deployment (Recommended)

The dashboard automatically deploys to Cloudflare Pages when changes are pushed to the `main` branch.

**Trigger:** Push to `main` branch with changes in `dashboard/` directory

**GitHub Actions Workflow:** `.github/workflows/deploy-dashboard.yml`

**Required Secrets:**
- `CLOUDFLARE_API_TOKEN` - Already configured for Workers deployment
- `CLOUDFLARE_ACCOUNT_ID` - Already configured for Workers deployment

**Process:**
1. Commit changes to `dashboard/` directory
2. Push to `main` branch
3. GitHub Actions automatically deploys to Cloudflare Pages
4. Dashboard is live at https://harvest.oooefam.net

### Method 2: Manual Deployment via Wrangler CLI

```bash
# Install Wrangler if not already installed
npm install -g wrangler

# Create Pages project (first time only)
npx wrangler pages project create harvest-dashboard

# Deploy dashboard
npx wrangler pages deploy dashboard --project-name=harvest-dashboard
```

### Method 3: Manual Deployment via Cloudflare Dashboard

1. **Login to Cloudflare Dashboard**
   - URL: https://dash.cloudflare.com/

2. **Navigate to Pages**
   - Click **Workers & Pages**
   - Click **Create application**
   - Select **Pages** tab

3. **Connect to GitHub**
   - Select **Connect to Git**
   - Choose repository: `jukasdrj/bookstrack-backend`
   - Configure build settings:
     - **Production branch:** `main`
     - **Build command:** (leave empty)
     - **Build output directory:** `dashboard`
     - **Root directory:** `/`

4. **Configure Custom Domain**
   - After first deployment, go to **Custom domains**
   - Add custom domain: `harvest.oooefam.net`
   - Cloudflare will automatically configure DNS

## Post-Deployment Configuration

### 1. Custom Domain Setup

**DNS Configuration (via Cloudflare DNS):**
```
Type: CNAME
Name: harvest
Target: harvest-dashboard.pages.dev
Proxy: Enabled (orange cloud)
TTL: Auto
```

**Expected Result:**
- `https://harvest.oooefam.net` → Dashboard
- `https://harvest-dashboard.pages.dev` → Dashboard (Pages default URL)

### 2. CORS Verification

The API endpoints are already configured to allow requests from `harvest.oooefam.net`:

**Configuration Location:** `src/router.ts:40`
```typescript
const allowedOrigins = [
  'https://bookstrack.oooefam.net',   // Production web app
  'https://harvest.oooefam.net',       // Harvest dashboard ✅
  'capacitor://localhost',              // iOS app (Capacitor)
  'http://localhost:3000',              // Local dev (web)
  'http://localhost:8787'               // Local dev (wrangler)
]
```

### 3. Security Headers

Security headers are configured in `dashboard/_headers`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 4. Cache Configuration

**Static Assets (CSS/JS):**
- Cache-Control: `public, max-age=31536000, immutable`
- 1 year cache for fingerprinted assets

**HTML:**
- Cache-Control: `public, max-age=0, must-revalidate`
- Always fresh, no caching

## Verification Steps

### 1. Health Check
```bash
curl -I https://harvest.oooefam.net
```
Expected: `200 OK`

### 2. CORS Test
```bash
curl -H "Origin: https://harvest.oooefam.net" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://api.oooefam.net/health
```
Expected: CORS headers in response

### 3. Dashboard Functionality
1. Open https://harvest.oooefam.net in browser
2. Verify "Worker Status" shows "OK"
3. Verify cache gauges display percentages
4. Check browser console for errors (should be none)

### 4. Auto-Refresh Test
1. Open dashboard
2. Wait 30 seconds
3. Verify "Last updated" timestamp changes
4. Verify metrics refresh without page reload

## Troubleshooting

### Issue: Dashboard shows all "--" values

**Possible Causes:**
1. API endpoints not responding
2. CORS blocking requests
3. Network connectivity issue

**Diagnosis:**
```bash
# Test API health
curl https://api.oooefam.net/health

# Test metrics endpoint
curl https://api.oooefam.net/metrics

# Check browser console for CORS errors
# Open DevTools → Console
```

**Solution:**
- If API is down: Check Cloudflare Workers status
- If CORS issue: Verify `src/router.ts` CORS configuration
- If network issue: Check Cloudflare DNS/routing

### Issue: Dashboard not deploying

**Possible Causes:**
1. GitHub Actions secrets not configured
2. Cloudflare Pages project not created
3. Build failing

**Diagnosis:**
```bash
# Check GitHub Actions logs
# Go to repository → Actions → Latest workflow run

# Verify secrets exist
# Go to Settings → Secrets and variables → Actions
# Confirm CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exist
```

**Solution:**
- Configure missing secrets
- Create Pages project manually
- Check workflow logs for specific error

### Issue: Custom domain not working

**Possible Causes:**
1. DNS not propagated
2. Custom domain not added to Pages project
3. SSL certificate not issued

**Diagnosis:**
```bash
# Check DNS resolution
dig harvest.oooefam.net

# Check SSL certificate
curl -vI https://harvest.oooefam.net 2>&1 | grep SSL
```

**Solution:**
- Wait for DNS propagation (up to 24 hours, usually < 5 minutes)
- Add custom domain in Cloudflare Pages settings
- Wait for SSL certificate to be issued (automatic, < 5 minutes)

## Rollback Procedure

### If deployment breaks the dashboard:

**Option 1: Rollback via Cloudflare Dashboard**
1. Go to **Workers & Pages** → **harvest-dashboard**
2. Click **Deployments** tab
3. Find previous working deployment
4. Click **...** → **Rollback to this deployment**

**Option 2: Rollback via Git**
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push --force origin main
```

## Monitoring

### Cloudflare Pages Analytics

**Access:** Cloudflare Dashboard → Workers & Pages → harvest-dashboard → Analytics

**Key Metrics:**
- Page views
- Unique visitors
- Requests
- Bandwidth
- Geographic distribution

### Real User Monitoring (RUM)

The dashboard sends no RUM data by default (privacy-focused). To add RUM:

1. Add Cloudflare Web Analytics snippet to `index.html`
2. Or use third-party RUM (Google Analytics, Plausible, etc.)

## Cost Estimate

**Cloudflare Pages Free Tier:**
- ✅ Unlimited requests
- ✅ Unlimited bandwidth
- ✅ 500 builds/month
- ✅ Custom domains included

**Expected Cost:** $0/month (stays within free tier)

## Related Documentation

- [Dashboard README](../dashboard/README.md) - User guide and features
- [API Monitoring Guide](../docs/MONITORING_GUIDE.md) - Monitoring endpoints
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/) - Platform documentation

## Support

For deployment issues:
1. Check this guide first
2. Review Cloudflare Pages logs
3. Create GitHub issue with tag `deployment`
4. Contact via Discord/Slack (if available)
