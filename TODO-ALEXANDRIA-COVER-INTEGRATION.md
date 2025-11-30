# Cover Image Integration with Alexandria

**Sprint Goal:** Integrate Alexandria's cover processing service into bendv3 book metadata flow  
**Time Estimate:** 2-3 hours  
**Status:** 🟡 Ready to Execute (Requires alex deployment first)  
**Owner:** bendv3 Backend Team

---

## 🎯 Objective

Replace bendv3's direct R2 cover handling with calls to Alexandria's cover processing endpoints. This moves cover image processing to Alexandria (pure book metadata layer) while bendv3 focuses on user data and AI features.

**Key Principles:**
- Alexandria handles cover processing (download, compress, store)
- bendv3 orchestrates the workflow (user requests → Alexandria → cache results)
- Worker-to-worker auth using existing CF-Access service tokens
- Maintain sub-100ms response times for cached covers
- Graceful fallbacks if Alexandria is unavailable

---

## 📋 Prerequisites

- [x] Alexandria deployed at `alexandria.ooheynerds.com`
- [x] CF-Access service token configured (ID: 7fbfd3c70cafed...access)
- [ ] Alexandria cover processing endpoints deployed
  - POST /api/covers/process
  - GET /api/covers/{work_key}/{size}

---

## 🏗️ Architecture

**Before (Current):**
```
bendv3 book-service.ts
    ↓
Direct R2 access (BOOK_COVERS bucket)
    ↓
Store cover images
    ↓
Return R2 URLs to client
```

**After (Target):**
```
bendv3 book-service.ts
    ↓ POST /api/covers/process
    ↓ { work_key, provider_url, isbn }
Alexandria Worker
    ↓ Process cover (download, compress, store)
    ↓ Return CDN URLs
bendv3 receives URLs
    ↓ Cache in D1/KV
    ↓ Return to client
```

---

## 📝 Implementation Steps

### Step 1: Create Alexandria Cover Service Module

**Duration:** 30 minutes  
**Status:** ⬜ Not started

#### 1.1 Create new service module for Alexandria cover integration
**File:** `/Users/juju/dev_repos/bendv3/src/services/alexandria-cover-service.ts`

```typescript
/**
 * Alexandria Cover Service - Integration layer for cover image processing
 * 
 * Handles:
 * - Sending cover URLs to Alexandria for processing
 * - Worker-to-worker authentication
 * - Error handling and fallbacks
 * - Response caching
 */

const ALEXANDRIA_BASE_URL = 'https://alexandria.ooheynerds.com';

interface CoverProcessingRequest {
  work_key: string;
  provider_url: string;
  isbn?: string;
}

interface CoverProcessingResponse {
  success: boolean;
  urls: {
    large: string;
    medium: string;
    small: string;
  };
  metadata?: {
    processedAt: string;
    originalSize: number;
    r2Key: string;
    sourceUrl: string;
    workKey: string;
  };
  error?: string;
}

/**
 * Send cover URL to Alexandria for processing
 * 
 * @param request - Cover processing request
 * @param env - Cloudflare environment bindings
 * @returns Processed cover URLs or placeholder on error
 */
export async function processBookCover(
  request: CoverProcessingRequest,
  env: any
): Promise<CoverProcessingResponse> {
  try {
    console.log(`[AlexandriaCover] Processing cover for ${request.work_key}`);

    // Get CF-Access service token from Worker secrets
    const cfAccessToken = env.CF_ACCESS_SERVICE_TOKEN;

    if (!cfAccessToken) {
      console.error('[AlexandriaCover] Missing CF_ACCESS_SERVICE_TOKEN');
      throw new Error('Authentication configuration missing');
    }

    // Call Alexandria cover processing endpoint
    const response = await fetch(`${ALEXANDRIA_BASE_URL}/api/covers/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessToken.split(':')[0],
        'CF-Access-Client-Secret': cfAccessToken.split(':')[1],
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[AlexandriaCover] Processing failed: ${response.status}`, data);
      throw new Error(data.error || 'Cover processing failed');
    }

    console.log(`[AlexandriaCover] ✅ Cover processed successfully for ${request.work_key}`);

    return data;

  } catch (error) {
    console.error('[AlexandriaCover] Error:', error);

    // Return placeholder URLs on error
    const PLACEHOLDER_COVER = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover';

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      urls: {
        large: PLACEHOLDER_COVER,
        medium: PLACEHOLDER_COVER,
        small: PLACEHOLDER_COVER,
      },
    };
  }
}

/**
 * Get cover URLs from multiple providers and select the best one
 * 
 * Priority: ISBNdb > Google Books (large) > OpenLibrary > Placeholder
 * 
 * @param providers - Provider data from enrichment
 * @returns Best cover URL and source
 */
export function selectBestCoverURL(providers: {
  isbndb?: any;
  googleBooks?: any;
  openLibrary?: any;
  alexandria?: any;
}): { url: string; source: string; quality: 'high' | 'medium' | 'low' | 'missing' } {
  const PLACEHOLDER_COVER = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover';

  // ISBNdb has highest quality
  if (providers.isbndb?.image) {
    return { url: providers.isbndb.image, source: 'isbndb', quality: 'high' };
  }

  // Google Books with large image
  if (providers.googleBooks?.imageLinks?.large || providers.googleBooks?.imageLinks?.extraLarge) {
    const thumbnailURL = providers.googleBooks.imageLinks.thumbnail?.replace('http:', 'https:');
    if (thumbnailURL) {
      const largeURL = thumbnailURL.replace(/&zoom=\d/, '') + '&zoom=3';
      return { url: largeURL, source: 'google-books', quality: 'high' };
    }
  }

  // Alexandria (OpenLibrary backend)
  if (providers.alexandria?.openlibrary_edition) {
    const olidMatch = providers.alexandria.openlibrary_edition.match(/\/(OL\w+)/);
    if (olidMatch) {
      const olid = olidMatch[1];
      return {
        url: `https://covers.openlibrary.org/b/olid/${olid}-L.jpg`,
        source: 'alexandria',
        quality: 'medium',
      };
    }
  }

  // OpenLibrary direct
  if (providers.openLibrary?.cover_i) {
    return {
      url: `https://covers.openlibrary.org/b/id/${providers.openLibrary.cover_i}-L.jpg`,
      source: 'openlibrary',
      quality: 'medium',
    };
  }

  // Google Books thumbnail (lower quality)
  if (providers.googleBooks?.imageLinks?.thumbnail) {
    const thumbnailURL = providers.googleBooks.imageLinks.thumbnail.replace('http:', 'https:');
    const mediumURL = thumbnailURL.replace(/&zoom=\d/, '') + '&zoom=2';
    return { url: mediumURL, source: 'google-books', quality: 'low' };
  }

  // Placeholder fallback
  return { url: PLACEHOLDER_COVER, source: 'placeholder', quality: 'missing' };
}
```

---

### Step 2: Update Book Service to Use Alexandria Covers

**Duration:** 45 minutes  
**Status:** ⬜ Not started

#### 2.1 Update book-service.ts to integrate Alexandria cover processing
**File:** `/Users/juju/dev_repos/bendv3/src/services/book-service.ts`

Add imports at the top:
```typescript
import { processBookCover, selectBestCoverURL } from './alexandria-cover-service';
```

#### 2.2 Modify `findBookByISBN` to process covers via Alexandria

Find the section where BookRecord is created (around line 95) and replace the cover URL logic:

**OLD CODE:**
```typescript
coverSmallUrl: work.coverImageURL || edition?.coverImageURL || null,
coverMediumUrl: work.coverImageURL || edition?.coverImageURL || null,
coverLargeUrl: work.coverImageURL || edition?.coverImageURL || null,
```

**NEW CODE:**
```typescript
// Process cover via Alexandria
let coverURLs = {
  small: work.coverImageURL || edition?.coverImageURL || null,
  medium: work.coverImageURL || edition?.coverImageURL || null,
  large: work.coverImageURL || edition?.coverImageURL || null,
};

// If we have a work key and provider cover URL, process via Alexandria
if (work.workKey && (work.coverImageURL || edition?.coverImageURL)) {
  try {
    const providerCoverURL = work.coverImageURL || edition?.coverImageURL;
    
    const alexandriaResult = await processBookCover({
      work_key: work.workKey,
      provider_url: providerCoverURL,
      isbn: isbn,
    }, env);

    if (alexandriaResult.success) {
      coverURLs = {
        small: alexandriaResult.urls.small,
        medium: alexandriaResult.urls.medium,
        large: alexandriaResult.urls.large,
      };
      console.log(`[BookService] ✅ Cover processed via Alexandria for ${isbn}`);
    } else {
      console.warn(`[BookService] ⚠️ Alexandria cover processing failed, using provider URL`);
    }
  } catch (error) {
    console.error(`[BookService] Error processing cover via Alexandria:`, error);
    // Fall back to provider URLs
  }
}

// Use processed cover URLs in BookRecord
const bookRecord: BookRecord = {
  isbn: isbn,
  title: work.title || 'Unknown',
  subtitle: work.subtitle || null,
  description: work.description || null,
  publisher: edition?.publisher || null,
  publicationDate: edition?.publicationDate || null,
  language: edition?.language || 'en',
  pageCount: edition?.pageCount || null,
  coverSmallUrl: coverURLs.small,
  coverMediumUrl: coverURLs.medium,
  coverLargeUrl: coverURLs.large,
  canonicalMetadata: {
    works: externalResult.works,
    editions: externalResult.editions,
    authors: externalResult.authors,
  },
  providerMetadata: null,
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};
```

#### 2.3 Update `batchEnrichBooks` to process covers via Alexandria

Find the section where BookRecord is created in `batchEnrichBooks` (around line 261) and apply the same cover processing logic:

```typescript
// Process cover via Alexandria
let coverURLs = {
  small: work.coverImageURL || edition?.coverImageURL || null,
  medium: work.coverImageURL || edition?.coverImageURL || null,
  large: work.coverImageURL || edition?.coverImageURL || null,
};

if (work.workKey && (work.coverImageURL || edition?.coverImageURL)) {
  try {
    const providerCoverURL = work.coverImageURL || edition?.coverImageURL;
    
    const alexandriaResult = await processBookCover({
      work_key: work.workKey,
      provider_url: providerCoverURL,
      isbn: isbn,
    }, env);

    if (alexandriaResult.success) {
      coverURLs = {
        small: alexandriaResult.urls.small,
        medium: alexandriaResult.urls.medium,
        large: alexandriaResult.urls.large,
      };
    }
  } catch (error) {
    console.error(`[BookService] Error processing cover via Alexandria:`, error);
  }
}

const bookRecord: BookRecord = {
  isbn: isbn,
  title: work.title || 'Unknown',
  subtitle: work.subtitle || null,
  description: work.description || null,
  publisher: edition?.publisher || null,
  publicationDate: edition?.publicationDate || null,
  language: edition?.language || 'en',
  pageCount: edition?.pageCount || null,
  coverSmallUrl: coverURLs.small,
  coverMediumUrl: coverURLs.medium,
  coverLargeUrl: coverURLs.large,
  canonicalMetadata: {
    works: externalResult.works,
    editions: externalResult.editions,
    authors: externalResult.authors,
  },
  providerMetadata: null,
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};
```

---

### Step 3: Configure Worker Secrets for Authentication

**Duration:** 10 minutes  
**Status:** ⬜ Not started

#### 3.1 Store CF-Access service token in Worker secrets

The CF-Access service token is already configured in Alexandria, but we need to make sure bendv3 has access to it.

**Option A: Use existing secrets store (Recommended)**

Add to wrangler.jsonc:
```jsonc
{
  "secrets_store_secrets": [
    {
      "binding": "CF_ACCESS_SERVICE_TOKEN",
      "store_id": "b0562ac16fde468c8af12717a6c88400",
      "secret_name": "CF_ACCESS_ALEXANDRIA_SERVICE_TOKEN"
    }
  ]
}
```

**Option B: Set as regular Worker secret**

```bash
cd /Users/juju/dev_repos/bendv3
echo "7fbfd3c70cafed...access:SECRET_VALUE_HERE" | npx wrangler secret put CF_ACCESS_SERVICE_TOKEN
```

#### 3.2 Verify secret is accessible
Add a test endpoint to verify the token is configured:

```typescript
// In src/index.js or appropriate router file
app.get('/debug/cf-access-test', async (c) => {
  const token = c.env.CF_ACCESS_SERVICE_TOKEN;
  
  if (!token) {
    return c.json({ error: 'CF_ACCESS_SERVICE_TOKEN not configured' }, 500);
  }

  return c.json({
    configured: true,
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 10) + '...',
  });
});
```

Test:
```bash
curl https://api.oooefam.net/debug/cf-access-test
```

---

### Step 4: Update Error Handling and Fallbacks

**Duration:** 20 minutes  
**Status:** ⬜ Not started

#### 4.1 Add timeout handling for Alexandria requests

Update `alexandria-cover-service.ts` to add timeout:

```typescript
export async function processBookCover(
  request: CoverProcessingRequest,
  env: any
): Promise<CoverProcessingResponse> {
  try {
    console.log(`[AlexandriaCover] Processing cover for ${request.work_key}`);

    const cfAccessToken = env.CF_ACCESS_SERVICE_TOKEN;

    if (!cfAccessToken) {
      console.error('[AlexandriaCover] Missing CF_ACCESS_SERVICE_TOKEN');
      throw new Error('Authentication configuration missing');
    }

    // Add timeout controller (5 second timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${ALEXANDRIA_BASE_URL}/api/covers/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': cfAccessToken.split(':')[0],
          'CF-Access-Client-Secret': cfAccessToken.split(':')[1],
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        console.error(`[AlexandriaCover] Processing failed: ${response.status}`, data);
        throw new Error(data.error || 'Cover processing failed');
      }

      console.log(`[AlexandriaCover] ✅ Cover processed successfully for ${request.work_key}`);

      return data;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Alexandria timeout (>5s)');
      }
      
      throw error;
    }

  } catch (error) {
    console.error('[AlexandriaCover] Error:', error);

    const PLACEHOLDER_COVER = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover';

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      urls: {
        large: PLACEHOLDER_COVER,
        medium: PLACEHOLDER_COVER,
        small: PLACEHOLDER_COVER,
      },
    };
  }
}
```

#### 4.2 Add retry logic for transient failures

Add a retry wrapper function:

```typescript
/**
 * Retry wrapper for Alexandria cover processing
 * 
 * @param request - Cover processing request
 * @param env - Cloudflare environment bindings
 * @param maxRetries - Maximum retry attempts (default: 2)
 * @returns Cover processing response
 */
async function processBookCoverWithRetry(
  request: CoverProcessingRequest,
  env: any,
  maxRetries = 2
): Promise<CoverProcessingResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await processBookCover(request, env);
      
      if (result.success) {
        return result;
      }

      // If Alexandria returned an error response, don't retry
      if (result.error?.includes('Domain not allowed')) {
        console.log(`[AlexandriaCover] Not retrying - domain error`);
        return result;
      }

      lastError = new Error(result.error || 'Unknown error');

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`[AlexandriaCover] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, lastError);

      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed, return placeholder
  console.error(`[AlexandriaCover] All retries failed:`, lastError);

  const PLACEHOLDER_COVER = 'https://placehold.co/300x450/e0e0e0/666666?text=No+Cover';

  return {
    success: false,
    error: lastError?.message || 'All retries failed',
    urls: {
      large: PLACEHOLDER_COVER,
      medium: PLACEHOLDER_COVER,
      small: PLACEHOLDER_COVER,
    },
  };
}

// Export the retry wrapper instead
export { processBookCoverWithRetry as processBookCover };
```

---

### Step 5: Update TypeScript Types

**Duration:** 10 minutes  
**Status:** ⬜ Not started

#### 5.1 Update BookRecord type definition
**File:** `/Users/juju/dev_repos/bendv3/src/types/database.ts`

Ensure BookRecord has the cover URL fields:

```typescript
export interface BookRecord {
  isbn: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  publicationDate: string | null;
  language: string;
  pageCount: number | null;
  coverSmallUrl: string | null;   // Alexandria processed URL
  coverMediumUrl: string | null;  // Alexandria processed URL
  coverLargeUrl: string | null;   // Alexandria processed URL
  canonicalMetadata: CanonicalMetadata;
  providerMetadata: any | null;
  createdAt: number;
  updatedAt: number;
}
```

---

### Step 6: Deploy and Test

**Duration:** 30 minutes  
**Status:** ⬜ Not started

#### 6.1 Deploy to production
```bash
cd /Users/juju/dev_repos/bendv3
npx wrangler deploy
```

#### 6.2 Test ISBN search with cover processing
```bash
# Test ISBN search (should trigger Alexandria cover processing)
curl -X GET "https://api.oooefam.net/v1/search/isbn?isbn=9780439064873" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN"

# Expected response should include Alexandria-processed cover URLs:
# {
#   "works": [{
#     "coverImageURL": "https://covers.alexandria.ooheynerds.com/OL45804W/large.webp"
#   }]
# }
```

#### 6.3 Test error handling
```bash
# Test with invalid ISBN (should return placeholder)
curl -X GET "https://api.oooefam.net/v1/search/isbn?isbn=9999999999999" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN"

# Expected: Placeholder cover URL
```

#### 6.4 Monitor logs for Alexandria integration
```bash
npx wrangler tail --format pretty

# Look for:
# [AlexandriaCover] Processing cover for /works/OL45804W
# [AlexandriaCover] ✅ Cover processed successfully for /works/OL45804W
# [BookService] ✅ Cover processed via Alexandria for 9780439064873
```

---

## 🎯 Success Criteria

- [ ] `alexandria-cover-service.ts` module created and exported
- [ ] `book-service.ts` updated to use Alexandria cover processing
- [ ] CF-Access service token configured and accessible
- [ ] Timeout and retry logic implemented
- [ ] Error handling returns placeholder covers
- [ ] TypeScript types updated
- [ ] Deployed to production
- [ ] ISBN searches return Alexandria-processed cover URLs
- [ ] Error cases handled gracefully (invalid ISBN, Alexandria timeout, etc.)
- [ ] Response times < 150ms (cached), < 500ms (first time with Alexandria processing)
- [ ] All existing tests still passing

---

## 📊 Performance Targets

| Operation | Target Latency | Notes |
|-----------|----------------|-------|
| ISBN search (cached cover) | < 150ms | D1 cache hit, no Alexandria call |
| ISBN search (new cover) | < 500ms | Alexandria processing included |
| Batch enrichment (10 books) | < 2s | Parallel Alexandria processing |

---

## 🔍 Monitoring

After deployment, monitor:
- Alexandria cover processing success rate (target: 95%+)
- Alexandria response time (target: p95 < 500ms)
- Fallback to placeholder rate (target: < 5%)
- Worker-to-worker auth failures (target: 0%)
- Overall ISBN search latency

---

## 🚨 Rollback Plan

If anything goes wrong:

1. **Quick rollback** - Remove Alexandria cover processing:

**File:** `/Users/juju/dev_repos/bendv3/src/services/book-service.ts`

Comment out Alexandria cover processing and revert to original logic:

```typescript
// OLD (Rollback) CODE:
coverSmallUrl: work.coverImageURL || edition?.coverImageURL || null,
coverMediumUrl: work.coverImageURL || edition?.coverImageURL || null,
coverLargeUrl: work.coverImageURL || edition?.coverImageURL || null,
```

2. Deploy:
```bash
npx wrangler deploy
```

3. Verify rollback:
```bash
curl https://api.oooefam.net/v1/search/isbn?isbn=9780439064873
# Should return provider cover URLs (not Alexandria CDN)
```

---

## 📚 References

- Alexandria TODO-COVER-PROCESSING.md (implementation guide)
- COVER_IMAGE_PORTING_GUIDE.md (comprehensive reference)
- CF-Access documentation: https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/
- Worker-to-Worker auth: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

---

## 📋 Dependencies

**Blocking:**
- Alexandria cover processing endpoints must be deployed first

**Non-blocking:**
- Existing book search functionality continues to work
- Covers fallback to provider URLs if Alexandria is unavailable

---

## ✅ Definition of Done

- [ ] All implementation steps completed
- [ ] All tests passing
- [ ] Deployed to production
- [ ] Alexandria integration working
- [ ] Performance metrics within targets
- [ ] Error handling validated
- [ ] Monitoring dashboards updated
- [ ] Documentation updated
- [ ] Rollback plan tested
- [ ] Team handoff complete

---

**Ready to execute:** 🟡 Waiting on Alexandria deployment  
**Blocking issues:** Alexandria cover endpoints not yet deployed  
**Next steps:** Wait for Alexandria TODO-COVER-PROCESSING.md completion, then execute Step 1
