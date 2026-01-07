// src/utils/csv-ab-testing.ts
// A/B Testing Integration for CSV Import Jobs

import type { GeminiCSVModel } from '../config/gemini-models'
import { selectModelForUser } from '../config/gemini-models'
import type { CSVParseABTestEvent } from '../types/analytics'
import type { Env } from '../types/env'

/**
 * Get A/B test configuration from environment
 */
export function getABTestConfig(env: Env): {
  abTestPercent: number
  telemetryEnabled: boolean
} {
  const abTestPercent = Number.parseInt(env.CSV_MODEL_AB_TEST_PERCENT || '0', 10)
  const telemetryEnabled = env.ENABLE_CSV_AB_TELEMETRY === 'true'

  return {
    abTestPercent: Math.max(0, Math.min(100, abTestPercent)), // Clamp to 0-100
    telemetryEnabled,
  }
}

/**
 * Select Gemini model for CSV parsing based on A/B test configuration
 *
 * @param userId - User ID for consistent bucketing
 * @param env - Environment with feature flags
 * @returns Selected model variant
 */
export function selectCSVModel(userId: string, env: Env): GeminiCSVModel {
  const { abTestPercent } = getABTestConfig(env)
  return selectModelForUser(userId, abTestPercent)
}

/**
 * Log A/B test telemetry to Analytics Engine
 *
 * @param env - Environment with Analytics Engine binding
 * @param event - Telemetry event to log
 */
export function logABTestEvent(env: Env, event: CSVParseABTestEvent): void {
  const { telemetryEnabled } = getABTestConfig(env)

  if (!telemetryEnabled) {
    return
  }

  // Log to console for debugging
  console.log('[CSV A/B Test]', JSON.stringify(event, null, 2))

  // Log to Analytics Engine for aggregation
  if (env.AI_ANALYTICS) {
    env.AI_ANALYTICS.writeDataPoint({
      blobs: [
        event.type,
        event.model,
        event.jobId,
        event.userId,
        event.success ? 'success' : 'failure',
      ],
      doubles: [
        event.performance.durationMs,
        event.performance.apiLatencyMs,
        event.results.validBooks,
        event.results.validationErrors,
        event.results.errorRate,
        event.tokenUsage.promptTokens,
        event.tokenUsage.outputTokens,
        event.tokenUsage.totalTokens,
        event.csvMetadata.sizeBytes,
        event.csvMetadata.estimatedRows,
      ],
      indexes: [event.model], // Index by model for easy querying
    })
  }
}

/**
 * Get A/B test summary for analysis
 *
 * Returns current rollout configuration and status
 */
export function getABTestSummary(env: Env): {
  enabled: boolean
  rolloutPercent: number
  telemetryEnabled: boolean
  modelDistribution: string
} {
  const { abTestPercent, telemetryEnabled } = getABTestConfig(env)

  let modelDistribution = ''
  if (abTestPercent === 0) {
    modelDistribution = '100% baseline (gemini-2.5-flash)'
  } else if (abTestPercent === 100) {
    modelDistribution = '33.3% baseline, 33.3% gemini-3-flash-preview, 33.3% gemini-2.5-flash-lite'
  } else {
    const baselinePercent = 100 - abTestPercent
    const variantPercent = abTestPercent / 2
    modelDistribution = `${baselinePercent}% baseline, ${variantPercent}% gemini-3-flash-preview, ${variantPercent}% gemini-2.5-flash-lite`
  }

  return {
    enabled: abTestPercent > 0,
    rolloutPercent: abTestPercent,
    telemetryEnabled,
    modelDistribution,
  }
}
