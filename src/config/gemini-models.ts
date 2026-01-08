// src/config/gemini-models.ts
// A/B Testing Configuration for Gemini CSV Parsing Models

/**
 * Supported Gemini models for CSV parsing A/B tests
 */
export type GeminiCSVModel = 'gemini-2.5-flash' | 'gemini-3-flash-preview' | 'gemini-2.5-flash-lite'

/**
 * Model configuration for A/B testing
 */
export interface GeminiModelConfig {
  /** Model identifier for API endpoint */
  modelId: string
  /** Display name for analytics */
  displayName: string
  /** Context window size in tokens */
  contextWindow: number
  /** Expected performance characteristics */
  characteristics: {
    speed: 'ultra-fast' | 'fast' | 'moderate'
    accuracy: 'high' | 'very-high' | 'excellent'
    cost: 'low' | 'medium' | 'high'
  }
  /** Recommended timeout in milliseconds */
  recommendedTimeout: number
}

/**
 * Model configurations for A/B testing
 *
 * UPDATED: Jan 8, 2026 - gemini-2.5-flash deprecated due to JSON reliability issues
 * Current baseline: gemini-3-flash-preview (addresses "syntax hallucinations and failure loops")
 */
export const GEMINI_MODEL_CONFIGS: Record<GeminiCSVModel, GeminiModelConfig> = {
  'gemini-2.5-flash': {
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash (DEPRECATED)',
    contextWindow: 1_000_000,
    characteristics: {
      speed: 'fast',
      accuracy: 'high',
      cost: 'medium',
    },
    recommendedTimeout: 90_000,
    // DEPRECATED: 83% failure rate with JSON truncation errors
    // Kept for backwards compatibility only - DO NOT USE
  },
  'gemini-3-flash-preview': {
    modelId: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash Preview',
    contextWindow: 1_000_000,
    characteristics: {
      speed: 'fast',
      accuracy: 'excellent', // Improved JSON reliability vs 2.5-flash
      cost: 'high',
    },
    recommendedTimeout: 90_000,
    // DEFAULT BASELINE: Addresses JSON reliability issues
  },
  'gemini-2.5-flash-lite': {
    modelId: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    contextWindow: 1_000_000,
    characteristics: {
      speed: 'ultra-fast',
      accuracy: 'high',
      cost: 'low',
    },
    recommendedTimeout: 60_000, // Lower timeout for faster model
    // VARIANT A: Cost optimization candidate
  },
}

/**
 * Get model configuration by name
 */
export function getModelConfig(model: GeminiCSVModel): GeminiModelConfig {
  return GEMINI_MODEL_CONFIGS[model]
}

/**
 * Get API endpoint for a specific model
 */
export function getModelEndpoint(model: GeminiCSVModel): string {
  const config = getModelConfig(model)
  return `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:generateContent`
}

/**
 * Select model based on A/B test percentage
 *
 * Distribution (controlled by CSV_MODEL_AB_TEST_PERCENT):
 * - 0%: 100% baseline (gemini-3-flash-preview) - UPDATED Jan 8, 2026
 * - 50%: 50% baseline, 50% variant A (gemini-2.5-flash-lite)
 * - 100%: 50% baseline, 50% variant A (full A/B test)
 *
 * NOTE: gemini-2.5-flash REMOVED from testing due to JSON reliability issues
 * (83% failure rate with "Unterminated string in JSON" errors).
 * See issue #253 for details.
 *
 * @param userId - User ID or session ID for consistent bucketing
 * @param abTestPercent - A/B test rollout percentage (0-100)
 * @returns Selected model for this user
 */
export function selectModelForUser(userId: string, abTestPercent: number): GeminiCSVModel {
  // Disabled: Use baseline only (gemini-3-flash-preview for reliability)
  if (abTestPercent === 0) {
    return 'gemini-3-flash-preview'
  }

  // Partial/Full rollout: A/B test between baseline and lite variant
  const hash = hashString(userId)
  const bucket = hash % 100

  // At 100% rollout: 50/50 split between baseline and lite
  if (abTestPercent === 100) {
    return bucket < 50 ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-lite'
  }

  // Partial rollout: First X% get lite variant, rest get baseline
  // Example: 10% rollout = 10% lite, 90% baseline
  if (bucket < abTestPercent) {
    return 'gemini-2.5-flash-lite'
  }

  // Remaining users get baseline (gemini-3-flash-preview for reliability)
  return 'gemini-3-flash-preview'
}

/**
 * Simple string hash function for consistent bucketing
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
