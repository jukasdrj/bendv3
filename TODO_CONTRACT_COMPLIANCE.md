# bendv3 Contract Compliance TODOs

**Created:** November 29, 2025  
**Context:** API Contract v3.2 violations discovered during testing  
**Related:** `/docs/CONTRACT_VIOLATIONS_2025-11-29.md`, `/docs/API_CONTRACT.md`  
**Goal:** Achieve 100% compliance with documented API contract

---

## Priority Legend

- **P0 (CRITICAL):** Blocking iOS integration - must fix before any testing
- **P1 (HIGH):** Required for production readiness
- **P2 (MEDIUM):** Should fix but not blocking
- **P3 (LOW):** Nice to have, future improvement

---

## P0: Add Success Discriminator to ALL Responses

**Impact:** iOS clients cannot parse responses without this field  
**Violation:** #1, #2 from contract violations report  
**Contract Reference:** Section 3.1, 3.2

### Files to Update

**Likely location:** `src/utils/response-envelope.ts` or similar helper

**Pattern to find all response locations:**
```bash
# Search for return statements with data/metadata
rg "return.*data:.*metadata:" --type ts -A 2 -B 2
```

### Required Changes

**Success Response Pattern:**
```typescript
// BEFORE
return {
  data: results,
  metadata: { timestamp, source, cached }
}

// AFTER
return {
  success: true,  // ← ADD THIS
  data: results,
  metadata: { timestamp, source, cached }
}
```

**Error Response Pattern:**
```typescript
// BEFORE
return {
  data: null,
  metadata: { timestamp },
  error: { code, message, details }
}

// AFTER
return {
  success: false,  // ← ADD THIS
  error: { code, message, details, retryable }
  // Note: Remove data/metadata from error responses per contract
}
```

### Suggested Implementation

Create helper functions:
```typescript
// src/utils/response-envelope.ts

export function successResponse<T>(
  data: T,
  metadata: ResponseMetadata
): SuccessResponse<T> {
  return {
    success: true,
    data,
    metadata
  };
}

export function errorResponse(
  error: ErrorObject
): ErrorResponse {
  return {
    success: false,
    error
  };
}
```

### Testing

```bash
# Test success response
curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873" | jq '.success'
# Expected: true

# Test error response  
curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"invalid"}' | jq '.success'
# Expected: false
```

### Files Likely Needing Updates

- `src/handlers/search.ts` - All search endpoints
- `src/handlers/enrichment.ts` - Enrichment endpoints
- `src/handlers/batch.ts` - Batch operations
- `src/handlers/scan.ts` - Photo scan
- `src/middleware/error-handler.ts` - Error responses

---

## P0: Fix Parameter Name Mismatch (barcode vs isbn)

**Impact:** Contract and code disagree on fundamental parameter  
**Violation:** #4 from contract violations report  
**Contract Reference:** Section 6.1

### Contract Promise

Section 6.1 shows:
```json
{
  "barcode": "9780439708180",
  "vectorize": true
}
```

### Current Implementation

Code expects:
```json
{
  "isbn": "9780439708180",
  "vectorize": false
}
```

### Decision Required

**Option A (RECOMMENDED):** Change code to accept `"barcode"`
- Matches contract documentation
- Matches iOS client expectations (likely)
- Parameter name more semantic (covers ISBN-10, ISBN-13, UPC, EAN)

**Option B:** Update contract to document `"isbn"`
- Matches current implementation
- Breaking change for any clients using "barcode"
- Less flexible naming

### Implementation (Option A)

**File:** `src/handlers/enrichment.ts` or `src/routes/v2/books.ts`

**Find:**
```typescript
const { isbn, vectorize } = await req.json();
```

**Replace with:**
```typescript
const { barcode, vectorize } = await req.json();
const isbn = barcode; // Normalize to isbn internally
```

**Or accept both:**
```typescript
const body = await req.json();
const isbn = body.barcode || body.isbn; // Accept both, prefer barcode
const vectorize = body.vectorize ?? false;

if (!isbn) {
  return errorResponse({
    code: "INVALID_REQUEST",
    message: "Missing required field: barcode",
    retryable: false,
    details: { field: "barcode" }
  });
}
```

### Testing

```bash
# Test with "barcode" parameter
curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"9780439064873","vectorize":false}' | jq '.success'
# Expected: true (should work now)

# Test backward compatibility with "isbn"
curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"isbn":"9780439064873","vectorize":false}' | jq '.success'
# Expected: true (should still work)
```

---

## P1: Add error.retryable Field

**Impact:** iOS doesn't know retry logic for failed requests  
**Violation:** #3 from contract violations report  
**Contract Reference:** Section 3.2

### Current Error Structure

```typescript
{
  code: "INVALID_REQUEST",
  message: "Invalid ISBN",
  details: { field: "isbn" }
}
```

### Required Error Structure

```typescript
{
  code: "INVALID_REQUEST",
  message: "Invalid ISBN",
  retryable: false,  // ← ADD THIS
  details: { field: "isbn" }
}
```

### Retryable Decision Matrix

| Error Code | Retryable | Reason |
|------------|-----------|--------|
| `INVALID_REQUEST` | `false` | Client error, won't succeed on retry |
| `NOT_FOUND` | `false` | Resource doesn't exist |
| `RATE_LIMIT_EXCEEDED` | `true` | Temporary, will succeed after cooldown |
| `CIRCUIT_OPEN` | `true` | Provider down, may recover |
| `API_ERROR` | Depends | Check if transient |
| `NETWORK_ERROR` | `true` | Timeout/connection issue |
| `INTERNAL_ERROR` | `true` | May be transient |

### Implementation

**File:** Error creation locations (search for error objects)

```typescript
// Pattern to find
rg "code:.*message:" --type ts

// Update each error creation
{
  code: "INVALID_REQUEST",
  message: "Invalid or missing ISBN",
  retryable: false,  // ← Add based on error type
  details: { field: "isbn" }
}
```

### Suggested Helper

```typescript
// src/utils/errors.ts

export function createError(
  code: ErrorCode,
  message: string,
  details?: object
): ErrorObject {
  const retryableErrors = new Set([
    "RATE_LIMIT_EXCEEDED",
    "CIRCUIT_OPEN", 
    "NETWORK_ERROR",
    "INTERNAL_ERROR"
  ]);
  
  return {
    code,
    message,
    retryable: retryableErrors.has(code),
    details
  };
}
```

### Testing

```bash
# Test non-retryable error
curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"invalid"}' | jq '.error.retryable'
# Expected: false

# Test retryable error (if rate limited)
# (Make 10 rapid requests to trigger rate limit)
for i in {1..10}; do
  curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873"
done
curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873" | jq '.error.retryable'
# Expected: true (if rate limited)
```

---

## P1: Investigate Alexandria Provider Issue

**Impact:** Primary provider not being used, wasting API costs  
**Violation:** Alexandria showing as "openlibrary" in responses  
**Expected:** `metadata.provider: "alexandria"` for 80%+ of requests

### Hypothesis Testing

**Hypothesis 1:** Circuit breaker is blocking Alexandria
```bash
# Check circuit breaker state
npx wrangler tail --env production | grep -i "circuit"
# Look for: "Provider alexandria circuit breaker is open"
```

**Hypothesis 2:** Cache serving old OpenLibrary data
```bash
# Test with cache bypass (if implemented)
curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873&nocache=true"
# Check: Does provider change to "alexandria"?
```

**Hypothesis 3:** Alexandria Worker not accessible from production
```bash
# Test Alexandria directly
curl "https://alexandria.ooheynerds.com/api/search?isbn=9780439064873"
# Should return: Book data

# Check if Worker can reach it
npx wrangler tail --env production | grep -i "alexandria"
# Look for: "Try Alexandria first" or "Alexandria error"
```

**Hypothesis 4:** Environment variable missing
```bash
# Check wrangler.toml for Alexandria config
cat wrangler.toml | grep -i alexandria
# Should have: ALEXANDRIA_BASE_URL or similar
```

### Debugging Steps

**Step 1:** Enable verbose logging
```typescript
// In searchByISBN function
console.log("🔍 Searching ISBN:", isbn);
console.log("🌐 Trying Alexandria first...");

const alexandriaResult = await externalApis.searchAlexandriaByISBN(isbn, env);

if (alexandriaResult?.works?.length) {
  console.log("✅ Alexandria HIT for", isbn);
} else {
  console.log("⚠️ Alexandria MISS for", isbn);
}
```

**Step 2:** Watch logs during test
```bash
# Terminal 1: Tail logs
npx wrangler tail --env production

# Terminal 2: Make test request
curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873"

# Check logs for Alexandria messages
```

**Step 3:** Check circuit breaker state
```typescript
// Add to alexandria-api.ts
console.log("Circuit breaker state:", circuitBreakerState);
```

### Potential Fixes

**If circuit breaker is stuck open:**
- Reset circuit breaker manually
- Adjust failure threshold
- Check why Alexandria calls are failing

**If environment issue:**
```toml
# wrangler.toml
[env.production.vars]
ALEXANDRIA_BASE_URL = "https://alexandria.ooheynerds.com"
```

**If cache issue:**
- Clear KV cache for test ISBNs
- Check cache key generation
- Verify cache metadata includes provider

---

## P2: Align Response Structure with Contract

**Impact:** Response is flat canonical, contract promises nested enriched  
**Violation:** #5 from contract violations report  
**Contract Reference:** Section 4.2

### Contract Promise (Enriched Book Object)

```typescript
{
  // Canonical fields (flat)
  isbn: "9780439064873",
  title: "Harry Potter...",
  authors: ["J.K. Rowling"],
  
  // Enriched nested objects
  work: {
    id: "/works/OL82537W",
    title: "Harry Potter and the Philosopher's Stone",
    subjects: ["Magic", "Wizards"],
    firstPublishYear: 1997
  },
  edition: {
    id: "/books/OL26331930M",
    numberOfPages: 344,
    physicalFormat: "Paperback",
    publishers: ["Scholastic Inc."]
  },
  authors: [{
    name: "J.K. Rowling",
    key: "/authors/OL23919A",
    birth_date: "1965-07-31"
  }]
}
```

### Current Response (Flat Canonical)

```typescript
{
  isbn: "9780439064873",
  title: "Harry Potter...",
  authors: ["J.K. Rowling"],  // Just strings!
  publisher: "Scholastic Inc.",
  provider: "openlibrary",
  enrichedAt: "2025-11-30T00:21:08.779Z",
  vectorized: false
}
```

### Decision Required

**Option A:** Update code to return nested structure
- Matches contract documentation
- Provides richer data to iOS
- More work to implement

**Option B:** Update contract to document flat structure
- Matches current implementation
- Less data for iOS
- Breaking change to contract

**Option C:** Provide both endpoints
- `/api/v2/books/enrich` → Flat canonical (current)
- `/api/v2/books/enrich/detailed` → Nested enriched (new)

### Implementation (Option A)

**File:** Response normalization in enrichment handler

```typescript
// Current
return {
  success: true,
  data: {
    isbn: edition.isbn,
    title: work.title,
    authors: authors.map(a => a.name),
    // ... flat fields
  }
};

// Enriched structure
return {
  success: true,
  data: {
    // Canonical fields
    isbn: edition.isbn,
    isbn13: edition.isbn13,
    title: work.title,
    authors: authors.map(a => a.name),
    publisher: edition.publisher,
    publishedDate: edition.publishedDate,
    description: work.description,
    pageCount: edition.pageCount,
    categories: work.subjectTags,
    language: edition.language,
    coverUrl: work.coverImageURL || edition.coverImageURL,
    
    // Enriched nested objects
    work: {
      id: work.openLibraryWorkID,
      title: work.title,
      subjects: work.subjectTags,
      firstPublishYear: work.firstPublicationYear
    },
    edition: {
      id: edition.openLibraryEditionID,
      numberOfPages: edition.pageCount,
      physicalFormat: edition.format,
      publishers: edition.publisher ? [edition.publisher] : []
    },
    authors: authors.map(author => ({
      name: author.name,
      key: author.openLibraryAuthorID,
      birth_date: author.birthYear?.toString()
    }))
  }
};
```

### Testing

```bash
curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"9780439064873","vectorize":false}' | jq '.data.work'
# Expected: { id: "...", title: "...", subjects: [...] }

curl "http://localhost:8787/api/v2/books/enrich" \
  -H "Content-Type: application/json" \
  -d '{"barcode":"9780439064873","vectorize":false}' | jq '.data.authors[0]'
# Expected: { name: "...", key: "...", birth_date: "..." }
```

---

## P3: Add Missing Metadata Fields

**Impact:** Contract promises fields that may be missing  
**Contract Reference:** Section 3.1

### Verify All Metadata Fields Present

**Required fields per contract:**
```typescript
metadata: {
  timestamp: string;      // ISO 8601
  cached: boolean;        // Was this from cache?
  source: string;         // Provider name
  processingTime?: number; // Optional: Response time in ms
}
```

### Current Implementation Check

```bash
# Check if cached field exists
curl "http://localhost:8787/v1/search/isbn?isbn=9780439064873" | jq '.metadata.cached'
# Should output: true or false (not null/undefined)
```

### Add If Missing

```typescript
metadata: {
  timestamp: new Date().toISOString(),
  cached: cacheHit,
  source: provider,
  processingTime: Date.now() - startTime
}
```

---

## Testing Checklist

After implementing fixes, verify:

- [ ] **Success discriminator exists on all success responses**
  ```bash
  curl http://localhost:8787/v1/search/isbn?isbn=9780439064873 | jq '.success'
  # Must output: true
  ```

- [ ] **Success discriminator exists on all error responses**
  ```bash
  curl http://localhost:8787/api/v2/books/enrich \
    -H "Content-Type: application/json" \
    -d '{"barcode":"invalid"}' | jq '.success'
  # Must output: false
  ```

- [ ] **Enrichment accepts "barcode" parameter**
  ```bash
  curl http://localhost:8787/api/v2/books/enrich \
    -H "Content-Type: application/json" \
    -d '{"barcode":"9780439064873"}' | jq '.success'
  # Must output: true
  ```

- [ ] **All errors include retryable field**
  ```bash
  curl http://localhost:8787/api/v2/books/enrich \
    -H "Content-Type: application/json" \
    -d '{"barcode":"invalid"}' | jq '.error.retryable'
  # Must output: true or false (not null)
  ```

- [ ] **Alexandria shows as provider when used**
  ```bash
  curl http://localhost:8787/v1/search/isbn?isbn=9780439064873 | jq '.metadata.source'
  # Should output: "alexandria" (not "openlibrary")
  ```

- [ ] **Enriched structure includes nested objects**
  ```bash
  curl http://localhost:8787/api/v2/books/enrich \
    -H "Content-Type: application/json" \
    -d '{"barcode":"9780439064873"}' | jq '.data | keys'
  # Should include: "work", "edition", "authors" (nested objects)
  ```

---

## Integration Testing with iOS

Once contract compliance is verified:

1. **Start local dev server**
   ```bash
   npm run dev
   # Or: npx wrangler dev
   ```

2. **Point iOS app to local**
   ```swift
   // In iOS app config
   let baseURL = "http://localhost:8787"
   ```

3. **Test key flows**
   - ISBN search
   - Book enrichment
   - CSV import
   - Photo scan

4. **Verify iOS can deserialize**
   - Check Xcode console for decoding errors
   - Verify SwiftData saves successfully
   - Check UI displays correctly

---

## Notes for Claude Code

When implementing these fixes:

1. **Run TypeScript compiler after each change**
   ```bash
   npm run build
   # Check for type errors
   ```

2. **Run tests if available**
   ```bash
   npm test
   ```

3. **Use Wrangler dev for live testing**
   ```bash
   npx wrangler dev
   # Test endpoints at http://localhost:8787
   ```

4. **Check logs during testing**
   ```bash
   npx wrangler tail
   # Watch for errors/warnings
   ```

5. **Commit incrementally**
   ```bash
   git add -p  # Stage changes interactively
   git commit -m "fix: add success discriminator to responses"
   ```

---

**Created by:** Claude (Assistant)  
**For:** Justin (via Claude Code execution)  
**Next:** Implement fixes, test locally, then coordinate with iOS team
