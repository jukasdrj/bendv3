/**
 * Smoke Tests - Input Validation
 *
 * Fast validation tests for critical validation logic.
 * Use with: npm run test:smoke
 */

import { describe, it, expect } from 'vitest'

describe('Validation Smoke Tests', () => {
  it('should validate ISBN format checking works', async () => {
    const { isValidISBN } = await import('../../src/utils/validation/isbn-validation.ts')

    // Valid ISBNs
    expect(isValidISBN('9780439708180')).toBe(true)
    expect(isValidISBN('0439708184')).toBe(true)

    // Invalid ISBNs
    expect(isValidISBN('123')).toBe(false)
    expect(isValidISBN('')).toBe(false)
    expect(isValidISBN(null)).toBe(false)
  })

  it('should import cache utilities', async () => {
    const cacheKeys = await import('../../src/utils/cache/cache-keys.ts')
    expect(cacheKeys).toBeDefined()
    expect(typeof cacheKeys).toBe('object')
  })

  it('should import response transformers', async () => {
    const transformer = await import('../../src/utils/transform/response-transformer.ts')
    expect(transformer).toBeDefined()
  })

  it('should import middleware modules', async () => {
    const cors = await import('../../src/middleware/cors.js')
    expect(cors).toBeDefined()
  })
})
