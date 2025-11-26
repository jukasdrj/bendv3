/**
 * Unit tests for the CircuitBreaker service.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/services/circuit-breaker';
import { CircuitBreakerOpenError } from '../../src/types/errors';

describe('CircuitBreaker', () => {
  let mockEnv;
  let circuitBreaker;

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
      },
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    };

    circuitBreaker = new CircuitBreaker('test-provider', mockEnv, {
      failureThreshold: 2,
      cooldownMs: 1000,
      successThreshold: 2,
    });
  });

  test('should allow requests when closed', async () => {
    mockEnv.CACHE.get.mockResolvedValue({ state: 'CLOSED', failures: 0, successes: 0 });

    const fn = vi.fn().mockResolvedValue('success');
    const result = await circuitBreaker.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  test('should open after failure threshold is reached', async () => {
    mockEnv.CACHE.get.mockResolvedValue({ state: 'CLOSED', failures: 1, successes: 0 });

    const fn = vi.fn().mockRejectedValue(new Error('failure'));

    await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');

    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'circuit:test-provider',
      expect.stringContaining('"state":"OPEN"'),
      { expirationTtl: 300 },
    );
  });

  test('should fail fast when open', async () => {
    mockEnv.CACHE.get.mockResolvedValue({
      state: 'OPEN',
      failures: 2,
      successes: 0,
      openedAt: Date.now(),
    });

    const fn = vi.fn();
    await expect(circuitBreaker.execute(fn)).rejects.toThrow(
      CircuitBreakerOpenError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  test('should transition to half-open after cooldown', async () => {
    mockEnv.CACHE.get.mockResolvedValue({
      state: 'OPEN',
      failures: 2,
      successes: 0,
      openedAt: Date.now() - 2000,
    });

    const fn = vi.fn().mockResolvedValue('success');
    await circuitBreaker.execute(fn);

    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'circuit:test-provider',
      expect.stringContaining('"state":"HALF-OPEN"'),
      { expirationTtl: 300 },
    );
  });

  test('should close after success threshold is reached in half-open state', async () => {
    mockEnv.CACHE.get.mockResolvedValue({
      state: 'HALF-OPEN',
      failures: 2,
      successes: 1,
      openedAt: Date.now() - 2000,
    });

    const fn = vi.fn().mockResolvedValue('success');
    await circuitBreaker.execute(fn);

    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'circuit:test-provider',
      expect.stringContaining('"state":"CLOSED"'),
      { expirationTtl: 300 },
    );
  });

  test('should open again if request fails in half-open state', async () => {
    mockEnv.CACHE.get.mockResolvedValue({
      state: 'HALF-OPEN',
      failures: 2,
      successes: 0,
      openedAt: Date.now() - 2000,
    });

    const fn = vi.fn().mockRejectedValue(new Error('failure'));
    await expect(circuitBreaker.execute(fn)).rejects.toThrow('failure');

    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'circuit:test-provider',
      expect.stringContaining('"state":"OPEN"'),
      { expirationTtl: 300 },
    );
  });
});
