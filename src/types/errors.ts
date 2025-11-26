/**
 * Custom Error Types
 *
 * Domain-specific errors for better error handling and debugging
 */

/**
 * Circuit breaker is open (provider is experiencing issues)
 * Clients should retry after cooldown period or use fallback provider
 */
export class CircuitBreakerOpenError extends Error {
  public readonly provider: string
  public readonly retryAfterMs: number

  constructor(provider: string, retryAfterMs: number = 60000) {
    super(`Circuit breaker OPEN for provider: ${provider}. Retry after ${retryAfterMs}ms`)
    this.name = 'CircuitBreakerOpenError'
    this.provider = provider
    this.retryAfterMs = retryAfterMs

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerOpenError)
    }
  }
}

/**
 * API rate limit exceeded
 */
export class RateLimitError extends Error {
  public readonly provider: string
  public readonly retryAfterMs?: number

  constructor(provider: string, retryAfterMs?: number) {
    super(`Rate limit exceeded for provider: ${provider}`)
    this.name = 'RateLimitError'
    this.provider = provider
    this.retryAfterMs = retryAfterMs

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError)
    }
  }
}

/**
 * External API returned an error
 */
export class ExternalAPIError extends Error {
  public readonly provider: string
  public readonly statusCode?: number
  public readonly retryable: boolean

  constructor(provider: string, message: string, statusCode?: number, retryable: boolean = false) {
    super(`${provider} API error: ${message}`)
    this.name = 'ExternalAPIError'
    this.provider = provider
    this.statusCode = statusCode
    this.retryable = retryable

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExternalAPIError)
    }
  }
}
