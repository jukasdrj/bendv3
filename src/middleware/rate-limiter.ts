/**
 * Rate Limiting Middleware
 *
 * Protects expensive endpoints from abuse using Durable Object-based fixed-window algorithm.
 *
 * Security: Prevents denial-of-wallet attacks on AI/enrichment endpoints.
 * Implementation: Uses atomic Durable Object per IP to prevent race conditions.
 * Cost: ~$0 (DO requests included in Workers plan, ~100 DO calls/min peak)
 *
 * Algorithm: Fixed Window Counter
 * - Each IP gets 10 requests per 60-second window
 * - Each request consumes 1 token
 * - Window resets 60 seconds after first request
 *
 * Error Responses: RFC 9457 Problem Details (application/problem+json)
 *
 * @example
 * ```typescript
 * const rateLimitResponse = await checkRateLimit(request, env);
 * if (rateLimitResponse) return rateLimitResponse; // 429 Too Many Requests
 * ```
 */

import { createProblemDetails } from '@bookstrack/schemas/errors'
import type { Env } from '../types/env.js'

/**
 * Rate limit configuration per endpoint type
 * AI-heavy endpoints require stricter limits due to cost and processing time
 */
const RATE_LIMITS = {
  default: 100, // Generic search endpoints (v1/search/*)
  batchEnrichment: 10, // /v1/enrichment/batch
  aiScan: 5, // /api/batch-scan (AI photo scanning)
  csvImport: 5, // /api/import/csv-gemini (AI parsing)
  bookshelfScan: 5, // /api/scan-bookshelf/batch (AI scanning)
} as const

/**
 * Rate limit check response from Durable Object
 */
interface RateLimitCheckResponse {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Determine the rate limit for a specific endpoint path.
 *
 * @param pathname - URL pathname from the request
 * @returns Max requests per minute for this endpoint
 */
export function getRateLimitForEndpoint(pathname: string): number {
  if (pathname === '/api/batch-scan') return RATE_LIMITS.aiScan
  if (pathname === '/api/import/csv-gemini') return RATE_LIMITS.csvImport
  if (pathname === '/api/scan-bookshelf/batch') return RATE_LIMITS.bookshelfScan
  return RATE_LIMITS.default
}

/**
 * Check if request exceeds rate limit for the client's IP.
 *
 * FIXED: Now uses atomic Durable Object to prevent race condition.
 * Previously used KV which allowed concurrent requests to bypass limit via TOCTOU.
 *
 * UPDATE (Issue #222): Now supports per-endpoint rate limits.
 * AI endpoints limited to 5 req/min as documented in API_CONTRACT.md.
 *
 * @param request - Incoming request
 * @param env - Worker environment bindings
 * @param maxRequests - Optional custom rate limit (overrides endpoint-specific limit)
 * @returns 429 response if rate limited, null otherwise
 */
export async function checkRateLimit(
  request: Request,
  env: Env,
  maxRequests: number | null = null,
): Promise<Response | null> {
  // Extract client IP (Cloudflare provides this in CF-Connecting-IP header)
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'

  // Determine rate limit for this endpoint
  const pathname = new URL(request.url).pathname
  const limitForEndpoint = maxRequests !== null ? maxRequests : getRateLimitForEndpoint(pathname)

  try {
    // Get Durable Object stub for this IP's rate limit counter
    // One DO per IP ensures all requests from same IP are serialized
    const rateLimiterId = env.RATE_LIMITER_DO.idFromName(clientIP)
    const rateLimiterStub = env.RATE_LIMITER_DO.get(rateLimiterId)

    // Check rate limit (atomic operation - no race condition)
    // Pass the endpoint-specific limit to the Durable Object
    const response = await rateLimiterStub.fetch(
      new Request('http://localhost/check', {
        method: 'POST',
        headers: {
          'X-Rate-Limit-Max': limitForEndpoint.toString(),
        },
      }),
    )

    const result = (await response.json()) as RateLimitCheckResponse
    const { allowed, remaining, resetAt } = result

    if (!allowed) {
      // Rate limit exceeded - return RFC 9457 Problem Details
      const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000)
      const retryAfter = Math.max(1, retryAfterSeconds) // Ensure positive value
      console.warn(
        `[Rate Limit] Blocked request from IP: ${clientIP.substring(0, 8)}... (limit exceeded, endpoint: ${pathname}, limit: ${limitForEndpoint})`,
      )

      // Use RFC 9457 Problem Details format for consistency with V3 API
      const problemDetails = createProblemDetails(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        {
          instance: request.url, // Full URL per RFC 9457 (includes query params)
          requestId: request.headers.get('X-Request-ID') || undefined, // Optional (rate limiter runs before request-context middleware)
          retryAfterMs: retryAfter * 1000, // Milliseconds (complements HTTP Retry-After header which is in seconds)
        },
      )

      return new Response(JSON.stringify(problemDetails), {
        status: 429,
        headers: {
          'Content-Type': 'application/problem+json', // RFC 9457 media type
          'Retry-After': retryAfter.toString(), // RFC 6585 standard header (seconds)
          'X-RateLimit-Limit': limitForEndpoint.toString(), // Industry standard
          'X-RateLimit-Remaining': remaining.toString(), // Industry standard
          'X-RateLimit-Reset': resetAt.toString(), // Industry standard (Unix timestamp)
        },
      })
    }

    // Request allowed - return null
    return null
  } catch (error) {
    // If rate limiter fails, log error but allow request (fail open)
    console.error('[Rate Limit] Error checking rate limit:', error)
    console.warn('[Rate Limit] Failing open - allowing request despite error')
    return null
  }
}
