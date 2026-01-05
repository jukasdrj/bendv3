# Alexandria Version Sync Guide

**Last Updated:** January 5, 2026
**Status:** Active

---

## Overview

BendV3 depends on `alexandria-worker` for book metadata. When Alexandria releases a new version with enhanced types or new fields, BendV3 must update to expose those fields to API consumers.

This document explains the **automatic version checking system** and manual update procedures.

---

## Automatic Version Checking

### 📅 Daily Scheduled Check

GitHub Actions runs **daily at 9 AM UTC** to check for Alexandria updates:

```yaml
# .github/workflows/alexandria-version-check.yml
on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
```

**What it does:**
1. ✅ Fetches latest `alexandria-worker` version from npm registry
2. ✅ Compares with current version in `package.json`
3. ✅ Creates GitHub Issue if update available
4. ✅ Labels issue with `alexandria-update`, `dependencies`, `enhancement`

**Example Issue:**
> **Alexandria Update Available: v2.2.3 → v2.2.4**
>
> Action Items:
> - [ ] Review Alexandria CHANGELOG
> - [ ] Check for new API fields
> - [ ] Update BendV3 schemas
> - [ ] Regenerate OpenAPI spec
> - [ ] Deploy to production

### 🔧 Manual Check

Run anytime to check for updates:

```bash
npm run check-alexandria-version
```

**Exit codes:**
- `0` - Versions in sync ✅
- `1` - Minor/patch update available ⚠️
- `2` - Major (breaking) update detected 🚨

---

## Update Procedure

### Step 1: Review Changes

1. **Check Alexandria CHANGELOG**: https://www.npmjs.com/package/alexandria-worker
2. **Look for new fields**:
   - Author metadata (bio, nationality, photos)
   - Cover images (multiple sizes)
   - New endpoints
   - Breaking changes (major version bump)

### Step 2: Update Dependency

```bash
# Update to specific version
npm install alexandria-worker@2.2.4

# Update to latest
npm install alexandria-worker@latest
```

### Step 3: Update BendV3 Schemas

If Alexandria added new fields, update our schemas:

**File:** `packages/schemas/src/book.ts`

```typescript
// Example: Adding new Alexandria fields
export const AuthorReferenceSchema = z.object({
  name: z.string(),
  key: z.string().optional(),
  // NEW: Add fields from Alexandria
  bio: z.string().optional(),
  nationality: z.string().optional(),
  // ...
})
```

### Step 4: Update API Responses

**File:** `src/api-v3/index.ts`

Update book transformation logic to pass through new fields:

```typescript
// Example: Passing through enriched author data
const authors = workAuthors.map((a: any) => {
  if (typeof a === 'object' && a.name) {
    return {
      name: a.name,
      key: a.key,
      // NEW: Pass through enriched metadata
      bio: a.bio,
      nationality: a.nationality,
      // ...
    }
  }
  return a.name
})
```

**Locations to update:**
- ✅ `GET /v3/books/search` - Search results (line ~200)
- ✅ `GET /v3/books/:isbn` - ISBN lookup (line ~785)
- ✅ `POST /v3/books/enrich` - Enrichment (lines ~475, ~575)

### Step 5: Update OpenAPI Spec

```bash
# Update static OpenAPI spec with new schemas
# (Manual edit or use jq script)
vim src/api-v3/openapi-static.json
```

### Step 6: Rebuild & Publish npm Package

```bash
# Bump version (minor for new fields)
npm version minor  # 3.2.0 → 3.3.0

# Rebuild schemas package
cd packages/schemas
npm run build
cd ../..

# Rebuild API client
cd packages/api-client
npm run generate  # Regenerate from OpenAPI spec
npm run build
npm publish       # Publish to npm
cd ../..
```

### Step 7: Update Contract Tests

**File:** `tests/integration/alexandria-contract.test.ts`

Update version references and add tests for new fields:

```typescript
/**
 * Package: alexandria-worker@2.2.4 (updated from 2.2.1)
 */

it('should return enriched author metadata', async () => {
  const book = await alexandria.api.search.$get({ query: { isbn: '...' } })
  const author = book.data.results[0].authors[0]

  // NEW: Test enriched fields
  expect(author).toHaveProperty('bio')
  expect(author).toHaveProperty('nationality')
})
```

### Step 8: Run Tests

```bash
# Run all tests
npm run test:safe

# Run contract tests specifically
npm run test:alexandria
```

### Step 9: Update CHANGELOG

**File:** `CHANGELOG.md`

```markdown
## [3.3.0] - 2026-01-05

### Added
- **V3 API:** Exposed Alexandria v2.2.4 enriched author metadata
  - Author bio, nationality, photos
  - Multiple cover image sizes

### Changed
- **Dependency:** Updated alexandria-worker from v2.2.3 → v2.2.4
- **npm Package:** @jukasdrj/bookstrack-api-client v3.3.0
```

### Step 10: Deploy to Production

```bash
# Deploy worker
npm run deploy

# Verify deployment
curl https://api.oooefam.net/health
curl https://api.oooefam.net/v3/openapi.json | jq '.info.version'
```

---

## Version Compatibility Matrix

| BendV3 Version | Alexandria Version | npm Package Version | Status |
|----------------|-------------------|---------------------|--------|
| 3.3.0 | 2.2.4 | @jukasdrj/bookstrack-api-client@3.3.0 | ✅ Current |
| 3.2.1 | 2.2.3 | @jukasdrj/bookstrack-api-client@3.2.0 | 🟡 Outdated |
| 3.2.0 | 2.2.1 | @jukasdrj/bookstrack-api-client@3.2.0 | 🟡 Outdated |

---

## Breaking Change Protocol

If Alexandria releases a **major version** (e.g., v3.0.0):

### 🚨 Immediate Actions

1. **DO NOT auto-update** - Major versions may have breaking changes
2. **Review Alexandria's migration guide**
3. **Update contract tests first** - Let TypeScript catch API changes
4. **Test in development environment**
5. **Create migration plan** - May require BendV3 major version bump

### 📋 Breaking Change Checklist

- [ ] Review Alexandria CHANGELOG for breaking changes
- [ ] Update TypeScript types in `src/types/alexandria-types.ts`
- [ ] Fix TypeScript compilation errors
- [ ] Update all API response transformations
- [ ] Run full test suite: `npm test`
- [ ] Test against production Alexandria API
- [ ] Document breaking changes in CHANGELOG
- [ ] Consider BendV3 major version bump (e.g., v4.0.0)

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/alexandria-version-check.yml`

**Triggers:**
- 📅 Daily at 9 AM UTC
- 🔄 On PR touching `package.json`
- 🖱️ Manual workflow dispatch

**Outputs:**
- Creates GitHub Issue if update available
- Comments on PR if update needed during dependency changes

### Adding to Existing CI/CD

```yaml
# Add to your deployment workflow
- name: Check Alexandria Version
  run: npm run check-alexandria-version
  continue-on-error: true  # Don't block deployment, just warn
```

---

## Troubleshooting

### Issue: Version check fails with npm registry error

**Solution:**
```bash
# Check npm registry connectivity
curl https://registry.npmjs.org/alexandria-worker/latest

# Or use local fallback
npm info alexandria-worker version
```

### Issue: TypeScript errors after Alexandria update

**Solution:**
1. Check `node_modules/alexandria-worker/types.ts` for changes
2. Update `src/types/alexandria-types.ts` to match
3. Run `npm run lint:fix` to auto-fix imports

### Issue: Contract tests failing after update

**Solution:**
1. Review Alexandria's API response changes
2. Update test assertions in `tests/integration/alexandria-contract.test.ts`
3. Verify production API matches test expectations

---

## Related Documentation

- [API Versioning Strategy](API_VERSIONING.md)
- [Alexandria RPC Migration Guide](ALEXANDRIA_RPC_MIGRATION.md)
- [Deployment Guide](deployment/DEPLOYMENT.md)

---

**Maintained by:** Backend Platform Team
**Questions?** Create an issue with label `alexandria-sync`
