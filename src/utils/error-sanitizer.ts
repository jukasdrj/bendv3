/**
 * Error Message Sanitization Utility
 *
 * Security: Prevents information disclosure via raw error.message in production responses.
 *
 * Context:
 * - Issue #256: RFC 9457 compliance audit identified 16 catch blocks exposing raw error.message
 * - Raw error messages leak: API keys, secrets, file paths, stack traces, internal implementation
 *
 * Strategy:
 * - Development: Show full error details for debugging (workers.dev, localhost)
 * - Production: Generic message + pattern-based sanitization
 * - NO production logging of sensitive data (GDPR/privacy)
 *
 * @example
 * ```typescript
 * catch (error: any) {
 *   const sanitized = sanitizeErrorMessage(error, c.req.url)
 *   return c.json(createProblemDetails('INTERNAL_ERROR', sanitized, { ... }), 500)
 * }
 * ```
 */

/**
 * Patterns indicating sensitive data in error messages.
 * If ANY pattern matches, return the corresponding safe message.
 *
 * CRITICAL: Order matters - more specific patterns first.
 */
const SENSITIVE_PATTERNS: Record<string, string> = {
  // Authentication & Secrets (highest priority)
  'api key': 'Authentication configuration error',
  api_key: 'Authentication configuration error',
  secret: 'Configuration error',
  token: 'Authentication error',
  password: 'Authentication error',
  credentials: 'Authentication error',
  'not configured': 'Service configuration error',

  // Network Errors
  econnrefused: 'Service temporarily unavailable',
  'fetch failed': 'External service error',
  etimedout: 'Request timeout',
  'socket hang up': 'Network error',
  enotfound: 'Service unavailable',

  // File Paths (indicates stack traces)
  '/src/': 'Internal error',
  '/node_modules/': 'Internal error',
  '\\src\\': 'Internal error',
  '\\node_modules\\': 'Internal error',
  '.ts:': 'Internal error', // TypeScript file references
  '.js:': 'Internal error', // JavaScript file references

  // Stack Trace Indicators
  'at ': 'Internal error', // Stack trace line format
  'error: ': 'Internal error', // Nested error format
}

/**
 * Detect development environment using Cloudflare Workers hostname pattern.
 *
 * Rationale:
 * - env.ENVIRONMENT does NOT exist in codebase (verified by agent analysis)
 * - Cloudflare workers.dev domains indicate non-production deployments
 * - localhost/127.0.0.1 indicate local development
 *
 * @param requestUrl - Full request URL from c.req.url
 * @returns true if development environment, false if production
 */
function isDevelopmentEnvironment(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl)
    return (
      url.hostname.endsWith('.workers.dev') ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    )
  } catch {
    // Invalid URL - assume production (fail secure)
    return false
  }
}

/**
 * Sanitize error message for safe client exposure.
 *
 * Security Principles (RFC 9457 Audit Remediation):
 * 1. NEVER expose API keys, secrets, tokens in production
 * 2. NEVER expose file paths or stack traces in production
 * 3. NEVER expose internal implementation details in production
 * 4. DO log full errors server-side in development only
 * 5. DO use pattern matching to detect sensitive content
 *
 * Privacy (GDPR):
 * - NO production logging of error.message (may contain PII from CSV uploads)
 * - Minimal logging (error type only, no message/stack)
 *
 * @param error - Error object (may be any type: Error, string, object, null)
 * @param requestUrl - Request URL for environment detection
 * @returns Sanitized error message safe for RFC 9457 detail field
 */
export function sanitizeErrorMessage(error: unknown, requestUrl: string): string {
  const isDev = isDevelopmentEnvironment(requestUrl)

  // Extract error message (handle all types)
  let errorMsg: string
  if (error instanceof Error) {
    errorMsg = error.message || 'Unknown error'
  } else if (typeof error === 'string') {
    errorMsg = error || 'Unknown error' // Handle empty strings
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMsg = String((error as { message: unknown }).message) || 'Unknown error'
  } else {
    errorMsg = 'Unknown error'
  }

  // Development: Return full error details for debugging
  if (isDev) {
    // Log full error context in development
    console.error('[Error Sanitizer] Development error:', {
      message: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })
    return errorMsg
  }

  // Production: Minimal logging (NO sensitive data per GDPR/privacy)
  // Only log error type - NO message, NO stack, NO sensitive fields
  console.error('[Error Sanitizer]', {
    errorType: error instanceof Error ? error.name : typeof error,
    // NO message field - may contain API keys, secrets, PII
    // NO stack field - exposes file paths, internal implementation
  })

  // Production: Sanitize message using pattern matching
  const lowerMsg = errorMsg.toLowerCase()

  // Check each sensitive pattern
  for (const [pattern, safeMessage] of Object.entries(SENSITIVE_PATTERNS)) {
    if (lowerMsg.includes(pattern.toLowerCase())) {
      return safeMessage
    }
  }

  // Default: Generic internal error (no details)
  return 'An internal error occurred'
}
