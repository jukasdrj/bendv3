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
 */
export const GEMINI_MODEL_CONFIGS: Record<GeminiCSVModel, GeminiModelConfig> = {
  'gemini-2.5-flash': {
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_000_000,
    characteristics: {
      speed: 'fast',
      accuracy: 'high',
      cost: 'medium',
    },
    recommendedTimeout: 90_000, // Current production timeout
  },
  'gemini-3-flash-preview': {
    modelId: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash Preview',
    contextWindow: 1_000_000,
    characteristics: {
      speed: 'fast',
      accuracy: 'excellent',
      cost: 'high',
    },
    recommendedTimeout: 90_000, // Same as baseline for fair comparison
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
 * - 0%: 100% baseline (gemini-2.5-flash)
 * - 50%: 50% baseline, 25% variant A, 25% variant B
 * - 100%: 33.3% each variant (full A/B/C test)
 *
 * @param userId - User ID or session ID for consistent bucketing
 * @param abTestPercent - A/B test rollout percentage (0-100)
 * @returns Selected model for this user
 */
export function selectModelForUser(userId: string, abTestPercent: number): GeminiCSVModel {
  // Disabled: Use baseline only
  if (abTestPercent === 0) {
    return 'gemini-2.5-flash'
  }

  // Full rollout: 100% A/B/C test (33.3% each variant)
  if (abTestPercent === 100) {
    const hash = hashString(userId)
    const bucket = hash % 3
    if (bucket === 0) return 'gemini-2.5-flash'
    if (bucket === 1) return 'gemini-3-flash-preview'
    return 'gemini-2.5-flash-lite'
  }

  // Partial rollout: Gradual A/B test introduction
  // Example: 50% rollout = 50% baseline, 25% variant A, 25% variant B
  const hash = hashString(userId)
  const bucket = hash % 100

  // First X% get variants (split between A and B)
  if (bucket < abTestPercent) {
    const variantBucket = (hash % 10) % 2 // 50/50 split between variants
    return variantBucket === 0 ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-lite'
  }

  // Remaining users get baseline
  return 'gemini-2.5-flash'
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
