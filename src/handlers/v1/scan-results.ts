/**
 * GET /v1/scan/results/{jobId}
 *
 * Retrieve full AI bookshelf scan results from KV cache.
 * Results are stored after WebSocket completion message (summary-only pattern).
 *
 * Related: Issue #133 (Summary-only WebSocket completions)
 */

import { handleKVResults, type KVResultsConfig } from "../../utils/kv-results-handler.js";

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
    enrichmentStatus?: "pending" | "success" | "not_found" | "error";
    enrichment?: {
      status: "success" | "not_found" | "error";
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

const scanResultsConfig: KVResultsConfig<AIScanResults> = {
  keyPrefix: "scan-results",
  resultTypeName: "Scan",
  logPrefix: "v1/scan/results",
  formatLogMessage: (jobId, results, expiresAt) =>
    `[v1/scan/results] Retrieved results for job ${jobId}: ${results.totalDetected} books detected, expires at ${expiresAt}`,
};

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
  request: Request | null = null,
): Promise<Response> {
  return handleKVResults<AIScanResults>(jobId, env, scanResultsConfig, request);
}
