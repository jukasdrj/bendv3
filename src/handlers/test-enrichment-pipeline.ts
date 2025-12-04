/**
 * Test Enrichment Pipeline
 *
 * Verifies end-to-end enrichment flow:
 * 1. Gets ISBNs from books database (with covers OR recently added)
 * 2. Sends batch to alexandria-enrichment-queue
 * 3. Returns results showing what was queued and current cover status
 *
 * Usage: GET /api/test/enrichment-pipeline?limit=10
 */

import type { Context } from 'hono'
import type { Env } from '../types/env'

interface TestResult {
  summary: {
    totalBooks: number
    withCovers: number
    withoutCovers: number
    queuedForEnrichment: number
    queueBindingAvailable: boolean
  }
  books: Array<{
    isbn: string
    title: string
    author: string
    currentCoverUrl: string | null
    queuedForEnrichment: boolean
    queueError?: string
  }>
  queueDetails: {
    binding: string
    target: string
    messagesS: number
  }
}

export async function handleTestEnrichmentPipeline(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env
  const limit = parseInt(c.req.query('limit') || '10')

  console.log('[TestEnrichment] Starting pipeline test with limit:', limit)

  try {
    // Step 1: Fetch books from D1
    const books = await fetchTestBooks(env, limit)
    console.log(`[TestEnrichment] Fetched ${books.length} books from D1`)

    if (books.length === 0) {
      return c.json({
        error: 'No books found in database',
        hint: 'Upload some books via CSV or add books to your library first'
      }, 404)
    }

    // Step 2: Check queue binding availability
    const queueAvailable = !!env.ENRICHMENT_QUEUE
    console.log('[TestEnrichment] Queue binding available:', queueAvailable)

    if (!queueAvailable) {
      return c.json({
        error: 'ENRICHMENT_QUEUE binding not available',
        books: books.map(b => ({
          isbn: b.isbn,
          title: b.title,
          author: b.author,
          currentCoverUrl: b.coverUrl,
          queuedForEnrichment: false,
          queueError: 'Queue binding not configured'
        })),
        hint: 'Check wrangler.jsonc queues.producers configuration'
      }, 500)
    }

    // Step 3: Send books to enrichment queue
    const results: TestResult['books'] = []
    let queuedCount = 0

    for (const book of books) {
      let queued = false
      let queueError: string | undefined

      try {
        await env.ENRICHMENT_QUEUE.send({
          entity_type: 'edition',
          isbn: book.isbn,
          source: 'pipeline_test',
          priority: 9, // Highest priority for testing
          timestamp: new Date().toISOString(),
        })

        queued = true
        queuedCount++
        console.log(`[TestEnrichment] ✓ Queued ISBN ${book.isbn}`)

      } catch (error) {
        queueError = error instanceof Error ? error.message : String(error)
        console.error(`[TestEnrichment] ✗ Failed to queue ISBN ${book.isbn}:`, queueError)
      }

      results.push({
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        currentCoverUrl: book.coverUrl,
        queuedForEnrichment: queued,
        queueError,
      })
    }

    // Step 4: Build response
    const response: TestResult = {
      summary: {
        totalBooks: books.length,
        withCovers: books.filter(b => b.coverUrl).length,
        withoutCovers: books.filter(b => !b.coverUrl).length,
        queuedForEnrichment: queuedCount,
        queueBindingAvailable: queueAvailable,
      },
      books: results,
      queueDetails: {
        binding: 'ENRICHMENT_QUEUE',
        target: 'alexandria-enrichment-queue',
        messagesS: queuedCount,
      }
    }

    console.log('[TestEnrichment] Test complete:', JSON.stringify(response.summary))

    return c.json(response, 200)

  } catch (error) {
    console.error('[TestEnrichment] Pipeline test failed:', error)
    return c.json({
      error: 'Pipeline test failed',
      message: error instanceof Error ? error.message : String(error)
    }, 500)
  }
}

/**
 * Fetch test books from D1 database
 * Prioritizes books without covers or recently added
 */
async function fetchTestBooks(
  env: Env,
  limit: number
): Promise<Array<{
  isbn: string
  title: string
  author: string
  coverUrl: string | null
}>> {
  if (!env.DB) {
    console.log('[TestEnrichment] D1 not available')
    return []
  }

  // Get books, prioritizing those without covers
  const result = await env.DB.prepare(`
    SELECT
      b.isbn,
      b.title,
      b.cover_medium_url,
      json_extract(b.canonical_metadata, '$.authors[0].name') as author
    FROM books b
    WHERE b.isbn IS NOT NULL
    ORDER BY
      CASE WHEN b.cover_medium_url IS NULL THEN 0 ELSE 1 END,
      b.updated_at DESC
    LIMIT ?
  `).bind(limit).all()

  return (result.results || []).map((row: any) => ({
    isbn: row.isbn,
    title: row.title || 'Unknown Title',
    author: row.author || 'Unknown Author',
    coverUrl: row.cover_medium_url || null,
  }))
}
