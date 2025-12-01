# TODO: bendv3 - CSV Import SSE Refactor + Alexandria Cover Integration

**Sprint Goal:** Fix CSV import SSE streaming + integrate Alexandria cover processing  
**Owner:** Justin (User)  
**Time Estimate:** 4-5 hours  
**Status:** 🔴 Not Started  
**Priority:** P0 - BLOCKING iOS validation

---

## 🎯 Objectives

### Part A: CSV Import SSE Refactor (2-3 hours)
Fix SSE streaming to use push-based updates instead of polling, enabling real-time progress updates for iOS app.

### Part B: Alexandria Cover Integration (2 hours)
Integrate Alexandria cover processing endpoints into book-service.ts so all cover images are served from Alexandria CDN.

---

## 📋 Current State

### CSV Import SSE
- ✅ SSE endpoint exists at `/api/v2/imports/{jobId}/stream`
- ⚠️ Uses 2-second polling (not ideal)
- ⚠️ JobStateManagerDO exists but not publishing updates
- ❌ No push-based SSE updates
- **Impact:** iOS app can't get real-time CSV import progress

### Alexandria Cover Integration
- ✅ Alexandria cover endpoints ready (after alex TODO complete)
- ✅ `TODO-ALEXANDRIA-COVER-INTEGRATION.md` documented
- ⚠️ book-service.ts still using provider URLs directly
- ❌ Not calling Alexandria for cover processing
- **Impact:** Covers not optimized, external dependencies

---

## 🚀 PART A: CSV Import SSE Refactor

### Task A1: Add SSE Broadcast to JobStateManagerDO (45 minutes)

**Goal:** Make JobStateManagerDO push updates to SSE clients

**File:** `/Users/juju/dev_repos/bendv3/src/durable-objects/JobStateManagerDO.js`

**Implementation:**

1. Add SSE client tracking to storage:
```javascript
// In JobStateManagerDO class
async initializeJobState(jobId, pipeline, totalCount) {
  await this.state.storage.put(`job:${jobId}`, {
    jobId,
    pipeline,
    status: 'initialized',
    progress: 0,
    processedCount: 0,
    totalCount,
    startTime: Date.now(),
  });
  
  // Initialize SSE client list
  await this.state.storage.put(`sse-clients:${jobId}`, []);
}
```

2. Add SSE client registration method:
```javascript
async registerSSEClient(jobId, clientId) {
  const clients = await this.state.storage.get(`sse-clients:${jobId}`) || [];
  if (!clients.includes(clientId)) {
    clients.push(clientId);
    await this.state.storage.put(`sse-clients:${jobId}`, clients);
  }
  console.log(`[JobStateManager] Registered SSE client ${clientId} for job ${jobId}`);
}

async unregisterSSEClient(jobId, clientId) {
  const clients = await this.state.storage.get(`sse-clients:${jobId}`) || [];
  const filtered = clients.filter(id => id !== clientId);
  await this.state.storage.put(`sse-clients:${jobId}`, filtered);
  console.log(`[JobStateManager] Unregistered SSE client ${clientId} for job ${jobId}`);
}
```

3. Add broadcast method:
```javascript
async broadcastUpdate(jobId, eventType, data) {
  const clients = await this.state.storage.get(`sse-clients:${jobId}`) || [];
  
  if (clients.length === 0) {
    console.log(`[JobStateManager] No SSE clients for job ${jobId}, skipping broadcast`);
    return;
  }
  
  // Store the update in DO storage for polling clients
  const updates = await this.state.storage.get(`updates:${jobId}`) || [];
  updates.push({
    timestamp: Date.now(),
    eventType,
    data,
  });
  
  // Keep only last 100 updates
  if (updates.length > 100) {
    updates.shift();
  }
  
  await this.state.storage.put(`updates:${jobId}`, updates);
  
  console.log(`[JobStateManager] Broadcast ${eventType} to ${clients.length} clients for job ${jobId}`);
}
```

4. Update `updateProgress` to broadcast:
```javascript
async updateProgress(jobId, progress, processedCount) {
  const job = await this.state.storage.get(`job:${jobId}`);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  job.progress = progress;
  job.processedCount = processedCount;
  job.lastUpdateTime = Date.now();
  
  await this.state.storage.put(`job:${jobId}`, job);
  
  // Broadcast to SSE clients
  await this.broadcastUpdate(jobId, 'progress', {
    jobId,
    status: job.status,
    progress: job.progress,
    processedCount: job.processedCount,
    totalCount: job.totalCount,
  });
}
```

5. Update `completeJob` to broadcast:
```javascript
async completeJob(jobId) {
  const job = await this.state.storage.get(`job:${jobId}`);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  job.status = 'completed';
  job.progress = 100;
  job.completedTime = Date.now();
  
  await this.state.storage.put(`job:${jobId}`, job);
  
  // Broadcast completion
  await this.broadcastUpdate(jobId, 'completed', {
    jobId,
    status: 'completed',
    progress: 100,
    processedCount: job.processedCount,
    totalCount: job.totalCount,
    completedAt: new Date(job.completedTime).toISOString(),
  });
}
```

**Acceptance Criteria:**
- [ ] SSE client tracking implemented in storage
- [ ] Registration/unregistration methods working
- [ ] Broadcast method stores updates for retrieval
- [ ] `updateProgress` broadcasts to clients
- [ ] `completeJob` broadcasts to clients
- [ ] Logs show broadcast events

---

### Task A2: Update SSE Handler to Use Broadcasts (30 minutes)

**Goal:** Modify SSE handler to register with DO and consume broadcasts

**File:** `/Users/juju/dev_repos/bendv3/src/handlers/v2/sse-stream.ts`

**Changes:**

1. Register client on connection:
```typescript
// In handleSSEStream(), after getting doStub
const clientId = crypto.randomUUID();
await doStub.registerSSEClient(jobId, clientId);

// On stream close, unregister
const cleanup = async () => {
  try {
    await doStub.unregisterSSEClient(jobId, clientId);
  } catch (error) {
    console.error('[SSE] Cleanup error:', error);
  }
};
```

2. Replace polling loop with update checking:
```typescript
// Instead of polling every 2 seconds, check for new updates every 500ms
let lastUpdateIndex = 0;

while (state && state.status !== 'completed' && state.status !== 'failed' && state.status !== 'canceled') {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check for new updates from DO
  const updates = await doStub.getUpdates(jobId, lastUpdateIndex);
  
  if (updates && updates.length > 0) {
    for (const update of updates) {
      await writeEvent({
        id: `${update.timestamp}-${update.eventType}`,
        event: update.eventType,
        data: JSON.stringify(update.data),
      });
      
      lastUpdateIndex++;
    }
  }
  
  // Update state
  state = await doStub.getJobState();
  
  // Send heartbeat every 30 seconds
  if (Date.now() - lastHeartbeat > 30000) {
    await writer.write(encoder.encode(': heartbeat\n\n'));
    lastHeartbeat = Date.now();
  }
}
```

3. Add error handling for disconnects:
```typescript
try {
  // ... existing stream logic
} catch (error) {
  console.error('[SSE Stream] Error:', error);
  await writeEvent({
    event: 'error',
    data: JSON.stringify({
      error: 'stream_error',
      message: error.message,
    }),
  });
} finally {
  await cleanup();
  await writer.close();
}
```

**Acceptance Criteria:**
- [ ] Client registers with DO on connect
- [ ] Client unregisters on disconnect
- [ ] Updates fetched every 500ms (not 2s polling)
- [ ] Heartbeats sent every 30s
- [ ] Cleanup happens on error/disconnect
- [ ] No memory leaks (clients properly unregistered)

---

### Task A3: Add getUpdates RPC Method (15 minutes)

**Goal:** Add method to JobStateManagerDO to retrieve updates

**File:** `/Users/juju/dev_repos/bendv3/src/durable-objects/JobStateManagerDO.js`

**Implementation:**

```javascript
async getUpdates(jobId, fromIndex = 0) {
  const updates = await this.state.storage.get(`updates:${jobId}`) || [];
  
  // Return updates starting from fromIndex
  return updates.slice(fromIndex);
}
```

**Acceptance Criteria:**
- [ ] Method returns updates array
- [ ] Filters by fromIndex
- [ ] Returns empty array if no updates
- [ ] Works with SSE handler

---

### Task A4: Test CSV Import SSE (20 minutes)

**Goal:** Verify real-time progress updates work

**Test Steps:**

1. Deploy changes:
```bash
cd /Users/juju/dev_repos/bendv3
npx wrangler deploy
```

2. Start SSE client with curl:
```bash
curl -N https://api.oooefam.net/api/v2/imports/{jobId}/stream \
  -H "Accept: text/event-stream"
```

3. In another terminal, trigger CSV import:
```bash
curl -X POST https://api.oooefam.net/api/import/csv-gemini \
  -F "file=@testImages/goodreads_library_export.csv"
```

4. Verify SSE output shows:
   - Initial status event
   - Progress events with increasing percentages
   - Final completion event
   - No 5-second delays between updates

5. Check Wrangler logs:
```bash
npx wrangler tail --format pretty

# Look for:
# [JobStateManager] Broadcast progress to N clients
# [SSE] Registered client abc-123
# [SSE] Unregistered client abc-123
```

**Acceptance Criteria:**
- [ ] SSE events arrive in <1 second
- [ ] Progress updates show incremental changes
- [ ] Completion event arrives promptly
- [ ] No polling delays
- [ ] Cleanup happens properly

---

## 🚀 PART B: Alexandria Cover Integration

### Task B1: Create Alexandria Cover Service (30 minutes)

**Goal:** Create service module for Alexandria cover integration

**File:** `/Users/juju/dev_repos/bendv3/src/services/alexandria-cover-service.ts`

**Implementation:**

```typescript
/**
 * Alexandria Cover Service - Integration layer for cover image processing
 * 
 * Handles worker-to-worker calls to Alexandria for cover processing
 */

const ALEXANDRIA_BASE_URL = 'https://alexandria.ooheynerds.com';

interface CoverProcessingRequest {
  work_key: string;
  provider_url: string;
  isbn?: string;
}

interface CoverProcessingResponse {
  success: boolean;
  urls: {
    large: string;
    medium: string;
    small: string;
  };
  metadata?: {
    processedAt: string;
    originalSize: number;
    r2Key: string;
    sourceUrl: string;
    workKey: string;
  };
  error?: string;
}

/**
 * Send cover URL to Alexandria for processing
 */
export async function processBookCover(
  request: CoverProcessingRequest,
  env: any
): Promise<CoverProcessingResponse> {
  try {
    console.log(`[AlexandriaCover] Processing cover for ${request.work_key}`);

    const cfAccessToken = env.CF_ACCESS_SERVICE_TOKEN;

    if (!cfAccessToken) {
      console.error('[AlexandriaCover] Missing CF_ACCESS_SERVICE_TOKEN');
      throw new Error('Authentication configuration missing');
    }

    // Add timeout controller (5 second timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${ALEXANDRIA_BASE_URL}/api/covers/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': cfAccessToken.split(':')[0],
          'CF-Access-Client-Secret': cfAccessToken.split(':')[1],
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        console.error(`[AlexandriaCover] Processing failed: ${response.status}`, data);
        throw new Error(data.error || 'Cover processing failed');
      }

      console.log(`[AlexandriaCover] ✅ Cover processed successfully for ${request.work_key}`);

      return data;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Alexandria timeout (>5s)');
      }
      
      throw error;
    }

  } catch (error) {
    console.error('[AlexandriaCover] Error:', error);

    const PLACEHOLDER_COVER = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover';

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      urls: {
        large: PLACEHOLDER_COVER,
        medium: PLACEHOLDER_COVER,
        small: PLACEHOLDER_COVER,
      },
    };
  }
}
```

**Acceptance Criteria:**
- [ ] File created with processBookCover function
- [ ] Worker-to-worker auth headers included
- [ ] 5-second timeout implemented
- [ ] Error handling returns placeholder
- [ ] TypeScript types defined

---

### Task B2: Update book-service.ts to Use Alexandria (45 minutes)

**Goal:** Integrate Alexandria cover processing into book enrichment flow

**File:** `/Users/juju/dev_repos/bendv3/src/services/book-service.ts`

**Changes:**

1. Add import:
```typescript
import { processBookCover } from './alexandria-cover-service';
```

2. Modify `findBookByISBN` cover URL logic (around line 95):

**OLD CODE:**
```typescript
coverSmallUrl: work.coverImageURL || edition?.coverImageURL || null,
coverMediumUrl: work.coverImageURL || edition?.coverImageURL || null,
coverLargeUrl: work.coverImageURL || edition?.coverImageURL || null,
```

**NEW CODE:**
```typescript
// Process cover via Alexandria
let coverURLs = {
  small: work.coverImageURL || edition?.coverImageURL || null,
  medium: work.coverImageURL || edition?.coverImageURL || null,
  large: work.coverImageURL || edition?.coverImageURL || null,
};

// If we have a work key and provider cover URL, process via Alexandria
if (work.workKey && (work.coverImageURL || edition?.coverImageURL)) {
  try {
    const providerCoverURL = work.coverImageURL || edition?.coverImageURL;
    
    const alexandriaResult = await processBookCover({
      work_key: work.workKey,
      provider_url: providerCoverURL,
      isbn: isbn,
    }, env);

    if (alexandriaResult.success) {
      coverURLs = {
        small: alexandriaResult.urls.small,
        medium: alexandriaResult.urls.medium,
        large: alexandriaResult.urls.large,
      };
      console.log(`[BookService] ✅ Cover processed via Alexandria for ${isbn}`);
    } else {
      console.warn(`[BookService] ⚠️ Alexandria cover processing failed, using provider URL`);
    }
  } catch (error) {
    console.error(`[BookService] Error processing cover via Alexandria:`, error);
    // Fall back to provider URLs
  }
}

// Use processed cover URLs in BookRecord
coverSmallUrl: coverURLs.small,
coverMediumUrl: coverURLs.medium,
coverLargeUrl: coverURLs.large,
```

3. Apply same logic to `batchEnrichBooks` (around line 261)

**Acceptance Criteria:**
- [ ] Alexandria cover service imported
- [ ] Cover processing logic added to findBookByISBN
- [ ] Cover processing logic added to batchEnrichBooks
- [ ] Graceful fallback to provider URLs on error
- [ ] Logs show Alexandria calls

---

### Task B3: Configure Worker Secret (5 minutes)

**Goal:** Add CF-Access service token to Worker secrets

**Steps:**

```bash
cd /Users/juju/dev_repos/bendv3

# Add to wrangler.jsonc secrets_store_secrets array:
{
  "binding": "CF_ACCESS_SERVICE_TOKEN",
  "store_id": "b0562ac16fde468c8af12717a6c88400",
  "secret_name": "CF_ACCESS_ALEXANDRIA_SERVICE_TOKEN"
}

# Or set as regular secret:
echo "7fbfd3c70cafed...access:SECRET_VALUE" | npx wrangler secret put CF_ACCESS_SERVICE_TOKEN
```

**Acceptance Criteria:**
- [ ] Secret added to wrangler.jsonc OR set via CLI
- [ ] Secret accessible in worker (verify via /health endpoint)

---

### Task B4: Deploy and Test (20 minutes)

**Goal:** Verify Alexandria cover integration works end-to-end

**Test Steps:**

1. Deploy:
```bash
npx wrangler deploy
```

2. Test ISBN lookup:
```bash
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439064873"

# Expected response should include Alexandria CDN URLs:
# "coverLargeUrl": "https://alexandria.ooheynerds.com/covers/OL45804W/large.webp"
```

3. Verify covers are served:
```bash
curl -I https://alexandria.ooheynerds.com/covers/OL45804W/large.webp

# Expected: 200 OK with image/webp
```

4. Check logs:
```bash
npx wrangler tail --format pretty

# Look for:
# [AlexandriaCover] Processing cover for /works/OL45804W
# [AlexandriaCover] ✅ Cover processed successfully
# [BookService] ✅ Cover processed via Alexandria
```

**Acceptance Criteria:**
- [ ] ISBN lookups return Alexandria cover URLs
- [ ] Covers are accessible at Alexandria CDN
- [ ] Logs show successful Alexandria calls
- [ ] Fallback works if Alexandria unavailable
- [ ] No increase in error rate

---

## 🎯 Definition of Done

**Part A (SSE Refactor):**
- [ ] All A1-A4 tasks completed
- [ ] SSE uses push-based updates (not polling)
- [ ] Response time < 1 second for updates
- [ ] iOS app can connect and receive real-time progress
- [ ] No memory leaks (client cleanup working)

**Part B (Alexandria Covers):**
- [ ] All B1-B4 tasks completed
- [ ] book-service.ts calls Alexandria for covers
- [ ] Cover URLs point to Alexandria CDN
- [ ] Worker secret configured for auth
- [ ] Graceful fallback on errors

**Overall:**
- [ ] Both parts deployed to production
- [ ] All tests passing
- [ ] iOS app validation unblocked
- [ ] Cache purge validation possible

---

## 📊 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| SSE update latency | < 1s | Time between progress change and SSE event |
| Cover processing latency | < 500ms | Alexandria API response time |
| Cover serving latency | < 100ms | CDN response time |
| ISBN lookup latency | < 200ms | Including Alexandria cover call |
| Success rate | > 95% | Count successful vs failed operations |

---

## 🚨 Rollback Plan

**If SSE breaks:**
1. Revert SSE handler changes
2. Redeploy
3. Falls back to polling

**If Alexandria covers break:**
1. Comment out Alexandria cover service imports
2. Revert to provider URLs
3. Redeploy

---

## 📚 Reference Documentation

- `/Users/juju/dev_repos/bendv3/TODO-ALEXANDRIA-COVER-INTEGRATION.md` (detailed plan)
- `/Users/juju/dev_repos/bendv3/CLAUDE_CODE.md` (project context)
- `/Users/juju/dev_repos/bendv3/src/handlers/v2/sse-stream.ts` (current SSE impl)
- `/Users/juju/dev_repos/alex/TODO-AGENT-COVER-IMPLEMENTATION.md` (alex side)

---

**Created:** November 30, 2025  
**Owner:** Justin (User)  
**Status:** Ready to Execute 🚀
