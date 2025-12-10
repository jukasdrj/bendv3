/**
 * Capabilities endpoint Zod schemas
 * V3 iOS-compatible flat format
 */

import { z } from 'zod'

// ============================================================================
// Capabilities Features Schema (iOS-compatible)
// ============================================================================

export const CapabilitiesFeaturesSchema = z.object({
  semantic_search: z.boolean().describe('Semantic search enabled'),
  similar_books: z.boolean().describe('Similar books search enabled'),
  weekly_recommendations: z.boolean().describe('Weekly recommendations enabled'),
  sse_streaming: z.boolean().describe('SSE streaming enabled'),
  batch_enrichment: z.boolean().describe('Batch enrichment enabled'),
  csv_import: z.boolean().describe('CSV import enabled'),
})

// ============================================================================
// Capabilities Limits Schema (iOS-compatible)
// ============================================================================

export const CapabilitiesLimitsSchema = z.object({
  semantic_search_rpm: z.number().int().describe('Semantic search requests per minute'),
  text_search_rpm: z.number().int().describe('Text search requests per minute'),
  csv_max_rows: z.number().int().describe('Maximum rows in CSV import'),
  batch_max_photos: z.number().int().describe('Maximum photos in batch scan'),
})

// ============================================================================
// Capabilities Response Schema (flat, no wrapper)
// ============================================================================

export const CapabilitiesResponseSchema = z.object({
  features: CapabilitiesFeaturesSchema.describe('Available API features'),
  limits: CapabilitiesLimitsSchema.describe('API limits and quotas'),
  version: z.string().describe('API version'),
})

// ============================================================================
// TypeScript Types
// ============================================================================

export type CapabilitiesFeatures = z.infer<typeof CapabilitiesFeaturesSchema>
export type CapabilitiesLimits = z.infer<typeof CapabilitiesLimitsSchema>
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>
