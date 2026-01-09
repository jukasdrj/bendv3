---
description: Stream and analyze production logs from Cloudflare Workers
argument-hint: [optional-filter-pattern]
---

Stream production logs using `wrangler tail` and analyze for:

**Error Analysis:**
- Error patterns and frequency
- Stack traces and root causes
- Affected endpoints

**Performance:**
- Slow endpoints (P95 > 500ms)
- KV cache hit/miss ratios
- External API latency

**Rate Limiting:**
- API quota usage (Google Books, ISBNdb, Gemini)
- Per-IP request rates
- Rate limit violations

**Filter pattern (optional):** {{ARGS}}

@cf-ops-monitor
