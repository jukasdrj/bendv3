# Test Implementation Guide

**Status:** Test scaffold files created and ready for implementation
**Created:** November 13, 2025
**Test Files Created:** 10 scaffold files

---

## What's Been Generated

### 1. **TEST_PLAN.md** ✅
Comprehensive 200+ line test strategy document covering:
- System overview and current testing gaps
- 240+ test cases organized by component
- Priority levels (Critical → High → Medium)
- Success metrics and coverage targets
- Complete test file organization structure
- Mocking strategy and execution phases

**Read this first** to understand the testing strategy.

---

## Test Scaffold Files Created

All files are in `/tests/` directory with empty test implementations (TODO markers).

### Unit Tests (`tests/unit/`)
```
✅ validators.test.js       (5 tests)     - ISBN, query, jobId validation
✅ normalizers.test.js      (8 tests)     - Provider response normalization
✅ auth.test.js            (10 tests)     - Token generation, refresh, expiration
✅ cache.test.js            (4 tests)     - Cache TTL, hits, invalidation
```

### Integration Tests (`tests/integration/`)
```
✅ external-apis.test.js    (15 tests)    - Provider chains, fallbacks, error recovery
✅ enrichment.test.js       (12 tests)    - Multi-provider enrichment, quality scoring
✅ websocket-do.test.js     (15 tests)    - WebSocket auth, state management, batch ops
✅ batch-processing.test.js  (8 tests)    - Concurrent operations, cancellation
```

### Handler Tests (`tests/handlers/`)
```
✅ search-handlers.test.js  (40 tests)    - /v1/search/* endpoints
📝 websocket-handlers.test.js (5 tests)   - /ws/progress route
📝 token-refresh.test.js    (5 tests)     - /api/token/refresh route
📝 batch-scan.test.js       (5 tests)     - /api/scan-bookshelf, /api/enrichment/batch
```

### Error Scenario Tests (`tests/error-scenarios/`)
```
✅ concurrency.test.js      (20 tests)    - Race conditions, concurrent operations
📝 network-failures.test.js (12 tests)    - Timeouts, connection errors
📝 state-violations.test.js (15 tests)    - Invalid state transitions
```

### E2E Tests (`tests/e2e/`)
```
📝 bookshelf-scan.test.js   (8 tests)     - Photo → WebSocket → AI → enrichment
📝 batch-enrichment.test.js (8 tests)     - Book batch workflow
📝 csv-import.test.js      (10 tests)     - CSV parsing → enrichment → completion
```

---

## Getting Started: Implementation Steps

### Phase 1: Foundation Setup (Week 1)

#### 1. Install Vitest
```bash
npm install --save-dev vitest @vitest/ui
```

#### 2. Create vitest.config.js
```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      branches: 75,
      lines: 75,
      functions: 75,
      statements: 75
    }
  }
})
```

#### 3. Update package.json scripts
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

#### 4. Start with Unit Tests
```bash
# Run only unit tests first
npm test -- tests/unit/

# Expected: 27 tests to implement
```

---

### Phase 2: Mock External APIs (Week 1-2)

Create `tests/mocks/` directory with API mocks:

```javascript
// tests/mocks/providers.js
export const mockGoogleBooksResponse = {
  items: [{
    id: 'test-id',
    volumeInfo: {
      title: 'Test Book',
      authors: ['Test Author'],
      industryIdentifiers: [
        { type: 'ISBN_13', identifier: '9780439708180' }
      ]
    }
  }]
}

// tests/setup.js - Configure Vitest mocks
vi.mock('../src/providers/google-books', () => ({
  searchGoogleBooks: vi.fn()
}))

vi.mock('../src/providers/gemini-provider', () => ({
  scanImageWithGemini: vi.fn()
}))
```

---

### Phase 3: Implement Tests in Priority Order

#### Week 1: Unit & Auth
```bash
# Day 1-2: Validators
npm test -- tests/unit/validators.test.js

# Day 3: Normalizers
npm test -- tests/unit/normalizers.test.js

# Day 4-5: Auth (token management)
npm test -- tests/unit/auth.test.js

# Day 6-7: Cache
npm test -- tests/unit/cache.test.js
```

#### Week 2: Integration & API Chains
```bash
# Day 8-10: External APIs
npm test -- tests/integration/external-apis.test.js

# Day 11-12: Enrichment pipeline
npm test -- tests/integration/enrichment.test.js

# Day 13-14: Batch processing
npm test -- tests/integration/batch-processing.test.js
```

#### Week 3: WebSocket & Handlers
```bash
# Day 15-17: WebSocket Durable Object (complex!)
npm test -- tests/integration/websocket-do.test.js

# Day 18-21: Search handlers (40 tests)
npm test -- tests/handlers/search-handlers.test.js
```

#### Week 4: E2E & Error Scenarios
```bash
# Day 22-23: Error scenarios
npm test -- tests/error-scenarios/concurrency.test.js

# Day 24-26: E2E workflows
npm test -- tests/e2e/

# Day 27-28: Final gap testing
npm test -- tests/error-scenarios/network-failures.test.js
```

---

## Test Implementation Template

Each test file has this structure. Replace TODO with actual test logic:

```javascript
describe('Feature Group', () => {
  beforeEach(() => {
    // Setup for each test
    vi.clearAllMocks()
  })

  it('should do something specific', () => {
    // TODO: Implement test
    // Arrange: Setup test data
    // Act: Call function
    // Assert: Verify result
    expect(true).toBe(true)
  })
})
```

### Example: Implementing a Real Test

**File:** `tests/unit/auth.test.js`

```javascript
import { generateToken, validateToken } from '../../src/utils/auth'

describe('Token Generation', () => {
  it('should generate valid UUID v4 token', () => {
    // Arrange
    // (none needed)

    // Act
    const token = generateToken()

    // Assert
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(token.length).toBe(36) // UUID format
  })
})
```

---

## Running Tests

### Basic Commands
```bash
npm test                    # Run all tests once
npm run test:watch        # Watch mode (re-run on file change)
npm run test:ui           # Visual UI dashboard
npm run test:coverage     # Coverage report
```

### Filtering Tests
```bash
# Run specific test file
npm test -- tests/unit/auth.test.js

# Run tests matching pattern
npm test -- --grep "token"

# Run only failing tests
npm test -- --grep "fail"
```

### Coverage
```bash
npm run test:coverage
# Creates: coverage/index.html (open in browser)
```

---

## Mocking Patterns

### External API Mocking
```javascript
import { vi } from 'vitest'
import * as googleBooks from '../src/providers/google-books'

beforeEach(() => {
  vi.spyOn(googleBooks, 'searchGoogleBooks').mockResolvedValue({
    success: true,
    items: [{ title: 'Test Book' }]
  })
})
```

### KV Cache Mocking
```javascript
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}

const env = { BOOK_CACHE: mockKV }
```

### Durable Object Storage Mocking
```javascript
const mockStorage = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  setAlarm: vi.fn()
}
```

### WebSocket Mocking
```javascript
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  accept: vi.fn(),
  addEventListener: vi.fn()
}
```

---

## Key Testing Challenges & Solutions

### Challenge 1: Durable Object State Persistence
**Problem:** DO storage is persistent, hard to simulate
**Solution:** Mock storage.put/get, test state transitions

### Challenge 2: WebSocket Lifecycle
**Problem:** Connection/disconnect/reconnect patterns
**Solution:** Create DO test doubles that simulate WebSocket pairs

### Challenge 3: Provider Fallback Chains
**Problem:** Multiple async provider calls with fallback logic
**Solution:** Mock providers with Promise.allSettled, test all combinations

### Challenge 4: Rate Limit Testing
**Problem:** Time-based expiration and per-IP tracking
**Solution:** Mock Date.now(), test boundary conditions

### Challenge 5: Concurrency Testing
**Problem:** Race conditions hard to reproduce deterministically
**Solution:** Use Promise.all to trigger concurrent conditions

---

## Success Criteria

### By End of Week 1
- ✅ All unit tests passing (27 tests)
- ✅ Test infrastructure working (vitest, mocks)
- ✅ Coverage: >50% of utils and validators

### By End of Week 2
- ✅ All integration tests passing (50+ tests)
- ✅ Coverage: >60% of services
- ✅ Mock API integration complete

### By End of Week 3
- ✅ All handler tests passing (55+ tests)
- ✅ Coverage: >70% of index.js and handlers
- ✅ WebSocket DO tests comprehensive

### By End of Week 4
- ✅ All E2E tests passing (26 tests)
- ✅ All error scenario tests (47 tests)
- ✅ Coverage: >75% overall
- ✅ No flaky tests (all deterministic)

---

## File Structure After Implementation

```
bookstrack-backend/
├── TEST_PLAN.md                          ← Read this first!
├── TEST_IMPLEMENTATION_GUIDE.md           ← You are here
├── tests/
│   ├── mocks/                            ← Setup API mocks here
│   │   ├── providers.js
│   │   ├── kv-cache.js
│   │   └── durable-object.js
│   ├── setup.js                          ← Global test setup
│   ├── unit/
│   │   ├── validators.test.js            ✅ Created
│   │   ├── normalizers.test.js           ✅ Created
│   │   ├── auth.test.js                  ✅ Created
│   │   └── cache.test.js                 ✅ Created
│   ├── integration/
│   │   ├── external-apis.test.js         ✅ Created
│   │   ├── enrichment.test.js            ✅ Created
│   │   ├── websocket-do.test.js          ✅ Created
│   │   └── batch-processing.test.js      ✅ Created
│   ├── handlers/
│   │   ├── search-handlers.test.js       ✅ Created
│   │   ├── websocket-handlers.test.js    (create next)
│   │   ├── token-refresh.test.js         (create next)
│   │   └── batch-scan.test.js            (create next)
│   ├── e2e/
│   │   ├── bookshelf-scan.test.js        (create next)
│   │   ├── batch-enrichment.test.js      (create next)
│   │   └── csv-import.test.js            (create next)
│   └── error-scenarios/
│       ├── concurrency.test.js           ✅ Created
│       ├── network-failures.test.js      (create next)
│       └── state-violations.test.js      (create next)
├── vitest.config.js                      ← Create this
└── src/
    ├── index.js
    ├── services/
    ├── handlers/
    └── ... (existing code)
```

---

## Next Steps

1. **Immediate:**
   - Read TEST_PLAN.md for full strategy
   - Create vitest.config.js
   - Update package.json with test scripts

2. **This Week:**
   - Implement tests/mocks/ setup
   - Complete unit tests (27 tests)
   - Achieve >50% coverage on utils

3. **Next Week:**
   - Complete integration tests (50+ tests)
   - Create remaining handler test scaffolds
   - Achieve >70% coverage

4. **Week 3-4:**
   - E2E and error scenario tests
   - Final coverage push to >75%
   - Performance testing

---

## Resources & Documentation

- **Vitest Docs:** https://vitest.dev
- **Test Patterns:** See TEST_PLAN.md for detailed patterns
- **Mocking Guide:** See Mocking Patterns section above
- **Coverage Report:** `npm run test:coverage` generates HTML

---

**Test Suite is Ready for Implementation! 🚀**

Total: 240+ test cases across 10+ files
Estimated: 4-6 weeks to full implementation
Coverage Target: 75%+ for critical paths
