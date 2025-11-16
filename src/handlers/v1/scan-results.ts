/**
 * GET /v1/scan/results/{jobId}
 *
 * Retrieve full AI bookshelf scan results from KV cache.
 * Results are stored after WebSocket completion message (summary-only pattern).
 *
 * Related: Issue #133 (Summary-only WebSocket completions)
 */

import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';

/**
 * AI Scan Results Response
 * Matches the structure stored by ai-scanner.js:263-274
 */
export interface AIScanResults {
  totalDetected: number;
  approved: number;
  needsReview: number;
  books: Array<{
    title?: string;
    author?: string;
    isbn?: string;
    confidence?: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    enrichmentStatus?: 'pending' | 'success' | 'not_found' | 'error';
    enrichment?: {
      status: 'success' | 'not_found' | 'error';
      work?: any;
      editions?: any[];
      authors?: any[];
      provider?: string;
      cachedResult?: boolean;
      error?: string;
    };
  }>;
  metadata: {
    modelUsed: string;
    processingTime: number;
    timestamp: number;
  };
}

/**
 * Handler: GET /v1/scan/results/{jobId}
 *
 * @param {string} jobId - Job identifier from WebSocket completion message
 * @param {any} env - Worker environment bindings
 * @param {Request | null} request - Original HTTP request
 * @returns {Promise<Response>} ResponseEnvelope<AIScanResults>
 */
export async function handleScanResults(
  jobId: string,
  env: any,
  request: Request | null = null
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!jobId || jobId.trim().length === 0) {
    return createErrorResponse(
      'Job ID is required',
      400,
      ErrorCodes.INVALID_REQUEST,
      { jobId },
      request
    );
  }

  try {
    // Retrieve from KV (stored by ai-scanner.js:263)
    const resultsKey = `scan-results:${jobId}`;
    const cached = await env.KV_CACHE.get(resultsKey, 'json');

    if (!cached) {
      return createErrorResponse(
        'Scan results not found or expired. Results are stored for 24 hours after job completion.',
        404,
        ErrorCodes.NOT_FOUND,
        { jobId, resultsKey, ttl: '24 hours' },
        request
      );
    }

    // Cast to expected structure
    const results = cached as AIScanResults;

    console.log(
      `[v1/scan/results] Retrieved results for job ${jobId}: ${results.totalDetected} books detected`
    );

    return createSuccessResponse(
      results,
      {
        processingTime: Date.now() - startTime,
        cached: true,
        provider: 'kv_cache',
      },
      200,
      request
    );
  } catch (error: any) {
    console.error('[v1/scan/results] Error retrieving scan results:', error);
    return createErrorResponse(
      error.message || 'Failed to retrieve scan results',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId, error: error.toString() },
      request
    );
  }
}
