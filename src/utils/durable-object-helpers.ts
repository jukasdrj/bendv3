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
 * Contains only the PROGRESS_WEBSOCKET_DO binding needed by these utilities
 */
interface EnvWithProgressDO {
  PROGRESS_WEBSOCKET_DO: DurableObjectNamespace;
}

/**
 * Get a stub for the Progress WebSocket Durable Object
 *
 * Handles ID generation and stub retrieval for the ProgressWebSocketDO.
 * Each jobId gets a unique Durable Object instance.
 *
 * @param jobId - Unique job identifier (used as DO instance name)
 * @param env - Worker environment bindings containing PROGRESS_WEBSOCKET_DO
 * @returns Durable Object stub for the given jobId
 *
 * @example
 * const stub = getProgressDOStub('job-123', env)
 * await stub.updateProgress(50, 'Processing...')
 */
export function getProgressDOStub(
  jobId: string,
  env: EnvWithProgressDO,
): DurableObjectStub {
  const id = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
  return env.PROGRESS_WEBSOCKET_DO.get(id);
}
