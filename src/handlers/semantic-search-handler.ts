/**
 * Semantic Search Handler - Vectorize-based Book Discovery
 *
 * Sprint 3: Phase 2 - Vectorize Pilot (Issue #25, #26)
 *
 * Provides semantic search capabilities for book discovery:
 * - Find similar books based on embedding similarity
 * - Natural language search across book catalog
 *
 * @see docs/SEMANTIC_SEARCH.md
 */

import { findSimilarBooks, semanticSearch } from '../services/embedding-service.js'
import type { Env } from '../types/env.js'
import { createErrorResponse, ErrorCodes } from '../utils/http/response-builder.js'

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /v1/search/similar?isbn={isbn}&limit={limit}
 *
 * Find books similar to a given book using vector similarity.
 *
 * @example
 * GET /v1/search/similar?isbn=9780439708180&limit=5
 * Returns: Top 5 books similar to Harry Potter
 */
export async function handleSimilarBooks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const isbn = url.searchParams.get('isbn')
  const limitParam = url.searchParams.get('limit')

  // Validate ISBN parameter
  if (!isbn) {
    return createErrorResponse('Missing required parameter: isbn', 400, ErrorCodes.INVALID_REQUEST)
  }

  // Validate ISBN format
  const cleanIsbn = isbn.replace(/[-\s]/g, '')
  if (!/^\d{10}$|^\d{13}$/.test(cleanIsbn)) {
    return createErrorResponse(
      'Invalid ISBN format. Must be ISBN-10 or ISBN-13.',
      400,
      ErrorCodes.INVALID_REQUEST,
    )
  }

  // Parse limit (default: 10, max: 50)
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 50)

  try {
    const similar = await findSimilarBooks(cleanIsbn, limit, env)

    // Check if Vectorize is configured
    if (similar.length === 0) {
      // Could be no similar books OR Vectorize not configured
      const vectorize = (env as unknown as { BOOK_VECTORS?: unknown }).BOOK_VECTORS

      if (!vectorize) {
        return createErrorResponse(
          'Semantic search is not configured. Vectorize binding required.',
          503,
          'FEATURE_NOT_AVAILABLE',
        )
      }
    }

    return new Response(
      JSON.stringify({
        query: {
          isbn: cleanIsbn,
          limit,
        },
        results: similar,
        count: similar.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('[SemanticSearch] Similar books error:', error)

    return createErrorResponse('Failed to find similar books', 500, ErrorCodes.INTERNAL_ERROR)
  }
}

/**
 * GET /v1/search/semantic?q={query}&limit={limit}
 *
 * Search for books using natural language queries.
 * Uses embedding similarity for semantic matching.
 *
 * @example
 * GET /v1/search/semantic?q=fantasy+books+about+wizards&limit=10
 * Returns: Books semantically similar to the query
 */
export async function handleSemanticSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  const limitParam = url.searchParams.get('limit')

  // Validate query parameter
  if (!q || q.trim().length === 0) {
    return createErrorResponse(
      'Missing required parameter: q (search query)',
      400,
      ErrorCodes.INVALID_REQUEST,
    )
  }

  // Sanitize and limit query length
  const searchQuery = q.trim().substring(0, 200)

  // Parse limit (default: 10, max: 50)
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 50)

  try {
    const results = await semanticSearch(searchQuery, limit, env)

    // Check if Vectorize is configured
    if (results.length === 0) {
      const vectorize = (env as unknown as { BOOK_VECTORS?: unknown }).BOOK_VECTORS

      if (!vectorize) {
        return createErrorResponse(
          'Semantic search is not configured. Vectorize binding required.',
          503,
          'FEATURE_NOT_AVAILABLE',
        )
      }
    }

    return new Response(
      JSON.stringify({
        query: {
          q: searchQuery,
          limit,
        },
        results,
        count: results.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('[SemanticSearch] Search error:', error)

    return createErrorResponse('Semantic search failed', 500, ErrorCodes.INTERNAL_ERROR)
  }
}
