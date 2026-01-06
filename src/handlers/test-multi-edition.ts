/**
 * Test Multi-Edition Discovery
 *
 * Quick test endpoint to verify edition discovery works before deploying to harvest
 * GET /api/test-multi-edition?count=5
 */

import { getTopEditions } from '../services/edition-discovery.js'
import type { Env } from '../types/env.js'

interface GoogleBooksVolumeInfo {
  title: string
  authors?: string[]
}

interface GoogleBooksItem {
  volumeInfo: GoogleBooksVolumeInfo
}

interface GoogleBooksResponse {
  items?: GoogleBooksItem[]
}

interface EditionResult {
  isbn: string
  title: string
  score: number
  publisher?: string
  publishedDate?: string
}

interface TestResult {
  seedISBN: string
  title?: string
  authors?: string[]
  editionsFound?: number
  editions?: Array<{
    isbn: string
    title: string
    score: number
    publisher?: string
    publishedDate?: string
  }>
  error?: string
}

interface TestSummary {
  worksProcessed: number
  totalEditions: number
  avgEditionsPerWork: number
}

export async function handleTestMultiEdition(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const count = Number.parseInt(url.searchParams.get('count') || '5', 10)

  // Test ISBNs (first 5 from curated list)
  const testISBNs = [
    '9780008479599', // The Midnight Library
    '9780062060624', // The Light We Lost
    '9780062225559', // The Nightingale
    '9780062277022', // The Woman in Cabin 10
    '9780062300547', // The Girl on the Train
  ].slice(0, count)

  const results: TestResult[] = []

  for (const isbn of testISBNs) {
    try {
      // Get metadata from Google Books
      const metadataUrl = new URL('https://www.googleapis.com/books/v1/volumes')
      metadataUrl.searchParams.set('q', `isbn:${isbn}`)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      let metadataResponse: Response
      try {
        metadataResponse = await fetch(metadataUrl.toString(), {
          signal: controller.signal,
        })
        clearTimeout(timeout)
      } catch (err) {
        clearTimeout(timeout)
        if ((err as Error).name === 'AbortError') {
          throw new Error('Google Books request timed out after 10 seconds')
        }
        throw err
      }

      const metadataData = (await metadataResponse.json()) as GoogleBooksResponse

      if (!metadataData.items || metadataData.items.length === 0) {
        results.push({
          seedISBN: isbn,
          title: 'Unknown',
          editions: [],
          error: 'No metadata found',
        })
        continue
      }

      const volumeInfo = metadataData.items[0]?.volumeInfo
      if (!volumeInfo) {
        console.log(`[MultiEditionTest] No volume info for ${isbn}`)
        continue
      }
      const title = volumeInfo.title
      const authors = volumeInfo.authors || []

      // Discover editions
      const editions = await getTopEditions({ title, authors }, env, 3)

      results.push({
        seedISBN: isbn,
        title,
        authors,
        editionsFound: editions.length,
        editions: editions.map((ed: EditionResult) => ({
          isbn: ed.isbn,
          title: ed.title,
          score: ed.score,
          publisher: ed.publisher,
          publishedDate: ed.publishedDate,
        })),
      })
    } catch (error) {
      results.push({
        seedISBN: isbn,
        error: (error as Error).message,
      })
    }
  }

  // Summary stats
  const totalEditions = results.reduce((sum, r) => sum + (r.editionsFound || 0), 0)
  const avgEditionsPerWork = (totalEditions / results.length).toFixed(1)

  const summary: TestSummary = {
    worksProcessed: results.length,
    totalEditions,
    avgEditionsPerWork: Number.parseFloat(avgEditionsPerWork),
  }

  return new Response(
    JSON.stringify(
      {
        success: true,
        summary,
        results,
      },
      null,
      2,
    ),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
