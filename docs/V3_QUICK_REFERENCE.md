# V3 API Quick Reference

**One-page summary for developers migrating from V1/V2 to V3**

---

## 🎯 Current Status (December 2025)

✅ **V3 API Ready:**
- Book search (text mode)
- ISBN direct lookup
- Batch enrichment (sync mode)

❌ **V3 API Missing (Blocks V2 Deprecation):**
- CSV import workflow
- Bookshelf scanning
- Async job management
- SSE progress streaming

⚠️ **V1 API:** Deprecated (sunset March 1, 2026)
📦 **V2 API:** Stable (deprecate after V3 feature parity)

---

## 📋 Endpoint Migration Map

| V1/V2 Endpoint | V3 Replacement | Status | Breaking Changes |
|----------------|----------------|--------|------------------|
| `GET /v1/search/isbn?isbn=X` | `GET /v3/books/:isbn` | ✅ Ready | Path param (not query) |
| `GET /v1/search/title?q=X` | `GET /v3/books/search?q=X&mode=text` | ✅ Ready | Added mode param |
| `POST /api/batch-enrich` | `POST /v3/books/enrich` | ✅ Ready | Zod schema validation |
| `POST /api/import/csv-gemini` | `POST /v3/jobs/imports` | ❌ TODO | Returns job object |
| `GET /api/v2/imports/:id` | `GET /v3/jobs/imports/:id` | ❌ TODO | RFC 9457 errors |
| `GET /api/v2/imports/:id/stream` | `GET /v3/jobs/imports/:id/stream` | ❌ TODO | SSE (no change) |
| `POST /api/scan-bookshelf/batch` | `POST /v3/jobs/scans` | ❌ TODO | Returns job object |
| `GET /ws/progress?jobId=X` | `GET /v3/jobs/{type}/{id}/stream` | ❌ TODO | **SSE replaces WebSocket** |

---

## 🔧 Key Differences V2 → V3

### 1. Response Format
**V2 (ResponseEnvelope):**
```json
{
  "data": {...},
  "metadata": {"timestamp": "...", "source": "...", "cached": true},
  "error": null
}
```

**V3 (RFC 9457 Problem Details for errors):**
```json
// Success (same as V2)
{
  "success": true,
  "data": {...},
  "metadata": {...}
}

// Error (RFC 9457)
{
  "type": "https://api.oooefam.net/errors#NOT_FOUND",
  "title": "Book not found",
  "status": 404,
  "detail": "No book found with ISBN 9780123456789",
  "instance": "/v3/books/9780123456789",
  "requestId": "uuid"
}
```

### 2. Error Handling
**V2:** Custom error codes (`ErrorCodes.MISSING_ISBN`)
**V3:** RFC 9457 types (`https://api.oooefam.net/errors#INVALID_REQUEST`)

### 3. Pagination
**V2:** Offset-based only (`page`, `limit`)
**V3:** Offset OR cursor-based (`cursor` option for large datasets)

### 4. HATEOAS Links
**V2:** No links
**V3:** Navigation links included
```json
{
  "_links": {
    "self": {"href": "/v3/books/search?q=harry&page=1", "method": "GET"},
    "next": {"href": "/v3/books/search?q=harry&page=2", "method": "GET"}
  }
}
```

### 5. Conditional Requests
**V2:** No ETag support
**V3:** ETag for caching
```http
GET /v3/books/9780439708180
If-None-Match: "9780439708180-a1b2c3d4"
→ 304 Not Modified (if unchanged)
```

### 6. Rate Limiting
**V2:** No standard headers
**V3:** Standard rate limit headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701820800
```

---

## 🚀 V3 Implementation Priorities

### Phase 2.1: Job Framework (Days 1-3)
```
src/api-v3/jobs/
  schema.ts       # Shared Zod schemas (JobSchema, JobStatusSchema)
  imports.ts      # CSV import routes
  scans.ts        # Bookshelf scan routes
  enrichment.ts   # Async batch enrichment
  common.ts       # Utilities (DO access, auth)
```

**Critical Schema:**
```typescript
export const JobSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(['csv_import', 'bookshelf_scan', 'batch_enrichment']),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'canceled']),
  progress: z.number().min(0).max(1),
  processedCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  startTime: z.string().datetime(),
  completedTime: z.string().datetime().optional(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).optional()
})
```

### Phase 2.2: SSE Streaming (Days 4-5)
**Event Types:**
- `progress` - Every 2s while processing
- `complete` - Includes books array (iOS requirement)
- `error` - Includes retryable flag
- `ping` - Heartbeat every 30s

**Key Features:**
- Browser-native reconnection (`Last-Event-ID`)
- Token-based auth (Bearer token from job creation)
- Graceful cleanup on disconnect
- Books array in completion event

### Phase 2.3: CSV Import (Days 6-8)
- Port logic from `src/handlers/csv-import.ts`
- Use JobStateManagerDO (not ProgressWebSocketDO)
- Add HATEOAS links (self, stream, cancel)
- Return 202 Accepted (not 200 OK)

### Phase 2.4: Bookshelf Scanning (Days 9-11)
- Port logic from `src/handlers/batch-scan-handler.ts`
- Keep multipart parsing, R2 storage
- Add bounding box validation (clamp [0, 1])
- Include SSE stream URL in response

### Phase 2.5: Batch Enrichment Async (Days 12-14)
- Add `async` flag to `POST /v3/books/enrich`
- Backward compatible (default `async=false`)
- When `async=true`, return job object

---

## 📊 Performance Targets

| Endpoint | P95 Latency | Notes |
|----------|-------------|-------|
| `POST /v3/jobs/imports` | <200ms | Job creation only |
| `GET /v3/jobs/{type}/{id}` | <100ms | Cached DO state |
| `GET /v3/jobs/{type}/{id}/stream` | <50ms | SSE connection |
| `GET /v3/books/:isbn` | <500ms | Cached: <50ms |
| `GET /v3/books/search` | <800ms | Cached: <100ms |

---

## 🔐 Security Changes

### V2 WebSocket Auth (Query Param - INSECURE)
```
wss://api.oooefam.net/ws/progress?jobId=xxx&token=yyy
⚠️ Leaks tokens in logs, browser history
```

### V3 SSE Auth (Bearer Token - SECURE)
```http
GET /v3/jobs/imports/xxx/stream
Authorization: Bearer TOKEN_HERE
✅ Standard, secure, no leakage
```

---

## 🧹 Code Cleanup After V2 Sunset

### Delete (Week 7-8)
- `src/router.ts` (1743 lines) - V1/V2 routes
- `src/handlers/v1/` - All V1 handlers
- `src/handlers/v2/` - All V2 handlers
- `docs/openapi.yaml` - Manual V2 spec
- Feature flags: `ENABLE_REFACTORED_DOS`, `ENABLE_HONO_ROUTER`
- Legacy DOs: `ProgressWebSocketDO`

### Optimize
- Remove ResponseEnvelope → RFC 9457 conversions
- Single error handler (no version forking)
- Shorter cache keys (no version prefix)
- Bundle size: -15-20%

---

## 📦 Dependencies to Preserve

### Critical for V3 Migration
- ✅ `handleCSVImport` → Port to V3 jobs
- ✅ `handleBatchScan` → Port to V3 jobs
- ✅ `handleBatchEnrichment` → Extend for async mode
- ✅ `processCSVCore` → Reuse as-is
- ✅ `scanImageWithGemini` → Reuse as-is
- ✅ `enrichBooksParallel` → Reuse as-is

### Can Be Deleted After Migration
- ❌ `createSuccessResponse` (V2 ResponseEnvelope)
- ❌ `getProgressDOStub` (V1/V2 DO access)
- ❌ Manual validation code (Zod replaces)

---

## 🎯 Success Metrics

### Phase 2 Completion
- [ ] All V3 job endpoints <500ms P95
- [ ] SSE reconnection success rate >95%
- [ ] CSV import handles 8MB files
- [ ] Bookshelf scan processes 5 photos in <60s
- [ ] Zero frontend blockers

### V2 Deprecation
- [ ] V2 traffic <10% within 30 days
- [ ] V1 traffic 0% by March 1, 2026
- [ ] Zero critical bugs
- [ ] Frontend satisfaction >8/10

### Code Cleanup
- [ ] Bundle size -15-20%
- [ ] Test runtime -30%
- [ ] Coverage maintained 75%+
- [ ] Zero V1/V2 references

---

## 🚨 Migration Blockers

| Blocker | Impact | Mitigation |
|---------|--------|-----------|
| iOS app not updated to V3 | High | Require app update before V2 sunset |
| SSE reconnection fails | High | Test on poor networks, add retry logic |
| Performance regression | Medium | Load test before V2 shutdown |
| Undiscovered V2 dependencies | Medium | Audit analytics, canary deployment |

---

## 📞 Support Contacts

- **Backend Team:** @jukasdrj
- **iOS Team:** TBD
- **Web Team:** TBD
- **API Support:** api-support@oooefam.net

---

## 📚 Full Documentation

- **Deprecation Plan:** [V1_V2_DEPRECATION_PLAN.md](V1_V2_DEPRECATION_PLAN.md)
- **Implementation Guide:** [V3_IMPLEMENTATION_GUIDE.md](V3_IMPLEMENTATION_GUIDE.md)
- **OpenAPI Spec:** `/v3/openapi.json`
- **Architecture:** [CLAUDE.md](../CLAUDE.md)

---

**Last Updated:** December 5, 2025
**Status:** Phase 2 planning complete, implementation starts Week 3
