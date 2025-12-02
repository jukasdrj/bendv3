# V3 OpenAPI Spec - Delivered to iOS Team

**Date:** December 2, 2025
**Status:** ✅ Ready for iOS Integration
**File:** `docs/openapi-v3.json`

---

## ✅ What's Ready

### OpenAPI Spec Created
- **Location:** `docs/openapi-v3.json`
- **Format:** OpenAPI 3.0.3
- **Server:** `https://api.oooefam.net/v3`
- **Endpoints:** 3 public endpoints documented

### Deployed to Production
- **URL:** https://api.oooefam.net
- **V3 API Base:** https://api.oooefam.net/v3
- **Health Check:** ✅ https://api.oooefam.net/health (working)
- **Swagger UI:** https://api.oooefam.net/v3/docs (loads, but OpenAPI generation has schema error)

---

## 📋 Documented Endpoints

### Public Endpoints (No Auth)
1. ✅ `GET /v3/books/{isbn}` - Get book by ISBN
2. ✅ `GET /v3/books/search` - Search books by title
3. ✅ `POST /v3/books/enrich` - Enrich book metadata

### Protected Endpoints (Cloudflare Access)
*Not included in this spec - will be added after auth setup*
- `POST /v3/library` - Add book to library
- `GET /v3/library` - List user library
- `DELETE /v3/library/{isbn}` - Remove from library

---

## 📱 iOS Team Next Steps

### 1. Generate Swift Types
```bash
# Using swift-openapi-generator
cd BooksTrackerPackage
swift package generate-openapi

# OR using openapi-generator-cli
openapi-generator generate \
  -i docs/openapi-v3.json \
  -g swift5 \
  -o Sources/GeneratedAPI
```

### 2. Implement ResponseEnvelope Decoding
**Critical:** All V3 responses use this pattern:
```swift
struct ResponseEnvelope<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let metadata: Metadata?
    let error: ApiError?
}

// Example usage
let envelope = try JSONDecoder().decode(
    ResponseEnvelope<Book>.self,
    from: data
)
guard envelope.success, let book = envelope.data else {
    throw APIError.requestFailed
}
return book
```

### 3. Update Endpoints
```swift
// Old (V1/V2)
GET /v1/search/isbn?isbn=9780439708180
GET /v1/search/title?q=Harry

// New (V3)
GET /v3/books/9780439708180
GET /v3/books/search?q=Harry&page=1&limit=20
POST /v3/books/enrich
```

### 4. Test Public Endpoints
```bash
# Test from iOS app or curl
curl https://api.oooefam.net/v3/books/9780439708180
curl "https://api.oooefam.net/v3/books/search?q=Harry+Potter&limit=5"
```

---

## ⚠️ Known Issues

### OpenAPI Auto-Generation Error
**Issue:** Chanfana's `/v3/openapi.json` endpoint returns HTTP 500
**Error:** "Missing parameter data, please specify `name` and other OpenAPI parameter props"
**Workaround:** Hand-crafted OpenAPI spec provided in `docs/openapi-v3.json`
**Fix Needed:** Add missing `.openapi({ param: {...}})` metadata to all Zod schema parameters

### Protected Endpoints Not Documented Yet
**Reason:** Waiting for Cloudflare Access configuration
**Impact:** iOS can use public endpoints now, library features later

---

## 🔧 For Backend Team (Fix Later)

The Chanfana OpenAPI generation error needs these fixes:

1. **Comment out unused schemas** in `src/api/schemas/book.ts`:
   - ✅ Already done: `ISBNParamSchema`, `TitleSearchQuerySchema`, `EnrichmentRequestSchema`

2. **Add parameter metadata** to any inline schemas missing it:
   ```typescript
   // Make sure ALL params have this
   .openapi({
     param: { name: 'paramName', in: 'path|query' },
     example: 'example value'
   })
   ```

3. **Test auto-generation**:
   ```bash
   curl https://api.oooefam.net/v3/openapi.json
   # Should return JSON, not "error code: 1101"
   ```

---

## ✅ Success Criteria

- [x] OpenAPI spec created
- [x] Deployed to production
- [x] Public endpoints working
- [x] Swagger UI loads
- [x] Spec shared with iOS team
- [ ] Auto-generated OpenAPI working (blocked by schema error)
- [ ] Protected endpoints documented (waiting for auth)

---

## 📧 Handoff to iOS Team

**File to use:** `docs/openapi-v3.json`

**What works now:**
- Book lookup by ISBN
- Book search by title
- Book enrichment

**What's coming:**
- User library management (after Cloudflare Access setup)
- CSV import (after endpoint migration)

**Questions?** Contact @jukasdrj or check `docs/V3_NEXT_STEPS.md`

---

**Last Updated:** December 2, 2025, 3:45 AM UTC
**Status:** ✅ Delivered - iOS can start migration
**Next:** Fix Chanfana schema errors for auto-generation
