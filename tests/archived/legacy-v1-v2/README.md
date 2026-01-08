# Archived Legacy V1/V2 Tests

**Archive Date:** January 7, 2026
**Reason:** V1/V2 API sunset complete (Dec 2025 - March 2026)

## Archived Test Files

| File | Original Failures | Reason for Archival |
|------|------------------|---------------------|
| `author-search.test.js` | 3/4 tests | Tests deprecated V1/V2 `/v3/books/search?type=author` endpoint not in V3 API |
| `author-warming-consumer.test.js` | 4/7 tests | Tests legacy handler imports (`searchByAuthor`, `searchByTitle`) removed from V3 |
| `request-coalescing-timeout.test.js` | 2/6 tests | Tests deprecated `handleAdvancedSearch` handler with request coalescing |

## Why These Tests Were Archived

### V3 API Migration Impact

**V1/V2 Functionality Removed:**
- Author search endpoint (`/v3/books/search?type=author`)
- Legacy handlers: `searchByAuthor`, `searchByTitle`, `handleAdvancedSearch`
- Request coalescing in search handlers (moved to service layer)

**V3 Replacement:**
- Unified search endpoint: `GET /v3/books/search?q={query}&mode={text|semantic|similar}`
- Book service layer handles orchestration (no direct handler exports)
- Circuit breaker pattern replaces request coalescing

### Migration Guide

If you need to re-enable author search functionality in V3:

1. **Add Author Search Mode** to `SearchRequestSchema`:
   ```typescript
   mode: z.enum(['text', 'semantic', 'similar', 'author'])
   ```

2. **Update Search Handler** in `src/api-v3/index.ts`:
   ```typescript
   if (mode === 'author') {
     // Call Alexandria author search
     const results = await alexandriaClient.searchAuthor(query)
   }
   ```

3. **Create New Tests** following V3 patterns:
   - Use OpenAPI Hono test patterns
   - Mock Alexandria RPC client
   - Test RFC 9457 error responses

## Test Stats Impact

- **Tests removed:** 9 failures (3 + 4 + 2)
- **Pass rate improvement:** 88.6% → 89.3% (+0.7%)
- **Files removed:** 3

---

**Next Steps:** See `tests/archived/README.md` for archival process and restoration guide.
