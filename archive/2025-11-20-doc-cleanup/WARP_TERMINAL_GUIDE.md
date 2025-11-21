# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

---

## Project Overview

**BooksTrack Backend** – Cloudflare Workers API for book search, enrichment, and AI-powered scanning.

- **Stack**: Node.js, Cloudflare Workers, Durable Objects, KV Cache, R2 Storage, Analytics Engine
- **Production URL**: https://api.oooefam.net
- **Architecture**: Single monolith worker with direct function calls (no RPC service bindings)
- **Key Features**:
  - Book search via Google Books, OpenLibrary, ISBNdb
  - AI bookshelf scanning (Gemini 2.0 Flash)
  - CSV import + batch enrichment
  - WebSocket progress for long-running jobs
  - Multi-tier caching and rate limiting

Authoritative high-level docs:
- `README.md` – repo structure, main commands, and feature overview
- `ARCHITECTURE_OVERVIEW.md` – detailed system architecture
- `docs/API_CONTRACT.md` – canonical API contract (source of truth)
- `docs/QUICK_START.md` – quick start and docs navigation
- `tests/PATTERNS.md` – testing patterns for this codebase
- `.claude/CLAUDE.md` – detailed AI/agent rules (good architectural reference)

---

## Essential Commands

All commands run from the repo root.

### Install & Local Development

```bash
npm install
npx wrangler dev        # Local dev worker at http://localhost:8787
```

Key config: `wrangler.toml`  
- `main = "src/index.js"`
- Feature flags: `ENABLE_UNIFIED_ENVELOPE`, `ENABLE_REFACTORED_DOS`

### Testing (Vitest)

From `package.json`:

```bash
npm test                # vitest run (single pass)
npm run test:watch      # vitest in watch mode
npm run test:coverage   # vitest with coverage
npm run test:ui         # vitest UI
npm run test:e2e        # RUN_E2E_TESTS=true vitest run
```

Notes:
- Vitest is the single test framework used.
- See `tests/PATTERNS.md` for how to mock Cloudflare bindings, external APIs, WebSockets, etc.
- Minimum overall coverage target: **75%**, with stricter targets per component (see `README.md`).

### Deployment & Operations

```bash
npm run deploy          # Deploy via wrangler (used by CI for main)
npx wrangler deploy     # Manual deploy
npx wrangler tail --remote --format pretty  # Tail remote logs
```

CI/CD:
- GitHub Actions workflows live in `.github/workflows/`:
  - Production deploy on push to `main`
  - Staging and cache-warming workflows
- Required secrets are documented in `README.md` and `docs/deployment/SECRETS_SETUP.md`.

Other useful wrangler commands (referenced in docs and `.claude/WRANGLER_COMMAND_STANDARDS.md`):
- `npx wrangler deployments list` – list deployments
- `npx wrangler rollback` – rollback to previous deployment (also reflected in `wrangler.toml` docs)

---

## High-Level Architecture & Code Structure

Core code layout (see `ARCHITECTURE_OVERVIEW.md` for full details):

```text
src/
├── index.js                  # Main router: fetch/queue/scheduled entrypoints, 50+ routes
├── handlers/                 # HTTP route handlers (v1 + legacy)
├── services/                 # Business logic & data pipelines
│   ├── external-apis.js      # Google Books, OpenLibrary, ISBNdb wrappers
│   ├── enrichment.ts         # Multi-provider enrichment pipeline
│   ├── ai-scanner.js         # Gemini-based bookshelf scanning
│   ├── unified-cache.js      # Edge + KV multi-tier cache
│   ├── kv-cache.js           # KV TTL logic and data-quality scoring
│   ├── metrics-aggregator.js # Analytics Engine aggregation
│   └── normalizers/          # Provider → canonical DTOs
├── providers/                # Gemini and other AI providers
├── durable-objects/          # WebSocket, rate limiting, job state management
├── middleware/               # CORS, rate limiting, size validation, etc.
├── tasks/                    # Scheduled tasks (cron/R2 archival/harvest)
├── consumers/                # Queue consumers (e.g. author warming)
├── prompts/                  # AI prompt templates (e.g., CSV parsing)
├── types/                    # Canonical TypeScript DTOs
└── utils/                    # Shared helpers incl. progress reporters, analytics helpers

tests/
├── unit/                     # Cache, rate limiter, prompts, etc.
├── integration/              # End-to-end flows (search, cache warming, CSV import)
├── handlers/                 # Handler-level tests for key routes
├── normalizers/              # Normalization logic tests
├── assets/                   # Images and fixtures
└── README*.md, PATTERNS.md   # Test infra docs

docs/
├── API_CONTRACT.md           # Canonical v2 API contract (single source of truth)
├── QUICK_START.md            # High-level navigation guide
├── deployment/               # DEPLOYMENT, SECRETS_SETUP, MONITORING, ROLLBACK, RUNBOOK
├── guides/                   # Feature-specific docs (ISBNDB harvest, metrics, etc.)
├── workflows/                # Canonical workflow diagrams
└── robit/, archives/         # AI automation + historical docs
```

### Main Runtime Paths

**Entry point:** `src/index.js`

Implements three main runtime handlers:

- `fetch(request, env, ctx)` – HTTP routing
  - `/v1/search/title`, `/v1/search/isbn`, `/v1/search/advanced`
  - `/v1/enrichment/batch`
  - `/api/scan-bookshelf`, `/api/scan-bookshelf/batch`
  - `/api/import/csv-gemini`
  - `/api/warming/upload`, `/api/harvest-covers`
  - `/ws/progress?jobId=...&token=...`
  - `/metrics`, `/api/cache/metrics`, `/admin/harvest-dashboard`
  - `/health` for health checks + endpoint listing
- `queue(batch, env, ctx)` – queue consumers (e.g. author warming)
- `scheduled(event, env, ctx)` – scheduled jobs
  - R2 archival
  - ISBNdb cover harvest
  - Alert checks

**Middleware** (in `src/middleware/`):
- Rate limiting – DO-based, per-IP token bucket to avoid KV race conditions.
- CORS – permissive today due to native iOS client; docs note future tightening.
- Request size validation – protects against oversized uploads (images/CSV).

### Core Services & Patterns

**Multi-provider search & enrichment** (`src/services/`):

- `external-apis.js`
  - Unified wrapper over Google Books, OpenLibrary, ISBNdb.
  - Always normalizes provider responses into canonical DTOs.
- `enrichment.ts`
  - Orchestrates fetching from multiple providers for a work/ISBN.
  - Implements fallback logic and data quality scoring (used by cache TTL).
- `ai-scanner.js`
  - 3-stage pipeline: validate image → call Gemini vision → enrich results.
  - Integrates with WebSocket progress for long-running jobs.
- `kv-cache.js` + `unified-cache.js`
  - Multi-tier cache: edge → KV → provider queries.
  - TTL tuned per data type (title vs ISBN vs author vs enrichment).

**Durable Object architecture**:

- Legacy monolith: `ProgressWebSocketDO` in `src/durable-objects/progress-socket.js`
  - Manages WebSocket connections, job state, alarms, and some business logic.
- Refactor (behind feature flag `ENABLE_REFACTORED_DOS` in `wrangler.toml`):
  - `WebSocketConnectionDO` – WebSocket lifecycle and auth only.
  - `JobStateManagerDO` – job state persistence and throttled progress updates.
  - `ProgressReporter` (utility) – adapter that coordinates with DOs from services.
  - CSV processor and other pipelines moved into pure services.

**Storage & analytics** (see `ARCHITECTURE_OVERVIEW.md` and `wrangler.toml`):

- KV namespaces (`CACHE`, `KV_CACHE`) – read-heavy caching for search and enrichment.
- R2 buckets:
  - `personal-library-data` – archival cold cache.
  - `bookshelf-images` – uploaded bookshelf photos.
  - `bookstrack-covers` – harvested covers.
- Analytics Engine datasets:
  - `books_api_performance`, `books_api_cache_metrics`,
    `books_api_provider_performance`, `bookshelf_ai_performance`, etc.

---

## Canonical Response Envelope

All modern `/v1/*` endpoints use the unified envelope described in `docs/API_CONTRACT.md`. This replaces older `success/failed` shapes.

**Success:**

```json
{
  "data": {
    "...": "payload"
  },
  "metadata": {
    "timestamp": "2025-11-15T20:00:00.000Z",
    "processingTime": 145,
    "provider": "google-books",
    "cached": false
  }
}
```

**Error:**

```json
{
  "data": null,
  "metadata": {
    "timestamp": "2025-11-15T20:00:00.000Z"
  },
  "error": {
    "message": "Human-readable error",
    "code": "MACHINE_READABLE_CODE",
    "details": {
      "optional": "context"
    }
  }
}
```

Key points:

- Always populate `metadata.timestamp` (UTC, ISO 8601).
- `provider` and `cached` are used extensively in metrics and tests.
- Older `success: true/false` envelopes are considered legacy; prefer the unified shape and respect `ENABLE_UNIFIED_ENVELOPE` in `wrangler.toml`.

---

## Testing Model

**Test framework:** Vitest (see `package.json` and `ARCHITECTURE_OVERVIEW.md` → "Test Infrastructure").

Test layout (simplified):

```text
tests/
├── unit/                    # Cache, rate limiter, prompts, analytics, etc.
├── integration/             # End-to-end flows: search, warming, CSV, enrichment
├── handlers/                # Route handler tests (batch enrichment, scan, CSV)
├── normalizers/             # Provider → canonical DTO tests
├── assets/                  # Sample images and data
└── PATTERNS.md              # Detailed patterns for mocking + structure
```

Important practices (from `tests/PATTERNS.md`):

- **No real external API calls** – always mock Google Books/OpenLibrary/ISBNdb/Gemini with fixtures.
- Prefer shared fixtures over hard-coded values.
- Explicit helpers exist for:
  - Mock KV, DO, and R2 bindings.
  - Mock WebSocket pairs for progress testing.
  - Request builders and envelope validators for HTTP handlers.
- Error scenarios (timeouts, rate limits, provider failures, cache corruption, etc.) are explicitly tested.

When adding or modifying features:

- Mirror existing patterns from `tests/PATTERNS.md`.
- Ensure new handlers or services are covered at both unit and (where relevant) integration levels.
- Maintain the envelope shape and error code semantics defined in `docs/API_CONTRACT.md`.

---

## Environment & Bindings

All bindings are configured in `wrangler.toml`.

### Secrets (via `wrangler secret put`)

- `GOOGLE_BOOKS_API_KEY` – Google Books
- `GEMINI_API_KEY` – Gemini 2.0 Flash
- `ISBNDB_API_KEY` – ISBNdb

Secrets are never stored in the repo; see `docs/deployment/SECRETS_SETUP.md` for GitHub Actions setup and `wrangler.toml` for `secrets_store_secrets` configuration.

### Vars (from `wrangler.toml`)

Key examples:

- `OPENLIBRARY_BASE_URL`
- `CONFIDENCE_THRESHOLD` – AI detection threshold (0.7 default)
- `MAX_SCAN_FILE_SIZE` – max upload size (10 MB)
- `CACHE_HOT_TTL`, `CACHE_COLD_TTL`
- `ENABLE_UNIFIED_ENVELOPE` – unified envelope toggle
- `ENABLE_REFACTORED_DOS` – DO refactor feature flag

### Bindings Overview

From `wrangler.toml`:

- KV:
  - `CACHE`, `KV_CACHE` – main KV namespaces (same underlying namespace).
- R2:
  - `API_CACHE_COLD`, `LIBRARY_DATA`, `BOOKSHELF_IMAGES`, `BOOK_COVERS`.
- Durable Objects:
  - `PROGRESS_WEBSOCKET_DO`
  - `RATE_LIMITER_DO`
  - `WEBSOCKET_CONNECTION_DO`
  - `JOB_STATE_MANAGER_DO`
- Analytics Engine:
  - `PERFORMANCE_ANALYTICS`
  - `CACHE_ANALYTICS`
  - `ANALYTICS_ENGINE`
  - `AI_ANALYTICS`
  - `SAMPLING_ANALYTICS`

Refer to `ARCHITECTURE_OVERVIEW.md` for detailed usage of each binding.

---

## Performance, Caching, and Rate Limiting

Targets (from `README.md`, `QUICK_REFERENCE.md`, and metrics docs):

| Endpoint        | P95 latency | Notes                             |
|----------------|------------:|-----------------------------------|
| Cached search  |       < 50ms | Edge or KV hit                    |
| KV search      |    30–50 ms | KV cold start                     |
| Fresh search   |      < 500ms | Provider calls + cache write      |
| AI scan        |    25–40 sec | Gemini vision processing          |
| WebSocket      |       < 50ms | Progress broadcasts               |

Caching:

- KV key patterns like:
  - `search:title:{title}:{maxResults}`
  - `search:isbn:{isbn}`
  - `search:author:{author}:{limit}:{offset}`
  - `book:isbn:{isbn}`
  - `enrichment:{isbn}`
- TTLs:
  - ISBN data up to 365 days.
  - Titles and authors typically 7 days.
  - Enrichment ~180 days, adjusted by data quality.

Rate limiting:

- Implemented via DO (`RateLimiterDO`), one instance per client IP.
- Fixed window, e.g., 10 requests per 60 seconds on sensitive endpoints (AI/CSV/enrichment).
- Exposed via standard rate limit headers and error envelope (see `docs/API_CONTRACT.md`).

---

## Quick Operational Reference

### Common HTTP Calls (Local)

```bash
# Health
curl "http://localhost:8787/health"

# Title search
curl "http://localhost:8787/v1/search/title?q=dune"

# ISBN search
curl "http://localhost:8787/v1/search/isbn?isbn=9780439708180"

# Advanced search
curl "http://localhost:8787/v1/search/advanced?title=dune&author=herbert"

# Batch enrichment
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"isbns":["9780439708180"]}' \
  "http://localhost:8787/v1/enrichment/batch"
```

### AI Bookshelf Scan (Local)

```bash
# Start a scan
curl -X POST \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg \
  "http://localhost:8787/api/scan-bookshelf?jobId=$(uuidgen)"
```

### WebSocket Progress (Local)

```bash
# Once you have jobId + token from API response
wscat -c "ws://localhost:8787/ws/progress?jobId=<jobId>&token=<token>"
```

For anything more complex (WebSocket auth flows, CSV import nuances, cache warming jobs, queue behavior), consult:

- `ARCHITECTURE_OVERVIEW.md`
- `docs/API_CONTRACT.md`
- `docs/QUICK_START.md`
- `docs/guides/ISBNDB-HARVEST-IMPLEMENTATION.md`
- `docs/guides/METRICS.md`
