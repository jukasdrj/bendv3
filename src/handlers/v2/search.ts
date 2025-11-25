/**
 * V2 Unified Search Handler
 *
 * Sprint 3: Unified V2 API (API_CONTRACT_V2_PROPOSAL.md)
 *
 * Combines text and semantic search into a single endpoint:
 * GET /api/v2/search?q=query&mode=text|semantic&limit=10
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md
 */

import type { Env } from '../../types/env'
import { handleSearchTitle } from '../v1/search-title'
import { handleSemanticSearch } from '../semantic-search-handler'
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/response-builder'

// ============================================================================
// Types
// ============================================================================

export type SearchMode = 'text' | 'semantic' | 'hybrid'

export interface V2SearchParams {
  q: string
  mode: SearchMode
  limit: number
  offset: number
}

// ============================================================================
// Handler
// ============================================================================

/**
 * GET /api/v2/search
 *
 * Unified search endpoint supporting multiple modes:
 * - text: Traditional text-based search (title, author matching)
 * - semantic: AI-powered semantic search using Vectorize embeddings
 * - hybrid: Combines both (future enhancement)
 *
 * @example
 * GET /api/v2/search?q=fantasy+wizards&mode=semantic&limit=20
 * GET /api/v2/search?q=harry+potter&mode=text&limit=10
 */
export async function handleV2Search(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)

  // Parse query parameters
  const q = url.searchParams.get('q')
  const modeParam = url.searchParams.get('mode') || 'text'
  const limitParam = url.searchParams.get('limit') || '20'
  const offsetParam = url.searchParams.get('offset') || '0'

  // Validate query
  if (!q || q.trim().length === 0) {
    return createErrorResponse(
      'Missing required parameter: q (search query)',
      400,
      ErrorCodes.MISSING_PARAMETER,
      { parameter: 'q' },
      request
    )
  }

  // Validate mode
  const validModes: SearchMode[] = ['text', 'semantic', 'hybrid']
  const mode = modeParam as SearchMode

  if (!validModes.includes(mode)) {
    return createErrorResponse(
      `Invalid mode: ${modeParam}. Must be one of: ${validModes.join(', ')}`,
      400,
      ErrorCodes.INVALID_REQUEST,
      { parameter: 'mode', validValues: validModes },
      request
    )
  }

  // Parse and validate limits
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50)
  const offset = Math.max(parseInt(offsetParam, 10) || 0, 0)

  // Sanitize query (max 200 chars)
  const searchQuery = q.trim().substring(0, 200)

  try {
    // Route to appropriate search handler based on mode
    if (mode === 'semantic') {
      return await handleSemanticSearchV2(searchQuery, limit, env, request)
    } else if (mode === 'hybrid') {
      // Hybrid mode: combine results from both text and semantic search
      return await handleHybridSearch(searchQuery, limit, env, request)
    } else {
      // Default: text search
      return await handleTextSearchV2(searchQuery, limit, offset, env, request)
    }
  } catch (error) {
    console.error('[V2Search] Error:', error)
    return createErrorResponse(
      'Search failed',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { query: searchQuery, mode },
      request
    )
  }
}

// Type for v1 response data
interface V1ResponseData {
  data?: {
    results?: unknown[]
    totalCount?: number
  }
  results?: unknown[]
  totalCount?: number
  metadata?: {
    cached?: boolean
  }
  error?: {
    code?: string
  }
}

/**
 * Text-based search (wraps v1 handler)
 */
async function handleTextSearchV2(
  query: string,
  limit: number,
  offset: number,
  env: Env,
  request: Request
): Promise<Response> {
  // Delegate to existing v1 handler
  const v1Response = await handleSearchTitle(query, env, request)

  // Transform to V2 format if needed
  const responseData = await v1Response.json() as V1ResponseData

  return createSuccessResponse(
    {
      query: { q: query, mode: 'text', limit, offset },
      results: responseData.data?.results || responseData.results || [],
      totalCount: responseData.data?.totalCount || responseData.totalCount || 0,
    },
    {
      source: 'text-search',
      cached: responseData.metadata?.cached || false,
      timestamp: new Date().toISOString(),
      searchMode: 'text',
    },
    200,
    request
  )
}

/**
 * Semantic search using Vectorize
 */
async function handleSemanticSearchV2(
  query: string,
  limit: number,
  env: Env,
  request: Request
): Promise<Response> {
  // Create a synthetic request for the semantic search handler
  const semanticUrl = new URL(request.url)
  semanticUrl.pathname = '/v1/search/semantic'
  semanticUrl.searchParams.set('q', query)
  semanticUrl.searchParams.set('limit', limit.toString())

  const semanticRequest = new Request(semanticUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  })

  const v1Response = await handleSemanticSearch(semanticRequest, env)
  const responseData = await v1Response.json() as V1ResponseData

  // Check for feature not available
  if (!v1Response.ok && responseData.error?.code === 'FEATURE_NOT_AVAILABLE') {
    return createErrorResponse(
      'Semantic search is not yet available. The Vectorize index is being populated.',
      503,
      'FEATURE_NOT_AVAILABLE',
      {
        mode: 'semantic',
        fallback: 'Use mode=text for traditional search'
      },
      request
    )
  }

  return createSuccessResponse(
    {
      query: { q: query, mode: 'semantic', limit },
      results: responseData.data?.results || [],
      count: (responseData.data as { count?: number })?.count || 0,
    },
    {
      source: 'vectorize',
      cached: false,
      timestamp: new Date().toISOString(),
      searchMode: 'semantic',
    },
    200,
    request
  )
}

/**
 * Hybrid search: combines text and semantic results
 * Future enhancement - currently falls back to semantic
 */
async function handleHybridSearch(
  query: string,
  limit: number,
  env: Env,
  request: Request
): Promise<Response> {
  // For now, hybrid mode delegates to semantic search
  // TODO: Implement true hybrid search that combines and re-ranks results
  console.log('[V2Search] Hybrid mode - delegating to semantic search')

  return await handleSemanticSearchV2(query, limit, env, request)
}
