/**
 * Common utilities for V3 job management
 *
 * Provides shared helpers for Durable Object access and authentication
 *
 * @module api-v3/jobs/common
 */

import type { Job, JobStatus, JobType } from '@bookstrack/schemas'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import type { Env } from '../../types/env'

/**
 * JobStateManagerDO Interface
 *
 * Type-safe interface for JobStateManagerDO methods
 * Note: Auth token management is handled by WebSocketConnectionDO (separation of concerns)
 * CRITICAL: Keep in sync with src/types/durable-objects.ts and actual DO implementation
 */
export interface JobStateManagerDO {
  initializeJobState(jobId: string, type: string, totalCount: number): Promise<{ success: boolean }>
  updateProgress(progress: number, processedCount: number): Promise<void>
  getJobState(): Promise<any>
  complete(results?: any): Promise<void>
  sendError(
    pipeline: string,
    error: {
      code: string
      message: string
      retryable?: boolean
      details?: Record<string, unknown>
    },
  ): Promise<{ success: boolean }>
  // REQUIRED methods (not optional!) - alarm-based processing
  scheduleCSVProcessing(csvText: string, jobId: string): Promise<{ success: boolean }>
  scheduleBookshelfScanProcessing(
    scanImageR2Keys: string[],
    jobId: string,
  ): Promise<{ success: boolean }>
  scheduleBatchEnrichmentProcessing(
    isbns: string[],
    options: { includeEmbedding: boolean },
    jobId: string,
  ): Promise<{ success: boolean }>
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
  env: Env,
): DurableObjectStub & JobStateManagerDO {
  const doId = env.JOB_STATE_MANAGER_DO.idFromName(jobId)
  return env.JOB_STATE_MANAGER_DO.get(doId) as unknown as DurableObjectStub & JobStateManagerDO
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
  env: Env,
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
 *   return c.json(createProblemDetails('UNAUTHORIZED', 'Invalid token format'), 401)
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
  return Number.isNaN(parsed) ? null : parsed
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
 * All hrefs are full URLs per LinkSchema (z.string().url())
 *
 * @param jobType - Job type (imports, scans, enrichment)
 * @param jobId - Unique job identifier
 * @param streamUrl - SSE stream URL (used to derive base URL)
 * @returns HATEOAS _links object conforming to LinkSchema
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
  // Extract base URL from streamUrl (e.g., https://api.oooefam.net)
  const url = new URL(streamUrl)
  const baseUrl = `${url.protocol}//${url.host}`

  return {
    self: {
      href: `${baseUrl}/v3/jobs/${jobType}/${jobId}`,
      rel: 'self',
      method: 'GET' as const,
    },
    stream: {
      href: streamUrl,
      rel: 'related',
      method: 'GET' as const,
    },
    cancel: {
      href: `${baseUrl}/v3/jobs/${jobType}/${jobId}`,
      rel: 'related',
      method: 'DELETE' as const,
    },
  }
}

/**
 * Map pipeline type from DO storage to JobType enum
 *
 * DO stores: 'csv_import', 'ai_scan', 'batch_enrichment'
 * Schema expects: 'csv_import', 'bookshelf_scan', 'batch_enrichment'
 */
function mapPipelineToJobType(pipeline: string): JobType {
  const mapping: Record<string, JobType> = {
    csv_import: 'csv_import',
    ai_scan: 'bookshelf_scan',
    batch_enrichment: 'batch_enrichment',
    enrichment: 'batch_enrichment',
  }
  return mapping[pipeline] || 'csv_import'
}

/**
 * Map DO status to JobStatus enum
 *
 * DO stores: 'initialized', 'processing', 'completed', 'failed'
 * Schema expects: 'queued', 'processing', 'completed', 'failed', 'canceled'
 */
function mapStatus(status: string): JobStatus {
  if (status === 'initialized') return 'queued'
  return status as JobStatus
}

/**
 * Transform DO job state to schema-compliant Job object
 *
 * Handles:
 * - pipeline → type mapping
 * - status normalization (initialized → queued)
 * - Unix timestamp → ISO 8601 string conversion
 *
 * @param state - Raw state from JobStateManagerDO.getJobState()
 * @returns Schema-compliant Job object
 *
 * @example
 * ```typescript
 * const state = await doStub.getJobState()
 * const job = mapDOStateToJob(state)
 * return c.json({ success: true, data: job })
 * ```
 */
export function mapDOStateToJob(state: any): Job {
  return {
    jobId: state.jobId,
    type: mapPipelineToJobType(state.pipeline || state.type),
    status: mapStatus(state.status),
    progress: state.progress ?? 0,
    processedCount: state.processedCount ?? 0,
    totalCount: state.totalCount ?? 0,
    startTime:
      typeof state.startTime === 'number'
        ? new Date(state.startTime).toISOString()
        : state.startTime,
    completedTime: state.completedTime
      ? typeof state.completedTime === 'number'
        ? new Date(state.completedTime).toISOString()
        : state.completedTime
      : undefined,
    error: state.error,
  }
}

/**
 * Fetch full job results from KV storage
 *
 * Used when large payloads (e.g. books array) are stripped from DO storage
 * to avoid the 128KB limit. Reconstructs the full completion payload.
 *
 * @param jobId - Job identifier
 * @param pipeline - Pipeline type
 * @param env - Worker environment
 * @returns Array of book objects (or empty array if not found)
 */
export async function fetchJobResults(jobId: string, pipeline: string, env: Env): Promise<any[]> {
  // TODO: Use CanonicalBook[] type when available
  let resultKey = ''
  let resultProperty = ''

  if (pipeline === 'ai_scan' || pipeline === 'bookshelf_scan') {
    resultKey = `scan-results:${jobId}`
    resultProperty = 'books'
  } else if (pipeline === 'csv_import') {
    resultKey = `csv-results:${jobId}`
    resultProperty = 'books'
  } else if (pipeline === 'enrichment' || pipeline === 'batch_enrichment') {
    resultKey = `enrichment-results:${jobId}`
    resultProperty = 'enrichedBooks'
  }

  if (!resultKey) return []

  try {
    const result: any = await env.CACHE.get(resultKey, 'json')
    if (result && Array.isArray(result[resultProperty])) {
      return result[resultProperty]
    }
    if (result) {
      console.warn(
        `[fetchJobResults] Result found but ${resultProperty} is not an array for ${jobId}. Keys: ${Object.keys(result).join(', ')}`,
      )
    }
  } catch (e) {
    console.error(`[fetchJobResults] Failed to fetch results for ${jobId}:`, e)
  }
  return []
}
