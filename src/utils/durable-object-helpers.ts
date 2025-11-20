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
 * Contains PROGRESS_WEBSOCKET_DO bindings (both traditional and hibernation)
 */
interface EnvWithProgressDO {
  PROGRESS_WEBSOCKET_DO: DurableObjectNamespace;
  PROGRESS_WEBSOCKET_DO_HIBERNATION: DurableObjectNamespace;
  ENABLE_HIBERNATION_WEBSOCKET?: string;
}

/**
 * Get a stub for the Progress WebSocket Durable Object
 *
 * Handles ID generation and stub retrieval for ProgressWebSocketDO.
 * Automatically selects between traditional and hibernation implementation
 * based on ENABLE_HIBERNATION_WEBSOCKET feature flag.
 *
 * Migration Strategy (Issue #221):
 * - Phase 1: flag=false, traditional implementation (default, 100% backward compatible)
 * - Phase 2: flag=true, hibernation implementation (70-80% cost reduction)
 * - Gradual rollout: 1% → 10% → 50% → 100%
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
  // Feature flag: Choose implementation
  const useHibernation = env.ENABLE_HIBERNATION_WEBSOCKET === "true";

  if (useHibernation) {
    // Hibernation API (Issue #221: Cloudflare best practices)
    const id = env.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName(jobId);
    return env.PROGRESS_WEBSOCKET_DO_HIBERNATION.get(id);
  } else {
    // Traditional WebSocket (default, 100% backward compatible)
    const id = env.PROGRESS_WEBSOCKET_DO.idFromName(jobId);
    return env.PROGRESS_WEBSOCKET_DO.get(id);
  }
}
