/**
 * Custom error types for the application.
 */

/**
 * Error thrown when a circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit breaker for ${provider} is open`);
    this.name = 'CircuitBreakerOpenError';
  }
}
