/**
 * Capabilities endpoint Zod schemas
 * Phase 1.4 - POC Migration: /api/v2/capabilities
 */

import { z } from 'zod'
import { ResponseEnvelopeSchema } from './common'

// ============================================================================
// Feature Capability Schema
// ============================================================================

export const RateLimitSchema = z.object({
  requests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
})

export const FeatureCapabilitySchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  version: z.string(),
  endpoints: z.array(z.string()),
  rateLimit: RateLimitSchema.optional(),
  notes: z.string().optional(),
})

// ============================================================================
// Capabilities Response Schema
// ============================================================================

export const DeprecationSchema = z.object({
  endpoint: z.string(),
  sunsetDate: z.string(),
  replacement: z.string(),
})

export const LimitsSchema = z.object({
  maxBatchSize: z.number().int().positive(),
  maxCsvRows: z.number().int().positive(),
  maxImageSizeMb: z.number().int().positive(),
  maxConcurrentJobs: z.number().int().positive(),
})

export const CapabilitiesDataSchema = z.object({
  apiVersion: z.string(),
  features: z.array(FeatureCapabilitySchema),
  limits: LimitsSchema,
  deprecations: z.array(DeprecationSchema),
})

// ============================================================================
// Full Response Envelope
// ============================================================================

export const CapabilitiesResponseSchema = ResponseEnvelopeSchema(CapabilitiesDataSchema)

// ============================================================================
// TypeScript Types (exported for use in handlers)
// ============================================================================

export type FeatureCapability = z.infer<typeof FeatureCapabilitySchema>
export type CapabilitiesData = z.infer<typeof CapabilitiesDataSchema>
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>
