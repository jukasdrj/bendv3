# CI Contract Check Migration Summary

**Date:** December 11, 2025
**Status:** V3 Code-First OpenAPI Contract Enforcement

## What Changed

The GitHub Actions workflow `.github/workflows/contract-check.yml` was updated to support V3's **code-first OpenAPI generation** using @hono/zod-openapi.

### Before (V2)

```yaml
# Checked for docs/openapi.yaml (manually maintained)
# Always skipped (file removed after V2 sunset)
```

### After (V3)

```yaml
# 1. Starts wrangler dev server in CI
# 2. Fetches auto-generated /v3/openapi.json
# 3. Compares against docs/v3-openapi-baseline.json
# 4. Detects breaking changes with openapi-diff
# 5. Validates spec format with Spectral
```

## New Files

| File | Purpose |
|------|---------|
| `docs/v3-openapi-baseline.json` | Committed snapshot for contract enforcement |
| `docs/V3_CONTRACT_TESTING.md` | Full documentation on contract testing workflow |
| `scripts/generate-openapi-baseline.sh` | Helper script to generate baseline locally |
| `docs/CI_CONTRACT_CHECK_MIGRATION.md` | This file (migration summary) |

## Updated Files

| File | Changes |
|------|---------|
| `.github/workflows/contract-check.yml` | Complete rewrite for V3 runtime generation |
| `scripts/detect-breaking-changes.ts` | Added stdin support, updated default paths |
| `package.json` | Updated `generate:openapi` script |
| `.gitignore` | Added `docs/v3-openapi-current.json` (CI temp file) |

## How to Use

### First-Time Setup

Generate the baseline spec:

```bash
npm run generate:openapi
git add docs/v3-openapi-baseline.json
git commit -m "chore: add V3 OpenAPI baseline"
```

### Making API Changes

1. **Edit Zod schemas** in `src/api-v3/`
2. **Test locally:**
   ```bash
   npm run dev
   curl http://localhost:8787/v3/openapi.json | jq '.paths | keys'
   ```
3. **Create PR** - CI will auto-detect breaking changes

### Updating Baseline (After Breaking Changes)

```bash
# Regenerate baseline
npm run generate:openapi

# Review changes
git diff docs/v3-openapi-baseline.json

# Commit with BREAKING CHANGE tag
git add docs/v3-openapi-baseline.json
git commit -m "feat: add new field to book response

BREAKING CHANGE: removed deprecated 'legacyId' field"
```

## CI Workflow Details

### Job 1: `detect-breaking-changes`

**Steps:**
1. Checkout code (with full git history)
2. Install dependencies
3. Start `wrangler dev --port 8788 --local` in background
4. Wait for `/health` endpoint (max 30s)
5. Fetch `/v3/openapi.json` → `docs/v3-openapi-current.json`
6. Check if baseline exists (`docs/v3-openapi-baseline.json`)
7. Run `openapi-diff` to compare specs
8. Comment on PR if breaking changes found
9. Cleanup wrangler dev server
10. Fail if breaking changes detected (unless `[skip-breaking-check]`)

### Job 2: `validate-spec`

**Steps:**
1. Checkout code
2. Install dependencies
3. Start wrangler dev server
4. Fetch `/v3/openapi.json`
5. Run Spectral linter (`.spectral.yaml` rules)
6. Cleanup wrangler dev server

## Triggers

Workflow runs on:

**Pull Requests:**
- Changes to `docs/v3-openapi-baseline.json`
- Changes to `src/api-v3/**/*.ts`
- Changes to any `src/**/*.ts` or `src/**/*.js`

**Pushes to main/bendv3:**
- Changes to `docs/v3-openapi-baseline.json`
- Changes to `src/api-v3/**/*.ts`

## Skipping Checks

Add `[skip-breaking-check]` to commit message or PR title:

```bash
git commit -m "refactor: internal cleanup [skip-breaking-check]"
```

**Use cases:**
- Intentional breaking changes during migrations
- Internal refactoring that doesn't affect public API
- Emergency hotfixes (with caution)

## Troubleshooting

### "Dev server not ready" in CI

**Symptom:** Timeout after 30 seconds waiting for server

**Fix:** Increase timeout in workflow YAML:
```yaml
for i in {1..60}; do  # Was {1..30}
```

### "Baseline spec not found"

**Symptom:** CI skips checks with "baseline_exists=false"

**Fix:** Generate baseline:
```bash
npm run generate:openapi
git add docs/v3-openapi-baseline.json
git commit -m "chore: add V3 OpenAPI baseline"
```

### False positive breaking changes

**Symptom:** `openapi-diff` reports breaking changes for safe additions

**Workaround:**
1. Review the diff manually in CI logs
2. If truly non-breaking, update baseline:
   ```bash
   npm run generate:openapi
   git add docs/v3-openapi-baseline.json
   git commit -m "chore: update baseline after safe API additions"
   ```

### Spectral validation warnings

**Symptom:** Linter reports warnings on auto-generated spec

**Fix:** Update Zod schemas to match OpenAPI best practices, or adjust `.spectral.yaml` rules

## Architecture Benefits

### Code-First Advantages

1. **No drift** - Spec always matches implementation
2. **Type safety** - Full TypeScript inference from Zod schemas
3. **Single source of truth** - Schemas define validation + spec
4. **Less maintenance** - No manual YAML editing

### Baseline Snapshot Benefits

1. **Git history** - Track API evolution over time
2. **Pre-merge validation** - Catch breaking changes before production
3. **Documentation** - Baseline is human-readable contract
4. **CI efficiency** - No need to fetch from remote endpoints

## Related Documentation

- **Full Guide:** `docs/V3_CONTRACT_TESTING.md`
- **V3 API Design:** `CLAUDE.md` - V3 API section
- **Breaking Changes Script:** `scripts/detect-breaking-changes.ts`
- **CI Workflow:** `.github/workflows/contract-check.yml`
- **V3 Implementation:** `src/api-v3/index.ts`

## Migration Checklist

- [x] Update `.github/workflows/contract-check.yml` for V3 runtime generation
- [x] Update `scripts/detect-breaking-changes.ts` with stdin support
- [x] Create `scripts/generate-openapi-baseline.sh` helper script
- [x] Update `package.json` scripts
- [x] Add `.gitignore` entries for temporary spec files
- [x] Document workflow in `docs/V3_CONTRACT_TESTING.md`
- [ ] Generate initial baseline: `npm run generate:openapi`
- [ ] Test CI workflow on PR

## Next Steps

1. **Generate baseline:** Run `npm run generate:openapi` and commit
2. **Test CI:** Create a test PR that modifies V3 API
3. **Verify:** Ensure breaking change detection works as expected
4. **Document:** Update team wiki with new workflow

---

**Maintained By:** @jukasdrj
**Last Updated:** December 11, 2025
