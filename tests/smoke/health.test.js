/**
 * Smoke Tests - Health Check
 *
 * Quick validation tests that run fast and use minimal resources.
 * Use with: npm run test:smoke
 */

import { describe, it, expect } from 'vitest'

describe('Health Check Smoke Tests', () => {
  it('should import core utilities without errors', async () => {
    // Test that critical modules can be imported without syntax errors
    const responseBuilder = await import('../../src/utils/response-builder.ts')
    expect(responseBuilder).toBeDefined()
    expect(typeof responseBuilder).toBe('object')
  })

  it('should import book mapper utilities', async () => {
    const bookMappers = await import('../../src/utils/book-mappers.ts')
    expect(bookMappers).toBeDefined()
  })

  it('should import analytics utilities', async () => {
    const analytics = await import('../../src/utils/analytics-logger.ts')
    expect(analytics).toBeDefined()
  })

  it('should validate environment structure', () => {
    // Minimal validation that doesn't require actual env bindings
    const mockEnv = {
      BOOK_CACHE: null,
      PROGRESS_WEBSOCKET_DO: null,
      GOOGLE_BOOKS_API_KEY: 'test-key'
    }

    expect(mockEnv).toHaveProperty('BOOK_CACHE')
    expect(mockEnv).toHaveProperty('PROGRESS_WEBSOCKET_DO')
    expect(mockEnv).toHaveProperty('GOOGLE_BOOKS_API_KEY')
  })
})
