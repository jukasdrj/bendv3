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
import { handleSemanticSearch, handleSimilarBooks } from '../semantic-search-handler'
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/response-builder'

// ============================================================================
// Types
// ============================================================================

export type SearchMode = 'text' | 'semantic' | 'hybrid' | 'similar'

export interface V2SearchParams {
  q: string
  mode: SearchMode
  limit: number
  offset: number
}

// Regex to detect "similar:ISBN" pattern (Issue #002)
const SIMILAR_ISBN_PATTERN = /^similar:(\d{10}|\d{13})$/i

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

  // Check for "similar:ISBN" pattern (Issue #002: iOS similar book search)
  const similarMatch = q.match(SIMILAR_ISBN_PATTERN)
  let mode: SearchMode = modeParam as SearchMode
  let similarIsbn: string | null = null

  if (similarMatch) {
    // Override mode and extract ISBN
    mode = 'similar'
    similarIsbn = similarMatch[1]
  } else {
    // Validate mode only if not using similar:ISBN pattern
    const validModes: SearchMode[] = ['text', 'semantic', 'hybrid', 'similar']

    if (!validModes.includes(mode)) {
      return createErrorResponse(
        `Invalid mode: ${modeParam}. Must be one of: ${validModes.join(', ')}`,
        400,
        ErrorCodes.INVALID_REQUEST,
        { parameter: 'mode', validValues: validModes },
        request
      )
    }
  }

  // Parse and validate limits
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50)
  const offset = Math.max(parseInt(offsetParam, 10) || 0, 0)

  // Sanitize query (max 200 chars)
  const searchQuery = q.trim().substring(0, 200)

  try {
    // Route to appropriate search handler based on mode
    if (mode === 'similar' && similarIsbn) {
      // Issue #002: Similar books by ISBN (similar:ISBN pattern)
      return await handleSimilarSearchV2(similarIsbn, limit, env, request)
    } else if (mode === 'similar') {
      // mode=similar requires isbn parameter
      const isbnParam = url.searchParams.get('isbn')
      if (!isbnParam) {
        return createErrorResponse(
          'mode=similar requires isbn parameter or use similar:ISBN query format',
          400,
          ErrorCodes.MISSING_PARAMETER,
          { parameter: 'isbn', example: 'similar:9780439708180' },
          request
        )
      }
      return await handleSimilarSearchV2(isbnParam, limit, env, request)
    } else if (mode === 'semantic') {
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

/**
 * Similar books search by ISBN (Issue #002: V2 API similar:ISBN support)
 *
 * Supports two query formats:
 * 1. `q=similar:9780439708180` - Similar books pattern
 * 2. `mode=similar&isbn=9780439708180` - Explicit mode with isbn param
 */
async function handleSimilarSearchV2(
  isbn: string,
  limit: number,
  env: Env,
  request: Request
): Promise<Response> {
  // Clean ISBN
  const cleanIsbn = isbn.replace(/[-\s]/g, '')

  // Validate ISBN format
  if (!/^\d{10}$|^\d{13}$/.test(cleanIsbn)) {
    return createErrorResponse(
      'Invalid ISBN format. Must be ISBN-10 or ISBN-13.',
      400,
      ErrorCodes.INVALID_REQUEST,
      { isbn, format: 'ISBN-10 or ISBN-13' },
      request
    )
  }

  // Create a synthetic request for the similar books handler
  const similarUrl = new URL(request.url)
  similarUrl.pathname = '/v1/search/similar'
  similarUrl.searchParams.set('isbn', cleanIsbn)
  similarUrl.searchParams.set('limit', limit.toString())

  const similarRequest = new Request(similarUrl.toString(), {
    method: 'GET',
    headers: request.headers,
  })

  const v1Response = await handleSimilarBooks(similarRequest, env)
  const responseData = await v1Response.json() as V1ResponseData

  // Check for feature not available
  if (!v1Response.ok && responseData.error?.code === 'FEATURE_NOT_AVAILABLE') {
    return createErrorResponse(
      'Similar books search is not yet available. The Vectorize index is being populated.',
      503,
      'FEATURE_NOT_AVAILABLE',
      {
        mode: 'similar',
        isbn: cleanIsbn,
        fallback: 'Use mode=text for traditional search'
      },
      request
    )
  }

  return createSuccessResponse(
    {
      query: { q: `similar:${cleanIsbn}`, mode: 'similar', isbn: cleanIsbn, limit },
      results: responseData.data?.results || [],
      count: (responseData.data as { count?: number })?.count || 0,
    },
    {
      source: 'vectorize',
      cached: false,
      timestamp: new Date().toISOString(),
      searchMode: 'similar',
    },
    200,
    request
  )
}
