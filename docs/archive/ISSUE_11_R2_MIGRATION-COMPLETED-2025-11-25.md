# Issue #11: R2 Migration for Hibernation Fix

**Status:** Planning Phase
**Priority:** P0 Critical (70-80% cost savings via hibernation)
**Target Release:** Sprint 4 (Q4 2025)
**Estimated Effort:** 40-60 engineering hours

## Executive Summary

The WebSocket Hibernation API provides 70-80% cost savings by allowing Durable Objects to sleep between messages. However, storing large CSV and image payloads (8-10MB) in DO storage causes "code has been updated" hibernation failures when deployments occur. This is because hibernated instances cannot deserialize storage state if the code has changed.

**Solution:** Move all large payloads to Cloudflare R2 object storage, keeping only R2 object keys and metadata in DO storage.

**Impact:**
- Enables WebSocket hibernation (70-80% cost reduction)
- Eliminates hibernation failures during deployments
- Improves DO storage efficiency (DO storage: 1GB free, R2: cost-effective for large objects)
- Provides durable, long-term storage for job artifacts

---

## Problem Analysis

### Root Cause (#8)

Current implementation stores payloads directly in DO storage:

```javascript
// PROBLEMATIC: Storing large payloads in DO storage (lines 809, 840)
async scheduleCSVProcessing(csvText, jobId) {
  // csvText can be 8MB - causes hibernation failures
  await this.state.storage.put(STORAGE_KEYS.CSV_DATA, csvText);
}

async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
  // imageData can be 10MB - causes hibernation failures
  await this.state.storage.put(STORAGE_KEYS.IMAGE_DATA, imageData);
}
```

When Cloudflare Workers redeploys code:
1. Hibernated instances wake up to deserialize storage state
2. Old code tries to deserialize 8-10MB blobs
3. Deserialization fails → "code has been updated" error
4. Hibernation disabled on subsequent deployments

### Current State (Nov 24, 2025)

**File:** `src/durable-objects/progress-socket-hibernation.js`

- Line 809: `scheduleCSVProcessing()` stores CSV data directly in DO storage
- Line 840: `scheduleBookshelfScan()` stores image data directly in DO storage
- Lines 900-937: `processCSVImportAlarm()` retrieves and processes CSV
- Lines 943-1001: `processBookshelfScanAlarm()` retrieves and processes image

**R2 Buckets Already Configured:**
- `API_CACHE_COLD` (personal-library-data)
- `LIBRARY_DATA` (personal-library-data)
- `BOOKSHELF_IMAGES` (bookshelf-images)
- `BOOK_COVERS` (bookstrack-covers)

### Success Criteria

1. CSV and image data stored in R2, not DO storage
2. DO storage contains only R2 keys (string references)
3. Hibernation remains enabled during and after deployments
4. Zero hibernation failures during 24-hour deployment window
5. All existing tests pass
6. No regression in performance (P95 latency < 100ms increase)
7. Cleanup logic removes R2 objects after processing or expiry

---

## Architecture Changes

### Current Architecture (Problematic)

```
Client Request
    ↓
HTTP Handler (/api/csv-import, /api/bookshelf-scan)
    ↓
Create DO Stub → RPC Call
    ↓
scheduleCSVProcessing() / scheduleBookshelfScan()
    ↓
Store Payload in DO Storage (8-10MB) ← PROBLEM: Hibernation failure on redeploy
    ↓
Set Alarm (2 seconds)
    ↓
Hibernation: DO sleeps...
    ↓
Code Update Deployment
    ↓
Hibernation Failure: "code has been updated" (cannot deserialize 8-10MB blob)
    ↓
ENABLE_HIBERNATION_WEBSOCKET disabled
```

### Target Architecture (Fixed)

```
Client Request
    ↓
HTTP Handler (/api/csv-import, /api/bookshelf-scan)
    ↓
Create DO Stub → RPC Call
    ↓
scheduleCSVProcessing() / scheduleBookshelfScan()
    ↓
Upload Payload to R2 (8-10MB) ← NEW: Object storage, not DO storage
    ↓
Store R2 Key in DO Storage (64 bytes) ← MINIMAL: Only metadata
    ↓
Set Alarm (2 seconds)
    ↓
Hibernation: DO sleeps...
    ↓
Code Update Deployment ← WORKS: Small metadata only, can deserialize instantly
    ↓
Alarm Wakes DO
    ↓
Fetch Payload from R2 using Key
    ↓
Process Payload
    ↓
Delete R2 Object
    ↓
Clean Up DO Storage
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ CSV Import / Bookshelf Scan Flow (R2 Migration)                  │
└──────────────────────────────────────────────────────────────────┘

1. CLIENT SUBMISSION (HTTP)
   ┌─────────────────────────────────────────┐
   │ POST /api/csv-import                    │
   │ Content-Type: multipart/form-data       │
   │ (CSV file: 1-8MB, Images: 1-10MB)      │
   └─────────────────────────────────────────┘
            ↓

2. HTTP HANDLER (Worker)
   ┌─────────────────────────────────────────┐
   │ handler/csv-import.ts                   │
   │ 1. Validate file size                   │
   │ 2. Create jobId (UUID)                  │
   │ 3. Create DO Stub                       │
   │ 4. Call RPC: setAuthToken()             │
   │ 5. Call RPC: initializeJobState()       │
   │ 6. Return 202 Accepted + jobId          │
   └─────────────────────────────────────────┘
            ↓

3. RPC: SCHEDULE PROCESSING (DO)
   ┌─────────────────────────────────────────┐
   │ scheduleCSVProcessing(csvText, jobId)   │
   │                                         │
   │ NEW: Upload to R2                       │
   │  a. Generate R2 key:                    │
   │     csv/{jobId}/{timestamp}.csv         │
   │  b. Upload payload to R2                │
   │  c. Get R2 size/etag for tracking       │
   │                                         │
   │ Store Minimal Metadata in DO:           │
   │  - R2_CSV_KEY = "csv/uuid/ts.csv"      │
   │  - CSV_SIZE = 2441216 (bytes)           │
   │  - CSV_ETAG = "abc123def456" (tracking)│
   │  - UPLOAD_TIME = 1700000000000          │
   │  - JOB_TYPE = "csv-import"              │
   │                                         │
   │ Schedule Alarm (2 seconds)              │
   └─────────────────────────────────────────┘
            ↓
     DO HIBERNATION (70-80% cost savings)
            ↓

4. ALARM: PROCESS PAYLOAD (DO)
   ┌─────────────────────────────────────────┐
   │ alarm() → processCSVImportAlarm()        │
   │                                         │
   │ NEW: Fetch from R2                      │
   │  a. Load R2_CSV_KEY from storage        │
   │  b. Read object from R2 using key       │
   │  c. Verify size/etag matches metadata   │
   │                                         │
   │ Process CSV (access to AI, DB, etc.)   │
   │  a. Parse CSV                           │
   │  b. Validate rows                       │
   │  c. Call Gemini API (async, no timeout)│
   │  d. Send progress updates to WebSocket  │
   │  e. Store results in D1                 │
   │                                         │
   │ Cleanup:                                │
   │  a. Delete R2 object                    │
   │  b. Clear DO storage                    │
   │  c. Handle errors gracefully            │
   └─────────────────────────────────────────┘
            ↓

5. CLIENT NOTIFICATION (WebSocket)
   ┌─────────────────────────────────────────┐
   │ Receive progress updates                │
   │ Receive completion or error             │
   │ Connection closes                       │
   └─────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: R2 Configuration & Utilities

**Goal:** Add R2 bucket configuration and create utility functions.

**Tasks:**

1. **Update `wrangler.jsonc`** (if needed)
   - Add new R2 binding: `HIBERNATION_PAYLOADS` → `bookstrack-hibernation-payloads`
   - Or reuse existing: `BOOKSHELF_IMAGES` for images, create new bucket for CSV
   - Verify bucket exists and permissions are correct

2. **Create `src/utils/r2-hibernation.js`** (NEW FILE)
   ```javascript
   /**
    * R2 utilities for hibernation-safe payload storage
    * Handles upload, download, delete, and retry logic
    */

   // Upload payload to R2
   export async function uploadPayloadToR2(env, jobId, type, data, metadata = {})
   // Returns: { r2Key, size, etag }

   // Download payload from R2
   export async function fetchPayloadFromR2(env, r2Key)
   // Returns: raw payload (Buffer/string)

   // Delete payload from R2
   export async function deletePayloadFromR2(env, r2Key)

   // Generate object key (jobId-based)
   export function generateR2Key(jobId, type)
   // Returns: "csv/{jobId}/{timestamp}.csv" or "image/{jobId}/{timestamp}.jpg"

   // Validate payload before upload
   export function validatePayloadSize(type, data)
   // Returns: { valid, error?, size }
   ```

3. **Create `tests/unit/r2-hibernation.test.js`**
   - Mock R2 with Miniflare
   - Test upload/download/delete cycles
   - Test error handling (upload failures, timeouts)
   - Test cleanup on error

**Key Decisions:**

- **R2 Bucket Strategy:** Create separate `bookstrack-hibernation-payloads` bucket for isolation
- **Key Format:** `{type}/{jobId}/{timestamp}.{ext}` (e.g., `csv/abc123-uuid/1700000000.csv`)
- **Cleanup Window:** Delete after 24 hours if not processed (safety net)
- **Error Handling:** Retry uploads 3x, log failures, track in metrics

---

### Phase 2: Refactor CSV Processing

**Goal:** Migrate `scheduleCSVProcessing()` to use R2.

**Files to Modify:**

1. **`src/durable-objects/progress-socket-hibernation.js`** (LINES 805-823)

   **Before:**
   ```javascript
   async scheduleCSVProcessing(csvText, jobId) {
     console.log(`[${jobId}] Scheduling CSV processing via alarm`);

     // Store CSV data directly in DO storage (PROBLEMATIC)
     await this.state.storage.put(STORAGE_KEYS.CSV_DATA, csvText);
     await this.state.storage.put(STORAGE_KEYS.JOB_ID, jobId);
     await this.state.storage.put(STORAGE_KEYS.JOB_TYPE, "csv-import");

     const alarmTime = Date.now() + 2000;
     await this.state.storage.setAlarm(alarmTime);

     return { success: true };
   }
   ```

   **After:**
   ```javascript
   async scheduleCSVProcessing(csvText, jobId) {
     console.log(`[${jobId}] Scheduling CSV processing via alarm`);

     try {
       // 1. Validate payload size
       const { valid, error, size } = validatePayloadSize('csv', csvText);
       if (!valid) {
         throw new Error(`CSV validation failed: ${error}`);
       }

       // 2. Upload to R2
       const { r2Key, etag } = await uploadPayloadToR2(
         this.env,
         jobId,
         'csv',
         csvText
       );
       console.log(`[${jobId}] CSV uploaded to R2: ${r2Key} (${size} bytes)`);

       // 3. Store minimal metadata in DO storage
       await this.state.storage.put({
         [STORAGE_KEYS.JOB_ID]: jobId,
         [STORAGE_KEYS.JOB_TYPE]: 'csv-import',
         'R2_CSV_KEY': r2Key,
         'CSV_SIZE': size,
         'CSV_ETAG': etag,
         'CSV_UPLOAD_TIME': Date.now(),
       });

       // 4. Schedule alarm
       const alarmTime = Date.now() + 2000;
       await this.state.storage.setAlarm(alarmTime);
       console.log(`[${jobId}] Alarm scheduled`);

       return { success: true };
     } catch (error) {
       console.error(`[${jobId}] Failed to schedule CSV processing:`, error);
       throw error;
     }
   }
   ```

2. **`src/durable-objects/progress-socket-hibernation.js`** (LINES 900-937)

   **Before:**
   ```javascript
   async processCSVImportAlarm() {
     const csvText = await this.state.storage.get(STORAGE_KEYS.CSV_DATA);
     const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

     // Process directly from DO storage
     await processCSVImportCore(csvText, jobId, this, this.env);

     // Clean up
     await this.state.storage.delete(STORAGE_KEYS.CSV_DATA);
   }
   ```

   **After:**
   ```javascript
   async processCSVImportAlarm() {
     const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
     const r2Key = await this.state.storage.get('R2_CSV_KEY');
     const csvSize = await this.state.storage.get('CSV_SIZE');

     console.log(`[${jobId}] Starting CSV processing (R2 fetch)`);

     try {
       // 1. Fetch from R2
       const csvText = await fetchPayloadFromR2(this.env, r2Key);

       // 2. Validate size matches metadata
       if (csvText.length !== csvSize) {
         throw new Error(`CSV size mismatch: expected ${csvSize}, got ${csvText.length}`);
       }

       // 3. Process CSV
       await processCSVImportCore(csvText, jobId, this, this.env);
       console.log(`[${jobId}] CSV processing completed`);

       // 4. Delete from R2
       await deletePayloadFromR2(this.env, r2Key);
       console.log(`[${jobId}] R2 object deleted: ${r2Key}`);

       // 5. Clean up DO storage
       await this.state.storage.delete([
         STORAGE_KEYS.CSV_DATA,
         STORAGE_KEYS.JOB_ID,
         STORAGE_KEYS.JOB_TYPE,
         'R2_CSV_KEY',
         'CSV_SIZE',
         'CSV_ETAG',
         'CSV_UPLOAD_TIME',
       ]);
     } catch (error) {
       console.error(`[${jobId}] CSV processing failed:`, error);

       // Attempt cleanup (best effort)
       try {
         if (r2Key) {
           await deletePayloadFromR2(this.env, r2Key);
           console.log(`[${jobId}] R2 cleanup completed`);
         }
       } catch (cleanupError) {
         console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
       }

       // Send error to client
       await this.sendError("csv_import", {
         code: "CSV_PROCESSING_ERROR",
         message: error.message,
         details: { fallbackAvailable: true },
         retryable: true,
       });

       // Clean up DO storage even on error
       await this.state.storage.delete([
         STORAGE_KEYS.CSV_DATA,
         STORAGE_KEYS.JOB_ID,
         STORAGE_KEYS.JOB_TYPE,
         'R2_CSV_KEY',
         'CSV_SIZE',
         'CSV_ETAG',
         'CSV_UPLOAD_TIME',
       ]);
     }
   }
   ```

**Tests:**
- Unit: R2 upload/download with various CSV sizes (100B, 1MB, 8MB)
- Integration: CSV processing end-to-end with R2 storage
- Error: Handle R2 upload failures, network timeouts, cleanup failures

---

### Phase 3: Refactor Bookshelf Scan

**Goal:** Migrate `scheduleBookshelfScan()` to use R2.

**Files to Modify:**

1. **`src/durable-objects/progress-socket-hibernation.js`** (LINES 836-854)

   **Before:**
   ```javascript
   async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
     console.log(`[${jobId}] Scheduling bookshelf scan via alarm`);

     // Store image data directly in DO storage (PROBLEMATIC)
     await this.state.storage.put(STORAGE_KEYS.IMAGE_DATA, imageData);
     await this.state.storage.put(STORAGE_KEYS.REQUEST_HEADERS, requestHeaders || {});
     await this.state.storage.put(STORAGE_KEYS.JOB_ID, jobId);
     await this.state.storage.put(STORAGE_KEYS.JOB_TYPE, "bookshelf-scan");

     const alarmTime = Date.now() + 2000;
     await this.state.storage.setAlarm(alarmTime);

     return { success: true };
   }
   ```

   **After:**
   ```javascript
   async scheduleBookshelfScan(imageData, jobId, requestHeaders) {
     console.log(`[${jobId}] Scheduling bookshelf scan via alarm`);

     try {
       // 1. Validate payload size
       const { valid, error, size } = validatePayloadSize('image', imageData);
       if (!valid) {
         throw new Error(`Image validation failed: ${error}`);
       }

       // 2. Upload to R2
       const { r2Key, etag } = await uploadPayloadToR2(
         this.env,
         jobId,
         'image',
         imageData
       );
       console.log(`[${jobId}] Image uploaded to R2: ${r2Key} (${size} bytes)`);

       // 3. Store minimal metadata in DO storage
       await this.state.storage.put({
         [STORAGE_KEYS.JOB_ID]: jobId,
         [STORAGE_KEYS.JOB_TYPE]: 'bookshelf-scan',
         'R2_IMAGE_KEY': r2Key,
         'IMAGE_SIZE': size,
         'IMAGE_ETAG': etag,
         'IMAGE_UPLOAD_TIME': Date.now(),
         [STORAGE_KEYS.REQUEST_HEADERS]: requestHeaders || {},
       });

       // 4. Schedule alarm
       const alarmTime = Date.now() + 2000;
       await this.state.storage.setAlarm(alarmTime);
       console.log(`[${jobId}] Alarm scheduled`);

       return { success: true };
     } catch (error) {
       console.error(`[${jobId}] Failed to schedule bookshelf scan:`, error);
       throw error;
     }
   }
   ```

2. **`src/durable-objects/progress-socket-hibernation.js`** (LINES 943-1001)

   **Before:**
   ```javascript
   async processBookshelfScanAlarm() {
     const imageData = await this.state.storage.get(STORAGE_KEYS.IMAGE_DATA);
     const requestHeaders = await this.state.storage.get(STORAGE_KEYS.REQUEST_HEADERS);
     const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);

     // Process directly from DO storage
     await processBookshelfScan(jobId, imageData, mockRequest, this.env, this, null);

     // Clean up
     await this.state.storage.delete(STORAGE_KEYS.IMAGE_DATA);
   }
   ```

   **After:**
   ```javascript
   async processBookshelfScanAlarm() {
     const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
     const r2Key = await this.state.storage.get('R2_IMAGE_KEY');
     const imageSize = await this.state.storage.get('IMAGE_SIZE');
     const requestHeaders = await this.state.storage.get(STORAGE_KEYS.REQUEST_HEADERS);

     console.log(`[${jobId}] Starting bookshelf scan (R2 fetch)`);

     try {
       // 1. Fetch from R2
       const imageData = await fetchPayloadFromR2(this.env, r2Key);

       // 2. Validate size matches metadata
       if (imageData.length !== imageSize) {
         throw new Error(`Image size mismatch: expected ${imageSize}, got ${imageData.length}`);
       }

       // 3. Create mock request
       const mockRequest = {
         headers: {
           get: (key) => requestHeaders[key] || null,
         },
       };

       // 4. Process bookshelf scan
       await processBookshelfScan(jobId, imageData, mockRequest, this.env, this, null);
       console.log(`[${jobId}] Bookshelf scan completed`);

       // 5. Delete from R2
       await deletePayloadFromR2(this.env, r2Key);
       console.log(`[${jobId}] R2 object deleted: ${r2Key}`);

       // 6. Clean up DO storage
       await this.state.storage.delete([
         STORAGE_KEYS.IMAGE_DATA,
         STORAGE_KEYS.REQUEST_HEADERS,
         STORAGE_KEYS.JOB_ID,
         STORAGE_KEYS.JOB_TYPE,
         'R2_IMAGE_KEY',
         'IMAGE_SIZE',
         'IMAGE_ETAG',
         'IMAGE_UPLOAD_TIME',
       ]);
     } catch (error) {
       console.error(`[${jobId}] Bookshelf scan failed:`, error);

       // Attempt cleanup (best effort)
       try {
         if (r2Key) {
           await deletePayloadFromR2(this.env, r2Key);
           console.log(`[${jobId}] R2 cleanup completed`);
         }
       } catch (cleanupError) {
         console.error(`[${jobId}] R2 cleanup failed:`, cleanupError);
       }

       // Send error to client
       await this.sendError("ai_scan", {
         code: "AI_SCAN_PROCESSING_ERROR",
         message: error.message,
         details: { fallbackAvailable: false },
         retryable: true,
       });

       // Clean up DO storage even on error
       await this.state.storage.delete([
         STORAGE_KEYS.IMAGE_DATA,
         STORAGE_KEYS.REQUEST_HEADERS,
         STORAGE_KEYS.JOB_ID,
         STORAGE_KEYS.JOB_TYPE,
         'R2_IMAGE_KEY',
         'IMAGE_SIZE',
         'IMAGE_ETAG',
         'IMAGE_UPLOAD_TIME',
       ]);
     }
   }
   ```

**Tests:**
- Unit: R2 upload/download with various image sizes (100KB, 5MB, 10MB)
- Integration: Bookshelf scan end-to-end with R2 storage
- Error: Handle R2 upload failures, image processing failures, cleanup failures

---

### Phase 4: Update Alarm Routing

**Goal:** Ensure alarm handler correctly routes to updated functions.

**File:** `src/durable-objects/progress-socket-hibernation.js` (LINES 865-894)

**Current Code (Already Correct):**
```javascript
async alarm() {
  const jobId = await this.state.storage.get(STORAGE_KEYS.JOB_ID);
  const jobType = await this.state.storage.get(STORAGE_KEYS.JOB_TYPE);

  if (jobType === "csv-import") {
    await this.processCSVImportAlarm();  // ← Will use R2
  } else if (jobType === "bookshelf-scan") {
    await this.processBookshelfScanAlarm();  // ← Will use R2
  } else {
    // Token refresh logic
  }
}
```

**No changes needed** - existing routing already supports new implementations.

---

### Phase 5: Cleanup & Retention Policy

**Goal:** Implement automatic cleanup and retention policies.

**Tasks:**

1. **Create `src/utils/r2-lifecycle.js`** (NEW FILE)
   ```javascript
   /**
    * R2 lifecycle and cleanup policies
    */

   // Schedule cleanup for old/failed jobs (24-hour window)
   export async function scheduleCleanup(env, r2Key, delayMs = 24 * 60 * 60 * 1000)

   // Force cleanup on job failure
   export async function forceCleanup(env, r2Key)

   // Cleanup after successful processing
   export async function cleanupOnSuccess(env, r2Key)
   ```

2. **Cleanup on Error** (Already in Phase 2/3 implementations)
   - When CSV processing fails → Delete R2 object
   - When image processing fails → Delete R2 object

3. **Cleanup on Success** (Already in Phase 2/3 implementations)
   - After CSV processing completes → Delete R2 object
   - After image processing completes → Delete R2 object

4. **Safety Net: 24-Hour Expiration**
   - Set R2 object expiration to 24 hours
   - Prevents orphaned objects from accumulating
   - Option: Use Cloudflare Lifecycle Rules (manual setup in dashboard)

**Tests:**
- Verify R2 objects are deleted after successful processing
- Verify R2 objects are deleted after failed processing
- Verify 24-hour expiration policy (manual test with real R2)

---

### Phase 6: Hibernation Re-enablement

**Goal:** Re-enable hibernation after verifying fixes.

**Steps:**

1. **Update `wrangler.jsonc`**
   ```javascript
   "ENABLE_HIBERNATION_WEBSOCKET": "true"  // Enable hibernation
   ```

2. **Verify Feature Flag** (in Router)
   - Ensure code checks `env.ENABLE_HIBERNATION_WEBSOCKET`
   - Route to `ProgressWebSocketDO_Hibernation` when enabled

3. **Deploy with Monitoring**
   - Deploy to staging environment first
   - Monitor hibernation metrics (wake/sleep cycles)
   - Run 24-hour stability test
   - Deploy to production with gradual rollout (1% → 10% → 50% → 100%)

4. **Success Metrics**
   - Zero hibernation failures during 24-hour window
   - Zero "code has been updated" errors
   - 70-80% cost reduction (verify in Cloudflare analytics)
   - No performance degradation (P95 latency unchanged)

---

### Phase 7: Testing Strategy

#### Unit Tests

**File:** `tests/unit/r2-hibernation.test.js`

```javascript
describe('R2 Hibernation Utilities', () => {
  describe('uploadPayloadToR2', () => {
    it('should upload CSV payload successfully', async () => {
      const csvData = 'name,author\nBook1,Author1\n';
      const { r2Key, size, etag } = await uploadPayloadToR2(env, 'job-123', 'csv', csvData);

      expect(r2Key).toMatch(/^csv\/job-123\/\d+\.csv$/);
      expect(size).toBe(csvData.length);
      expect(etag).toBeDefined();
    });

    it('should handle 8MB CSV payload', async () => {
      const csvData = Buffer.alloc(8 * 1024 * 1024); // 8MB
      const { size } = await uploadPayloadToR2(env, 'job-456', 'csv', csvData);
      expect(size).toBe(8 * 1024 * 1024);
    });

    it('should reject oversized payload', async () => {
      const oversized = Buffer.alloc(15 * 1024 * 1024); // 15MB (over limit)
      expect(() => validatePayloadSize('csv', oversized)).toThrow();
    });
  });

  describe('fetchPayloadFromR2', () => {
    it('should fetch and verify payload integrity', async () => {
      const original = 'test data';
      const { r2Key } = await uploadPayloadToR2(env, 'job-789', 'csv', original);

      const fetched = await fetchPayloadFromR2(env, r2Key);
      expect(fetched).toEqual(original);
    });
  });

  describe('deletePayloadFromR2', () => {
    it('should delete R2 object', async () => {
      const { r2Key } = await uploadPayloadToR2(env, 'job-abc', 'csv', 'data');
      await deletePayloadFromR2(env, r2Key);

      // Verify deletion
      expect(async () => {
        await fetchPayloadFromR2(env, r2Key);
      }).rejects.toThrow();
    });
  });
});
```

#### Integration Tests

**File:** `tests/integration/csv-import-r2.test.js`

```javascript
describe('CSV Import with R2 Storage', () => {
  it('should process CSV end-to-end with R2', async () => {
    const jobId = crypto.randomUUID();
    const csvData = 'isbn,title,author\n9780439708180,Harry Potter,J.K. Rowling\n';

    // 1. Simulate HTTP handler uploading to DO
    const doStub = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(jobId);
    const scheduleResult = await doStub.scheduleCSVProcessing(csvData, jobId);
    expect(scheduleResult.success).toBe(true);

    // 2. Verify DO storage contains only R2 key
    const doState = await doStub.getState(); // Helper method
    expect(doState.R2_CSV_KEY).toBeDefined();
    expect(doState.R2_CSV_KEY).toMatch(/^csv\/.*\.csv$/);
    expect(doState.CSV_DATA).toBeUndefined(); // Should not exist

    // 3. Trigger alarm
    await doStub.alarm();

    // 4. Verify processing completed
    const finalState = await doStub.getState();
    expect(finalState.CSV_DATA).toBeUndefined();
    expect(finalState.R2_CSV_KEY).toBeUndefined(); // Cleaned up
  });

  it('should cleanup on error', async () => {
    const jobId = crypto.randomUUID();
    const badCSVData = 'invalid\ncsv\nwith\nbad\nstructure';

    // Process and expect error
    const doStub = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(jobId);
    await doStub.scheduleCSVProcessing(badCSVData, jobId);

    // Trigger alarm (will fail during processing)
    try {
      await doStub.alarm();
    } catch (error) {
      // Expected error
    }

    // Verify R2 and DO storage cleaned up
    const r2Key = await doStub.getStorageValue('R2_CSV_KEY');
    expect(r2Key).toBeUndefined();
  });
});
```

#### Hibernation Tests

**File:** `tests/integration/hibernation-redeploy.test.js`

```javascript
describe('Hibernation During Code Updates', () => {
  it('should survive code deployment without errors', async () => {
    const jobId = crypto.randomUUID();
    const csvData = 'name,author\nBook1,Author1\n';

    // 1. Start CSV processing
    const doStub = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(jobId);
    await doStub.scheduleCSVProcessing(csvData, jobId);

    // 2. DO hibernates (simulated by letting time pass)
    // Normally DO would sleep here for 2+ seconds

    // 3. Simulate code update
    // (In real test: deploy new code, watch for errors)

    // 4. Trigger alarm after code update
    await doStub.alarm();

    // 5. Verify no "code has been updated" errors
    const logs = await getLogsSince(deploymentTime);
    expect(logs).not.toContain('code has been updated');
    expect(logs).toContain('CSV processing completed');
  });
});
```

#### Performance Tests

**File:** `tests/performance/r2-migration-perf.test.js`

```javascript
describe('R2 Migration Performance', () => {
  it('should maintain P95 latency < 100ms', async () => {
    const measurements = [];

    for (let i = 0; i < 100; i++) {
      const startTime = Date.now();

      // Upload, schedule, trigger alarm
      const csvData = 'name,author\nBook1,Author1\n';
      const doStub = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(crypto.randomUUID());
      await doStub.scheduleCSVProcessing(csvData, 'job-' + i);

      measurements.push(Date.now() - startTime);
    }

    // Calculate P95
    const sorted = measurements.sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    expect(p95).toBeLessThan(100);
  });
});
```

---

### Phase 8: Deployment & Rollout

#### Pre-Deployment Checklist

- [ ] All unit tests passing (r2-hibernation.test.js)
- [ ] All integration tests passing (csv-import-r2.test.js)
- [ ] Hibernation tests passing (hibernation-redeploy.test.js)
- [ ] Performance tests passing (P95 latency within budget)
- [ ] Code review completed (CF Workers best practices)
- [ ] R2 bucket exists and permissions verified
- [ ] Cleanup policy configured (24-hour expiration)
- [ ] Monitoring/alerts configured (R2 failures, cleanup errors)
- [ ] Rollback plan documented and tested

#### Deployment Steps

1. **Staging Deployment (1-2 hours)**
   - Deploy to staging environment
   - Run 1-hour stability test
   - Monitor for errors, latency
   - Verify hibernation cycles working

2. **Production Canary (10-30 minutes)**
   - Deploy to production
   - Set `ENABLE_HIBERNATION_WEBSOCKET=true` for 1% of traffic
   - Monitor error rate, latency, hibernation failures
   - Target: 0 hibernation errors

3. **Production Gradual Rollout (1-2 hours)**
   - 1% → 10% → 50% → 100% (each step: 20 minutes)
   - Monitor at each step
   - Stop rollout if error rate > 0.1%

4. **Post-Deployment Validation (24 hours)**
   - Run continuous monitoring
   - Verify 70-80% cost savings in Cloudflare analytics
   - Check for orphaned R2 objects (cleanup policy working)
   - Validate no "code has been updated" errors

#### Rollback Plan

If hibernation failures occur:

1. **Immediate Rollback**
   ```bash
   npm run deploy -- --feature-flag ENABLE_HIBERNATION_WEBSOCKET=false
   ```

2. **Investigation**
   - Check hibernation failure logs in `/logs`
   - Analyze R2 operation error logs
   - Check DO storage deserialization errors

3. **Fix & Re-deploy**
   - Address root cause
   - Increment version number
   - Re-test in staging
   - Re-deploy with gradual rollout

---

## Testing Strategy Summary

| Phase | Test Type | Files | Goal |
|-------|-----------|-------|------|
| 1 | Unit | `r2-hibernation.test.js` | Verify R2 utilities work |
| 2-3 | Integration | `csv-import-r2.test.js`, `bookshelf-scan-r2.test.js` | End-to-end CSV/image processing |
| 6 | Hibernation | `hibernation-redeploy.test.js` | Survive code deployments |
| 8 | Performance | `r2-migration-perf.test.js` | Maintain latency budget |
| 8 | Smoke | Production canary tests | Real-world validation |

---

## Implementation Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| 1 (R2 Config) | 2-4 hours | Day 1 | Day 1 |
| 2 (CSV) | 4-6 hours | Day 1 | Day 2 |
| 3 (Bookshelf Scan) | 4-6 hours | Day 2 | Day 2 |
| 4 (Alarm Routing) | 1 hour | Day 2 | Day 2 |
| 5 (Cleanup) | 2-3 hours | Day 3 | Day 3 |
| 6 (Hibernation) | 1 hour | Day 3 | Day 3 |
| 7 (Testing) | 8-12 hours | Day 1-3 | Day 3 |
| 8 (Deployment) | 2-3 hours | Day 4 | Day 4 |
| **Total** | **24-35 hours** | **Day 1** | **Day 4** |

**Realistic Estimate:** 40-60 engineering hours (accounting for testing, debugging, code review)

---

## Risk Analysis

### High Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| R2 API timeout during upload | Medium | High | Implement retry logic (3x), timeout=30s |
| Large payload deserialization failure | Medium | High | Test with real 8-10MB payloads |
| Cleanup failures leaving orphaned objects | Medium | Medium | Implement 24-hour expiration policy |
| Hibernation still fails after migration | Low | Critical | Keep rollback ready, detailed monitoring |

### Medium Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| R2 bucket permissions incorrect | Low | High | Verify permissions before deployment |
| Performance regression (latency increase) | Low | Medium | Run performance tests before/after |
| Partial failure during processing | Medium | Low | Implement cleanup in error handlers |

### Low Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| R2 API changes | Very Low | High | Monitor Cloudflare API docs |
| Cost overruns | Very Low | Low | Monitor R2 usage (no surprise costs) |

---

## Success Criteria

### Functional Success

1. CSV payloads stored in R2, not DO storage
2. Image payloads stored in R2, not DO storage
3. All DO storage contains only metadata (strings, numbers, objects)
4. Alarm handler fetches from R2 correctly
5. R2 objects deleted after successful processing
6. R2 objects deleted after failure
7. 24-hour expiration policy prevents orphaned objects

### Operational Success

1. Zero hibernation failures during 24-hour test window
2. Zero "code has been updated" errors during deployments
3. Hibernation remains enabled after code updates
4. No performance degradation (P95 latency < 100ms increase)
5. 70-80% cost reduction verified in Cloudflare analytics

### Quality Success

1. All tests passing (unit, integration, hibernation, performance)
2. Code coverage: 80%+ for new R2 utilities
3. Documentation: Comprehensive implementation guide
4. Monitoring: Alerts configured for R2 failures
5. Rollback: Plan tested and ready

---

## Code Review Checklist

### Security

- [ ] No hardcoded R2 keys or secrets
- [ ] Proper input validation (file size, type)
- [ ] Error messages don't leak sensitive data
- [ ] R2 objects properly cleaned up (no data lingering)

### Performance

- [ ] Async/await properly used (no blocking)
- [ ] Retry logic doesn't cause cascading failures
- [ ] Timeout values appropriate (30s R2, 15s waitForReady)
- [ ] Cleanup doesn't block job completion

### Reliability

- [ ] Try-catch blocks around all R2 operations
- [ ] Cleanup happens even on error (finally block)
- [ ] Logging at key decision points
- [ ] Metrics tracked (R2 size, duration, errors)

### Maintainability

- [ ] Code is self-documenting (clear variable names)
- [ ] Comments explain WHY, not WHAT
- [ ] Consistent error handling patterns
- [ ] Proper JSDoc for public functions

---

## Monitoring & Observability

### Metrics to Track

**R2 Operations:**
- Bytes uploaded per job (histogram)
- Upload duration (P50, P95, P99)
- Upload failure rate
- Delete operation success rate

**Processing:**
- CSV processing duration (alarm context)
- Image processing duration (alarm context)
- Hibernation cycles (wake/sleep count)
- Cleanup success rate

**Errors:**
- R2 upload failures
- R2 download failures
- R2 delete failures
- Cleanup failures

### Alerts to Configure

- [ ] R2 upload failure rate > 1%
- [ ] CSV processing timeout (> 5 minutes)
- [ ] Image processing timeout (> 10 minutes)
- [ ] Hibernation failure (code has been updated)
- [ ] Orphaned R2 objects (not deleted after 24 hours)

---

## Migration Considerations

### Existing DOs with In-Storage Data

**Scenario:** If DOs currently have CSV_DATA/IMAGE_DATA in storage from before migration:

1. **Manual Cleanup**
   ```javascript
   // Run once after deployment
   async function cleanupLegacyStorage() {
     const jobIds = await getAllActiveJobIds(); // Custom helper
     for (const jobId of jobIds) {
       const doStub = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(jobId);
       await doStub.deleteLegacyStorage([
         'csvData',
         'imageData'
       ]);
     }
   }
   ```

2. **Gradual Cleanup**
   - Deploy migration code that detects legacy data
   - Clean up as jobs complete naturally
   - 7-day grace period, then force cleanup

3. **Feature Flag**
   ```javascript
   if (env.LEGACY_STORAGE_CLEANUP_ENABLED) {
     await this.state.storage.delete(['csvData', 'imageData']);
   }
   ```

---

## Future Improvements

1. **Streaming Upload/Download**
   - For very large payloads (> 100MB)
   - Use R2 multipart upload API
   - Reduces memory consumption

2. **Compression**
   - Compress CSV before upload
   - Reduce storage costs
   - Decompress during processing

3. **Versioning**
   - Keep historical versions in R2
   - Allow retry with previous data
   - Audit trail for debugging

4. **Parallel Processing**
   - Process multiple CSV batches in parallel
   - Use multiple R2 keys
   - Coordinate via DO storage

---

## References

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Durable Objects: https://developers.cloudflare.com/durable-objects/
- R2 (Object Storage): https://developers.cloudflare.com/r2/
- WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/api/websockets/#websocket-hibernation
- Issue #8: Root Cause Analysis (hibernation failures)
- BooksTrack Backend CLAUDE.md: Project guidelines and patterns

---

## Appendix: Code Templates

### R2 Utility Template

**File:** `src/utils/r2-hibernation.js`

```javascript
/**
 * R2 utilities for hibernation-safe payload storage
 *
 * Moves large CSV (8MB) and image (10MB) payloads from Durable Object
 * storage to R2, enabling stable WebSocket hibernation during deployments.
 *
 * DO storage limitation: Deserializes on wake-up, fails if code has changed.
 * R2 solution: Store only metadata (strings) in DO, payloads in R2.
 *
 * Related: Issue #8 (hibernation failures), Issue #11 (R2 migration)
 */

const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const R2_UPLOAD_TIMEOUT = 30000; // 30 seconds
const R2_RETRY_COUNT = 3;

/**
 * Upload payload to R2
 * @param {Object} env - Worker environment
 * @param {string} jobId - Job identifier
 * @param {string} type - Payload type ('csv' or 'image')
 * @param {string|ArrayBuffer} data - Payload data
 * @returns {Promise<{r2Key: string, size: number, etag: string}>}
 */
export async function uploadPayloadToR2(env, jobId, type, data) {
  const bucket = type === 'csv' ? env.BOOKSHELF_IMAGES : env.BOOKSHELF_IMAGES;
  const ext = type === 'csv' ? 'csv' : 'jpg';
  const timestamp = Date.now();
  const r2Key = `${type}/${jobId}/${timestamp}.${ext}`;

  // Validate size
  const { valid, error, size } = validatePayloadSize(type, data);
  if (!valid) {
    throw new Error(`Payload validation failed: ${error}`);
  }

  let lastError;
  for (let i = 0; i < R2_RETRY_COUNT; i++) {
    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT);

      const response = await bucket.put(r2Key, data, {
        signal: abortController.signal,
      });

      clearTimeout(timeout);

      return {
        r2Key,
        size,
        etag: response.etag,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[R2] Upload attempt ${i + 1}/${R2_RETRY_COUNT} failed:`, error);

      if (i < R2_RETRY_COUNT - 1) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 100));
      }
    }
  }

  throw new Error(`R2 upload failed after ${R2_RETRY_COUNT} attempts: ${lastError.message}`);
}

/**
 * Fetch payload from R2
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 * @returns {Promise<string|ArrayBuffer>} Payload data
 */
export async function fetchPayloadFromR2(env, r2Key) {
  const bucket = r2Key.startsWith('image/') ? env.BOOKSHELF_IMAGES : env.BOOKSHELF_IMAGES;

  try {
    const object = await bucket.get(r2Key);

    if (!object) {
      throw new Error(`R2 object not found: ${r2Key}`);
    }

    return await object.arrayBuffer();
  } catch (error) {
    console.error(`[R2] Fetch failed for ${r2Key}:`, error);
    throw error;
  }
}

/**
 * Delete payload from R2
 * @param {Object} env - Worker environment
 * @param {string} r2Key - R2 object key
 */
export async function deletePayloadFromR2(env, r2Key) {
  const bucket = r2Key.startsWith('image/') ? env.BOOKSHELF_IMAGES : env.BOOKSHELF_IMAGES;

  try {
    await bucket.delete(r2Key);
    console.log(`[R2] Object deleted: ${r2Key}`);
  } catch (error) {
    console.error(`[R2] Delete failed for ${r2Key}:`, error);
    throw error;
  }
}

/**
 * Validate payload size
 * @param {string} type - Payload type ('csv' or 'image')
 * @param {string|ArrayBuffer} data - Payload data
 * @returns {{valid: boolean, error?: string, size: number}}
 */
export function validatePayloadSize(type, data) {
  const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
  const maxSize = type === 'csv' ? MAX_CSV_SIZE : MAX_IMAGE_SIZE;

  if (size > maxSize) {
    return {
      valid: false,
      error: `Payload too large: ${size} bytes (max ${maxSize} bytes)`,
      size,
    };
  }

  return { valid: true, size };
}

/**
 * Generate R2 object key
 * Format: {type}/{jobId}/{timestamp}.{ext}
 * @param {string} jobId - Job identifier
 * @param {string} type - Payload type ('csv' or 'image')
 * @returns {string} R2 object key
 */
export function generateR2Key(jobId, type) {
  const ext = type === 'csv' ? 'csv' : 'jpg';
  return `${type}/${jobId}/${Date.now()}.${ext}`;
}
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude Code | Initial comprehensive implementation plan |

---

**Document Status:** Ready for Engineering Implementation
**Last Updated:** November 24, 2025
**Maintained By:** Claude Code
**Next Review:** After Phase 1 completion
