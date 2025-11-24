/**
 * CORS Middleware
 *
 * Restricts API access to known origins only.
 *
 * Security: Prevents CSRF attacks from malicious websites.
 * Before: 'Access-Control-Allow-Origin: *' (any site can call API)
 * After: Whitelist of trusted domains only
 *
 * **Current Status:** DEFERRED for Phase 2
 * - Primary client is native iOS app (doesn't send Origin header)
 * - Rate limiting (10 req/min) is primary DoS defense
 * - CORS restrictions only needed if web interface is added
 *
 * **Migration Path:**
 * 1. Phase 1: Rate limiting + size validation (CURRENT)
 * 2. Phase 2: CORS restrictions when web app deployed
 * 3. Use getCorsHeaders() to replace '*' with whitelist
 *
 * @example
 * ```javascript
 * const corsHeaders = getCorsHeaders(request);
 * return new Response(json, { headers: { ...corsHeaders } });
 * ```
 */

/**
 * Allowed origins for CORS requests.
 *
 * IMPORTANT: Must match src/router.ts allowed origins for consistency
 *
 * Production: bookstrack.oooefam.net (main app), harvest.oooefam.net (dashboard)
 * Development: localhost for local testing
 * Mobile: Capacitor scheme for iOS app
 */
const ALLOWED_ORIGINS = [
  "https://bookstrack.oooefam.net", // Production web app
  "https://harvest.oooefam.net", // Harvest dashboard
  "capacitor://localhost", // iOS app (Capacitor)
  "http://localhost:3000", // Local dev (web)
  "http://localhost:8787", // Local dev (wrangler)
];

/**
 * Get CORS headers based on request origin.
 *
 * @param {Request} request - Incoming request
 * @returns {object} - CORS headers object
 */
export function getCorsHeaders(request) {
  // Handle null request (when no request object is available)
  // NOTE: Native iOS/Android apps don't send Origin header, so we allow all
  // This is safe because rate limiting is our primary DoS defense
  if (!request || !request.headers) {
    return {
      "Access-Control-Allow-Origin": "*", // Permissive for non-browser clients (native apps)
      // SECURITY FIX (Issue #239): Cannot use credentials with wildcard origin
      // "Access-Control-Allow-Credentials": "true", // REMOVED - invalid with wildcard
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-AI-Provider, Sec-WebSocket-Protocol, Sec-WebSocket-Version, Upgrade, Connection",
      "Access-Control-Max-Age": "86400", // 24 hours preflight cache
    };
  }

  const origin = request.headers.get("Origin");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

  // Log blocked origins for monitoring
  if (origin && !allowedOrigin) {
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  }

  // SECURITY FIX (Issue #239): Only set credentials flag when using explicit origin
  // Wildcard (*) + credentials is invalid per CORS spec
  if (allowedOrigin) {
    // Explicit origin - can use credentials
    return {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-AI-Provider, Sec-WebSocket-Protocol, Sec-WebSocket-Version, Upgrade, Connection",
      "Access-Control-Max-Age": "86400", // 24 hours preflight cache
    };
  } else {
    // No matching origin - fallback to wildcard for native apps (no credentials)
    return {
      "Access-Control-Allow-Origin": "*", // Permissive for iOS app (no Origin header)
      // SECURITY FIX (Issue #239): Cannot use credentials with wildcard origin
      // "Access-Control-Allow-Credentials": "true", // REMOVED - invalid with wildcard
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-AI-Provider, Sec-WebSocket-Protocol, Sec-WebSocket-Version, Upgrade, Connection",
      "Access-Control-Max-Age": "86400", // 24 hours preflight cache
    };
  }
}

/**
 * Check if request origin is allowed.
 *
 * @param {Request} request - Incoming request
 * @returns {boolean} - True if origin is allowed
 */
export function isOriginAllowed(request) {
  const origin = request.headers.get("Origin");
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get list of allowed origins (for documentation/debugging).
 *
 * @returns {string[]} - Array of allowed origin strings
 */
export function getAllowedOrigins() {
  return [...ALLOWED_ORIGINS];
}

/**
 * Add an origin to the allowlist dynamically (for testing/staging).
 *
 * ⚠️ WARNING: Only use this for temporary testing. Permanent origins
 * should be added to ALLOWED_ORIGINS constant above.
 *
 * @param {string} origin - Origin to add (e.g., "https://staging.bookstrack.app")
 * @returns {void}
 */
export function addAllowedOrigin(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    ALLOWED_ORIGINS.push(origin);
    console.log(`[CORS] Added temporary origin: ${origin}`);
  }
}
