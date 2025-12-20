/**
 * Retry utility with exponential backoff and jitter
 * Used for transient API failures (rate limits, server errors)
 *
 * Issue #179, #183: Gemini API retry logic
 */

/**
 * Retry an async function with exponential backoff and jitter.
 *
 * Retries only on transient errors (429, 500, 502, 503, 504).
 * Client errors (400, 401, 403, 404) fail immediately.
 *
 * @param {Function} asyncFn - Async function to retry (must return a Promise).
 * @param {number} [maxRetries=3] - Maximum number of retry attempts.
 * @param {number} [initialDelay=1000] - Initial delay in ms (1s, 2s, 4s exponential).
 * @returns {Promise<any>} Result of the successful call or throws the last error.
 */
export async function retryWithBackoff(asyncFn, maxRetries = 3, initialDelay = 1000) {
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn()
    } catch (error) {
      lastError = error

      // Extract HTTP status from error message
      let status = null
      if (error.message?.includes('Gemini API error:')) {
        const match = error.message.match(/Gemini API error: (\d+)/)
        status = match ? parseInt(match[1], 10) : null
      }

      // Retry only on transient errors (rate limit, server errors)
      const retryableStatuses = [429, 500, 502, 503, 504]
      const shouldRetry = status && retryableStatuses.includes(status)

      if (!shouldRetry) {
        // Non-retryable error (client error, auth issue, etc.) - fail immediately
        throw error
      }

      if (attempt === maxRetries) {
        // Max retries exhausted - throw last error
        console.error(`[Retry] Max retries (${maxRetries}) reached for status ${status}`)
        throw error
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s) + random jitter (0-500ms)
      // Jitter prevents thundering herd when multiple requests fail simultaneously
      const backoffDelay = initialDelay * 2 ** attempt
      const jitter = Math.random() * 500
      const totalDelay = backoffDelay + jitter

      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed (HTTP ${status}). ` +
          `Retrying in ${Math.round(totalDelay)}ms...`,
      )

      // Use Promise-based setTimeout (Cloudflare Workers compatible)
      await new Promise((resolve) => setTimeout(resolve, totalDelay))
    }
  }

  // Fallback (should never reach here due to throw in loop)
  throw lastError
}
