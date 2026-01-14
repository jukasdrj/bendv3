# BooksTrack Backend

[![npm version](https://img.shields.io/npm/v/@jukasdrj/bookstrack-api-client.svg)](https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-98.7%25-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-1,097%20passing-success.svg)](./TODO.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Cloudflare Workers API** for book search, enrichment, and AI-powered scanning.

**Production URL:** https://api.oooefam.net
**Harvest Dashboard:** https://harvest.oooefam.net 📊 (Real-time monitoring)
**TypeScript SDK:** [`@jukasdrj/bookstrack-api-client`](https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client)
**API Docs:** https://api.oooefam.net/v3/docs (Interactive Swagger UI)
**OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json

## Project Status

**Phase:** Maintenance Mode (All sprints complete! 🎉)
**Health:** 🟢 0% error rate over 7 days
**Test Suite:** ✅ 1,097 passing | 6 skipped (100% pass rate)
**Open Issues:** 1 P3 (blocked by Alexandria)
**Type Safety:** 95.8% (453/506 errors resolved)
**Dependencies:** Alexandria v2.8.0, 92 canonical genres

See [TODO.md](TODO.md) for complete project status and sprint history.

## Repository Structure

```
.
├── README.md                  # This file
├── wrangler.jsonc            # Cloudflare Workers config (JSON with schema)
├── wrangler.toml             # Legacy TOML config (deprecated, kept for reference)
├── .env.example              # Environment variables template
├── package.json              # Dependencies
├── src/                      # Production code (98.7% TypeScript)
│   ├── index.ts              # Main router
│   ├── handlers/             # Request handlers
│   ├── services/             # Business logic
│   ├── providers/            # AI integrations (Gemini, Google Books, etc.)
│   ├── durable-objects/      # WebSocket Durable Object
│   ├── middleware/           # CORS, rate limiting, validation
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Shared utilities
├── dashboard/                # 📊 Harvest monitoring dashboard
│   ├── index.html            # Dashboard UI
│   ├── styles.css            # Dark mode styles
│   ├── dashboard.js          # Data fetching logic
│   └── README.md             # Dashboard documentation
├── tests/                    # All tests and fixtures
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── handlers/             # Handler-specific tests
│   ├── normalizers/          # Data normalization tests
│   ├── utils/                # Utility function tests
│   └── assets/               # Test images and fixtures
├── docs/                     # Active documentation
│   ├── deployment/           # Deployment guides, monitoring, alerting
│   ├── guides/               # Feature implementation guides
│   ├── workflows/            # Workflow diagrams and processes
│   ├── robit/                # AI automation setup docs
│   ├── archives/             # Completed deployments and historical notes
│   ├── API_README.md         # **START HERE** - API contracts and integration guide
│   ├── STAGING_TESTING_GUIDE.md  # Staging environment testing
│   └── WEBSOCKET_MIGRATION_IOS.md # WebSocket client migration
├── archive/                  # Completed plans and outdated documentation
│   ├── 2025-11-archive/      # November 2025 completed work
│   ├── plans/                # Completed implementation plans
│   ├── docs/                 # Superseded documentation
│   └── claude-config/        # Historical Claude Code configuration
├── scripts/                  # Utility and development scripts
│   ├── dev/                  # Development scripts (test image generation)
│   └── utils/                # Production utilities (cache warming, harvesting)
└── .github/                  # GitHub Actions workflows

```

### Architecture Details

Single monolith worker with direct function calls (no RPC service bindings):

### Features

- **Book Search**: Alexandria RPC (49M+ ISBNs), Google Books, OpenLibrary, ISBNdb
- **Genre Normalization**: 92 canonical genres (expanded Jan 2026)
- **AI Bookshelf Scanning**: Gemini 2.0 Flash with 2M token context
- **CSV Import**: AI-powered parsing with zero configuration
- **Batch Enrichment**: Background job processing
- **WebSocket Progress**: Real-time updates for all background jobs
- **Cover Harvest**: Automated ISBNdb cover caching (5000 req/day)
- **Cache Warm-up**: Automated popular books cache refresh
  - **Static List**: Top 100 popular books (classics, bestsellers, popular series)
  - **Analytics-Driven**: Most accessed books from access tracking
  - **Schedule**: Every 6 hours (static) + hourly (analytics)
  - **Benefits**: <50ms latency for popular books, reduced API costs

See `ARCHITECTURE_OVERVIEW.md` for architecture details.

## API Endpoints

### V3 API (Current - December 2025)
**Native Hono OpenAPI with full zod@4 support**

- `GET /v3/books/:isbn` - Get book by ISBN with full metadata
- `GET /v3/books/search?q=query` - Search books by title/author
- `POST /v3/books/enrich` - Enrich book metadata (sync or async mode)
- `GET /v3/openapi.json` - OpenAPI 3.1 specification
- `GET /v3/docs` - Interactive Swagger UI documentation

### Job Endpoints
- `POST /v3/jobs/imports` - CSV import workflow
- `GET /v3/jobs/imports/:jobId` - Import job status
- `GET /v3/jobs/imports/:jobId/stream` - SSE progress stream
- `POST /v3/jobs/scans` - Bookshelf photo scanning
- `GET /v3/jobs/scans/:jobId` - Scan job status
- `GET /v3/jobs/scans/:jobId/stream` - SSE progress stream
- `GET /v3/jobs/enrichment/:jobId` - Enrichment job status
- `GET /v3/jobs/enrichment/:jobId/stream` - SSE progress stream

### Status Updates
- `GET /ws/progress?jobId={uuid}` - WebSocket for real-time progress

### Health & Monitoring
- `GET /health` - Health check and endpoint listing

### Previous API Versions (Removed)
- ⛔ **V1 API:** Removed December 2025 - See [docs/archive/v1-api-2026-03/](docs/archive/v1-api-2026-03/)
- ⛔ **V2 API:** Removed March 2026

## TypeScript SDK

Official type-safe SDK for BooksTrack V3 API:

```bash
npm install @jukasdrj/bookstrack-api-client
```

**Features:**
- ✅ Auto-generated from OpenAPI spec (always in sync)
- ✅ Full TypeScript support with type inference
- ✅ SSE streaming utilities for jobs
- ✅ Works in browser, Node.js, and Cloudflare Workers
- ✅ Tree-shakable and lightweight (~2KB gzipped)

**Quick Example:**
```typescript
import { createBooksTrackClient } from '@jukasdrj/bookstrack-api-client'

const client = createBooksTrackClient({
  baseUrl: 'https://api.oooefam.net'
})

// Type-safe API calls with autocomplete
const { data } = await client.GET('/v3/books/{isbn}', {
  params: { path: { isbn: '9780439708180' } }
})

console.log(data.data.title) // "Harry Potter and the Sorcerer's Stone"
```

**Documentation:**
- 📦 [npm package](https://www.npmjs.com/package/@jukasdrj/bookstrack-api-client)
- 📖 [Full SDK docs](packages/api-client/README.md)
- 🌊 [Streaming guide](packages/api-client/STREAMING_GUIDE.md)
- 📝 [Changelog](packages/api-client/CHANGELOG.md)

## Quick Start

### Local Development

```bash
npm install
npx wrangler dev
```

### Deploy to Production

```bash
npm run deploy
```

**Note:** Deployment is automated via GitHub Actions on push to `main`.

### Manual Deployment

```bash
npx wrangler deploy
```

## Environment Variables

### Local Development (`.env` file)

1. **Copy the template:**
   ```bash
   cp .env.example .env
   ```

2. **Add your API keys to `.env`:**
   ```bash
   GOOGLE_BOOKS_API_KEY=your_actual_key_here
   GEMINI_API_KEY=your_actual_key_here
   ISBNDB_API_KEY=your_actual_key_here
   ```

3. **Run locally:**
   ```bash
   npx wrangler dev  # Automatically loads .env
   ```

**Never commit `.env` to version control!** (It's in `.gitignore`)

### Production Secrets (via `wrangler secret put`)
- `GOOGLE_BOOKS_API_KEY` - Google Books API authentication
- `GEMINI_API_KEY` - Gemini AI authentication
- `ISBNDB_API_KEY` - ISBNdb cover images

```bash
wrangler secret put GOOGLE_BOOKS_API_KEY
# (paste your actual key when prompted)
```

### Configuration Variables (in `wrangler.jsonc`)
- `OPENLIBRARY_BASE_URL` - OpenLibrary API base URL
- `CONFIDENCE_THRESHOLD` - AI detection confidence threshold (0.7)
- `MAX_SCAN_FILE_SIZE` - Maximum upload size (10485760 = 10MB)

See `.env.example` for all available environment variables.

## CI/CD

### GitHub Actions Workflows

1. **Production Deployment** (`deploy-production.yml`)
   - Triggers on push to `main`
   - Deploys to `api.oooefam.net`
   - Runs health check post-deployment

2. **Staging Deployment** (`deploy-staging.yml`)
   - Manual trigger only
   - Deploys to staging environment

3. **Cache Warming** (`cache-warming.yml`)
   - Daily cron at 2 AM UTC
   - Warms cache for popular books

### Required Secrets

Configure these in GitHub repository settings → Settings → Secrets and variables → Actions:

1. `CLOUDFLARE_API_TOKEN` - Wrangler deployment token
2. `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
3. `GOOGLE_BOOKS_API_KEY` - Google Books API key
4. `GEMINI_API_KEY` - Gemini AI API key
5. `ISBNDB_API_KEY` - ISBNdb API key

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. The following commands are available:

- `npm test`: Run all tests once.
- `npm run test:watch`: Run tests in watch mode.
- `npm run test:coverage`: Run tests and generate a coverage report.
- `npm run test:ui`: Run tests in the Vitest UI.

### Test Structure

- `tests/unit`: Unit tests for individual modules.
- `tests/integration`: Integration tests for services and providers.
- `tests/handlers`: Tests for request handlers.

### Code Coverage

We aim to maintain a high level of test coverage across the codebase. The following are our minimum coverage goals by component:

- **Validators**: 100%
- **Normalizers**: 100%
- **Auth**: 100%
- **Cache**: 90%+
- **External APIs**: 85%+
- **Enrichment**: 85%+
- **WebSocket DO**: 80%+
- **Handlers**: 75%+
- **Services**: 70%+

The overall project coverage target is **75%**.

### Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for detailed guidelines on how to contribute to this project, including our testing requirements. All new code must be accompanied by tests.

## Monitoring

### 📊 Harvest Dashboard (NEW)

**Live Dashboard:** https://harvest.oooefam.net

Visual, real-time monitoring dashboard with:
- System health overview (worker status, request volume, error rate)
- Cache performance gauges (edge, KV, combined hit rates)
- Response time metrics (P50/P95/P99 latency)
- Cost tracking (KV/R2 reads)
- Auto-refresh every 30 seconds
- Mobile-friendly, dark mode

**Quick Start:**
```bash
# Local development
cd dashboard
python3 -m http.server 8080
open http://localhost:8080
```

See [Dashboard README](dashboard/README.md) for features and [Deployment Guide](docs/deployment/DASHBOARD_DEPLOYMENT.md) for setup.

### Production Logs

```bash
npx wrangler tail --remote --format pretty
```

### Metrics

- Response times (search endpoints < 500ms)
- WebSocket latency (< 50ms)
- Cache hit rate (> 60% target)
- Error rate (< 1% target)

## Documentation

### Quick Links (Start Here)
- **[Claude Code Guide](.claude/CLAUDE.md)** - Comprehensive AI development guidelines
- **[Frontend Integration](docs/FRONTEND_INTEGRATION.md)** - Complete V3 API integration guide
- **[Cache Architecture](docs/CACHE_ARCHITECTURE.md)** - Caching strategy and TTLs
- **[Code Review TODO](docs/CODE_REVIEW_TODO.md)** - TypeScript migration progress (98.7% complete)

### Interactive API Documentation
- **V3 Swagger UI:** https://api.oooefam.net/v3/docs
- **V3 OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **API Versioning Strategy:** [docs/API_VERSIONING.md](docs/API_VERSIONING.md)

### Development Status
- **TypeScript Migration:** 147/149 files (98.7% complete)
- **Test Coverage:** 75%+ (199/199 smoke tests passing)
- **Code Quality:** Biome enforced, zero `any` types policy

### Reference
- **[Agents Guide](docs/AGENTS.md)** - AI agent quick reference
- **[PRD](docs/PRD.md)** - Product requirements document
- **[V1 API Archive](docs/archive/v1-api-2026-03/)** - Historical V1 API documentation

## License

MIT

## Related Projects

- **iOS App:** [books-tracker-v1](https://github.com/jukasdrj/books-tracker-v1)
- **App Store:** BooksTrack by oooe (Bundle ID: Z67H8Y8DW.com.oooefam.booksV3)
