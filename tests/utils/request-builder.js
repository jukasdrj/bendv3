/**
 * Request Builder Utilities
 *
 * Helper functions to construct HTTP requests for testing
 * Simplifies test setup and ensures consistency
 */

/**
 * Create a mock Cloudflare Request object
 * @param {string} url - Full URL or path
 * @param {Object} options - Request options
 * @returns {Request} Mock Request object
 */
export function createRequest(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    searchParams = {}
  } = options

  // Build URL with search params
  const fullUrl = new URL(url, 'http://localhost:8787')
  Object.entries(searchParams).forEach(([key, value]) => {
    fullUrl.searchParams.set(key, value)
  })

  // Build headers
  const requestHeaders = new Headers(headers)

  // Build request init
  const init = {
    method,
    headers: requestHeaders
  }

  // Add body for POST/PUT/PATCH
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    if (typeof body === 'object' && !(body instanceof FormData)) {
      init.body = JSON.stringify(body)
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json')
      }
    } else {
      init.body = body
    }
  }

  return new Request(fullUrl.toString(), init)
}

/**
 * Create a GET request with query parameters
 * @param {string} path - URL path
 * @param {Object} params - Query parameters
 * @param {Object} headers - Optional headers
 * @returns {Request}
 */
export function createGetRequest(path, params = {}, headers = {}) {
  return createRequest(path, {
    method: 'GET',
    searchParams: params,
    headers
  })
}

/**
 * Create a POST request with JSON body
 * @param {string} path - URL path
 * @param {Object} body - JSON body
 * @param {Object} headers - Optional headers
 * @returns {Request}
 */
export function createPostRequest(path, body = {}, headers = {}) {
  return createRequest(path, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  })
}

/**
 * Create a POST request with FormData (for file uploads)
 * @param {string} path - URL path
 * @param {Object} fields - Form fields
 * @param {Object} headers - Optional headers
 * @returns {Request}
 */
export function createFormRequest(path, fields = {}, headers = {}) {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value)
  })

  return createRequest(path, {
    method: 'POST',
    body: formData,
    headers
  })
}

/**
 * Create a WebSocket upgrade request
 * @param {string} path - WebSocket path
 * @param {Object} params - Query parameters (e.g., jobId, token)
 * @returns {Request}
 */
export function createWebSocketRequest(path, params = {}) {
  return createRequest(path, {
    method: 'GET',
    searchParams: params,
    headers: {
      upgrade: 'websocket',
      connection: 'upgrade',
      'sec-websocket-key': 'test-websocket-key',
      'sec-websocket-version': '13'
    }
  })
}

/**
 * Create a request with CORS preflight (OPTIONS)
 * @param {string} path - URL path
 * @param {string} origin - Origin header
 * @param {string} method - Requested method
 * @returns {Request}
 */
export function createCorsPreflightRequest(path, origin = 'https://bookstrack.oooefam.net', method = 'POST') {
  return createRequest(path, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': method,
      'access-control-request-headers': 'content-type'
    }
  })
}

/**
 * Create a request with authentication token
 * @param {string} path - URL path
 * @param {string} token - Auth token
 * @param {Object} options - Additional options
 * @returns {Request}
 */
export function createAuthenticatedRequest(path, token, options = {}) {
  return createRequest(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...options.headers
    }
  })
}

/**
 * Create a request with custom origin (for CORS testing)
 * @param {string} path - URL path
 * @param {string} origin - Origin header
 * @param {Object} options - Additional options
 * @returns {Request}
 */
export function createRequestWithOrigin(path, origin, options = {}) {
  return createRequest(path, {
    ...options,
    headers: {
      origin,
      ...options.headers
    }
  })
}

/**
 * Create a request with rate limit headers (for testing rate limiting)
 * @param {string} path - URL path
 * @param {string} clientIp - Client IP address
 * @param {Object} options - Additional options
 * @returns {Request}
 */
export function createRateLimitedRequest(path, clientIp = '127.0.0.1', options = {}) {
  return createRequest(path, {
    ...options,
    headers: {
      'cf-connecting-ip': clientIp,
      ...options.headers
    }
  })
}

/**
 * Create an image upload request (for bookshelf scanning)
 * @param {string} path - URL path
 * @param {Buffer|Blob} imageData - Image data
 * @param {string} contentType - Image content type
 * @param {Object} params - Query parameters (jobId, etc.)
 * @returns {Request}
 */
export function createImageUploadRequest(path, imageData, contentType = 'image/jpeg', params = {}) {
  return createRequest(path, {
    method: 'POST',
    searchParams: params,
    body: imageData,
    headers: {
      'content-type': contentType
    }
  })
}

/**
 * Create a batch enrichment request
 * @param {Array<string>} workIds - Array of work IDs to enrich
 * @param {string} jobId - Job ID
 * @returns {Request}
 */
export function createBatchEnrichmentRequest(workIds, jobId = 'test-job-id') {
  return createPostRequest('/api/enrichment/start', {
    jobId,
    workIds
  })
}

/**
 * Create a CSV import request
 * @param {string} csvContent - CSV file content
 * @param {string} jobId - Job ID
 * @returns {Request}
 */
export function createCSVImportRequest(csvContent, jobId = 'test-job-id') {
  return createRequest('/api/csv/import', {
    method: 'POST',
    searchParams: { jobId },
    body: csvContent,
    headers: {
      'content-type': 'text/csv'
    }
  })
}

/**
 * Helper: Extract search params from Request
 * @param {Request} request
 * @returns {URLSearchParams}
 */
export function getSearchParams(request) {
  const url = new URL(request.url)
  return url.searchParams
}

/**
 * Helper: Get request body as JSON
 * @param {Request} request
 * @returns {Promise<Object>}
 */
export async function getRequestJSON(request) {
  return await request.json()
}

/**
 * Helper: Get request body as text
 * @param {Request} request
 * @returns {Promise<string>}
 */
export async function getRequestText(request) {
  return await request.text()
}
