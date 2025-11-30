# bendv3 - BooksTrack Backend API
# Cloudflare Workers Backend - Claude Code Development Guide

**Project**: bendv3 (BooksTrack Backend)  
**Location**: `/Users/juju/dev_repos/bendv3`  
**Stack**: Cloudflare Workers, Hono Router, D1, KV, R2, Hyperdrive, Durable Objects, Queues  
**Production**: https://api.oooefam.net  
**Repository**: https://github.com/jukasdrj/bendv3

---

## Project Overview

bendv3 is a comprehensive backend API for BooksTrack, a personal library management system. It provides book metadata enrichment, search capabilities, AI-powered book scanning, and user library management through Cloudflare's edge infrastructure.

### Key Features

- **Multi-Provider Book Enrichment**: Alexandria (local, 54.8M books) → Google Books → OpenLibrary → ISBNdb
- **Smart Caching**: D1 + KV dual-write architecture with intelligent routing
- **AI Book Scanning**: Gemini Vision API for barcode/spine recognition
- **Real-time Progress**: WebSocket support via Durable Objects with hibernation
- **Background Processing**: Cloudflare Queues for async enrichment and cache warming
- **Vector Search**: Semantic book discovery via Cloudflare Vectorize
- **Workflow Engine**: Cloudflare Workflows for complex book import pipelines

---

## Recent Development: Alexandria Integration ✅

**Status**: COMPLETE (November 30, 2025)

### What Was Accomplished

Successfully integrated Alexandria (self-hosted 54.8M book OpenLibrary database) as the primary metadata provider for bendv3. This eliminates expensive API costs and provides sub-100ms response times.

**Key Metrics**:
- ✅ Response Time: 78ms (target: <100ms)
- ✅ Database Size: 54.8M editions, 49.3M ISBNs
- ✅ Cost per Lookup: $0 (previously ~$0.01/book with ISBNdb)
- ✅ Provider Priority: Alexandria → Google Books → OpenLibrary → ISBNdb

### Files Modified

1. **src/services/book-service.ts**
   - Fixed D1 cache logic to fall through to enrichment when cached metadata is empty
   
2. **Alexandria Hyperdrive Configuration**
   - Updated Access Client ID/Secret for secure database tunnel access

3. **Worker Secrets**
   - Added `ALEXANDRIA_CLIENT_ID` and `ALEXANDRIA_CLIENT_SECRET` for CF-Access authentication

### Integration Flow

```
Client Request (ISBN)
  ↓
Hono Router → book-service.ts
  ↓
Check D1 Cache (has ISBN metadata?)
  ├─ Yes, with works → Return cached
  └─ No/Empty → enrichment.ts
       ↓
     Alexandria API (PRIMARY)
       ├─ Success → Cache to D1/KV → Return
       └─ Fail → Google Books → OpenLibrary → ISBNdb
```

### Documentation

See `ALEXANDRIA-INTEGRATION-SUCCESS.md` for complete details including:
- Root cause analysis
- Solution implementation
- Test results
- Architecture diagrams
- Performance metrics

---

## Architecture Overview

### Provider Chain (ISBN Lookups)

```
1. Alexandria (LOCAL)   → 54.8M editions, FREE, sub-100ms
2. Google Books         → Free tier, good coverage
3. OpenLibrary          → Free, large dataset
4. ISBNdb              → Paid ($0.01/book), premium quality
```

### Data Flow Layers

```
┌─────────────────────────────────────────────────────┐
│                   Hono Router                       │
│            (v1/* endpoints + legacy)                │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│              book-service.ts                        │
│    (Single source of truth for book access)         │
└──────────────────────┬──────────────────────────────┘
                       ↓
          ┌────────────┴────────────┐
          ↓                         ↓
┌──────────────────┐    ┌─────────────────────────┐
│  BookRepository  │    │  enrichment.ts          │
│  (D1/KV Cache)   │    │  (External API Layer)   │
└──────────────────┘    └─────────────────────────┘
          │                         │
          │                         ↓
          │              ┌───────────────────────┐
          │              │ Multi-Provider Chain  │
          │              │ Alexandria → GB → OL  │
          │              └───────────────────────┘
          ↓
┌─────────────────────────────────────────────────────┐
│           Canonical DTO Response                    │
│      (works, editions, authors)                     │
└─────────────────────────────────────────────────────┘
```

---

## Development Workflows

### Deployment

```bash
cd /Users/juju/dev_repos/bendv3
npx wrangler deploy  # Deploy to production
npx wrangler dev     # Local development server
```

### Testing

```bash
# ISBN Search (Alexandria integration)
curl "https://api.oooefam.net/v1/search/isbn?isbn=9780439064873"

# Title Search
curl "https://api.oooefam.net/v1/search/title?q=harry%20potter"

# Health Check
curl "https://api.oooefam.net/health"
```

### Viewing Logs

```bash
npx wrangler tail --format pretty
```

### Managing Secrets

```bash
# Add/Update secrets
npx wrangler secret put ALEXANDRIA_CLIENT_ID
npx wrangler secret put GOOGLE_BOOKS_API_KEY

# List secrets
npx wrangler secret list

# Delete secret
npx wrangler secret delete SECRET_NAME
```

---

## Key Dependencies

### Cloudflare Resources

- **Workers**: Serverless JavaScript runtime
- **D1**: SQLite database (primary cache)
- **KV**: Key-value store (secondary cache)
- **R2**: Object storage (book covers, large payloads)
- **Hyperdrive**: PostgreSQL connection pooling (Alexandria)
- **Durable Objects**: Stateful WebSocket connections
- **Queues**: Background job processing
- **Vectorize**: Vector embeddings for semantic search
- **Workflows**: Multi-step orchestration

### External APIs

- **Alexandria**: Local OpenLibrary database (54.8M books)
- **Google Books API**: Free metadata provider
- **OpenLibrary API**: Free, open dataset
- **ISBNdb API**: Premium paid metadata
- **Gemini Vision**: AI book scanning
- **Wikidata**: Author cultural enrichment

---

## Project Structure

```
/Users/juju/dev_repos/bendv3/
├── src/
│   ├── index.js                    # Main worker entry point
│   ├── router-hono.ts              # Hono router (v1/* endpoints)
│   ├── handlers/
│   │   └── v1/
│   │       ├── search-isbn.ts      # ISBN lookup handler
│   │       ├── search-title.ts     # Title search handler
│   │       └── ...
│   ├── services/
│   │   ├── book-service.ts         # Main book access layer ✨
│   │   ├── enrichment.ts           # Multi-provider enrichment ✨
│   │   ├── alexandria-api.ts       # Alexandria client ✨
│   │   ├── external-apis.ts        # Google Books, OpenLibrary
│   │   ├── isbndb-api.ts          # ISBNdb client
│   │   └── ...
│   ├── repositories/
│   │   └── book-repository.ts      # D1/KV abstraction
│   └── types/
│       ├── canonical.ts            # DTOs (WorkDTO, EditionDTO, AuthorDTO)
│       └── database.ts             # BookRecord schema
├── wrangler.jsonc                  # Cloudflare configuration
├── package.json
└── ALEXANDRIA-INTEGRATION-SUCCESS.md  # Recent work details ✨
```

**✨** = Recently modified/created for Alexandria integration

---

## Configuration (wrangler.jsonc)

### Environment Variables

```javascript
{
  // Alexandria Integration
  "ENABLE_HONO_ROUTER": "true",
  
  // Cache Configuration
  "CACHE_HOT_TTL": "7200",          // 2 hours
  "CACHE_COLD_TTL": "1209600",      // 14 days
  
  // D1 Migration (Phase 2 - D1 Primary)
  "ENABLE_D1_WRITES": "true",
  "D1_READ_PERCENTAGE": "100",      // 100% reads from D1
  
  // Feature Flags
  "ENABLE_REFACTORED_DOS": "true",
  "ENABLE_HIBERNATION_WEBSOCKET": "true",
  "ENABLE_UNIFIED_ENVELOPE": "true"
}
```

### Bindings

- `CACHE`: KV Namespace (hot cache)
- `DB`: D1 Database (bookstrack-library)
- `LIBRARY_DATA`: R2 Bucket (personal-library-data)
- `BOOKSHELF_IMAGES`: R2 Bucket (user uploads)
- `BOOK_COVERS`: R2 Bucket (cover images)
- `BOOK_VECTORS`: Vectorize Index (semantic search)
- `AI`: Workers AI (Gemini integration)
- `GEMINI_API_KEY`: Secrets Store (google_gemini_oooebooks)
- `GOOGLE_BOOKS_API_KEY`: Secrets Store
- `ISBNDB_API_KEY`: Secrets Store
- `ALEXANDRIA_CLIENT_ID`: Worker Secret ✨
- `ALEXANDRIA_CLIENT_SECRET`: Worker Secret ✨

---

## Testing & Debugging

### Common Issues

1. **Empty Results Despite D1 Cache Hit**
   - **Cause**: Book cached before enrichment was added
   - **Fix**: `book-service.ts` now falls through to enrichment if `canonicalMetadata.works` is empty

2. **Alexandria 403 Errors**
   - **Cause**: Missing/outdated Cloudflare Access credentials
   - **Fix**: Ensure Hyperdrive has correct `access_client_id` and `access_client_secret`

3. **Slow Response Times**
   - **Check**: D1 read percentage (`D1_READ_PERCENTAGE`)
   - **Check**: Cache TTLs are appropriate
   - **Check**: Alexandria Hyperdrive connection pool

### Debugging Tools

```bash
# View real-time logs
npx wrangler tail --format pretty

# Check D1 database
npx wrangler d1 execute bookstrack-library --command "SELECT COUNT(*) FROM books"

# Test Alexandria directly
curl -H "CF-Access-Client-Id: ..." \
     -H "CF-Access-Client-Secret: ..." \
     "https://alexandria.ooheynerds.com/api/search?isbn=9780439064873"
```

---

## Related Projects

### Alexandria (Book Metadata Database)
- **Location**: `/Users/juju/dev_repos/alex`
- **Purpose**: Self-hosted OpenLibrary PostgreSQL dump
- **URL**: https://alexandria.ooheynerds.com
- **Database**: 54.8M editions, 49.3M ISBNs
- **See**: `/mnt/project/ALEXANDRIA_SCHEMA.md`

### books-v3 (iOS Swift Frontend)
- **Location**: `/Users/juju/dev_repos/books-v3`
- **Repository**: https://github.com/jukasdrj/books-v3
- **Purpose**: iOS client for BooksTrack

---

## Next Steps

### Immediate Tasks

1. **Performance Monitoring**
   - Track Alexandria vs fallback provider usage
   - Monitor cache hit rates
   - Measure p95/p99 latencies
   - Set up alerts for degraded performance

2. **Data Quality Improvements**
   - Background job to re-enrich books with empty `canonicalMetadata`
   - Wikidata author enrichment for all cached books
   - Cover image quality verification

3. **Alexandria Enhancements**
   - Phase 3: Title/Author search support
   - Real-time OpenLibrary updates
   - Author enrichment from Alexandria's author table

### Future Features

- **Recommendation Engine**: Collaborative filtering + vector search
- **Reading Analytics**: Progress tracking, reading goals
- **Social Features**: Book clubs, friend libraries
- **Export/Import**: Goodreads, LibraryThing integrations

---

## Resources

### Documentation
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)

### Project Docs
- `ALEXANDRIA-INTEGRATION-SUCCESS.md` - Recent integration details
- `ALEXANDRIA-ACCESS-SETUP.md` - CF-Access setup guide
- `/mnt/project/ALEXANDRIA_SCHEMA.md` - Database schema
- `/mnt/project/repos.md` - Repository locations

---

## Contact & Support

**Developer**: Justin  
**Primary AI Assistant**: Claude (Anthropic)  
**Session Date**: November 29-30, 2025

---

## Status Summary

**Production Status**: ✅ DEPLOYED  
**Alexandria Integration**: ✅ COMPLETE  
**Test Coverage**: ⚠️ Minimal (needs expansion)  
**Performance**: ✅ Sub-100ms (78ms average)  
**Cost**: ✅ Optimized ($5.15/month for unlimited queries)

**Last Updated**: November 30, 2025  
**Version**: 1.0 (Post-Alexandria Integration)
