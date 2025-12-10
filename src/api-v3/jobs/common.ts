/**
 * Common utilities for V3 job management
 *
 * Provides shared helpers for Durable Object access and authentication
 *
 * @module api-v3/jobs/common
 */

import type { Env } from '../../types/env'
import type { DurableObjectStub } from '@cloudflare/workers-types'

/**
 * JobStateManagerDO Interface
 *
 * Type-safe interface for JobStateManagerDO methods
 * Note: Auth token management is handled by WebSocketConnectionDO (separation of concerns)
 */
export interface JobStateManagerDO {
  initializeJobState(jobId: string, type: string, totalCount: number): Promise<void>
  updateProgress(progress: number, processedCount: number): Promise<void>
  getJobState(): Promise<any>
  complete(results?: any): Promise<void>
  sendError(error: { code: string; message: string; retryable?: boolean }): Promise<void>
  scheduleCSVProcessing?(csvText: string, jobId: string): Promise<void>
  scheduleBookshelfScan?(images: any[], jobId: string): Promise<void>
  scheduleEnrichment?(isbns: string[], includeEmbedding: boolean, jobId: string): Promise<void>
}

/**
 * WebSocketConnectionDO Interface
 *
 * Type-safe interface for WebSocketConnectionDO auth methods
 * This DO handles connection-level authentication (SSE/WebSocket streams)
 */
export interface WebSocketConnectionDO {
  setAuthToken(token: string, pipeline?: string | null): Promise<{ success: boolean }>
  validateAuthToken(token: string | undefined): Promise<{ valid: boolean; expired?: boolean }>
}

/**
 * Get JobStateManagerDO stub by job ID
 *
 * Uses idFromName for deterministic DO routing (same jobId → same DO instance)
 *
 * @param jobId - Unique job identifier (UUID)
 * @param env - Cloudflare Workers environment bindings
 * @returns Durable Object stub for job state management
 *
 * @example
 * ```typescript
 * const doStub = getJobStateManagerDO('550e8400-e29b-41d4-a716-446655440000', env)
 * await doStub.initializeJobState(jobId, 'csv_import', 100)
 * ```
 */
export function getJobStateManagerDO(
  jobId: string,
  env: Env
): DurableObjectStub & JobStateManagerDO {
  const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  return env.JOB_STATE_MANAGER_DO.get(doId) as DurableObjectStub & JobStateManagerDO
}

/**
 * Get WebSocketConnectionDO stub by job ID
 *
 * Uses idFromName for deterministic DO routing (same jobId → same DO instance)
 * This DO handles auth token management for SSE/WebSocket streams
 *
 * @param jobId - Unique job identifier (UUID)
 * @param env - Cloudflare Workers environment bindings
 * @returns Durable Object stub for WebSocket connection management
 *
 * @example
 * ```typescript
 * const wsDoStub = getWebSocketConnectionDO('550e8400-e29b-41d4-a716-446655440000', env)
 * await wsDoStub.setAuthToken(token, 'csv_import')
 * ```
 */
export function getWebSocketConnectionDO(
  jobId: string,
  env: Env
): DurableObjectStub & WebSocketConnectionDO {
  const doId = env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
  return env.WEBSOCKET_CONNECTION_DO.get(doId) as DurableObjectStub & WebSocketConnectionDO
}

/**
 * Generate cryptographically secure authentication token
 *
 * Used for SSE stream authentication (Bearer token)
 * Token is 64 hex characters (32 bytes of entropy)
 *
 * @returns 64-character hex token
 *
 * @example
 * ```typescript
 * const token = generateAuthToken()
 * // => "a1b2c3d4e5f6..."
 *
 * const wsDoStub = getWebSocketConnectionDO(jobId, env)
 * await wsDoStub.setAuthToken(token, 'csv_import')
 * ```
 */
export function generateAuthToken(): string {
  const array = new Uint8Array(32) // 32 bytes = 256 bits of entropy
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate auth token format
 *
 * Checks token is 64 hex characters (client-side validation)
 * Actual authorization happens in JobStateManagerDO
 *
 * @param token - Auth token to validate
 * @returns true if format is valid
 *
 * @example
 * ```typescript
 * const token = c.req.header('Authorization')?.replace('Bearer ', '')
 * if (!validateTokenFormat(token)) {
 *   return c.json({ error: 'Invalid token format' }, 401)
 * }
 * ```
 */
export function validateTokenFormat(token: string | undefined): boolean {
  if (!token) return false
  return /^[0-9a-f]{64}$/.test(token)
}

/**
 * Parse SSE Last-Event-ID header
 *
 * Supports browser-native reconnection with event ID
 *
 * @param lastEventId - Last-Event-ID header value
 * @returns Parsed event ID number, or null if invalid
 *
 * @example
 * ```typescript
 * const lastEventId = c.req.header('Last-Event-ID')
 * const resumeFrom = parseLastEventId(lastEventId)
 *
 * if (resumeFrom !== null) {
 *   // Resume stream from event ID
 * }
 * ```
 */
export function parseLastEventId(lastEventId: string | undefined): number | null {
  if (!lastEventId) return null
  const parsed = parseInt(lastEventId, 10)
  return isNaN(parsed) ? null : parsed
}

/**
 * Build SSE stream URL
 *
 * Constructs full SSE endpoint URL from request
 *
 * @param baseUrl - Request base URL (from c.req.url)
 * @param jobType - Job type (imports, scans, enrichment)
 * @param jobId - Unique job identifier
 * @returns Full SSE stream URL
 *
 * @example
 * ```typescript
 * const streamUrl = buildStreamUrl(
 *   c.req.url,
 *   'imports',
 *   '550e8400-e29b-41d4-a716-446655440000'
 * )
 * // => "https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream"
 * ```
 */
export function buildStreamUrl(baseUrl: string, jobType: string, jobId: string): string {
  const url = new URL(baseUrl)
  return `https://${url.host}/v3/jobs/${jobType}/${jobId}/stream`
}

/**
 * Create HATEOAS links for job resources
 *
 * Provides hypermedia links for job status, stream, and cancel
 *
 * @param jobType - Job type (imports, scans, enrichment)
 * @param jobId - Unique job identifier
 * @param streamUrl - SSE stream URL
 * @returns HATEOAS _links object
 *
 * @example
 * ```typescript
 * const links = createJobLinks('imports', jobId, streamUrl)
 * return c.json({
 *   success: true,
 *   data: { jobId, status: 'queued', streamUrl },
 *   _links: links
 * })
 * ```
 */
export function createJobLinks(jobType: string, jobId: string, streamUrl: string) {
  return {
    self: {
      href: `/v3/jobs/${jobType}/${jobId}`,
      rel: 'self',
      method: 'GET'
    },
    stream: {
      href: streamUrl,
      rel: 'related',
      method: 'GET',
      type: 'text/event-stream'
    },
    cancel: {
      href: `/v3/jobs/${jobType}/${jobId}`,
      rel: 'related',
      method: 'DELETE'
    }
  }
}
