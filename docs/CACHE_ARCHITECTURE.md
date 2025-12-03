# BooksTrack Cache Architecture

**Version:** 3.0
**Last Updated:** December 3, 2025
**Status:** Production (73% hit rate) - Alexandria-First Architecture

## Overview

BooksTrack uses a simplified caching strategy optimized for the Alexandria-first provider architecture. With Alexandria providing 49.3M+ ISBNs at zero API cost with sub-100ms response times, the cache layer has been streamlined to focus on KV caching with reduced complexity.

### Key Changes in v3.0 (December 2025)
- **Removed:** R2 cold storage tier (replaced by Alexandria's persistent storage)
- **Removed:** Legacy cache format backward compatibility
- **Simplified:** Unified cache now uses KV-only path for book metadata
- **Deprecated:** ISBNdb harvest (Alexandria provides real-time processing)
- **Retained:** Edge cache for static assets (covers, images) only

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Request                                │
│                  (ISBN / Title / Author lookup)                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     KV CACHE (Single Tier)                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Hot TTL (Effectiveness Window: 2h)                          │  │
│  │  - Tracks cache effectiveness for TTL tuning                 │  │
│  │  - Items remain in cache after hot window expires            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Cold TTL (Content-Specific Expiration)                      │  │
│  │  - ISBN / Cover: 365 days (static content)                   │  │
│  │  - Enrichment: 180 days (stable metadata)                    │  │
│  │  - Title / Author: 7 days (new editions possible)            │  │
│  │  - Default: 14 days                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ (on miss)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               PROVIDER WATERFALL (with Circuit Breakers)             │
│                                                                       │
│  Alexandria (PRIMARY) → Google Books → OpenLibrary → ISBNdb         │
│       ↑                                                               │
│  49.3M+ ISBNs, 0 cost, <100ms                                        │
│                                                                       │
│  - Each provider protected by circuit breaker                        │
│  - 5 failures → OPEN, 60s cooldown, 2 successes → CLOSED             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 CACHE METRICS (Durable Object)                       │
│                                                                       │
│  - Hit/miss tracking per prefix                                      │
│  - Effectiveness monitoring (hot vs cold hits)                       │
│  - Analytics for optimization                                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    R2 STORAGE (Covers Only)                          │
│                                                                       │
│  - bookstrack-covers bucket (processed cover images)                 │
│  - bookshelf-images bucket (user uploads)                            │
│  - Alexandria cover service writes here                              │
│  - NOT used for book metadata caching                                │
└─────────────────────────────────────────────────────────────────────┘
```

### What Changed from v2.0
| Component | v2.0 (Before) | v3.0 (After) |
|-----------|---------------|--------------|
| **Cache Tiers** | 3 (Edge → KV → R2) | 1 (KV only for metadata) |
| **R2 Cold Storage** | Book metadata archive | Covers/images only |
| **Edge Cache** | All API responses | Static assets only |
| **Rehydration** | R2 → KV background restore | Removed |
| **Cold Index** | KV index of R2 entries | Removed |
| **ISBNdb Harvest** | Daily batch job | Deprecated (Alexandria replaces) |

---

## Cache Strategy

### Hot/Cold Two-Tier System

**Philosophy:** Separate **effectiveness tracking** (hot) from **actual expiration** (cold)

| Tier | Purpose | Default TTL | Eviction |
|------|---------|-------------|----------|
| **Hot** | Effectiveness window | 2 hours | Stays in KV, marked "cold" |
| **Cold** | Actual expiration | 14 days | Removed from KV entirely |

**How it works:**
1. Item cached with both hot (2h) and cold (14d) TTL metadata
2. After 2h, item is "cold" but still in KV
3. Cache hits within 2h = "hot" (high effectiveness)
4. Cache hits after 2h = "cold" (low effectiveness, consider increasing hot TTL)
5. After 14d, item expires from KV completely

**Benefits:**
- Track cache effectiveness without premature eviction
- Identify optimal hot TTL per content type
- Reduce external API calls for stable content

---

## Content-Specific TTLs

### Strategy: Match TTL to Content Volatility

| Content Type | TTL | Rationale |
|--------------|-----|-----------|
| **ISBN metadata** | 365 days | ISBNs never change |
| **Cover images** | 365 days | Covers don't change |
| **Enrichment data** | 180 days | Very stable metadata |
| **Title search** | 7 days | New editions occasionally |
| **Author search** | 7 days | New books occasionally |

### Configuration

**Location:** `src/config/cache-ttl.js`

```javascript
export const DEFAULT_TTL = {
  hot: 2 * 60 * 60,           // 2 hours
  cold: 14 * 24 * 60 * 60,    // 14 days
  isbn: 365 * 24 * 60 * 60,   // 365 days
  title: 7 * 24 * 60 * 60,    // 7 days
  author: 7 * 24 * 60 * 60,   // 7 days
  enrichment: 180 * 24 * 60 * 60, // 180 days
  cover: 365 * 24 * 60 * 60,  // 365 days
};
```

**Environment Overrides:**
```env
CACHE_HOT_TTL=7200           # 2 hours
CACHE_COLD_TTL=1209600       # 14 days
CACHE_TTL_ISBN=31536000      # 365 days
CACHE_TTL_TITLE=604800       # 7 days
CACHE_TTL_AUTHOR=604800      # 7 days
CACHE_TTL_ENRICHMENT=15552000 # 180 days
CACHE_TTL_COVER=31536000     # 365 days
```

---

## Cache Keys

### Naming Convention

Format: `{prefix}:{type}:{identifier}`

**Examples:**
```
book:isbn:9780451524935
book:title:1984
author:name:george-orwell
alex:isbn:9780451524935      # Alexandria provider
cover:isbn:9780451524935
enrich:isbn:9780451524935
```

**Prefix Guidelines:**
- Use lowercase
- Use colons as separators
- Include provider name for provider-specific caches
- Use deterministic identifiers (normalized ISBNs, slugified titles)

### Key Normalization

**ISBNs:**
```javascript
// Remove hyphens
const normalizedIsbn = isbn.replace(/-/g, '')
const cacheKey = `book:isbn:${normalizedIsbn}`
```

**Titles:**
```javascript
// Lowercase, trim, replace spaces with hyphens
const slug = title.toLowerCase().trim().replace(/\s+/g, '-')
const cacheKey = `book:title:${slug}`
```

---

## Cache Operations

### Reading from Cache

**Function:** `getCached(key, env, ctx)`
**Location:** `src/utils/cache.js`

```javascript
import { getCached } from '../utils/cache.js'

const cached = await getCached('book:isbn:9780451524935', env, ctx)

if (cached) {
  console.log('Cache hit:', cached.data)
  console.log('Cache age:', cached.cacheMetadata.age, 'seconds')
  console.log('Cache TTL:', cached.cacheMetadata.ttl, 'seconds')
  return cached.data
}
```

**Returns:**
```javascript
{
  data: { /* cached content */ },
  cacheMetadata: {
    hit: true,
    age: 3600,  // seconds since cached
    ttl: 86400  // original TTL
  }
}
```

**Behavior:**
- Tracks cache hit event (fire-and-forget)
- Handles both old format (direct data) and new format (with metadata)
- Returns `null` on miss
- Logs errors but doesn't throw

### Writing to Cache

**Function:** `setCached(key, value, ttl, env, ctx, hotTtl)`
**Location:** `src/utils/cache.js`

```javascript
import { setCached } from '../utils/cache.js'
import { getCacheTTL } from '../config/cache-ttl.js'

const ttl = getCacheTTL('isbn', env)
const hotTtl = getCacheTTL('hot', env)

await setCached(
  'book:isbn:9780451524935',
  bookData,
  ttl,    // 365 days
  env,
  ctx,
  hotTtl  // 2 hours
)
```

**Behavior:**
- Stores data with metadata (cachedAt, ttl)
- Sets KV expiration to `ttl` seconds
- Attaches hot TTL metadata for effectiveness tracking
- Tracks cache write event (fire-and-forget)
- Logs errors but doesn't throw

---

## Cache Metrics

### Metrics Durable Object

**Location:** `src/durable-objects/cache-metrics.js`
**Binding:** `env.CACHE_METRICS_DO`

**Tracked Events:**
- **Hit:** Cache key found in KV
- **Miss:** Cache key not found in KV
- **Write:** Data written to cache

**Event Structure:**
```javascript
{
  type: 'hit',
  prefix: 'book',
  key: 'book:isbn:9780451524935',
  timestamp: 1733177424932,
  hotTtlExpiry: 1733184624932  // optional
}
```

**Metrics Aggregation:**
- Per-prefix hit rate (book, author, cover, etc.)
- Hot vs cold effectiveness (hits within hot TTL window)
- Cache write frequency
- Total cache operations

### Accessing Metrics

```javascript
// Get cache metrics from DO
const id = env.CACHE_METRICS_DO.idFromName('cache-metrics-singleton')
const stub = env.CACHE_METRICS_DO.get(id)
const metrics = await stub.getMetrics()

console.log('Hit rate:', metrics.hitRate)
console.log('Total hits:', metrics.hits)
console.log('Total misses:', metrics.misses)
```

---

## ISBNdb Optimization Strategy

### Challenge

ISBNdb is a premium provider with rate limits (5000 requests/day) used primarily for cover harvesting.

### Current Approach

**Per-ISBN API Calls:**
```javascript
// CURRENT (inefficient)
for (const isbn of isbns) {
  const bookData = await isbndbAPI.getBook(isbn)  // 1 API call per ISBN
  await cacheISBNData(isbn, bookData)
}
```

**Problems:**
- 5000 ISBNs = 5000 API calls = full daily quota
- Only 5000 books/day max
- Rate limiting blocks further calls
- No batch efficiency

### Proposed Optimization: Batch API

**ISBNdb Batch Endpoint:**
```
POST /batch
{
  "isbns": ["9780451524935", "9780547928227", ...]
}
```

**Benefits:**
- 1 API call for up to 100 ISBNs
- 5000 API calls/day = 500,000 ISBNs/day (100x improvement)
- Bulk cache warming
- Better quota utilization

**Implementation:**
```javascript
// PROPOSED (efficient)
const batches = chunk(isbns, 100)  // 100 ISBNs per batch

for (const batch of batches) {
  const results = await isbndbAPI.getBatch(batch)  // 1 API call for 100 ISBNs

  for (const [isbn, data] of Object.entries(results)) {
    await cacheISBNData(isbn, data)
  }
}
```

**Status:** Planned (Issue #136 - closed as future work)

---

## Cache Warming Strategies

### Author-Based Warming (Implemented)

**Location:** `src/handlers/author-expansion-harvest.js`
**Trigger:** Cron `0 3 * * *` (daily 3am)

**Strategy:**
1. Identify trending/popular authors (analytics + curated lists)
2. Check existing cache coverage (skip if >50% cached)
3. Expand author to ISBN list via OpenLibrary
4. Harvest covers from ISBNdb
5. Cache ISBN metadata + cover URLs

**Benefits:**
- Proactive caching for popular content
- Improves cache hit rate
- Reduces cold path latency

**Current Limits:**
- 5-minute CPU time limit (cron/HTTP context)
- Can process ~3,000 ISBNs before timeout
- Queue consumer migration planned for 15-minute limit (Issue #147)

### User-Driven Warming

**Implicit:** Every user search/enrichment warms the cache
**Explicit:** CSV imports warm cache for user's entire library

---

## Performance Targets

### Response Times (p95/p99)

| Scenario | p95 Target | p99 Target | Current |
|----------|-----------|-------------|---------|
| **Cache hit** | < 200ms | < 350ms | ~145ms ✅ |
| **Cold path** | < 1000ms | < 1800ms | ~850ms ✅ |

### Cache Hit Rate

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Overall hit rate** | 75%+ | 73% | 🟨 Near target |
| **ISBN hit rate** | 85%+ | TBD | 📊 Need metrics |
| **Title hit rate** | 60%+ | TBD | 📊 Need metrics |

**Current Performance:**
- 73% overall cache hit rate (Nov 2025)
- 145ms p95 latency (cached)
- 850ms p95 latency (cold)

---

## Monitoring & Observability

### Analytics Engine Integration

**Dataset:** `CACHE_ANALYTICS`
**Binding:** `env.CACHE_ANALYTICS`

**Logged Events:**
```javascript
env.CACHE_ANALYTICS.writeDataPoint({
  blobs: [
    cacheKey,
    prefix,
    eventType,
    hit ? 'true' : 'false'
  ],
  doubles: [age, ttl],
  indexes: [cacheKey]
})
```

**Query Examples:**
```sql
-- Cache hit rate by prefix
SELECT
  blob2 AS prefix,
  COUNTIF(blob3 = 'hit') / COUNT(*) AS hit_rate
FROM CACHE_ANALYTICS
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY prefix;

-- Cache age distribution
SELECT
  blob2 AS prefix,
  APPROX_QUANTILES(double1, 100)[OFFSET(50)] AS median_age,
  APPROX_QUANTILES(double1, 100)[OFFSET(95)] AS p95_age
FROM CACHE_ANALYTICS
WHERE blob3 = 'hit' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY prefix;
```

### Alerts & Thresholds

**Configuration:** `wrangler.jsonc` (lines 65-75)

```jsonc
{
  "CACHE_ALERT_HIT_RATE_THRESHOLD_CRITICAL": "0.65",  // 65% (trigger alert)
  "CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING": "0.70",   // 70% (monitor)
  "CACHE_ALERT_HOT_CACHE_THRESHOLD_CRITICAL": "0.80", // 80% hot effectiveness
  "CACHE_ALERT_HOT_CACHE_THRESHOLD_WARNING": "0.85",  // 85% hot effectiveness
  "CACHE_ALERT_DROP_THRESHOLD_CRITICAL": "0.15",      // 15% sudden drop
  "CACHE_ALERT_DROP_THRESHOLD_WARNING": "0.10",       // 10% sudden drop
  "ALERT_FROM_EMAIL": "alerts@bookstrack.com",
  "ALERT_TO_EMAIL": "ops@bookstrack.com"
}
```

**Alert Types:**
1. **Low Hit Rate:** Overall hit rate < 65%
2. **Hot Cache Ineffective:** Hot cache hit rate < 80%
3. **Sudden Drop:** Hit rate drops > 15% in 1 hour

---

## Troubleshooting

### Low Cache Hit Rate

**Symptoms:**
- Cache hit rate < 65%
- Increased external API costs
- Slower response times

**Diagnosis:**
1. Check cache metrics by prefix
```bash
wrangler tail --format pretty | grep "Cache"
```

2. Inspect top missed keys
```javascript
const metrics = await stub.getMetrics()
console.log('Top missed prefixes:', metrics.missedPrefixes)
```

3. Analyze TTL effectiveness
```javascript
// Check if items expire before reuse
const hotEffectiveness = metrics.hotHits / (metrics.hotHits + metrics.coldHits)
console.log('Hot effectiveness:', hotEffectiveness)
```

**Solutions:**
- Increase TTL for stable content types
- Implement cache warming for popular content
- Review key normalization (ensure consistency)
- Check KV namespace quotas (10M ops/day free tier)

### Cache Write Failures

**Symptoms:**
- "Cache write error" logs
- Cache misses for recently cached items

**Diagnosis:**
1. Check KV quota
```bash
wrangler kv:key list --binding CACHE | wc -l
```

2. Check value size (max 25MB per key)
```javascript
const size = new Blob([JSON.stringify(value)]).size
console.log('Cache value size:', size, 'bytes')
```

3. Check network connectivity

**Solutions:**
- Verify KV namespace binding in wrangler.jsonc
- Reduce cached value size (strip unnecessary fields)
- Implement retry logic with exponential backoff

### Stale Data

**Symptoms:**
- Users report outdated book metadata
- Cover images 404 after ISBN changes

**Diagnosis:**
1. Check cache age
```javascript
const cached = await getCached(key, env, ctx)
console.log('Cache age:', cached.cacheMetadata.age, 'seconds')
console.log('Cache TTL:', cached.cacheMetadata.ttl, 'seconds')
```

2. Verify content type TTL
```javascript
const ttl = getCacheTTL('isbn', env)
console.log('ISBN TTL:', ttl, 'seconds')
```

**Solutions:**
- Reduce TTL for volatile content types
- Implement cache invalidation on user feedback
- Add "Refresh" button for manual cache bypass
- Use cache busting for cover images (add timestamp query param)

---

## Best Practices

### 1. Always Pass ExecutionContext

```javascript
// ✅ CORRECT
export default {
  async fetch(request, env, ctx) {
    const cached = await getCached('book:isbn:123', env, ctx)
    // ...
  }
}

// ❌ WRONG (metrics not tracked)
const cached = await getCached('book:isbn:123', env)
```

### 2. Use Hot TTL for Effectiveness Tracking

```javascript
// ✅ CORRECT
await setCached(key, value, coldTtl, env, ctx, hotTtl)

// ❌ WRONG (no effectiveness tracking)
await setCached(key, value, coldTtl, env, ctx)
```

### 3. Normalize Cache Keys

```javascript
// ✅ CORRECT (consistent normalization)
const isbn = input.replace(/-/g, '')
const cacheKey = `book:isbn:${isbn}`

// ❌ WRONG (inconsistent keys)
const cacheKey = `book:isbn:${input}`  // May include hyphens
```

### 4. Handle Cache Failures Gracefully

```javascript
// ✅ CORRECT
const cached = await getCached(key, env, ctx)
if (cached) {
  return cached.data
}
// Fall back to external API
const result = await externalAPI.fetch()
return result

// ❌ WRONG (no fallback)
const cached = await getCached(key, env, ctx)
return cached.data  // May be null!
```

### 5. Cache Provider-Specific Results

```javascript
// ✅ CORRECT (provider-specific cache)
const alexandriaCache = await getCached(`alex:isbn:${isbn}`, env, ctx)
const googleCache = await getCached(`google:isbn:${isbn}`, env, ctx)

// ❌ WRONG (conflicts between providers)
const cache = await getCached(`book:isbn:${isbn}`, env, ctx)
```

---

## Future Optimizations

### 1. ISBNdb Batch API Integration

**Goal:** 100x improvement in daily cover harvest capacity
**Status:** Planned (Issue #136 - closed as future work)

### 2. Queue Consumer Migration

**Goal:** Increase CPU time limit from 5min to 15min for cover harvest
**Status:** Planned (Issue #147 - closed as future work)

### 3. Predictive Cache Warming

**Goal:** ML-based prediction of popular books before user requests
**Approach:**
- Analyze search patterns
- Identify trending topics/authors
- Proactively warm cache for predicted requests

### 4. Multi-Region Cache Replication

**Goal:** Sub-50ms latency globally via Cloudflare's edge network
**Approach:**
- Use Cloudflare's Cache API for edge caching
- Implement smart cache invalidation
- Coordinate with KV for authoritative data

---

## References

- **Source Files:**
  - `src/utils/cache.js` - Cache operations
  - `src/config/cache-ttl.js` - TTL configuration
  - `src/durable-objects/cache-metrics.js` - Metrics tracking
- **Documentation:**
  - `docs/PRD.md` - Product requirements
  - `docs/AUTHOR_HARVEST_SYSTEM.md` - Cover harvest details
  - `wrangler.jsonc` - Environment configuration
- **Issues:**
  - #136 - ISBNdb batch optimization (closed as future work)
  - #144 - This document (cache architecture)
  - #147 - Queue consumer migration (closed as future work)

---

**Maintained by:** BooksTrack Backend Team
**Last Review:** December 2, 2025
**Next Review:** March 2026
