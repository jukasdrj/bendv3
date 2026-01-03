import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types/env'

/**
 * Rate Limiter Durable Object
 *
 * Provides atomic rate limiting with guaranteed serialization.
 * Fixes race condition in KV-based rate limiter by using DO's single-threaded execution.
 *
 * One instance per client IP address - ensures all requests from same IP are serialized.
 * No race condition window: read-modify-write happens atomically in DO transaction.
 *
 * Algorithm: Token Bucket
 * - Each IP gets N tokens per 60-second window (N varies by endpoint)
 * - Each request consumes 1 token
 * - Window resets after 60 seconds of inactivity
 *
 * UPDATE (Issue #222): Now supports per-endpoint rate limits.
 * - AI endpoints: 5 requests/minute
 * - Batch enrichment: 10 requests/minute
 * - Search endpoints: 100 requests/minute
 *
 * Performance:
 * - Atomic check & increment: ~5-10ms (acceptable for rate limiter)
 * - No thundering herd problem (single DO per IP handles serialization)
 * - Scales horizontally (each IP has own DO)
 *
 * @example
 * ```typescript
 * const id = env.RATE_LIMITER_DO.idFromName(clientIP)
 * const stub = env.RATE_LIMITER_DO.get(id)
 * const { allowed, remaining, resetAt } = await stub.checkAndIncrement(maxRequests)
 * ```
 */

const RATE_LIMIT_WINDOW = 60 // 60 seconds
const DEFAULT_RATE_LIMIT = 10 // Default: 10 requests per window

/**
 * Rate limit counter state stored in Durable Object storage
 */
interface RateLimitCounters {
  count: number
  resetAt: number
}

/**
 * Rate limit check result
 */
interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export class RateLimiterDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
  }

  /**
   * Check if request is allowed and atomically increment counter.
   *
   * This is the core atomic operation that fixes the race condition.
   * No concurrent requests can both pass the check - serialization guaranteed by DO.
   *
   * UPDATE (Issue #222): Now accepts custom maxRequests per endpoint.
   *
   * @param maxRequests - Maximum requests allowed in the window (endpoint-specific)
   * @returns Promise resolving to rate limit result
   */
  async checkAndIncrement(maxRequests = DEFAULT_RATE_LIMIT): Promise<RateLimitResult> {
    const now = Date.now()

    // Get current counter state
    const counters =
      (await this.ctx.storage.get<RateLimitCounters>('counters')) ||
      ({
        count: 0,
        resetAt: now + RATE_LIMIT_WINDOW * 1000,
      } satisfies RateLimitCounters)

    // Check if window expired
    if (now >= counters.resetAt) {
      // Reset to new window
      counters.count = 0
      counters.resetAt = now + RATE_LIMIT_WINDOW * 1000
    }

    // Check if limit exceeded (BEFORE incrementing)
    const allowed = counters.count < maxRequests

    if (allowed) {
      // Increment counter (atomic with storage transaction)
      counters.count++
      await this.ctx.storage.put('counters', counters)
    }

    const remaining = Math.max(0, maxRequests - counters.count)

    return {
      allowed,
      remaining,
      resetAt: counters.resetAt,
    }
  }

  /**
   * Handle fetch requests from rate limiter middleware.
   * Expect POST to trigger checkAndIncrement and return result.
   *
   * UPDATE (Issue #222): Extracts X-Rate-Limit-Max header for endpoint-specific limits.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      // Extract custom rate limit from header (if provided)
      const maxRequestsHeader = request.headers.get('X-Rate-Limit-Max')
      const maxRequests = maxRequestsHeader
        ? Number.parseInt(maxRequestsHeader, 10)
        : DEFAULT_RATE_LIMIT

      const result = await this.checkAndIncrement(maxRequests)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Method not allowed', { status: 405 })
  }
}
