# Test Archive

This directory contains archived test files that are no longer actively maintained or part of the regular test suite.

Tests are archived rather than deleted to preserve:
- Historical context for future reference
- Documentation of deprecated patterns
- Option to resurrect tests if features are re-implemented

## Archive Organization

### `obsolete-services/` - Tests with Broken Imports
Tests that reference services or handlers that have been removed from the codebase.

**Files:**
- `kv-cache.test.js` - References non-existent `src/services/kv-cache.js`
  - **What it tested:** KV cache operations
  - **Status:** Functionality moved to `UnifiedCacheService`
  - **V3 Equivalent:** `tests/unit/unified-cache.test.js`
  - **Archived:** January 7, 2026

- `warming-upload.test.js` - References non-existent `src/handlers/warming-upload.js`
  - **What it tested:** Cache warming upload handler
  - **Status:** Handler has been removed/consolidated
  - **V3 Equivalent:** `tests/unit/cache-warming-integration.test.js` (if applicable)
  - **Archived:** January 7, 2026

### `e2e-manual/` - E2E and Manual Testing
Tests that require a live worker, manual execution, or external setup.

**Files:**
- `batch-scan.test.js` - E2E batch bookshelf scanning
  - **Requirements:** Live worker at http://localhost:8787, `npm run dev`
  - **Activation:** Set `RUN_E2E_TESTS=true`
  - **Note:** Requires multipart/form-data image uploads
  - **When to use:** During development to test full bookshelf scanning flow

- `csv-import-e2e.test.js` - E2E CSV import workflow
  - **Requirements:** Live worker, CSV file uploads
  - **Activation:** Set `RUN_E2E_TESTS=true`
  - **V3 Equivalent:** `tests/smoke/v3-csv-import.test.ts` (smoke test version)
  - **When to use:** Manual testing of import workflow

- `enrichment.test.js` - Old enrichment pipeline tests
  - **Status:** Functionality tested in unit tests
  - **V3 Equivalent:** `tests/unit/v3-batch-enrichment.test.ts`
  - **When to use:** Never (use V3 unit tests instead)

- `hono-router.test.js` - Old Hono router tests
  - **Status:** Covered by V3 route integration tests
  - **V3 Equivalent:** Tests in `tests/handlers/` and smoke tests
  - **When to use:** Reference only for old Hono patterns

- `integration.test.js` - Old integration test suite
  - **Status:** Duplicated by organized test suite in `tests/integration/`
  - **V3 Equivalent:** Modular tests in `tests/integration/`
  - **When to use:** Never (use organized integration tests)

- `gemini-token-usage.test.js` - Gemini token analysis
  - **Purpose:** Experimental token usage tracking
  - **Status:** Ad-hoc performance testing
  - **When to use:** During Gemini optimization work

- `rpc-latency.test.js` - RPC latency performance testing
  - **Purpose:** Measure Alexandria RPC performance
  - **Status:** Manual performance benchmarking
  - **When to use:** During optimization sprints

### `experimental/` - Internal Implementation Details
Tests for experimental features, internal implementation details, or features under development.

**Files:**
- `ai-scanner-metadata.test.js` - AI scanner metadata tracking
  - **What it tested:** Internal AI model metadata in scan results
  - **Status:** Experimental feature
  - **Related code:** `src/services/ai-scanner.ts`
  - **When to use:** During AI scanner development

- `author-search-performance.test.js` - Author search performance
  - **What it tested:** Performance metrics for author search
  - **Status:** Performance testing (no production requirement)
  - **Related code:** `src/handlers/author-search.ts`
  - **When to use:** During author search optimization

- `cache-key-factory.test.js` - Cache key generation
  - **What it tested:** Internal cache key patterns
  - **Status:** Implementation details covered elsewhere
  - **Related code:** `src/utils/cache/cache-key-factory.ts`
  - **When to use:** If refactoring cache key strategy

- `popular-books-config.test.js` - Popular books configuration
  - **What it tested:** Internal configuration for popular books feature
  - **Status:** Feature configuration (covered in integration tests)
  - **When to use:** During popular books feature work

- `gemini-csv-provider.test.js` - Gemini CSV parsing provider
  - **What it tested:** Gemini-based CSV parsing
  - **Status:** Provider testing (covered in normalizer tests)
  - **Related code:** `src/providers/gemini-csv-provider.ts`
  - **V3 Equivalent:** CSV provider tests in integration suite
  - **When to use:** During CSV parsing improvements

- `analytics-queries.test.js` - Analytics query interface
  - **What it tested:** Analytics Engine queries (write-only limitation)
  - **Status:** Documents limitation (Analytics Engine is write-only in Workers)
  - **Note:** Test shows function returns empty object due to limitation
  - **When to use:** Reference for Analytics Engine patterns

- `metrics-aggregator.test.js` - Metrics aggregation
  - **What it tested:** Internal metrics aggregation
  - **Status:** Functionality covered in unit tests
  - **V3 Equivalent:** `tests/unit/` metric tests
  - **When to use:** During metrics refactoring

- `parallel-enrichment.test.js` - Parallel enrichment
  - **What it tested:** Parallel book enrichment
  - **Status:** Functionality rolled into main enrichment service
  - **V3 Equivalent:** `tests/unit/v3-batch-enrichment.test.ts`
  - **When to use:** Reference for parallelization patterns

### `integration/` - Legacy Integration Tests
Old integration tests covering features that may no longer be current. Located in original archive.

**Files:**
- `batch-enrichment.test.ts` - Batch enrichment integration
- `bookshelf-scan-r2.test.js` - Bookshelf scanning with R2
- `csv-import-r2.test.js` - CSV import with R2 integration
- `d1-integrity-validation.test.ts` - D1 database integrity
- `hibernation-redeploy.test.js` - Durable Object hibernation
- `job-status-polling.test.ts` - Job status polling
- `websocket-do.test.js` - WebSocket Durable Object

### `performance/` - Performance Benchmarks
Performance testing files covering specific optimizations or benchmarks.

**Files:**
- `d1-benchmarks.test.ts` - D1 database performance benchmarks
- `r2-migration-perf.test.js` - R2 migration performance analysis

## When to Archive Tests

Archive a test if it meets any of these criteria:

1. **Broken Imports** - References non-existent source files or removed APIs
2. **Duplicated Coverage** - Same functionality tested elsewhere in active test suite
3. **E2E/Manual Only** - Requires live worker or manual execution
4. **Experimental Features** - Tests for features under development or with uncertain status
5. **Performance Baselines** - One-time benchmarks that aren't run regularly
6. **Old API Versions** - Tests for deprecated API versions (v1, v2)
7. **Implementation Details** - Tests for internal APIs/patterns subject to change
8. **Low Signal** - Tests that consistently pass but don't catch real issues

## How to Resurrect Archived Tests

If you need to restore a test file:

### Option 1: Restore Single File
```bash
git mv tests/archive/obsolete-services/kv-cache.test.js tests/
git add tests/archive/obsolete-services
```

### Option 2: Restore Category
```bash
# Restore all E2E/manual tests
for f in tests/archive/e2e-manual/*.test.*; do
  git mv "$f" tests/
done
git add tests/archive/e2e-manual
```

### Option 3: Review History
```bash
# View changes that archived the test
git log --follow -- tests/archive/obsolete-services/kv-cache.test.js

# View original test content
git show HEAD~N:tests/kv-cache.test.js
```

## Maintenance

- **Review frequency:** Quarterly
- **Cleanup:** Delete files that remain obsolete for 12+ months
- **Update README:** When archiving new tests or restoring old ones
- **Cross-reference:** Update main test documentation when archiving tests

## Integration with Test Runner

The Vitest configuration intentionally excludes archive directories:

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/archive/**'  // Archive tests not run
    ]
  }
})
```

To run archived tests intentionally:
```bash
npm test -- tests/archive/e2e-manual/batch-scan.test.js
```

## Archive Statistics

**Last Updated:** January 7, 2026
- **Total Archived Tests:** 31 files
- **Broken Imports:** 2 files
- **E2E/Manual:** 7 files
- **Experimental:** 8 files
- **Legacy Integration:** 7 files
- **Performance Benchmarks:** 2 files
- **Other Legacy:** 5 files

## Related Documentation

- **Test README:** `tests/README.md` - Overall test strategy
- **Testing Guide:** `README_TESTING.md` - Testing best practices
- **CLAUDE.md:** `.claude/CLAUDE.md` - Testing patterns and conventions
- **Sprint Notes:** `TODO.md` - Current development priorities

---

**Note:** This archive is part of ongoing test infrastructure maintenance. As the project evolves, tests may move between active, archive, and deletion categories based on relevance and maintenance burden.
