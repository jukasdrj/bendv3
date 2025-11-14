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
├── docs/                     # Documentation
│   ├── deployment/           # Deployment guides (DEPLOYMENT.md, SECRETS_SETUP.md)
│   ├── guides/               # Feature guides (Metrics, Verification, etc.)
│   ├── plans/                # Implementation plans and architecture docs
│   ├── workflows/            # Workflow diagrams and processes
│   ├── robit/                # AI automation setup docs
│   ├── archives/             # Historical documentation
│   ├── API_README.md         # **START HERE** - API contracts and integration guide
│   └── FRONTEND_HANDOFF.md   # Frontend integration guide (iOS, Flutter)
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

See `MONOLITH_ARCHITECTURE.md` for architecture details.

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

### Health Check

```bash
curl https://api.oooefam.net/health
```

### Search Endpoints

```bash
# Title search
curl "https://api.oooefam.net/v1/search/title?q=hamlet"

# ISBN search
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780743273565"

# Advanced search
curl "https://api.oooefam.net/v1/search/advanced?title=1984&author=Orwell"
```

### WebSocket Flow

1. Connect to WebSocket:
```bash
wscat -c "wss://api.oooefam.net/ws/progress?jobId=test-123"
```

2. Trigger background job:
```bash
curl -X POST https://api.oooefam.net/v1/enrichment/batch \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","workIds":["9780439708180"]}'
```

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
- **[Frontend Integration Guide](docs/FRONTEND_HANDOFF.md)** - iOS and Flutter integration guidance

### Deployment & Operations
- **[Deployment Guide](docs/deployment/DEPLOYMENT.md)** - Complete deployment guide with rollback procedures
- **[Secrets Setup](docs/deployment/SECRETS_SETUP.md)** - Step-by-step guide for configuring GitHub secrets

### Feature Guides
- **[Cover Harvest System](docs/guides/ISBNDB-HARVEST-IMPLEMENTATION.md)** - ISBNdb cover caching (5000 req/day)
- **[Metrics & Monitoring](docs/guides/METRICS.md)** - Performance targets and monitoring
- **[Verification Guide](docs/guides/VERIFICATION.md)** - Testing and validation procedures

### Implementation Plans
- **[Canonical API Contracts](docs/plans/2025-11-11-canonical-api-contract-implementation.md)** - TypeScript/Swift data contracts
- **[Architecture Workflow](docs/workflows/canonical-contracts-workflow.md)** - Visual process diagrams

### Reference
- **[Architecture Overview](MONOLITH_ARCHITECTURE.md)** - Backend architecture and design principles
- **[Historical Docs](docs/archives/)** - Archived deployment notes and completed initiatives

## License

MIT

## Related Projects

- **iOS App:** [books-tracker-v1](https://github.com/jukasdrj/books-tracker-v1)
- **App Store:** BooksTrack by oooe (Bundle ID: Z67H8Y8DW.com.oooefam.booksV3)
