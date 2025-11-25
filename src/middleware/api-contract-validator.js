/**
 * API Contract Validation Middleware for Hono
 *
 * Validates ResponseEnvelope format compliance and tracks validation failures.
 *
 * Expected ResponseEnvelope format (v2.0):
 * ```json
 * {
 *   "success": true,
 *   "data": { ... },
 *   "metadata": {
 *     "source": "google_books",
 *     "cached": true,
 *     "timestamp": "2025-01-10T12:00:00Z"
 *   }
 * }
 * ```
 *
 * Or for errors:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "Book not found",
 *     "statusCode": 404
 *   }
 * }
 * ```
 *
 * Usage:
 * ```javascript
 * import { validateApiContract } from './middleware/api-contract-validator.js'
 *
 * // Apply to all v1 routes
 * router.use('/v1/*', validateApiContract())
 *
 * // Or specific routes
 * router.get('/v1/search/isbn', validateApiContract(), handler)
 * ```
 *
 * @module api-contract-validator
 */

/**
 * Record API contract validation metrics
 * @param {Object} env - Worker environment
 * @param {Object} data - Validation data
 */
async function recordApiContractMetrics(env, data) {
  try {
    if (!env.CACHE_METRICS_DO) {
      return
    }

    const id = env.CACHE_METRICS_DO.idFromName('global')
    const stub = env.CACHE_METRICS_DO.get(id)
    await stub.recordApiContractMetrics(data)
  } catch (error) {
    console.error('[API Contract Validator] Failed to record metrics:', error.message)
  }
}

/**
 * Validate ResponseEnvelope structure
 * @param {Object} body - Response body to validate
 * @returns {Object} Validation result { valid, failures }
 */
function validateResponseEnvelope(body) {
  const failures = []

  // Must be an object
  if (!body || typeof body !== 'object') {
    failures.push('response_not_object')
    return { valid: false, failures }
  }

  // Must have 'success' field (boolean)
  if (typeof body.success !== 'boolean') {
    failures.push('missing_success_field')
  }

  // Success response validation
  if (body.success === true) {
    // Must have 'data' field
    if (!('data' in body)) {
      failures.push('missing_data_field')
    }

    // Should have 'metadata' field (warning, not critical)
    if (!body.metadata) {
      failures.push('missing_metadata_field')
    } else if (typeof body.metadata !== 'object') {
      failures.push('invalid_metadata_type')
    }
  }

  // Error response validation
  if (body.success === false) {
    // Must have 'error' field
    if (!body.error) {
      failures.push('missing_error_field')
    } else {
      // Error must have code and message
      if (!body.error.code) {
        failures.push('missing_error_code')
      }
      if (!body.error.message) {
        failures.push('missing_error_message')
      }
    }
  }

  return {
    valid: failures.length === 0,
    failures
  }
}

/**
 * Hono middleware to validate API contract compliance
 *
 * @param {Object} options - Middleware options
 * @param {boolean} options.strict - If true, reject non-compliant responses (default: false)
 * @param {boolean} options.logFailures - If true, log validation failures (default: true)
 * @returns {Function} Hono middleware function
 *
 * @example
 * ```javascript
 * // Strict mode - reject non-compliant responses
 * router.use('/v1/*', validateApiContract({ strict: true }))
 *
 * // Monitoring mode - log but don't reject (default)
 * router.use('/v1/*', validateApiContract())
 * ```
 */
export function validateApiContract(options = {}) {
  const {
    strict = false,
    logFailures = true
  } = options

  return async (c, next) => {
    // Execute the handler
    await next()

    // Get response details
    const response = c.res
    const status = response.status
    const endpoint = c.req.path

    // Only validate JSON responses
    const contentType = response.headers.get('Content-Type') || ''
    if (!contentType.includes('application/json')) {
      return
    }

    // Skip validation for non-API responses (health, metrics, etc.)
    if (!endpoint.startsWith('/v1/') && !endpoint.startsWith('/api/')) {
      return
    }

    try {
      // Clone response to read body without consuming original
      const clonedResponse = response.clone()
      const body = await clonedResponse.json()

      // Validate ResponseEnvelope structure
      const validation = validateResponseEnvelope(body)

      // Record validation attempt
      await recordApiContractMetrics(c.env, {
        endpoint,
        status,
        valid: validation.valid,
        failures: validation.failures
      })

      // Log validation failures
      if (!validation.valid && logFailures) {
        console.warn('[API Contract Validator] Validation failed:', {
          endpoint,
          status,
          failures: validation.failures
        })
      }

      // In strict mode, reject non-compliant responses
      if (strict && !validation.valid) {
        const errorResponse = {
          success: false,
          error: {
            code: 'API_CONTRACT_VIOLATION',
            message: 'Response does not comply with API contract',
            statusCode: 500,
            details: {
              endpoint,
              failures: validation.failures
            }
          }
        }

        c.res = new Response(JSON.stringify(errorResponse), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Contract-Violation': 'true'
          }
        })
      }
    } catch (error) {
      // JSON parse error or validation error
      console.error('[API Contract Validator] Error validating response:', {
        endpoint,
        error: error.message
      })

      // Record parse failure
      await recordApiContractMetrics(c.env, {
        endpoint,
        status,
        valid: false,
        failures: ['response_parse_error']
      })
    }
  }
}

/**
 * Validate a response object directly (for testing)
 *
 * @param {Object} body - Response body to validate
 * @returns {Object} Validation result
 *
 * @example
 * ```javascript
 * const result = validateResponse({
 *   success: true,
 *   data: { isbn: '123' },
 *   metadata: { source: 'api' }
 * })
 * // result = { valid: true, failures: [] }
 * ```
 */
export function validateResponse(body) {
  return validateResponseEnvelope(body)
}

/**
 * Check if response has required fields
 * Exported for testing
 *
 * @param {Object} body - Response body
 * @param {string[]} fields - Required field names
 * @returns {string[]} Missing field names
 */
export function getMissingFields(body, fields) {
  const missing = []
  for (const field of fields) {
    if (!(field in body)) {
      missing.push(field)
    }
  }
  return missing
}
