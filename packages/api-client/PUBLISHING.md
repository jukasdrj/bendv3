# Publishing Guide

This SDK is published to **both npm and GitHub Packages** for redundancy.

---

## Prerequisites

### 1. npm Authentication

```bash
npm login
# Enter your npm credentials when prompted
```

### 2. GitHub Packages Authentication

Create a GitHub Personal Access Token with `write:packages` scope:
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scope: `write:packages`
4. Copy the token

Then set environment variable:
```bash
export GITHUB_TOKEN=ghp_your_token_here
```

---

## Publishing to npm (Primary)

**This is the default and recommended method for frontend teams.**

```bash
cd packages/api-client

# 1. Build and regenerate types
npm run prepublishOnly

# 2. Publish to npm
npm publish
```

**Result:** Package available at `npm install @jukasdrj/bookstrack-api-client`

---

## Publishing to GitHub Packages (Backup)

**Use this as a backup or for private distribution.**

```bash
cd packages/api-client

# 1. Copy GitHub-specific config
cp .npmrc-github .npmrc

# 2. Update package.json temporarily
# Change publishConfig to:
# "publishConfig": {
#   "registry": "https://npm.pkg.github.com"
# }

# 3. Publish
npm publish

# 4. Restore original config
git checkout package.json .npmrc
```

**Result:** Package available at GitHub Packages

**Frontend installation:**
```bash
# Add .npmrc to frontend project
echo "@jukasdrj:registry=https://npm.pkg.github.com" >> .npmrc

# Install
npm install @jukasdrj/bookstrack-api-client
```

---

## Automated Publishing (CI/CD)

See `.github/workflows/publish-sdk.yml` for automated publishing on version bumps.

---

## Version Bumping

```bash
cd packages/api-client

# Patch (1.0.0 → 1.0.1)
npm version patch

# Minor (1.0.0 → 1.1.0)
npm version minor

# Major (1.0.0 → 2.0.0)
npm version major

# Then publish
npm publish
```

---

## Quick Reference

| Registry | Command | Installation |
|----------|---------|--------------|
| **npm** (default) | `npm publish` | `npm install @jukasdrj/bookstrack-api-client` |
| **GitHub Packages** | `npm publish` (with .npmrc-github) | Requires .npmrc config |

---

**Last Updated:** 2025-11-28
