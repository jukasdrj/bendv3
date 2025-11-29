# BooksTrack Backend - Alexandria Integration Plan

**Created**: November 28, 2025
**Purpose**: Add Alexandria (local OpenLibrary dump) as a FREE priority provider for book data.

---

## 🎯 Goal

Replace expensive/rate-limited external API calls with your self-hosted Alexandria database:
- **49.3M ISBNs** available locally
- **Zero API costs**
- **No rate limits**
- **Sub-100ms response times**

---

## 📊 Current Provider Architecture

```
bendv3 Orchestration Layer
├── Google Books API (requires API key)
├── OpenLibrary API (remote - rate limited)
└── ISBNdb API (requires API key, $)
```

**After Integration**:
```
bendv3 Orchestration Layer
├── Alexandria (LOCAL - FREE, FAST) ← NEW PRIMARY
├── Google Books API (fallback)
├── OpenLibrary API (fallback)
└── ISBNdb API (enrichment only)
```

---

## 🚀 Implementation Plan

### Phase 1: Add Alexandria Provider

#### 1.1 Create Alexandria Normalizer
**File**: `src/services/normalizers/alexandria.ts`

```typescript
/**
 * Alexandria (Local OpenLibrary) → Canonical DTO Normalizers
 */
import type { WorkDTO, EditionDTO, AuthorDTO } from "../../types/canonical.js";
import { GenreNormalizer } from "../genre-normalizer.js";
import { getPlaceholderCover } from "../../utils/book-metadata.js";
import { extractYear } from "../../utils/date-utils.js";

const genreNormalizer = new GenreNormalizer();

export function normalizeAlexandriaToWork(result: any): WorkDTO {
  return {
    title: result.title || "Unknown",
    subjectTags: [], // Alexandria doesn't return subjects yet
    coverImageURL: result.openlibrary_edition 
      ? `https://covers.openlibrary.org/b/olid/${extractOLID(result.openlibrary_edition)}-L.jpg`
      : getPlaceholderCover(),
    firstPublicationYear: extractYear(result.publish_date),
    synthetic: false,
    primaryProvider: "alexandria",
    contributors: ["alexandria"],
    openLibraryWorkID: extractOLID(result.openlibrary_work),
    goodreadsWorkIDs: [],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [],
    isbndbQuality: 0,
    reviewStatus: "verified",
  };
}

export function normalizeAlexandriaToEdition(result: any): EditionDTO {
  return {
    isbn: result.isbn,
    isbns: [result.isbn].filter(Boolean),
    title: result.title,
    publisher: result.publishers?.[0],
    publicationDate: result.publish_date,
    pageCount: result.pages ? parseInt(result.pages) : undefined,
    format: "Paperback",
    coverImageURL: result.openlibrary_edition
      ? `https://covers.openlibrary.org/b/olid/${extractOLID(result.openlibrary_edition)}-L.jpg`
      : getPlaceholderCover(),
    primaryProvider: "alexandria",
    contributors: ["alexandria"],
    openLibraryEditionID: extractOLID(result.openlibrary_edition),
    amazonASINs: [],
    googleBooksVolumeIDs: [],
    librarythingIDs: [],
    isbndbQuality: 0,
  };
}

export function normalizeAlexandriaToAuthor(authorName: string): AuthorDTO {
  return {
    name: authorName,
    gender: "Unknown",
  };
}

function extractOLID(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/(OL\w+)/);
  return match ? match[1] : undefined;
}
```

#### 1.2 Create Alexandria API Service
**File**: `src/services/alexandria-api.ts`

```typescript
/**
 * Alexandria API Client
 * Connects to local OpenLibrary PostgreSQL dump via Cloudflare Worker
 */

import type { WorkDTO, EditionDTO, AuthorDTO } from "../types/canonical.js";
import { 
  normalizeAlexandriaToWork,
  normalizeAlexandriaToEdition,
  normalizeAlexandriaToAuthor 
} from "./normalizers/alexandria.js";
import { withCircuitBreaker } from "./circuit-breaker.js";
import { createCacheService } from "./cache-service.js";
import { getCacheTTL } from "../config/cache-ttl.js";

const ALEXANDRIA_BASE_URL = "https://alexandria.ooheynerds.com";
const ALEXANDRIA_USER_AGENT = "BooksTracker/1.0 (nerd@ooheynerds.com) AlexandriaClient/1.0.0";

export interface AlexandriaEnv {
  CACHE?: KVNamespace;
  CACHE_HOT_TTL?: string;
  CACHE_COLD_TTL?: string;
}

export interface NormalizedResponse {
  works: WorkDTO[];
  editions: EditionDTO[];
  authors: AuthorDTO[];
}

/**
 * Search Alexandria by ISBN (primary use case)
 */
export async function searchAlexandriaByISBN(
  isbn: string,
  env: AlexandriaEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  const kvNamespace = env.CACHE;
  
  if (!kvNamespace || !ctx) {
    return withCircuitBreaker('alexandria', env, () => 
      searchAlexandriaByISBN_Uncached(isbn)
    );
  }

  const cache = createCacheService(kvNamespace, 'alex', env, ctx);
  const cacheKey = `isbn:${isbn.replace(/-/g, '')}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    console.log(`📦 Cache HIT: Alexandria ISBN ${isbn}`);
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Cache parse error for Alexandria ISBN ${isbn}:`, error);
    }
  }

  console.log(`🌐 Cache MISS: Fetching ISBN ${isbn} from Alexandria`);
  const result = await withCircuitBreaker('alexandria', env, () => 
    searchAlexandriaByISBN_Uncached(isbn)
  );

  if (result && result.works.length > 0) {
    const hotTtl = getCacheTTL('hot', env);
    const coldTtl = getCacheTTL('cold', env);
    await cache.put(cacheKey, JSON.stringify(result), hotTtl, coldTtl);
  }

  return result;
}

async function searchAlexandriaByISBN_Uncached(isbn: string): Promise<NormalizedResponse | null> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(
      `${ALEXANDRIA_BASE_URL}/api/isbn?isbn=${encodeURIComponent(isbn)}`,
      {
        headers: {
          "User-Agent": ALEXANDRIA_USER_AGENT,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // ISBN not found in Alexandria
      }
      throw new Error(`Alexandria API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }

    const works: WorkDTO[] = [];
    const editions: EditionDTO[] = [];
    const authorsMap = new Map<string, AuthorDTO>();

    for (const result of data.results) {
      const work = normalizeAlexandriaToWork(result);
      const edition = normalizeAlexandriaToEdition(result);
      
      if (result.author) {
        const author = normalizeAlexandriaToAuthor(result.author);
        if (!authorsMap.has(author.name)) {
          authorsMap.set(author.name, author);
        }
        (work as any).authors = [author];
      }

      works.push(work);
      editions.push(edition);
    }

    console.log(`✅ Alexandria ISBN lookup: ${isbn} (${Date.now() - startTime}ms)`);

    return {
      works,
      editions,
      authors: Array.from(authorsMap.values()),
    };
  } catch (error) {
    console.error(`❌ Alexandria API error for ISBN ${isbn}:`, error);
    throw error;
  }
}

/**
 * Search Alexandria by title (requires Alexandria Phase 3)
 * TODO: Implement after Alexandria adds /api/search endpoint
 */
export async function searchAlexandria(
  query: string,
  params: { maxResults?: number } = {},
  env: AlexandriaEnv,
  ctx?: ExecutionContext,
): Promise<NormalizedResponse | null> {
  // TODO: Implement when Alexandria adds title/author search
  console.warn("Alexandria title/author search not yet implemented");
  return null;
}
```

#### 1.3 Add Alexandria to Circuit Breaker
**File**: `src/services/circuit-breaker.ts`

Add `'alexandria'` to the provider types and circuit breaker configuration.

#### 1.4 Update External APIs Orchestration
**File**: `src/services/external-apis.ts`

Add Alexandria as priority provider:

```typescript
import { searchAlexandriaByISBN } from "./alexandria-api.js";

// In searchByISBN function, try Alexandria FIRST:
export async function searchByISBN(isbn: string, env: ExternalAPIEnv, ctx?: ExecutionContext) {
  // 1. Try Alexandria first (local, free, fast)
  try {
    const alexandriaResult = await searchAlexandriaByISBN(isbn, env, ctx);
    if (alexandriaResult && alexandriaResult.works.length > 0) {
      console.log(`✅ ISBN ${isbn} found in Alexandria (local)`);
      return alexandriaResult;
    }
  } catch (error) {
    console.warn(`⚠️ Alexandria failed, falling back to other providers:`, error);
  }

  // 2. Fallback to Google Books
  const googleResult = await searchGoogleBooksByISBN(isbn, env, ctx);
  if (googleResult && googleResult.works.length > 0) {
    return googleResult;
  }

  // 3. Fallback to remote OpenLibrary
  // ... existing logic
}
```

---

### Phase 2: Environment Configuration

#### 2.1 Add Feature Flag
**File**: `wrangler.jsonc`

```jsonc
{
  "vars": {
    // Alexandria Integration (local OpenLibrary)
    "ENABLE_ALEXANDRIA_PROVIDER": "true",
    "ALEXANDRIA_BASE_URL": "https://alexandria.ooheynerds.com",
    "ALEXANDRIA_PRIORITY": "1" // 1 = first, 2 = second, etc.
  }
}
```

#### 2.2 Add to Provider Enum
**File**: `src/types/enums.ts`

```typescript
export type DataProvider = 
  | "alexandria"    // NEW - local OpenLibrary
  | "google-books" 
  | "openlibrary" 
  | "isbndb"
  | "wikidata";
```

---

### Phase 3: Testing & Validation

#### 3.1 Create Test Suite
**File**: `tests/services/alexandria-api.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { searchAlexandriaByISBN } from '../../src/services/alexandria-api';

describe('Alexandria API', () => {
  it('should return normalized work/edition for valid ISBN', async () => {
    const result = await searchAlexandriaByISBN('9780439064873', mockEnv);
    
    expect(result).not.toBeNull();
    expect(result?.works[0].title).toBe('Harry Potter and the Chamber of Secrets');
    expect(result?.works[0].primaryProvider).toBe('alexandria');
  });

  it('should return null for unknown ISBN', async () => {
    const result = await searchAlexandriaByISBN('0000000000', mockEnv);
    expect(result).toBeNull();
  });

  it('should fallback gracefully when Alexandria is down', async () => {
    // Mock Alexandria circuit breaker open
    // Verify fallback to Google Books works
  });
});
```

#### 3.2 Integration Test
```bash
# Test Alexandria directly
curl "https://alexandria.ooheynerds.com/api/isbn?isbn=9780439064873"

# Test via bendv3 (after deployment)
curl "https://api.oooefam.net/api/v2/book/isbn/9780439064873"
# Should return provider: "alexandria" in metadata
```

---

### Phase 4: Monitoring & Analytics

#### 4.1 Add Provider Metrics
Track Alexandria usage vs other providers:

```typescript
// In searchByISBN function
analyticsEngine.log({
  event: 'isbn_lookup',
  provider: 'alexandria',
  success: true,
  latency_ms: Date.now() - startTime,
  isbn: isbn,
});
```

#### 4.2 Create Dashboard Query
```sql
-- Alexandria vs other providers usage
SELECT 
  provider,
  COUNT(*) as requests,
  AVG(latency_ms) as avg_latency,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes
FROM isbn_lookups
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY requests DESC;
```

---

## 📝 Task Checklist

### Week 1: Core Integration
- [ ] Create `src/services/normalizers/alexandria.ts`
- [ ] Create `src/services/alexandria-api.ts`
- [ ] Add 'alexandria' to circuit breaker providers
- [ ] Add 'alexandria' to DataProvider enum
- [ ] Update wrangler.jsonc with feature flags

### Week 2: Orchestration Update
- [ ] Update `external-apis.ts` to try Alexandria first
- [ ] Add graceful fallback to Google Books/OpenLibrary
- [ ] Test with various ISBNs (found, not found, error)
- [ ] Verify response format matches iOS expectations

### Week 3: Testing & Deployment
- [ ] Write unit tests for Alexandria normalizers
- [ ] Write integration tests
- [ ] Deploy to staging
- [ ] Monitor error rates and latency
- [ ] Deploy to production

### Week 4: Optimization
- [ ] Analyze cache hit rates
- [ ] Compare latency: Alexandria vs Google Books
- [ ] Track cost savings (API calls avoided)
- [ ] Document provider priority logic

---

## 🔮 Future Enhancements

### When Alexandria Adds Title/Author Search
1. Implement `searchAlexandria()` function
2. Add to title/author search orchestration
3. Update fallback logic

### When Alexandria Adds Batch API
1. Implement batch ISBN lookup
2. Use for CSV import optimization
3. Parallelize with other providers

### Custom Enrichment Pipeline
1. Store enriched data in Alexandria's `local_enrichment` table
2. Create sync from bendv3 → Alexandria for covers, page counts
3. Build feedback loop: user corrections → local storage

---

## 📚 Related Files

- Alexandria TODO: `/Users/juju/dev_repos/alex/TODO-ALEXANDRIA-INTEGRATION.md`
- External APIs: `/Users/juju/dev_repos/bendv3/src/services/external-apis.ts`
- Normalizers: `/Users/juju/dev_repos/bendv3/src/services/normalizers/`
- Circuit Breaker: `/Users/juju/dev_repos/bendv3/src/services/circuit-breaker.ts`
- API Contract: `/Users/juju/dev_repos/bendv3/docs/API_CONTRACT.md`

---

## ✅ Success Metrics

- [ ] 80%+ ISBN lookups served by Alexandria
- [ ] <100ms p95 latency for Alexandria lookups
- [ ] Zero Google Books API costs for ISBN lookups
- [ ] Graceful fallback when Alexandria unavailable
- [ ] Provider metadata correctly attributed in responses

---

**Priority**: HIGH - This enables a completely free, self-hosted book data API!
