# Recommendations + Extended Metadata: Implementation Task List (Cloudflare Workers Paid)

This is the execution plan to add a content-based recommendation engine and expand book metadata on Cloudflare Workers (paid plan). It’s organized into phases with task-level detail for assignment and tracking.

## Phase 0 — Alignment and planning
- Define success metrics and KPIs
  - CTR on rec carousels, add/save rate, session length, catalog coverage, p95 latency, cost per 1k requests. Establish baselines.
- Audit current data model and endpoints
  - Inventory src/types, normalizers, enrichment pipeline, handlers, and storage (KV/R2/DO). Document gaps.
- Decide recommendation approach and MVP scope
  - Phase 1: content-based similarity + popularity fallback. Phase 2: hybrid with behavior signals. Confirm privacy constraints.

## Phase 1 — Cloudflare platform setup
- Provision resources: Workers AI, Vectorize index, Queues (metadata-enrich, embeddings-build, recs-recompute + DLQs)
- Choose embeddings model on Workers AI (e.g., @cf/baai/bge-base-en-v1.5), record vector dimension and costs
- Update wrangler.toml: add AI binding, Vectorize, Queues bindings; env vars RECS_ENABLED, EMBEDDINGS_MODEL, VECTORIZE_INDEX_NAME, V1_1_EXTENDED_METADATA
- Security/privacy review: retention for user events, opt-out, deletion; secrets via `wrangler secret put`

## Phase 2 — Expanded metadata
- Define extended metadata contract (API v1.1)
  - Contributors (roles), series, subjects/genres, language, pageCount, dimensions, publisher/imprint, publicationPlace, identifiers (OCLC, LCCN, ASIN, DOI), awards, long description, readingAge, ratings/review aggregates, tags
- Extend TypeScript types (src/types)
  - Optional fields, enums for contributor roles and ISO-639-1 languages
- Update normalizers (src/services/normalizers/*)
  - Map richer fields from Google Books/OpenLibrary/ISBNdb; unit tests in tests/normalizers/
- Enhance external API clients (src/services/external-apis.ts)
  - Request additional fields, handle provider quirks
- Enrichment precedence (src/services/enrichment.ts)
  - Source precedence + confidence per field; add tests
- Batch backfill job for metadata
  - New scheduled handler enqueues to metadata-enrich; progress via existing WebSocket DO
- Persist extra metadata
  - Canonical JSON in KV/R2, record versioning, migration script
- CSV import and AI scan propagation
  - Extract series/subjects; add integration tests
- API handlers return extended metadata
  - Guarded by feature flag V1_1_EXTENDED_METADATA; update tests and docs

## Phase 3 — Content-based recommendations MVP
- Define embeddings content and chunking
  - Use title, subtitle, authors, series, subjects, capped description; normalize text
- Implement embeddings builder service
  - Call Workers AI to create vectors; enqueue on embeddings-build; insert into Vectorize with metadata; retries + DLQ
- Backfill embeddings for catalog
  - Scheduled iterator enqueues; throttle for cost/rate limits; progress via DO
- Similarity search service
  - src/services/recs/vector-search.ts: topK search, filters (language/subject), score normalization; handle missing vectors
- Popularity/trending fallback
  - KV aggregates rolling 7/30-day; scheduled compaction
- Recommendation API endpoints
  - /v1/recommendations: similar-to-book (bookId), search-based (text), trending; pagination + filters
- Cold-start defaults
  - Trending + curator picks from KV (feature-flagged)
- Caching and rate limiting
  - Edge cache for anonymous; per-user short TTL; integrate existing rate limiter

## Phase 4 — Behavioral signals and hybrid (Phase 2)
- User event capture endpoint /v1/events
  - view/add/rate with minimal payload; validation + throttling
- Event storage and retention
  - D1 or DO+R2 append-only logs; 180-day retention; nightly rollups to KV
- Item-item co-occurrence
  - Nightly co-occurrence and Jaccard/PMI; persist top-N neighbors per book in KV/R2
- Hybrid ranking merger
  - Weighted blend of content-based, co-occurrence, and popularity; flags to tune weights
- Personalized recommendations
  - /v1/recommendations/user using user profile aggregates; opt-out + privacy safeguards

## Phase 5 — Quality, performance, and observability
- Observability: structured logs/counters/percentiles; optional Sentry or OT traces; cost/usage dashboards
- Testing: Vitest unit/integration/contract tests meeting repo targets
- Load/latency testing: vector search p95/p99, queue throughput, AI latency; ensure within Workers CPU limits
- Docs: recommendations architecture and operations runbooks

## Phase 6 — Rollout and governance
- Feature flags: RECS_ENABLED, EXTENDED_METADATA_ENABLED, PERSONALIZED_RECS_ENABLED; staged rollout 5%/25%/100%
- API versioning: ship v1.1; support Accept-Version header; migration notes for clients
- A/B tests: baseline vs content-based vs hybrid; monitor KPIs, tune weights, document learnings
- Operational cost guardrails: daily budget caps for AI, queue rate limits, Vectorize quotas, alerts

## Acceptance criteria (summarized)
- P2: Extended metadata available behind flag; backfill complete; tests passing
- P3: /v1/recommendations working for similar-to-book and trending; cache-aware; p95 <200ms (cached), <600ms (vector hits); 90%+ vectors coverage
- P4: Personalized/hybrid in staging; nightly co-occurrence; privacy review complete
- P5: Coverage meets targets; dashboards live; load tests pass
- P6: Progressive rollout complete; A/B learnings captured; cost alerts active
