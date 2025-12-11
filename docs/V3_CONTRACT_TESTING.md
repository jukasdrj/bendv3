# V3 API Contract Testing

This document explains how contract testing works for the V3 API, which uses code-first OpenAPI generation with @hono/zod-openapi.

## Overview

Unlike V2 (which used a manually maintained `docs/openapi.yaml`), V3 auto-generates its OpenAPI spec from Zod schemas at runtime. This means:

- **Source of truth:** Zod schemas in `src/api-v3/`
- **Live spec:** `/v3/openapi.json` endpoint (auto-generated)
- **Baseline:** `docs/v3-openapi-baseline.json` (committed snapshot)
- **Contract enforcement:** CI compares live spec against baseline

## Workflow

### 1. Generate Initial Baseline

The first time you set up contract testing, generate a baseline:

```bash
npm run generate:openapi
```

This will:
1. Start a local wrangler dev server
2. Fetch `/v3/openapi.json`
3. Save to `docs/v3-openapi-baseline.json`
4. Clean up the dev server

Commit the baseline:

```bash
git add docs/v3-openapi-baseline.json
git commit -m "chore: add V3 OpenAPI baseline for contract testing"
```

### 2. CI Contract Checks

On every PR that modifies V3 API code, GitHub Actions will:

1. **Start dev server** - Spin up `wrangler dev` in CI
2. **Generate current spec** - Fetch `/v3/openapi.json`
3. **Compare specs** - Run `openapi-diff` against baseline
4. **Detect breaking changes** - Analyze removals, type changes
5. **Validate format** - Run Spectral linter on generated spec
6. **Comment on PR** - If breaking changes found

**Workflow file:** `.github/workflows/contract-check.yml`

### 3. Making API Changes

#### Non-Breaking Changes ✅

Changes that are **safe** (backward compatible):
- Adding new endpoints
- Adding optional fields to responses
- Adding new enum values
- Making required fields optional

**Action:** No baseline update needed. CI will pass.

#### Breaking Changes ⚠️

Changes that are **breaking** (not backward compatible):
- Removing endpoints
- Removing required fields
- Changing field types (e.g., `string` → `number`)
- Renaming fields without aliasing
- Making optional fields required
- Removing enum values

**Action:** Update the baseline after verifying the breaking change is intentional:

```bash
# Generate new baseline from your local changes
npm run generate:openapi

# Review the diff
git diff docs/v3-openapi-baseline.json

# Commit the updated baseline
git add docs/v3-openapi-baseline.json
git commit -m "feat: update V3 API baseline for [feature name]

BREAKING CHANGE: [description of the breaking change]"
```

### 4. Skipping Contract Checks

In rare cases where you need to bypass the check (e.g., intentional breaking change during migration):

Add `[skip-breaking-check]` to your commit message or PR title:

```bash
git commit -m "feat: remove deprecated endpoint [skip-breaking-check]"
```

**⚠️ Use sparingly!** This bypasses an important safety check.

## Manual Testing

Test contract detection locally:

```bash
# 1. Generate current spec
npm run generate:openapi

# 2. Make some API changes in src/api-v3/

# 3. Generate new spec (will overwrite baseline)
npm run generate:openapi

# 4. Run breaking change detection
npm run detect-breaking-changes -- \
  --base-spec=docs/v3-openapi-baseline.json \
  --current-spec=docs/v3-openapi-baseline.json
```

Or manually:

```bash
# Start dev server
npm run dev

# In another terminal:
curl http://localhost:8787/v3/openapi.json > /tmp/current-spec.json

# Compare against baseline
npm run detect-breaking-changes -- \
  --base-spec=docs/v3-openapi-baseline.json \
  --current-spec=/tmp/current-spec.json
```

## Tools & Configuration

### Breaking Change Detection

**Script:** `scripts/detect-breaking-changes.ts`

**Library:** `openapi-diff` (analyzes structural changes)

**Usage:**
```bash
npm run detect-breaking-changes -- \
  --base-spec=path/to/baseline.json \
  --current-spec=path/to/current.json
```

**Supports stdin:**
```bash
cat spec.json | npm run detect-breaking-changes -- --current-spec=-
```

### Spectral Validation

**Config:** `.spectral.yaml`

**Rules:**
- OpenAPI 3.1 compliance
- ResponseEnvelope format enforcement
- Standard OpenAPI best practices

**Usage:**
```bash
npx @stoplight/spectral-cli lint docs/v3-openapi-baseline.json
```

## CI Environment Variables

The workflow uses these environment variables:

- `WRANGLER_PID` - Process ID of dev server (for cleanup)
- `GITHUB_OUTPUT` - GitHub Actions output for conditional steps

## Troubleshooting

### CI fails with "Dev server not ready"

**Cause:** Server took >30s to start (rare on GitHub Actions)

**Fix:** Increase timeout in `.github/workflows/contract-check.yml`:

```yaml
for i in {1..60}; do  # Was {1..30}
```

### False positive breaking changes

**Cause:** `openapi-diff` can be overly strict on minor changes

**Workaround:** Review the diff manually, update baseline if safe

### Baseline out of sync

**Cause:** Baseline not updated after legitimate breaking change

**Fix:** Regenerate baseline:

```bash
npm run generate:openapi
git add docs/v3-openapi-baseline.json
git commit -m "chore: sync V3 OpenAPI baseline"
```

## Architecture Notes

### Why Code-First?

V3 uses **code-first** OpenAPI generation because:

1. **Single source of truth** - Zod schemas define both runtime validation and spec
2. **Type safety** - Full TypeScript inference from schemas
3. **No drift** - Spec always matches implementation
4. **Less maintenance** - No manual YAML editing

### Why Baseline File?

We commit a baseline snapshot because:

1. **Git history** - Track API evolution over time
2. **Pre-merge validation** - Catch breaking changes before deployment
3. **Documentation** - Baseline is human-readable contract
4. **CI efficiency** - No need to fetch from remote endpoints

### Comparison to V2

| Aspect | V2 (Deprecated) | V3 (Current) |
|--------|----------------|--------------|
| **Spec source** | Manual `docs/openapi.yaml` | Auto-generated from Zod schemas |
| **Update process** | Hand-edit YAML | Edit Zod schemas in `src/api-v3/` |
| **Validation** | Pre-commit Spectral | CI generates spec + Spectral |
| **Breaking changes** | Compare committed YAML files | Compare baseline vs. generated spec |
| **SDK generation** | From `openapi.yaml` | From `/v3/openapi.json` endpoint |

## Related Documentation

- **V3 API Design:** `CLAUDE.md` - V3 API section
- **Breaking Changes Script:** `scripts/detect-breaking-changes.ts`
- **CI Workflow:** `.github/workflows/contract-check.yml`
- **Spectral Config:** `.spectral.yaml`
- **V3 API Implementation:** `src/api-v3/index.ts`

---

**Last Updated:** December 11, 2025
**Maintained By:** @jukasdrj
