/**
 * V2 Book Enrichment Handler
 *
 * Sprint 3: Barcode Enrichment API (API_CONTRACT_V2_PROPOSAL.md)
 *
 * POST /api/v2/books/enrich - Synchronous book enrichment
 *
 * Enriches book data from barcode/ISBN with optional vectorization.
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md
 */

import type { Env } from '../../types/env'
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

export interface EnrichRequest {
  barcode?: string // P0: Contract-compliant parameter name (preferred)
  isbn?: string // P0: Backward compatibility (deprecated)
  title?: string
  author?: string
  includeEmbedding?: boolean
}

export interface EnrichResponse {
  isbn: string
  title: string
  authors: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  coverUrl?: string
  provider: string
  enrichedAt: string
  vectorized: boolean
}

// ============================================================================
// Handler
// ============================================================================

/**
 * POST /api/v2/books/enrich
 *
 * Enriches a book by ISBN with metadata from multiple providers.
 * Optionally generates and stores embedding for semantic search.
 *
 * @example
 * POST /api/v2/books/enrich
 * { "isbn": "9780439708180", "includeEmbedding": true }
 */
export async function handleEnrichBook(
  request: Request,
  env: Env,
  ctx?: ExecutionContext
): Promise<Response> {
  // Parse request body
  let body: EnrichRequest

  try {
    body = await request.json() as EnrichRequest
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
      { field: 'barcode' }, // P0: Use contract-compliant field name in error
      request
    )
  }

  const includeEmbedding = body.includeEmbedding ?? false

  try {
    // Check KV cache first
    const cacheKey = `book:isbn:${isbn}`
    const cached = await env.CACHE.get(cacheKey, 'json') as EnrichResponse | null

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

    // Build enriched response
    const enrichedBook: EnrichResponse = {
      isbn,
      title: bookData.title,
      authors: bookData.authors || [],
      publisher: bookData.publisher,
      publishedDate: bookData.publishedDate,
      description: bookData.description,
      pageCount: bookData.pageCount,
      categories: bookData.categories,
      coverUrl: bookData.coverUrl,
      provider: bookData.provider || 'orchestrated',
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
        console.error('[V2Enrich] D1 write failed:', dbError)
        // Non-fatal - continue with response
      }
    }

    return createSuccessResponse(
      enrichedBook,
      {
        source: bookData.provider || 'orchestrated',
        cached: false,
        timestamp: new Date().toISOString(),
      },
      200,
      request
    )
  } catch (error) {
    console.error('[V2Enrich] Error:', error)
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
  title: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  pageCount?: number
  categories?: string[]
  coverUrl?: string
  provider?: string
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

    // Map canonical response to V2 response format
    const work = result.works[0]
    const edition = result.editions?.[0]

    return {
      title: work.title,
      authors: result.authors?.map(a => a.name) || [],
      publisher: edition?.publisher,
      publishedDate: edition?.publicationDate,
      description: work.description,
      pageCount: edition?.pageCount,
      categories: work.subjectTags,
      coverUrl: work.coverImageURL || edition?.coverImageURL,
      provider: work.primaryProvider,
    }
  } catch (error) {
    console.error('[V2Enrich] enrichMultipleBooks error:', error)
    return null
  }
}

/**
 * Generate and store embedding for a book
 */
async function vectorizeBook(
  book: EnrichResponse,
  env: Env
): Promise<boolean> {
  try {
    const embedding = await generateBookEmbedding(
      {
        isbn: book.isbn,
        title: book.title,
        author: book.authors.join(', '),
        description: book.description,
        categories: book.categories,
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
        author: book.authors.join(', '),
        categories: book.categories?.join(', '),
      },
      env
    )

    return stored
  } catch (error) {
    console.error('[V2Enrich] Vectorization failed:', error)
    return false
  }
}
