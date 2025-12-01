/**
 * Weekly Recommendations Cron Handler
 *
 * Sprint 3: Cron-based recommendation generation
 * Runs every Sunday at midnight UTC (0 0 * * 0)
 *
 * Uses Gemini API to generate global book recommendations based on:
 * - Books in the Vectorize index
 * - Trending/popular patterns
 * - Diversity of genres
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md
 */

import type { Env } from '../types/env'

// ============================================================================
// Types
// ============================================================================

interface RecommendationItem {
  isbn: string
  title: string
  author: string
  coverUrl?: string
  reason: string
  score: number
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

// ============================================================================
// Constants
// ============================================================================

const RECOMMENDATIONS_COUNT = 10
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days
const GEMINI_MODEL = 'gemini-2.0-flash-exp'

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Generate weekly recommendations
 * Called by Cloudflare Workers cron trigger
 */
export async function handleRecommendationsCron(env: Env): Promise<void> {
  console.log('[RecommendationsCron] Starting weekly recommendations generation')

  const weekOf = getCurrentWeekMonday()
  const startTime = Date.now()

  try {
    // Step 1: Fetch candidate books from D1
    const candidates = await fetchCandidateBooks(env)

    if (candidates.length === 0) {
      console.log('[RecommendationsCron] No candidate books found, skipping generation')
      return
    }

    console.log(`[RecommendationsCron] Found ${candidates.length} candidate books`)

    // Step 2: Generate recommendations using Gemini
    const recommendations = await generateRecommendationsWithGemini(candidates, env)

    if (recommendations.length === 0) {
      console.log('[RecommendationsCron] No recommendations generated')
      return
    }

    console.log(`[RecommendationsCron] Generated ${recommendations.length} recommendations`)

    // Step 3: Store in D1
    if (env.DB) {
      const expiresAt = Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS
      const id = `rec-${weekOf}-${Date.now()}`

      await env.DB.prepare(`
        INSERT OR REPLACE INTO recommendations (id, week_of, book_isbns, recommendations_json, generated_at, expires_at)
        VALUES (?, ?, ?, ?, unixepoch(), ?)
      `).bind(
        id,
        weekOf,
        JSON.stringify(recommendations.map(r => r.isbn)),
        JSON.stringify(recommendations),
        expiresAt
      ).run()

      console.log('[RecommendationsCron] Saved recommendations to D1')
    }

    // Step 4: Cache in KV for fast retrieval
    const recommendationsCache = (env as any).RECOMMENDATIONS_CACHE || env.CACHE

    if (recommendationsCache) {
      const cacheKey = `recommendations:weekly:${weekOf}`
      const cacheData = {
        weekOf,
        recommendations,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
      }

      await recommendationsCache.put(cacheKey, JSON.stringify(cacheData), {
        expirationTtl: CACHE_TTL_SECONDS,
      })

      console.log('[RecommendationsCron] Cached recommendations in KV')
    }

    const duration = Date.now() - startTime
    console.log(`[RecommendationsCron] Completed in ${duration}ms`)

  } catch (error) {
    console.error('[RecommendationsCron] Error:', error)
    throw error // Let Cloudflare retry
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get Monday of current week in ISO format
 */
function getCurrentWeekMonday(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setUTCDate(diff))
  return monday.toISOString().split('T')[0]!
}

/**
 * Fetch candidate books from D1 for recommendation consideration
 */
async function fetchCandidateBooks(env: Env): Promise<Array<{
  isbn: string
  title: string
  author: string
  coverUrl?: string
  categories?: string
  description?: string
}>> {
  if (!env.DB) {
    console.log('[RecommendationsCron] D1 not available')
    return []
  }

  // Get recently added books with good metadata (cover or vectorized)
  const result = await env.DB.prepare(`
    SELECT
      b.isbn,
      b.title,
      b.cover_medium_url,
      json_extract(b.canonical_metadata, '$.authors[0].name') as author,
      json_extract(b.canonical_metadata, '$.works[0].genres') as categories,
      json_extract(b.canonical_metadata, '$.works[0].description') as description
    FROM books b
    WHERE b.cover_medium_url IS NOT NULL
       OR b.vectorized_at IS NOT NULL
    ORDER BY b.updated_at DESC
    LIMIT 100
  `).all()

  return (result.results || []).map((row: any) => ({
    isbn: row.isbn,
    title: row.title,
    author: row.author || 'Unknown Author',
    coverUrl: row.cover_medium_url,
    categories: row.categories,
    description: row.description,
  }))
}

/**
 * Generate recommendations using Gemini API
 */
async function generateRecommendationsWithGemini(
  candidates: Array<{ isbn: string; title: string; author: string; coverUrl?: string; categories?: string; description?: string }>,
  env: Env
): Promise<RecommendationItem[]> {
  const geminiKey = env.GEMINI_API_KEY

  if (!geminiKey) {
    console.log('[RecommendationsCron] Gemini API key not available')
    // Fallback: return first N books with generic reasons
    return candidates.slice(0, RECOMMENDATIONS_COUNT).map((book, i) => ({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      reason: 'Recently added to our collection',
      score: 1 - (i * 0.05),
    }))
  }

  // Build prompt for Gemini
  const bookList = candidates.slice(0, 50).map((b, i) =>
    `${i + 1}. "${b.title}" by ${b.author} (ISBN: ${b.isbn})${b.categories ? ` - ${b.categories}` : ''}`
  ).join('\n')

  const prompt = `You are a book recommendation curator. From the following list of books, select the ${RECOMMENDATIONS_COUNT} best recommendations for a weekly "Staff Picks" feature. Consider diversity of genres, quality, and broad appeal.

BOOKS:
${bookList}

For each recommendation, provide:
1. The ISBN
2. A brief, engaging reason why readers should check out this book (1-2 sentences)
3. A relevance score from 0.7 to 1.0

Return your response as a JSON array with this exact format:
[
  {"isbn": "9780439708180", "reason": "A magical journey that...", "score": 0.95},
  ...
]

Return ONLY the JSON array, no other text.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('[RecommendationsCron] Gemini API error:', response.status)
      throw new Error(`Gemini API returned ${response.status}`)
    }

    const data = await response.json() as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[RecommendationsCron] Could not parse Gemini response')
      throw new Error('Invalid Gemini response format')
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ isbn: string; reason: string; score: number }>

    // Enrich with book details
    const candidateMap = new Map(candidates.map(c => [c.isbn, c]))

    return parsed.map(rec => {
      const book = candidateMap.get(rec.isbn)
      return {
        isbn: rec.isbn,
        title: book?.title || 'Unknown Title',
        author: book?.author || 'Unknown Author',
        coverUrl: book?.coverUrl,
        reason: rec.reason,
        score: rec.score,
      }
    }).filter(r => r.title !== 'Unknown Title')

  } catch (error) {
    console.error('[RecommendationsCron] Gemini generation failed:', error)

    // Fallback to simple selection
    return candidates.slice(0, RECOMMENDATIONS_COUNT).map((book, i) => ({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      reason: 'A great addition to any reading list',
      score: 0.8 - (i * 0.02),
    }))
  }
}
