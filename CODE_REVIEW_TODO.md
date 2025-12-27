# Code Review - Remaining Action Items

**Review Date:** December 26, 2025
**Completed:** Router split into modular route files (ed9c0d8)

---

## High-Impact (Tackle First)

### 1. Request Deduplication
**File:** `src/services/book-service.ts`
**Impact:** Prevents thundering herd problem
**Effort:** Low

Multiple concurrent requests for the same ISBN all trigger external API calls. Add in-memory deduplication:

```typescript
// src/services/request-deduplication.ts
const inflightRequests = new Map<string, Promise<any>>()

export async function deduplicate<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 5000
): Promise<T> {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key)!
  }

  const promise = fn().finally(() => {
    setTimeout(() => inflightRequests.delete(key), ttlMs)
  })

  inflightRequests.set(key, promise)
  return promise
}

// Usage in book-service.ts
export async function findBookByISBN(isbn: string, env: any, ctx?: ExecutionContext) {
  return deduplicate(`isbn:${isbn}`, async () => {
    const cachedBook = await bookRepo.findByISBN(isbn)
    if (cachedBook) return cachedBook
    return await enrichMultipleBooks({ isbn }, env, ...)
  })
}
```

---

### 2. Parallelize Cover Processing
**File:** `src/services/book-service.ts` (lines 289-350)
**Impact:** 10x faster batch operations
**Effort:** Low

Currently processes cover batches sequentially. Use concurrent processing:

```typescript
// Option A: Use p-limit (npm install p-limit)
import pLimit from 'p-limit'

const limit = pLimit(10)  // Max 10 concurrent requests

const coverResults = await Promise.allSettled(
  coverProcessingTasks.map(task =>
    limit(() => processBookCover({
      work_key: task.workKey,
      provider_url: task.providerCoverURL,
      isbn: task.isbn
    }, env))
  )
)

// Option B: Manual semaphore (no dependencies)
// See full implementation in review notes
```

---

### 3. Streaming for Large Batch Responses
**File:** `src/api-v3/index.ts` (lines 530-545)
**Impact:** Prevents OOM for large batches
**Effort:** Medium

For batches >50 ISBNs, use TransformStream instead of buffering all results:

```typescript
// For large batches, stream results as NDJSON
const { readable, writable } = new TransformStream()
const writer = writable.getWriter()
const encoder = new TextEncoder()

c.executionCtx.waitUntil((async () => {
  for (const result of results) {
    await writer.write(encoder.encode(JSON.stringify(result) + '\n'))
  }
  await writer.close()
})())

return new Response(readable, {
  headers: {
    'Content-Type': 'application/x-ndjson',
    'Transfer-Encoding': 'chunked'
  }
})
```

---

### 4. Service Layer Dependency Injection
**Files:** Multiple service files
**Impact:** Better testability
**Effort:** High

Services directly import each other, making testing difficult. Consider a service container pattern for cleaner dependency management.

---

## Medium-Impact (Next Sprint)

### 5. TypeScript Migration (Mixed .js/.ts)
**Files:** Multiple
**Impact:** Type safety, IDE support
**Effort:** High

Priority migration order:
1. `src/index.js` → `src/index.ts`
2. `src/middleware/cors.js` → `src/middleware/cors.ts`
3. `src/middleware/rate-limiter.js` → `src/middleware/rate-limiter.ts`
4. All files in `src/services/` with `.js` extension
5. All Durable Objects in `src/durable-objects/*.js`

---

### 6. Consolidate Utils (30+ files)
**Directory:** `src/utils/`
**Impact:** Reduced cognitive load
**Effort:** Medium

Reorganize into domain-focused modules:

```
src/utils/
├── index.ts              # Re-export everything
├── api/
│   ├── response.ts       # response-builder, error-status
│   └── validation.ts     # isbn-validation, json-validator
├── analytics/
│   ├── logger.ts
│   └── queries.ts
├── data/
│   ├── normalization.ts  # normalization, string-similarity
│   ├── quality.ts        # quality-scoring, confidence
│   └── transforms.ts     # book-mappers
└── infrastructure/
    ├── cache.ts          # cache-keys
    ├── storage.ts        # r2-utils
    └── retry.ts
```

---

### 7. Circuit Breaker State Consistency
**File:** `src/services/circuit-breaker.ts` (lines 110-128)
**Impact:** Prevents stale circuit state across Workers
**Effort:** Low

Always persist failure counts immediately (not just OPEN/CLOSED transitions):

```typescript
const isCritical =
  state.state === 'OPEN' ||
  state.state === 'CLOSED' ||
  (state.failureCount > 0 && state.failureCount !== this.lastPersistedFailureCount)
```

---

### 8. Edge Caching for Static Routes
**Files:** Various routes
**Impact:** Lower origin load
**Effort:** Low

Add Cache-Control headers to static endpoints:

```typescript
// /v3/capabilities - cache for 5 minutes
c.header('Cache-Control', 'public, max-age=300, s-maxage=300')

// /v3/openapi.json - already has 1h cache ✅
// /health - already has 1m cache ✅ (added in this PR)
```

---

## Low-Impact (Technical Debt)

### 9. Standardize Error Responses to RFC 9457
**Files:** `src/router.ts`, various handlers
**Impact:** API consistency
**Effort:** Medium

Mixed error formats exist. Standardize all to RFC 9457 Problem Details format.

---

### 10. Document API Versioning Strategy
**File:** `CLAUDE.md` or `docs/`
**Impact:** Future migration clarity
**Effort:** Low

Add documented strategy for V3 → V4 migration when needed (sunset warnings, grace periods, etc).

---

## Summary Table

| Issue | Impact | Effort | Files |
|-------|--------|--------|-------|
| Request deduplication | High | Low | book-service.ts |
| Parallelize covers | High | Low | book-service.ts |
| Stream large batches | High | Medium | api-v3/index.ts |
| Dependency injection | High | High | Multiple services |
| TypeScript migration | Medium | High | *.js files |
| Consolidate utils | Medium | Medium | src/utils/ |
| Circuit breaker state | Medium | Low | circuit-breaker.ts |
| Edge caching | Medium | Low | Various routes |
| RFC 9457 errors | Low | Medium | Error handlers |
| Versioning docs | Low | Low | Documentation |

---

**Completed in this session:**
- ✅ Split router.ts into modular route files (818 → 217 lines)
- ✅ Added missing DO bindings to Env type
- ✅ Fixed undeclared variable bugs
- ✅ Added Cache-Control to health endpoint
- ✅ Cleaned up deprecated V1/V2 comments
