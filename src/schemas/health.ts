/**
 * Health Check Endpoint Zod Schemas
 *
 * Schemas for the GET /health endpoint.
 * Simple health check with no query parameters and static response data.
 *
 * Sprint 1, Day 5 - OpenAPI Fast Track Migration
 *
 * @module schemas/health
 */

import { z } from 'zod'
import { ResponseEnvelopeSchema } from './common'

// ============================================================================
// QUERY PARAMETER SCHEMAS
// ============================================================================

/**
 * Health Check Query Parameters
 *
 * No query parameters needed for health check.
 * Use empty object to match OpenAPI pattern.
 */
export const HealthQuerySchema = z.object({}).strict()

// ============================================================================
// RESPONSE DATA SCHEMAS
// ============================================================================

/**
 * Health Check Response Data Schema
 *
 * Canonical response format for GET /health endpoint.
 * Returns basic worker information and status.
 *
 * @example
 * ```json
 * {
 *   "status": "ok",
 *   "worker": "api-worker",
 *   "version": "2.1.0",
 *   "router": "hono"
 * }
 * ```
 */
export const HealthDataSchema = z.object({
  status: z.literal('ok').describe('Health status indicator'),
  worker: z.string().describe('Worker service name'),
  version: z.string().describe('API version'),
  router: z.literal('hono').describe('Router framework')
}).strict()

/**
 * Health Check Response Metadata Schema
 *
 * Includes timestamp for health check responses.
 */
export const HealthResponseMetadataSchema = z.object({
  timestamp: z.string().datetime().describe('ISO 8601 timestamp')
}).strict()

/**
 * Health Check Success Response Schema
 *
 * Complete ResponseEnvelope for successful health checks.
 * Uses generic ResponseEnvelopeSchema factory with HealthDataSchema.
 */
export const HealthSuccessResponseSchema = z.object({
  data: HealthDataSchema,
  metadata: HealthResponseMetadataSchema.optional()
}).strict()

// ============================================================================
// RESPONSE SCHEMAS (Full Envelope)
// ============================================================================

/**
 * Health Check Response Schema (Alternative pattern)
 *
 * Can be used with ErrorResponseSchema for discriminated unions if needed.
 */
export const HealthResponseSchema = ResponseEnvelopeSchema(HealthDataSchema)

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type HealthQuery = z.infer<typeof HealthQuerySchema>
export type HealthData = z.infer<typeof HealthDataSchema>
export type HealthResponseMetadata = z.infer<typeof HealthResponseMetadataSchema>
export type HealthSuccessResponse = z.infer<typeof HealthSuccessResponseSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
