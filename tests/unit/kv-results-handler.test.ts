/**
 * Unit Tests: KV Results Handler
 *
 * Tests for the generic KV results retrieval handler
 */

import { describe, it, expect, vi } from 'vitest'
import { handleKVResults, calculateExpiresAt } from '../../src/utils/cache/kv-results-handler.js'

describe('calculateExpiresAt', () => {
  it('should convert Unix timestamp to ISO string', () => {
    const unixTimestamp = 1700000000 // Nov 14, 2023
    const result = calculateExpiresAt({ expiration: unixTimestamp })
    expect(result).toBe(new Date(unixTimestamp * 1000).toISOString())
  })

  it('should return 24h from now when metadata is undefined', () => {
    const before = Date.now()
    const result = calculateExpiresAt(undefined)
    const after = Date.now()

    // Parse the result
    const resultTime = new Date(result).getTime()

    // Should be approximately 24 hours from now
    expect(resultTime).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
    expect(resultTime).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000)
  })

  it('should return 24h from now when expiration is undefined', () => {
    const before = Date.now()
    const result = calculateExpiresAt({})
    const after = Date.now()

    const resultTime = new Date(result).getTime()
    expect(resultTime).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
    expect(resultTime).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000)
  })
})

describe('handleKVResults', () => {
  const mockConfig = {
    keyPrefix: 'test-results',
    resultTypeName: 'Test',
    logPrefix: 'test',
  }

  it('should return error for empty jobId', async () => {
    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn(),
      },
    }

    const response = await handleKVResults('', mockEnv, mockConfig, null)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('INVALID_REQUEST')
  })

  it('should return error for whitespace-only jobId', async () => {
    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn(),
      },
    }

    const response = await handleKVResults('   ', mockEnv, mockConfig, null)
    expect(response.status).toBe(400)
  })

  it('should return 404 when results not found', async () => {
    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
      },
    }

    const response = await handleKVResults('job-123', mockEnv, mockConfig, null)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
    expect(data.error.message).toContain('Test results not found or expired')
  })

  it('should return success with results when found', async () => {
    const mockResults = { foo: 'bar', count: 42 }
    const mockExpiration = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: mockResults,
          metadata: { expiration: mockExpiration },
        }),
      },
    }

    const response = await handleKVResults('job-123', mockEnv, mockConfig, null)
    const data = await response.json()

    expect(response.status).toBe(200)
    // Implementation returns { ...results, expiresAt } directly (not wrapped)
    expect(data.foo).toBe('bar')
    expect(data.count).toBe(42)
    expect(data.expiresAt).toBeDefined()
  })

  it('should use correct KV key prefix', async () => {
    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
      },
    }

    await handleKVResults('my-job-id', mockEnv, mockConfig, null)

    expect(mockEnv.CACHE.getWithMetadata).toHaveBeenCalledWith(
      'test-results:my-job-id',
      'json'
    )
  })

  it('should handle KV errors gracefully', async () => {
    const mockEnv = {
      CACHE: {
        getWithMetadata: vi.fn().mockRejectedValue(new Error('KV error')),
      },
    }

    const response = await handleKVResults('job-123', mockEnv, mockConfig, null)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error.code).toBe('INTERNAL_ERROR')
  })
})
