---
description: Analyze 3-tier cache performance (Edge → KV → R2)
---

Analyze BooksTrack's 3-tier cache architecture and performance:

**3-Tier Cache Architecture:**
- **Tier 1 (Edge):** Cloudflare edge cache, 5-10ms latency, SWR pattern
- **Tier 2 (KV):** Primary cache namespace, 30-50ms latency
- **Tier 3 (R2):** Cold storage archive for infrequently accessed data

**Cache Metrics (CacheMetricsDO):**
- Hit/miss ratios by tier (edge, KV, R2 rehydration)
- Per-prefix breakdown (book:, cover:, search:isbn:, circuit:, etc.)
- Cache churn detection (rewrites within 5min window)
- TTL effectiveness tracking

**Key Components to Analyze:**
- `src/services/unified-cache.js` - 3-tier orchestration
- `src/services/cache-key-factory.js` - Key generation patterns
- `src/durable-objects/cache-metrics.js` - CacheMetricsDO
- `src/config/cache-ttl.js` - TTL configuration

**Live Metrics Endpoint:**
```
GET /api/cache/metrics?window=hour
```

**Circuit Breaker State:**
- Check `circuit:{provider}` keys (google-books, open-library, isbndb, gemini)
- 5min TTL, tracks OPEN/CLOSED/HALF_OPEN states

**Optimization Opportunities:**
- KV write volume analysis (access tracking, circuit breaker writes)
- TTL alignment across tiers
- R2 cold storage utilization
- Alert threshold validation

@cf-ops-monitor
