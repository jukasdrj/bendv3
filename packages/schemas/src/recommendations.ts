/**
 * Personalized recommendations endpoint schemas for BooksTrack API
 *
 * Provides user-personalized book recommendations with strategy information
 * (preference-based or weekly fallback).
 */

import { z } from '@hono/zod-openapi'
import { SuccessResponseSchema } from './response'

/**
 * Individual personalized recommendation item
 * Contains book metadata, recommendation score, and reasoning
 */
export const PersonalizedRecommendationSchema = z
  .object({
    isbn: z.string().describe('Book ISBN'),
    title: z.string().describe('Book title'),
    author: z.string().describe('Primary author'),
    coverUrl: z.string().url().optional().describe('Cover image URL'),
    reason: z.string().describe('Why this book is recommended'),
    score: z.number().min(0).max(1).optional().describe('Recommendation score (0-1)'),
  })
  .openapi('PersonalizedRecommendation')

export type PersonalizedRecommendation = z.infer<typeof PersonalizedRecommendationSchema>

/**
 * Personalized recommendations response data
 *
 * Contains an array of recommended books with strategy information indicating
 * the recommendation method used:
 * - "preference_based": User's reading history and ratings (future)
 * - "weekly_fallback": Global weekly recommendations (current)
 */
export const PersonalizedRecommendationsDataSchema = z
  .object({
    recommendations: z
      .array(PersonalizedRecommendationSchema)
      .describe('Personalized book recommendations'),
    total: z.number().int().describe('Number of recommendations returned'),
    strategy: z
      .enum(['preference_based', 'weekly_fallback'])
      .describe('Recommendation strategy used (weekly_fallback until Alexandria ratings ready)'),
    generatedAt: z.string().datetime().optional().describe('Timestamp when recommendations were generated'),
  })
  .openapi('PersonalizedRecommendationsData')

export type PersonalizedRecommendationsData = z.infer<typeof PersonalizedRecommendationsDataSchema>

/**
 * Full response envelope for personalized recommendations
 * Wraps the data with success indicator
 */
export const PersonalizedRecommendationsResponseSchema = SuccessResponseSchema(
  PersonalizedRecommendationsDataSchema,
)

export type PersonalizedRecommendationsResponse = z.infer<typeof PersonalizedRecommendationsResponseSchema>
