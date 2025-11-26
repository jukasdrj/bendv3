/**
 * Type definitions for the Circuit Breaker service.
 */

/**
 * Represents the state of the circuit breaker.
 *
 * - `CLOSED`: The circuit is closed and requests are allowed to pass through.
 * - `OPEN`: The circuit is open and requests are failing fast.
 * - `HALF-OPEN`: The circuit is in a trial state to see if the provider has recovered.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

/**
 * Represents the state of the circuit breaker as stored in the cache.
 */
export interface CircuitStateStore {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number;
}
