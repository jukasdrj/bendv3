# @bookstrack/api-client

**Official TypeScript SDK for BooksTrack V3 API**

Auto-generated from OpenAPI specification using `openapi-typescript` + `openapi-fetch`.

> **Version 2.0** - V3 API only. V1/V2 endpoints have been sunset.

## Features

- **Type-Safe** - Full TypeScript support with auto-generated types
- **Lightweight** - ~2KB gzipped client (tree-shakable)
- **Modern** - Uses native `fetch` API (works in browser, Node.js, Cloudflare Workers)
- **Auto-Generated** - Always in sync with API contract via OpenAPI spec

---

## Installation

```bash
npm install @bookstrack/api-client
```

**Note:** This package is published to GitHub Packages. Ensure your `.npmrc` is configured:

```
@bookstrack:registry=https://npm.pkg.github.com
```

---

## Quick Start

### Basic Usage

```typescript
import { createBooksTrackClient } from '@bookstrack/api-client'

const client = createBooksTrackClient({
  baseUrl: 'https://api.oooefam.net'
})

// Get API capabilities (call on app startup)
const { data: caps } = await client.GET('/v3/capabilities')
console.log('API Version:', caps.data.apiVersion)

// Search books by title
const { data, error } = await client.GET('/v3/books/search', {
  params: { query: { q: 'harry potter' } }
})

if (error) {
  console.error('API Error:', error)
} else {
  console.log('Books:', data.data.books)
}

// Get book by ISBN
const { data: book } = await client.GET('/v3/books/{isbn}', {
  params: { path: { isbn: '9780439708180' } }
})
```

### Advanced Usage

#### Custom Headers (Authentication)

```typescript
const client = createBooksTrackClient({
  baseUrl: 'https://api.oooefam.net',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
})
```

#### POST Requests (Book Enrichment)

```typescript
const { data, error } = await client.POST('/v3/books/enrich', {
  body: {
    isbns: ['9780439708180', '9780316769488'],
    includeEmbedding: false
  }
})

if (error) {
  console.error('Failed to enrich:', error)
} else {
  console.log('Enriched:', data.data.books)
}
```

#### Progress Streaming (SSE vs WebSocket)

BooksTrack uses **two streaming protocols** depending on the use case:

- **SSE** for CSV imports (one-way, auto-reconnect)
- **WebSocket** for batch enrichment (bidirectional, cancel support)

**SSE Example (CSV Import):**
```typescript
const { data } = await client.POST('/api/v2/imports', { body: formData })
const { sseUrl } = data.data

const eventSource = new EventSource(sseUrl)
eventSource.addEventListener('progress', (e) => {
  const update = JSON.parse(e.data)
  console.log(`Progress: ${update.progress * 100}%`)
})
```

**WebSocket Example (Batch Enrichment):**
```typescript
const { data } = await client.POST('/v1/enrichment/batch', {
  body: { books: [...], jobId: crypto.randomUUID() }
})

const ws = new WebSocket(data.data.websocketUrl, [data.data.authToken])
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  console.log(`Progress: ${message.progress * 100}%`)
}
```

📖 **See [STREAMING_GUIDE.md](./STREAMING_GUIDE.md) for complete SSE/WebSocket documentation**

#### Polling Job Status (Fallback)

```typescript
const { data } = await client.GET('/v1/jobs/{jobId}/status', {
  params: { path: { jobId: 'job-uuid' } }
})

console.log('Job Status:', data.data.status)
console.log('Progress:', data.data.progress)
```

---

## API Reference

### Client Creation

```typescript
createBooksTrackClient(options?: {
  baseUrl?: string
  headers?: HeadersInit
  credentials?: RequestCredentials
})
```

### Available Endpoints

All endpoints are fully typed. Use TypeScript autocomplete to explore:

- `GET /health` - Health check
- `GET /v1/search/isbn` - Search by ISBN
- `GET /v1/search/title` - Search by title
- `POST /v1/enrich/batch` - Batch enrichment
- `POST /v2/import/workflow` - CSV import workflow
- `GET /v1/jobs/{jobId}/status` - Job status polling
- `GET /ws/progress` - WebSocket progress (upgrade)

### Response Format

All API responses follow the canonical `ResponseEnvelope` format:

**Success:**
```typescript
{
  success: true,
  data: { /* canonical book object */ },
  metadata: {
    source: 'google_books',
    cached: true,
    timestamp: '2025-01-10T12:00:00Z'
  }
}
```

**Error:**
```typescript
{
  success: false,
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests',
    statusCode: 429,
    retryable: true,
    retryAfterMs: 60000
  }
}
```

---

## Error Handling

### Circuit Breaker Errors

The API uses circuit breakers for external providers. Handle these gracefully:

```typescript
const { data, error } = await client.GET('/v1/search/isbn', {
  params: { query: { isbn: '...' } }
})

if (error) {
  if (error.code === 'CIRCUIT_OPEN') {
    // Provider is temporarily unavailable
    console.warn('Provider down, try again in 60s')
  } else if (error.retryable) {
    // Safe to retry after retryAfterMs
    setTimeout(() => retry(), error.retryAfterMs)
  }
}
```

### Common Error Codes

- `MISSING_ISBN` - Required parameter missing
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `CIRCUIT_OPEN` - External provider circuit breaker open
- `NOT_FOUND` - Book not found
- `API_ERROR` - External API failure
- `INTERNAL_ERROR` - Server error

---

## Development

### Generating Types

The SDK is auto-generated from `docs/openapi.yaml`:

```bash
npm run generate
```

This creates `src/schema.ts` with all API types.

### Building

```bash
npm run build
```

Output: `dist/index.js` and `dist/index.d.ts`

### Publishing (Automated via CI/CD)

Publishing is handled automatically by GitHub Actions when:
- Pushing to `main` branch
- Creating a new release/tag

Manual publish:
```bash
npm run prepublishOnly
npm publish
```

---

## Framework Examples

### React (with React Query)

```typescript
import { useQuery } from '@tanstack/react-query'
import { client } from '@bookstrack/api-client'

function BookSearch({ isbn }: { isbn: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['book', isbn],
    queryFn: async () => {
      const res = await client.GET('/v1/search/isbn', {
        params: { query: { isbn } }
      })
      if (res.error) throw new Error(res.error.message)
      return res.data.data
    }
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{data?.title}</div>
}
```

### Vue 3 (with Composition API)

```typescript
import { ref } from 'vue'
import { client } from '@bookstrack/api-client'

export function useBookSearch(isbn: string) {
  const book = ref(null)
  const error = ref(null)
  const loading = ref(false)

  async function search() {
    loading.value = true
    const res = await client.GET('/v1/search/isbn', {
      params: { query: { isbn } }
    })

    if (res.error) {
      error.value = res.error
    } else {
      book.value = res.data.data
    }
    loading.value = false
  }

  return { book, error, loading, search }
}
```

### Svelte

```typescript
import { writable } from 'svelte/store'
import { client } from '@bookstrack/api-client'

export function createBookStore() {
  const { subscribe, set, update } = writable({
    book: null,
    loading: false,
    error: null
  })

  async function searchByISBN(isbn: string) {
    update(s => ({ ...s, loading: true }))

    const { data, error } = await client.GET('/v1/search/isbn', {
      params: { query: { isbn } }
    })

    if (error) {
      set({ book: null, loading: false, error })
    } else {
      set({ book: data.data, loading: false, error: null })
    }
  }

  return { subscribe, searchByISBN }
}
```

---

## Migration from Legacy API

If you're migrating from the old `/search/*` endpoints (deprecated March 1, 2026):

### Before (Legacy)

```typescript
const res = await fetch('https://api.oooefam.net/search/isbn?isbn=123')
const book = await res.json()
```

### After (SDK)

```typescript
import { client } from '@bookstrack/api-client'

const { data } = await client.GET('/v1/search/isbn', {
  params: { query: { isbn: '123' } }
})

const book = data.data
```

**Key Changes:**
- All responses now use `ResponseEnvelope` format
- Success/error discriminator via `success` field
- Metadata includes source, cache status, timestamp
- Error responses include structured error codes

---

## Support

- **Documentation:** https://github.com/yourusername/bendv3/tree/main/docs
- **API Contract:** https://github.com/yourusername/bendv3/blob/main/docs/openapi.yaml
- **Issues:** https://github.com/yourusername/bendv3/issues

---

## License

MIT

---

**Generated from OpenAPI Spec Version:** (auto-updated on publish)
**Last Updated:** 2025-11-28
