/**
 * Durable Object Helper Utilities
 *
 * Centralized utilities for accessing Durable Object stubs.
 * Reduces code duplication and improves testability.
 */

import type {
  DurableObjectNamespace,
  DurableObjectStub,
} from "@cloudflare/workers-types";

/**
 * Minimal environment interface for Durable Object access
 * Contains refactored DO bindings for job state management
 */
interface EnvWithProgressDO {
  JOB_STATE_MANAGER_DO: DurableObjectNamespace;
  WEBSOCKET_CONNECTION_DO: DurableObjectNamespace;
  // Legacy bindings (deprecated, kept for backward compatibility)
  PROGRESS_WEBSOCKET_DO?: DurableObjectNamespace;
  PROGRESS_WEBSOCKET_DO_HIBERNATION?: DurableObjectNamespace;
  ENABLE_HIBERNATION_WEBSOCKET?: string;
  ENABLE_REFACTORED_DOS?: string;
}

/**
 * Get a stub for the Job State Manager Durable Object
 *
 * BREAKING CHANGE (Issue #68 - Refactored DO Architecture):
 * Now returns JOB_STATE_MANAGER_DO instead of PROGRESS_WEBSOCKET_DO.
 * The refactored architecture separates concerns:
 * - JOB_STATE_MANAGER_DO: State persistence and queries
 * - WEBSOCKET_CONNECTION_DO: WebSocket connections and broadcasts
 *
 * Migration controlled by ENABLE_REFACTORED_DOS feature flag:
 * - flag=false: Legacy PROGRESS_WEBSOCKET_DO (deprecated)
 * - flag=true: New JOB_STATE_MANAGER_DO (default)
 *
 * @param jobId - Unique job identifier (used as DO instance name)
 * @param env - Worker environment bindings containing JOB_STATE_MANAGER_DO
 * @returns Durable Object stub for the given jobId
 *
 * @example
 * const stub = getProgressDOStub('job-123', env)
 * await stub.getJobState() // Returns job state
 */
export function getProgressDOStub(
  jobId: string,
  env: EnvWithProgressDO,
): DurableObjectStub {
  // Feature flag: Use refactored architecture (enabled as of Nov 25, 2025)
  // Explicit string comparison for clarity and safety
  const useRefactoredDOs = env.ENABLE_REFACTORED_DOS === "true";

  if (useRefactoredDOs) {
    // New refactored architecture: JOB_STATE_MANAGER_DO for state queries
    const id = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
    return env.JOB_STATE_MANAGER_DO.get(id);
  } else {
    // Legacy path: PROGRESS_WEBSOCKET_DO (deprecated)
    const useHibernation = env.ENABLE_HIBERNATION_WEBSOCKET === "true";
    if (useHibernation && env.PROGRESS_WEBSOCKET_DO_HIBERNATION) {
      const id = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName(jobId);
      return env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(id);
    } else if (env.PROGRESS_WEBSOCKET_DO) {
      const id = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
      return env.PROGRESS_WEBSOCKET_DO.get(id);
    } else {
      // Fallback to refactored if legacy bindings not available
      const id = env.JOB_STATE_MANAGER_DO.idFromName(jobId);
      return env.JOB_STATE_MANAGER_DO.get(id);
    }
  }
}
