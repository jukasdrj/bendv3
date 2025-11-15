/**
 * Analytics Tracking Middleware
 *
 * Tracks request metrics and adds custom headers to API responses.
 * Integrates with Cloudflare Analytics Engine for aggregated metrics.
 *
 * Features:
 * - Response time tracking (X-Response-Time header)
 * - Cache status reporting (X-Cache-Status header)
 * - Error code tracking (X-Error-Code header)
 * - Analytics Engine data points for dashboards
 * - GDPR-compliant IP anonymization
 * - DNT (Do Not Track) header support
 * - Sampling for high-volume endpoints
 *
 * Related: Issue #108 - Analytics tracking implementation
 * Related: Issue #110 - Production readiness improvements
 */

/**
 * Sampling rates for high-volume endpoints
 * 1.0 = track all requests, 0.1 = track 10% of requests
 */
const SAMPLING_RATES = {
  "/v1/search/isbn": 0.1, // High volume - sample 10%
  "/v1/search/title": 0.1, // High volume - sample 10%
  "/search/title": 0.1, // Legacy high volume - sample 10%
  "/search/isbn": 0.1, // Legacy high volume - sample 10%
  "/api/enrichment/start": 0.5, // Medium volume - sample 50%
  // Default: 1.0 (track all) for other endpoints
};

/**
 * Anonymize IP address for GDPR compliance
 * Removes last octet for IPv4, last 80 bits for IPv6
 *
 * @param {string|null} ip - IP address to anonymize
 * @returns {string} Anonymized IP address
 *
 * @example
 * anonymizeIP('192.168.1.100') // Returns '192.168.1.0'
 * anonymizeIP('2001:0db8:85a3::8a2e:0370:7334') // Returns '2001:db8:85a3:0:0:0:0:0'
 * anonymizeIP('::1') // Returns '0:0:0:0:0:0:0:0'
 * anonymizeIP('fe80::1') // Returns 'fe80:0:0:0:0:0:0:0'
 */
function anonymizeIP(ip) {
  if (!ip) return "unknown";

  // IPv4: Zero out last octet (192.168.1.100 → 192.168.1.0)
  if (ip.includes(".")) {
    return ip.split(".").slice(0, 3).join(".") + ".0";
  }

  // IPv6: Zero out last 80 bits (keep first 48 bits)
  if (ip.includes(":")) {
    // Handle IPv6 compressed notation (::)
    // Expand :: to full notation before anonymizing
    let segments = [];
    const parts = ip.split(":");

    // Handle leading/trailing :: edge cases
    const hasLeadingDoubleColon = ip.startsWith("::");
    const hasTrailingDoubleColon = ip.endsWith("::");

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        // Empty string indicates :: compression
        // Calculate how many zero segments to insert
        const nonEmptyParts = parts.filter((p) => p !== "").length;
        const zerosNeeded = 8 - nonEmptyParts;

        // Add zero segments
        for (let j = 0; j < zerosNeeded; j++) {
          segments.push("0");
        }

        // Skip consecutive empty parts (from ::)
        while (i + 1 < parts.length && parts[i + 1] === "") {
          i++;
        }
      } else {
        // Normalize segment: remove leading zeros (0db8 → db8, 0000 → 0)
        const normalized = parseInt(parts[i], 16).toString(16);
        segments.push(normalized);
      }
    }

    // Handle edge case: pure :: results in no segments
    if (segments.length === 0) {
      segments = ["0", "0", "0", "0", "0", "0", "0", "0"];
    }

    // Ensure we have exactly 8 segments (pad if needed)
    while (segments.length < 8) {
      if (hasTrailingDoubleColon) {
        segments.push("0");
      } else if (hasLeadingDoubleColon) {
        segments.unshift("0");
      } else {
        segments.push("0");
      }
    }

    // Keep first 3 segments (48 bits), zero out the rest
    return segments.slice(0, 3).join(":") + ":0:0:0:0:0";
  }

  return "unknown";
}

/**
 * Get cache status from response
 * @param {Response} response - HTTP response object
 * @returns {string} Cache status (HIT, MISS, BYPASS, NONE)
 */
function getCacheStatus(response) {
  // Check for existing cache header
  const existingCacheHeader = response.headers.get("X-Cache");
  if (existingCacheHeader) {
    return existingCacheHeader;
  }

  // Check if response came from cache (Cloudflare cache)
  const cfCacheStatus = response.headers.get("CF-Cache-Status");
  if (cfCacheStatus) {
    return cfCacheStatus;
  }

  // Check if response has cache control headers
  const cacheControl = response.headers.get("Cache-Control");
  if (
    !cacheControl ||
    cacheControl.includes("no-cache") ||
    cacheControl.includes("no-store")
  ) {
    return "BYPASS";
  }

  // Default to NONE if no cache information available
  return "NONE";
}

/**
 * Extract error code from response
 * @param {Response} response - HTTP response object
 * @returns {string|null} Error code or null if no error
 */
function getErrorCode(response) {
  if (response.ok) {
    return null;
  }

  // Try to extract error code from response body (cached during response creation)
  const errorCodeHeader = response.headers.get("X-Error-Type");
  if (errorCodeHeader) {
    return errorCodeHeader;
  }

  // Fallback to HTTP status code mapping
  const statusCode = response.status;
  const errorMap = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    429: "RATE_LIMIT_EXCEEDED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
  };

  return errorMap[statusCode] || `HTTP_${statusCode}`;
}

/**
 * Track analytics for API request
 *
 * @param {Request} request - Original request object
 * @param {Response} response - Response object (will be cloned if possible)
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 * @param {number} startTime - Request start timestamp (Date.now())
 * @returns {Promise<Response>} Response with analytics headers added
 */
export async function trackAnalytics(request, response, env, ctx, startTime) {
  // Skip analytics for health checks and test endpoints
  const url = new URL(request.url);
  const skipPaths = ["/health", "/test/"];
  if (skipPaths.some((path) => url.pathname.startsWith(path))) {
    return response;
  }

  // Respect analytics flag (can be disabled via env var)
  const analyticsEnabled = env.ENABLE_PERFORMANCE_LOGGING !== "false";
  if (!analyticsEnabled) {
    return response;
  }

  // Respect Do Not Track header (GDPR compliance)
  if (request.headers.get("DNT") === "1") {
    console.log("[Analytics] Skipping analytics - DNT header present");
    return response;
  }

  // Respect custom opt-out header (for internal tools)
  if (request.headers.get("X-Skip-Analytics") === "true") {
    return response;
  }

  const processingTime = Date.now() - startTime;
  const cacheStatus = getCacheStatus(response);
  const errorCode = getErrorCode(response);

  // Sampling: Probabilistic sampling for high-volume endpoints
  const samplingRate = SAMPLING_RATES[url.pathname] || 1.0;
  const shouldWriteAnalytics = Math.random() <= samplingRate;

  // Safety check: Verify response body hasn't been consumed
  let newResponse;
  if (response.bodyUsed) {
    console.warn(
      "[Analytics] Cannot clone response - body already consumed, adding headers to original",
    );
    // Try to add headers to original response (may fail if immutable)
    try {
      response.headers.set("X-Response-Time", `${processingTime}ms`);
      response.headers.set("X-Cache-Status", cacheStatus);
      if (errorCode) {
        response.headers.set("X-Error-Code", errorCode);
      }
      newResponse = response;
    } catch (err) {
      console.warn(
        "[Analytics] Response headers immutable, skipping header addition",
      );
      newResponse = response;
    }
  } else {
    // Clone response to add headers (responses are immutable)
    newResponse = new Response(response.body, response);

    // Add custom headers
    newResponse.headers.set("X-Response-Time", `${processingTime}ms`);
    newResponse.headers.set("X-Cache-Status", cacheStatus);

    if (errorCode) {
      newResponse.headers.set("X-Error-Code", errorCode);
    }
  }

  // Write analytics data point (non-blocking via ctx.waitUntil)
  // Only write if sampling allows (cost optimization)
  if (shouldWriteAnalytics && env.PERFORMANCE_ANALYTICS && ctx) {
    const clientIP = request.headers.get("CF-Connecting-IP");
    const anonymizedIP = anonymizeIP(clientIP);

    ctx.waitUntil(
      env.PERFORMANCE_ANALYTICS.writeDataPoint({
        // Blobs: String dimensions for filtering
        blobs: [
          url.pathname, // Endpoint path
          response.status.toString(), // HTTP status code
          errorCode || "SUCCESS", // Error code or success
          anonymizedIP, // Anonymized client IP (GDPR compliant)
          request.cf?.colo || "unknown", // Cloudflare datacenter
        ],
        // Doubles: Numeric metrics for aggregation
        doubles: [processingTime],
        // Indexes: Indexed dimensions for fast queries
        indexes: [url.pathname],
      }).catch((err) => {
        // Log but don't fail request if analytics write fails
        console.error("[Analytics] Failed to write data point:", err);
      }),
    );
  } else if (!shouldWriteAnalytics) {
    // Track sampling skip metrics (production-safe)
    // Use Analytics Engine to track sampling behavior without verbose logging
    if (env.SAMPLING_ANALYTICS && ctx) {
      ctx.waitUntil(
        env.SAMPLING_ANALYTICS.writeDataPoint({
          blobs: [url.pathname, "SAMPLED_OUT"],
          doubles: [samplingRate],
          indexes: [url.pathname],
        }).catch((err) => {
          // Silently fail - sampling metrics are informational only
          if (env.LOG_LEVEL === "DEBUG") {
            console.error("[Analytics] Failed to write sampling metric:", err);
          }
        }),
      );
    }

    // Log sampling skip (debug mode only, for development)
    if (env.LOG_LEVEL === "DEBUG") {
      console.log(
        `[Analytics] Skipped write for ${url.pathname} (sampling rate: ${samplingRate})`,
      );
    }
  }

  return newResponse;
}

/**
 * Middleware wrapper for handlers
 *
 * Usage:
 * ```javascript
 * import { withAnalytics } from './middleware/analytics-tracker.js'
 *
 * export default {
 *   async fetch(request, env, ctx) {
 *     const startTime = Date.now()
 *     const response = await handleRequest(request, env, ctx)
 *     return withAnalytics(request, response, env, ctx, startTime)
 *   }
 * }
 * ```
 *
 * @param {Request} request - Original request
 * @param {Response} response - Response to track
 * @param {Object} env - Environment bindings
 * @param {ExecutionContext} ctx - Execution context
 * @param {number} startTime - Request start time
 * @returns {Promise<Response>} Response with analytics
 */
export async function withAnalytics(request, response, env, ctx, startTime) {
  return trackAnalytics(request, response, env, ctx, startTime);
}
