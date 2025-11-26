/**
 * Circuit Breaker implementation for external API providers.
 */

import type { CircuitState, CircuitStateStore } from '../types/circuit-breaker';
import { CircuitBreakerOpenError } from '../types/errors';

export class CircuitBreaker {
  private provider: string;
  private env: any;
  private options: {
    failureThreshold: number;
    cooldownMs: number;
    successThreshold: number;
  };

  constructor(
    provider: string,
    env: any,
    options = {
      failureThreshold: 5,
      cooldownMs: 60000,
      successThreshold: 2,
    },
  ) {
    this.provider = provider;
    this.env = env;
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let state = await this.getState();

    if (state.state === 'OPEN') {
      if (Date.now() - state.openedAt < this.options.cooldownMs) {
        throw new CircuitBreakerOpenError(this.provider);
      }
      state = { ...state, state: 'HALF-OPEN' };
      await this.setState(state);
    }

    try {
      const result = await fn();
      await this.recordSuccess(state);
      return result;
    } catch (error) {
      await this.recordFailure(state);
      throw error;
    }
  }

  private async getState(): Promise<CircuitStateStore> {
    const key = `circuit:${this.provider}`;
    return (
      (await this.env.CACHE.get(key, 'json')) || {
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        openedAt: 0,
      }
    );
  }

  private async setState(state: CircuitStateStore) {
    const key = `circuit:${this.provider}`;
    await this.env.CACHE.put(key, JSON.stringify(state), {
      expirationTtl: 300,
    }); // 5 min TTL

    if (this.env.PERFORMANCE_ANALYTICS) {
      this.env.PERFORMANCE_ANALYTICS.writeDataPoint({
        blobs: [this.provider, state.state],
        doubles: [state.failures, state.successes],
        indexes: ['circuit-breaker'],
      });
    }
  }

  private async recordSuccess(state: CircuitStateStore) {
    if (state.state === 'HALF-OPEN') {
      state.successes++;
      if (state.successes >= this.options.successThreshold) {
        state.state = 'CLOSED';
        state.failures = 0;
        state.successes = 0;
      }
    } else {
      state.failures = 0;
      state.successes = 0;
    }
    await this.setState(state);
  }

  private async recordFailure(state: CircuitStateStore) {
    state.failures++;
    if (state.failures >= this.options.failureThreshold) {
      state.state = 'OPEN';
      state.openedAt = Date.now();
    }
    await this.setState(state);
  }
}
