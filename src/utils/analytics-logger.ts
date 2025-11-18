/**
 * Standardized Analytics Logging for External APIs
 *
 * This module provides a centralized helper function for logging analytics
 * data related to external API calls. It ensures that all logging is
 * consistent and follows a standardized format.
 *
 * The `logExternalApiCall` function is the primary entry point for logging
 * analytics data. It accepts the provider name, a function to execute,
 * and any relevant parameters. It handles timing, success/error logging,
 * and data normalization for Analytics Engine.
 */

import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";
import type { DataProvider } from "../types/enums";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Environment bindings required for the analytics logger.
 */
export interface AnalyticsEnv {
  ANALYTICS_ENGINE?: AnalyticsEngineDataset;
}

/**
 * Parameters for the external API call to be logged.
 */
export interface ApiCallParams {
  query?: string;
  isbn?: string;
  [key: string]: any;
}

// ============================================================================
// HELPER FUNCTION
// ============================================================================

/**
 * Logs an external API call to the Analytics Engine.
 *
 * @param provider - The data provider being called (e.g., "GoogleBooks", "OpenLibrary").
 * @param apiCallFn - The async function to execute for the API call.
 * @param params - The parameters for the API call.
 * @param env - The worker environment bindings.
 * @returns The result of the API call function.
 */
export async function logExternalApiCall<T>(
  provider: DataProvider,
  apiCallFn: () => Promise<T>,
  params: ApiCallParams,
  env: AnalyticsEnv,
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await apiCallFn();
    const processingTime = Date.now() - startTime;

    if (env.ANALYTICS_ENGINE) {
      const { query, isbn } = params;
      const eventType = isbn ? "isbn_search" : "search";

      // Extract actual result count from NormalizedResponse structure
      const resultCount = (result as any)?.works?.length ?? 0;

      env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [query || isbn || 'unknown', eventType, provider],
        doubles: [processingTime, resultCount],
        indexes: [`${provider.toLowerCase()}-success`],
      });
    }

    return result;
  } catch (error) {
    const processingTime = Date.now() - startTime;

    // Type guard for error message extraction
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (env.ANALYTICS_ENGINE) {
      const { query, isbn } = params;
      const eventType = isbn ? "isbn_search_error" : "search_error";

      env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [query || isbn || 'unknown', eventType, provider, errorMessage],
        doubles: [processingTime, 0],
        indexes: [`${provider.toLowerCase()}-error`],
      });
    }

    // Re-throw the error to be handled by the caller
    throw error;
  }
}
