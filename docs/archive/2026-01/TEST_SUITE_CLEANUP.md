# Test Suite Cleanup Plan

**Status:** Planning
**Priority:** MEDIUM (Sprint 3 backlog)
**Estimated Effort:** 4-6 hours
**Expected Outcome:** 100% test pass rate in both pools
**Created:** January 6, 2026

---

## Overview

This document outlines a 4-phase plan to clean up the BooksTrack test suite, improve test reliability, and reduce mock maintenance burden.

**Current Issues:**
- Durable Object tests in Node pool using heavy mocking (doesn't catch real workerd bugs)
- External API mocks are broken in some tests
- Integration tests use mocks instead of real local bindings
- Stale tests reference deprecated V1/V2 APIs (already sunset)

**Goal:** Migrate tests to appropriate pools, use real bindings where possible, consolidate mocks, and remove deprecated test code.

---

## Phase 1: DO Tests Migration (HIGH PRIORITY ⚡)

**Goal:** Migrate Durable Object tests to the `workerd` environment to fix broken Node mocks and test real behavior.

**Why This Is Critical:**
- Current Node mocks (`MockDurableObject`) are **significantly different** from real workerd runtime
- Potentially masking storage/alarm bugs in production
- Workers pool gives us **real DO behavior testing** with actual storage and alarm APIs

### Actions

1. **Create Directory:**
   ```bash
   mkdir -p tests/workers/durable-objects
   ```

2. **Move Files:**
   ```bash
   git mv tests/unit/job-state-manager-do.test.js tests/workers/durable-objects/
   git mv tests/unit/rate-limiter.test.js tests/workers/durable-objects/
   ```

3. **Refactor (CRITICAL):**
   - **Remove:** `vi.mock('cloudflare:workers')` and `MockDurableObject` imports
   - **Update:** Import `env` from `cloudflare:test`
   - **Pattern:** Instantiate DOs directly or use `env.MY_DO.get(...)` to test via the stub
   - **Config:** Verify `vitest.workers.config.ts` includes the new path (currently includes `tests/workers/**`)

### Before/After Pattern

```typescript
// ❌ OLD (Node pool with mocks)
import { vi } from 'vitest'
vi.mock('cloudflare:workers')
const mockDO = new MockDurableObject()

test('DO alarm scheduling', async () => {
  const job = new JobStateManagerDO(mockState, mockEnv)
  await job.scheduleAlarm(Date.now() + 1000)
  // Testing mock behavior, not real workerd!
})

// ✅ NEW (Workers pool with real runtime)
import { env } from 'cloudflare:test'

test('DO alarm scheduling', async () => {
  const id = env.JOB_STATE_MANAGER_DO.idFromName('test-job')
  const stub = env.JOB_STATE_MANAGER_DO.get(id)
  const response = await stub.fetch('http://fake/schedule-alarm', {
    method: 'POST',
    body: JSON.stringify({ timestamp: Date.now() + 1000 })
  })
  // Testing REAL DO storage and alarms!
})
```

### Files to Migrate

- `tests/unit/job-state-manager-do.test.js` → `tests/workers/durable-objects/job-state-manager-do.test.ts`
- `tests/unit/rate-limiter.test.js` → `tests/workers/durable-objects/rate-limiter-do.test.ts`

### Verification

```bash
npm run test:workers  # Should pass with real DO behavior
```

---

## Phase 2: External API Mock Fixes (MEDIUM PRIORITY 🛠️)

**Goal:** Consolidate and fix external API mocks to improve reliability.

### Actions

1. **Create Shared Mock:** `tests/mocks/fetch.ts`
   ```typescript
   import { vi } from 'vitest'

   export function createFetchMock() {
     const mock = vi.fn()
     return {
       mock,
       reset: () => mock.mockReset(),
       mockProvider: (provider: string, response: any) => {
         // Standard mock setup for Alexandria, Google Books, etc.
         mock.mockResolvedValueOnce({
           ok: true,
           status: 200,
           json: async () => response
         })
       },
       mockError: (provider: string, error: Error) => {
         mock.mockRejectedValueOnce(error)
       }
     }
   }
   ```

2. **Refactor `tests/error-scenarios/network-failures.test.js`:**
   - Replace `global.fetch = vi.fn()` with shared mock utility
   - Ensure proper setup/teardown

3. **Refactor `tests/unit/external-apis.test.ts`:**
   - Use shared mock utility
   - Import standard response fixtures from `tests/mocks/providers.js`
   - Fix ISBNdb mock to use consistent pattern

### Benefits

- **Consistency:** All external API mocks use same pattern
- **Maintainability:** Single source of truth for mock behavior
- **Reliability:** Proper reset/cleanup between tests

### Files to Update

- `tests/error-scenarios/network-failures.test.js`
- `tests/unit/external-apis.test.ts`

### Verification

```bash
npm run test:unit  # All external API tests should pass
```

---

## Phase 3: Integration Test Migration (LOW PRIORITY 📦)

**Goal:** Run E2E/Integration tests with real local bindings instead of mocks.

### Actions

1. **Create Directory:**
   ```bash
   mkdir -p tests/workers/integration
   ```

2. **Move Tests:** Migrate CSV/enrichment E2E tests to `tests/workers/integration/`

3. **Refactor Pattern:**
   ```typescript
   // ❌ OLD (Node pool with manual mocks)
   const mockEnv = {
     DB: mockDB,
     QUEUE: mockQueue,
     CACHE: mockKV
   }

   // ✅ NEW (Workers pool with real local bindings)
   import { env } from 'cloudflare:test'

   test('CSV import integration', async () => {
     // env.DB, env.QUEUE, env.CACHE are REAL local bindings!
     const response = await worker.fetch('http://fake/v3/jobs/imports', {
       method: 'POST',
       body: csvData
     })

     // Query real local D1 to verify data
     const result = await env.DB.prepare('SELECT * FROM books WHERE isbn = ?')
       .bind('9780439708180')
       .first()
   })
   ```

4. **Setup:** Ensure `wrangler.test.jsonc` has:
   - D1 migrations applied
   - KV namespaces configured
   - Queue bindings available

### Integration-Lite Pattern

The "integration-lite" pattern in `vitest-pool-workers` simply uses the injected `env` object, which connects to local `miniflare` instances. **No need for extra setup** like `getPlatformProxy()`.

### Candidates for Migration

- CSV import E2E tests
- Enrichment workflow tests
- Job orchestration tests

### Benefits

- **Real behavior:** Tests interact with actual D1, KV, Queues (local instances)
- **Fewer mocks:** Reduce mock maintenance burden
- **Confidence:** Catch integration issues before production

### Verification

```bash
npm run test:workers  # Integration tests should pass with real bindings
```

---

## Phase 4: Archive Stale Tests (CLEANUP 🧹)

**Goal:** Remove noise from the test suite.

### Actions

1. **Audit:** Search for tests referencing deprecated APIs
   ```bash
   grep -r "api-v1\|api-v2\|/v1/\|/v2/" tests/
   grep -r "src/api-v1\|src/api-v2" tests/
   ```

2. **Archive/Delete:**
   - Remove tests for V1/V2 APIs (sunset complete)
   - Delete outdated mock patterns
   - Remove tests for features that no longer exist

3. **Verify Config:** Ensure `vitest.node.config.ts` explicitly excludes `tests/workers/`:
   ```typescript
   export default defineConfig({
     test: {
       exclude: [
         '**/node_modules/**',
         '**/dist/**',
         'tests/workers/**',  // Prevent double-running
         'tests/setup-workers.js'
       ]
     }
   })
   ```

### Files to Review

- Any test files in `tests/` referencing V1/V2
- Deprecated handler tests
- Old API contract tests

### Verification

```bash
npm run test:safe  # Should have fewer tests, all passing
```

---

## Anti-Patterns to Avoid

**Critical mistakes to avoid during migration:**

### ❌ DON'T: Mock `cloudflare:workers` in Workers Pool

```typescript
// ❌ BAD - Don't mock workerd globals
import { vi } from 'vitest'
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject
}))
```

### ❌ DON'T: Use Node APIs in Workers Pool

```typescript
// ❌ BAD - Node APIs don't exist in workerd
import fs from 'node:fs'
import path from 'node:path'

test('parse CSV', () => {
  const data = fs.readFileSync(path.join(__dirname, 'data.csv'))
})
```

### ❌ DON'T: Manually Construct `env` Objects

```typescript
// ❌ BAD - Manual env construction
const env = { DB: mockDB, CACHE: mockKV }

// ✅ GOOD - Use injected env
import { env } from 'cloudflare:test'
```

### ❌ DON'T: Use `getPlatformProxy()` in Workers Pool

```typescript
// ❌ BAD - getPlatformProxy is for Node pool only
import { getPlatformProxy } from 'wrangler'
const { env } = await getPlatformProxy()

// ✅ GOOD - Workers pool provides env automatically
import { env } from 'cloudflare:test'
```

---

## Execution Timeline

**Recommended Order:**

1. **Week 1:** Phase 1 (DO Tests Migration) - Highest impact, unblocks real DO testing
2. **Week 1:** Phase 4 (Archive Stale Tests) - Quick wins, reduces noise
3. **Week 2:** Phase 2 (Mock Consolidation) - Improves maintainability
4. **Week 2:** Phase 3 (Integration Tests) - Final polish, real bindings

**Total Effort:** 4-6 hours spread across 2 weeks

---

## Success Metrics

- [ ] 100% test pass rate in Workers pool
- [ ] 100% test pass rate in Node pool
- [ ] Zero broken mocks
- [ ] Zero V1/V2 API references
- [ ] All DO tests running in real workerd runtime
- [ ] Integration tests using real local bindings
- [ ] Consolidated fetch mock utility in use

---

## References

- [Vitest Workers Pool Docs](https://vitest.dev/guide/improving-performance.html#pool)
- [Cloudflare Test Environment](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [BooksTrack Testing Guide](../README_TESTING.md)
- [Dual Pool Architecture](../.claude/rules/testing.md)

---

**Last Updated:** January 6, 2026
**Owner:** @jukasdrj
**Reviewers:** cf-code-reviewer, PAL MCP (Gemini planner role)
