# Product Requirements Document (PRD)

BooksTrack Backend – Ideal State

Status: Draft for review
Owner: Backend Platform
Stakeholders: iOS App, Harvest Dashboard, Operations
Last Updated: 2025-11-21

## 1. Product Overview
- Name: BooksTrack Backend (Cloudflare Workers API)
- Purpose: Provide fast, reliable, and cost-efficient book discovery, enrichment, and AI-powered scanning for the BooksTrack iOS app and associated dashboards.
- Primary Clients:
  - BooksTrack iOS app (Capacitor)
  - Harvest dashboard (web)
- Production URL: https://api.oooefam.net
- Dashboard: https://harvest.oooefam.net

## 2. Goals and Non-Goals
### Goals
- Low-latency, multi-provider book search (Google Books, OpenLibrary, ISBNdb)
- AI-powered bookshelf scanning and CSV parsing using Gemini 2.0 Flash
- Consistent API response envelope, strong type contracts, and progressive deprecation of legacy endpoints
- Real-time job progress via Durable Objects and WebSockets
- Efficient caching strategy across KV, R2; harvest and caching workflows that respect third-party quotas
- Robust observability (analytics, traces, logs); measurable SLOs
- Feature-flagged rollouts for zero-downtime deployment and easy rollback

### Non-Goals
- Full-blown user auth/identity system (token handling for WS only)
- Proprietary enterprise search ranking or ML-driven recommendation engine
- Data warehousing/BI beyond Workers Analytics Engine datasets
- Multi-tenant isolation beyond today’s rate-limiting and quotas

## 3. Personas and Use Cases
- Consumer (Primary): iOS user scanning a shelf, importing CSV, or searching by title/author/ISBN. Needs fast feedback and progress visibility.
- Librarian/Power User: Wants batch enrichment and reliable cover harvesting with quota-aware execution.
- Maintainer/Operator: Needs health signals, cost controls, safe rollouts, and easy debugging.

## 4. Success Metrics
### Functional
- Search hit rate (combined providers): ≥ 95% for mainstream titles
- AI scan precision/recall (measured via test corpus): ≥ 90%/85%
- CSV import auto-parse success without manual config: ≥ 95%

### Performance (p95/p99)
- Cache hits: p95 < 200 ms / p99 < 350 ms
- Cold path external calls: p95 < 1000 ms / p99 < 1800 ms
- WebSocket progress delivery: ≤ 250 ms lag from stage change

### Reliability
- Error budget: ≤ 0.1% failed requests/month
- WS reconnection recovery: 99% of jobs recover state on reconnect

### Cost
- Keep AI usage within budget via rate-limit and job batching (alerts ≥ 80% quota)
- ISBNdb daily limit compliance (≤ 5000/day) with backoff/caching

## 5. Scope – Feature Requirements
### 5.1 Multi-Provider Search
- Inputs: title, author, isbn; optional maxResults
- Providers: Google Books (primary), OpenLibrary (fallback), ISBNdb (for detail and covers)
- Normalization: Canonical WorkDTO, EditionDTO, AuthorDTO
- Edge Caching: Hot KV (2h), Cold R2 (14d), cache keys deterministic and documented
- Response: Unified envelope `{ data, metadata{timestamp, provider, cached}, error? }`

### 5.2 AI Bookshelf Scan
- Input: Image up to 10MB (MAX_SCAN_FILE_SIZE)
- Model: Gemini 2.0 Flash; defensive fallback to `"unknown"` model label when metadata missing
- Pipeline: quality check → AI detection → parallel enrichment (≤ CONCURRENCY_LIMIT) → categorization → results
- Progress: WebSocket DO with stages and deltas; reconnection sync via job state endpoint
- Output: Detected books, enrichment, confidence scores, modelUsed, suggestions

### 5.3 CSV Import
- Input: CSV (max size consistent with MAX_SCAN_FILE_SIZE)
- AI-assisted parsing (Gemini CSV) with schema inference; validation errors returned in envelope
- Progress: Same WS progress pattern as AI scan
- Output: Parsed entries, normalization to canonical DTOs, rejected rows with reasons

### 5.4 Batch Enrichment
- Input: list of ISBN/title/author tuples with bounded batch size
- Strategy: Provider calls with rate limiting; cache-first; coalescing to reduce duplicate work
- Progress: WebSocket with processedCount/total; resumable on reconnect
- Output: `EnrichmentResult { works, editions, authors }` with provenance fields

### 5.5 Cover Harvest
- Automated cover caching via ISBNdb; respect 5000/day limit
- Scheduler: Periodic harvest tasks; backoff on provider errors
- Cold storage in R2 with canonical path scheme and metadata

### 5.6 Real-time Progress
- Durable Objects for WS auth, token refresh, hibernation-based cost reduction
- Backwards-compatible token mechanisms; strongly prefer WS subprotocol for auth
- Job state manager DO to support reconnection and cross-request continuity

## 6. API Requirements
### 6.1 Envelope (v2.0)
- Success: `{ data: <payload>, metadata: { timestamp, provider?, cached? } }`
- Error: `{ data: null, metadata: { timestamp }, error: { message, code, details? } }`
- Response headers: `Content-Type: application/json`; `X-Response-Format: v2.0`; `X-Error-Type` on errors

### 6.2 Versioning and Deprecation
- Current: v1 routes under `/v1/search/*`
- Deprecated Legacy: `/search/*`; Deprecation and Sunset headers set; removal no earlier than March 1, 2026
- Never break userspace: provide alternates and migration time; feature flags for safe rollouts

### 6.3 Endpoints (representative)
- `GET /v1/search/isbn?isbn=…` → 200 | 400 (INVALID_ISBN) | 404 (NOT_FOUND)
- `GET /v1/search/title?q=…&maxResults=…` → 200 | 400
- `GET /v1/search/advanced?title=…&author=…` → 200 | 400
- `POST /v1/scan` (image body) → 202 accepted + WS progress; results via `/v1/scan/results/:jobId`
- `POST /v1/import/csv` (file body) → 202 + WS; results via `/v1/csv/results/:jobId`
- `POST /api/token/refresh` `{ jobId, oldToken }` → 200 | 401 (AUTH_ERROR)
- `GET /api/job-state/:jobId` → 200 | 400
- `GET /metrics` → 200 (analytics, cache metrics)
- `GET /health` → 200

### 6.4 Rate Limiting and Quotas
- Per-IP DO-based rate limiter (e.g., 10 req/60s)
- Backoff policies for providers; circuit breaker after consecutive failures
- ISBNdb daily limit enforcement; fallback to cached covers

### 6.5 CORS
- Allow native apps without Origin; allow pre-configured web origins
- Expose analytics headers; maintain OPTIONS handling

## 7. Architecture
- Runtime: Cloudflare Workers with Hono router (feature-flagged)
- State: Durable Objects (WS connections, job state, rate limiter, cache metrics)
- Storage: KV (hot cache), R2 (cold cache, images), Analytics Engine datasets
- AI: Gemini 2.0 Flash via provider module
- Routers:
  - Hono (default, `ENABLE_HONO_ROUTER=true`); legacy manual router remains as rollback
- Caching:
  - Hot KV TTL 2h, Cold R2 TTL 14d; cache key factory deterministically maps inputs → outputs
- Envelope/Contracts: Single response builder utility; canonical DTOs; TS-first contracts

## 8. Performance and Scalability
### Targets
- See Section 4; align with Workers CPU limits and network I/O constraints

### Concurrency
- Enrichment parallelism up to `CONCURRENCY_LIMIT` (default 10); configurable via env

### Coalescing
- Request coalescing for in-flight enrichments to avoid thundering herd

### Edge Caching
- Short-circuit return for cache hits; set cache control headers on responses

### Stress Scenarios
- Shelf scan bursts (10–100 scans/min): maintain WS stability and progress accuracy
- Provider degradation: maintain availability via fallbacks and cached responses

## 9. Security, Privacy, Compliance
- WS Auth
  - Prefer `Sec-WebSocket-Protocol` for tokens; deprecate URL tokens; rotate via `/api/token/refresh`
- Secrets
  - Managed via wrangler secrets and secrets store bindings; never logged
- Data Handling
  - No user PII stored; images retained only if explicitly configured; cover images cached under fair use and provider terms
- Transport
  - Enforce HTTPS; no mixed content
- Abuse and DoS
  - Rate limiter DO; max input sizes; strict validation for ISBN and query lengths

## 10. Observability and Operations
- Logging and Tracing
  - Workers Logs and Traces enabled; 100% sampling in non-prod, 20–50% in prod as needed
  - Structured logs; correlation IDs per request/job
- Metrics (Workers Analytics Engine)
  - PERFORMANCE_ANALYTICS: latency, p95/p99, cache hit ratio
  - CACHE_ANALYTICS: TTL usage, warm vs cold, invalidations
  - PROVIDER/AI_ANALYTICS: provider latency, error rates, costs (approx)
  - SAMPLING_ANALYTICS: request sampling/AB data
- Alerts
  - Error rate > 0.5% over 5 min
  - p99 latency > target for 10 min
  - Cache hit ratio falls below 60%
  - AI/ISBNdb quota ≥ 80% usage
- Runbooks
  - Router rollback: set `ENABLE_HONO_ROUTER=false`
  - WS failures: validate DO migrations, hibernation flag, token subprotocol usage
  - Provider outage: enable aggressive caching, reduce concurrency, update backoff

## 11. Testing and Quality
- Framework: Vitest; Node environment
- Targets
  - Overall coverage ≥ 75%
  - Validators/Normalizers/Auth 100%
  - Cache ≥ 90%, External APIs ≥ 85%, Enrichment ≥ 85%, WS DO ≥ 80%, Handlers ≥ 75%, Services ≥ 70%
- Types/Contracts
  - Canonical DTOs are the source of truth; unit tests verify normalization for each provider
- E2E
  - v1 search flows, AI scan happy-path and oversized image, CSV import edge cases
  - WS lifecycle tests: open/refresh/reconnect, hibernation path
  - Rate-limiter behavior under concurrent clients
- CI
  - Lint/typecheck/test/coverage gates; no deploy on failing tests; coverage threshold enforced

## 12. Release Plan and Lifecycle
- Environments
  - Dev (workers_dev), Staging, Prod (custom domain routes)
- Feature Flags
  - `ENABLE_HONO_ROUTER` default true; manual router as immediate rollback
  - `ENABLE_HIBERNATION_WEBSOCKET` for DO hibernation rollout
  - `ENABLE_REFACTORED_DOS` for progressive DO architecture refactor
- Phased Rollout
  - 1% → 10% → 50% → 100% traffic shaping via feature flags and canary metrics
- Deprecation Timeline
  - Legacy `/search/*` sunset March 1, 2026 (headers already set)
- Deployment
  - `wrangler deploy`; instant rollback via config/env flips; no DB schema migrations

## 13. Risks and Mitigations
- Provider Limits/Outages
  - Mitigation: cache-first, multi-provider fallback, exponential backoff, circuit breaker
- AI Cost/Rate Spikes
  - Mitigation: concurrency caps, budget alerts, batch modes
- WS Scaling
  - Mitigation: hibernation DOs, shard by jobId, strict token TTLs and refresh flows
- Cache Inconsistency
  - Mitigation: deterministic keys, validation tests, TTL discipline, explicit invalidation hooks
- Breaking Changes
  - Mitigation: never break userspace; feature flags; compatibility layers; long deprecation windows

## 14. Open Questions
- Do we need additional provider(s) (e.g., LibraryThing) for niche coverage?
- Should we store user-submitted images beyond processing for audit/debug? If yes, retention period and PII policy?
- Budget guardrails for AI usage per month? Hard caps?
- Internationalization: language-aware search normalization priority?

## 15. Acceptance Criteria
- All v1 endpoints return unified envelope with `X-Response-Format: v2.0`
- Hono router enabled by default; manual router behind feature flag for rollback
- AI scan and CSV import accept up to 10MB inputs; reject with clear error envelope otherwise
- WebSocket progress:
  - Token via subprotocol supported; refresh endpoint works
  - Hibernation mode passes smoke tests; reconnection restores state
- Caching:
  - Hot KV TTL 2h, Cold R2 TTL 14d; measurable cache hit ratio ≥ 60% week over week
- Observability:
  - Metrics, logs, traces visible; alerts wired for error spikes and p99 latency
- Testing:
  - ≥ 75% coverage overall; category thresholds met; E2E suite passes
- Backward Compatibility:
  - Legacy `/search/*` returns Deprecation/Sunset headers; functionality intact until removal date

## 16. Milestones
- M1 (Week 1–2): Hono default, unified envelope everywhere, CI coverage gates in place, search v1 hardened
- M2 (Week 3–4): AI scan/CSV stability, hibernation DO rollout to 50%, cache hit ratio optimization
- M3 (Week 5–6): Batch enrichment and cover harvest maturity; alerts/dashboards; provider fallback corner cases
- M4 (Week 7–8): Performance tuning to hit p95/p99 SLOs; finalize deprecation playbook; docs and runbooks complete

---

### Appendix A: Environment Variables and Defaults
- `ENABLE_HONO_ROUTER`: true
- `CACHE_HOT_TTL`: 7200 sec
- `CACHE_COLD_TTL`: 1209600 sec
- `MAX_RESULTS_DEFAULT`: 40
- `RATE_LIMIT_MS`: 50
- `CONCURRENCY_LIMIT`: 10
- `MAX_SCAN_FILE_SIZE`: 10485760 bytes (10MB)
- `CONFIDENCE_THRESHOLD`: 0.7
- `OPENLIBRARY_BASE_URL`: https://openlibrary.org

### Appendix B: Provider Policies
- Google Books: API key required; log user-agent; monitor quotas and errors
- OpenLibrary: Rate limits apply; be a good citizen; cache results
- ISBNdb: 5000/day limit; throttle and schedule harvesting; prefer cached cover paths
