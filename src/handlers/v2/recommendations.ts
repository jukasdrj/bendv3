/**
 * V2 Recommendations Handler
 *
 * Sprint 3: Weekly Recommendations API (API_CONTRACT_V2_PROPOSAL.md)
 *
 * GET /api/v2/recommendations/weekly - Global weekly book picks
 *
 * Recommendations are generated via cron job (Sunday midnight UTC)
 * and cached in KV for fast retrieval.
 *
 * @see docs/API_CONTRACT_V2_PROPOSAL.md
 */

import type { Env } from '../../types/env'
import {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/response-builder'

// ============================================================================
// Types
// ============================================================================

export interface WeeklyRecommendation {
  isbn: string
  title: string
  author: string
  coverUrl?: string
  reason: string
  score?: number
}

export interface WeeklyRecommendationsResponse {
  weekOf: string
  recommendations: WeeklyRecommendation[]
  generatedAt: string
  expiresAt: string
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY_PREFIX = 'recommendations:weekly:'
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

// ============================================================================
// Handler
// ============================================================================

/**
 * GET /api/v2/recommendations/weekly
 *
 * Returns global weekly book recommendations.
 * Non-personalized in Sprint 3 (personalization comes in Phase 2).
 *
 * @example
 * GET /api/v2/recommendations/weekly
 * GET /api/v2/recommendations/weekly?limit=5
 */
export async function handleWeeklyRecommendations(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 20)

  try {
    // Get current week's Monday date (ISO format)
    const weekOf = getCurrentWeekMonday()
    const cacheKey = `${CACHE_KEY_PREFIX}${weekOf}`

    // Check KV cache first
    const recommendationsCache = env.RECOMMENDATIONS_CACHE || env.KV_CACHE

    if (recommendationsCache) {
      const cached = await recommendationsCache.get(cacheKey, 'json') as WeeklyRecommendationsResponse | null

      if (cached) {
        // Apply limit to cached recommendations
        const limitedRecommendations = cached.recommendations.slice(0, limit)

        return createSuccessResponse(
          {
            weekOf: cached.weekOf,
            recommendations: limitedRecommendations,
            count: limitedRecommendations.length,
            totalAvailable: cached.recommendations.length,
          },
          {
            source: 'kv-cache',
            cached: true,
            timestamp: new Date().toISOString(),
            generatedAt: cached.generatedAt,
            expiresAt: cached.expiresAt,
          },
          200,
          request
        )
      }
    }

    // Check D1 database as fallback
    if (env.DB) {
      const dbResult = await env.DB.prepare(
        'SELECT * FROM recommendations WHERE week_of = ? LIMIT 1'
      ).bind(weekOf).first()

      if (dbResult) {
        const recommendations = JSON.parse(dbResult.recommendations_json as string) as WeeklyRecommendation[]
        const limitedRecommendations = recommendations.slice(0, limit)

        // Re-populate cache from D1
        if (recommendationsCache) {
          const cacheData: WeeklyRecommendationsResponse = {
            weekOf,
            recommendations,
            generatedAt: new Date(dbResult.generated_at as number * 1000).toISOString(),
            expiresAt: new Date(dbResult.expires_at as number * 1000).toISOString(),
          }
          await recommendationsCache.put(cacheKey, JSON.stringify(cacheData), {
            expirationTtl: CACHE_TTL_SECONDS,
          })
        }

        return createSuccessResponse(
          {
            weekOf,
            recommendations: limitedRecommendations,
            count: limitedRecommendations.length,
            totalAvailable: recommendations.length,
          },
          {
            source: 'd1-database',
            cached: false,
            timestamp: new Date().toISOString(),
            generatedAt: new Date(dbResult.generated_at as number * 1000).toISOString(),
          },
          200,
          request
        )
      }
    }

    // No recommendations available - return empty with info
    return createSuccessResponse(
      {
        weekOf,
        recommendations: [],
        count: 0,
        totalAvailable: 0,
        message: 'Weekly recommendations are generated every Sunday at midnight UTC. Check back soon!',
      },
      {
        source: 'none',
        cached: false,
        timestamp: new Date().toISOString(),
        nextGenerationTime: getNextSundayMidnight().toISOString(),
      },
      200,
      request
    )
  } catch (error) {
    console.error('[V2Recommendations] Error:', error)
    return createErrorResponse(
      'Failed to fetch recommendations',
      500,
      ErrorCodes.INTERNAL_ERROR,
      {},
      request
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the Monday of the current week in ISO format (YYYY-MM-DD)
 */
function getCurrentWeekMonday(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(now.setUTCDate(diff))
  return monday.toISOString().split('T')[0]!
}

/**
 * Get next Sunday at midnight UTC
 */
function getNextSundayMidnight(): Date {
  const now = new Date()
  const day = now.getUTCDay()
  const daysUntilSunday = day === 0 ? 7 : 7 - day
  const nextSunday = new Date(now)
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday)
  nextSunday.setUTCHours(0, 0, 0, 0)
  return nextSunday
}
