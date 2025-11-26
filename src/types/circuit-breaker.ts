/**
 * Circuit Breaker Type Definitions
 *
 * Implements the Circuit Breaker pattern for external API resilience.
 * Prevents cascading failures by failing fast when external providers are down.
 */

/**
 * Circuit breaker states
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing recovery, allow limited requests
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

/**
 * Circuit breaker state stored in KV cache
 */
export interface CircuitBreakerState {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime?: number
  openedAt?: number
}

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number

  /** Number of consecutive successes in HALF_OPEN before closing circuit */
  successThreshold: number

  /** Time in ms to wait before attempting recovery (OPEN → HALF_OPEN) */
  cooldownMs: number

  /** Time in ms before state expires from cache */
  stateExpirationTtl: number
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,         // Open after 5 consecutive failures
  successThreshold: 2,         // Close after 2 successes in HALF_OPEN
  cooldownMs: 60000,          // 60 seconds cooldown
  stateExpirationTtl: 300     // 5 minutes TTL in KV cache
}

/**
 * Circuit breaker analytics event
 */
export interface CircuitBreakerEvent {
  provider: string
  event: 'opened' | 'closed' | 'half_opened' | 'rejected'
  timestamp: number
  failureCount?: number
}
