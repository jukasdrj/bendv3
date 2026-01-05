# Utils Migration Checklist

**Migration:** `src/utils/` flat structure → organized subdirectories
**Timeline:** 4 weeks (Jan 2026)
**Risk Level:** Medium (33 files, 46 imports affected)

---

## Pre-Migration Checks

### ✅ Preparation
- [ ] Review `docs/utils-consolidation-plan.md`
- [ ] Review `docs/utils-structure-before-after.md`
- [ ] Get approval from @jukasdrj
- [ ] Create feature branch: `refactor/utils-consolidation`
- [ ] Backup current test results:
  ```bash
  npm run test:safe > tests-before.log 2>&1
  npm run lint > lint-before.log 2>&1
  tsc --noEmit > tsc-before.log 2>&1
  ```
- [ ] Document current import counts:
  ```bash
  grep -r "from.*utils/" src --include="*.ts" | wc -l > imports-before.txt
  ```

---

## Phase 1: Low-Risk Moves (Week 1)

### Day 1: R2 Utilities (3 files, 1 import)
- [ ] Create directory: `mkdir -p src/utils/r2`
- [ ] Move files:
  ```bash
  git mv src/utils/r2-utils.ts src/utils/r2/
  git mv src/utils/r2-lifecycle.ts src/utils/r2/
  git mv src/utils/r2-hibernation.ts src/utils/r2/
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/r2-utils|from \1utils/r2/r2-utils|g' \
    -e 's|from \(.*\)utils/r2-lifecycle|from \1utils/r2/r2-lifecycle|g' \
    -e 's|from \(.*\)utils/r2-hibernation|from \1utils/r2/r2-hibernation|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Run linter: `npm run lint`
- [ ] Check TypeScript: `tsc --noEmit`
- [ ] Commit: `git commit -m "refactor(utils): Move R2 utilities to r2/ subdirectory"`

### Day 2: Analytics Utilities (3 files, 3 imports)
- [ ] Create directory: `mkdir -p src/utils/analytics`
- [ ] Move files:
  ```bash
  git mv src/utils/analytics.ts src/utils/analytics/
  git mv src/utils/analytics-logger.ts src/utils/analytics/
  git mv src/utils/analytics-queries.ts src/utils/analytics/
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/analytics\.|from \1utils/analytics/analytics.|g' \
    -e 's|from \(.*\)utils/analytics-logger|from \1utils/analytics/analytics-logger|g' \
    -e 's|from \(.*\)utils/analytics-queries|from \1utils/analytics/analytics-queries|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Run linter: `npm run lint`
- [ ] Check TypeScript: `tsc --noEmit`
- [ ] Commit: `git commit -m "refactor(utils): Move analytics utilities to analytics/ subdirectory"`

### Day 3: Database & Jobs Utilities (3 files, 3 imports)
- [ ] Create directories:
  ```bash
  mkdir -p src/utils/database
  mkdir -p src/utils/jobs
  ```
- [ ] Move files:
  ```bash
  git mv src/utils/d1-wrapper.ts src/utils/database/
  git mv src/utils/progress-reporter.ts src/utils/jobs/
  git mv src/utils/csv-processor-core.ts src/utils/jobs/ 2>/dev/null || true
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/d1-wrapper|from \1utils/database/d1-wrapper|g' \
    -e 's|from \(.*\)utils/progress-reporter|from \1utils/jobs/progress-reporter|g' \
    -e 's|from \(.*\)utils/csv-processor-core|from \1utils/jobs/csv-processor-core|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Run linter: `npm run lint`
- [ ] Check TypeScript: `tsc --noEmit`
- [ ] Commit: `git commit -m "refactor(utils): Move database & jobs utilities to subdirectories"`

### Day 4: Phase 1 Verification
- [ ] Run full test suite: `npm run test:safe`
- [ ] Compare test results: `diff tests-before.log <(npm run test:safe 2>&1)`
- [ ] Verify all imports resolved: `tsc --noEmit`
- [ ] Check for broken imports:
  ```bash
  grep -r "from.*utils/r2-" src && echo "❌ Found old R2 imports" || echo "✅ R2 imports updated"
  grep -r "from.*utils/analytics\." src && echo "❌ Found old analytics imports" || echo "✅ Analytics imports updated"
  ```
- [ ] Document Phase 1 completion in PR description

---

## Phase 2: Medium-Risk Moves (Week 2)

### Day 5-6: Validation Utilities (4 files, 4 imports)
- [ ] Create directory: `mkdir -p src/utils/validation`
- [ ] Move files:
  ```bash
  git mv src/utils/isbn-validation.ts src/utils/validation/
  git mv src/utils/book-validation.ts src/utils/validation/
  git mv src/utils/json-validator.ts src/utils/validation/
  git mv src/utils/csv-validator.ts src/utils/validation/
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/isbn-validation|from \1utils/validation/isbn-validation|g' \
    -e 's|from \(.*\)utils/book-validation|from \1utils/validation/book-validation|g' \
    -e 's|from \(.*\)utils/json-validator|from \1utils/validation/json-validator|g' \
    -e 's|from \(.*\)utils/csv-validator|from \1utils/validation/csv-validator|g' \
    {} \;
  ```
- [ ] Update test imports:
  ```bash
  find tests -type f -name "*.test.ts" -exec sed -i '' \
    -e 's|from.*utils/isbn-validation|from ../../utils/validation/isbn-validation|g' \
    -e 's|from.*utils/csv-validator|from ../utils/validation/csv-validator|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Commit: `git commit -m "refactor(utils): Move validation utilities to validation/ subdirectory"`

### Day 7-8: Cache & Concurrency Utilities (6 files, 6 imports)
- [ ] Create directories:
  ```bash
  mkdir -p src/utils/cache
  mkdir -p src/utils/concurrency
  ```
- [ ] Move cache files:
  ```bash
  git mv src/utils/cache.ts src/utils/cache/
  git mv src/utils/cache-keys.ts src/utils/cache/
  git mv src/utils/kv-results-handler.ts src/utils/cache/
  ```
- [ ] Move concurrency files:
  ```bash
  git mv src/utils/retry.ts src/utils/concurrency/
  git mv src/utils/concurrency-limiter.ts src/utils/concurrency/
  git mv src/utils/rate-limiter.ts src/utils/concurrency/ 2>/dev/null || true
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/cache\.|from \1utils/cache/cache.|g' \
    -e 's|from \(.*\)utils/cache-keys|from \1utils/cache/cache-keys|g' \
    -e 's|from \(.*\)utils/kv-results-handler|from \1utils/cache/kv-results-handler|g' \
    -e 's|from \(.*\)utils/retry|from \1utils/concurrency/retry|g' \
    -e 's|from \(.*\)utils/concurrency-limiter|from \1utils/concurrency/concurrency-limiter|g' \
    -e 's|from \(.*\)utils/rate-limiter|from \1utils/concurrency/rate-limiter|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Commit: `git commit -m "refactor(utils): Move cache & concurrency utilities to subdirectories"`

### Day 9-10: Book Utilities (5 files, 6 imports)
- [ ] Create directory: `mkdir -p src/utils/book`
- [ ] Move files:
  ```bash
  git mv src/utils/book-metadata.ts src/utils/book/
  git mv src/utils/quality-scoring.ts src/utils/book/
  git mv src/utils/confidence.ts src/utils/book/
  git mv src/utils/string-similarity.ts src/utils/book/
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/book-metadata|from \1utils/book/book-metadata|g' \
    -e 's|from \(.*\)utils/quality-scoring|from \1utils/book/quality-scoring|g' \
    -e 's|from \(.*\)utils/confidence|from \1utils/book/confidence|g' \
    -e 's|from \(.*\)utils/string-similarity|from \1utils/book/string-similarity|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Commit: `git commit -m "refactor(utils): Move book utilities to book/ subdirectory"`

### Day 11: Phase 2 Verification
- [ ] Run full test suite: `npm run test:safe`
- [ ] Verify TypeScript: `tsc --noEmit`
- [ ] Check import consistency:
  ```bash
  grep -r "from.*utils/cache\." src && echo "❌ Found old cache imports" || echo "✅ Cache imports updated"
  grep -r "from.*utils/book-metadata" src && echo "❌ Found old book imports" || echo "✅ Book imports updated"
  ```

---

## Phase 3: High-Risk Moves (Week 3)

### Day 12-13: HTTP Utilities (3 files, 8+ imports) ⚠️ HIGH RISK
- [ ] **CHECKPOINT:** Verify all tests pass before proceeding
  ```bash
  npm run test:safe
  npm run lint
  tsc --noEmit
  ```
- [ ] Create directory: `mkdir -p src/utils/http`
- [ ] Move files ONE AT A TIME:
  ```bash
  # Move response-builder.ts (8 imports - highest risk)
  git mv src/utils/response-builder.ts src/utils/http/

  # Update imports IMMEDIATELY
  find src -type f -name "*.ts" -exec sed -i '' \
    's|from \(.*\)utils/response-builder|from \1utils/http/response-builder|g' {} \;

  # Verify immediately
  tsc --noEmit || { echo "❌ TypeScript errors - rolling back"; git checkout src/utils/response-builder.ts; exit 1; }

  # Test immediately
  npm run test:safe || { echo "❌ Tests failed - rolling back"; git checkout src/; exit 1; }

  # Commit immediately
  git commit -m "refactor(utils): Move response-builder to http/ subdirectory"
  ```
- [ ] Move error-status.ts:
  ```bash
  git mv src/utils/error-status.ts src/utils/http/
  find src -type f -name "*.ts" -exec sed -i '' \
    's|from \(.*\)utils/error-status|from \1utils/http/error-status|g' {} \;
  tsc --noEmit && npm run test:safe
  git commit -m "refactor(utils): Move error-status to http/ subdirectory"
  ```
- [ ] Move streaming-response.ts:
  ```bash
  git mv src/utils/streaming-response.ts src/utils/http/
  find src -type f -name "*.ts" -exec sed -i '' \
    's|from \(.*\)utils/streaming-response|from \1utils/http/streaming-response|g' {} \;
  tsc --noEmit && npm run test:safe
  git commit -m "refactor(utils): Move streaming-response to http/ subdirectory"
  ```

### Day 14-15: Transform Utilities (4 files, 6 imports)
- [ ] Create directory: `mkdir -p src/utils/transform`
- [ ] Move files:
  ```bash
  git mv src/utils/normalization.ts src/utils/transform/
  git mv src/utils/book-mappers.ts src/utils/transform/
  git mv src/utils/transform-work.ts src/utils/transform/
  git mv src/utils/response-transformer.ts src/utils/transform/
  ```
- [ ] Update imports:
  ```bash
  find src -type f -name "*.ts" -exec sed -i '' \
    -e 's|from \(.*\)utils/normalization|from \1utils/transform/normalization|g' \
    -e 's|from \(.*\)utils/book-mappers|from \1utils/transform/book-mappers|g' \
    -e 's|from \(.*\)utils/transform-work|from \1utils/transform/transform-work|g' \
    -e 's|from \(.*\)utils/response-transformer|from \1utils/transform/response-transformer|g' \
    {} \;
  ```
- [ ] Run tests: `npm run test:safe`
- [ ] Commit: `git commit -m "refactor(utils): Move transform utilities to transform/ subdirectory"`

### Day 16: Phase 3 Verification
- [ ] Run FULL test suite: `npm test` (if RAM permits) OR `npm run test:safe`
- [ ] Verify TypeScript: `tsc --noEmit`
- [ ] Check for broken imports:
  ```bash
  # Should find NO old import patterns
  grep -r "from.*utils/response-builder'" src && echo "❌ FAILED" || echo "✅ PASSED"
  grep -r "from.*utils/transform-work'" src && echo "❌ FAILED" || echo "✅ PASSED"
  ```
- [ ] Compare total import count:
  ```bash
  grep -r "from.*utils/" src --include="*.ts" | wc -l > imports-after.txt
  diff imports-before.txt imports-after.txt  # Should be same count
  ```

---

## Phase 4: Verification & Cleanup (Week 4)

### Day 17-18: Add Barrel Exports (index.ts)
- [ ] Create `src/utils/http/index.ts`:
  ```typescript
  export * from './response-builder'
  export * from './error-status'
  export * from './streaming-response'
  ```
- [ ] Create `src/utils/validation/index.ts`:
  ```typescript
  export * from './isbn-validation'
  export * from './book-validation'
  export * from './json-validator'
  export * from './csv-validator'
  ```
- [ ] Create barrel exports for ALL subdirectories:
  - `src/utils/transform/index.ts`
  - `src/utils/analytics/index.ts`
  - `src/utils/cache/index.ts`
  - `src/utils/r2/index.ts`
  - `src/utils/concurrency/index.ts`
  - `src/utils/book/index.ts`
  - `src/utils/database/index.ts`
  - `src/utils/jobs/index.ts`
- [ ] Test barrel exports:
  ```bash
  # Ensure imports still work
  tsc --noEmit
  npm run test:safe
  ```
- [ ] Commit: `git commit -m "refactor(utils): Add barrel exports for all subdirectories"`

### Day 19: Update Documentation
- [ ] Update `CLAUDE.md` Code Organization section:
  ```markdown
  src/utils/
  ├── validation/     # Input validation (ISBN, CSV, JSON, book data)
  ├── http/           # HTTP responses, error handling, streaming
  ├── transform/      # Data normalization & format conversion
  ├── analytics/      # Metrics logging & queries
  ├── cache/          # KV cache operations
  ├── r2/             # R2 storage operations
  ├── concurrency/    # Async flow control (retry, rate limit)
  ├── book/           # Book-specific utilities (metadata, quality)
  ├── database/       # D1 database wrappers
  ├── jobs/           # Job orchestration & progress
  └── (root)          # Core utilities (date-utils, secrets, feature-flags)
  ```
- [ ] Update `.claude/CLAUDE.md` with new structure
- [ ] Create migration summary in PR description
- [ ] Commit: `git commit -m "docs: Update CLAUDE.md with new utils structure"`

### Day 20: Final Verification
- [ ] Run FULL test suite:
  ```bash
  npm test  # If RAM permits
  npm run test:safe  # Safe mode
  npm run validate  # Pre-commit check
  ```
- [ ] Run linter: `npm run lint:fix`
- [ ] Check TypeScript: `tsc --noEmit`
- [ ] Verify ALL imports resolved:
  ```bash
  # Should find ZERO old flat imports
  grep -r "from '../utils/response-builder'" src && echo "❌ FAILED" || echo "✅ PASSED"
  grep -r "from '../utils/cache\.ts'" src && echo "❌ FAILED" || echo "✅ PASSED"
  ```
- [ ] Compare before/after metrics:
  ```bash
  echo "Before: $(cat imports-before.txt) imports"
  echo "After: $(cat imports-after.txt) imports"
  echo "Difference should be 0"
  ```

---

## Create Pull Request

### PR Checklist
- [ ] All tests pass (`npm run validate`)
- [ ] TypeScript compiles (`tsc --noEmit`)
- [ ] Biome linter passes (`npm run lint`)
- [ ] Documentation updated (`CLAUDE.md`)
- [ ] Migration script included (for reproducibility)
- [ ] PR title: `refactor: Organize utils into logical subdirectories`
- [ ] PR description includes:
  - Summary of changes (33 files → 11 subdirectories)
  - Rationale (maintainability, discoverability)
  - Testing approach (phased migration)
  - Breaking changes (import path updates)
  - Rollback plan (if needed)

### PR Description Template
```markdown
## Summary
Reorganizes `src/utils/` from flat 33-file structure into 11 logical subdirectories for better maintainability and discoverability.

## Changes
- **33 files moved** into 11 subdirectories (validation, http, transform, analytics, cache, r2, concurrency, book, database, jobs)
- **3 core files kept in root** (date-utils, secrets, feature-flags)
- **46 import paths updated** across 32 source files
- **Added barrel exports** (`index.ts`) for each subdirectory

## Testing
- All phases tested incrementally with `npm run test:safe`
- TypeScript compilation verified after each move
- Full test suite passes (199/199 smoke tests)
- Biome linter passes

## Breaking Changes
Import paths changed from:
```typescript
import { createErrorResponse } from '../utils/response-builder'
```
To:
```typescript
import { createErrorResponse } from '../utils/http/response-builder'
```

All imports updated automatically via migration script.

## Rollback Plan
If issues arise:
```bash
git revert <commit-range>
npm run test:safe
```

---

**Related Docs:**
- `docs/utils-consolidation-plan.md` - Full migration plan
- `docs/utils-structure-before-after.md` - Visual structure comparison
```

---

## Post-Migration Tasks

### Week 5: Add Missing Tests
- [ ] Add tests for `response-builder.ts` (191 lines, 8 imports) - **HIGH PRIORITY**
- [ ] Add tests for `book-metadata.ts` (265 lines, 4 imports) - **HIGH PRIORITY**
- [ ] Add tests for `transform-work.ts` (295 lines, complex logic) - **MEDIUM PRIORITY**
- [ ] Add tests for `analytics.ts` - MEDIUM PRIORITY
- [ ] Add tests for `retry.ts` - MEDIUM PRIORITY
- [ ] Add tests for `concurrency-limiter.ts` - MEDIUM PRIORITY
- [ ] Target: 80% test coverage (currently 61%)

### Week 6: Monitor Production
- [ ] Monitor error rates in production (7-day baseline)
- [ ] Check CloudFlare Analytics for import-related errors
- [ ] Verify no performance regression (P95 latency)
- [ ] Document any issues in GitHub Issues

---

## Rollback Procedures

### Emergency Rollback (Production Issues)
```bash
# Identify problem commit
git log --oneline --grep="refactor(utils)"

# Revert entire migration
git revert <first-commit>^..<last-commit>

# Test rollback
npm run test:safe
npm run lint
tsc --noEmit

# Deploy rollback
npm run deploy
```

### Partial Rollback (Phase-Specific)
```bash
# Revert only Phase 3 (high-risk moves)
git log --oneline --grep="refactor(utils): Move.*http"
git revert <phase3-commits>

# Keep Phase 1 & 2 (low/medium risk)
```

---

## Success Criteria

### Must Pass
- ✅ All tests pass (`npm run validate`)
- ✅ TypeScript compiles (`tsc --noEmit`)
- ✅ Biome linter passes (`npm run lint`)
- ✅ Zero runtime errors in production (7-day monitoring)

### Nice to Have
- ✅ Test coverage increases from 61% → 80%
- ✅ Import consistency (all use new paths)
- ✅ Barrel exports added for clean imports

---

## Troubleshooting

### Issue: TypeScript errors after move
**Solution:**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
rm -rf .tsbuildinfo

# Rebuild
npm run build
tsc --noEmit
```

### Issue: Tests fail after import update
**Solution:**
```bash
# Check test import paths
grep -r "from.*utils/" tests/ | grep -v "from.*utils/[a-z]*/"

# Update test imports manually (sed may miss relative paths)
```

### Issue: Barrel exports cause circular dependencies
**Solution:**
```bash
# Remove barrel exports temporarily
rm src/utils/*/index.ts

# Import directly from files instead
# Example: from '../utils/http/response-builder' (not '../utils/http')
```

---

**Document Version:** 1.0
**Last Updated:** January 3, 2026
**Estimated Effort:** 4 weeks (~8-12 hours)
**Risk Level:** Medium (mitigated by phased approach)
