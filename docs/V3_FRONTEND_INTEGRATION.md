# V3 API Frontend Integration Guide

**Date:** December 2, 2025
**API Version:** 3.0.0
**Status:** ✅ Production Ready

---

## 🚀 Quick Start

The new V3 API is now available with native OpenAPI support, full TypeScript type safety, and improved error handling.

### Base URL
- **Production:** `https://api.oooefam.net`
- **Staging:** TBD
- **Local Dev:** `http://localhost:8787`

### Interactive Documentation
- **Swagger UI:** https://api.oooefam.net/v3/docs
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json

---

## 📋 Available Endpoints

### GET /v3/books/:isbn

Get comprehensive book metadata by ISBN.

**Endpoint:** `GET /v3/books/:isbn`

**Path Parameters:**
- `isbn` (string, required) - 10 or 13 digit ISBN
  - Pattern: `^\d{10}(\d{3})?$`
  - Example: `9780439708180`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "isbn": "9780439708180",
    "isbn10": "0439708184",
    "title": "Harry Potter and the Philosopher's Stone",
    "subtitle": null,
    "authors": ["J. K. Rowling"],
    "publisher": "Scholastic Paperbacks",
    "publishedDate": "1999",
    "description": "Harry Potter has never been the star of a Quidditch team...",
    "pageCount": 784,
    "categories": ["Fiction", "Fantasy"],
    "language": "en",
    "coverUrl": "https://alexandria.ooheynerds.com/api/covers/OL82563W/large",
    "thumbnailUrl": "https://alexandria.ooheynerds.com/api/covers/OL82563W/large",
    "workKey": "OL82563W",
    "editionKey": "OL26939404M",
    "provider": "alexandria",
    "quality": 95
  },
  "metadata": {
    "source": "external",
    "cached": false,
    "timestamp": "2025-12-02T04:26:00.262Z"
  }
}
```

**Error Response (404 - Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Book not found"
  }
}
```

**Error Response (500 - Server Error):**
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  }
}
```

**Circuit Breaker Error (503 - Service Unavailable):**
```json
{
  "success": false,
  "error": {
    "code": "CIRCUIT_OPEN",
    "message": "Service temporarily unavailable"
  }
}
```

---

## 🔧 TypeScript Integration

### Response Types

```typescript
// Success Response
interface V3BookResponse {
  success: true
  data: V3Book
  metadata: {
    source: string
    cached: boolean
    timestamp: string
  }
}

// Book Data
interface V3Book {
  isbn: string              // 13-digit ISBN
  isbn10?: string           // 10-digit ISBN (optional)
  title: string
  subtitle?: string
  authors: string[]
  publisher?: string
  publishedDate?: string    // ISO 8601 or partial (e.g., "1999")
  description?: string
  pageCount?: number
  categories?: string[]
  language?: string         // ISO 639-1 code (e.g., "en")
  coverUrl?: string         // Alexandria-hosted cover (large)
  thumbnailUrl?: string     // Alexandria-hosted thumbnail
  workKey?: string          // OpenLibrary work key (e.g., "OL82563W")
  editionKey?: string       // OpenLibrary edition key
  provider: 'alexandria' | 'google_books' | 'open_library' | 'isbndb'
  quality: number           // 0-100 quality score
}

// Error Response
interface V3ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

// Union Type
type V3ApiResponse = V3BookResponse | V3ErrorResponse
```

### Type Guards

```typescript
// Check if response is successful
function isSuccessResponse(response: V3ApiResponse): response is V3BookResponse {
  return response.success === true
}

// Check if response is error
function isErrorResponse(response: V3ApiResponse): response is V3ErrorResponse {
  return response.success === false
}
```

---

## 📱 Usage Examples

### JavaScript/Fetch

```javascript
async function getBook(isbn) {
  try {
    const response = await fetch(`https://api.oooefam.net/v3/books/${isbn}`)
    const data = await response.json()

    if (data.success) {
      console.log('Book found:', data.data.title)
      console.log('Authors:', data.data.authors.join(', '))
      console.log('Cover:', data.data.coverUrl)
      return data.data
    } else {
      console.error('Error:', data.error.message)
      throw new Error(data.error.message)
    }
  } catch (error) {
    console.error('Network error:', error)
    throw error
  }
}

// Usage
const book = await getBook('9780439708180')
```

### TypeScript/Fetch

```typescript
async function getBook(isbn: string): Promise<V3Book> {
  const response = await fetch(`https://api.oooefam.net/v3/books/${isbn}`)
  const data: V3ApiResponse = await response.json()

  if (isSuccessResponse(data)) {
    return data.data
  } else {
    throw new Error(data.error.message)
  }
}

// Usage with error handling
try {
  const book = await getBook('9780439708180')
  console.log(`Found: ${book.title} by ${book.authors.join(', ')}`)
} catch (error) {
  console.error('Failed to fetch book:', error)
}
```

### React Hook

```typescript
import { useState, useEffect } from 'react'

interface UseBookResult {
  book: V3Book | null
  loading: boolean
  error: string | null
}

function useBook(isbn: string): UseBookResult {
  const [book, setBook] = useState<V3Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBook() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`https://api.oooefam.net/v3/books/${isbn}`)
        const data: V3ApiResponse = await response.json()

        if (isSuccessResponse(data)) {
          setBook(data.data)
        } else {
          setError(data.error.message)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (isbn) {
      fetchBook()
    }
  }, [isbn])

  return { book, loading, error }
}

// Usage in component
function BookDetails({ isbn }: { isbn: string }) {
  const { book, loading, error } = useBook(isbn)

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (!book) return <div>No book found</div>

  return (
    <div>
      <h1>{book.title}</h1>
      {book.subtitle && <h2>{book.subtitle}</h2>}
      <p>Authors: {book.authors.join(', ')}</p>
      {book.coverUrl && <img src={book.coverUrl} alt={book.title} />}
      {book.description && <p>{book.description}</p>}
    </div>
  )
}
```

### Axios

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://api.oooefam.net',
  timeout: 10000,
})

async function getBook(isbn: string): Promise<V3Book> {
  const { data } = await api.get<V3ApiResponse>(`/v3/books/${isbn}`)

  if (isSuccessResponse(data)) {
    return data.data
  } else {
    throw new Error(data.error.message)
  }
}
```

---

## 🎨 UI Integration Tips

### Cover Images

The V3 API returns Alexandria-hosted cover images:

```typescript
// coverUrl: Full-size cover (large)
// thumbnailUrl: Same as coverUrl (for backwards compatibility)

// Display with fallback
<img
  src={book.coverUrl}
  alt={book.title}
  onError={(e) => {
    e.currentTarget.src = '/placeholder-book.png'
  }}
/>
```

### Quality Score

Use the `quality` field to show data reliability:

```typescript
function getQualityBadge(quality: number) {
  if (quality >= 90) return '🟢 High Quality'
  if (quality >= 70) return '🟡 Good Quality'
  return '🔴 Limited Data'
}

// Usage
<span>{getQualityBadge(book.quality)}</span>
```

### Authors Display

```typescript
// Simple
<p>By {book.authors.join(', ')}</p>

// With links (if you have author pages)
{book.authors.map((author) => (
  <Link key={author} to={`/authors/${author}`}>
    {author}
  </Link>
))}
```

### Publication Date

```typescript
// The publishedDate can be partial (e.g., "1999") or full ISO 8601
function formatPublishedDate(date?: string): string {
  if (!date) return 'Unknown'

  // Try to parse as full date
  const parsed = new Date(date)
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString()
  }

  // Return as-is (likely just year)
  return date
}
```

---

## ⚡ Performance Optimization

### Caching Strategy

The API returns cache status in `metadata.cached`:

```typescript
// Cache-aware fetching
async function getBookWithCache(isbn: string): Promise<V3Book> {
  // Check browser cache first
  const cachedData = sessionStorage.getItem(`book_${isbn}`)
  if (cachedData) {
    return JSON.parse(cachedData)
  }

  // Fetch from API
  const response = await fetch(`https://api.oooefam.net/v3/books/${isbn}`)
  const data: V3ApiResponse = await response.json()

  if (isSuccessResponse(data)) {
    // Cache for 1 hour if data was cached at API level
    if (data.metadata.cached) {
      sessionStorage.setItem(`book_${isbn}`, JSON.stringify(data.data))
    }
    return data.data
  } else {
    throw new Error(data.error.message)
  }
}
```

### Batch Requests

For multiple books, batch requests in parallel:

```typescript
async function getBooks(isbns: string[]): Promise<V3Book[]> {
  const promises = isbns.map(isbn => getBook(isbn))
  const results = await Promise.allSettled(promises)

  return results
    .filter((result): result is PromiseFulfilledResult<V3Book> =>
      result.status === 'fulfilled'
    )
    .map(result => result.value)
}

// Usage
const books = await getBooks(['9780439708180', '0451524934'])
```

---

## 🔒 Error Handling

### Comprehensive Error Handler

```typescript
enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_EXCEEDED',
}

function handleApiError(error: V3ErrorResponse['error']): string {
  switch (error.code) {
    case ErrorCode.NOT_FOUND:
      return 'Book not found. Please check the ISBN and try again.'

    case ErrorCode.CIRCUIT_OPEN:
      return 'Service temporarily unavailable. Please try again in a few minutes.'

    case ErrorCode.RATE_LIMIT:
      return 'Too many requests. Please slow down and try again.'

    case ErrorCode.INTERNAL_ERROR:
    default:
      return 'An unexpected error occurred. Please try again later.'
  }
}

// Usage
if (isErrorResponse(data)) {
  const userMessage = handleApiError(data.error)
  toast.error(userMessage)
}
```

### Retry Logic

```typescript
async function getBookWithRetry(
  isbn: string,
  maxRetries = 3
): Promise<V3Book> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getBook(isbn)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on 404
      if (error instanceof Error && error.message.includes('not found')) {
        throw error
      }

      // Exponential backoff
      if (attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }
  }

  throw lastError || new Error('Max retries exceeded')
}
```

---

## 🆚 Migration from V2

### Key Differences

| Feature | V2 | V3 |
|---------|----|----|
| **Endpoint** | `/api/v2/search?isbn=...` | `/v3/books/:isbn` |
| **Response Format** | Nested `works`, `editions`, `authors` | Flattened `data` object |
| **Cover URLs** | Provider-specific | Alexandria-hosted |
| **Type Safety** | Limited | Full OpenAPI/Zod support |
| **Error Format** | Varies | Standardized `success` discriminator |

### Migration Example

**V2 Code:**
```typescript
// OLD - V2 API
const response = await fetch('/api/v2/search?isbn=9780439708180')
const data = await response.json()

const work = data.works?.[0]
const edition = data.editions?.[0]
const authors = data.authors?.map(a => a.name) || []

const book = {
  title: work?.title,
  authors: authors,
  coverUrl: work?.coverImageURL
}
```

**V3 Code:**
```typescript
// NEW - V3 API
const response = await fetch('/v3/books/9780439708180')
const data = await response.json()

if (data.success) {
  const book = {
    title: data.data.title,
    authors: data.data.authors,
    coverUrl: data.data.coverUrl
  }
}
```

---

## 📊 Response Metadata

The `metadata` object provides valuable context:

```typescript
interface Metadata {
  source: 'external' | 'kv' | 'd1'  // Data source
  cached: boolean                    // Whether response was cached
  timestamp: string                  // Response generation time (ISO 8601)
}
```

**Use Cases:**
- **Analytics:** Track cache hit rates
- **Debug:** Understand data freshness
- **UI:** Show "Last updated" timestamps

---

## 🧪 Testing

### Mock Data

```typescript
const mockBook: V3Book = {
  isbn: '9780439708180',
  isbn10: '0439708184',
  title: 'Harry Potter and the Philosopher\'s Stone',
  authors: ['J. K. Rowling'],
  publisher: 'Scholastic Paperbacks',
  publishedDate: '1999',
  pageCount: 784,
  language: 'en',
  coverUrl: 'https://alexandria.ooheynerds.com/api/covers/OL82563W/large',
  thumbnailUrl: 'https://alexandria.ooheynerds.com/api/covers/OL82563W/large',
  workKey: 'OL82563W',
  editionKey: 'OL26939404M',
  provider: 'alexandria',
  quality: 95
}

const mockSuccessResponse: V3BookResponse = {
  success: true,
  data: mockBook,
  metadata: {
    source: 'external',
    cached: false,
    timestamp: new Date().toISOString()
  }
}
```

### Jest Mock

```typescript
// Mock fetch for testing
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve(mockSuccessResponse),
  })
) as jest.Mock

// Test
test('getBook returns book data', async () => {
  const book = await getBook('9780439708180')
  expect(book.title).toBe('Harry Potter and the Philosopher\'s Stone')
})
```

---

## 🔗 Resources

- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **Interactive Docs:** https://api.oooefam.net/v3/docs
- **Migration Guide:** [docs/V3_MIGRATION_COMPLETE.md](V3_MIGRATION_COMPLETE.md)
- **Support:** Create an issue on GitHub

---

## 📞 Support

**Questions or Issues?**
- GitHub Issues: https://github.com/jukasdrj/bendv3/issues
- Email: nerd@ooheynerds.com

---

**Last Updated:** December 2, 2025
**API Version:** 3.0.0
**Maintained By:** BooksTrack Team
