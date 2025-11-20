# CSV Processing Code Duplication Analysis

**Date:** November 20, 2025
**Issue:** #180 - Eliminate code duplication in CSV processing
**Reviewer:** Claude Code
**Status:** Analysis Complete, Cleanup Plan Pending

---

## Executive Summary

The CSV processing logic is **duplicated across two files** as part of the **Durable Object architectural refactoring** (Phase 2). Both implementations are maintained for **backward compatibility** during the migration period, controlled by the `ENABLE_REFACTORED_DOS` feature flag.

**Recommendation:** Complete the migration to the refactored architecture and remove the legacy implementation.

---

## 1. Duplicate Code Locations

### File 1: Legacy Implementation (Monolithic DO)

**Location:** `src/handlers/csv-import.ts`
**Function:** `processCSVImportCore(csvText, jobId, doStub, env)`
**Lines:** 142-260
**Active When:** `ENABLE_REFACTORED_DOS=false` (default for backward compatibility)

### File 2: Refactored Implementation (Service Layer)

**Location:** `src/services/csv-processor.js`
**Function:** `processCSVImport(csvText, progressReporter, env, jobId)`
**Lines:** 35-146
**Active When:** `ENABLE_REFACTORED_DOS=true`

### Helper Function: callGemini()

**Also Duplicated In:**
- `src/handlers/csv-import.ts` (lines 270-285)
- `src/services/csv-processor.js` (lines 156-166)

---

## 2. Duplication Breakdown

### Identical Logic Across Both Files

| Stage | Lines (csv-import.ts) | Lines (csv-processor.js) | Duplication % |
|-------|----------------------|-------------------------|---------------|
| **Wait for Ready Signal** | 146-167 | 38-51 | ~95% |
| **CSV Validation** | 169-179 | 53-63 | ~100% |
| **Gemini Parsing** | 181-209 | 65-91 | ~95% |
| **Progress Reporting** | 211-217 | 93-98 | ~100% |
| **Book Validation** | 219-227 | 100-108 | ~100% |
| **KV Storage** | 229-235 | 109-125 | ~90% |
| **Completion** | 237-246 | 127-131 | ~100% |
| **Error Handling** | 247-257 | 134-145 | ~100% |

**Total Duplication:** ~120 lines of nearly identical code

---

## 3. Key Differences

### Architecture Pattern

**Legacy (`csv-import.ts`):**
```javascript
// Directly couples handler to Durable Object
export async function processCSVImportCore(csvText, jobId, doStub, env) {
  // doStub is ProgressWebSocketDO instance
  await doStub.waitForReady(15000);
  await doStub.updateProgress("csv_import", { ... });
  await doStub.complete("csv_import", { ... });
}
```

**Refactored (`csv-processor.js`):**
```javascript
// Uses dependency injection with progressReporter interface
export async function processCSVImport(csvText, progressReporter, env, jobId) {
  // progressReporter can be ANY object implementing the interface
  await progressReporter.waitForReady(15000);
  await progressReporter.updateProgress("csv_import", { ... });
  await progressReporter.complete("csv_import", { ... });
}
```

### Progress Reporter Interface

The refactored version uses a **clean interface** instead of tightly coupling to `ProgressWebSocketDO`:

```javascript
interface ProgressReporter {
  waitForReady(timeoutMs: number): Promise<{ success: boolean }>;
  updateProgress(pipeline: string, payload: object): Promise<void>;
  complete(pipeline: string, payload: object): Promise<void>;
  sendError(pipeline: string, payload: object): Promise<void>;
}
```

**Benefits:**
- **Testability:** Can inject mock reporter for unit tests
- **Flexibility:** Can swap DO implementation without changing service
- **Separation of Concerns:** Business logic decoupled from infrastructure

---

## 4. Root Cause Analysis

### Why Does This Duplication Exist?

This is **intentional duplication** during an **architectural migration**:

1. **Phase 1 (Complete):** Legacy monolithic `ProgressWebSocketDO`
   - Single DO handles WebSocket, state, and business logic
   - CSV processing embedded in DO alarm handler

2. **Phase 2 (In Progress):** Refactored architecture
   - `WebSocketConnectionDO` - Connection management only
   - `JobStateManagerDO` - State persistence only
   - **Services** (like `csv-processor.js`) - Business logic extracted

3. **Current State:** Both architectures coexist
   - Feature flag `ENABLE_REFACTORED_DOS` controls which is used
   - Allows gradual migration without breaking existing deployments

### Feature Flag Control

**wrangler.toml:**
```toml
[vars]
# Durable Object Architecture Refactoring (Phase 2)
# When true: Uses refactored architecture
# When false: Uses legacy monolithic ProgressWebSocketDO (default)
ENABLE_REFACTORED_DOS = "false"  # ← Currently uses LEGACY
```

**Handler logic (csv-import.ts:76-115):**
```javascript
const useRefactoredDOs = env.ENABLE_REFACTORED_DOS === "true";

if (useRefactoredDOs) {
  // NEW ARCHITECTURE
  const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
  const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
  // Uses csv-processor.js service
} else {
  // LEGACY ARCHITECTURE
  const doId = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
  // Uses processCSVImportCore in csv-import.ts
}
```

---

## 5. Impact Analysis

### Current Impact (LOW)

**Maintenance:**
- Changes to CSV processing logic must be applied to **both files**
- Risk of divergence if one file is updated and the other is not
- Example: Token limit fix (Issue #181) needs to be in both places

**Testing:**
- Both code paths must be tested separately
- Doubles test maintenance burden
- Can't remove legacy tests until migration complete

**Code Clarity:**
- New developers may be confused about which version is "correct"
- Documentation needed to explain the duplication

### Post-Migration Impact (NONE)

Once `ENABLE_REFACTORED_DOS=true` is deployed:
- Legacy code path never executes
- `processCSVImportCore()` can be safely deleted
- Single source of truth: `csv-processor.js`

---

## 6. Migration Status

### Completed Steps ✅

- [x] Refactored CSV processing into standalone service
- [x] Created `csv-processor.js` with clean interface
- [x] Implemented feature flag toggle
- [x] Both architectures coexist without conflicts
- [x] Documented migration path in code comments

### Pending Steps ⏳

- [ ] Set `ENABLE_REFACTORED_DOS=true` in production
- [ ] Monitor production for 1-2 weeks
- [ ] Verify no regressions or performance issues
- [ ] Delete legacy `processCSVImportCore()` function
- [ ] Delete legacy feature flag code in handlers
- [ ] Update tests to remove legacy code path
- [ ] Update documentation

---

## 7. Cleanup Plan

### Phase 1: Enable Refactored Architecture (LOW RISK)

**Timeline:** 1-2 hours
**Risk:** Low (feature flag allows instant rollback)

1. **Update wrangler.toml:**
   ```toml
   ENABLE_REFACTORED_DOS = "true"  # ← Switch to new architecture
   ```

2. **Deploy to production:**
   ```bash
   npx wrangler deploy
   ```

3. **Monitor for issues:**
   - Check logs for CSV processing errors
   - Verify WebSocket connections still work
   - Validate CSV parsing success rate

4. **Rollback if needed:**
   ```toml
   ENABLE_REFACTORED_DOS = "false"  # ← Instant rollback
   ```

### Phase 2: Remove Legacy Code (MEDIUM RISK)

**Timeline:** 2-4 hours
**Risk:** Medium (permanent deletion)

1. **Delete `processCSVImportCore()` from csv-import.ts**
   - Lines 129-260 can be removed
   - Keep `handleCSVImport()` (still needed for HTTP endpoint)

2. **Delete `callGemini()` from csv-import.ts**
   - Lines 270-285 can be removed
   - Import from `csv-processor.js` instead (or extract to shared utility)

3. **Simplify handler logic:**
   ```javascript
   // csv-import.ts
   export async function handleCSVImport(request, env, ctx) {
     // ... validation logic

     const jobId = crypto.randomUUID();
     const authToken = crypto.randomUUID();

     // NEW ARCHITECTURE (always)
     const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
     const wsDoStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

     const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
     const stateDoStub = env.JOB_STATE_MANAGER_DO.get(stateDoId);

     await wsDoStub.setAuthToken(authToken);
     await stateDoStub.initializeJobState(jobId, "csv_import", 0);

     const csvText = await csvFile.text();
     await stateDoStub.scheduleCSVProcessing(csvText, jobId);

     return createSuccessResponse({ jobId, token: authToken }, {}, 202);
   }
   ```

4. **Delete legacy DO bindings from wrangler.toml** (if no longer used)
   ```toml
   # These can be removed if not used elsewhere:
   [[durable_objects.bindings]]
   name = "PROGRESS_WEBSOCKET_DO"
   class_name = "ProgressWebSocketDO"
   ```

5. **Update tests:**
   - Remove tests for legacy code path
   - Keep only refactored architecture tests

### Phase 3: Documentation Update

1. **Update API_CONTRACT.md:**
   - Remove references to legacy architecture
   - Document only the refactored pattern

2. **Update ARCHITECTURE_OVERVIEW.md:**
   - Remove "Phase 2 - Architectural Refactoring" section
   - Mark migration as complete

3. **Update this document:**
   - Change status to "Cleanup Complete"
   - Archive for historical reference

---

## 8. Code Comparison

### Side-by-Side: Wait for Ready Signal

**Legacy (csv-import.ts:146-167):**
```javascript
const readyResult = await doStub.waitForReady(15000);

if (readyResult.timedOut || readyResult.disconnected) {
  const reason = readyResult.timedOut
    ? "timeout"
    : "WebSocket not connected";
  console.warn(
    `[CSV Import] WebSocket ready ${reason} for job ${jobId}, proceeding anyway`
  );
} else {
  const elapsedMs = Date.now() - startTime;
  console.log(
    `[CSV Import] ✅ WebSocket ready for job ${jobId} after ${elapsedMs}ms`
  );
}
```

**Refactored (csv-processor.js:38-51):**
```javascript
const readyResult = await progressReporter.waitForReady(15000);

if (readyResult.timedOut || readyResult.disconnected) {
  const reason = readyResult.timedOut ? "timeout" : "not connected";
  console.warn(
    `[CSV Processor] Client ready ${reason}, proceeding anyway`
  );
} else {
  const elapsedMs = Date.now() - startTime;
  console.log(`[CSV Processor] ✅ Client ready after ${elapsedMs}ms`);
}
```

**Difference:** Identical logic, different variable names (`doStub` vs `progressReporter`)

---

### Side-by-Side: Gemini Parsing

**Legacy (csv-import.ts:188-209):**
```javascript
const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
let parsedBooks = await env.KV_CACHE.get(cacheKey, "json");

if (!parsedBooks) {
  const prompt = buildCSVParserPrompt();
  parsedBooks = await callGemini(csvText, prompt, env);

  if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
    throw new Error("No valid books found in CSV");
  }

  await env.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
    expirationTtl: 604800, // 7 days
  });
}
```

**Refactored (csv-processor.js:74-91):**
```javascript
const cacheKey = await generateCSVCacheKey(csvText, PROMPT_VERSION);
let parsedBooks = await env.KV_CACHE.get(cacheKey, "json");

if (!parsedBooks) {
  const prompt = buildCSVParserPrompt();
  parsedBooks = await callGemini(csvText, prompt, env);

  if (!Array.isArray(parsedBooks) || parsedBooks.length === 0) {
    throw new Error("No valid books found in CSV");
  }

  await env.KV_CACHE.put(cacheKey, JSON.stringify(parsedBooks), {
    expirationTtl: 604800, // 7 days
  });
}
```

**Difference:** **IDENTICAL** - 100% duplication

---

### Side-by-Side: callGemini() Helper

**Legacy (csv-import.ts:270-285):**
```javascript
async function callGemini(csvText, prompt, env) {
  const apiKey = env.GEMINI_API_KEY?.get
    ? await env.GEMINI_API_KEY.get()
    : env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
```

**Refactored (csv-processor.js:156-166):**
```javascript
async function callGemini(csvText, prompt, env) {
  const apiKey = env.GEMINI_API_KEY?.get
    ? await env.GEMINI_API_KEY.get()
    : env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  return await parseCSVWithGemini(csvText, prompt, apiKey);
}
```

**Difference:** **IDENTICAL** - 100% duplication

---

## 9. Recommendations

### Short-Term (Immediate)

1. **Add Comment to Legacy Code:**
   ```javascript
   // src/handlers/csv-import.ts:142
   /**
    * LEGACY IMPLEMENTATION (Deprecated)
    *
    * This function is maintained for backward compatibility during the
    * Durable Object architectural refactoring (Phase 2).
    *
    * SOURCE OF TRUTH: src/services/csv-processor.js
    *
    * When ENABLE_REFACTORED_DOS=true, this code path is not executed.
    * After migration is complete, this function will be deleted.
    *
    * See: docs/CSV_PROCESSING_DUPLICATION_ANALYSIS.md
    */
   export async function processCSVImportCore(csvText, jobId, doStub, env) {
     // ...
   }
   ```

2. **Document Migration Timeline:**
   - Create GitHub issue: "Complete CSV Processing Migration"
   - Set target date: 2 weeks after `ENABLE_REFACTORED_DOS=true`
   - Assign to team lead for approval

### Medium-Term (1-2 Weeks)

1. **Enable Refactored Architecture:**
   - Set `ENABLE_REFACTORED_DOS=true` in production
   - Monitor for 1-2 weeks
   - Collect performance metrics

2. **Validate No Regressions:**
   - CSV parsing success rate unchanged
   - WebSocket connection stability unchanged
   - No increase in error rates

### Long-Term (After 2 Weeks Monitoring)

1. **Delete Legacy Code:**
   - Remove `processCSVImportCore()` from csv-import.ts
   - Remove `callGemini()` from csv-import.ts
   - Simplify handler logic

2. **Extract Shared Helper:**
   - Move `callGemini()` to `src/utils/gemini-helpers.js`
   - Import from shared location in `csv-processor.js`

3. **Update Documentation:**
   - Mark migration as complete
   - Update architecture diagrams
   - Archive this analysis document

---

## 10. Testing Strategy

### Before Migration (ENABLE_REFACTORED_DOS=false)

```javascript
describe("CSV Processing - Legacy", () => {
  it("should process CSV via ProgressWebSocketDO", async () => {
    const env = { ENABLE_REFACTORED_DOS: "false" };
    // Test legacy code path
  });
});
```

### During Migration (Both Paths Active)

```javascript
describe("CSV Processing - Feature Flag", () => {
  it("should use legacy architecture when flag is false", async () => {
    const env = { ENABLE_REFACTORED_DOS: "false" };
    // Verify processCSVImportCore is called
  });

  it("should use refactored architecture when flag is true", async () => {
    const env = { ENABLE_REFACTORED_DOS: "true" };
    // Verify csv-processor.js service is used
  });
});
```

### After Migration (ENABLE_REFACTORED_DOS=true)

```javascript
describe("CSV Processing - Refactored", () => {
  it("should process CSV via csv-processor service", async () => {
    // No need to test feature flag anymore
    // Only test the refactored service
  });
});
```

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Regression in CSV parsing | Low | High | Thorough testing before migration |
| WebSocket connection issues | Low | High | Feature flag allows instant rollback |
| Performance degradation | Very Low | Medium | Monitor metrics during migration |
| Data loss during transition | Very Low | Critical | KV storage ensures no data loss |
| Missing error handling | Very Low | Medium | Both implementations tested extensively |

**Overall Risk:** **LOW** - Feature flag provides safety net

---

## 12. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| CSV Parsing Success Rate | ≥99% | Compare before/after migration |
| WebSocket Connection Success | ≥99% | Monitor connection failures |
| Average Processing Time | ≤30 seconds | Track from job start to completion |
| Error Rate | ≤1% | Count exceptions in logs |
| Code Duplication | 0% | After legacy code deletion |

### Validation Checklist

- [ ] CSV parsing success rate unchanged after migration
- [ ] WebSocket connections stable for 2 weeks
- [ ] No increase in error logs
- [ ] Performance metrics within acceptable range
- [ ] Feature flag can be removed
- [ ] Legacy code deleted
- [ ] Documentation updated

---

## 13. References

### Related Issues

- #180 - Eliminate code duplication in CSV processing (this issue)
- #68 - Refactor Monolithic ProgressWebSocketDO
- #181 - Token limit mismatch in CSV validation
- #249 - CSV processing uses DO alarm to avoid CPU limits

### Internal Documentation

- `src/handlers/csv-import.ts` - Legacy implementation
- `src/services/csv-processor.js` - Refactored service
- `wrangler.toml` - Feature flag configuration
- `docs/ARCHITECTURE_OVERVIEW.md` - System architecture

---

## 14. Next Steps

1. ✅ **Analysis Complete** - Document duplication (this file)
2. ⏳ **Add Code Comments** - Mark legacy code as deprecated
3. ⏳ **Create Migration Issue** - GitHub issue with timeline
4. ⏳ **Enable Refactored Architecture** - Set feature flag to true
5. ⏳ **Monitor Production** - 2 weeks observation period
6. ⏳ **Delete Legacy Code** - Remove processCSVImportCore()
7. ⏳ **Update Documentation** - Mark migration complete

---

**Document Version:** 1.0
**Last Updated:** November 20, 2025
**Next Review:** After feature flag enabled in production
