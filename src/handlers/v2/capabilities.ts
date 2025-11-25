/**
 * V2 Capabilities Handler
 *
 * Sprint 3: Feature Discovery API (API_CONTRACT_V2_PROPOSAL.md)
 *
 * GET /api/v2/capabilities - Returns available features and their status
 *
 * Allows iOS client to dynamically discover available features
 * without hardcoding API availability.
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md
 */

import type { Env } from '../../types/env'
import {
  createSuccessResponse,
} from '../../utils/response-builder'

// ============================================================================
// Types
// ============================================================================

export interface FeatureCapability {
  name: string
  enabled: boolean
  version: string
  endpoints: string[]
  rateLimit?: {
    requests: number
    windowMs: number
  }
  notes?: string
}

export interface CapabilitiesResponse {
  apiVersion: string
  features: FeatureCapability[]
  limits: {
    maxBatchSize: number
    maxCsvRows: number
    maxImageSizeMb: number
    maxConcurrentJobs: number
  }
  deprecations: Array<{
    endpoint: string
    sunsetDate: string
    replacement: string
  }>
}

// ============================================================================
// Handler
// ============================================================================

/**
 * GET /api/v2/capabilities
 *
 * Returns comprehensive feature availability and configuration.
 * Clients should call this on app startup to discover available features.
 *
 * @example
 * GET /api/v2/capabilities
 */
export async function handleCapabilities(
  request: Request,
  env: Env
): Promise<Response> {
  // Check which features are available based on environment bindings
  const hasVectorize = !!(env as unknown as { BOOK_VECTORS?: unknown }).BOOK_VECTORS
  const hasWorkersAI = !!env.AI
  const hasRecommendationsCache = !!(env as unknown as { RECOMMENDATIONS_CACHE?: unknown }).RECOMMENDATIONS_CACHE || !!env.KV_CACHE
  const hasEnrichmentQueue = !!(env as unknown as { ENRICHMENT_QUEUE?: unknown }).ENRICHMENT_QUEUE

  const capabilities: CapabilitiesResponse = {
    apiVersion: '2.1.0',
    features: [
      // Core Search Features
      {
        name: 'text_search',
        enabled: true,
        version: '1.0.0',
        endpoints: [
          'GET /api/v2/search?mode=text',
          'GET /v1/search/title',
          'GET /v1/search/isbn',
          'GET /v1/search/advanced',
        ],
        rateLimit: { requests: 100, windowMs: 60000 },
      },
      {
        name: 'semantic_search',
        enabled: hasVectorize && hasWorkersAI,
        version: '1.0.0',
        endpoints: [
          'GET /api/v2/search?mode=semantic',
          'GET /v1/search/semantic',
          'GET /v1/search/similar',
        ],
        rateLimit: { requests: 5, windowMs: 60000 },
        notes: hasVectorize
          ? 'Powered by Workers AI BGE-M3 embeddings + Cloudflare Vectorize'
          : 'Vectorize index not yet provisioned',
      },

      // Import Features
      {
        name: 'csv_import',
        enabled: true,
        version: '1.0.0',
        endpoints: [
          'POST /api/v2/imports',
          'GET /api/v2/imports/{jobId}',
          'GET /api/v2/imports/{jobId}/stream',
          'POST /api/import/csv-gemini',
        ],
        rateLimit: { requests: 5, windowMs: 60000 },
      },
      {
        name: 'bookshelf_scan',
        enabled: true,
        version: '1.0.0',
        endpoints: [
          'POST /api/scan-bookshelf/batch',
          'POST /api/batch-scan',
        ],
        rateLimit: { requests: 5, windowMs: 60000 },
        notes: 'AI-powered bookshelf photo scanning with Gemini Vision',
      },

      // Enrichment Features
      {
        name: 'barcode_enrichment',
        enabled: true,
        version: '1.0.0',
        endpoints: [
          'POST /api/v2/books/enrich',
          'POST /v1/enrichment/batch',
        ],
        rateLimit: { requests: 10, windowMs: 60000 },
      },
      {
        name: 'async_enrichment',
        enabled: hasEnrichmentQueue,
        version: '1.0.0',
        endpoints: ['POST /api/v2/books/enrich'],
        notes: hasEnrichmentQueue
          ? 'Queue-based async enrichment with vectorization'
          : 'Enrichment queue not configured',
      },

      // Recommendations
      {
        name: 'weekly_recommendations',
        enabled: hasRecommendationsCache,
        version: '1.0.0',
        endpoints: ['GET /api/v2/recommendations/weekly'],
        notes: 'Global recommendations (non-personalized). Generated weekly via cron.',
      },

      // Job Management
      {
        name: 'job_status',
        enabled: true,
        version: '1.0.0',
        endpoints: [
          'GET /v1/jobs/{jobId}/status',
          'GET /v1/jobs/{jobId}/results',
        ],
        rateLimit: { requests: 30, windowMs: 60000 },
      },
      {
        name: 'websocket_progress',
        enabled: true,
        version: '1.0.0',
        endpoints: ['GET /ws/progress'],
        notes: 'Real-time progress via WebSocket. Subprotocol auth supported.',
      },
      {
        name: 'sse_progress',
        enabled: true,
        version: '1.0.0',
        endpoints: ['GET /api/v2/imports/{jobId}/stream'],
        notes: 'Server-Sent Events for real-time import progress. Falls back to polling if unavailable.',
      },
    ],

    limits: {
      maxBatchSize: 50,
      maxCsvRows: 5000,
      maxImageSizeMb: parseInt(env.MAX_IMAGE_SIZE_MB || '10', 10),
      maxConcurrentJobs: 3,
    },

    deprecations: [
      {
        endpoint: 'GET /search/title',
        sunsetDate: '2026-03-01',
        replacement: 'GET /v1/search/title',
      },
      {
        endpoint: 'GET /search/isbn',
        sunsetDate: '2026-03-01',
        replacement: 'GET /v1/search/isbn',
      },
      {
        endpoint: 'GET /search/author',
        sunsetDate: '2026-03-01',
        replacement: 'GET /v1/search/advanced',
      },
      {
        endpoint: 'GET /search/advanced',
        sunsetDate: '2026-03-01',
        replacement: 'GET /v1/search/advanced',
      },
    ],
  }

  return createSuccessResponse(
    capabilities,
    {
      timestamp: new Date().toISOString(),
      source: 'capabilities-handler',
    },
    200,
    request
  )
}
