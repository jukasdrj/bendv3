/**
 * Recommendation Routes
 *
 * Endpoints for personalized book recommendations based on user ratings and preferences.
 *
 * Endpoints:
 * - GET /api/recommendations - Get personalized recommendations for current user
 * - GET /api/recommendations/debug - Get recommendation with debug information
 */

import { Hono } from 'hono'
import type { Env } from '../types/env'
import { RecommendationService } from '../services/recommendations'
import { createAlexandriaClient } from '../services/alexandria-client'

export function createRecommendationRoutes() {
	const app = new Hono<{ Bindings: Env }>()

/**
 * GET /api/recommendations
 *
 * Get personalized book recommendations for the current user
 *
 * Query params:
 * - limit: Number of recommendations (default: 10, max: 50)
 * - exclude: Comma-separated ISBNs to exclude
 *
 * Response:
 * {
 *   recommendations: Array<{
 *     book: SimilarBook,
 *     score: number,
 *     reasons: string[]
 *   }>,
 *   total: number,
 *   strategy: 'preference_based' | 'cold_start'
 * }
 */
app.get('/', async (c) => {
	try {
		// TODO: Get user_id from session/auth
		const user_id = c.req.header('x-user-id') || 'test-user'

		const limit = Math.min(
			parseInt(c.req.query('limit') || '10', 10),
			50
		)
		const excludeParam = c.req.query('exclude')
		const exclude_isbn = excludeParam ? excludeParam.split(',').map(id => id.trim()) : []

		// Create service
		const alexandria = createAlexandriaClient(c.env)
		const service = new RecommendationService(alexandria, c.env.DB)

		// Generate recommendations
		const result = await service.generateRecommendations({
			user_id,
			limit,
			exclude_isbn,
		})

		return c.json({
			success: true,
			data: {
				recommendations: result.recommendations.map(rec => ({
					book: rec.book,
					score: rec.score,
					reasons: rec.reasons,
				})),
				total: result.total,
				strategy: result.strategy,
			},
		})
	} catch (error) {
		console.error('Recommendation generation failed:', error)

		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

/**
 * GET /api/recommendations/debug
 *
 * Get recommendations with full debug information
 * (score breakdowns, preference vector, etc.)
 */
app.get('/debug', async (c) => {
	try {
		// TODO: Get user_id from session/auth
		const user_id = c.req.header('x-user-id') || 'test-user'

		const limit = Math.min(
			parseInt(c.req.query('limit') || '10', 10),
			50
		)
		const excludeParam = c.req.query('exclude')
		const exclude_isbn = excludeParam ? excludeParam.split(',').map(id => id.trim()) : []

		// Create service
		const alexandria = createAlexandriaClient(c.env)
		const service = new RecommendationService(alexandria, c.env.DB)

		// Generate recommendations
		const result = await service.generateRecommendations({
			user_id,
			limit,
			exclude_isbn,
		})

		return c.json({
			success: true,
			data: {
				recommendations: result.recommendations.map(rec => ({
					book: rec.book,
					score: rec.score,
					reasons: rec.reasons,
					breakdown: rec.breakdown,
				})),
				total: result.total,
				strategy: result.strategy,
				debug: result.debug,
			},
		})
	} catch (error) {
		console.error('Recommendation generation failed:', error)

		return c.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		)
	}
})

	return app
}

export default createRecommendationRoutes
