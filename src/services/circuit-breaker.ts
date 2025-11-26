/**
 * Circuit Breaker Service
 *
 * Implements the Circuit Breaker pattern to prevent cascading failures
 * when external API providers are experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Provider is down, fail fast without making requests
 * - HALF_OPEN: Testing recovery, allow limited requests
 *
 * Transitions:
 * CLOSED → OPEN: After N consecutive failures
 * OPEN → HALF_OPEN: After cooldown period
 * HALF_OPEN → CLOSED: After N consecutive successes
 * HALF_OPEN → OPEN: On any failure
 */

import { CircuitBreakerOpenError } from '../types/errors'
import type {
  CircuitState,
  CircuitBreakerState,
  CircuitBreakerOptions,
  CircuitBreakerEvent
} from '../types/circuit-breaker'
import { DEFAULT_CIRCUIT_BREAKER_OPTIONS } from '../types/circuit-breaker'

/**
 * Circuit Breaker for external API providers
 */
export class CircuitBreaker {
  private provider: string
  private env: any // Env type with CACHE binding
  private options: CircuitBreakerOptions

  constructor(
    provider: string,
    env: any,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.provider = provider
    this.env = env
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options }
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn - Function to execute (API call)
   * @returns Promise<T> - Result from function
   * @throws CircuitBreakerOpenError if circuit is OPEN
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState()

    // Check if circuit is OPEN
    if (state.state === 'OPEN') {
      const now = Date.now()
      const timeSinceOpened = state.openedAt ? now - state.openedAt : 0

      // Still in cooldown period?
      if (timeSinceOpened < this.options.cooldownMs) {
        await this.logEvent('rejected', state.failureCount)
        throw new CircuitBreakerOpenError(this.provider, this.options.cooldownMs - timeSinceOpened)
      }

      // Cooldown expired, transition to HALF_OPEN
      console.log(`[CircuitBreaker] ${this.provider}: OPEN → HALF_OPEN (cooldown expired)`)
      await this.transitionToHalfOpen()
    }

    // Execute the function and handle success/failure
    try {
      const result = await fn()
      await this.recordSuccess()
      return result
    } catch (error) {
      await this.recordFailure()
      throw error
    }
  }

  /**
   * Get current circuit breaker state from KV cache
   */
  private async getState(): Promise<CircuitBreakerState> {
    const key = this.getCacheKey()
    const cached = await this.env.CACHE?.get(key, 'json')

    if (cached) {
      return cached as CircuitBreakerState
    }

    // Default state: CLOSED with no failures
    return {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0
    }
  }

  /**
   * Update circuit breaker state in KV cache
   */
  private async setState(state: CircuitBreakerState): Promise<void> {
    const key = this.getCacheKey()
    await this.env.CACHE?.put(
      key,
      JSON.stringify(state),
      { expirationTtl: this.options.stateExpirationTtl }
    )
  }

  /**
   * Record a successful request
   */
  private async recordSuccess(): Promise<void> {
    const state = await this.getState()

    if (state.state === 'HALF_OPEN') {
      // Increment success count in HALF_OPEN state
      const newSuccessCount = state.successCount + 1

      if (newSuccessCount >= this.options.successThreshold) {
        // Transition to CLOSED after enough successes
        console.log(`[CircuitBreaker] ${this.provider}: HALF_OPEN → CLOSED (${newSuccessCount} successes)`)
        await this.setState({
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0
        })
        await this.logEvent('closed')
      } else {
        // Still in HALF_OPEN, increment success count
        await this.setState({
          ...state,
          successCount: newSuccessCount
        })
      }
    } else if (state.state === 'CLOSED') {
      // Reset failure count on success in CLOSED state
      if (state.failureCount > 0) {
        await this.setState({
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0
        })
      }
    }
  }

  /**
   * Record a failed request
   */
  private async recordFailure(): Promise<void> {
    const state = await this.getState()

    if (state.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN → back to OPEN
      console.log(`[CircuitBreaker] ${this.provider}: HALF_OPEN → OPEN (failure during recovery)`)
      await this.setState({
        state: 'OPEN',
        failureCount: state.failureCount + 1,
        successCount: 0,
        lastFailureTime: Date.now(),
        openedAt: Date.now()
      })
      await this.logEvent('opened', state.failureCount + 1)
    } else if (state.state === 'CLOSED') {
      // Increment failure count in CLOSED state
      const newFailureCount = state.failureCount + 1

      if (newFailureCount >= this.options.failureThreshold) {
        // Transition to OPEN after threshold exceeded
        console.log(`[CircuitBreaker] ${this.provider}: CLOSED → OPEN (${newFailureCount} failures)`)
        await this.setState({
          state: 'OPEN',
          failureCount: newFailureCount,
          successCount: 0,
          lastFailureTime: Date.now(),
          openedAt: Date.now()
        })
        await this.logEvent('opened', newFailureCount)
      } else {
        // Still in CLOSED, increment failure count
        await this.setState({
          state: 'CLOSED',
          failureCount: newFailureCount,
          successCount: 0,
          lastFailureTime: Date.now()
        })
      }
    }
  }

  /**
   * Transition to HALF_OPEN state (testing recovery)
   */
  private async transitionToHalfOpen(): Promise<void> {
    const state = await this.getState()
    await this.setState({
      ...state,
      state: 'HALF_OPEN',
      successCount: 0
    })
    await this.logEvent('half_opened', state.failureCount)
  }

  /**
   * Get KV cache key for this circuit breaker
   */
  private getCacheKey(): string {
    return `circuit:${this.provider}`
  }

  /**
   * Log circuit breaker event to analytics (if available)
   */
  private async logEvent(
    event: 'opened' | 'closed' | 'half_opened' | 'rejected',
    failureCount?: number
  ): Promise<void> {
    const analyticsEvent: CircuitBreakerEvent = {
      provider: this.provider,
      event,
      timestamp: Date.now(),
      failureCount
    }

    // Log to console for debugging
    console.log(`[CircuitBreaker] ${this.provider}: ${event}`, analyticsEvent)

    // Log to analytics engine if available
    if (this.env.PERFORMANCE_ANALYTICS) {
      this.env.PERFORMANCE_ANALYTICS.writeDataPoint({
        blobs: [this.provider, event],
        doubles: [failureCount || 0],
        indexes: [`circuit-breaker-${event}`]
      })
    }
  }

  /**
   * Get current circuit breaker state (for monitoring/debugging)
   */
  async getCircuitState(): Promise<CircuitBreakerState> {
    return await this.getState()
  }

  /**
   * Manually reset circuit breaker to CLOSED state
   * (use with caution - for admin/debugging only)
   */
  async reset(): Promise<void> {
    console.log(`[CircuitBreaker] ${this.provider}: Manual reset to CLOSED`)
    await this.setState({
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0
    })
  }
}

/**
 * Helper function to create circuit breaker and execute function
 * Convenience wrapper for one-off usage
 */
export async function withCircuitBreaker<T>(
  provider: string,
  env: any,
  fn: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): Promise<T> {
  const breaker = new CircuitBreaker(provider, env, options)
  return await breaker.execute(fn)
}
