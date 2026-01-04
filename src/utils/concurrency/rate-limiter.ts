/**
 * Token Bucket Rate Limiter
 *
 * Implements token bucket algorithm for API rate limiting with jitter.
 * Designed for ISBNdb API (10 req/sec) but reusable for other APIs.
 *
 * Features:
 * - Token bucket refill over time
 * - Automatic waiting when tokens exhausted
 * - Jitter for traffic smoothing (±100ms)
 * - No external dependencies
 */

/**
 * Token bucket rate limiter with automatic refill
 */
export class RateLimiter {
  private tokensPerSecond: number
  private tokens: number
  private lastRefill: number

  /**
   * Create a new rate limiter
   *
   * @param tokensPerSecond - Maximum requests per second (default: 10)
   */
  constructor(tokensPerSecond = 10) {
    this.tokensPerSecond = tokensPerSecond
    this.tokens = tokensPerSecond
    this.lastRefill = Date.now()
  }

  /**
   * Acquire a token (wait if necessary)
   *
   * @returns Wait time in milliseconds
   */
  async acquire(): Promise<number> {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000

    // Refill tokens based on time passed
    this.tokens = Math.min(this.tokensPerSecond, this.tokens + timePassed * this.tokensPerSecond)
    this.lastRefill = now

    // Wait if we don't have enough tokens
    let waitTime = 0
    if (this.tokens < 1) {
      waitTime = ((1 - this.tokens) / this.tokensPerSecond) * 1000
      await this.sleep(waitTime)
      this.tokens = 0
    } else {
      this.tokens -= 1
    }

    // Add jitter (±100ms) to smooth traffic
    const jitter = Math.random() * 200 - 100
    if (jitter > 0) {
      await this.sleep(jitter)
      waitTime += jitter
    }

    return Math.round(waitTime)
  }

  /**
   * Sleep helper
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Reset limiter state (useful for testing)
   */
  reset(): void {
    this.tokens = this.tokensPerSecond
    this.lastRefill = Date.now()
  }

  /**
   * Get current token count (for debugging)
   *
   * @returns Current available tokens
   */
  getTokenCount(): number {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    return Math.min(this.tokensPerSecond, this.tokens + timePassed * this.tokensPerSecond)
  }
}
