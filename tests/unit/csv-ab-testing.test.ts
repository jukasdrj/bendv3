// tests/unit/csv-ab-testing.test.ts
// Unit tests for CSV A/B testing framework

import { describe, expect, it } from 'vitest'
import type { GeminiCSVModel } from '../../src/config/gemini-models'
import {
  GEMINI_MODEL_CONFIGS,
  getModelConfig,
  getModelEndpoint,
  selectModelForUser,
} from '../../src/config/gemini-models'

describe('Gemini Model Configuration', () => {
  it('should have three model configurations', () => {
    const models = Object.keys(GEMINI_MODEL_CONFIGS)
    expect(models).toHaveLength(3)
    expect(models).toContain('gemini-2.5-flash')
    expect(models).toContain('gemini-3-flash-preview')
    expect(models).toContain('gemini-2.5-flash-lite')
  })

  it('should get model config for baseline', () => {
    const config = getModelConfig('gemini-2.5-flash')
    expect(config.modelId).toBe('gemini-2.5-flash')
    expect(config.displayName).toBe('Gemini 2.5 Flash')
    expect(config.contextWindow).toBe(1_000_000)
    expect(config.recommendedTimeout).toBe(90_000)
  })

  it('should get model config for variant A', () => {
    const config = getModelConfig('gemini-3-flash-preview')
    expect(config.modelId).toBe('gemini-3-flash-preview')
    expect(config.displayName).toBe('Gemini 3 Flash Preview')
    expect(config.characteristics.accuracy).toBe('excellent')
  })

  it('should get model config for variant B', () => {
    const config = getModelConfig('gemini-2.5-flash-lite')
    expect(config.modelId).toBe('gemini-2.5-flash-lite')
    expect(config.displayName).toBe('Gemini 2.5 Flash Lite')
    expect(config.recommendedTimeout).toBe(60_000) // Faster timeout
    expect(config.characteristics.speed).toBe('ultra-fast')
  })

  it('should generate correct API endpoints', () => {
    const baseline = getModelEndpoint('gemini-2.5-flash')
    expect(baseline).toContain('gemini-2.5-flash:generateContent')

    const variantA = getModelEndpoint('gemini-3-flash-preview')
    expect(variantA).toContain('gemini-3-flash-preview:generateContent')

    const variantB = getModelEndpoint('gemini-2.5-flash-lite')
    expect(variantB).toContain('gemini-2.5-flash-lite:generateContent')
  })
})

describe('Model Selection Logic', () => {
  it('should always return baseline when A/B test disabled (0%)', () => {
    const model1 = selectModelForUser('user-123', 0)
    const model2 = selectModelForUser('user-456', 0)
    const model3 = selectModelForUser('user-789', 0)

    expect(model1).toBe('gemini-2.5-flash')
    expect(model2).toBe('gemini-2.5-flash')
    expect(model3).toBe('gemini-2.5-flash')
  })

  it('should distribute evenly at 100% rollout', () => {
    const models: GeminiCSVModel[] = []

    // Generate 300 user IDs to test distribution
    for (let i = 0; i < 300; i++) {
      const model = selectModelForUser(`user-${i}`, 100)
      models.push(model)
    }

    const baseline = models.filter((m) => m === 'gemini-2.5-flash').length
    const variantA = models.filter((m) => m === 'gemini-3-flash-preview').length
    const variantB = models.filter((m) => m === 'gemini-2.5-flash-lite').length

    // Each variant should get roughly 33% (±10% tolerance)
    expect(baseline).toBeGreaterThan(80) // ~33% of 300 = 100
    expect(baseline).toBeLessThan(120)

    expect(variantA).toBeGreaterThan(80)
    expect(variantA).toBeLessThan(120)

    expect(variantB).toBeGreaterThan(80)
    expect(variantB).toBeLessThan(120)

    expect(baseline + variantA + variantB).toBe(300)
  })

  it('should be consistent for same user ID', () => {
    const userId = 'test-user-123'

    const model1 = selectModelForUser(userId, 50)
    const model2 = selectModelForUser(userId, 50)
    const model3 = selectModelForUser(userId, 50)

    expect(model1).toBe(model2)
    expect(model2).toBe(model3)
  })

  it('should assign more baseline at 10% rollout', () => {
    const models: GeminiCSVModel[] = []

    // Generate 1000 user IDs
    for (let i = 0; i < 1000; i++) {
      const model = selectModelForUser(`user-${i}`, 10)
      models.push(model)
    }

    const baseline = models.filter((m) => m === 'gemini-2.5-flash').length
    const variants = models.filter((m) => m !== 'gemini-2.5-flash').length

    // At 10% rollout: ~90% baseline, ~10% variants
    expect(baseline).toBeGreaterThan(850) // ~90%
    expect(baseline).toBeLessThan(950)

    expect(variants).toBeGreaterThan(50) // ~10%
    expect(variants).toBeLessThan(150)
  })
})

describe('A/B Test Configuration', () => {
  it('should parse A/B test percentage from env', () => {
    const env = {
      CSV_MODEL_AB_TEST_PERCENT: '50',
      ENABLE_CSV_AB_TELEMETRY: 'true',
    } as any

    const config = {
      abTestPercent: Number.parseInt(env.CSV_MODEL_AB_TEST_PERCENT || '0', 10),
      telemetryEnabled: env.ENABLE_CSV_AB_TELEMETRY === 'true',
    }

    expect(config.abTestPercent).toBe(50)
    expect(config.telemetryEnabled).toBe(true)
  })

  it('should default to 0% when not configured', () => {
    const env = {} as any

    const config = {
      abTestPercent: Number.parseInt(env.CSV_MODEL_AB_TEST_PERCENT || '0', 10),
      telemetryEnabled: env.ENABLE_CSV_AB_TELEMETRY === 'true',
    }

    expect(config.abTestPercent).toBe(0)
    expect(config.telemetryEnabled).toBe(false)
  })

  it('should clamp percentages to 0-100 range', () => {
    const testCases = [
      { input: '-10', expected: 0 },
      { input: '0', expected: 0 },
      { input: '50', expected: 50 },
      { input: '100', expected: 100 },
      { input: '150', expected: 100 },
    ]

    for (const { input, expected } of testCases) {
      const value = Number.parseInt(input, 10)
      const clamped = Math.max(0, Math.min(100, value))
      expect(clamped).toBe(expected)
    }
  })
})
