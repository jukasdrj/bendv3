# Alexandria Package Installation Guide

**Status:** Awaiting package publication
**Last Updated:** December 3, 2025

## Installation Options

### Option 1: npm Public Registry (Preferred - Once Published)

```bash
npm install @ooheynerds/alexandria-worker@latest
```

**Status:** ❌ Not yet published to public npm
**Error:** `404 Not Found - The requested resource could not be found`

---

### Option 2: npm Private Registry (If Using GitHub Packages)

If Alexandria is published to GitHub Packages:

```bash
# Add .npmrc to project root
echo "@ooheynerds:registry=https://npm.pkg.github.com" >> .npmrc

# Authenticate with GitHub token
npm login --scope=@ooheynerds --auth-type=legacy --registry=https://npm.pkg.github.com

# Install
npm install @ooheynerds/alexandria-worker@latest
```

---

### Option 3: Local npm Link (Development)

If Alexandria repository is local:

```bash
# In Alexandria repository
cd /path/to/alexandria
npm link

# In bendv3 repository
cd /path/to/bendv3
npm link @ooheynerds/alexandria-worker
```

**Pros:**
- Instant changes (no republishing)
- Great for development

**Cons:**
- Manual setup required
- Breaks on npm install
- Not suitable for production

---

### Option 4: Direct GitHub Install

If Alexandria is on GitHub:

```bash
npm install github:jukasdrj/alexandria#main
# or specific tag/commit:
npm install github:jukasdrj/alexandria#v2.0.0
```

**Pros:**
- No npm registry needed
- Works immediately

**Cons:**
- Slower installs
- No semantic versioning
- GitHub authentication required for private repos

---

### Option 5: File Path Install (Local Development)

```bash
npm install /path/to/alexandria
# or relative:
npm install ../alexandria
```

**Pros:**
- Simple for local dev
- No linking required

**Cons:**
- Absolute paths break on other machines
- Not suitable for team/CI

---

## Recommended Setup

### For Development (Now)
```bash
# Option 3: npm link
cd /path/to/alexandria && npm link
cd /path/to/bendv3 && npm link @ooheynerds/alexandria-worker
```

### For Production (Soon)
```bash
# Option 1: Public npm (once published)
npm install @ooheynerds/alexandria-worker@latest
```

---

## Post-Installation Steps

Once package is installed by any method:

### 1. Verify Installation
```bash
npm ls @ooheynerds/alexandria-worker
# Should show version and path
```

### 2. Replace Placeholder Types

**File:** `src/types/alexandria-types.ts`

**Before:**
```typescript
// TEMPORARY PLACEHOLDER: Alexandria's exported AppType
export interface AlexandriaAppType extends Hono {
  // Placeholder - routes will be auto-inferred
}

// ... many placeholder interfaces ...
```

**After:**
```typescript
/**
 * Alexandria API Type Definitions
 * Official types from @ooheynerds/alexandria-worker package
 */
export type {
  AlexandriaAppType,
  SearchQuery,
  SearchResult,
  BookResult,
  ProcessCover,
  CoverProcessResult,
  EnrichEdition,
  EnrichWork,
  EnrichAuthor,
  HealthCheck,
  DatabaseStats,
  ErrorResponse,
  ENDPOINTS,
  API_ROUTES,
} from '@ooheynerds/alexandria-worker/types'
```

### 3. Test Type Imports
```bash
# Type check should pass
npx tsc --noEmit src/services/alexandria-client.ts

# No errors expected (types should resolve)
```

### 4. Run Smoke Tests
```bash
npm run test:smoke
# Should still pass (8/8)
```

---

## Troubleshooting

### Error: Module not found
```
Cannot find module '@ooheynerds/alexandria-worker/types'
```

**Cause:** Package not installed or wrong path
**Fix:**
```bash
# Verify package exists
npm ls @ooheynerds/alexandria-worker

# Check package exports
cat node_modules/@ooheynerds/alexandria-worker/package.json | jq .exports

# Ensure /types is exported
```

---

### Error: Type errors after installation
```
Property 'api' does not exist on type 'Client<AlexandriaAppType>'
```

**Cause:** Alexandria hasn't exported proper Hono types
**Fix:** Wait for Alexandria to export routes correctly:
```typescript
// In Alexandria worker/index.ts
const routes = app.get('/api/search', ...).get('/health', ...)

export type AlexandriaAppType = typeof routes  // ← Required
```

---

### Error: npm link broken after npm install
```
npm WARN ... @ooheynerds/alexandria-worker is linked but not available
```

**Cause:** npm install removes local links
**Fix:** Re-link after every npm install:
```bash
npm link @ooheynerds/alexandria-worker
```

Or add to package.json scripts:
```json
{
  "scripts": {
    "postinstall": "npm link @ooheynerds/alexandria-worker || true"
  }
}
```

---

## Publishing Alexandria (For Alexandria Maintainers)

### Option A: Public npm (Recommended)
```bash
cd /path/to/alexandria
npm publish --access public
```

### Option B: GitHub Packages
```bash
# Add to Alexandria's package.json:
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}

# Publish
npm publish
```

---

## Current Status

**Package Name:** `@ooheynerds/alexandria-worker`
**Registry:** Not yet published
**Recommended Action:** Use npm link for now, publish to npm when ready

---

**Last Updated:** December 3, 2025
**Next Step:** Install package via preferred method, then replace placeholder types
