# Alexandria Contract Testing

This document describes the contract testing implementation between bendv3 and Alexandria Worker.

## Overview

Contract tests validate that bendv3's expectations about Alexandria's API remain correct. They use Hono's RPC client for type-safe API calls and detect breaking changes at compile-time.

## Setup

### Package Installation

Alexandria Worker is installed as an npm dependency:

```json
{
  "dependencies": {
    "alexandria-worker": "^2.2.1"
  }
}
```

This package exports `AlexandriaAppType` for use with Hono's RPC client.

### Running Tests

```bash
# Run Alexandria contract tests
npm run test:alexandria

# Run all integration tests (includes Alexandria)
npm test -- tests/integration/

# Run specific test suite
npm test -- tests/integration/alexandria-contract.test.ts
```

## Test Coverage

### Endpoints Tested

**Health & Stats:**
- ✅ `GET /health` - Health check with database latency
- ⏭️ `GET /api/stats` - Database statistics (skipped - performance issue)

**Search:**
- ✅ `GET /api/search?isbn={isbn}` - ISBN search
- ✅ `GET /api/search?title={title}` - Title search
- ✅ `GET /api/search?author={author}` - Author search
- ⏭️ `GET /api/search` with pagination (skipped - slow with common terms)
- ✅ Missing query params validation

**Cover Processing:**
- ✅ `GET /covers/:isbn/status` - Check cover availability
- ✅ `GET /covers/:isbn/:size` - Serve cover image
- ✅ `POST /api/covers/process` - Process cover from provider URL

**Quota Management:**
- ✅ `GET /api/quota/status` - ISBNdb quota status

**OpenAPI:**
- ✅ `GET /openapi.json` - OpenAPI specification

**Error Handling:**
- ✅ 404 for non-existent ISBN
- ✅ 400 for invalid ISBN format
- ✅ Proper error envelope structure

**Type Safety:**
- ✅ Compile-time type checking
- ✅ Autocomplete for nested routes
- ✅ Runtime response shape validation

## Type Safety

The contract tests use Hono's RPC client (`hc`) with Alexandria's exported types:

```typescript
import { hc } from 'hono/client';
import type { AlexandriaAppType } from 'alexandria-worker';

const alexandria = hc<AlexandriaAppType>('https://alexandria.ooheynerds.com');

// Fully typed API calls
const response = await alexandria.api.search.$get({
  query: { isbn: '9780439064873' }
});

// TypeScript knows the response type
const data = await response.json();
if (data.success) {
  console.log(data.data.results); // Autocomplete works!
}
```

### Breaking Change Detection

If Alexandria changes an endpoint's request or response shape, TypeScript will catch it at compile time:

```typescript
// This would fail compilation if Alexandria removes the 'isbn' query param
const response = await alexandria.api.search.$get({
  query: { isbn: '123' } // TS Error if 'isbn' param removed
});
```

## Response Formats

### Standard Envelope

Most Alexandria endpoints use a standard response envelope:

```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "meta": {
    "requestId": "abc123",
    "timestamp": "2026-01-04T20:00:00.000Z",
    "latencyMs": 45
  }
}
```

### Search Results

```json
{
  "success": true,
  "data": {
    "query": { "isbn": "9780439064873" },
    "results": [
      {
        "title": "Harry Potter and the Chamber of Secrets",
        "authors": [],
        "isbn": "9780439064873",
        "coverUrl": "https://...",
        "publish_date": "2000-09-01",
        "publishers": "Scholastic Inc.",
        "pages": 341,
        "work_title": "..."
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 1,
      "hasMore": false,
      "returnedCount": 1
    }
  }
}
```

### Cover Status (No Envelope)

Note: Cover status endpoint returns data directly, no `success`/`data` envelope:

```json
{
  "exists": true,
  "isbn": "9780439064873",
  "format": "webp",
  "sizes": {
    "large": 24836,
    "medium": 12252,
    "small": 3342
  },
  "urls": {
    "large": "/covers/9780439064873/large",
    "medium": "/covers/9780439064873/medium",
    "small": "/covers/9780439064873/small"
  }
}
```

## Known Issues

### Skipped Tests

Some tests are currently skipped due to performance issues:

1. **`GET /api/stats`** - Times out (>60s)
   - Possible infrastructure issue
   - TODO: Investigate Alexandria database query performance

2. **`GET /api/search` with pagination** - Slow with common terms
   - Searching for "the" takes >15s
   - TODO: Use more specific terms or investigate indexing

3. **Response Consistency** - Depends on stats endpoint
   - Skipped until stats endpoint is fixed

### Rate Limiting

Alexandria implements rate limiting. Tests check for rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
X-RateLimit-Reset: 1767374513
```

If you see 429 responses, wait for the reset time.

## Maintenance

### Updating Alexandria Version

When Alexandria releases a new version:

1. Update package version:
   ```bash
   npm install alexandria-worker@latest
   ```

2. Run contract tests:
   ```bash
   npm run test:alexandria
   ```

3. If tests fail:
   - Check TypeScript compilation errors (breaking changes)
   - Review test failures (response shape changes)
   - Update tests or bendv3 code as needed

### Adding New Endpoints

To add tests for new Alexandria endpoints:

1. Add test case to `tests/integration/alexandria-contract.test.ts`
2. Use the RPC client for type-safe calls
3. Validate response envelope and data shape
4. Run tests to ensure they pass

## Benefits

- ✅ **Compile-Time Safety** - Catches breaking changes before deploy
- ✅ **No Schema Duplication** - Single source of truth (Alexandria)
- ✅ **Autocomplete** - Full IDE support for Alexandria API
- ✅ **Runtime Validation** - Ensures actual responses match types
- ✅ **Documentation** - Tests serve as API usage examples

## Related Files

- `/tests/integration/alexandria-contract.test.ts` - Contract test suite
- `/tests/normalizers/alexandria-contract-compliance.test.ts` - Response transformation tests
- `/tests/services/alexandria-cover-service.test.ts` - Cover service tests
- `package.json` - Alexandria package version and test scripts

## References

- [Alexandria Worker on npm](https://www.npmjs.com/package/alexandria-worker)
- [Alexandria README](https://github.com/your-org/alexandria/blob/main/worker/README-CONTRACT-TESTING.md)
- [Hono RPC Documentation](https://hono.dev/guides/rpc)
