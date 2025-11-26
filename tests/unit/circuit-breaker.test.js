/**
 * Circuit Breaker Unit Tests
 *
 * Tests the circuit breaker pattern implementation for external API resilience
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CircuitBreaker, withCircuitBreaker } from '../../src/services/circuit-breaker.ts'
import { CircuitBreakerOpenError } from '../../src/types/errors.ts'

describe('CircuitBreaker', () => {
  let mockEnv
  let mockCache

  beforeEach(() => {
    // Mock KV cache
    mockCache = new Map()
    mockEnv = {
      CACHE: {
        get: vi.fn(async (key, type) => {
          const value = mockCache.get(key)
          if (!value) return null
          return type === 'json' ? JSON.parse(value) : value
        }),
        put: vi.fn(async (key, value) => {
          mockCache.set(key, value)
        })
      },
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: vi.fn()
      }
    }
  })

  describe('Initial state', () => {
    it('should start in CLOSED state', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv)
      const state = await breaker.getCircuitState()

      expect(state.state).toBe('CLOSED')
      expect(state.failureCount).toBe(0)
      expect(state.successCount).toBe(0)
    })
  })

  describe('CLOSED state behavior', () => {
    it('should allow requests to pass through', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv)
      const mockFn = vi.fn(async () => 'success')

      const result = await breaker.execute(mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should increment failure count on errors', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv)
      const mockFn = vi.fn(async () => {
        throw new Error('API error')
      })

      try {
        await breaker.execute(mockFn)
      } catch (error) {
        expect(error.message).toBe('API error')
      }

      const state = await breaker.getCircuitState()
      expect(state.state).toBe('CLOSED')
      expect(state.failureCount).toBe(1)
    })

    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv)

      // Fail once
      try {
        await breaker.execute(async () => {
          throw new Error('Fail')
        })
      } catch {}

      // Then succeed
      await breaker.execute(async () => 'success')

      const state = await breaker.getCircuitState()
      expect(state.failureCount).toBe(0)
    })

    it('should transition to OPEN after failure threshold', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 3
      })

      const mockFn = vi.fn(async () => {
        throw new Error('API error')
      })

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(mockFn)
        } catch {}
      }

      const state = await breaker.getCircuitState()
      expect(state.state).toBe('OPEN')
      expect(state.failureCount).toBe(3)
      expect(state.openedAt).toBeDefined()
    })
  })

  describe('OPEN state behavior', () => {
    it('should reject requests without calling function', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        cooldownMs: 60000
      })

      const mockFn = vi.fn(async () => {
        throw new Error('API error')
      })

      // Fail 2 times to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(mockFn)
        } catch {}
      }

      // Circuit should be OPEN now
      mockFn.mockClear()

      try {
        await breaker.execute(mockFn)
        expect.fail('Should have thrown CircuitBreakerOpenError')
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError)
        expect(error.provider).toBe('test-provider')
        expect(mockFn).not.toHaveBeenCalled() // Function not called!
      }
    })

    it('should transition to HALF_OPEN after cooldown', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        cooldownMs: 100 // 100ms cooldown for fast test
      })

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 150))

      // Next request should transition to HALF_OPEN and execute
      const mockFn = vi.fn(async () => 'success')
      await breaker.execute(mockFn)

      expect(mockFn).toHaveBeenCalled()
    })
  })

  describe('HALF_OPEN state behavior', () => {
    it('should transition to CLOSED after success threshold', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        successThreshold: 2,
        cooldownMs: 100
      })

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 150))

      // Succeed twice in HALF_OPEN to close circuit
      await breaker.execute(async () => 'success')
      await breaker.execute(async () => 'success')

      const state = await breaker.getCircuitState()
      expect(state.state).toBe('CLOSED')
      expect(state.failureCount).toBe(0)
      expect(state.successCount).toBe(0)
    })

    it('should transition back to OPEN on failure', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        cooldownMs: 100
      })

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      // Wait for cooldown to enter HALF_OPEN
      await new Promise((r) => setTimeout(r, 150))

      // Fail in HALF_OPEN → should go back to OPEN
      try {
        await breaker.execute(async () => {
          throw new Error('Fail again')
        })
      } catch {}

      const state = await breaker.getCircuitState()
      expect(state.state).toBe('OPEN')
    })
  })

  describe('Configuration options', () => {
    it('should respect custom failure threshold', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 10
      })

      // Fail 9 times - should still be CLOSED
      for (let i = 0; i < 9; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      let state = await breaker.getCircuitState()
      expect(state.state).toBe('CLOSED')
      expect(state.failureCount).toBe(9)

      // 10th failure should OPEN
      try {
        await breaker.execute(async () => {
          throw new Error('Fail')
        })
      } catch {}

      state = await breaker.getCircuitState()
      expect(state.state).toBe('OPEN')
    })

    it('should respect custom success threshold', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        successThreshold: 3,
        cooldownMs: 100
      })

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 150))

      // Succeed twice - should still be HALF_OPEN
      await breaker.execute(async () => 'success')
      await breaker.execute(async () => 'success')

      let state = await breaker.getCircuitState()
      expect(state.state).toBe('HALF_OPEN')

      // 3rd success should CLOSE
      await breaker.execute(async () => 'success')

      state = await breaker.getCircuitState()
      expect(state.state).toBe('CLOSED')
    })
  })

  describe('Analytics logging', () => {
    it('should log circuit opened event', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2
      })

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      expect(mockEnv.PERFORMANCE_ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          blobs: ['test-provider', 'opened'],
          indexes: ['circuit-breaker-opened']
        })
      )
    })

    it('should log circuit closed event', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2,
        successThreshold: 1,
        cooldownMs: 100
      })

      // Open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 150))

      // Close circuit with 1 success
      await breaker.execute(async () => 'success')

      expect(mockEnv.PERFORMANCE_ANALYTICS.writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          blobs: ['test-provider', 'closed'],
          indexes: ['circuit-breaker-closed']
        })
      )
    })
  })

  describe('Manual reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const breaker = new CircuitBreaker('test-provider', mockEnv, {
        failureThreshold: 2
      })

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Fail')
          })
        } catch {}
      }

      let state = await breaker.getCircuitState()
      expect(state.state).toBe('OPEN')

      // Manual reset
      await breaker.reset()

      state = await breaker.getCircuitState()
      expect(state.state).toBe('CLOSED')
      expect(state.failureCount).toBe(0)
    })
  })

  describe('withCircuitBreaker helper', () => {
    it('should work as a convenience wrapper', async () => {
      const mockFn = vi.fn(async () => 'success')

      const result = await withCircuitBreaker('helper-provider', mockEnv, mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should accept custom options', async () => {
      const mockFn = vi.fn(async () => {
        throw new Error('Fail')
      })

      // Fail threshold 1 with custom options
      try {
        await withCircuitBreaker('helper-provider', mockEnv, mockFn, {
          failureThreshold: 1
        })
      } catch {}

      // Should be OPEN after 1 failure
      try {
        await withCircuitBreaker('helper-provider', mockEnv, mockFn)
        expect.fail('Should have thrown CircuitBreakerOpenError')
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError)
      }
    })
  })
})
