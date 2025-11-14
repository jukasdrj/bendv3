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
 * @example
 * ```javascript
 * const rateLimitResponse = await checkRateLimit(request, env);
 * if (rateLimitResponse) return rateLimitResponse; // 429 Too Many Requests
 * ```
 */

const RATE_LIMIT_WINDOW = 60; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per window

/**
 * Check if request exceeds rate limit for the client's IP.
 *
 * FIXED: Now uses atomic Durable Object to prevent race condition.
 * Previously used KV which allowed concurrent requests to bypass limit via TOCTOU.
 *
 * @param {Request} request - Incoming request
 * @param {object} env - Worker environment bindings
 * @returns {Response|null} - 429 response if rate limited, null otherwise
 */
export async function checkRateLimit(request, env) {
  // Extract client IP (Cloudflare provides this in CF-Connecting-IP header)
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

  try {
    // Get Durable Object stub for this IP's rate limit counter
    // One DO per IP ensures all requests from same IP are serialized
    const rateLimiterId = env.RATE_LIMITER_DO.idFromName(clientIP);
    const rateLimiterStub = env.RATE_LIMITER_DO.get(rateLimiterId);

    // Check rate limit (atomic operation - no race condition)
    const response = await rateLimiterStub.fetch(
      new Request("http://localhost/check", {
        method: "POST",
      }),
    );

    const { allowed, remaining, resetAt } = await response.json();

    if (!allowed) {
      // Rate limit exceeded
      const retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
      const retryAfter = Math.max(1, retryAfterSeconds); // Ensure positive value
      console.warn(
        `[Rate Limit] Blocked request from IP: ${clientIP} (limit exceeded)`,
      );

      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            retryAfter,
            clientIP: clientIP.substring(0, 8) + "...", // Partial IP for privacy
            requestsRemaining: remaining,
            requestsLimit: RATE_LIMIT_MAX_REQUESTS,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": resetAt.toString(),
          },
        },
      );
    }

    // Request allowed - return null
    return null;
  } catch (error) {
    // If rate limiter fails, log error but allow request (fail open)
    console.error("[Rate Limit] Error checking rate limit:", error);
    console.warn("[Rate Limit] Failing open - allowing request despite error");
    return null;
  }
}

