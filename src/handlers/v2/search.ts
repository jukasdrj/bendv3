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
import { CircuitBreakerOpenError, RateLimitError } from '../../types/errors'

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

    // Issue #302/#303: Handle circuit breaker and rate limit errors
    if (error instanceof CircuitBreakerOpenError) {
      return createErrorResponse({
        message: `Provider ${error.provider} temporarily unavailable`,
        status: 429,
        code: ErrorCodes.CIRCUIT_OPEN,
        details: { query: searchQuery, mode, provider: error.provider },
        corsRequest: request,
        retryAfterMs: error.retryAfterMs,
      })
    }

    if (error instanceof RateLimitError) {
      return createErrorResponse({
        message: `Rate limit exceeded for ${error.provider}`,
        status: 429,
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        details: { query: searchQuery, mode, provider: error.provider },
        corsRequest: request,
        retryAfterMs: error.retryAfterMs || 60000,
      })
    }

    return createErrorResponse(
      'Search failed',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { query: searchQuery, mode },
      request
    )
  }
}

// Type for v1 response data (canonical format with works/editions/authors)
interface V1ResponseData {
  data?: {
    works?: V1Work[]
    editions?: V1Edition[]
    authors?: V1Author[]
    resultCount?: number
  }
  metadata?: {
    cached?: boolean
    provider?: string
  }
  error?: {
    code?: string
  }
}

// V1 canonical WorkDTO shape (with authors attached by enrichment service)
interface V1Work {
  title: string
  subjectTags?: string[]
  description?: string
  coverImageURL?: string
  firstPublicationYear?: number
  primaryProvider?: string
  openLibraryWorkID?: string
  // Authors are attached to each work by the enrichment service (see external-apis.ts)
  authors?: V1Author[]
  [key: string]: unknown
}

// V1 canonical EditionDTO shape
interface V1Edition {
  isbn?: string
  title?: string
  publisher?: string
  publicationDate?: string
  pageCount?: number
  coverImageURL?: string
  [key: string]: unknown
}

// V1 canonical AuthorDTO shape
interface V1Author {
  name: string
  [key: string]: unknown
}

// V2 BookDTO shape (flat structure with coverUrl)
interface V2BookDTO {
  isbn?: string
  title: string
  authors: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  coverUrl?: string
  language?: string
  openLibraryWorkId?: string
}

/**
 * Transform V1 canonical response (works/editions/authors) to V2 BookDTO array
 *
 * Issue #202: Ensures coverUrl is returned (not coverImageURL)
 *
 * V1 returns:
 *   { works: WorkDTO[], editions: EditionDTO[], authors: AuthorDTO[] }
 *   Note: Each work has `authors` attached by the enrichment service
 *
 * V2 expects:
 *   { results: BookDTO[] } where BookDTO is a flat structure
 *
 * Mapping:
 *   - Each work becomes one BookDTO
 *   - Edition data is merged by index (V1 creates parallel arrays)
 *   - Author names come from work.authors (per-work) with fallback to global authors
 *   - coverImageURL → coverUrl
 */
function transformV1ToV2Books(
  works: V1Work[] = [],
  editions: V1Edition[] = [],
  authors: V1Author[] = []
): V2BookDTO[] {
  // Global authors as fallback (deduplicated list from all works)
  const globalAuthorNames = authors.map(a => a.name)

  return works.map((work, index) => {
    // Find matching edition (V1 normalizers create parallel arrays)
    const edition = editions[index]

    // Use work's attached authors (preferred) or fallback to global authors
    // The enrichment service attaches authors to each work (external-apis.ts line 559)
    const workAuthorNames = work.authors?.map(a => a.name) ?? []
    const authorList = workAuthorNames.length > 0 ? workAuthorNames : globalAuthorNames

    return {
      isbn: edition?.isbn,
      title: work.title,
      authors: authorList,
      publisher: edition?.publisher,
      publishedDate: edition?.publicationDate,
      description: work.description,
      pageCount: edition?.pageCount,
      categories: work.subjectTags,
      // Issue #202: Transform coverImageURL to coverUrl for V2 compliance
      coverUrl: work.coverImageURL || edition?.coverImageURL,
      language: edition?.language as string | undefined,
      openLibraryWorkId: work.openLibraryWorkID,
    }
  })
}

/**
 * Text-based search (wraps v1 handler)
 *
 * Transforms V1 canonical response (works/editions/authors) to V2 flat BookDTO array
 * Issue #202: Ensures coverUrl field (not coverImageURL) for V2 compliance
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

  // Transform V1 canonical format to V2 BookDTO format
  const responseData = await v1Response.json() as V1ResponseData

  // Transform works/editions/authors to flat BookDTO array with coverUrl
  const v2Books = transformV1ToV2Books(
    responseData.data?.works,
    responseData.data?.editions,
    responseData.data?.authors
  )

  return createSuccessResponse(
    {
      query: { q: query, mode: 'text', limit, offset },
      results: v2Books,
      totalCount: responseData.data?.resultCount || v2Books.length,
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
