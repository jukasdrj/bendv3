/**
 * GET /v1/csv/results/{jobId}
 *
 * Retrieve full CSV import results from KV cache.
 * Results are stored after WebSocket completion message (summary-only pattern).
 *
 * Related: Issue #133 (Summary-only WebSocket completions)
 */

import { handleKVResults, type KVResultsConfig } from "../../utils/kv-results-handler.js";

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

const csvResultsConfig: KVResultsConfig<CSVImportResults> = {
  keyPrefix: "csv-results",
  resultTypeName: "CSV import",
  logPrefix: "v1/csv/results",
  formatLogMessage: (jobId, results, expiresAt) =>
    `[v1/csv/results] Retrieved results for job ${jobId}: ${results.books.length} books imported, expires at ${expiresAt}`,
};

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
  request: Request | null = null,
): Promise<Response> {
  return handleKVResults<CSVImportResults>(jobId, env, csvResultsConfig, request);
}
