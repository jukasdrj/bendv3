# Test Failure Details - Complete Reference

## Overview
- **Total Failing Test Files:** 25
- **Total Failing Tests:** 91
- **Session Pass Rate Improvement:** +6.4% (82.2% to 88.6%)

---

## Module Import Errors (8 Files, 14 Tests)

### 1. cache-warming-integration.test.js
**Error:** Cannot find module '../src/utils/cache.ts'
**Tests:** 1 failure
**Fix:** Verify cache.ts location in src/utils/

### 2. csv-import.test.js (Root)
**Error:** Cannot find module '../src/handlers/csv-import.js'
**Tests:** 1 failure
**Fix:** Locate csv-import handler or update import path

### 3. e2e/csv-import.test.js
**Error:** Cannot find module '../../src/handlers/csv-import.ts'
**Tests:** 1 failure
**Fix:** Same as above (TypeScript variant)

### 4. handlers/csv-import.test.js
**Error:** Cannot find module '../../src/handlers/csv-import.ts'
**Tests:** 1 failure
**Fix:** Same as above

### 5. handlers/batch-enrichment.test.js
**Error:** Cannot find module '../../src/handlers/batch-enrichment.ts'
**Tests:** 1 failure
**Fix:** Locate batch-enrichment handler

### 6. integration/durable-object-alarm.test.js
**Error:** Cannot find module '../../src/durable-objects/progress-socket.js'
**Tests:** 1 failure
**Fix:** Verify progress-socket.js still exists

### 7. unit/r2-hibernation.test.js
**Error:** Cannot find module '../../src/utils/r2-hibernation.ts'
**Tests:** 1 failure
**Fix:** Verify r2-hibernation.ts location

### 8. unit/validators.test.js
**Error:** Cannot find module '../../src/utils/normalization.js'
**Tests:** 1 failure
**Fix:** Locate normalization.js utility

---

## Mock Configuration Errors (3 Files, 3 Tests)

### 1. hono-router.test.js
**Error:** No "WorkflowEntrypoint" export in "cloudflare:workers" mock
**Tests:** 1 failure
**Fix:** Add WorkflowEntrypoint to mock definition

### 2. book-search-integration.test.js
**Error:** Mock configuration issue (needs investigation)
**Tests:** 1 failure
**Fix:** Debug mock setup

### 3. cache-keys.test.js
**Error:** Cache key generation test issues
**Tests:** 2 failures
  - ISBN cache key normalizes ISBN13
  - CSV cache key includes content hash
**Fix:** Verify cache implementation matches tests

---

## Missing Test Data (1 File, 3 Tests)

### csv-import-e2e.test.js
**Error:** ENOENT: no such file or directory for '/docs/testImages/sample-books.csv'
**Tests:** 3 failures
  - Complete import flow
  - CSV content validation
  - CSV file size validation
**Fix:** Create sample-books.csv in docs/testImages/

---

## Durable Object Mocking Issues (14 Files, 71 Tests)

### Rate Limiter Tests (12 failures)
**File:** tests/unit/rate-limiter.test.js
**Error:** Cannot read properties of undefined (reading 'storage')
**Issue:** this.ctx.storage not mocked in Durable Object tests
**Tests:** 12 rate limiter tests
**Fix:** Implement DurableObjectStorage mock with get/put/delete/list

### Job State Manager Tests (4 failures)
**File:** tests/unit/job-state-manager-do.test.js
**Tests:** 4 state manager tests
**Fix:** Same as above (DO storage mocking)

### External API Service Tests (10 failures)
**File:** tests/unit/external-apis.test.ts
**Tests:** 10 external API tests
**Fix:** Mock service binding initialization properly

### Book Service Tests (14 failures)
**File:** tests/services/book-service.test.ts
**Tests:** 14 book service tests
**Fix:** Implement proper service and DO mocking

### Integration/Metrics Tests (20 failures)
**Files:** tests/integration/metrics-handler.test.js, tests/e2e/metrics-collection.test.js
**Tests:** 20 metrics-related tests
**Fix:** Mock Analytics Engine writeDataPoint properly

### Handler Tests (11 failures)
**Files:** tests/handlers/, tests/integration/
**Tests:** 11 handler-related tests
**Fix:** Mock request context and handler setup

### Other Tests (Enrichment, Errors, AI) (6 failures)
**Files:** enrichment.test.js, network-failures.test.js, gemini-token-usage.test.js
**Tests:** 6 other tests
**Fix:** Implement remaining service and API mocks

---

## Failure Summary by Cause

| Cause | Count | Fix Effort | Impact |
|-------|-------|-----------|--------|
| Module imports | 14 | 1-2 hours | +14 tests |
| Mock config | 3 | 1-2 hours | +3 tests |
| Test data | 3 | 30 min | +3 tests |
| DO storage | 71 | 3-5 hours | +71 tests |
| **TOTAL** | **91** | **7-12 hours** | **+91 tests** |

---

## Quick Fix Guide

### Step 1: Module Import Errors (1 hour)
Find file locations and update test imports accordingly.

### Step 2: Test Data Files (30 minutes)
Create docs/testImages/sample-books.csv with test data.

### Step 3: Mock Configuration (1-2 hours)
Add WorkflowEntrypoint and storage mocks to vitest configuration.

### Step 4: Service/Handler Logic (3-5 hours)
Implement proper Durable Object and service binding mocks.

---

Generated: 2026-01-07 | Claude Code Test Suite Analysis
