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
 * Related: Issue #217 - Dependency injection for workerd-compatible testing
 */

import { getCacheTTL } from '../config/cache-ttl'
import type { Env } from '../types/env'
import {
  buildServiceCompletionPayload,
  defaultDeps,
  type ProcessorDependencies,
  processCSVCore,
} from '../utils/csv-processor-core'
import type { ProgressReporter } from '../utils/progress-reporter'

/**
 * Process CSV import with progress tracking
 *
 * This is now a thin wrapper around processCSVCore utility (Issue #180)
 *
 * @param csvText - Raw CSV file content
 * @param progressReporter - Interface for reporting progress
 * @param env - Worker environment bindings
 * @param jobId - Job identifier for storing results
 * @param deps - Optional dependency injection for testing (Issue #217)
 * @returns Promise that resolves when processing is complete
 */
export async function processCSVImport(
  csvText: string,
  progressReporter: ProgressReporter,
  env: Env,
  jobId: string,
  deps: ProcessorDependencies = defaultDeps,
): Promise<void> {
  // Use shared CSV processing core with service-specific options
  await processCSVCore(csvText, jobId, progressReporter, env, {
    resultsTTL: getCacheTTL('hot', env), // Use hot TTL (2h) for temporary results
    resultsKeyPrefix: 'csv-results', // Service-specific prefix
    buildCompletionPayload: buildServiceCompletionPayload, // Custom completion format
    deps, // Pass through for testing (Issue #217)
  })
}
