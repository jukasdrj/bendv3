# Test Patterns Guide

Best practices and patterns for testing BooksTrack backend.

---

## 🎯 Core Principles

1. **Canonical Response Format** - All endpoints must return unified envelope
2. **No Real API Calls** - Always mock external providers
3. **Fixtures Over Hardcoding** - Use shared test data
4. **Descriptive Test Names** - Tests are documentation
5. **Arrange-Act-Assert** - Clear test structure

---

## 📦 Test Data Management

### ✅ Use Fixtures

```javascript
import { harryPotterBook, validISBNs } from '../fixtures/books.js'

it('should enrich book data', async () => {
  const result = await enrichBook(harryPotterBook.workId, mockEnv)
  expect(result.title).toBe(harryPotterBook.title)
})
```

### ❌ Don't Hardcode Data

```javascript
// ❌ Bad - hardcoded, hard to maintain
it('should enrich book data', async () => {
  const result = await enrichBook('OL45883W', mockEnv)
  expect(result.title).toBe('Harry Potter and the Philosopher\'s Stone')
})
```

---

## 🔧 Mocking Cloudflare Bindings

### KV Namespace

```javascript
import { createMockKV } from '../setup.js'

const mockEnv = {
  BOOK_CACHE: createMockKV()
}

// Pre-populate cache
await mockEnv.BOOK_CACHE.put('book:123', JSON.stringify(bookData))

// Verify cache hit
const cached = await mockEnv.BOOK_CACHE.get('book:123', 'json')
expect(cached).toEqual(bookData)
```

### Durable Objects

```javascript
import { createMockDONamespace } from '../mocks/durable-object.js'

const mockEnv = {
  PROGRESS_TRACKER: createMockDONamespace()
}

const id = mockEnv.PROGRESS_TRACKER.idFromName('job-123')
const stub = mockEnv.PROGRESS_TRACKER.get(id)

await stub.updateProgress(50, 'processing')
```

### R2 Bucket

```javascript
import { createMockR2Bucket } from '../setup.js'

const mockEnv = {
  BOOK_IMAGES: createMockR2Bucket()
}

await mockEnv.BOOK_IMAGES.put('cover/123.jpg', imageBuffer)
const stored = await mockEnv.BOOK_IMAGES.get('cover/123.jpg')
```

---

## 🌐 Testing HTTP Handlers

### Pattern: Request → Handler → Validate Response

```javascript
import { createGetRequest } from '../utils/request-builder.js'
import { validateSuccessEnvelope } from '../utils/response-validator.js'
import { handleSearchISBN } from '../../src/handlers/v1/search-isbn.js'

describe('GET /v1/search/isbn', () => {
  it('should return canonical envelope for valid ISBN', async () => {
    // Arrange
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
      BOOK_CACHE: createMockKV()
    }

    // Act
    const response = await handleSearchISBN('9780439708180', mockEnv)

    // Assert
    expect(response.success).toBe(true)
    expect(response.data).toBeDefined()
    expect(response.meta.timestamp).toBeDefined()

    // Validate canonical format
    const validation = validateSuccessEnvelope(response)
    expect(validation.valid).toBe(true)
  })
})
```

### Pattern: Error Handling

```javascript
it('should return error envelope for invalid ISBN', async () => {
  // Act
  const response = await handleSearchISBN('invalid', mockEnv)

  // Assert
  expect(response.success).toBe(false)
  expect(response.error.code).toBe('INVALID_ISBN')
  expect(response.error.message).toContain('valid ISBN')
  expect(response.meta.timestamp).toBeDefined()

  // Validate error envelope
  const validation = validateErrorEnvelope(response)
  expect(validation.valid).toBe(true)
})
```

---

## 🔌 Mocking External APIs

### Google Books API

```javascript
import { vi } from 'vitest'
import { mockGoogleBooksSearchResponse } from '../mocks/providers.js'

// Mock global fetch
global.fetch = vi.fn()

it('should fetch from Google Books', async () => {
  // Setup mock response
  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => mockGoogleBooksSearchResponse
  })

  const result = await searchGoogleBooks('Harry Potter')

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('googleapis.com'),
    expect.any(Object)
  )
  expect(result.items).toBeDefined()
})
```

### Gemini API

```javascript
import { mockGeminiImageAnalysisResponse } from '../mocks/gemini.js'

it('should analyze bookshelf image with Gemini', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => mockGeminiImageAnalysisResponse
  })

  const result = await scanBookshelf(imageBuffer, mockEnv)

  expect(result.books).toHaveLength(3)
  expect(result.books[0].isbn).toBe('9780439708180')
})
```

---

## 🧵 Testing WebSocket Connections

### Pattern: Mock WebSocket Pair

```javascript
import { createMockWebSocketPair } from '../setup.js'

it('should send progress updates via WebSocket', async () => {
  // Arrange
  const { server, client } = createMockWebSocketPair()
  const messages = []

  client.addEventListener('message', (event) => {
    messages.push(JSON.parse(event.data))
  })

  // Act
  server.send(JSON.stringify({
    type: 'progress',
    jobId: 'test-job',
    progress: 50,
    status: 'processing'
  }))

  // Assert
  expect(messages).toHaveLength(1)
  expect(messages[0].progress).toBe(50)

  const validation = validateProgressMessage(messages[0])
  expect(validation.valid).toBe(true)
})
```

---

## 🎭 Testing Rate Limiting

### Pattern: Durable Object Rate Limiter

```javascript
import { RateLimiter } from '../../src/durable-objects/rate-limiter.js'

it('should enforce rate limits per IP', async () => {
  const limiter = new RateLimiter(mockDOState, mockEnv)
  const clientIp = '127.0.0.1'

  // First 100 requests should succeed
  for (let i = 0; i < 100; i++) {
    const allowed = await limiter.check(clientIp, 'search')
    expect(allowed).toBe(true)
  }

  // 101st request should be rate limited
  const blocked = await limiter.check(clientIp, 'search')
  expect(blocked).toBe(false)
})
```

---

## 🔄 Testing Caching Behavior

### Pattern: Cache Hit/Miss

```javascript
it('should return cached result on second request', async () => {
  const mockKV = createMockKV()
  const env = { BOOK_CACHE: mockKV }

  // First request - cache miss
  const result1 = await searchBook('9780439708180', env)
  expect(result1.metadata.cached).toBe(false)

  // Verify cache was populated
  const cached = await mockKV.get('book:9780439708180', 'json')
  expect(cached).toBeDefined()

  // Second request - cache hit
  const result2 = await searchBook('9780439708180', env)
  expect(result2.metadata.cached).toBe(true)
  expect(result2.data).toEqual(result1.data)
})
```

### Pattern: Cache Invalidation

```javascript
it('should invalidate cache after TTL expires', async () => {
  const mockKV = createMockKV()

  // Cache with 1 second TTL
  await mockKV.put('book:123', JSON.stringify(bookData), {
    expirationTtl: 1
  })

  // Immediate read should succeed
  const cached1 = await mockKV.get('book:123', 'json')
  expect(cached1).toBeDefined()

  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 1100))

  // Read after TTL should return null
  const cached2 = await mockKV.get('book:123', 'json')
  expect(cached2).toBeNull()
})
```

---

## 📸 Testing Image Upload

### Pattern: Bookshelf Scan

```javascript
import { createImageUploadRequest } from '../utils/request-builder.js'
import { readFileSync } from 'fs'

it('should accept bookshelf image and return jobId', async () => {
  // Load test image
  const imageBuffer = readFileSync('./tests/assets/test-bookshelf.jpg')

  // Create upload request
  const request = createImageUploadRequest(
    '/api/scan-bookshelf',
    imageBuffer,
    'image/jpeg',
    { jobId: 'test-job-123' }
  )

  // Mock Gemini response
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => mockGeminiImageAnalysisResponse
  })

  // Act
  const response = await handleBookshelfScan(request, mockEnv)

  // Assert
  expect(response.status).toBe(202)
  expect(response.jobId).toBe('test-job-123')
})
```

---

## 📊 Testing Batch Operations

### Pattern: Progress Tracking

```javascript
it('should track progress during batch enrichment', async () => {
  const workIds = ['OL1W', 'OL2W', 'OL3W', 'OL4W', 'OL5W']
  const progressUpdates = []

  // Mock DO stub to capture progress
  const doStub = createMockDOStub()
  doStub.updateProgress.mockImplementation(async (progress) => {
    progressUpdates.push(progress)
  })

  // Act
  await batchEnrich(workIds, 'job-123', mockEnv)

  // Assert
  expect(progressUpdates).toHaveLength(5)
  expect(progressUpdates[0]).toBe(20)  // 1/5 = 20%
  expect(progressUpdates[4]).toBe(100) // 5/5 = 100%
})
```

---

## 🚨 Testing Error Scenarios

### Pattern: Provider Failures

```javascript
describe('Provider Fallback', () => {
  it('should fallback to OpenLibrary if Google Books fails', async () => {
    // Google Books fails
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' })
    })

    // OpenLibrary succeeds
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockOpenLibrarySearchResponse
    })

    const result = await searchBook('9780439708180', mockEnv)

    expect(result.metadata.source).toBe('openlibrary')
    expect(result.success).toBe(true)
  })

  it('should return error if all providers fail', async () => {
    // All providers fail
    fetch.mockRejectedValue(new Error('Network error'))

    const result = await searchBook('9780439708180', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('PROVIDER_ERROR')
  })
})
```

### Pattern: HTTP Error Codes

```javascript
describe('HTTP Error Handling', () => {
  it.each([
    { status: 400, code: 'BAD_REQUEST', message: 'Invalid request parameters' },
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    { status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' },
    { status: 404, code: 'NOT_FOUND', message: 'Resource not found' },
    { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
    { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    { status: 502, code: 'BAD_GATEWAY', message: 'Upstream service unavailable' },
    { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' }
  ])('should handle $status errors correctly', async ({ status, code, message }) => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({ error: message })
    })

    const result = await callExternalAPI('test-endpoint', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe(code)
    expect(result.error.statusCode).toBe(status)
  })
})
```

### Pattern: Network Failures

```javascript
describe('Network Error Handling', () => {
  it('should handle timeout errors', async () => {
    fetch.mockRejectedValueOnce(new Error('Fetch timeout after 5000ms'))

    const result = await searchBook('9780439708180', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('TIMEOUT_ERROR')
    expect(result.error.message).toContain('timeout')
  })

  it('should handle connection refused', async () => {
    fetch.mockRejectedValueOnce(new Error('Connection refused'))

    const result = await searchBook('9780439708180', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('CONNECTION_ERROR')
  })

  it('should handle DNS resolution failures', async () => {
    fetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))

    const result = await searchBook('9780439708180', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('DNS_ERROR')
  })
})
```

### Pattern: Authentication Errors

```javascript
import { mockValidToken, mockExpiredToken, mockMalformedToken } from '../mocks/auth.js'

describe('Authentication Error Handling', () => {
  it('should return 401 for missing auth token', async () => {
    const request = createGetRequest('/api/protected')

    const response = await handleProtectedRoute(request, mockEnv)

    expect(response.success).toBe(false)
    expect(response.error.code).toBe('UNAUTHORIZED')
    expect(response.error.message).toContain('Authentication required')
  })

  it('should return 401 for expired token', async () => {
    const request = createAuthenticatedRequest('/api/protected', mockExpiredToken)

    const response = await handleProtectedRoute(request, mockEnv)

    expect(response.success).toBe(false)
    expect(response.error.code).toBe('TOKEN_EXPIRED')
  })

  it('should return 401 for malformed token', async () => {
    const request = createAuthenticatedRequest('/api/protected', mockMalformedToken)

    const response = await handleProtectedRoute(request, mockEnv)

    expect(response.success).toBe(false)
    expect(response.error.code).toBe('INVALID_TOKEN')
  })

  it('should return 403 for insufficient permissions', async () => {
    const request = createAuthenticatedRequest('/api/admin', mockValidToken)

    const response = await handleAdminRoute(request, mockEnv)

    expect(response.success).toBe(false)
    expect(response.error.code).toBe('FORBIDDEN')
    expect(response.error.message).toContain('Insufficient permissions')
  })
})
```

### Pattern: Validation Errors

```javascript
describe('Input Validation Errors', () => {
  it('should return validation error for invalid ISBN', async () => {
    const result = await searchByISBN('invalid-isbn', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('INVALID_ISBN')
    expect(result.error.details).toEqual({
      field: 'isbn',
      reason: 'Must be 10 or 13 digits'
    })
  })

  it('should return validation error for missing required fields', async () => {
    const result = await createBook({}, mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.details.missingFields).toContain('title')
    expect(result.error.details.missingFields).toContain('author')
  })

  it('should return validation error for invalid field types', async () => {
    const result = await createBook({ pageCount: 'not-a-number' }, mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.details.invalidFields).toContainEqual({
      field: 'pageCount',
      expected: 'number',
      received: 'string'
    })
  })
})
```

### Pattern: Rate Limiting Errors

```javascript
describe('Rate Limit Handling', () => {
  it('should return 429 when rate limit exceeded', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 100; i++) {
      await searchBook('9780439708180', mockEnv)
    }

    // 101st request should fail
    const result = await searchBook('9780439708180', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(result.error.retryAfter).toBeTypeOf('number')
  })

  it('should include rate limit headers in response', async () => {
    const response = await handleSearch(request, mockEnv)

    expect(response.headers.get('x-ratelimit-limit')).toBe('100')
    expect(response.headers.get('x-ratelimit-remaining')).toBeDefined()
    expect(response.headers.get('x-ratelimit-reset')).toBeDefined()
  })
})
```

### Pattern: Concurrent Operation Errors

```javascript
describe('Concurrency Error Handling', () => {
  it('should handle race conditions gracefully', async () => {
    // Simulate two concurrent updates to same resource
    const [result1, result2] = await Promise.all([
      updateBook('OL123W', { title: 'New Title 1' }, mockEnv),
      updateBook('OL123W', { title: 'New Title 2' }, mockEnv)
    ])

    // One should succeed, one should conflict
    const results = [result1, result2]
    expect(results.some(r => r.success)).toBe(true)
    expect(results.some(r => r.error?.code === 'CONFLICT')).toBe(true)
  })

  it('should handle deadlock scenarios', async () => {
    // Simulate deadlock with circular dependencies
    fetch.mockRejectedValueOnce(new Error('Deadlock detected'))

    const result = await complexTransaction(mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('DEADLOCK_ERROR')
    expect(result.error.retryable).toBe(true)
  })
})
```

### Pattern: Data Corruption Errors

```javascript
describe('Data Integrity Errors', () => {
  it('should detect malformed API responses', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ incomplete: 'data' }) // Missing required fields
    })

    const result = await fetchBookData('OL123W', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('INVALID_RESPONSE_FORMAT')
  })

  it('should handle corrupted cache data', async () => {
    // Put invalid data in cache
    await mockEnv.BOOK_CACHE.put('book:123', 'corrupted-json-data')

    const result = await getBookFromCache('book:123', mockEnv)

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('CACHE_CORRUPTION')
  })
})
```

---

## 🧪 Testing CSV Import

### Pattern: Valid CSV

```javascript
import { sampleCSV } from '../fixtures/books.js'

it('should parse valid CSV and enrich books', async () => {
  const result = await importCSV(sampleCSV, 'job-123', mockEnv)

  expect(result.success).toBe(true)
  expect(result.data.totalRows).toBe(5)
  expect(result.data.validRows).toBe(5)
  expect(result.data.errors).toHaveLength(0)
})
```

### Pattern: Malformed CSV

```javascript
import { malformedCSV } from '../fixtures/books.js'

it('should handle malformed CSV gracefully', async () => {
  const result = await importCSV(malformedCSV, 'job-123', mockEnv)

  expect(result.success).toBe(false)
  expect(result.error.code).toBe('CSV_VALIDATION_ERROR')
  expect(result.error.details.invalidRows).toBeGreaterThan(0)
})
```

---

## 🔐 Testing CORS

### Pattern: Allowed Origins

```javascript
import { validateCorsHeaders } from '../utils/response-validator.js'

it('should include CORS headers for allowed origin', async () => {
  const request = createRequestWithOrigin(
    '/v1/search/isbn',
    'https://bookstrack.oooefam.net'
  )

  const response = await worker.fetch(request, mockEnv)

  const corsValidation = validateCorsHeaders(
    response,
    'https://bookstrack.oooefam.net'
  )
  expect(corsValidation.valid).toBe(true)
})
```

### Pattern: Blocked Origins

```javascript
it('should reject requests from unknown origins', async () => {
  const request = createRequestWithOrigin(
    '/v1/search/isbn',
    'https://malicious.com'
  )

  const response = await worker.fetch(request, mockEnv)

  expect(response.headers.has('access-control-allow-origin')).toBe(false)
})
```

---

## 📝 Test Organization

### ✅ Good Test Structure

```javascript
describe('BookEnrichmentService', () => {
  describe('enrichBook()', () => {
    describe('when book exists in cache', () => {
      it('should return cached result', async () => {
        // Test implementation
      })
    })

    describe('when book not in cache', () => {
      it('should fetch from Google Books', async () => {
        // Test implementation
      })

      it('should fallback to OpenLibrary if Google Books fails', async () => {
        // Test implementation
      })
    })

    describe('when all providers fail', () => {
      it('should return error envelope', async () => {
        // Test implementation
      })
    })
  })
})
```

---

## 🎓 Advanced Patterns

### Parameterized Tests

```javascript
import { describe, it, expect } from 'vitest'

describe.each([
  { isbn: '9780439708180', expected: true },
  { isbn: '0451524934', expected: true },
  { isbn: 'invalid', expected: false },
  { isbn: '123', expected: false }
])('ISBN Validation', ({ isbn, expected }) => {
  it(`should return ${expected} for "${isbn}"`, () => {
    expect(validateISBN(isbn)).toBe(expected)
  })
})
```

### Snapshot Testing

```javascript
it('should match canonical response snapshot', async () => {
  const response = await handleSearchISBN('9780439708180', mockEnv)

  // Snapshot excludes timestamp (non-deterministic)
  const snapshot = { ...response }
  delete snapshot.meta.timestamp

  expect(snapshot).toMatchSnapshot()
})
```

---

## 🚀 Performance Testing

### Pattern: Batch Performance

```javascript
it('should process 100 books in under 10 seconds', async () => {
  const workIds = Array.from({ length: 100 }, (_, i) => `OL${i}W`)

  const startTime = Date.now()
  await batchEnrich(workIds, 'job-123', mockEnv)
  const duration = Date.now() - startTime

  expect(duration).toBeLessThan(10000) // 10 seconds
}, { timeout: 15000 })
```

---

## 📚 Resources

- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Cloudflare Workers Mocking](https://developers.cloudflare.com/workers/testing/vitest-integration/)

---

**Last Updated:** November 14, 2025
