# MSW (Mock Service Worker) Testing Guide

## Overview

MSW (Mock Service Worker) is now available for mocking external API calls in tests. This prevents:
- **Rate limiting** from hitting real APIs during test runs
- **Flaky tests** due to network issues or API downtime
- **Costs** from calling paid APIs (ISBNdb, Gemini)
- **Non-deterministic results** from live data changes

## Quick Start

### Basic Usage

```javascript
import { describe, it, expect } from 'vitest'
import { setupMSW } from '../helpers/msw-server.js'

// Enable MSW for this test file
setupMSW()

describe('Book Search', () => {
  it('should fetch book from Google Books', async () => {
    // MSW will intercept and mock the Google Books API call
    const result = await searchByISBN('9780739314821')

    expect(result.title).toBe('The Google story')
    expect(result.authors).toContain('David A. Vise')
  })
})
```

### Custom Handlers

For test-specific scenarios, provide custom handlers:

```javascript
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'

const customHandlers = [
  http.get('https://www.googleapis.com/books/v1/volumes', () => {
    return HttpResponse.json({
      items: [{
        volumeInfo: {
          title: 'Custom Test Book',
          authors: ['Test Author']
        }
      }]
    })
  })
]

setupMSW(customHandlers)
```

## Available Mock Handlers

MSW provides pre-configured handlers for all external APIs:

### 1. Google Books API

**Success case:**
```javascript
// Automatically returns mock data for ISBN 9780739314821
const response = await fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:9780739314821')
```

**Test scenarios:**
- ✅ Valid ISBN → Returns book data
- ❌ Unknown ISBN → Returns empty results
- ⚠️ Rate limit → Returns 429 error
- 🔥 Server error → Returns 500 error
- ⏱️ Timeout → Simulates 30s delay

### 2. ISBNdb API

**Success case:**
```javascript
// Returns mock data for Harry Potter ISBN
const response = await fetch('https://api2.isbndb.com/book/9780439708180')
```

**Test scenarios:**
- ✅ Valid ISBN (9780439708180) → Returns book data with cover image
- ❌ Unknown ISBN → Returns 404 error
- ⚠️ Rate limit → Returns 429 with Retry-After header
- 🔒 Unauthorized → Returns 401 error
- 🔥 Server error → Returns 500 error

### 3. Gemini API

**Success case:**
```javascript
// Returns mock bookshelf scan results
const response = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
  {
    method: 'POST',
    body: JSON.stringify({ contents: [{ parts: [{ inlineData: {...} }] }] })
  }
)
```

**Test scenarios:**
- ✅ Bookshelf scan (with image) → Returns 3 books with ISBNs
- ✅ CSV parsing (text only) → Returns parsed book data
- ❌ Empty response → Returns empty array
- ⚠️ Rate limit → Returns 429 error
- 🔒 Unauthorized → Returns 401 error
- ⏱️ Timeout → Simulates 30s delay
- 🛡️ Safety block → Returns SAFETY finish reason

## Custom Response Factories

Create test-specific responses easily:

### Google Books

```javascript
import { createGoogleBooksResponse } from '../helpers/msw-server.js'

const customBook = createGoogleBooksResponse({
  title: 'My Custom Book',
  authors: ['Custom Author'],
  publishedDate: '2025-01-01'
})
```

### ISBNdb

```javascript
import { createIsbndbResponse } from '../helpers/msw-server.js'

const customBook = createIsbndbResponse({
  title: 'Custom Book',
  isbn13: '9781234567890',
  image: 'https://example.com/cover.jpg'
})
```

### Gemini

```javascript
import { createGeminiResponse } from '../helpers/msw-server.js'

const customResponse = createGeminiResponse(
  [
    { title: 'Book 1', authors: ['Author 1'], isbn: '9781111111111' },
    { title: 'Book 2', authors: ['Author 2'], isbn: '9782222222222' }
  ],
  { prompt: 100, output: 50 } // Token counts
)
```

## Advanced Usage

### Override Specific Endpoints

Use the server instance to add custom handlers:

```javascript
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'

const server = setupMSW()

// Override for a specific test
server.use(
  http.get('https://www.googleapis.com/books/v1/volumes', () => {
    return new HttpResponse(null, { status: 500 })
  })
)
```

### Verify API Calls

```javascript
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'

const requestSpy = vi.fn()

const server = setupMSW([
  http.post('https://generativelanguage.googleapis.com/*', async ({ request }) => {
    requestSpy(await request.json())
    return HttpResponse.json({ candidates: [] })
  })
])

// ... run your test ...

expect(requestSpy).toHaveBeenCalledWith(
  expect.objectContaining({
    contents: expect.any(Array)
  })
)
```

## Opt-In Design

MSW is **opt-in** to preserve existing tests that use `global.fetch = vi.fn()`. This means:

✅ **Existing tests** continue to work without changes
✅ **New tests** can use MSW for better API mocking
✅ **No conflicts** between MSW and Vitest mocks

### When to Use MSW

- ✅ Testing code that calls external APIs
- ✅ Testing error handling (rate limits, timeouts, server errors)
- ✅ Integration tests for API workflows
- ✅ Testing provider fallback logic

### When NOT to Use MSW

- ❌ Unit tests that don't make HTTP calls
- ❌ Tests that need custom `global.fetch` mocks
- ❌ Tests that verify fetch call parameters (use request spy instead)

## Examples

### Example 1: Testing Rate Limit Handling

```javascript
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'

const server = setupMSW()

it('should handle Google Books rate limit', async () => {
  // Simulate rate limit
  server.use(
    http.get('https://www.googleapis.com/books/v1/volumes', () => {
      return new HttpResponse(null, {
        status: 429,
        headers: { 'Retry-After': '60' }
      })
    })
  )

  const result = await searchByISBN('9780000000000')

  expect(result.error).toBe('Rate limit exceeded')
  expect(result.retryAfter).toBe(60)
})
```

### Example 2: Testing Provider Fallback

```javascript
import { setupMSW } from '../helpers/msw-server.js'
import { http, HttpResponse } from 'msw'

const server = setupMSW()

it('should fallback to ISBNdb when Google Books fails', async () => {
  // Simulate Google Books failure
  server.use(
    http.get('https://www.googleapis.com/books/v1/volumes', () => {
      return new HttpResponse(null, { status: 500 })
    })
  )

  const result = await searchByISBN('9780439708180')

  expect(result.metadata.source).toBe('isbndb') // Fell back to ISBNdb
  expect(result.title).toBe('Harry Potter and the Philosopher\'s Stone')
})
```

### Example 3: Testing Bookshelf Scan

```javascript
import { setupMSW, createGeminiResponse } from '../helpers/msw-server.js'

setupMSW()

it('should scan bookshelf and return books', async () => {
  const result = await scanBookshelf(imageBase64)

  expect(result.books).toHaveLength(3)
  expect(result.books[0].title).toBe('The Pragmatic Programmer')
  expect(result.metadata.tokenUsage.total).toBe(4386)
})
```

## Troubleshooting

### MSW Not Intercepting Requests

**Problem:** Tests still hit real APIs despite MSW setup

**Solutions:**
1. Ensure `setupMSW()` is called before any tests run
2. Check that your API URL matches the handler pattern exactly
3. Verify you're not overriding `global.fetch` after MSW setup

### Conflicting with Existing Mocks

**Problem:** Tests fail after adding MSW

**Solution:** MSW uses `'bypass'` mode to allow existing `global.fetch` mocks. Remove MSW from tests that need custom fetch behavior.

### Handlers Not Resetting

**Problem:** Test isolation issues with handlers

**Solution:** MSW automatically resets handlers after each test via `afterEach()`. If you need manual reset:

```javascript
import { setupMSW } from '../helpers/msw-server.js'

const server = setupMSW()

afterEach(() => {
  server.resetHandlers()
})
```

## Further Reading

- [MSW Documentation](https://mswjs.io/)
- [MSW Node.js Integration](https://mswjs.io/docs/integrations/node)
- [Vitest + MSW Guide](https://mswjs.io/docs/integrations/vitest)

---

**Created:** November 14, 2025
**Last Updated:** November 14, 2025
**Maintainer:** BooksTrack Backend Team
