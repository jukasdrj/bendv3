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

// ============================================================================
// Types
// ============================================================================

export interface EnrichRequest {
  isbn: string
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
  env: Env
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

  // Validate ISBN
  const isbn = body.isbn?.replace(/[-\s]/g, '')

  if (!isbn || !/^\d{10}$|^\d{13}$/.test(isbn)) {
    return createErrorResponse(
      'Invalid or missing ISBN. Must be ISBN-10 or ISBN-13.',
      400,
      ErrorCodes.INVALID_REQUEST,
      { field: 'isbn' },
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
    const bookData = await fetchBookData(isbn, env)

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
 * Fetch book data from external providers (simplified version)
 */
async function fetchBookData(
  isbn: string,
  env: Env
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
  // Try Google Books API first
  if (env.GOOGLE_BOOKS_API_KEY) {
    try {
      const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${env.GOOGLE_BOOKS_API_KEY}`
      const response = await fetch(googleUrl)

      if (response.ok) {
        const data = await response.json() as any

        if (data.totalItems > 0 && data.items?.[0]?.volumeInfo) {
          const info = data.items[0].volumeInfo
          return {
            title: info.title,
            authors: info.authors,
            publisher: info.publisher,
            publishedDate: info.publishedDate,
            description: info.description,
            pageCount: info.pageCount,
            categories: info.categories,
            coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:'),
            provider: 'google_books',
          }
        }
      }
    } catch (error) {
      console.error('[V2Enrich] Google Books API error:', error)
    }
  }

  // Fallback to OpenLibrary
  try {
    const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    const response = await fetch(olUrl, {
      headers: { 'User-Agent': env.USER_AGENT || 'BooksTrack/1.0' },
    })

    if (response.ok) {
      const data = await response.json() as any
      const bookData = data[`ISBN:${isbn}`]

      if (bookData) {
        return {
          title: bookData.title,
          authors: bookData.authors?.map((a: any) => a.name),
          publisher: bookData.publishers?.[0]?.name,
          publishedDate: bookData.publish_date,
          description: bookData.notes,
          pageCount: bookData.number_of_pages,
          categories: bookData.subjects?.map((s: any) => s.name),
          coverUrl: bookData.cover?.medium,
          provider: 'openlibrary',
        }
      }
    }
  } catch (error) {
    console.error('[V2Enrich] OpenLibrary API error:', error)
  }

  return null
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
