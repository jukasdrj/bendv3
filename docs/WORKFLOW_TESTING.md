# Workflow Testing Guide

**Version:** 1.0 | **Created:** November 25, 2025 | **Sprint:** 3 Phase 3

## Overview

This guide covers the testing strategy for BooksTrack Cloudflare Workflows, including unit tests, integration tests, and end-to-end validation.

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Test Pyramid                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        ┌─────────┐                               │
│                        │  E2E    │  ← Integration tests          │
│                        │  Tests  │    (requires wrangler dev)    │
│                       ┌┴─────────┴┐                              │
│                       │  Integration│ ← API endpoint tests       │
│                      ┌┴────────────┴┐                            │
│                      │  Unit Tests   │ ← Isolated step tests     │
│                     ┌┴───────────────┴┐                          │
│                     │  Test Fixtures   │ ← Shared mock data      │
│                    └───────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
tests/
├── fixtures/
│   └── workflow-fixtures.ts     # Shared test data
├── utils/
│   └── workflow-test-helpers.ts # Mock factories, polling utilities
└── workflows/
    ├── book-import.test.ts      # Unit tests for workflow steps
    └── workflow-integration.test.ts # E2E integration tests
```

## Unit Testing

### Testing Individual Steps

```typescript
import { describe, it, expect } from 'vitest'
import { createMockWorkflowStep, createMockEnv } from '../utils/workflow-test-helpers'

describe('BookImportWorkflow - Step 2: Fetch Metadata', () => {
  it('should fetch metadata from Google Books', async () => {
    const mockStep = createMockWorkflowStep()
    const mockEnv = createMockEnv()

    const metadata = await mockStep.do('fetch-metadata', async () => {
      // Simulate API call
      return {
        isbn: '9780439708180',
        title: "Harry Potter and the Philosopher's Stone",
        author: 'J.K. Rowling',
      }
    })

    expect(metadata.title).toContain('Harry Potter')
  })
})
```

### Mocking External APIs

```typescript
import { createMockFetch } from '../utils/workflow-test-helpers'

beforeEach(() => {
  globalThis.fetch = createMockFetch(new Map([
    ['googleapis.com/books', new Response(JSON.stringify(mockGoogleBooksResponse))],
    ['openlibrary.org', new Response(JSON.stringify(mockOpenLibraryResponse))],
  ]))
})
```

### Testing Step Order

```typescript
import { assertStepOrder } from '../utils/workflow-test-helpers'

it('should execute steps in correct order', async () => {
  const mockStep = createMockWorkflowStep()

  await mockStep.do('validate-isbn', async () => '9780439708180')
  await mockStep.do('fetch-metadata', async () => metadata)
  await mockStep.do('upload-cover', async () => 'covers/book.jpg')
  await mockStep.do('save-to-database', async () => true)

  assertStepOrder(mockStep, [
    'validate-isbn',
    'fetch-metadata',
    'upload-cover',
    'save-to-database',
  ])
})
```

## Integration Testing

### Prerequisites

```bash
# Start local development server
npm run dev

# Run integration tests
RUN_INTEGRATION_TESTS=true npm test tests/workflows/workflow-integration.test.ts
```

### Polling Job Status

```typescript
import { pollJobStatus, waitForProgress } from '../utils/workflow-test-helpers'

it('should complete workflow successfully', async () => {
  // Trigger workflow
  const response = await fetch('http://localhost:8787/v2/import/workflow', {
    method: 'POST',
    body: JSON.stringify({ isbn: '9780439708180', jobId: 'test-123' }),
  })

  // Poll until completion
  const status = await pollJobStatus('test-123', {
    timeout: 30000,
    interval: 1000,
  })

  expect(status.status).toBe('completed')
  expect(status.progress).toBe(1.0)
})
```

### WebSocket Testing

```typescript
import { collectWebSocketMessages } from '../utils/workflow-test-helpers'

it('should receive progress updates via WebSocket', async () => {
  const ws = new WebSocket('ws://localhost:8787/ws/progress?jobId=test-123')

  const messages = await collectWebSocketMessages(
    ws,
    (msgs) => msgs.some((m) => m.status === 'completed'),
    30000
  )

  expect(messages.length).toBeGreaterThan(0)
  expect(messages[messages.length - 1].status).toBe('completed')
})
```

## Test Fixtures

### Using Fixtures

```typescript
import {
  mockHarryPotterMetadata,
  mockGoogleBooksResponse,
  sampleCSVContent,
} from '../fixtures/workflow-fixtures'

it('should parse Harry Potter metadata', () => {
  expect(mockHarryPotterMetadata.isbn).toBe('9780439708180')
  expect(mockHarryPotterMetadata.title).toContain('Harry Potter')
})
```

### Available Fixtures

| Fixture | Description |
|---------|-------------|
| `sampleCSVContent` | Valid CSV with 3 books |
| `mockHarryPotterMetadata` | Complete book metadata |
| `mockGoogleBooksResponse` | Google Books API response |
| `mockOpenLibraryResponse` | OpenLibrary API response |
| `mockEmbeddingResult` | 1024-dim embedding |
| `mockJobStatusCompleted` | Completed job status |

## Test Utilities

### Mock Environment Factory

```typescript
const mockEnv = createMockEnv({
  // Override specific bindings
  AI: {
    run: vi.fn().mockRejectedValue(new Error('AI unavailable')),
  },
})
```

### Random Data Generators

```typescript
import { generateISBN13, generateJobId } from '../utils/workflow-test-helpers'

const isbn = generateISBN13()   // Valid ISBN-13 with correct checksum
const jobId = generateJobId()   // Unique job ID for testing
```

## Running Tests

### All Tests

```bash
npm test
```

### Workflow Tests Only

```bash
npm test tests/workflows/
```

### Integration Tests (Requires Local Server)

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run integration tests
RUN_INTEGRATION_TESTS=true npm test tests/workflows/workflow-integration.test.ts
```

### Watch Mode

```bash
npm run test:watch -- tests/workflows/
```

## Coverage Requirements

| Component | Target |
|-----------|--------|
| Workflow steps | 100% |
| Error handling | 90% |
| Edge cases | 80% |
| Integration | 70% |

## Troubleshooting

### Tests Timeout

- Increase `INTEGRATION_TIMEOUT` in test file
- Check if `wrangler dev` is running
- Verify API keys are configured

### Mock Not Working

- Ensure `globalThis.fetch` is overridden before test
- Check mock response content-type headers
- Verify mock URL patterns match actual requests

### WebSocket Tests Fail

- WebSocket tests require actual server connection
- Use `describe.skipIf(!runIntegration)` for WebSocket tests
- Check WebSocket URL format (`ws://` vs `wss://`)

## Related Documentation

- [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md) - Vectorize integration
- [D1_OPTIMIZATION.md](D1_OPTIMIZATION.md) - Database indexing
- [API_CONTRACT.md](API_CONTRACT.md) - API endpoint specifications

---
**Last Updated:** November 25, 2025
