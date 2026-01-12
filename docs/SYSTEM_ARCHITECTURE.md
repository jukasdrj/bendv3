# BooksTrack System Architecture

**Last Updated:** December 25, 2025  
**Last Reviewed:** January 11, 2026
**Author:** Justin + Claude  
**Purpose:** Cross-repo context for AI agents and future maintenance

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER DEVICES                                    │
│                         books-v3 (iOS Swift App)                            │
│                    ~/dev_repos/books-v3 • App Store Live                    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ HTTPS (api.oooefam.net)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE EDGE                                    │
│                         bendv3 (API Gateway)                                │
│                   ~/dev_repos/bendv3 • Cloudflare Workers                   │
│                                                                              │
│  Responsibilities:                                                           │
│  • User authentication & sessions (D1)                                       │
│  • Reading lists & library state (D1 + KV)                                   │
│  • Cache layer for book data (KV)                                           │
│  • Job orchestration (Durable Objects)                                       │
│  • AI features (Workers AI embeddings)                                       │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ Worker-to-Worker RPC (CF Access Service Token)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                                      │
│                      alex (Alexandria Worker)                               │
│                   ~/dev_repos/alex • Cloudflare Workers                     │
│                                                                              │
│  Responsibilities:                                                           │
│  • Book metadata serving (54M+ editions)                                     │
│  • Cover image storage & serving (R2)                                        │
│  • Provider fallback chain (Alexandria→Google→OpenLibrary→ISBNdb)           │
│  • Queue-based enrichment processing                                         │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ Hyperdrive + Cloudflare Tunnel
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HOME INFRASTRUCTURE                                │
│                     Unraid Server (Tower @ 192.168.1.240)                   │
│                                                                              │
│  PostgreSQL Database:                                                        │
│  • 14.7M authors, 40M works, 54M editions (OpenLibrary dump)                │
│  • Enriched tables with GIN trigram indexes for fuzzy search                │
│  • Connected via Cloudflare Tunnel (alexandria-db.ooheynerds.com)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Quick Reference

| Repo | Path | Purpose | Key Docs |
|------|------|---------|----------|
| **books-v3** | `~/dev_repos/books-v3` | iOS frontend | `CLAUDE.md`, `BooksTrackerPackage/` |
| **bendv3** | `~/dev_repos/bendv3` | API gateway worker | `CLAUDE.md`, `src/api-v3/` |
| **alex** | `~/dev_repos/alex` | Book data worker | `CLAUDE.md`, `worker/src/` |

---

## Service Communication

### bendv3 → Alexandria (Worker-to-Worker)

```typescript
// bendv3/src/services/alexandria-client.ts
// Uses Hono RPC client with CF-Access service token
const response = await alexandria.books[':isbn'].$get({ param: { isbn } });
```

**Authentication:** Cloudflare Access service token in Worker secrets (`ALEXANDRIA_ACCESS_CLIENT_ID`, `ALEXANDRIA_ACCESS_CLIENT_SECRET`)

### Alexandria → PostgreSQL

```typescript
// alex/worker/src/services/database.ts
// Uses Hyperdrive connection pooling
const result = await env.HYPERDRIVE.connect().query(sql);
```

**Connection:** Hyperdrive ID `00ff424776f4415d95245c3c4c36e854` → Tunnel → PostgreSQL

---

## Deployment Order

When making breaking changes:

1. **alex** (upstream) - Deploy first, ensure backward compatible
2. **bendv3** (gateway) - Deploy second, can use new alex features
3. **books-v3** (client) - Deploy last, requires App Store review

---

## Critical Infrastructure IDs

| Resource | ID/URL | Notes |
|----------|--------|-------|
| Alexandria Worker | `alexandria.ooheynerds.com` | Book metadata API |
| BendV3 Worker | `api.oooefam.net` | User-facing API |
| Hyperdrive | `00ff424776f4415d95245c3c4c36e854` | DB connection pool |
| Tunnel | `848928ab-4ab9-4733-93b0-3e7967c60acb` | DB access tunnel |
| Home IP | `47.187.18.143` | Cloudflare Access allowlist |

---

## For AI Agents

When working across repos, read the relevant `CLAUDE.md` files:

```bash
# From any terminal
cat ~/dev_repos/alex/CLAUDE.md      # Alexandria context
cat ~/dev_repos/bendv3/CLAUDE.md    # API gateway context  
cat ~/dev_repos/books-v3/CLAUDE.md  # iOS app context
```

**Key patterns to follow:**
- V3 API only (V1/V2 are sunset)
- Hono + Zod-OpenAPI for all HTTP routes
- RFC 9457 Problem Details for errors
- Canonical response envelope: `{ success, data, metadata }`


---

## Cloudflare Bindings Reference

### bendv3 Bindings

| Binding Name | Type | Resource | Purpose |
|-------------|------|----------|---------|
| `ALEXANDRIA` | Service Binding | alexandria | Book metadata RPC (sub-ms) |
| `DB` | D1 | bookstrack-library | User data, reading lists |
| `CACHE` | KV | b9cade63... | Response caching |
| `RECOMMENDATIONS_CACHE` | KV | be0ca707... | Weekly recommendations |
| `BOOKSHELF_IMAGES` | R2 | bookshelf-images | User scan uploads |
| `BOOK_COVERS` | R2 | bookstrack-covers | CDN cache for covers |
| `AI` | Workers AI | - | Text embeddings |
| `BOOK_VECTORS` | Vectorize | book-embeddings | Semantic search (1024d) |
| `RATE_LIMITER_DO` | Durable Object | - | Global rate limiting |
| `JOB_STATE_MANAGER_DO` | Durable Object | - | Import/scan job state |
| `WEBSOCKET_CONNECTION_DO` | Durable Object | - | SSE/WebSocket sessions |
| `PERFORMANCE_ANALYTICS` | Analytics Engine | books_api_performance | Request metrics |
| `CACHE_ANALYTICS` | Analytics Engine | books_api_cache_metrics | Cache hit rates |

### alex (Alexandria) Bindings

| Binding Name | Type | Resource | Purpose |
|-------------|------|----------|---------|
| `HYPERDRIVE` | Hyperdrive | 00ff4247... | PostgreSQL connection pool |
| `CACHE` | KV | dd278b63... | Query result caching |
| `COVER_IMAGES` | R2 | bookstrack-covers-processed | Canonical cover storage |
| `ENRICHMENT_QUEUE` | Queue | alexandria-enrichment-queue | Async metadata enrichment |
| `COVER_QUEUE` | Queue | alexandria-cover-queue | Async cover downloads |
| `ANALYTICS` | Analytics Engine | alexandria_performance | Request metrics |
| `QUERY_ANALYTICS` | Analytics Engine | alexandria_queries | DB query metrics |
| `ISBNDB_API_KEY` | Secret Store | - | ISBNdb Premium API |
| `GOOGLE_BOOKS_API_KEY` | Secret Store | - | Google Books fallback |

---

## Architecture Decision Records

Key decisions are documented in each repo:

- **bendv3**: `docs/CACHE_ARCHITECTURE.md` - Multi-tier caching strategy
- **alex**: `docs/reference/ENRICHMENT_ARCHITECTURE.md` - Provider fallback chain
- **alex**: `docs/CLOUDFLARE-API-VS-WRANGLER.md` - Infrastructure management approach

---

## Common Operations

### Check System Health

```bash
# Alexandria
cd ~/dev_repos/alex && ./scripts/tunnel-status.sh && ./scripts/db-check.sh

# BendV3
cd ~/dev_repos/bendv3 && npm run test:smoke

# iOS (build check)
cd ~/dev_repos/books-v3 && xcodebuild -scheme BooksTracker build
```

### View Worker Logs

```bash
# Alexandria
cd ~/dev_repos/alex/worker && npx wrangler tail --format pretty

# BendV3
cd ~/dev_repos/bendv3 && npx wrangler tail --format pretty
```

### Deploy Workers

```bash
# Always deploy alex first if making shared changes
cd ~/dev_repos/alex/worker && npm run deploy
cd ~/dev_repos/bendv3 && npm run deploy
```
