# External ID Resolution Integration

**Status:** ✅ Implemented (January 8, 2026)
**Alexandria Version:** v2.3.0+
**BendV3 Version:** v3.4.0+

---

## Overview

BendV3 now integrates with Alexandria's External ID Resolution API (v2.3.0) to support Amazon ASIN → ISBN resolution for user book imports. This enables users to import books from Amazon wishlists or reading lists using only the ASIN identifier.

## Architecture

### Thin Client Pattern
- **Primary Resolution:** Alexandria RPC (sub-millisecond latency via Service Binding)
- **Caching:** KV cache with 7-day TTL for stable mappings
- **Fallback:** Graceful degradation (returns empty result, allows caller to handle)

### Integration Flow
```
User Import (ASIN) → resolveAndEnrichAsin() → resolveAsinToIsbn() → Alexandria RPC
                                                                    ↓
                                                              KV Cache Check
                                                                    ↓
                                                    GET /api/resolve/amazon/{asin}?type=edition
                                                                    ↓
                                                          Alexandria Crosswalk
                                                        (Lazy Backfill if needed)
                                                                    ↓
                                                            Cache Result (7d TTL)
                                                                    ↓
                                                            Return ISBN + Confidence
                                                                    ↓
findBookByISBN() → Enrichment Pipeline → Cache (KV/D1) → Return Book Metadata
```

---

## Implementation

### 1. New Functions

#### `resolveAsinToIsbn()` (`src/services/enrichment.ts`)
```typescript
export async function resolveAsinToIsbn(
  asin: string,
  env: Env,
  ctx?: ExecutionContext
): Promise<{ isbn: string | null; confidence: number; cached?: boolean }>
```

**Purpose:** Resolve Amazon ASIN to ISBN using Alexandria's External ID Resolution API

**Performance:**
- Cache hit: <1ms (KV lookup)
- Cache miss: 10-15ms (Alexandria lazy backfill)
- Expected hit rate: 95%+ after 30 days

**Error Handling:**
- Soft errors (returns `null` ISBN)
- Confidence threshold: <50% returns null
- Allows caller to decide fallback strategy

#### `resolveAndEnrichAsin()` (`src/services/book-service.ts`)
```typescript
export async function resolveAndEnrichAsin(
  asin: string,
  env: any,
  ctx?: ExecutionContext
): Promise<EnrichmentResult>
```

**Purpose:** High-level wrapper for ASIN-based book imports

**Flow:**
1. Resolve ASIN → ISBN
2. Enrich book using resolved ISBN (delegates to `findBookByISBN()`)
3. Return full book metadata or empty result

### 2. Infrastructure

#### KV Namespace: `EXTERNAL_IDS`
- **ID:** `4593d61085374820a72fd7bdc241e3a7`
- **Purpose:** Cache ASIN → ISBN mappings
- **TTL:** 7 days (stable mappings)
- **Key Format:** `asin:{asin}` → `{ isbn, confidence, ttl }`

#### Environment Binding
```typescript
// src/types/env.ts
export interface Env {
  // ...
  EXTERNAL_IDS?: KVNamespace // Alexandria v2.3.0: External ID resolution cache
}
```

### 3. Dependencies

#### NPM Package Update
```json
{
  "dependencies": {
    "alexandria-worker": "^2.3.0"
  }
}
```

**New Types Imported:**
- `ResolveExternalIdResult` - Reverse lookup response type

---

## Usage Examples

### Basic ASIN Resolution
```typescript
import { resolveAsinToIsbn } from './services/enrichment'

// Resolve ASIN to ISBN
const result = await resolveAsinToIsbn('B001234567', env)

if (result.isbn && result.confidence >= 80) {
  console.log(`High confidence: ${result.isbn}`)
  // Proceed with enrichment
} else {
  console.warn('Low confidence or failed resolution')
  // Prompt user for alternative identifier
}
```

### ASIN-Based Import
```typescript
import { resolveAndEnrichAsin } from './services/book-service'

// User imports from Amazon wishlist
const book = await resolveAndEnrichAsin('B001234567', env)

if (book.works.length > 0) {
  console.log(`Imported: ${book.works[0].title}`)
  // Add to user's library
} else {
  console.warn('Could not resolve ASIN')
  // Prompt user for ISBN or title
}
```

### Batch ASIN Resolution
```typescript
import { resolveAsinToIsbn } from './services/enrichment'

// Process multiple ASINs in parallel
const asins = ['B001234567', 'B007654321', 'B009876543']
const results = await Promise.all(
  asins.map(asin => resolveAsinToIsbn(asin, env))
)

const resolved = results.filter(r => r.isbn && r.confidence >= 80)
console.log(`Resolved: ${resolved.length}/${asins.length}`)
```

---

## Alexandria API Endpoints

### Reverse Lookup (Used by BendV3)
```
GET /api/resolve/{provider}/{id}?type={entity_type}
```

**Example:**
```bash
curl https://alexandria.ooheynerds.com/api/resolve/amazon/B001234567?type=edition
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "9780439708180",
    "entity_type": "edition",
    "confidence": 95
  },
  "meta": {
    "source": "crosswalk",
    "backfilled": false,
    "latency_ms": 2
  }
}
```

### Forward Lookup (Future Enhancement)
```
GET /api/external-ids/{entity_type}/{key}
```

**Example:**
```bash
curl https://alexandria.ooheynerds.com/api/external-ids/edition/9780439708180
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "provider": "amazon",
      "external_id": "B001234567",
      "entity_type": "edition"
    },
    {
      "provider": "goodreads",
      "external_id": "2089208",
      "entity_type": "edition"
    }
  ],
  "meta": {
    "source": "array_backfill",
    "backfilled": true,
    "latency_ms": 12
  }
}
```

---

## Performance Metrics

### Expected Performance (Alexandria Production Data)
| Metric | Target | Notes |
|--------|--------|-------|
| Crosswalk Query (P50) | 0.75ms | Direct database lookup |
| Crosswalk Query (P95) | 2ms | Cache hit on Alexandria side |
| Lazy Backfill (one-time) | 10-15ms | External API call |
| Cache Hit Rate (30 days) | 95%+ | Stable ISBN mappings |
| KV Cache TTL | 7 days | Reduce staleness risk |

### BendV3 Integration Performance
| Operation | Latency | Notes |
|-----------|---------|-------|
| KV Cache Hit | <1ms | Local KV read |
| Alexandria RPC (Service Binding) | <5ms | Internal worker-to-worker |
| Alexandria RPC (HTTPS fallback) | 50-100ms | External HTTP call |
| Full ASIN → Book Enrichment | 100-500ms | Depends on cache state |

---

## Monitoring & Observability

### Logging
All ASIN resolution operations emit structured logs:

```
[resolveAsinToIsbn] 🔍 KV cache miss for ASIN B001234567, calling Alexandria RPC
[resolveAsinToIsbn] ✅ Resolved ASIN B001234567 to ISBN 9780439708180 (confidence: 95)
[resolveAsinToIsbn] ✅ Cached resolution: B001234567 → 9780439708180
[resolveAndEnrichAsin] ✅ Enrichment complete for ASIN B001234567 → ISBN 9780439708180: 1 works found
```

### Error Scenarios
```
[resolveAsinToIsbn] ⚠️ KV cache error for B001234567: KVNamespace not available
[resolveAsinToIsbn] ⚠️ Alexandria RPC error for B001234567: 503 Service Unavailable
[resolveAsinToIsbn] ⚠️ Alexandria found no/low-confidence resolution for B001234567 (confidence: 45)
[resolveAndEnrichAsin] ⚠️ Could not resolve ASIN B001234567, enrichment skipped (confidence: 0)
```

### Metrics to Track
1. **Resolution Success Rate** - % of ASINs successfully resolved
2. **Confidence Distribution** - Histogram of confidence scores
3. **Cache Hit Rate** - KV cache effectiveness
4. **RPC Latency** - Alexandria response times (P50, P95, P99)
5. **Enrichment Success Rate** - % of resolved ISBNs successfully enriched

---

## Future Enhancements

### Phase 2: Multi-Provider Resolution
- Support Goodreads ID → ISBN
- Support OpenLibrary ID → ISBN
- Support ISBNdb ID → ISBN

### Phase 3: Forward Lookup
- Expose `GET /api/external-ids/edition/{isbn}` wrapper
- Return all known external IDs for a book
- Enable cross-platform linking in book metadata

### Phase 4: Batch Operations
- `resolveMultipleAsins()` - Parallel ASIN resolution
- `batchImportFromAmazon()` - CSV/JSON import with ASINs
- Workflow integration for large import jobs

---

## References

- **Alexandria Implementation:** [Alexandria Issue #155](https://github.com/example/alexandria/issues/155)
- **Alexandria API Docs:** [/api/docs](https://alexandria.ooheynerds.com/api/docs)
- **BendV3 Architecture:** [CLAUDE.md](../CLAUDE.md)
- **Service Bindings:** [docs/ALEXANDRIA_RPC_MIGRATION.md](ALEXANDRIA_RPC_MIGRATION.md)

---

**Last Updated:** January 8, 2026
**Maintained By:** AI Team (@jukasdrj, Claude Code, Grok)
