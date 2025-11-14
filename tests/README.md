# BooksTrack Backend Test Suite

Comprehensive test infrastructure for the BooksTrack Cloudflare Workers API.

## 📋 Overview

- **Test Framework:** Vitest 4.0+
- **Runtime:** Node.js (Cloudflare Workers compatible)
- **Coverage Target:** 75% (lines, functions, branches, statements)
- **Current Tests:** 461+ passing tests
- **Test Types:** Unit, Integration, E2E

---

## 🚀 Quick Start

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Writing Your First Test (30 seconds)

```javascript
// tests/handlers/v1/my-test.test.js
import { describe, it, expect } from 'vitest'
import { createGetRequest } from '../../utils/request-builder.js'
import { validateSuccessEnvelope } from '../../utils/response-validator.js'
import { harryPotterBook } from '../../fixtures/books.js'

describe('My Handler Test', () => {
  it('should return success', async () => {
    // Arrange - use fixtures and builders
    const request = createGetRequest('/v1/search/isbn', {
      isbn: harryPotterBook.editions[0].isbn13
    })

    // Act - call your handler
    const response = await myHandler(request, mockEnv)

    // Assert - validate with helpers
    expect(response.success).toBe(true)
    assertValidResponse(response)
  })
})
```

**That's it!** See [PATTERNS.md](./PATTERNS.md) for more examples.

---

## 📁 Directory Structure

```
tests/
├── fixtures/           # Test data (books, ISBNs, CSV samples)
├── mocks/             # Mock factories (Cloudflare bindings, external APIs)
├── utils/             # Test utilities (request builders, validators)
├── unit/              # Unit tests (pure functions, validators)
├── integration/       # Integration tests (multi-component)
├── handlers/          # Handler tests (v1 API endpoints)
├── normalizers/       # Normalizer tests (provider adapters)
├── error-scenarios/   # Error handling tests
├── assets/            # Test assets (images, files)
├── setup.js           # Global test setup
└── vitest.config.js   # Vitest configuration
```

---

## 🧪 Test Categories

### Unit Tests (`tests/unit/`)
- Pure functions
- Input validation
- Data transformers
- Utility functions

**Example:**
```javascript
import { validateISBN } from '../../src/utils/validators.js'

describe('ISBN Validation', () => {
  it('should validate ISBN-13', () => {
    expect(validateISBN('9780439708180')).toBe(true)
  })
})
```

### Integration Tests (`tests/integration/`)
- Multi-component workflows
- External API interactions
- Cache behavior
- Durable Object operations

**Example:**
```javascript
import { enrichBook } from '../../src/services/enrichment.js'
import { createMockKV } from '../setup.js'

describe('Book Enrichment', () => {
  it('should enrich book from multiple providers', async () => {
    const env = { BOOK_CACHE: createMockKV() }
    const result = await enrichBook('9780439708180', env)
    expect(result.providers).toContain('google_books')
  })
})
```

### Handler Tests (`tests/handlers/`)
- API endpoint behavior
- Request/response validation
- Error handling
- CORS compliance

**Example:**
```javascript
import { handleSearchISBN } from '../../../src/handlers/v1/search-isbn.js'

describe('GET /v1/search/isbn', () => {
  it('should return canonical envelope', async () => {
    const response = await handleSearchISBN('9780439708180', mockEnv)
    expect(response.success).toBe(true)
    expect(response.meta.timestamp).toBeDefined()
  })
})
```

---

## 🛠️ Available Utilities

### Fixtures (`tests/fixtures/books.js`)
Pre-defined test data for common scenarios:

```javascript
import { harryPotterBook, validISBNs, sampleCSV } from './fixtures/books.js'

// Use complete book data
const work = harryPotterBook

// Test with valid ISBNs
const isbns = validISBNs // ['9780439708180', ...]

// Test CSV import
const csv = sampleCSV
```

### Request Builders (`tests/utils/request-builder.js`)
Simplified HTTP request construction:

```javascript
import { createPostRequest, createGetRequest } from './utils/request-builder.js'

// Create POST request with JSON body
const request = createPostRequest('/v1/search/advanced', {
  title: 'Harry Potter',
  author: 'J.K. Rowling'
})

// Create GET request with query params
const getRequest = createGetRequest('/v1/search/isbn', {
  isbn: '9780439708180'
})
```

### Response Validators (`tests/utils/response-validator.js`)
Validate canonical response formats:

```javascript
import { validateSuccessEnvelope, assertValidResponse } from './utils/response-validator.js'

// Validate success envelope
const result = validateSuccessEnvelope(response)
if (!result.valid) {
  console.error(result.errors)
}

// Assert (throws on failure)
assertValidResponse(response, validateV1SearchResponse)
```

### Mock Factories (`tests/setup.js`, `tests/mocks/`)
Create Cloudflare environment mocks:

```javascript
import { createMockKV, createMockR2Bucket } from './setup.js'
import { createMockDONamespace } from './mocks/durable-object.js'

const mockEnv = {
  BOOK_CACHE: createMockKV(),
  BOOK_IMAGES: createMockR2Bucket(),
  PROGRESS_TRACKER: createMockDONamespace()
}
```

---

## 📝 Testing Patterns

See [PATTERNS.md](./PATTERNS.md) for detailed testing patterns and best practices.

### Quick Reference:
- ✅ Always validate canonical envelope format
- ✅ Use fixtures for test data consistency
- ✅ Mock external APIs (Google Books, OpenLibrary, Gemini)
- ✅ Test error scenarios (400, 401, 429, 500)
- ✅ Verify CORS headers on all endpoints
- ✅ Use request builders for consistency
- ❌ Don't make real API calls in tests
- ❌ Don't hardcode test data inline

---

## 🎯 Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| Handlers | 90% | TBD |
| Services | 85% | TBD |
| Providers | 80% | TBD |
| Utils | 95% | TBD |
| **Overall** | **75%** | TBD |

Run `npm run test:coverage` to generate detailed coverage report.

---

## 🐛 Debugging Tests

### Run single test file:
```bash
npx vitest run tests/handlers/v1/search-isbn.test.ts
```

### Run specific test:
```bash
npx vitest run -t "should return canonical envelope"
```

### Debug with console logs:
```javascript
import { expect, describe, it } from 'vitest'

it('should do something', () => {
  console.log('Debug:', someValue)
  expect(someValue).toBe(expected)
})
```

### Use Vitest UI for debugging:
```bash
npm run test:ui
```

---

## 🔧 Common Issues

### Issue: "Failed to connect to worker"
**Solution:** Tests that require `wrangler dev` running will skip automatically. Use mock environments instead.

### Issue: "Module not found"
**Solution:** Ensure import paths use `.js` extension (ES modules):
```javascript
// ✅ Correct
import { foo } from './utils/foo.js'

// ❌ Wrong
import { foo } from './utils/foo'
```

### Issue: "Timeout exceeded"
**Solution:** Increase timeout for slow tests:
```javascript
it('should handle large batch', async () => {
  // ...
}, { timeout: 30000 }) // 30 seconds
```

---

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/)
- [Test Patterns Guide](./PATTERNS.md)
- [Project CLAUDE.md](../.claude/CLAUDE.md)

---

## 🤝 Contributing

When adding new features:
1. ✅ Write tests first (TDD recommended)
2. ✅ Follow existing test patterns
3. ✅ Ensure 75%+ coverage
4. ✅ Validate canonical response formats
5. ✅ Document new test utilities

**Test Naming Convention:**
```javascript
describe('ComponentName', () => {
  describe('methodName()', () => {
    it('should behave as expected when condition', () => {
      // Arrange
      const input = 'test'

      // Act
      const result = methodName(input)

      // Assert
      expect(result).toBe('expected')
    })
  })
})
```

---

**Last Updated:** November 14, 2025
**Maintained By:** BooksTrack Engineering Team
