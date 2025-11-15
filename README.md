# BooksTrack Backend

**Cloudflare Workers API** for book search, enrichment, and AI-powered scanning.

**Production URL:** https://api.oooefam.net
**Harvest Dashboard:** https://harvest.oooefam.net

## Repository Structure

```
.
├── README.md                  # This file
├── wrangler.toml             # Cloudflare Workers config
├── package.json              # Dependencies
├── src/                      # Production code
│   ├── index.js              # Main router
│   ├── handlers/             # Request handlers
│   ├── services/             # Business logic
│   ├── providers/            # AI integrations (Gemini, Google Books, etc.)
│   ├── durable-objects/      # WebSocket Durable Object
│   ├── middleware/           # CORS, rate limiting, validation
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Shared utilities
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

- **Book Search**: Google Books, OpenLibrary, ISBNdb
- **AI Bookshelf Scanning**: Gemini 2.0 Flash with 2M token context
- **CSV Import**: AI-powered parsing with zero configuration
- **Batch Enrichment**: Background job processing
- **WebSocket Progress**: Real-time updates for all background jobs
- **Cover Harvest**: Automated ISBNdb cover caching (5000 req/day)

See `ARCHITECTURE_OVERVIEW.md` for architecture details.

## API Endpoints

### Book Search
- `GET /v1/search/title?q={query}` - Title search (canonical response)
- `GET /v1/search/isbn?isbn={isbn}` - ISBN lookup with validation
- `GET /v1/search/advanced?title={title}&author={author}` - Flexible search

### Background Jobs
- `POST /v1/enrichment/batch` - Batch enrichment with WebSocket progress
- `POST /api/scan-bookshelf?jobId={uuid}` - AI bookshelf scan (Gemini 2.0 Flash)
- `POST /api/scan-bookshelf/batch` - Batch scan (max 5 photos)

### Status Updates
- `GET /ws/progress?jobId={uuid}` - WebSocket for real-time progress

### Health
- `GET /health` - Health check and endpoint listing

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

### Secrets (via `wrangler secret put`)
- `GOOGLE_BOOKS_API_KEY` - Google Books API authentication
- `GEMINI_API_KEY` - Gemini AI authentication
- `ISBNDB_API_KEY` - ISBNdb cover images

### Vars (in `wrangler.toml`)
- `OPENLIBRARY_BASE_URL` - OpenLibrary API base URL
- `CONFIDENCE_THRESHOLD` - AI detection confidence threshold (0.7)
- `MAX_SCAN_FILE_SIZE` - Maximum upload size (10485760 = 10MB)

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
- **[API Reference](docs/API_README.md)** - Canonical contracts, endpoints, and integration patterns
- **[Architecture Overview](ARCHITECTURE_OVERVIEW.md)** - Backend architecture and design principles
- **[Quick Start Guide](docs/QUICK_START.md)** - Fast setup and development workflow

### Deployment & Operations
- **[Deployment Guide](docs/deployment/DEPLOYMENT.md)** - Complete deployment guide with rollback procedures
- **[Staging Testing Guide](docs/STAGING_TESTING_GUIDE.md)** - Staging environment testing procedures
- **[Secrets Setup](docs/deployment/SECRETS_SETUP.md)** - Step-by-step guide for configuring GitHub secrets
- **[Monitoring Dashboard](docs/deployment/MONITORING_DASHBOARD.md)** - Cloudflare monitoring setup
- **[Alerting Rules](docs/deployment/ALERTING_RULES.md)** - Production alerting configuration
- **[Troubleshooting Runbook](docs/deployment/TROUBLESHOOTING_RUNBOOK.md)** - Common issue resolutions

### Feature Guides
- **[Cover Harvest System](docs/guides/ISBNDB-HARVEST-IMPLEMENTATION.md)** - ISBNdb cover caching (5000 req/day)
- **[Metrics & Monitoring](docs/guides/METRICS.md)** - Performance targets and monitoring
- **[WebSocket Migration](docs/WEBSOCKET_MIGRATION_IOS.md)** - iOS WebSocket client integration

### Reference
- **[Canonical API Workflows](docs/workflows/canonical-contracts-workflow.md)** - Visual process diagrams
- **[Historical Docs](docs/archives/)** - Completed deployments and historical notes
- **[Archived Plans](archive/plans/)** - Completed implementation plans and strategies

## License

MIT

## Related Projects

- **iOS App:** [books-tracker-v1](https://github.com/jukasdrj/books-tracker-v1)
- **App Store:** BooksTrack by oooe (Bundle ID: Z67H8Y8DW.com.oooefam.booksV3)
