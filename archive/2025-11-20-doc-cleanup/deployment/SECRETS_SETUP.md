# Secrets Configuration Guide

This document guides you through configuring the 5 required GitHub repository secrets for automated deployment.

## Required Secrets

### 1. CLOUDFLARE_API_TOKEN

**Purpose:** Authenticates Wrangler for deployments

**How to Get:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Select your account
5. Grant permissions: `Account:Workers Scripts:Edit`, `Account:Workers KV Storage:Edit`, `Zone:Workers Routes:Edit`
6. Create token and copy it

**Set in GitHub:**
```bash
gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
# Paste token when prompted
```

### 2. CLOUDFLARE_ACCOUNT_ID

**Purpose:** Identifies your Cloudflare account for deployments

**How to Get:**
```bash
cd /tmp/bookstrack-backend
npx wrangler whoami
# Look for "Account ID" in the output
```

**Set in GitHub:**
```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --repo jukasdrj/bookstrack-backend
# Paste account ID when prompted
```

### 3. GOOGLE_BOOKS_API_KEY

**Purpose:** Google Books API authentication for book search

**Current Value:** Already configured in Cloudflare Secrets Store
- Store ID: `b0562ac16fde468c8af12717a6c88400`
- Secret Name: `Google_books_hardoooe`

**How to Get (if creating new):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google Books API
4. Create credentials (API Key)
5. Restrict key to Google Books API

**Set in GitHub:**
```bash
gh secret set GOOGLE_BOOKS_API_KEY --repo jukasdrj/bookstrack-backend
# Paste API key when prompted
```

### 4. GEMINI_API_KEY

**Purpose:** Gemini AI API authentication for bookshelf scanning and CSV parsing

**Current Value:** Already configured in Cloudflare Secrets Store
- Store ID: `b0562ac16fde468c8af12717a6c88400`
- Secret Name: `google_gemini_oooebooks`

**How to Get (if creating new):**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create API key
3. Copy the key

**Set in GitHub:**
```bash
gh secret set GEMINI_API_KEY --repo jukasdrj/bookstrack-backend
# Paste API key when prompted
```

### 5. ISBNDB_API_KEY

**Purpose:** ISBNdb API authentication for cover images

**Current Value:** Already configured in Cloudflare Secrets Store
- Store ID: `b0562ac16fde468c8af12717a6c88400`
- Secret Name: `ISBNDB_API_KEY`

**Plan:** Premium Plan ($39/month) - 5000 requests/day

**How to Get (if creating new):**
1. Go to [ISBNdb](https://isbndb.com/)
2. Sign up for Premium plan
3. Get API key from dashboard

**Set in GitHub:**
```bash
gh secret set ISBNDB_API_KEY --repo jukasdrj/bookstrack-backend
# Paste API key when prompted
```

## Quick Setup (All Secrets)

Run these commands in order, pasting values when prompted:

```bash
# 1. Get Cloudflare credentials
npx wrangler whoami  # Note your Account ID

# 2. Set GitHub secrets
gh secret set CLOUDFLARE_API_TOKEN --repo jukasdrj/bookstrack-backend
gh secret set CLOUDFLARE_ACCOUNT_ID --repo jukasdrj/bookstrack-backend
gh secret set GOOGLE_BOOKS_API_KEY --repo jukasdrj/bookstrack-backend
gh secret set GEMINI_API_KEY --repo jukasdrj/bookstrack-backend
gh secret set ISBNDB_API_KEY --repo jukasdrj/bookstrack-backend
```

## Verification

After setting secrets, verify in GitHub:

1. Go to https://github.com/jukasdrj/bookstrack-backend/settings/secrets/actions
2. Confirm all 5 secrets are listed
3. Trigger a workflow to test:

```bash
gh workflow run deploy-production.yml --repo jukasdrj/bookstrack-backend
```

## Troubleshooting

### Workflow Fails with "Invalid API Token"
- Regenerate Cloudflare API token with correct permissions
- Ensure token has `Account:Workers Scripts:Edit` permission

### Workflow Fails with "Invalid Account ID"
- Run `npx wrangler whoami` to verify correct account ID
- Account ID should be 32 characters (hexadecimal)

### Deployment Succeeds but API Returns Errors
- Check that API keys (Google Books, Gemini, ISBNdb) are correct
- Verify secrets are not expired (Gemini keys can expire)

## Security Notes

- **Never commit secrets to git**
- Rotate API tokens regularly
- Use GitHub's encrypted secrets feature
- Restrict Cloudflare API token to minimum required permissions
- Monitor usage in respective dashboards (Google Cloud, ISBNdb)

---

**Last Updated:** November 13, 2025
**Maintainer:** Claude Code
