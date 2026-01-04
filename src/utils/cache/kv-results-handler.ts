/**
 * KV Results Handler Utility
 *
 * Generic handler for retrieving job results from KV cache.
 * Used by scan-results and csv-results handlers to reduce duplication.
 */

import { createErrorResponse, ErrorCodes } from './response-builder.js'

/**
 * Minimal environment interface required for KV results handler.
 * This is a subset of the full Env type to keep the handler generic.
 */
export interface KVResultsEnv {
  CACHE: KVNamespace
}

/**
 * Configuration for the KV results handler
 */
export interface KVResultsConfig<T> {
  /** Prefix for the KV key (e.g., "scan-results", "csv-results") */
  keyPrefix: string
  /** Human-readable name for the result type (e.g., "Scan", "CSV import") */
  resultTypeName: string
  /** Log prefix for console messages */
  logPrefix: string
  /** Custom log message generator */
  formatLogMessage?: (jobId: string, results: T, expiresAt: string) => string
  /** Default TTL message for not found error */
  ttlMessage?: string
}

/**
 * Result of a KV retrieval operation
 */
export interface KVRetrievalResult<T> {
  success: true
  data: T
  expiresAt: string
}

export interface KVRetrievalError {
  success: false
  error: string
  statusCode: number
}

/**
 * Calculate expiry timestamp from KV metadata
 *
 * @param metadata - KV metadata containing expiration timestamp
 * @returns ISO 8601 timestamp string
 */
export function calculateExpiresAt(metadata?: { expiration?: number }): string {
  // KV metadata.expiration is Unix timestamp in seconds
  // Convert to ISO 8601 string for client consumption
  // Fallback to 24h from now if metadata unavailable (edge case)
  return metadata?.expiration
    ? new Date(metadata.expiration * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Generic handler for retrieving job results from KV cache
 *
 * @param jobId - Job identifier
 * @param env - Worker environment with CACHE binding
 * @param config - Handler configuration
 * @param request - Original HTTP request
 * @returns Response with job results or error
 */
export async function handleKVResults<T>(
  jobId: string,
  env: KVResultsEnv,
  config: KVResultsConfig<T>,
  request: Request | null = null,
): Promise<Response> {
  const _startTime = Date.now()

  // Validation
  if (!jobId || jobId.trim().length === 0) {
    return createErrorResponse(
      'Job ID is required',
      400,
      ErrorCodes.INVALID_REQUEST,
      { jobId },
      request,
    )
  }

  try {
    // Retrieve from KV with metadata (to get expiration timestamp)
    const resultsKey = `${config.keyPrefix}:${jobId}`
    const kvResult = await env.CACHE.getWithMetadata(resultsKey, 'json')

    if (!kvResult.value) {
      return createErrorResponse(
        `${config.resultTypeName} results not found or expired. ${config.ttlMessage || 'Results are stored for 24 hours after job completion.'}`,
        404,
        ErrorCodes.NOT_FOUND,
        { jobId, resultsKey, ttl: '24 hours' },
        request,
      )
    }

    // Cast to expected structure
    const results = kvResult.value as T

    // Calculate expiry
    const expiresAt = calculateExpiresAt(kvResult.metadata)

    // Log retrieval
    if (config.formatLogMessage) {
      console.log(config.formatLogMessage(jobId, results, expiresAt))
    } else {
      console.log(
        `[${config.logPrefix}] Retrieved results for job ${jobId}, expires at ${expiresAt}`,
      )
    }

    return new Response(
      JSON.stringify({
        ...results,
        expiresAt,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error(
      `[${config.logPrefix}] Error retrieving ${config.resultTypeName.toLowerCase()} results:`,
      error,
    )
    return createErrorResponse(
      error.message || `Failed to retrieve ${config.resultTypeName.toLowerCase()} results`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId, error: error.toString() },
      request,
    )
  }
}
