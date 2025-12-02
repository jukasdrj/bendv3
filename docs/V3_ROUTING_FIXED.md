# V3 API Routing - Fixed and Deployed

**Date:** December 2, 2025, 3:50 AM UTC
**Status:** ✅ Routing Fixed, ⚠️ Schema Validation Issue
**Deployment:** Version 9778092a-ac68-4a3e-b067-fc974d81463d

---

## ✅ What We Fixed

### Problem 1: V3 Routes Not Registering (404 Errors)
**Root Cause:** Incorrect route path format with Chanfana's `base` option

**Original Code:**
```typescript
const openapi = fromHono(app, {
  base: '/v3',  // ❌ This caused routes to not register
  docs_url: '/v3/docs',
})

openapi.get('/books/:isbn', GetBookByISBN)  // Expected to become /v3/books/:isbn
```

**Fix:**
```typescript
const openapi = fromHono(app, {
  // ✅ Removed 'base' option
  docs_url: '/v3/docs',
})

openapi.get('/v3/books/:isbn', GetBookByISBN)  // ✅ Full paths work correctly
```

**Result:** Routes now register successfully in both local and production:
```
[V3] Registering GET /v3/books/:isbn
[V3] Registering GET /v3/books/search
[V3] Registering POST /v3/books/enrich
[V3] Registering POST /v3/library
[V3] Registering GET /v3/library
[V3] Registering DELETE /v3/library/:isbn
```

---

## ⚠️ Current Issue: Schema Validation Error

### Problem: `keyValidator._parse is not a function`

**Current Behavior:**
```bash
curl "https://api.oooefam.net/v3/books/9780439708180"

{
  "success": false,
  "error": {
    "message": "keyValidator._parse is not a function",
    "code": "INTERNAL_ERROR"
  }
}
```

**Root Cause:** The `.openapi()` method usage on Zod schemas is incompatible with Chanfana's validation

**Affected Code (src/api/endpoints/books/get-by-isbn.ts:28-38):**
```typescript
request: {
  params: z.object({
    isbn: z.string()
      .regex(/^\d{10}(\d{3})?$/)
      .describe('10 or 13 digit ISBN')
      .openapi({                          // ⚠️ This might be causing the issue
        param: {
          name: 'isbn',
          in: 'path',
        },
        example: '9780439708180',
      }),
  }),
},
```

**Hypothesis:** Chanfana uses `zod-to-openapi` which handles `.openapi()` differently than expected. The `param` object might be interfering with Zod's `_parse` method.

---

## 🔍 Next Steps

### 1. Remove `.openapi()` Param Metadata
Try removing the `param` object from `.openapi()` calls:

```typescript
// Before
isbn: z.string()
  .regex(/^\d{10}(\d{3})?$/)
  .describe('10 or 13 digit ISBN')
  .openapi({
    param: { name: 'isbn', in: 'path' },  // ❌ Remove this
    example: '9780439708180',
  })

// After
isbn: z.string()
  .regex(/^\d{10}(\d{3})?$/)
  .describe('10 or 13 digit ISBN')
  .openapi({ example: '9780439708180' })  // ✅ Keep only example
```

### 2. Test Minimal Schema
If that doesn't work, try removing `.openapi()` entirely for path params:

```typescript
params: z.object({
  isbn: z.string()
    .regex(/^\d{10}(\d{3})?$/)
    .describe('10 or 13 digit ISBN'),
})
```

### 3. Check Chanfana Documentation
Review https://chanfana.pages.dev/endpoints/parameters for the correct way to define path parameters with OpenAPI metadata.

---

## 📊 Progress Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Route Registration | ✅ FIXED | All 6 v3 routes register successfully |
| Swagger UI | ✅ WORKING | https://api.oooefam.net/v3/docs loads |
| OpenAPI JSON | ⚠️ PARTIAL | /v3/openapi.json still returns 500 (schema error) |
| Actual Endpoints | ⚠️ BLOCKED | Routed correctly, but Zod validation fails |
| iOS Handoff | ✅ DELIVERED | Hand-crafted spec in docs/openapi-v3.json |

---

## 🎯 Success Criteria

- [x] V3 routes register in Hono/Chanfana
- [x] /v3/docs Swagger UI loads
- [x] Routes return non-404 responses
- [ ] Endpoint validation works correctly
- [ ] /v3/openapi.json auto-generation works
- [ ] iOS can successfully call v3 endpoints

---

## 📝 Files Modified

1. `src/api/index.ts` - Removed `base` option, added full paths to route registration
2. `src/router.ts` - No changes needed (mountV3API() works correctly)
3. `docs/openapi-v3.json` - Hand-crafted OpenAPI spec for iOS team (temporary workaround)
4. `docs/V3_OPENAPI_DELIVERED.md` - Documentation of delivery to iOS team

---

**Last Updated:** December 2, 2025, 3:51 AM UTC
**Next Action:** Fix Zod schema `.openapi()` usage to resolve validation error
**Priority:** P0 - Blocking iOS v3 API migration
