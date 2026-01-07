# E2E and Manual Testing

Tests in this directory require a live worker, manual setup, or external infrastructure.

## Characteristics

- **Requires live worker** - Tests run against actual Cloudflare Worker instance
- **Manual execution** - Not part of automated CI/CD pipeline
- **Infrastructure dependent** - May require specific services (R2, D1, etc.)
- **Environment flags** - Often gated by environment variables like `RUN_E2E_TESTS=true`

## Files

### batch-scan.test.js
- **Type:** End-to-end test
- **Requirements:**
  - Live worker: `npm run dev` in another terminal
  - Endpoint: `http://localhost:8787`
  - Environment: `RUN_E2E_TESTS=true`
- **What it tests:** Batch bookshelf scanning with multipart/form-data image uploads
- **Why archived:** Requires live environment setup not suitable for CI/CD
- **Modern equivalent:** Smoke test in `tests/smoke/v3-scan-jobs.test.ts` for basic validation
- **When to use:** Manual testing during scan feature development

### csv-import-e2e.test.js
- **Type:** End-to-end test
- **Requirements:**
  - Live worker: `npm run dev`
  - CSV file uploads
  - Environment: `RUN_E2E_TESTS=true`
- **What it tests:** Complete CSV import workflow from upload to processing
- **Why archived:** Requires live environment; unit tests cover individual components
- **Modern equivalent:** `tests/smoke/v3-csv-import.test.ts` for smoke validation
- **When to use:** Manual testing of import feature

### enrichment.test.js
- **Type:** Integration test (old)
- **Archived:** January 7, 2026
- **Why archived:** Functionality duplicated in unit and integration tests
- **Modern equivalent:** `tests/unit/v3-batch-enrichment.test.ts`
- **Status:** Do not restore; use modern tests instead

### hono-router.test.js
- **Type:** Router configuration tests (old)
- **Archived:** January 7, 2026
- **Why archived:** Old router patterns replaced by V3 Hono API with @hono/zod-openapi
- **Modern equivalent:** Individual route handler tests in `tests/handlers/`
- **Status:** Reference only for legacy patterns

### integration.test.js
- **Type:** Old integration suite
- **Archived:** January 7, 2026
- **Why archived:** Functionality reorganized into modular tests in `tests/integration/`
- **Modern equivalent:** Organized tests in `tests/integration/` directory
- **Status:** Do not restore; see organized integration tests

### gemini-token-usage.test.js
- **Type:** Performance analysis
- **Purpose:** Experimental token usage tracking for Gemini API
- **Why archived:** Ad-hoc performance testing not needed for CI/CD
- **When to use:** During Gemini optimization work to measure token consumption

### rpc-latency.test.js
- **Type:** Performance benchmark
- **Purpose:** Measure Alexandria RPC latency
- **Why archived:** Manual performance testing during optimization sprints
- **When to use:** During Alexandria integration optimization work

## Running E2E Tests Manually

### Option 1: Run individual test with live worker
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run specific E2E test
RUN_E2E_TESTS=true npm test -- tests/archive/e2e-manual/batch-scan.test.js
```

### Option 2: Run all E2E tests
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run all archived tests
RUN_E2E_TESTS=true npm test -- tests/archive/e2e-manual/
```

### Option 3: Restore and run
```bash
# Restore test to active suite
git mv tests/archive/e2e-manual/batch-scan.test.js tests/

# Run with live worker
npm run dev  # in another terminal
RUN_E2E_TESTS=true npm test
```

## Best Practices

1. **Use smoke tests first** - Smoke tests provide quick validation without full E2E
2. **Manual testing** - Run E2E tests locally when developing new features
3. **Document setup** - Each E2E test should document required setup
4. **Keep tests isolated** - Avoid side effects that affect other tests
5. **Clean up state** - Reset test data between runs if needed

## Vitest Configuration

E2E tests are excluded from automated runs:

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    exclude: [
      '**/tests/archive/**',
      // ... other exclusions
    ]
  }
})
```

To include archived tests in a run:
```bash
npm test -- --include="tests/archive/**"
```

## Modern Testing Approach

The project uses a layered testing strategy:

1. **Smoke Tests** (`tests/smoke/`) - Fast validation, 5 seconds
2. **Unit Tests** (`tests/unit/`) - Component testing, 30 seconds
3. **Integration Tests** (`tests/integration/`) - Feature workflows, 60+ seconds
4. **E2E Tests** (archived) - Full system testing, manual, infrastructure dependent

E2E tests are archived because the layered approach provides better coverage with faster feedback.
