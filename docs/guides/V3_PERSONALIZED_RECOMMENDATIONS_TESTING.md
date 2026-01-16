# V3 Personalized Recommendations Testing Guide

**Endpoint:** `GET /v3/recommendations/personalized`
**Status:** ✅ Production Ready (Weekly Fallback Strategy)
**Test Coverage:** 115+ test cases across unit and smoke test suites

---

## Test Structure Overview

The test suite is organized in two configurations:

### 1. Smoke Tests (Workers Pool - 5s)
**File:** `tests/smoke/v3-recommendations.test.ts`

Quick validation of endpoint route registration and schema imports without integration test overhead.

**What's Tested:**
- Route function imports
- Schema validation (all 3 schemas)
- Query parameter validation
- Response structure and metadata
- Cache indicators (cached flag)
- Strategy values (weekly_fallback, preference_based)
- RFC 9457 error format compliance

**Run:** `npm run test:smoke`

### 2. Unit Tests (Node Pool - 19s)
**File:** `tests/unit/v3-personalized-recommendations.test.ts`

Comprehensive testing of logic, edge cases, and integration points.

**What's Tested:**
- Route definition and handler
- Schema validation with edge cases
- Weekly fallback strategy implementation
- Cache storage (KV and D1)
- D1 database fallback behavior
- Recent books fallback strategy
- Error handling (404, 500)
- Response metadata construction
- HATEOAS links generation
- Future personalization architecture (Issue #258)
- Request context integration
- OpenAPI route definition

**Run:** `npm run test:unit` or `npm run test:node`

---

## Test Case Breakdown

### Route Definition Tests (4 cases)
Verify the endpoint is properly registered with Hono router.

```typescript
✓ should import registerPersonalizedRecommendationsRoute
✓ should export PersonalizedRecommendationsResponseSchema
✓ should register route with correct HTTP method (GET)
✓ should register route with correct path
```

### Schema Validation Tests (35+ cases)

#### Query Parameters (5 cases)
- Accept limit 1-20
- Accept optional userId
- Default limit to 10
- Allow missing userId

#### Response Schema (8 cases)
- Validate weekly_fallback strategy responses
- Validate preference_based strategy (future)
- Validate score range (0-1)
- Empty recommendations array
- Optional fields (coverUrl, score, generatedAt)

#### Recommendation Fields (3 cases)
- Required fields (isbn, title, author, reason)
- Optional fields (coverUrl, score)
- Field type validation

### Fallback Strategy Tests (6 cases)

Verify weekly recommendations behavior:

```typescript
✓ should return weekly recommendations when cached in KV
✓ should respect limit parameter when slicing cached recommendations
✓ should include strategy and generatedAt in response
✓ should parse D1 recommendations_json correctly
✓ should query D1 with week_of parameter
✓ should use current timestamp as generatedAt for fallback
```

### Cache Storage Tests (7 cases)

Test KV and D1 cache layer:

```typescript
✓ should compute cache key as recommendations:weekly:{weekOf}
✓ should format cache key for Sunday start of week
✓ should format cache key consistently for entire week
✓ should try KV cache first, then D1 database
✓ should return cached=true when hitting KV cache
✓ should return cached=false when fetching from D1 or fallback
✓ should respect limit when slicing D1 results
```

**Cache Key Calculation:**
```typescript
// For Thursday Jan 16, 2026:
const dayOfWeek = 4  // Thursday
const weekStart = new Date('2026-01-12')  // Sunday
const weekOf = '2026-01-12'
const cacheKey = 'recommendations:weekly:2026-01-12'
```

### D1 Database Tests (3 cases)

Test database fallback:

```typescript
✓ should parse D1 recommendations_json correctly
✓ should query D1 with week_of parameter
✓ should include generated_at from D1 in response
```

**D1 Schema:**
```sql
SELECT week_of, recommendations_json, generated_at
FROM recommendations
WHERE week_of = ?
ORDER BY generated_at DESC
LIMIT 1
```

### Recent Books Fallback Tests (4 cases)

Test fallback when no weekly recommendations:

```typescript
✓ should query recent books with covers if no weekly recommendations
✓ should map book rows to recommendation format
✓ should handle missing author gracefully
✓ should handle missing cover URL gracefully
```

**Query:**
```sql
SELECT b.isbn, b.title, b.cover_medium_url,
       json_extract(b.canonical_metadata, '$.authors[0].name') as author
FROM books b
WHERE b.cover_medium_url IS NOT NULL
ORDER BY b.updated_at DESC
LIMIT ?
```

### Error Handling Tests (3 cases)

```typescript
✓ should return 404 when no recommendations available at all
✓ should return 500 on internal server error
✓ should sanitize error messages to prevent information leakage
```

**Error Codes:**
- `NOT_FOUND` (404) - No recommendations available
- `INTERNAL_ERROR` (500) - Server error

### Response Metadata Tests (5 cases)

Verify metadata fields:

```typescript
✓ should include requestId in metadata
✓ should include source in metadata (kv-cache, alexandria, or fallback)
✓ should include processingTime in milliseconds
✓ should include timestamp in ISO 8601 format
✓ should include cached boolean indicating cache hit
```

**Metadata Structure:**
```json
{
  "timestamp": "2026-01-16T12:00:00.000Z",
  "requestId": "req-abc-123",
  "source": "kv-cache",
  "cached": true,
  "processingTime": 5
}
```

### HATEOAS Links Tests (3 cases)

```typescript
✓ should include _links.self in response
✓ should include userId in self link if provided
✓ should construct href with current query parameters
```

**Links Format:**
```json
{
  "_links": {
    "self": {
      "href": "/v3/recommendations/personalized?limit=10",
      "rel": "self",
      "method": "GET"
    }
  }
}
```

### Future Personalization Tests (4 cases)

Tests for Issue #258 (Alexandria ratings integration):

```typescript
✓ should document userId parameter for future personalization
✓ should reserve strategy value "preference_based" for future use
✓ should support score field in recommendations for future ranking
✓ should blocker note: Alexandria ratings endpoints not yet available
```

**Future Endpoint Behavior (Not Yet Implemented):**

Once Alexandria ratings endpoints available:
1. Fetch user's 4-5 star rated books
2. Build preference vector from subject overlap
3. Query Alexandria for similar books
4. Score candidates by subject match + preferences
5. Return strategy: "preference_based" with scores

### Request Context Integration (3 cases)

```typescript
✓ should access X-Request-ID from RequestContext
✓ should calculate processingTime from startTime
✓ should pass requestId to error responses
```

### OpenAPI Definition Tests (4 cases)

```typescript
✓ should register route with correct HTTP method (GET)
✓ should register route with correct path
✓ should register route with Discovery tag
✓ should document response schemas for 200, 400, 404, 500
```

---

## Running the Tests

### All Tests
```bash
npm test              # Both pools sequentially
npm run test:safe     # Laptop-friendly: smoke + safe node pool
```

### Focused Testing
```bash
npm run test:smoke    # Just smoke tests (~5s)
npm run test:unit     # Just unit tests (~19s)
```

### Watch Mode (Development)
```bash
npm run test:watch    # Re-run on file changes
npm run test:ui       # Vitest UI dashboard
```

### Coverage Report
```bash
npm run test:coverage # Generate coverage analysis
```

---

## Test Files

### Schema File
- **Path:** `packages/schemas/src/recommendations.ts`
- **Exports:**
  - `PersonalizedRecommendationSchema`
  - `PersonalizedRecommendationsDataSchema`
  - `PersonalizedRecommendationsResponseSchema`

### Implementation File
- **Path:** `src/api-v3/recommendations.ts`
- **Exports:**
  - `registerPersonalizedRecommendationsRoute(app)`

### Test Files
- **Smoke:** `tests/smoke/v3-recommendations.test.ts` (23 tests)
- **Unit:** `tests/unit/v3-personalized-recommendations.test.ts` (92 tests)
- **Total:** 115+ test cases

---

## Current Implementation Status

### What's Implemented ✅
- Route handler with weekly_fallback strategy
- KV cache lookup with cache key: `recommendations:weekly:{weekOf}`
- D1 database fallback
- Recent books fallback when no cached recommendations
- Error handling (404, 500)
- RFC 9457 Problem Details error format
- Response metadata (requestId, timestamp, source, cached, processingTime)
- HATEOAS links generation
- Schema validation

### What's Future (Issue #258) 🔮
- Alexandria ratings endpoints integration
- Personalized recommendation scoring
- Preference-based strategy
- User preference caching
- Scoring breakdown in response

---

## Cache Architecture

### Current Flow
```
Request
  ↓
Check KV cache: recommendations:weekly:{weekOf}
  ↓ (miss)
Check D1: SELECT FROM recommendations WHERE week_of = ?
  ↓ (miss)
Query recent books: SELECT FROM books ORDER BY updated_at DESC
  ↓
Return recommendations with strategy: weekly_fallback
```

### Cache Key Format
```
recommendations:weekly:{YYYY-MM-DD}
```

Where `YYYY-MM-DD` is the Sunday start of the current week in UTC.

### TTL
- **KV:** 7 days (managed by weekly cron job regeneration)
- **D1:** Permanent (manually updated by cron)

---

## Performance Characteristics

### Expected Response Times
- **KV Cache Hit:** 2-10ms (cached: true)
- **D1 Fallback:** 50-200ms (cached: false)
- **Recent Books Fallback:** 100-300ms (cached: false)

### Test Resource Limits
- **Smoke Tests:** <1MB memory, <5s execution
- **Unit Tests:** <512MB memory, <60s execution (safe mode)
- **Full Suite:** Parallel execution with 2 concurrent test workers

---

## Debugging Failed Tests

### Common Failures

#### Schema Validation Failed
- Check schema exports in `packages/schemas/src/recommendations.ts`
- Verify response structure matches schema

#### Cache Key Mismatch
- Verify `weekOf` calculation (Sunday start of UTC week)
- Check cache key format: `recommendations:weekly:{weekOf}`

#### D1 Query Issues
- Verify database schema has `recommendations` table
- Check columns: `week_of`, `recommendations_json`, `generated_at`

#### Missing Metadata
- Verify RequestContext is properly injected
- Check middleware order in router

### Debug Tools

```bash
# Run single test file
npx vitest tests/unit/v3-personalized-recommendations.test.ts

# Run single test suite
npx vitest tests/unit/v3-personalized-recommendations.test.ts -t "Schema Validation"

# Enable debug output
DEBUG=* npm run test:unit

# Watch mode for development
npm run test:watch tests/unit/v3-personalized-recommendations.test.ts
```

---

## Integration with CI/CD

The test suite runs in GitHub Actions on every push:

```yaml
- name: Run smoke tests
  run: npm run test:smoke

- name: Run full test suite
  run: npm run test:safe

- name: Check coverage
  run: npm run test:coverage
```

---

## Future Enhancements

### When Alexandria Ratings Ready (Issue #258)
1. Add tests for preference-based scoring
2. Add tests for user preference caching
3. Add tests for subject overlap calculation
4. Add tests for author diversity filter
5. Update response metadata to include scoring breakdown

### Recommendation Service Tests
- Separate test file for personalization logic
- RecommendationService unit tests
- Algorithm performance benchmarks
- Diversity filter validation

### Integration Tests
- End-to-end test with mock Alexandria API
- Real D1 database testing
- Multi-user preference testing
- Cache eviction testing

---

## References

- **Endpoint Documentation:** `/v3/openapi.json` + `/v3/docs`
- **Schema Source:** `packages/schemas/src/recommendations.ts`
- **Implementation:** `src/api-v3/recommendations.ts`
- **RecommendationService:** `src/services/recommendations.ts`
- **Issue #258:** Alexandria ratings integration blocker
- **RFC 9457:** Problem Details for HTTP APIs

---

**Last Updated:** January 16, 2026
**Test Coverage:** 115+ cases
**Status:** ✅ Production Ready
