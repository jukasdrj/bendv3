/**
 * CSV Processor Service
 *
 * Handles CSV parsing and validation as a standalone service.
 * Extracted from ProgressWebSocketDO alarm handler as part of the
 * architectural refactoring to separate business logic from Durable Objects.
 *
 * This service is called by handlers and coordinates CSV parsing via Gemini,
 * reporting progress updates through a provided progress callback interface.
 *
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 * Related: Issue #180 - Eliminate code duplication in CSV processing
 */

import {
  processCSVCore,
  buildServiceCompletionPayload,
} from "../utils/csv-processor-core.js";
import { getCacheTTL } from "../config/cache-ttl.js";

/**
 * Process CSV import with progress tracking
 *
 * This is now a thin wrapper around processCSVCore utility (Issue #180)
 *
 * @param {string} csvText - Raw CSV file content
 * @param {Object} progressReporter - Interface for reporting progress
 * @param {Function} progressReporter.updateProgress - Update progress (pipeline, payload)
 * @param {Function} progressReporter.complete - Mark job complete (pipeline, payload)
 * @param {Function} progressReporter.sendError - Send error (pipeline, payload)
 * @param {Function} progressReporter.waitForReady - Wait for client ready signal
 * @param {Object} env - Worker environment bindings
 * @param {string} jobId - Job identifier for storing results
 * @returns {Promise<void>}
 */
export async function processCSVImport(csvText, progressReporter, env, jobId) {
  // Use shared CSV processing core with service-specific options
  await processCSVCore(csvText, jobId, progressReporter, env, {
    resultsTTL: getCacheTTL('hot', env), // Use hot TTL (2h) for temporary results
    resultsKeyPrefix: "csv-results", // Service-specific prefix
    buildCompletionPayload: buildServiceCompletionPayload, // Custom completion format
  });
}
