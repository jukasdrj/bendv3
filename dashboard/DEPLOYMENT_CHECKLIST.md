# Manual Deployment Checklist

This checklist guides you through the one-time setup for deploying the Harvest Dashboard to Cloudflare Pages.

## Prerequisites

- ✅ Cloudflare account with access to `oooefam.net` domain
- ✅ GitHub repository access (`jukasdrj/bookstrack-backend`)
- ✅ Cloudflare API Token (already exists for Workers deployment)

## Step 1: Create Cloudflare Pages Project

### Option A: Via Cloudflare Dashboard (Recommended for first-time setup)

1. **Login to Cloudflare Dashboard**
   ```
   URL: https://dash.cloudflare.com/
   ```

2. **Navigate to Pages**
   - Click **Workers & Pages** in the left sidebar
   - Click **Create application** button
   - Select **Pages** tab
   - Click **Connect to Git**

3. **Connect GitHub Repository**
   - Authorize Cloudflare to access your GitHub account
   - Select repository: `jukasdrj/bookstrack-backend`
   - Click **Begin setup**

4. **Configure Build Settings**
   ```
   Project name: harvest-dashboard
   Production branch: main
   Build command: (leave empty)
   Build output directory: dashboard
   Root directory (advanced): / (default)
   ```

5. **Environment Variables**
   - None required (static site)

6. **Deploy**
   - Click **Save and Deploy**
   - Wait for initial deployment (2-3 minutes)
   - Note the deployment URL: `https://harvest-dashboard.pages.dev`

### Option B: Via Wrangler CLI (Faster for experienced users)

```bash
# Navigate to repository root
cd /path/to/bookstrack-backend

# Create Pages project
npx wrangler pages project create harvest-dashboard

# Deploy dashboard
npx wrangler pages deploy dashboard --project-name=harvest-dashboard

# Example output:
# ✨ Successfully created the 'harvest-dashboard' project.
# 🌍 Deploying... (up to 5 mins)
# ✨ Success! Deployed to https://harvest-dashboard.pages.dev
```

## Step 2: Configure Custom Domain

### Via Cloudflare Dashboard

1. **Navigate to Custom Domains**
   - Go to **Workers & Pages** → **harvest-dashboard**
   - Click **Custom domains** tab
   - Click **Set up a custom domain**

2. **Add Domain**
   ```
   Custom domain: harvest.oooefam.net
   ```
   - Click **Continue**
   - Cloudflare will automatically configure DNS

3. **Verify DNS**
   - Wait 1-2 minutes for DNS propagation
   - Verify with: `dig harvest.oooefam.net`
   - Expected CNAME: `harvest-dashboard.pages.dev`

4. **SSL Certificate**
   - SSL certificate issued automatically
   - Wait 5-10 minutes for certificate activation
   - Verify with: `curl -I https://harvest.oooefam.net`

### Via Wrangler CLI

```bash
# Add custom domain
npx wrangler pages domains add harvest.oooefam.net --project-name=harvest-dashboard

# Verify domain configuration
npx wrangler pages domains list --project-name=harvest-dashboard
```

## Step 3: Verify Deployment

### 1. Check Pages Project

```bash
# Test default URL
curl -I https://harvest-dashboard.pages.dev

# Expected response:
# HTTP/2 200
# content-type: text/html
# ...
```

### 2. Check Custom Domain

```bash
# Test custom domain
curl -I https://harvest.oooefam.net

# Expected response:
# HTTP/2 200
# content-type: text/html
# x-frame-options: DENY
# x-content-type-options: nosniff
# ...
```

### 3. Test Dashboard Functionality

1. **Open in Browser**
   ```
   https://harvest.oooefam.net
   ```

2. **Verify Metrics Load**
   - Worker Status should show "OK"
   - Cache gauges should display percentages
   - Request volume should show numbers
   - Check browser console for errors (should be none)

3. **Test Auto-Refresh**
   - Wait 30 seconds
   - Verify "Last updated" timestamp changes
   - Metrics should refresh automatically

4. **Test Manual Refresh**
   - Click "🔄 Refresh" button
   - Timestamp should update immediately
   - Metrics should reload

### 4. Test CORS

```bash
# Test CORS from dashboard domain
curl -H "Origin: https://harvest.oooefam.net" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://api.oooefam.net/health

# Expected response headers:
# Access-Control-Allow-Origin: https://harvest.oooefam.net
# Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
# Access-Control-Allow-Headers: Content-Type, Authorization
```

## Step 4: Enable Automatic Deployments

The GitHub Actions workflow is already configured in `.github/workflows/deploy-dashboard.yml`.

### Verify GitHub Secrets

1. **Go to GitHub Repository Settings**
   ```
   https://github.com/jukasdrj/bookstrack-backend/settings/secrets/actions
   ```

2. **Verify Required Secrets Exist**
   - ✅ `CLOUDFLARE_API_TOKEN`
   - ✅ `CLOUDFLARE_ACCOUNT_ID`

3. **If Secrets Missing**
   
   **Create API Token:**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click **Create Token**
   - Use template: **Edit Cloudflare Workers**
   - Add permissions: **Cloudflare Pages - Edit**
   - Click **Continue to summary**
   - Click **Create Token**
   - Copy token and add to GitHub Secrets as `CLOUDFLARE_API_TOKEN`

   **Get Account ID:**
   - Go to https://dash.cloudflare.com/
   - Click on any zone (e.g., `oooefam.net`)
   - Scroll down in right sidebar
   - Copy **Account ID**
   - Add to GitHub Secrets as `CLOUDFLARE_ACCOUNT_ID`

### Test Automatic Deployment

1. **Make a test change**
   ```bash
   cd dashboard
   # Edit index.html or any file
   git add .
   git commit -m "Test: Verify automatic deployment"
   git push origin main
   ```

2. **Monitor Deployment**
   - Go to **Actions** tab in GitHub
   - Find "Deploy Harvest Dashboard to Cloudflare Pages" workflow
   - Verify it completes successfully
   - Check https://harvest.oooefam.net for changes

## Step 5: Configure Monitoring (Optional)

### Cloudflare Pages Analytics

1. **Enable Analytics**
   - Go to **Workers & Pages** → **harvest-dashboard**
   - Click **Analytics** tab
   - Analytics are enabled by default

2. **View Metrics**
   - Page views
   - Unique visitors
   - Requests
   - Bandwidth
   - Geographic distribution

### Setup Alerts (Optional)

1. **Create Notification**
   - Go to **Notifications** in Cloudflare Dashboard
   - Click **Add**
   - Select **Pages Deployment Failed**
   - Choose notification method (email, webhook, PagerDuty)

## Troubleshooting

### Issue: "Project already exists"

**Solution:**
```bash
# List existing projects
npx wrangler pages project list

# If harvest-dashboard exists, deploy to it directly
npx wrangler pages deploy dashboard --project-name=harvest-dashboard
```

### Issue: DNS not resolving

**Check DNS propagation:**
```bash
dig harvest.oooefam.net

# Wait up to 24 hours for global propagation
# Usually takes < 5 minutes
```

**Force DNS refresh:**
```bash
# Flush local DNS cache
# macOS:
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Linux:
sudo systemd-resolve --flush-caches

# Windows:
ipconfig /flushdns
```

### Issue: SSL certificate not issued

**Wait and retry:**
- SSL certificates take 5-10 minutes to issue
- Cloudflare issues Universal SSL automatically
- If not issued after 30 minutes, contact Cloudflare support

**Check SSL status:**
- Go to **SSL/TLS** → **Edge Certificates**
- Verify **Universal SSL** is active

### Issue: Dashboard shows all "--" values

**Diagnosis:**
```bash
# Test API endpoints
curl https://api.oooefam.net/health
curl https://api.oooefam.net/metrics

# Check browser console for CORS errors
```

**Solution:**
- Verify API is responding
- Check CORS configuration in `src/router.ts:40`
- Ensure `harvest.oooefam.net` is in allowed origins

### Issue: Automatic deployments not working

**Check workflow file:**
```bash
# Verify workflow exists
cat .github/workflows/deploy-dashboard.yml
```

**Check GitHub Actions:**
- Go to **Actions** tab
- Find failed workflow run
- Check error logs
- Verify secrets are configured

**Manual trigger:**
- Go to **Actions** tab
- Click "Deploy Harvest Dashboard to Cloudflare Pages"
- Click **Run workflow**
- Select branch: `main`
- Click **Run workflow**

## Success Criteria

- ✅ Dashboard accessible at https://harvest.oooefam.net
- ✅ SSL certificate valid (HTTPS working)
- ✅ Metrics display correctly (not all "--")
- ✅ Auto-refresh works (30-second interval)
- ✅ Manual refresh button works
- ✅ Mobile-responsive design
- ✅ No console errors
- ✅ CORS working (no CORS errors in console)
- ✅ Automatic deployments working (GitHub Actions)

## Rollback Procedure

If deployment breaks:

### Via Cloudflare Dashboard

1. Go to **Workers & Pages** → **harvest-dashboard**
2. Click **Deployments** tab
3. Find previous working deployment
4. Click **...** → **Rollback to this deployment**

### Via Wrangler CLI

```bash
# List deployments
npx wrangler pages deployment list --project-name=harvest-dashboard

# Rollback to specific deployment
npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=harvest-dashboard
```

## Next Steps

After successful deployment:

1. **Share Dashboard URL**
   - Internal team: https://harvest.oooefam.net
   - Documentation: Update monitoring guides

2. **Monitor Usage**
   - Check Cloudflare Pages Analytics weekly
   - Monitor error rates
   - Gather feedback from users

3. **Plan Phase 2 Enhancements**
   - Chart.js visualizations
   - Historical trend graphs
   - WebSocket real-time updates
   - ISBNdb harvest progress tracking

## Support

For deployment issues:
- Check [Deployment Guide](../docs/deployment/DASHBOARD_DEPLOYMENT.md)
- Review Cloudflare Pages logs
- Create GitHub issue with tag `deployment`
- Cloudflare support: https://support.cloudflare.com/
