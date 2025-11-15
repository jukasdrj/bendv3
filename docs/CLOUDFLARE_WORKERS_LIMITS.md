# Cloudflare Workers - Resource Limits & Billing

**Plan:** Paid Workers Plan
**Account:** BooksTrack Production
**Last Updated:** January 14, 2025

---

## CPU Time Limits

### Paid Plan Limits

| Metric | Included | Overage Cost | Notes |
|--------|----------|--------------|-------|
| **Requests** | 10 million/month | $0.30 per additional million | Standard HTTP requests |
| **CPU Time** | 30 million CPU milliseconds/month | $0.02 per additional million CPU milliseconds | Actual compute time used |
| **Duration** | No charge or limit | N/A | Wall-clock time doesn't matter |

### Per-Invocation Limits

| Invocation Type | Default CPU Time | Maximum CPU Time |
|-----------------|------------------|-------------------|
| **HTTP Request** | 30 seconds | **5 minutes** (300 seconds) |
| **Cron Trigger** | 30 seconds | **15 minutes** (900 seconds) |
| **Queue Consumer** | 30 seconds | **15 minutes** (900 seconds) |

**Important:** These are **CPU time** limits, not wall-clock duration. Network I/O, waiting for external APIs, and idle time **do not count** toward CPU time.

---

## What Counts as CPU Time?

### ✅ Counts Toward CPU Time
- **Code execution** (JavaScript/TypeScript processing)
- **JSON parsing** (`JSON.parse()`, `JSON.stringify()`)
- **Data transformation** (loops, array operations, object manipulation)
- **Cryptographic operations** (hashing, encryption)
- **Regex operations** (complex pattern matching)
- **Image/data processing** (resize, compress, transform)

### ❌ Does NOT Count Toward CPU Time
- **Network I/O** (fetch to external APIs)
- **Waiting for promises** (awaiting HTTP responses)
- **Durable Object storage reads/writes** (I/O operation)
- **KV namespace operations** (I/O operation)
- **R2 bucket operations** (I/O operation)
- **`ctx.waitUntil()` background tasks** (runs after response sent)

---

## BooksTrack API - CPU Time Considerations

### High CPU Operations (Monitor Usage)

1. **AI Processing**
   - Gemini API calls: 0-5ms CPU (mostly I/O wait)
   - Response parsing: 10-50ms CPU for large JSON payloads
   - **Recommendation:** Use Durable Object alarms for batch operations

2. **CSV Import**
   - File parsing: 100-500ms CPU for 10MB CSV
   - Gemini processing: 5-20s wall-clock (0.5-2s CPU)
   - **Status:** ✅ Uses alarm-based architecture (no CPU limit issues)

3. **Batch Enrichment**
   - 100 books: 50-200ms CPU (mostly parallel fetches)
   - 1000 books: 500ms-2s CPU
   - **Recommendation:** Chunk large batches (100 books per Worker invocation)

4. **Image Proxy & Resizing**
   - Image fetch: I/O (no CPU)
   - Image resize/compress: 50-300ms CPU per image
   - **Recommendation:** Cache aggressively in R2

---

## Architecture Patterns for CPU Efficiency

### ✅ Best Practices

#### 1. **Use Durable Object Alarms for Long Operations**
```javascript
// ❌ BAD - Long operation in Worker context
ctx.waitUntil(processLargeCSV(data)) // May timeout if >5min CPU

// ✅ GOOD - Offload to Durable Object alarm
await doStub.scheduleProcessing(data) // Alarm runs independently
```

**Why:**
- Durable Object alarms run in separate execution context
- No Worker CPU time limit applies to alarms
- Better resilience (auto-retry on failure)

#### 2. **Prefer I/O Over CPU-Intensive Operations**
```javascript
// ❌ BAD - CPU-intensive data transformation
const enrichedBooks = books.map(book => {
  return {
    ...book,
    // Complex CPU operations
    normalizedTitle: normalizeTitle(book.title),
    cleanedAuthor: cleanAuthor(book.author),
    // ...more transformations
  }
})

// ✅ GOOD - Offload to external service or cache results
const cached = await env.KV.get(`enriched:${bookId}`, 'json')
if (cached) return cached

const enriched = await externalEnrichmentAPI.process(book) // I/O, not CPU
await env.KV.put(`enriched:${bookId}`, JSON.stringify(enriched))
```

#### 3. **Batch Operations Intelligently**
```javascript
// ❌ BAD - Process everything in one Worker invocation
const results = await Promise.all(
  allBooks.map(book => enrichBook(book)) // May exceed 5min CPU for 10k books
)

// ✅ GOOD - Chunk into manageable batches
const BATCH_SIZE = 100
for (let i = 0; i < allBooks.length; i += BATCH_SIZE) {
  const batch = allBooks.slice(i, i + BATCH_SIZE)
  await env.QUEUE.send({ batch, offset: i }) // Queue Consumer handles each batch
}
```

#### 4. **Use `ctx.waitUntil()` for Non-Critical Background Work**
```javascript
// ✅ GOOD - Analytics don't block response
ctx.waitUntil(
  env.ANALYTICS.writeDataPoint({
    blobs: [endpoint, statusCode],
    doubles: [latency]
  })
)

// Return response immediately (user doesn't wait for analytics)
return Response.json({ success: true })
```

**Caveat:** `ctx.waitUntil()` tasks must complete within Worker's CPU limit. For >5min CPU operations, use Durable Object alarms instead.

---

## Monitoring CPU Usage

### Cloudflare Dashboard Metrics
1. **Navigate to:** Workers & Pages → api-worker → Metrics
2. **Key Metrics:**
   - CPU Time (milliseconds) - Total CPU consumed
   - Requests - Total invocations
   - **CPU Time per Request** = Total CPU Time / Total Requests

### Target Efficiency
| Endpoint | Target CPU Time | Current Average | Status |
|----------|----------------|-----------------|--------|
| `/v1/search/isbn` | <50ms | 35ms | ✅ Good |
| `/v1/search/title` | <100ms | 78ms | ✅ Good |
| `/api/enrichment/batch` (100 books) | <500ms | 420ms | ✅ Good |
| `/api/import/csv-gemini` | N/A (alarm-based) | N/A | ✅ N/A |
| `/api/scan-bookshelf` | <200ms | 150ms | ✅ Good |

---

## Cost Estimation

### Monthly Usage (Production)

**Assumptions:**
- 500k requests/month
- Average 50ms CPU per request
- 30M CPU milliseconds included

**Calculation:**
```
Total CPU time = 500k requests × 50ms = 25,000,000ms (25M ms)
Included = 30M ms
Overage = 0ms
Cost = $0 (within free tier)
```

**Worst Case (1M requests, 100ms average):**
```
Total CPU time = 1M requests × 100ms = 100,000,000ms (100M ms)
Included = 30M ms
Overage = 70M ms
Overage cost = 70M ms ÷ 1M × $0.02 = $1.40/month
```

---

## When to Use Durable Object Alarms vs. ctx.waitUntil()

| Scenario | Use Durable Object Alarm | Use ctx.waitUntil() |
|----------|-------------------------|---------------------|
| **Operation takes >30s CPU time** | ✅ Yes | ❌ No (will timeout) |
| **Operation is critical** | ✅ Yes (guaranteed execution) | ❌ No (best-effort) |
| **Need retry on failure** | ✅ Yes (built-in retry) | ❌ No (one-shot) |
| **Non-critical analytics** | ❌ No (overkill) | ✅ Yes (perfect fit) |
| **Quick cache updates (<1s CPU)** | ❌ No (unnecessary complexity) | ✅ Yes (ideal) |
| **Large batch processing** | ✅ Yes (Queue Consumer) | ❌ No (CPU limit risk) |

---

## BooksTrack API - Current Architecture Status

### ✅ Alarm-Based (Correct)
- **CSV Import** (`/api/import/csv-gemini`)
  - Uses `JobStateManagerDO.alarm()` for Gemini processing
  - No risk of timeout (processes in alarm context)

### ⚠️ ctx.waitUntil() (Needs Review)
- **Bookshelf Scanner** (`/api/scan-bookshelf`)
  - Currently uses `ctx.waitUntil(aiScanner.processBookshelfScan(...))`
  - Risk: AI processing can take 20-60s, may timeout with default 30s limit
  - **Recommendation:** Migrate to alarm-based architecture like CSV import

- **Unified Cache Refresh** (`src/services/unified-cache.js`)
  - Uses `ctx.waitUntil()` for stale-while-revalidate pattern
  - Status: ✅ OK (cache refresh is <1s CPU)

---

## Recommendations

### Immediate Actions
1. ✅ **Update `wrangler.toml`** - Set explicit CPU time limits:
   ```toml
   [limits]
   cpu_ms = 300000  # 5 minutes for HTTP requests
   ```

2. ⚠️ **Migrate Bookshelf Scanner** - Use Durable Object alarm instead of `ctx.waitUntil()`

3. ✅ **Monitor CPU Usage** - Set up Cloudflare Analytics alerts for CPU >80% of included quota

### Long-Term Optimizations
1. **Cache Aggressively** - Reduce CPU by serving cached results
2. **Optimize JSON Parsing** - Use streaming parsers for large payloads
3. **Batch Queue Consumers** - Process multiple items per invocation (amortize overhead)

---

**References:**
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

**Last Updated:** January 14, 2025
