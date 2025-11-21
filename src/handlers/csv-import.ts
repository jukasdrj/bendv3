// src/handlers/csv-import.js
/**
 * CSV Import Handler
 *
 * Phase 2: Canonical API Contract Implementation
 * - Uses CSVImportInitResponse for initialization response
 * - Returns typed canonical response format
 */

import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from "../utils/response-builder.js";
import type { CSVImportInitResponse } from "../types/responses.js";
import { getProgressDOStub } from "../utils/durable-object-helpers.js";
import { processCSVCore } from "../utils/csv-processor-core.js";

// Aligned with Gemini 2.0 Flash 2M token context (approximating ~8MB at 4 bytes/token)
// Issue #181: Consistent with MAX_CSV_SIZE in gemini-csv-provider.js
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Handle CSV import request (POST /api/import/csv-gemini)
 *
 * Uses Durable Object alarm to avoid Worker CPU time limits (Issue #249)
 * Long-running Gemini API calls (20-60s) exceed default 30-second CPU time limit
 * Paid Plan: 5-minute max per invocation, but Durable Object alarms better for long operations
 *
 * Feature Flag: ENABLE_REFACTORED_DOS (new architecture with separated concerns)
 * - When true: Uses WebSocketConnectionDO + JobStateManagerDO + CSV Processor Service
 * - When false: Uses legacy ProgressWebSocketDO (default for backward compatibility)
 *
 * @param {Request} request - Incoming request with FormData containing CSV file
 * @param {Object} env - Worker environment bindings
 * @param {ExecutionContext} ctx - Execution context (not used for processing)
 * @returns {Promise<Response>} Response with jobId
 */
export async function handleCSVImport(request, env, ctx) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get("file");

    if (!csvFile) {
      return createErrorResponse(
        "No file provided",
        400,
        ErrorCodes.MISSING_PARAMETER,
      );
    }

    // Check file size (aligned with 2M token limit)
    if (csvFile.size > MAX_FILE_SIZE) {
      return createErrorResponse(
        "CSV file too large (max 8MB to fit 2M token limit)",
        413,
        ErrorCodes.FILE_TOO_LARGE,
        {
          suggestion:
            "Try splitting your CSV into smaller files or removing unnecessary columns",
        },
      );
    }

    // Generate jobId
    const jobId = crypto.randomUUID();

    // SECURITY: Generate authentication token for WebSocket connection
    const authToken = crypto.randomUUID();

    // Feature flag: Use new refactored architecture or legacy monolithic DO
    const useRefactoredDOs = env.ENABLE_REFACTORED_DOS === "true";

    if (useRefactoredDOs) {
      // NEW ARCHITECTURE: Separated concerns
      // Get Durable Object stubs
      const wsDoId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
      const wsDoStub = env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

      const stateDoId = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
      const stateDoStub = env.JOB_STATE_MANAGER_DO.get(stateDoId);

      // Set authentication token and initialize job state
      await wsDoStub.setAuthToken(authToken);
      await stateDoStub.initializeJobState(jobId, "csv_import", 0);

      console.log(`[CSV Import] Using new architecture for job ${jobId}`);

      // Read CSV content and schedule processing via Durable Object alarm
      // This avoids Worker CPU time limits for long-running Gemini API calls (20-60s)
      // Paid Plan allows 5-minute max, but alarm-based processing is architecturally superior
      const csvText = await csvFile.text();
      await stateDoStub.scheduleCSVProcessing(csvText, jobId);
    } else {
      // LEGACY ARCHITECTURE: Monolithic ProgressWebSocketDO
      // Uses getProgressDOStub() to support hibernation API migration (Issue #221)
      const doStub = getProgressDOStub(jobId, env);

      await doStub.setAuthToken(authToken);
      console.log(`[CSV Import] Auth token generated for job ${jobId}`);

      // Initialize job state for CSV import
      await doStub.initializeJobState("csv_import", 0);

      // Read CSV content and schedule processing via Durable Object alarm
      const csvText = await csvFile.text();
      await doStub.scheduleCSVProcessing(csvText, jobId);

      console.log(`[CSV Import] Using legacy architecture for job ${jobId}`);
    }

    // Return typed CSVImportInitResponse
    const initResponse: CSVImportInitResponse = {
      jobId,
      token: authToken, // WebSocket authentication token
    };

    return createSuccessResponse(initResponse, {}, 202);
  } catch (error) {
    return createErrorResponse(error.message, 500, ErrorCodes.INTERNAL_ERROR);
  }
}

/**
 * Core CSV import processor (called by Durable Object alarm)
 *
 * Stage 1 (5-50%): Gemini parses CSV into structured book data
 * Stage 2 (50-100%): Validate parsed books (title and author required)
 *
 * Note: Enrichment now happens on iOS via EnrichmentQueue
 *
 * This is now a thin wrapper around processCSVCore utility (Issue #180)
 *
 * @param {string} csvText - Raw CSV file content
 * @param {string} jobId - Unique job identifier
 * @param {Object} doStub - ProgressWebSocketDO stub (or 'this' from alarm context)
 * @param {Object} env - Worker environment bindings
 */
export async function processCSVImportCore(csvText, jobId, doStub, env) {
  // Use shared CSV processing core with handler-specific options
  await processCSVCore(csvText, jobId, doStub, env, {
    resultsTTL: 3600, // 1 hour TTL
    resultsKeyPrefix: "job-results", // Handler-specific prefix
    // Default completion payload builder (summary format) is used
  });
}
