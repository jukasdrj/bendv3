/**
 * Response Validator Utilities
 *
 * Helper functions to validate API responses against canonical formats
 * Ensures consistent envelope structure across all endpoints
 */

/**
 * Validate canonical success envelope structure (API Contract v2.0)
 * @param {Object} response - Response object to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateSuccessEnvelope(response) {
  const errors = []

  // Check data field exists (nullable pattern)
  if (response.data === undefined) {
    errors.push('Missing "data" field in response envelope')
  }

  // Check metadata field (renamed from meta)
  if (!response.metadata) {
    errors.push('Missing "metadata" field')
  } else {
    if (!response.metadata.timestamp) {
      errors.push('Missing "metadata.timestamp"')
    }
    if (response.metadata.processingTime !== undefined && typeof response.metadata.processingTime !== 'number') {
      errors.push('Invalid "metadata.processingTime" (must be number)')
    }
  }

  // Error field should NOT be present in success response
  if (response.error !== undefined) {
    errors.push('Success envelope should not have "error" field')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate canonical error envelope structure (API Contract v2.0)
 * @param {Object} response - Response object to validate
 * @returns {Object} Validation result
 */
export function validateErrorEnvelope(response) {
  const errors = []

  // Check data field is null (error responses have null data)
  if (response.data !== null) {
    errors.push('Error envelope must have data=null')
  }

  // Check error field exists
  if (!response.error) {
    errors.push('Missing "error" field in error response')
  } else {
    if (!response.error.message) {
      errors.push('Missing "error.message"')
    }
    // code is optional but commonly used
  }

  // Check metadata field (renamed from meta)
  if (!response.metadata) {
    errors.push('Missing "metadata" field')
  } else {
    if (!response.metadata.timestamp) {
      errors.push('Missing "metadata.timestamp"')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate WorkDTO structure
 * @param {Object} work - Work object to validate
 * @returns {Object} Validation result
 */
export function validateWorkDTO(work) {
  const errors = []

  // Required fields
  if (!work.workId) errors.push('Missing "workId"')
  if (!work.title) errors.push('Missing "title"')

  // Check arrays
  if (!Array.isArray(work.authors)) {
    errors.push('"authors" must be an array')
  }
  if (!Array.isArray(work.subjects)) {
    errors.push('"subjects" must be an array')
  }
  if (!Array.isArray(work.editions)) {
    errors.push('"editions" must be an array')
  }

  // Check types
  if (typeof work.editionCount !== 'number') {
    errors.push('"editionCount" must be a number')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate Edition structure
 * @param {Object} edition - Edition object to validate
 * @returns {Object} Validation result
 */
export function validateEdition(edition) {
  const errors = []

  if (!edition.editionId) errors.push('Missing "editionId"')
  if (!edition.title) errors.push('Missing "title"')
  if (!edition.isbn13 && !edition.isbn10) {
    errors.push('Must have at least one ISBN (isbn13 or isbn10)')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate Author structure
 * @param {Object} author - Author object to validate
 * @returns {Object} Validation result
 */
export function validateAuthor(author) {
  const errors = []

  if (!author.authorId) errors.push('Missing "authorId"')
  if (!author.name) errors.push('Missing "name"')
  if (!author.role) errors.push('Missing "role"')

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate v1 search response structure (API Contract v2.0)
 * Expected format:
 * {
 *   data: {
 *     works: [...],
 *     editions: [...],
 *     authors: [...]
 *   },
 *   metadata: { timestamp, processingTime }
 * }
 */
export function validateV1SearchResponse(response) {
  const envelopeValidation = validateSuccessEnvelope(response)
  if (!envelopeValidation.valid) {
    return envelopeValidation
  }

  const errors = []

  // Check v1 search-specific structure
  if (!response.data || typeof response.data !== 'object') {
    errors.push('"data" must be an object')
  } else {
    if (!Array.isArray(response.data.works)) {
      errors.push('"data.works" must be an array')
    }
    if (!Array.isArray(response.data.editions)) {
      errors.push('"data.editions" must be an array')
    }
    if (!Array.isArray(response.data.authors)) {
      errors.push('"data.authors" must be an array')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate WebSocket progress message
 * @param {Object} message - WebSocket message object
 * @returns {Object} Validation result
 */
export function validateProgressMessage(message) {
  const errors = []

  if (!message.type) errors.push('Missing "type"')
  if (!message.jobId) errors.push('Missing "jobId"')
  if (!message.timestamp) errors.push('Missing "timestamp"')

  // Type-specific validation
  if (message.type === 'progress') {
    if (typeof message.progress !== 'number') {
      errors.push('"progress" must be a number')
    }
    if (message.progress < 0 || message.progress > 100) {
      errors.push('"progress" must be between 0 and 100')
    }
  }

  if (message.type === 'complete') {
    if (!message.data) errors.push('Complete message must have "data"')
  }

  if (message.type === 'error') {
    if (!message.error) errors.push('Error message must have "error"')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate CORS headers
 * @param {Response} response - HTTP Response object
 * @param {string} expectedOrigin - Expected origin
 * @returns {Object} Validation result
 */
export function validateCorsHeaders(response, expectedOrigin = null) {
  const errors = []
  const headers = response.headers

  if (!headers.has('access-control-allow-origin')) {
    errors.push('Missing CORS header: access-control-allow-origin')
  } else if (expectedOrigin && headers.get('access-control-allow-origin') !== expectedOrigin) {
    errors.push(`CORS origin mismatch: expected ${expectedOrigin}, got ${headers.get('access-control-allow-origin')}`)
  }

  if (!headers.has('access-control-allow-methods')) {
    errors.push('Missing CORS header: access-control-allow-methods')
  }

  if (!headers.has('access-control-allow-headers')) {
    errors.push('Missing CORS header: access-control-allow-headers')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate rate limit headers
 * @param {Response} response - HTTP Response object
 * @returns {Object} Validation result
 */
export function validateRateLimitHeaders(response) {
  const errors = []
  const headers = response.headers

  if (!headers.has('x-ratelimit-limit')) {
    errors.push('Missing rate limit header: x-ratelimit-limit')
  }
  if (!headers.has('x-ratelimit-remaining')) {
    errors.push('Missing rate limit header: x-ratelimit-remaining')
  }
  if (!headers.has('x-ratelimit-reset')) {
    errors.push('Missing rate limit header: x-ratelimit-reset')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Helper: Assert response is valid (throws on validation errors)
 * @param {Object} response - Response object
 * @param {Function} validator - Validation function
 */
export function assertValidResponse(response, validator = validateSuccessEnvelope) {
  const result = validator(response)
  if (!result.valid) {
    throw new Error(`Response validation failed:\n${result.errors.join('\n')}`)
  }
}

/**
 * Helper: Check if response matches expected status code
 * @param {Response} response - HTTP Response
 * @param {number} expectedStatus - Expected status code
 * @returns {boolean}
 */
export function hasStatusCode(response, expectedStatus) {
  return response.status === expectedStatus
}

/**
 * Helper: Check if response is JSON
 * @param {Response} response - HTTP Response
 * @returns {boolean}
 */
export function isJSONResponse(response) {
  const contentType = response.headers.get('content-type')
  return contentType && contentType.includes('application/json')
}

/**
 * Helper: Parse and validate response in one step
 * @param {Response} response - HTTP Response
 * @param {Function} validator - Optional validation function
 * @returns {Promise<Object>} { body, validation }
 */
export async function parseAndValidate(response, validator = validateSuccessEnvelope) {
  if (!isJSONResponse(response)) {
    throw new Error('Response is not JSON')
  }

  const body = await response.json()
  const validation = validator(body)

  return { body, validation }
}
