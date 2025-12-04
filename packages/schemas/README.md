# @bookstrack/schemas

Shared Zod schemas for BooksTrack API - Backend + Frontend contract.

## Features

- **RFC 9457 Problem Details** - Standardized error responses
- **Zod v4** - Runtime validation with TypeScript type inference
- **Tree-shakeable** - Only import what you need
- **Dual format** - ESM and CommonJS support

## Installation

```bash
npm install @bookstrack/schemas zod
```

> **Note:** `zod@^4.0.0` is a peer dependency

## Usage

### Basic Import

```typescript
import {
  BookSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  ErrorResponseSchema
} from '@bookstrack/schemas'

// Validate API response
const response = await fetch('/v3/books/search?q=harry+potter')
const json = await response.json()
const validated = SearchResponseSchema.parse(json)

// TypeScript knows the exact shape
if (validated.success) {
  console.log(validated.data.books) // Book[]
}
```

### Error Handling with RFC 9457

```typescript
import { createProblemDetails, isErrorResponse } from '@bookstrack/schemas/errors'

// Create standardized error response
const error = createProblemDetails('NOT_FOUND', 'Book not found', {
  instance: '/v3/books/9780439708180',
  requestId: 'abc-123'
})

// Type guard for responses
const response = await api.getBook(isbn)
if (isErrorResponse(response)) {
  console.error(`${response.title}: ${response.detail}`)
  if (response.retryable) {
    // Retry after delay
    await sleep(response.retryAfterMs || 1000)
  }
}
```

### Schema Types

```typescript
import type {
  Book,
  SearchRequest,
  SearchResponse,
  ErrorResponse,
  ErrorCode
} from '@bookstrack/schemas'

// Use types directly
function handleBook(book: Book) {
  console.log(book.title, book.authors.join(', '))
}
```

## Available Schemas

### Response Envelopes

| Schema | Description |
|--------|-------------|
| `SuccessResponseSchema(dataSchema)` | Factory for success responses |
| `ErrorResponseSchema` | RFC 9457 Problem Details error |
| `ResponseMetadataSchema` | Shared metadata (timestamp, requestId, etc.) |

### Book Domain

| Schema | Description |
|--------|-------------|
| `BookSchema` | Core book metadata |
| `ISBNSchema` | ISBN-10 or ISBN-13 validation |
| `ProviderSchema` | Data source enum |

### Search Endpoint

| Schema | Description |
|--------|-------------|
| `SearchRequestSchema` | Query params (q, mode, page, limit, cursor) |
| `SearchResponseSchema` | Search results with pagination |
| `SearchModeSchema` | Search mode enum (text, semantic, similar) |
| `PaginationSchema` | Offset or cursor pagination |

### Enrich Endpoint

| Schema | Description |
|--------|-------------|
| `EnrichRequestSchema` | Request body (isbns, includeEmbedding) |
| `EnrichResponseSchema` | Enriched books response |
| `EnrichedBookSchema` | Book with vectorized flag |

## Error Utilities

```typescript
import {
  createProblemDetails,
  isErrorResponse,
  isSuccessResponse,
  getStatusForCode,
  getTitleForCode,
  isRetryable,
  ERROR_STATUS_MAP,
  ERROR_TITLE_MAP,
  RETRYABLE_ERRORS
} from '@bookstrack/schemas/errors'
```

## License

MIT
