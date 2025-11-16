# BooksTrack Backend - Project Context

**Stack:** Node.js, Cloudflare Workers, Durable Objects, KV Cache
**Architecture:** Monolithic worker with direct function calls
**Production:** https://api.oooefam.net

---

## Architecture Overview

### Core Principles
1. **Monolith Design:** Single worker, no RPC service bindings
2. **KV for Caching:** 24-hour TTL for book metadata
3. **Durable Objects:** WebSocket state management only
4. **External APIs:** Google Books, OpenLibrary, ISBNdb, Wikidata, Gemini AI

### Directory Structure
```
src/
├── index.js                    # Main router (minimal)
├── handlers/                   # Request handlers (one per route)
│   └── v1/                     # V1 canonical endpoints
├── services/                   # Business logic (reusable)
│   ├── enrichment.ts           # Multi-provider book enrichment
│   ├── wikidata-enrichment.ts  # Cultural diversity enrichment
│   └── normalizers/            # Provider → DTO transformations
├── durable-objects/            # WebSocket connection management
├── types/                      # TypeScript type definitions
│   ├── canonical.ts            # WorkDTO, EditionDTO, AuthorDTO
│   └── enums.ts                # EditionFormat, AuthorGender, etc.
└── utils/                      # Shared utilities
```

---

## API Contract

**SOURCE OF TRUTH:** `docs/API_CONTRACT.md`

### Response Envelope (All /v1/* endpoints)
```typescript
{
  data: T | null,
  metadata: {
    timestamp: string,
    processingTime?: number,
    provider?: string,
    cached?: boolean
  },
  error?: {
    message: string,
    code?: string,
    details?: any
  }
}
```

### Core DTOs
- **WorkDTO:** Abstract creative work (title, subjectTags, authors)
- **EditionDTO:** Physical/digital manifestation (ISBN, format, publisher)
- **AuthorDTO:** Creator (name, gender, culturalRegion, nationality)

**Cultural Diversity:**
- Authors enriched via Wikidata API
- 7-day KV cache, graceful fallback to "Unknown"

---

## Code Style

### JavaScript/TypeScript
- ES6+ features (async/await, destructuring, arrow functions)
- No semicolons (ASI)
- Single quotes for strings
- 2-space indentation

### Error Handling
```javascript
// Always wrap async operations
try {
  const book = await findByISBN(isbn, env);
  return createSuccessResponse(book);
} catch (error) {
  return createErrorResponse(error.message, 500, 'INTERNAL_ERROR');
}
```

### Cloudflare Workers Patterns
```javascript
// Access env bindings
const apiKey = env.GOOGLE_BOOKS_API_KEY;
const cache = env.KV_CACHE; // KV namespace

// KV caching with TTL
await env.KV_CACHE.put(cacheKey, JSON.stringify(data), {
  expirationTtl: 86400 // 24 hours
});
```

---

## External Integrations

| Provider | Purpose | Rate Limit | Cache TTL |
|----------|---------|------------|-----------|
| **Google Books** | Primary book search | 1000/day | 24h |
| **OpenLibrary** | Fallback, external IDs | Unlimited | 24h |
| **ISBNdb** | Cover images | 5000/day | 7 days |
| **Wikidata** | Author enrichment | Unlimited | 7 days |
| **Gemini 2.0 Flash** | Bookshelf scanning | Pay-per-use | N/A |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| **Uptime** | 99.9% |
| **Search P95** | < 500ms (uncached) |
| **Search P95** | < 50ms (cached) |
| **WebSocket Latency** | < 50ms |

---

## Common Patterns

### Creating a New v1 Endpoint
See: `.ai/prompts/new-endpoint.md`

### Modifying DTOs
See: `.ai/prompts/dto-changes.md`

### Wikidata Enrichment
See: `.ai/prompts/wikidata-query.md`

---

## Testing

### Unit Tests
- Framework: Vitest
- Location: `tests/unit/`
- Coverage target: > 80%

### Integration Tests
- Tool: `npx wrangler dev` (localhost:8787)
- Test against local worker instance

### Contract Tests
- Validate responses match `API_CONTRACT.md`
- GitHub Issue: #140 (Pact setup)

---

## Deployment

### Production
```bash
npx wrangler deploy
```

### Monitoring
```bash
npx wrangler tail --format pretty  # Stream logs
```

### Rollback
```bash
npx wrangler rollback --message "Rolling back due to error spike"
```

---

## Agent System

### Autonomous Agents
- **cf-ops-monitor:** Deployment, monitoring, rollback
- **cf-code-reviewer:** Code quality, Workers patterns, API contract compliance
- **Zen MCP:** Deep debugging, security audits, architectural analysis

### Invocation
```bash
/skill cf-code-reviewer        # Manual invocation
@cf-ops-monitor "deploy latest"  # Via mention
```

---

**Last Updated:** November 15, 2025
**For more details:** See `docs/API_CONTRACT.md` and `.claude/CLAUDE.md`
