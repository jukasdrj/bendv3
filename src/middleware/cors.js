/**
 * CORS Middleware (Simplified - Issue #213, Task 1.7)
 *
 * Allows all origins with wildcard Access-Control-Allow-Origin: *
 *
 * Rationale:
 * - Primary client is native iOS app (doesn't send Origin header)
 * - Rate limiting (10 req/min) is primary DoS defense
 * - Public read API, no sensitive data
 * - Simplifies deployment and testing
 *
 * @example
 * ```javascript
 * const corsHeaders = getCorsHeaders();
 * return new Response(json, { headers: { ...corsHeaders } });
 * ```
 */

/**
 * Get CORS headers (simplified - allows all origins)
 *
 * @param {Request} [request] - Incoming request (optional, ignored after simplification)
 * @returns {object} - CORS headers object
 */
export function getCorsHeaders(_request) {
  // Simplified: Always return wildcard origin (Issue #213, Task 1.7)
  // No origin validation, no credentials header
  return {
    'Access-Control-Allow-Origin': '*', // Allow all origins
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-AI-Provider, Sec-WebSocket-Protocol, Sec-WebSocket-Version, Upgrade, Connection',
    'Access-Control-Max-Age': '86400', // 24 hours preflight cache
  }
}

/**
 * Check if request origin is allowed.
 *
 * @deprecated After Task 1.7 simplification, all origins are allowed
 * @param {Request} request - Incoming request
 * @returns {boolean} - Always returns true
 */
export function isOriginAllowed(_request) {
  return true // Simplified: all origins allowed
}

/**
 * Get list of allowed origins (for documentation/debugging).
 *
 * @deprecated After Task 1.7 simplification, all origins are allowed
 * @returns {string[]} - Returns wildcard array
 */
export function getAllowedOrigins() {
  return ['*'] // Simplified: all origins allowed
}
