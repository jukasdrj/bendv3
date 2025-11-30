/**
 * V2 Book Enrichment Handler - Detailed Response
 *
 * POST /api/v2/books/enrich/detailed - Synchronous book enrichment with nested canonical DTOs
 *
 * This endpoint returns the full canonical structure with nested WorkDTO, EditionDTO, and AuthorDTO objects,
 * providing richer metadata for clients that need the complete data model.
 *
 * For a simpler flat response, use `/api/v2/books/enrich` instead.
 *
 * @see docs/API_CONTRACT.md
 * @see GitHub Issue #150
 */

import type { Env } from '../../types/env'
import type { WorkDTO, EditionDTO, AuthorDTO } from '../../types/canonical'
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/response-builder'
import { generateBookEmbedding, storeEmbedding } from '../../services/embedding-service'
import { enrichMultipleBooks } from '../../services/enrichment'

// ============================================================================
// Types
// ============================================================================

export interface EnrichDetailedRequest {
  barcode?: string // P0: Contract-compliant parameter name (preferred)
  isbn?: string // P0: Backward compatibility (deprecated)
  includeEmbedding?: boolean
}

/**
 * Detailed Enrichment Response - Nested Canonical DTOs
 *
 * This response structure includes the full canonical data model with nested objects,
 * providing maximum detail for clients that need comprehensive book metadata.
 */
export interface EnrichDetailedResponse {
  isbn: string
  title: string
  work: WorkDTO
  edition: EditionDTO
  authors: AuthorDTO[]
  provider: string
  enrichedAt: string
  vectorized: boolean
}

// ============================================================================
// Handler
// ============================================================================

/**
 * POST /api/v2/books/enrich/detailed
 *
 * Enriches a book by ISBN with metadata from multiple providers.
 * Returns full canonical structure with nested WorkDTO, EditionDTO, and AuthorDTO objects.
 * Optionally generates and stores embedding for semantic search.
 *
 * @example
 * POST /api/v2/books/enrich/detailed
 * { "isbn": "9780439708180", "includeEmbedding": true }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "isbn": "9780439708180",
 *     "title": "Harry Potter and the Philosopher's Stone",
 *     "work": { title: "...", subjectTags: [...], ... },
 *     "edition": { isbn: "...", publisher: "...", ... },
 *     "authors": [{ name: "J.K. Rowling", ... }],
 *     "provider": "alexandria",
 *     "enrichedAt": "2025-11-30T...",
 *     "vectorized": false
 *   },
 *   "metadata": {
 *     "timestamp": "2025-11-30T...",
 *     "source": "alexandria",
 *     "cached": false
 *   }
 * }
 */
export async function handleEnrichBookDetailed(
  request: Request,
  env: Env,
  ctx?: ExecutionContext
): Promise<Response> {
  // Parse request body
  let body: EnrichDetailedRequest

  try {
    body = await request.json() as EnrichDetailedRequest
  } catch {
    return createErrorResponse(
      'Invalid JSON body',
      400,
      ErrorCodes.INVALID_REQUEST,
      {},
      request
    )
  }

  // P0: Accept both barcode (contract-compliant) and isbn (backward compatibility)
  const isbnRaw = body.barcode || body.isbn
  const isbn = isbnRaw?.replace(/[-\s]/g, '')

  if (!isbn || !/^\d{10}$|^\d{13}$/.test(isbn)) {
    return createErrorResponse(
      'Invalid or missing barcode. Must be ISBN-10 or ISBN-13.',
      400,
      ErrorCodes.INVALID_REQUEST,
      { field: 'barcode' },
      request
    )
  }

  const includeEmbedding = body.includeEmbedding ?? false

  try {
    // Check KV cache first
    const cacheKey = `book:isbn:detailed:${isbn}`
    const cached = await env.CACHE.get(cacheKey, 'json') as EnrichDetailedResponse | null

    if (cached) {
      // If embedding requested and book wasn't vectorized, do it now
      if (includeEmbedding && !cached.vectorized && env.AI) {
        const vectorized = await vectorizeBook(cached, env)
        if (vectorized) {
          cached.vectorized = true
          await env.CACHE.put(cacheKey, JSON.stringify(cached), {
            expirationTtl: 86400, // 24 hours
          })
        }
      }

      return createSuccessResponse(
        cached,
        {
          source: 'kv-cache',
          cached: true,
          timestamp: new Date().toISOString(),
        },
        200,
        request
      )
    }

    // Fetch from external APIs (orchestrated search)
    const bookData = await fetchBookData(isbn, env, ctx)

    if (!bookData) {
      return createErrorResponse(
        `Book not found for ISBN: ${isbn}`,
        404,
        ErrorCodes.NOT_FOUND,
        { isbn },
        request
      )
    }

    // Build detailed enriched response with nested canonical DTOs
    const enrichedBook: EnrichDetailedResponse = {
      isbn,
      title: bookData.work.title,
      work: bookData.work,
      edition: bookData.edition,
      authors: bookData.authors,
      provider: bookData.work.primaryProvider || 'orchestrated',
      enrichedAt: new Date().toISOString(),
      vectorized: false,
    }

    // Generate embedding if requested
    if (includeEmbedding && env.AI) {
      const vectorized = await vectorizeBook(enrichedBook, env)
      enrichedBook.vectorized = vectorized
    }

    // Cache the result
    await env.CACHE.put(cacheKey, JSON.stringify(enrichedBook), {
      expirationTtl: 86400, // 24 hours
    })

    // Store in D1 if available
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO books (isbn, title, canonical_metadata, updated_at, vectorized_at)
          VALUES (?, ?, ?, unixepoch(), ?)
        `).bind(
          isbn,
          enrichedBook.title,
          JSON.stringify(enrichedBook),
          enrichedBook.vectorized ? Math.floor(Date.now() / 1000) : null
        ).run()
      } catch (dbError) {
        console.error('[V2EnrichDetailed] D1 write failed:', dbError)
        // Non-fatal - continue with response
      }
    }

    return createSuccessResponse(
      enrichedBook,
      {
        source: bookData.work.primaryProvider || 'orchestrated',
        cached: false,
        timestamp: new Date().toISOString(),
      },
      200,
      request
    )
  } catch (error) {
    console.error('[V2EnrichDetailed] Error:', error)
    return createErrorResponse(
      'Enrichment failed',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { isbn },
      request
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fetch book data from external providers using enrichment service
 *
 * Uses enrichMultipleBooks which orchestrates:
 * 1. Alexandria (local, free, fast)
 * 2. Google Books (comprehensive metadata)
 * 3. OpenLibrary (free fallback)
 * 4. ISBNdb (cover images)
 */
async function fetchBookData(
  isbn: string,
  env: Env,
  ctx?: ExecutionContext
): Promise<{
  work: WorkDTO
  edition: EditionDTO
  authors: AuthorDTO[]
} | null> {
  try {
    // Use enrichMultipleBooks which includes Alexandria in the pipeline
    const result = await enrichMultipleBooks(
      { isbn },
      env,
      { maxResults: 1 },
      ctx
    )

    // If no results found, return null
    if (!result || !result.works || result.works.length === 0) {
      return null
    }

    // Return canonical DTOs directly
    const work = result.works[0]
    const edition = result.editions?.[0]
    const authors = result.authors || []

    // Ensure we have at least an edition
    if (!edition) {
      return null
    }

    return {
      work,
      edition,
      authors,
    }
  } catch (error) {
    console.error('[V2EnrichDetailed] enrichMultipleBooks error:', error)
    return null
  }
}

/**
 * Generate and store embedding for a book
 */
async function vectorizeBook(
  book: EnrichDetailedResponse,
  env: Env
): Promise<boolean> {
  try {
    const embedding = await generateBookEmbedding(
      {
        isbn: book.isbn,
        title: book.title,
        author: book.authors.map(a => a.name).join(', '),
        description: book.work.description,
        categories: book.work.subjectTags,
      },
      env
    )

    if (!embedding) {
      return false
    }

    const stored = await storeEmbedding(
      embedding,
      {
        isbn: book.isbn,
        title: book.title,
        author: book.authors.map(a => a.name).join(', '),
        categories: book.work.subjectTags?.join(', '),
      },
      env
    )

    return stored
  } catch (error) {
    console.error('[V2EnrichDetailed] Vectorization failed:', error)
    return false
  }
}
