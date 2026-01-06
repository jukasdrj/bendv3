/**
 * Embedding Service - Workers AI Text Embeddings
 *
 * Sprint 3: Phase 2 - Vectorize Pilot (Issue #25)
 *
 * Generates text embeddings for semantic search using Workers AI.
 * Embeddings are stored in Cloudflare Vectorize for similarity queries.
 *
 * Model: @cf/baai/bge-m3 (1024 dimensions, multilingual)
 * Alternative: @cf/baai/bge-base-en-v1.5 (768 dimensions, English only)
 *
 * @see https://developers.cloudflare.com/workers-ai/models/text-embeddings/
 */

import type { Env } from '../types/env.js'

// ============================================================================
// Types
// ============================================================================

export interface BookEmbeddingInput {
  isbn: string
  title: string
  author: string
  description?: string
  categories?: string[]
}

export interface EmbeddingResult {
  isbn: string
  embedding: number[]
  dimensions: number
  model: string
  generatedAt: string
}

export interface VectorMetadata {
  isbn: string
  title: string
  author: string
  categories?: string
}

// Workers AI response type
interface TextEmbeddingsResponse {
  data: number[][]
  shape: [number, number]
}

// ============================================================================
// Constants
// ============================================================================

// Using bge-m3 for multilingual support (1024 dimensions)
const EMBEDDING_MODEL = '@cf/baai/bge-m3'
const EMBEDDING_DIMENSIONS = 1024
const MAX_TEXT_LENGTH = 512 // Max characters for embedding input

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generate embedding for a book's semantic representation
 *
 * Combines title, author, description, and categories into a single
 * text representation optimized for semantic similarity search.
 */
export async function generateBookEmbedding(
  book: BookEmbeddingInput,
  env: Env,
): Promise<EmbeddingResult | null> {
  if (!env.AI) {
    console.log('[EmbeddingService] Workers AI not available')
    return null
  }

  // Construct semantic text representation
  const textParts = [
    book.title,
    `by ${book.author}`,
    book.description,
    book.categories?.join(', '),
  ].filter(Boolean)

  const text = textParts.join('. ').substring(0, MAX_TEXT_LENGTH)

  try {
    console.log(`[EmbeddingService] Generating embedding for ISBN ${book.isbn}`)

    const response = (await env.AI.run(EMBEDDING_MODEL, {
      text: [text],
    })) as TextEmbeddingsResponse

    const embedding = response.data[0]

    if (!embedding || embedding.length === 0) {
      console.error('[EmbeddingService] Empty embedding returned')
      return null
    }

    return {
      isbn: book.isbn,
      embedding,
      dimensions: embedding.length,
      model: EMBEDDING_MODEL,
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[EmbeddingService] Embedding generation failed:', error)
    return null
  }
}

/**
 * Generate embedding for a search query
 *
 * Used for semantic search - embed the user's query and find similar books.
 */
export async function generateQueryEmbedding(query: string, env: Env): Promise<number[] | null> {
  if (!env.AI) {
    console.log('[EmbeddingService] Workers AI not available')
    return null
  }

  const text = query.substring(0, MAX_TEXT_LENGTH)

  try {
    const response = (await env.AI.run(EMBEDDING_MODEL, {
      text: [text],
    })) as TextEmbeddingsResponse

    return response.data[0] ?? null
  } catch (error) {
    console.error('[EmbeddingService] Query embedding failed:', error)
    return null
  }
}

/**
 * Batch generate embeddings for multiple books
 *
 * More efficient than individual calls for bulk operations.
 * Workers AI supports up to 100 texts per request.
 */
export async function generateBatchEmbeddings(
  books: BookEmbeddingInput[],
  env: Env,
): Promise<Map<string, number[]>> {
  if (!env.AI) {
    console.log('[EmbeddingService] Workers AI not available')
    return new Map()
  }

  const results = new Map<string, number[]>()
  const BATCH_SIZE = 50 // Conservative batch size

  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE)

    const texts = batch.map((book) => {
      const parts = [
        book.title,
        `by ${book.author}`,
        book.description,
        book.categories?.join(', '),
      ].filter(Boolean)
      return parts.join('. ').substring(0, MAX_TEXT_LENGTH)
    })

    try {
      const response = (await env.AI.run(EMBEDDING_MODEL, {
        text: texts,
      })) as TextEmbeddingsResponse

      for (let j = 0; j < batch.length; j++) {
        const embedding = response.data[j]
        if (embedding && embedding.length > 0) {
          const isbn = batch[j]?.isbn ?? ''
          results.set(isbn, embedding)
        }
      }
    } catch (error) {
      console.error(`[EmbeddingService] Batch ${i / BATCH_SIZE + 1} failed:`, error)
    }
  }

  return results
}

// ============================================================================
// Vectorize Operations
// ============================================================================

/**
 * Store embedding in Vectorize index
 */
export async function storeEmbedding(
  result: EmbeddingResult,
  metadata: VectorMetadata,
  env: Env,
): Promise<boolean> {
  // Check if Vectorize binding exists
  const vectorize = (env as unknown as { BOOK_VECTORS?: VectorizeIndex }).BOOK_VECTORS

  if (!vectorize) {
    console.log('[EmbeddingService] Vectorize not configured, skipping storage')
    return false
  }

  try {
    await vectorize.insert([
      {
        id: result.isbn,
        values: result.embedding,
        metadata: {
          isbn: metadata.isbn,
          title: metadata.title,
          author: metadata.author,
          categories: metadata.categories || undefined,
        } as Record<string, string>,
      },
    ])

    console.log(`[EmbeddingService] Stored embedding for ISBN ${result.isbn}`)
    return true
  } catch (error) {
    console.error('[EmbeddingService] Failed to store embedding:', error)
    return false
  }
}

/**
 * Find similar books using Vectorize
 */
export async function findSimilarBooks(
  isbn: string,
  limit: number,
  env: Env,
): Promise<Array<{ isbn: string; score: number; title?: string; author?: string }>> {
  const vectorize = (env as unknown as { BOOK_VECTORS?: VectorizeIndex }).BOOK_VECTORS

  if (!vectorize) {
    console.log('[EmbeddingService] Vectorize not configured')
    return []
  }

  try {
    // Get the book's embedding
    const vectors = await vectorize.getByIds([isbn])

    if (!vectors.length || !vectors[0]) {
      console.log(`[EmbeddingService] No embedding found for ISBN ${isbn}`)
      return []
    }

    // Query for similar books
    const results = await vectorize.query(vectors[0].values, {
      topK: limit + 1, // +1 to exclude the book itself
      returnMetadata: 'all',
    })

    // Filter out the original book and format results
    return results.matches
      .filter((match) => match.id !== isbn)
      .slice(0, limit)
      .map((match) => ({
        isbn: match.id,
        score: match.score,
        title: (match.metadata as VectorMetadata | undefined)?.title,
        author: (match.metadata as VectorMetadata | undefined)?.author,
      }))
  } catch (error) {
    console.error('[EmbeddingService] Similarity search failed:', error)
    return []
  }
}

/**
 * Search books by semantic query
 */
export async function semanticSearch(
  query: string,
  limit: number,
  env: Env,
): Promise<Array<{ isbn: string; score: number; title?: string; author?: string }>> {
  const vectorize = (env as unknown as { BOOK_VECTORS?: VectorizeIndex }).BOOK_VECTORS

  if (!vectorize) {
    console.log('[EmbeddingService] Vectorize not configured')
    return []
  }

  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query, env)

  if (!queryEmbedding) {
    console.log('[EmbeddingService] Failed to generate query embedding')
    return []
  }

  try {
    const results = await vectorize.query(queryEmbedding, {
      topK: limit,
      returnMetadata: 'all',
    })

    return results.matches.map((match) => ({
      isbn: match.id,
      score: match.score,
      title: (match.metadata as VectorMetadata | undefined)?.title,
      author: (match.metadata as VectorMetadata | undefined)?.author,
    }))
  } catch (error) {
    console.error('[EmbeddingService] Semantic search failed:', error)
    return []
  }
}

// ============================================================================
// Exports
// ============================================================================

export const embeddingService = {
  generateBookEmbedding,
  generateQueryEmbedding,
  generateBatchEmbeddings,
  storeEmbedding,
  findSimilarBooks,
  semanticSearch,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
}
