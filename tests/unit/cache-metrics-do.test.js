
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CacheMetricsDO } from '../../src/durable-objects/cache-metrics'

describe('CacheMetricsDO', () => {
  let state
  let env
  let cacheMetricsDO

  beforeEach(() => {
    // Mock storage
    const storage = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      getAlarm: vi.fn().mockResolvedValue(null),
      setAlarm: vi.fn().mockResolvedValue(undefined),
    }

    // Mock state
    state = {
      storage,
      blockConcurrencyWhile: vi.fn((callback) => callback()),
    }

    // Mock env
    env = {}

    // Instantiate Durable Object
    cacheMetricsDO = new CacheMetricsDO(state, env)
  })

  describe('recordEvent', () => {
    it('should throw error if eventData is null', async () => {
      await expect(cacheMetricsDO.recordEvent(null))
        .rejects.toThrow('Invalid event data: must be an object')
    })

    it('should throw error if eventData is undefined', async () => {
      await expect(cacheMetricsDO.recordEvent(undefined))
        .rejects.toThrow('Invalid event data: must be an object')
    })

    it('should throw error if eventData is not an object', async () => {
      await expect(cacheMetricsDO.recordEvent('string'))
        .rejects.toThrow('Invalid event data: must be an object')
      await expect(cacheMetricsDO.recordEvent(123))
        .rejects.toThrow('Invalid event data: must be an object')
    })

    it('should throw error if required field is missing', async () => {
      const validData = { type: 'hit', prefix: 'book:', key: '123', timestamp: Date.now() }

      const missingType = { ...validData }
      delete missingType.type
      await expect(cacheMetricsDO.recordEvent(missingType))
        .rejects.toThrow("Invalid event data: missing required field 'type'")

      const missingPrefix = { ...validData }
      delete missingPrefix.prefix
      await expect(cacheMetricsDO.recordEvent(missingPrefix))
        .rejects.toThrow("Invalid event data: missing required field 'prefix'")

      const missingKey = { ...validData }
      delete missingKey.key
      await expect(cacheMetricsDO.recordEvent(missingKey))
        .rejects.toThrow("Invalid event data: missing required field 'key'")

      const missingTimestamp = { ...validData }
      delete missingTimestamp.timestamp
      await expect(cacheMetricsDO.recordEvent(missingTimestamp))
        .rejects.toThrow("Invalid event data: missing required field 'timestamp'")
    })

    it('should throw error if type is invalid', async () => {
      const invalidType = { type: 'invalid', prefix: 'book:', key: '123', timestamp: Date.now() }
      await expect(cacheMetricsDO.recordEvent(invalidType))
        .rejects.toThrow('Invalid event type: must be one of hit, miss, write')
    })

    it('should throw error if timestamp is invalid', async () => {
      const invalidTimestamp = { type: 'hit', prefix: 'book:', key: '123', timestamp: 'not-a-number' }
      await expect(cacheMetricsDO.recordEvent(invalidTimestamp))
        .rejects.toThrow('Invalid timestamp: must be a positive number')

      const negativeTimestamp = { type: 'hit', prefix: 'book:', key: '123', timestamp: -1 }
      await expect(cacheMetricsDO.recordEvent(negativeTimestamp))
        .rejects.toThrow('Invalid timestamp: must be a positive number')
    })

    it('should return success true for valid event data', async () => {
      const validData = { type: 'hit', prefix: 'book:', key: '123', timestamp: Date.now() }
      const result = await cacheMetricsDO.recordEvent(validData)
      expect(result).toEqual({ success: true })
    })
  })
})
