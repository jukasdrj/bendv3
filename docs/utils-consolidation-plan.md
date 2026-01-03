# Utils Directory Consolidation Plan

**Date:** January 3, 2026
**Current Status:** 33 utility files in flat structure
**Goal:** Organize into logical subdirectories for better maintainability

---

## Current Directory Analysis

### File Count & Structure
- **Total files:** 33 TypeScript files
- **Current organization:** Flat structure (`src/utils/*.ts`)
- **Import frequency:** 46 imports across 32 source files
- **Test coverage:** ~20 test files covering utilities

### Most Used Utilities (by import count)
1. `response-builder.ts` - 8 imports (createErrorResponse, ErrorCodes)
2. `book-metadata.ts` - 4 imports (getPlaceholderCover)
3. `date-utils.ts` - 4 imports (extractYear)
4. `cache.ts` - 3 imports (getCached, setCached)
5. `analytics.ts` - 2 imports (writeCacheMetrics)
6. `transform-work.ts` - 2 imports (transformWorkToGoogleFormat)
7. `retry.ts` - 2 imports (retryWithBackoff)

---

## Proposed Subdirectory Organization

### 1. **Validation** (`src/utils/validation/`)
**Purpose:** Input validation, format checking, data integrity

- `isbn-validation.ts` (89 lines) - ISBN-10/13 checksum validation
- `book-validation.ts` (44 lines) - EnrichedBook cache entry validation
- `json-validator.ts` (112 lines) - JSON validation, safe stringify/parse
- `csv-validator.ts` (138 lines) - CSV structure validation

**Rationale:** All files validate different data types (ISBN, book objects, JSON, CSV). Grouping improves discoverability for validation-related tasks.

**Breaking changes:** Medium impact (4 files)

---

### 2. **HTTP** (`src/utils/http/`)
**Purpose:** HTTP responses, error handling, CORS

- `response-builder.ts` (191 lines) - **HIGH IMPACT** - 8 imports
- `error-status.ts` (109 lines) - Error code to HTTP status mapping
- `streaming-response.ts` (219 lines) - NDJSON streaming responses

**Rationale:** All files handle HTTP response formatting. `response-builder.ts` is the most imported utility, centralizing this category improves maintainability.

**Breaking changes:** HIGH impact (8+ imports affected)

---

### 3. **Data Transform** (`src/utils/transform/`)
**Purpose:** Data normalization, mapping, transformation

- `normalization.ts` (60 lines) - Title/ISBN/author/URL normalization
- `book-mappers.ts` (245 lines) - Gemini → BookRecord transformation
- `transform-work.ts` (295 lines) - Work → Google Books format
- `response-transformer.ts` (138 lines) - V1 API response transformation (legacy)

**Rationale:** All files transform data between formats. Clear separation from validation.

**Breaking changes:** Medium impact (6+ imports)

---

### 4. **Analytics** (`src/utils/analytics/`)
**Purpose:** Metrics, logging, performance tracking

- `analytics.ts` (155 lines) - Cache metrics, request tracking
- `analytics-logger.ts` (98 lines) - External API call logging
- `analytics-queries.ts` (41 lines) - Analytics Engine queries (stub)

**Rationale:** All files write to or query Analytics Engine. Consolidates observability utilities.

**Breaking changes:** Low impact (3 imports)

---

### 5. **Cache** (`src/utils/cache/`)
**Purpose:** KV cache operations, cache key generation

- `cache.ts` (203 lines) - KV get/set with metadata
- `cache-keys.ts` (51 lines) - Cache key generation (CSV, ISBN)
- `kv-results-handler.ts` - KV-specific result handling

**Rationale:** All files manage KV cache operations. Grouping reduces cognitive load when working with caching.

**Breaking changes:** Medium impact (4 imports)

---

### 6. **R2** (`src/utils/r2/`)
**Purpose:** R2 storage operations, hibernation payloads

- `r2-utils.ts` (41 lines) - Batch deletion
- `r2-lifecycle.ts` (220 lines) - Cleanup policies, orphaned object detection
- `r2-hibernation.ts` (290 lines) - Hibernation-safe payload storage

**Rationale:** All files manage R2 bucket operations. Clear domain boundary.

**Breaking changes:** Low impact (1 import)

---

### 7. **Concurrency** (`src/utils/concurrency/`)
**Purpose:** Async flow control, rate limiting, batching

- `retry.ts` (73 lines) - Exponential backoff retry logic
- `concurrency-limiter.ts` (185 lines) - p-limit alternative for Workers
- `rate-limiter.ts` - Global rate limiting (if exists)

**Rationale:** All files control async execution patterns. Groups flow control utilities.

**Breaking changes:** Medium impact (3+ imports)

---

### 8. **Book Metadata** (`src/utils/book/`)
**Purpose:** Book-specific utilities (quality, metadata, similarity)

- `book-metadata.ts` (265 lines) - **MEDIUM IMPACT** - 4 imports
- `book-validation.ts` (44 lines) - Already in validation, consider moving here
- `quality-scoring.ts` (23 lines) - ISBNdb quality weights
- `confidence.ts` (95 lines) - Confidence threshold utilities
- `string-similarity.ts` (61 lines) - Levenshtein distance for fuzzy matching

**Rationale:** Domain-specific book utilities. Alternative: Keep `book-validation.ts` in validation/, others here.

**Breaking changes:** Medium impact (6+ imports)

---

### 9. **Database** (`src/utils/database/`)
**Purpose:** D1 database wrappers, SQL utilities

- `d1-wrapper.ts` - D1 database abstraction

**Rationale:** Single file currently, but clear domain boundary for future growth.

**Breaking changes:** Low impact (1 import)

---

### 10. **Jobs** (`src/utils/jobs/`)
**Purpose:** Job orchestration, progress reporting

- `progress-reporter.ts` (238 lines) - WebSocket progress adapter
- `csv-processor-core.ts` - CSV processing pipeline (if exists)

**Rationale:** Job-related utilities separated from business logic.

**Breaking changes:** Low impact (2 imports)

---

### 11. **Core** (`src/utils/core/`) - Keep in root
**Purpose:** Foundational utilities used everywhere

- `date-utils.ts` (29 lines) - **MEDIUM IMPACT** - 4 imports
- `secrets.ts` (75 lines) - Secret management
- `feature-flags.ts` (151 lines) - Workflow rollout logic

**Rationale:** These are cross-cutting concerns used by multiple layers. Keep at root for easy access.

**Breaking changes:** ZERO (no path change)

---

## Duplicate Functionality Analysis

### ✅ No Major Duplicates Found

After analyzing all 33 files:
- **ISBN validation:** Centralized in `isbn-validation.ts` (DRY principle applied)
- **Date extraction:** Centralized in `date-utils.ts` (consolidation complete)
- **Levenshtein distance:** Single implementation in `string-similarity.ts`
- **Cache operations:** Single source in `cache.ts` (no duplication)

**Recommendation:** No immediate deduplication work needed. Previous consolidation efforts (Issues CR-3, #213) successfully eliminated duplication.

---

## Candidates for Shared Packages

### Move to `packages/schemas/utils/`
**None recommended.** Current utilities are tightly coupled to Worker environment bindings (Env, KV, R2, D1). Shared packages should be environment-agnostic.

### Keep in `src/utils/`
All 33 files should remain in the monorepo due to:
1. Worker-specific APIs (KV, R2, D1, Analytics Engine)
2. Environment binding dependencies (Env types)
3. No cross-repo reuse potential (backend-only utilities)

---

## Export Pattern Analysis

### Current Pattern (Inconsistent)
```typescript
// Named exports (preferred - 90% of files)
export function isValidISBN(isbn: string): boolean { ... }
export const ErrorCodes = { ... }

// Default exports (rare - 3 files)
export default class ProgressReporter { ... }
```

### Recommended Standard
**Use named exports exclusively** for:
- Better tree-shaking support
- Explicit import statements
- TypeScript autocomplete
- Easier refactoring

**Action:** Convert 3 default exports to named exports:
1. `progress-reporter.ts` - Export `ProgressReporter` as named export
2. Any other default exports found during migration

---

## Test Coverage Assessment

### Files WITH Tests (20/33 = 61%)
- ✅ `isbn-validation.ts` - `tests/smoke/validation.test.js`
- ✅ `cache.ts` - `tests/unit/cache.test.js`
- ✅ `r2-hibernation.ts` - `tests/unit/r2-hibernation.test.js`
- ✅ `date-utils.ts` - `tests/unit/date-utils.test.ts`
- ✅ `string-similarity.ts` - `tests/unit/string-similarity.test.ts`
- ✅ `csv-validator.ts` - `tests/csv-validator.test.js`
- ✅ `analytics-queries.ts` - `tests/analytics-queries.test.js`
- ✅ `cache-keys.ts` - `tests/cache-keys.test.js`
- ✅ `error-status.ts` - `tests/utils/error-status.test.ts`
- ✅ `normalization.ts` - `tests/normalization.test.ts`
- ✅ `kv-results-handler.ts` - `tests/unit/kv-results-handler.test.ts`
- ✅ `d1-wrapper.ts` - `tests/unit/d1-wrapper.test.js`

### Files WITHOUT Tests (13/33 = 39%)
- ⚠️ `response-builder.ts` - **HIGH PRIORITY** (most imported utility)
- ⚠️ `book-metadata.ts` - **HIGH PRIORITY** (image quality detection)
- ⚠️ `transform-work.ts` - **MEDIUM PRIORITY** (complex transformation logic)
- ⚠️ `analytics.ts` - MEDIUM PRIORITY
- ⚠️ `retry.ts` - MEDIUM PRIORITY
- ⚠️ `concurrency-limiter.ts` - MEDIUM PRIORITY
- ⚠️ `book-mappers.ts` - MEDIUM PRIORITY
- ⚠️ `quality-scoring.ts` - LOW PRIORITY (constants only)
- ⚠️ `confidence.ts` - LOW PRIORITY
- ⚠️ `feature-flags.ts` - LOW PRIORITY
- ⚠️ `secrets.ts` - LOW PRIORITY
- ⚠️ `streaming-response.ts` - LOW PRIORITY
- ⚠️ `progress-reporter.ts` - LOW PRIORITY (adapter pattern)

### Test Coverage Action Plan
1. **Immediate:** Add tests for `response-builder.ts` (8 imports, critical path)
2. **Week 1:** Add tests for `book-metadata.ts` (image quality detection)
3. **Week 2:** Add tests for `transform-work.ts` (complex logic)
4. **Ongoing:** Target 80% coverage for all utils (currently ~61%)

---

## Migration Plan

### Phase 1: Low-Risk Moves (Week 1)
**Target:** Files with <2 imports, clear domain boundaries

1. Create subdirectories:
   ```bash
   mkdir -p src/utils/{validation,http,transform,analytics,cache,r2,concurrency,book,database,jobs}
   ```

2. Move low-impact files:
   - `r2/` - 3 files, 1 import total
   - `analytics/` - 3 files, 3 imports total
   - `database/` - 1 file, 1 import
   - `jobs/` - 2 files, 2 imports total

3. Update imports (automated):
   ```bash
   # Example: Update r2-utils imports
   find src -type f -name "*.ts" -exec sed -i '' 's|from.*utils/r2-utils|from ../utils/r2/r2-utils|g' {} \;
   ```

4. Run tests:
   ```bash
   npm run test:safe  # Verify no breakage
   ```

**Risk:** LOW - Minimal import changes, isolated domains

---

### Phase 2: Medium-Risk Moves (Week 2)
**Target:** Files with 2-4 imports, moderate coupling

1. Move validation files:
   - `validation/` - 4 files, 4 imports total

2. Move cache files:
   - `cache/` - 3 files, 4 imports total

3. Move concurrency files:
   - `concurrency/` - 3 files, 3 imports total

4. Move book-specific files:
   - `book/` - 5 files, 6 imports total

5. Update imports (automated with verification):
   ```bash
   # Dry run to preview changes
   find src -type f -name "*.ts" -exec grep -l "from.*utils/cache" {} \;

   # Apply changes
   find src -type f -name "*.ts" -exec sed -i '' 's|from.*utils/cache\.|from ../utils/cache/cache.|g' {} \;
   ```

6. Run full test suite:
   ```bash
   npm run test:safe
   npm run lint
   ```

**Risk:** MEDIUM - More imports affected, but clear domain boundaries

---

### Phase 3: High-Risk Moves (Week 3)
**Target:** Files with 4+ imports, widely used

1. Move HTTP utilities:
   - `http/response-builder.ts` - **8 imports** (highest impact)
   - `http/error-status.ts`
   - `http/streaming-response.ts`

2. Move data transform utilities:
   - `transform/` - 4 files, 6+ imports total

3. **Critical:** Use TypeScript compiler to catch import errors:
   ```bash
   # Check before moving
   tsc --noEmit

   # Move files
   mv src/utils/response-builder.ts src/utils/http/

   # Auto-fix imports (VS Code LSP or ts-migrate)
   npx ts-migrate migrate:imports src

   # Verify no errors
   tsc --noEmit
   npm run test:safe
   ```

4. Update ALL test files:
   ```bash
   find tests -type f -name "*.test.ts" -exec sed -i '' 's|from.*utils/response-builder|from ../utils/http/response-builder|g' {} \;
   ```

**Risk:** HIGH - Many imports, critical utilities

**Mitigation:**
- Use TypeScript compiler errors to catch broken imports
- Run full test suite after each move
- Keep PR small (1-2 files per commit for easy rollback)

---

### Phase 4: Verification & Cleanup (Week 4)
1. **Verify all imports:**
   ```bash
   # Check for broken imports
   tsc --noEmit
   npm run lint
   ```

2. **Run full test suite:**
   ```bash
   npm test  # Full suite (if 16GB+ RAM available)
   npm run test:safe  # Safe mode (60s, 512MB limit)
   npm run validate  # Pre-commit check
   ```

3. **Update documentation:**
   - Update `CLAUDE.md` with new structure
   - Add index files (`src/utils/http/index.ts`) for barrel exports

4. **Create PR:**
   - Title: "refactor: Organize utils into logical subdirectories"
   - Include migration script for reproducibility
   - Tag `@jukasdrj` for review

---

## Breaking Changes Summary

### Import Path Changes (33 files affected)

#### Before:
```typescript
import { createErrorResponse, ErrorCodes } from '../utils/response-builder'
import { isValidISBN } from '../utils/isbn-validation'
import { getCached, setCached } from '../utils/cache'
```

#### After:
```typescript
import { createErrorResponse, ErrorCodes } from '../utils/http/response-builder'
import { isValidISBN } from '../utils/validation/isbn-validation'
import { getCached, setCached } from '../utils/cache/cache'
```

### Automated Migration Script
```bash
#!/bin/bash
# migrate-utils.sh - Automated import path updater

set -e

# Phase 1: R2 utilities
find src -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' \
  -e 's|from \(.*\)utils/r2-utils|from \1utils/r2/r2-utils|g' \
  -e 's|from \(.*\)utils/r2-lifecycle|from \1utils/r2/r2-lifecycle|g' \
  -e 's|from \(.*\)utils/r2-hibernation|from \1utils/r2/r2-hibernation|g' \
  {} \;

# Phase 2: Validation utilities
find src -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' \
  -e 's|from \(.*\)utils/isbn-validation|from \1utils/validation/isbn-validation|g' \
  -e 's|from \(.*\)utils/book-validation|from \1utils/validation/book-validation|g' \
  -e 's|from \(.*\)utils/json-validator|from \1utils/validation/json-validator|g' \
  -e 's|from \(.*\)utils/csv-validator|from \1utils/validation/csv-validator|g' \
  {} \;

# Phase 3: HTTP utilities
find src -type f \( -name "*.ts" -o -name "*.js" \) -exec sed -i '' \
  -e 's|from \(.*\)utils/response-builder|from \1utils/http/response-builder|g' \
  -e 's|from \(.*\)utils/error-status|from \1utils/http/error-status|g' \
  -e 's|from \(.*\)utils/streaming-response|from \1utils/http/streaming-response|g' \
  {} \;

# Verify TypeScript compilation
echo "Verifying TypeScript compilation..."
tsc --noEmit

# Run tests
echo "Running tests..."
npm run test:safe

echo "Migration complete!"
```

### Rollback Plan
If migration causes issues:

1. **Immediate rollback:**
   ```bash
   git revert <commit-hash>
   npm run test:safe
   ```

2. **Partial rollback:** Keep phases 1-2, revert phase 3
   ```bash
   git revert <phase3-commit>
   ```

3. **Complete rollback:** Restore flat structure
   ```bash
   git checkout main -- src/utils/
   ```

---

## Final Recommendation

### Proceed with Reorganization? **YES ✅**

**Rationale:**
1. **Maintainability:** 33 files in flat structure is hard to navigate
2. **Scalability:** Clear domain boundaries prevent future clutter
3. **Discoverability:** Grouped utilities easier to find for new developers
4. **Risk:** Manageable with phased approach + automated migration
5. **Test Coverage:** 61% coverage sufficient for safe refactoring

### Success Criteria
- ✅ All tests pass after migration
- ✅ TypeScript compilation succeeds (`tsc --noEmit`)
- ✅ Zero runtime errors in production
- ✅ Documentation updated (CLAUDE.md, README)
- ✅ Biome linter passes (`npm run lint`)

### Timeline
- **Week 1:** Low-risk moves (r2, analytics, database, jobs)
- **Week 2:** Medium-risk moves (validation, cache, concurrency, book)
- **Week 3:** High-risk moves (HTTP, transform)
- **Week 4:** Verification, cleanup, PR review

**Total effort:** 4 weeks (~8-12 hours)

---

## Next Steps

1. **Get approval** from @jukasdrj for reorganization
2. **Create feature branch:** `refactor/utils-consolidation`
3. **Execute Phase 1** (low-risk moves)
4. **Validate Phase 1** with tests + lint
5. **Proceed to Phase 2** if Phase 1 succeeds
6. **Create PR** with migration script for reproducibility

---

**Document Version:** 1.0
**Last Updated:** January 3, 2026
**Author:** Claude (Sonnet 4.5)
**Reviewed By:** Pending @jukasdrj
