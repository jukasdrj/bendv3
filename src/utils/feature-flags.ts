/**
 * Feature Flags Utility
 *
 * Issue #71 - LAUNCH BLOCKER
 *
 * Controls gradual rollout of Cloudflare Workflows vs legacy JobStateManagerDO.
 * Allows safe migration with percentage-based traffic splitting.
 *
 * Configuration (wrangler.jsonc vars):
 * - WORKFLOW_ROLLOUT_PERCENT: 0-100 (default: 0 - disabled)
 *
 * Rollout Strategy:
 * - Week 1, Day 1-3: 10% (canary testing)
 * - Week 1, Day 4-5: 50% (expanded testing)
 * - Week 2, Day 1-3: 100% (full migration)
 * - Week 2, Day 4-5: Remove legacy code
 */

interface FeatureFlagEnv {
  WORKFLOW_ROLLOUT_PERCENT?: string
  ENABLE_WORKFLOW_IMPORT?: string
}

/**
 * Check if Workflow-based import should be used
 *
 * Uses consistent hashing for deterministic routing - same request
 * will always route to same system for debugging and support.
 *
 * @param env - Environment bindings with feature flags
 * @param isbn - Optional ISBN for consistent hashing
 * @returns true if Workflow should be used, false for legacy
 */
export function shouldUseWorkflow(env: FeatureFlagEnv, isbn?: string): boolean {
  // Kill switch: explicitly disabled
  if (env.ENABLE_WORKFLOW_IMPORT === 'false') {
    return false
  }

  // Force enable: explicitly enabled (bypass percentage)
  if (env.ENABLE_WORKFLOW_IMPORT === 'true') {
    return true
  }

  // Percentage-based rollout
  const rolloutPercent = parseInt(env.WORKFLOW_ROLLOUT_PERCENT || '0', 10)

  // Validate percentage
  if (isNaN(rolloutPercent) || rolloutPercent < 0) {
    return false // Default to legacy if invalid
  }

  if (rolloutPercent >= 100) {
    return true // 100% = always use workflow
  }

  if (rolloutPercent <= 0) {
    return false // 0% = never use workflow
  }

  // Use consistent hashing if ISBN provided (deterministic routing)
  if (isbn) {
    const hash = simpleHash(isbn)
    return (hash % 100) < rolloutPercent
  }

  // Random percentage for requests without ISBN
  return Math.random() * 100 < rolloutPercent
}

/**
 * Get the import method to use
 *
 * @param env - Environment bindings
 * @param isbn - Optional ISBN for consistent hashing
 * @returns 'workflow' or 'legacy'
 */
export function getImportMethod(env: FeatureFlagEnv, isbn?: string): 'workflow' | 'legacy' {
  return shouldUseWorkflow(env, isbn) ? 'workflow' : 'legacy'
}

/**
 * Get current rollout configuration for debugging
 */
export function getRolloutConfig(env: FeatureFlagEnv): {
  enabled: boolean
  percent: number
  forceEnabled: boolean
  forceDisabled: boolean
} {
  return {
    enabled: shouldUseWorkflow(env),
    percent: parseInt(env.WORKFLOW_ROLLOUT_PERCENT || '0', 10),
    forceEnabled: env.ENABLE_WORKFLOW_IMPORT === 'true',
    forceDisabled: env.ENABLE_WORKFLOW_IMPORT === 'false',
  }
}

/**
 * Simple string hash for consistent routing
 * Uses djb2 algorithm for fast, reasonable distribution
 */
function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  return Math.abs(hash)
}

/**
 * Log workflow metrics for A/B comparison
 *
 * @param method - 'workflow' or 'legacy'
 * @param isbn - Book ISBN
 * @param duration - Processing time in ms
 * @param success - Whether import succeeded
 * @param env - Environment with Analytics Engine binding
 */
export async function logWorkflowMetrics(
  method: 'workflow' | 'legacy',
  isbn: string,
  duration: number,
  success: boolean,
  env: { PERFORMANCE_ANALYTICS?: AnalyticsEngineDataset }
): Promise<void> {
  const metric = {
    method,
    isbn,
    duration,
    success,
    timestamp: new Date().toISOString(),
  }

  // Log to Analytics Engine (primary metrics sink)
  // Note: KV fallback removed to avoid unbounded key creation (Code Review Issue #5)
  if (env.PERFORMANCE_ANALYTICS) {
    try {
      env.PERFORMANCE_ANALYTICS.writeDataPoint({
        blobs: [method, isbn, success ? 'success' : 'failure'],
        doubles: [duration],
        indexes: ['import_metrics'],
      })
    } catch (error) {
      console.warn('[FeatureFlags] Failed to write to Analytics Engine:', error)
    }
  }

  console.log('[FeatureFlags] Import metrics:', metric)
}
