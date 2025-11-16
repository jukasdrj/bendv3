/**
 * GET /v1/csv/results/{jobId}
 *
 * Retrieve full CSV import results from KV cache.
 * Results are stored after WebSocket completion message (summary-only pattern).
 *
 * Related: Issue #133 (Summary-only WebSocket completions)
 */

import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';

/**
 * CSV Import Results Response
 * Matches the structure stored by csv-processor.js:105-111
 */
export interface CSVImportResults {
  books: Array<{
    title: string;
    author: string;
    isbn?: string;
  }>;
  errors: any[];
  successRate: string; // e.g., "98/100"
  timestamp: number;
}

/**
 * Handler: GET /v1/csv/results/{jobId}
 *
 * @param {string} jobId - Job identifier from WebSocket completion message
 * @param {any} env - Worker environment bindings
 * @param {Request | null} request - Original HTTP request
 * @returns {Promise<Response>} ResponseEnvelope<CSVImportResults>
 */
export async function handleCSVResults(
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
    // Retrieve from KV (stored by csv-processor.js:105)
    const resultsKey = `csv-results:${jobId}`;
    const cached = await env.KV_CACHE.get(resultsKey, 'json');

    if (!cached) {
      return createErrorResponse(
        'CSV import results not found or expired. Results are stored for 24 hours after job completion.',
        404,
        ErrorCodes.NOT_FOUND,
        { jobId, resultsKey, ttl: '24 hours' },
        request
      );
    }

    // Cast to expected structure
    const results = cached as CSVImportResults;

    console.log(
      `[v1/csv/results] Retrieved results for job ${jobId}: ${results.books.length} books imported`
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
    console.error('[v1/csv/results] Error retrieving CSV results:', error);
    return createErrorResponse(
      error.message || 'Failed to retrieve CSV import results',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId, error: error.toString() },
      request
    );
  }
}
