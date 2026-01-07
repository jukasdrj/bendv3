// src/types/analytics.ts
// Analytics event types for A/B testing and telemetry

import type { GeminiCSVModel } from '../config/gemini-models'

/**
 * CSV parsing A/B test telemetry event
 */
export interface CSVParseABTestEvent {
  /** Event type identifier */
  type: 'CSV_AB_TEST'

  /** Job ID for correlation */
  jobId: string

  /** User ID for bucketing */
  userId: string

  /** Selected model variant */
  model: GeminiCSVModel

  /** CSV file characteristics */
  csvMetadata: {
    sizeBytes: number
    estimatedRows: number
  }

  /** Parsing performance metrics */
  performance: {
    /** Total parsing duration in milliseconds */
    durationMs: number

    /** API response time in milliseconds */
    apiLatencyMs: number

    /** Cache hit or miss */
    cacheHit: boolean
  }

  /** Parsing results quality metrics */
  results: {
    /** Number of successfully parsed books */
    validBooks: number

    /** Number of validation errors */
    validationErrors: number

    /** Error rate (errors / total rows) */
    errorRate: number
  }

  /** Token usage from Gemini API */
  tokenUsage: {
    promptTokens: number
    outputTokens: number
    totalTokens: number
  }

  /** Success or failure indicator */
  success: boolean

  /** Error message if failed */
  errorMessage?: string

  /** Timestamp of the event */
  timestamp: string
}

/**
 * Aggregated A/B test metrics for analysis
 */
export interface CSVModelMetrics {
  model: GeminiCSVModel
  totalRuns: number
  successRate: number
  averageLatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  averageErrorRate: number
  averageTokensUsed: number
  cacheHitRate: number
}
