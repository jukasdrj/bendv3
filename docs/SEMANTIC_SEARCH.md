# Semantic Search Architecture

**Version:** 1.0 | **Created:** November 25, 2025 | **Sprint:** 3 Phase 2

## Overview

BooksTrack uses Cloudflare Vectorize for semantic book discovery. This enables:
- **Similar Books**: Find books similar to a given book
- **Natural Language Search**: Search using descriptive queries

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Layer                                │
│  GET /v1/search/similar?isbn=XXX                                │
│  GET /v1/search/semantic?q=fantasy+wizards                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Embedding Service                              │
│  - generateBookEmbedding(book) → 1024-dim vector                │
│  - generateQueryEmbedding(query) → 1024-dim vector              │
│  - findSimilarBooks(isbn) → ranked results                      │
│  - semanticSearch(query) → ranked results                       │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Workers AI    │  │    Vectorize    │  │      D1         │
│  @cf/baai/bge-m3│  │  BOOK_VECTORS   │  │  Book Metadata  │
│  (embeddings)   │  │  (vector store) │  │  (enrichment)   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Configuration

### Vectorize Index Setup

```bash
# Create Vectorize index (one-time setup)
npx wrangler vectorize create book-embeddings \
  --dimensions 1024 \
  --metric cosine
```

### Wrangler Configuration

```jsonc
// wrangler.jsonc
{
  "vectorize": [
    {
      "binding": "BOOK_VECTORS",
      "index_name": "book-embeddings"
    }
  ]
}
```

### Environment Types

```typescript
// src/types/env.ts
export interface Env {
  // ... existing bindings ...

  // Vectorize (Sprint 3 - Semantic Search)
  BOOK_VECTORS?: VectorizeIndex
}
```

## Embedding Model

**Model:** `@cf/baai/bge-m3`
- **Dimensions:** 1024
- **Languages:** Multilingual (100+ languages)
- **Max Input:** 8192 tokens (~512 characters recommended)
- **Distance Metric:** Cosine similarity

### Text Representation

Each book is embedded using a combined text representation:

```typescript
const text = [
  book.title,
  `by ${book.author}`,
  book.description,
  book.categories?.join(', '),
].filter(Boolean).join('. ').substring(0, 512)
```

## API Endpoints

### Similar Books

```http
GET /v1/search/similar?isbn=9780439708180&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": { "isbn": "9780439708180", "limit": 5 },
    "results": [
      {
        "isbn": "9780439064866",
        "score": 0.92,
        "title": "Harry Potter and the Chamber of Secrets",
        "author": "J.K. Rowling"
      }
    ],
    "count": 5
  },
  "metadata": {
    "source": "vectorize",
    "timestamp": "2025-11-25T12:00:00Z"
  }
}
```

### Semantic Search

```http
GET /v1/search/semantic?q=fantasy+books+about+wizards&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": { "q": "fantasy books about wizards", "limit": 10 },
    "results": [
      {
        "isbn": "9780439708180",
        "score": 0.89,
        "title": "Harry Potter and the Philosopher's Stone",
        "author": "J.K. Rowling"
      }
    ],
    "count": 10
  }
}
```

## Workflow Integration

Embeddings are generated automatically during book import:

```typescript
// src/workflows/import-book.ts
// Step 5: Generate and store embedding
await step.do('generate-embedding', async () => {
  const result = await generateBookEmbedding(book, env)
  if (result) {
    await storeEmbedding(result, { isbn, title, author }, env)
  }
})
```

## Performance Targets

| Operation | Target Latency |
|-----------|---------------|
| Embedding generation | < 100ms |
| Similarity search | < 200ms |
| Semantic search | < 300ms |
| Batch embedding (50 books) | < 5s |

## Cost Considerations

- **Workers AI:** Free tier includes 10,000 neurons/day
- **Vectorize:** Free tier includes 30M vector dimensions stored
- **Estimated cost:** $0 for typical usage (< 1000 books/day)

## Fallback Behavior

When Vectorize is not configured:
1. Semantic search endpoints return `503 FEATURE_NOT_AVAILABLE`
2. Workflow embedding step logs warning but continues
3. Book import completes without embeddings

## Testing

### Local Testing

```bash
# Generate embedding for a book
curl "http://localhost:8787/v1/search/semantic?q=test+query"

# Find similar books
curl "http://localhost:8787/v1/search/similar?isbn=9780439708180"
```

### Validation

```bash
# Check Vectorize index
npx wrangler vectorize info book-embeddings

# Query vector count
npx wrangler vectorize query book-embeddings --count
```

## Related Issues

- Issue #25: Vectorize Setup & Embedding Infrastructure
- Issue #26: Workflow Integration for Embedding Generation
- Issue #30: Sprint 3 Performance Validation

---
**Last Updated:** November 25, 2025
