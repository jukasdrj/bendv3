# V3 API - Next Steps

**Date:** December 2, 2025
**Current Status:** ✅ Phase 1 & 2 Complete, Auth Simplified

---

## ✅ What's Complete

### Endpoints (6 total)
- ✅ `GET /v3/books/:isbn` - Book lookup
- ✅ `GET /v3/books/search` - Title search with pagination
- ✅ `POST /v3/books/enrich` - Single book enrichment
- ✅ `POST /v3/library` - Add book to library (auth)
- ✅ `GET /v3/library` - List user library (auth)
- ✅ `DELETE /v3/library/:isbn` - Remove from library (auth)

### Infrastructure
- ✅ Chanfana class-based routing
- ✅ Auto-generated OpenAPI docs at `/v3/docs`
- ✅ Cloudflare Access authentication
- ✅ D1 database integration
- ✅ Service layer reuse (no rewrites)

---

## 🎯 Immediate Next Steps (This Week)

### 1. Generate OpenAPI Spec for iOS Team
**Priority:** CRITICAL - Unblocks iOS migration
**Time:** 5 minutes
**Commands:**
```bash
# Generate static OpenAPI spec
npm run generate:openapi

# File created: docs/openapi-v3.json
```

**Then:**
- Share `docs/openapi-v3.json` with iOS team
- They use it to generate Swift types
- iOS team reviews the contract

---

### 2. Set Up Cloudflare Access (If Not Already)
**Priority:** HIGH - Enables protected endpoints in production
**Time:** 30 minutes (if new), 5 minutes (if existing)

**If you already have CF Access for Alexandria:**
```bash
# Just add /v3/library* to existing policy
# In Cloudflare Dashboard → Access → Applications
# Edit existing app or create new one
# Add path: /v3/library*
```

**If CF Access is new:**
1. Go to Cloudflare Dashboard → Zero Trust → Access
2. Create Application:
   - Name: "BooksTrack Library API"
   - Domain: `api.oooefam.net`
   - Path: `/v3/library*`
3. Add Google as identity provider
4. Create policy: Allow users with `@yourdomain.com` emails

**Test:**
```bash
# Should redirect to Google Sign-In
curl https://api.oooefam.net/v3/library
```

---

### 3. Deploy to Production
**Priority:** HIGH - Make v3 available
**Time:** 10 minutes
**Commands:**
```bash
# Deploy
npm run deploy

# Verify health
curl https://api.oooefam.net/health
curl https://api.oooefam.net/v3/docs

# Test public endpoint
curl https://api.oooefam.net/v3/books/9780439708180
```

---

## 📱 iOS Migration Guidance

Based on your alex/books-v3 changes document, here's what the iOS team needs to do:

### Phase 1: Public Endpoints (Week 1)
**No Auth Required - Can Start Immediately**

1. **Generate Swift types from OpenAPI:**
   ```bash
   # Using swift-openapi-generator
   openapi-generator generate \
     -i openapi-v3.json \
     -g swift5 \
     -o BooksTrackerPackage/Sources/GeneratedAPI
   ```

2. **Update search endpoints:**
   ```swift
   // Old (v1/v2)
   GET /v1/search/isbn?isbn=123
   GET /v1/search/title?q=Harry

   // New (v3)
   GET /v3/books/9780439708180
   GET /v3/books/search?q=Harry&page=1&limit=20
   ```

3. **Implement ResponseEnvelope decoding:**
   ```swift
   struct ResponseEnvelope<T: Codable>: Codable {
       let success: Bool
       let data: T?
       let metadata: Metadata?
       let error: ApiError?
   }

   // Use in all API calls
   let envelope = try JSONDecoder().decode(
       ResponseEnvelope<Book>.self,
       from: data
   )
   guard envelope.success, let book = envelope.data else {
       throw APIError.requestFailed
   }
   ```

### Phase 2: Library Endpoints (Week 2)
**Requires Cloudflare Access Setup**

4. **Test library endpoints:**
   ```swift
   // Should work automatically through CF Access
   POST /v3/library
   GET /v3/library?status=reading
   DELETE /v3/library/9780439708180
   ```

5. **User ID from CF Access:**
   - iOS doesn't need to send user ID
   - Cloudflare Access handles authentication
   - API reads email from `Cf-Access-Authenticated-User-Email` header
   - Library queries filtered by email automatically

---

## 🚀 Short-Term Roadmap (Weeks 2-4)

### Week 2: Import Endpoints
**Migrate CSV/batch import to v3**

Missing endpoints:
- `POST /v3/imports` - Start CSV import job
- `GET /v3/imports/:id/status` - Poll job status
- `GET /v3/imports/:id/stream` - SSE progress stream

**Why needed:** iOS app uses CSV import for bulk book additions

**Effort:** ~4 hours (similar to existing endpoints)

---

### Week 3: Testing & Monitoring

1. **Add integration tests:**
   ```bash
   # Test all v3 endpoints
   tests/v3/
   ├── books.test.ts
   ├── library.test.ts
   └── imports.test.ts
   ```

2. **Monitor v3 adoption:**
   - Track `X-Router: hono` header in analytics
   - Compare v3 vs v1/v2 traffic
   - Identify any errors specific to v3

3. **Performance benchmarks:**
   - Measure v3 response times
   - Compare to v1/v2 baseline
   - Optimize any slow endpoints

---

### Week 4: iOS App Migration

1. **iOS team completes migration**
2. **Beta test with real users**
3. **Monitor error rates**
4. **Fix any bugs discovered**

---

## 🔮 Long-Term Roadmap (Months 2-3)

### Month 2: Deprecation Warnings

1. **Add Sunset headers to v1/v2:**
   ```typescript
   response.headers.set('Deprecation', 'true')
   response.headers.set('Sunset', 'Sat, 1 Mar 2026 00:00:00 GMT')
   ```

2. **Monitor deprecated endpoint usage**
3. **Notify users still on v1/v2**

---

### Month 3: v1/v2 Removal

1. **Verify 100% v3 adoption**
2. **Remove v1/v2 routes from `router.ts`**
3. **Archive legacy code**
4. **Deploy cleanup**

**File removals:**
- `src/handlers/v1/*.ts` (all v1 handlers)
- `src/openapi/routes/*.ts` (old OpenAPI v1/v2 routes)
- Legacy search endpoints

**Estimated savings:** ~2000 lines of code removed

---

## 📊 Success Metrics

### Technical Metrics
- [ ] OpenAPI spec generated and validated
- [ ] All 6 v3 endpoints responding < 500ms (P95)
- [ ] Zero v3-specific errors in production
- [ ] iOS app successfully migrated

### Business Metrics
- [ ] v3 traffic > 90% of total API traffic
- [ ] User library feature adoption measured
- [ ] CSV import jobs completing successfully

---

## 🎯 **Your Next Command** (Right Now!)

```bash
# Generate OpenAPI spec for iOS team
npm run generate:openapi

# Then share docs/openapi-v3.json with iOS team
```

---

## ❓ Decision Points

### Do you already have Cloudflare Access set up?
- **YES** → Just add `/v3/library*` to existing policy (5 min)
- **NO** → Set up CF Access from scratch (30 min)

### When should iOS team start migration?
- **Now** → Public endpoints ready (no auth needed)
- **After CF Access** → Wait for protected endpoints

### Do you want to migrate import endpoints to v3?
- **YES** → iOS can use CSV import (4 hours work)
- **NO** → iOS uses existing v2 import endpoints

---

**Last Updated:** December 2, 2025
**Status:** ✅ Ready for OpenAPI generation and iOS handoff
