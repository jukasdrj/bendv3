---
name: BooksTrack Backend Repository Guide
type: knowledge
version: 1.0.0
agent: CodeActAgent
---

# BooksTrack Backend Repository

## Purpose

BooksTrack Backend is a **Cloudflare Workers API** that provides book search, enrichment, and AI-powered scanning capabilities. It serves as the backend for the BooksTrack iOS app, offering comprehensive book management features including:

- **Book Search**: Multi-provider search across Google Books, OpenLibrary, and ISBNdb
- **AI Bookshelf Scanning**: Gemini 2.0 Flash with 2M token context for visual book recognition
- **CSV Import**: AI-powered parsing with zero configuration
- **Batch Enrichment**: Background job processing with real-time progress updates
- **Cover Harvest**: Automated ISBNdb cover caching (5000 requests/day)
- **WebSocket Progress**: Real-time updates for all background jobs

**Production URL:** https://api.oooefam.net  
**Harvest Dashboard:** https://harvest.oooefam.net

## General Setup

### Technology Stack
- **Runtime**: Cloudflare Workers (Edge Computing)
- **Framework**: Hono.js for routing and middleware
- **Language**: JavaScript/TypeScript (ES modules)
- **Testing**: Vitest with 75% coverage target
- **AI Integration**: Google Gemini 2.0 Flash
- **Storage**: Cloudflare KV, R2, and Durable Objects

### Development Environment
```bash
npm install
npx wrangler dev    # Local development
npm test           # Run test suite
npm run deploy     # Deploy to production
```

### Key Configuration Files
- `wrangler.toml`: Cloudflare Workers configuration with environment variables
- `package.json`: Dependencies (Hono, Vitest, Wrangler)
- `vitest.config.js`: Testing configuration with coverage thresholds

## Repository Structure

```
.
├── src/                      # Production code
│   ├── index.js              # Main router and exports
│   ├── router.ts             # Hono router configuration
│   ├── handlers/             # Request handlers
│   │   ├── v1/               # API v1 endpoints
│   │   ├── batch-*.ts        # Batch processing handlers
│   │   ├── search-*.js       # Search functionality
│   │   └── scheduled-*.js    # Cron job handlers
│   ├── services/             # Business logic
│   │   ├── ai-scanner.js     # Gemini AI integration
│   │   ├── enrichment.ts     # Book data enrichment
│   │   ├── external-apis.ts  # Third-party API clients
│   │   └── normalizers/      # Data normalization
│   ├── providers/            # AI integrations (Gemini, Google Books)
│   ├── durable-objects/      # WebSocket and state management
│   ├── middleware/           # CORS, rate limiting, validation
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Shared utilities
├── tests/                    # Comprehensive test suite
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── handlers/             # Handler-specific tests
│   ├── normalizers/          # Data normalization tests
│   ├── utils/                # Utility function tests
│   └── assets/               # Test images and fixtures
├── docs/                     # Active documentation
│   ├── API_CONTRACT.md       # **START HERE** - API contracts
│   ├── deployment/           # Deployment guides, monitoring
│   ├── guides/               # Feature implementation guides
│   ├── workflows/            # Workflow diagrams
│   └── archives/             # Historical documentation
├── archive/                  # Completed plans and outdated docs
├── scripts/                  # Utility and development scripts
└── .github/                  # GitHub configuration (no workflows yet)
```

### Key Architecture Components

1. **Single Monolith Worker**: Direct function calls without RPC service bindings
2. **Durable Objects**: WebSocket connections, rate limiting, job state management
3. **Multi-Provider Search**: Unified interface across Google Books, OpenLibrary, ISBNdb
4. **AI-Powered Features**: Gemini integration for bookshelf scanning and CSV parsing
5. **Real-time Updates**: WebSocket progress reporting for background jobs
6. **Edge Caching**: Cloudflare KV and R2 for performance optimization

## CI/CD and Quality Checks

### Current Status
- **No GitHub Actions workflows** are currently configured
- **No pre-commit hooks** or linting tools detected
- **No ESLint/Prettier** configuration found

### Testing Infrastructure
- **Test Framework**: Vitest with Node.js environment
- **Coverage Target**: 75% overall project coverage
- **Component-specific targets**:
  - Validators: 100%
  - Normalizers: 100%
  - Auth: 100%
  - Cache: 90%+
  - External APIs: 85%+
  - Enrichment: 85%+
  - WebSocket DO: 80%+
  - Handlers: 75%+
  - Services: 70%+

### Test Commands
```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run test:ui       # Run tests in Vitest UI
npm run test:e2e      # End-to-end tests
```

### Deployment
- **Manual deployment**: `npm run deploy` or `npx wrangler deploy`
- **Production monitoring**: `npx wrangler tail --remote --format pretty`
- **Custom domains**: api.oooefam.net, harvest.oooefam.net

### Environment Variables
**Secrets** (via `wrangler secret put`):
- `GOOGLE_BOOKS_API_KEY`
- `GEMINI_API_KEY`
- `ISBNDB_API_KEY`

**Variables** (in `wrangler.toml`):
- `OPENLIBRARY_BASE_URL`
- `CONFIDENCE_THRESHOLD`
- `MAX_SCAN_FILE_SIZE`

## Related Projects
- **iOS App**: [books-tracker-v1](https://github.com/jukasdrj/books-tracker-v1)
- **App Store**: BooksTrack by oooe (Bundle ID: Z67H8Y8DW.com.oooefam.booksV3)