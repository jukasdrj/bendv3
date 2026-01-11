/**
 * Recommendation Service
 *
 * Generates personalized book recommendations using:
 * - User reading preferences (from user_reading_preferences table)
 * - User ratings (from user_library.rating)
 * - Alexandria subject metadata (via RPC client)
 * - Content-based filtering algorithm
 *
 * Architecture:
 * - Alexandria provides primitives (subjects, similar books)
 * - bendv3 orchestrates (user data + scoring + ranking)
 * - Scoring weights: Subject overlap (60%), Preferences (20%), Diversity (20%)
 *
 * @see /Users/juju/dev_repos/bendv3/task_plan_recommendations.md
 */

import type { AlexandriaClient } from './alexandria-client'
import type { SubjectsData, SimilarBooksData, SimilarBook } from 'alexandria-worker'
import type { D1Database } from '@cloudflare/workers-types'

// =================================================================================
// Types
// =================================================================================

/**
 * User reading preferences from D1
 */
export interface UserPreferences {
	user_id: string
	preferred_subjects: string[] // e.g., ["fantasy", "mystery"]
	excluded_subjects: string[] // e.g., ["horror"]
	preferred_authors: string[] // e.g., ["/authors/OL23919A"]
	excluded_authors: string[] // e.g., ["/authors/OL456A"]
	mood?: 'light' | 'dark' | 'epic' | 'cozy' | 'thrilling' | null
	page_count_min?: number | null
	page_count_max?: number | null
	publication_year_min?: number | null
	publication_year_max?: number | null
}

/**
 * User's rated book from user_library
 */
export interface RatedBook {
	isbn: string
	title: string
	rating: number // 1-5 stars
	work_key: string | null
}

/**
 * Scored recommendation with reasoning
 */
export interface ScoredRecommendation {
	book: SimilarBook
	score: number // 0-100
	reasons: string[] // Human-readable explanations
	breakdown: {
		subject_match: number // 0-60
		preference_match: number // 0-20
		diversity_bonus: number // 0-20
	}
}

/**
 * Recommendation request parameters
 */
export interface RecommendationRequest {
	user_id: string
	limit?: number // Default: 10
	exclude_isbn?: string[] // ISBNs to exclude (e.g., already read)
}

/**
 * Recommendation response
 */
export interface RecommendationResult {
	recommendations: ScoredRecommendation[]
	total: number
	strategy: 'preference_based' | 'cold_start'
	debug?: {
		user_subjects: string[]
		preference_subjects: string[]
		candidate_count: number
	}
}

// =================================================================================
// Recommendation Service
// =================================================================================

export class RecommendationService {
	constructor(
		private readonly alexandria: AlexandriaClient,
		private readonly db: D1Database
	) {}

	/**
	 * Generate personalized recommendations for a user
	 */
	async generateRecommendations(
		request: RecommendationRequest
	): Promise<RecommendationResult> {
		const { user_id, limit = 10, exclude_isbn = [] } = request

		// 1. Fetch user preferences
		const preferences = await this.getUserPreferences(user_id)

		// 2. Fetch user's highly-rated books (4-5 stars)
		const ratedBooks = await this.getHighlyRatedBooks(user_id)

		// 3. Determine strategy
		if (ratedBooks.length === 0 && preferences.preferred_subjects.length === 0) {
			throw new Error('Cannot generate recommendations: No ratings or preferences found')
		}

		// 4. Build preference vector (subjects from rated books + explicit preferences)
		const preferenceVector = await this.buildPreferenceVector(ratedBooks, preferences)

		// 5. Query Alexandria for similar books
		const candidates = await this.querySimilarBooks(preferenceVector, ratedBooks, exclude_isbn)

		// 6. Score and rank candidates
		const scored = this.scoreAndRankCandidates(candidates, preferenceVector, preferences)

		// 7. Apply diversity filter (max 3 books per author)
		const diverse = this.applyDiversityFilter(scored)

		// 8. Return top N
		return {
			recommendations: diverse.slice(0, limit),
			total: diverse.length,
			strategy: ratedBooks.length > 0 ? 'preference_based' : 'cold_start',
			debug: {
				user_subjects: preferenceVector.subject_weights.map((s) => s.subject),
				preference_subjects: preferences.preferred_subjects,
				candidate_count: candidates.length,
			},
		}
	}

	/**
	 * Fetch user preferences from D1
	 */
	private async getUserPreferences(user_id: string): Promise<UserPreferences> {
		const result = await this.db
			.prepare(
				`
				SELECT
					user_id,
					preferred_subjects,
					excluded_subjects,
					preferred_authors,
					excluded_authors,
					mood,
					page_count_min,
					page_count_max,
					publication_year_min,
					publication_year_max
				FROM user_reading_preferences
				WHERE user_id = ?
			`
			)
			.bind(user_id)
			.first<{
				user_id: string
				preferred_subjects: string
				excluded_subjects: string
				preferred_authors: string
				excluded_authors: string
				mood: string | null
				page_count_min: number | null
				page_count_max: number | null
				publication_year_min: number | null
				publication_year_max: number | null
			}>()

		if (!result) {
			// Return empty preferences if none exist
			return {
				user_id,
				preferred_subjects: [],
				excluded_subjects: [],
				preferred_authors: [],
				excluded_authors: [],
			}
		}

		// Parse JSON arrays
		return {
			user_id: result.user_id,
			preferred_subjects: JSON.parse(result.preferred_subjects) as string[],
			excluded_subjects: JSON.parse(result.excluded_subjects) as string[],
			preferred_authors: JSON.parse(result.preferred_authors) as string[],
			excluded_authors: JSON.parse(result.excluded_authors) as string[],
			mood: result.mood as UserPreferences['mood'],
			page_count_min: result.page_count_min,
			page_count_max: result.page_count_max,
			publication_year_min: result.publication_year_min,
			publication_year_max: result.publication_year_max,
		}
	}

	/**
	 * Fetch user's highly-rated books (4-5 stars)
	 */
	private async getHighlyRatedBooks(user_id: string): Promise<RatedBook[]> {
		const results = await this.db
			.prepare(
				`
				SELECT isbn, title, rating, work_key
				FROM user_library
				WHERE user_id = ? AND rating >= 4
				ORDER BY rating DESC, created_at DESC
				LIMIT 50
			`
			)
			.bind(user_id)
			.all<RatedBook>()

		return results.results || []
	}

	/**
	 * Build preference vector from rated books and explicit preferences
	 *
	 * Strategy:
	 * 1. Fetch subjects for all rated books from Alexandria
	 * 2. Weight subjects by rating (5-star = 2x weight, 4-star = 1x weight)
	 * 3. Merge with explicit preferences (2x weight)
	 * 4. Normalize and return top 20 subjects
	 */
	private async buildPreferenceVector(
		ratedBooks: RatedBook[],
		preferences: UserPreferences
	): Promise<{
		subject_weights: Array<{ subject: string; weight: number }>
		excluded_subjects: string[]
	}> {
		const subjectWeights = new Map<string, number>()

		// 1. Add explicit preferences (2x weight)
		for (const subject of preferences.preferred_subjects) {
			const normalized = this.normalizeSubject(subject)
			subjectWeights.set(normalized, (subjectWeights.get(normalized) || 0) + 2.0)
		}

		// 2. Fetch subjects from rated books
		if (ratedBooks.length > 0) {
			const ids = ratedBooks
				.map((book) => book.work_key || book.isbn)
				.filter(Boolean) as string[]

			if (ids.length > 0) {
				try {
					const response = await this.alexandria.api.recommendations.subjects.$get({
						query: {
							ids: ids.join(','),
							limit: '1',
						},
					})

					if (response.ok) {
						const data: { success: boolean; data: SubjectsData } = await response.json()
						if (data.success) {
							// Weight subjects by rating
							for (const result of data.data.results) {
								const book = ratedBooks.find(
									(b) => b.isbn === result.id || b.work_key === result.id
								)
								if (!book) continue

								const ratingWeight = book.rating === 5 ? 2.0 : 1.0

								for (const subject of result.subjects) {
									const normalized = this.normalizeSubject(subject)
									subjectWeights.set(
										normalized,
										(subjectWeights.get(normalized) || 0) + ratingWeight
									)
								}
							}
						}
					}
				} catch (error) {
					console.error('Failed to fetch subjects from Alexandria:', error)
					// Continue with explicit preferences only
				}
			}
		}

		// 3. Sort by weight and take top 20
		const sorted = Array.from(subjectWeights.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([subject, weight]) => ({ subject, weight }))

		return {
			subject_weights: sorted,
			excluded_subjects: preferences.excluded_subjects.map((s) => this.normalizeSubject(s)),
		}
	}

	/**
	 * Query Alexandria for similar books
	 */
	private async querySimilarBooks(
		preferenceVector: {
			subject_weights: Array<{ subject: string; weight: number }>
			excluded_subjects: string[]
		},
		ratedBooks: RatedBook[],
		excludeIsbn: string[]
	): Promise<SimilarBook[]> {
		if (preferenceVector.subject_weights.length === 0) {
			return []
		}

		// Build query subjects (top 10 weighted subjects)
		const subjects = preferenceVector.subject_weights
			.slice(0, 10)
			.map((s) => s.subject)
			.join(',')

		// Build exclusion list (rated books + explicit exclusions)
		const excludeWorkKeys = ratedBooks.map((book) => book.work_key).filter(Boolean) as string[]

		try {
			const response = await this.alexandria.api.recommendations.similar.$get({
				query: {
					subjects,
					exclude: excludeWorkKeys.join(','),
					limit: '100',
					min_overlap: '2',
				},
			})

			if (response.ok) {
				const data: { success: boolean; data: SimilarBooksData } = await response.json()
				if (data.success) {
					// Filter out excluded ISBNs
					return data.data.results.filter(
						(book) => !book.isbn || !excludeIsbn.includes(book.isbn)
					)
				}
			}
		} catch (error) {
			console.error('Failed to query similar books from Alexandria:', error)
		}

		return []
	}

	/**
	 * Score and rank candidates
	 *
	 * Scoring weights:
	 * - Subject match: 60 points (weighted by preference strength)
	 * - Preference match: 20 points (author, mood, constraints)
	 * - Diversity bonus: 20 points (genre variety, publication date)
	 */
	private scoreAndRankCandidates(
		candidates: SimilarBook[],
		preferenceVector: {
			subject_weights: Array<{ subject: string; weight: number }>
			excluded_subjects: string[]
		},
		preferences: UserPreferences
	): ScoredRecommendation[] {
		return candidates
			.map((book) => {
				// 1. Subject match score (0-60)
				const subjectScore = this.calculateSubjectScore(
					book,
					preferenceVector.subject_weights,
					preferenceVector.excluded_subjects
				)

				// 2. Preference match score (0-20)
				const preferenceScore = this.calculatePreferenceScore(book, preferences)

				// 3. Diversity bonus (0-20) - Will be applied later in applyDiversityFilter
				const diversityBonus = 0 // Placeholder

				// Total score
				const score = subjectScore + preferenceScore + diversityBonus

				// Generate reasons
				const reasons = this.generateReasons(
					book,
					subjectScore,
					preferenceScore,
					preferenceVector.subject_weights
				)

				return {
					book,
					score,
					reasons,
					breakdown: {
						subject_match: subjectScore,
						preference_match: preferenceScore,
						diversity_bonus: diversityBonus,
					},
				}
			})
			.sort((a, b) => b.score - a.score)
	}

	/**
	 * Calculate subject match score (0-60)
	 */
	private calculateSubjectScore(
		book: SimilarBook,
		preferredSubjects: Array<{ subject: string; weight: number }>,
		excludedSubjects: string[]
	): number {
		// Normalize book subjects
		const bookSubjects = book.subjects.map((s) => this.normalizeSubject(s))

		// Check for excluded subjects (instant disqualification)
		const hasExcluded = bookSubjects.some((s) => excludedSubjects.includes(s))
		if (hasExcluded) {
			return 0
		}

		// Calculate weighted match
		let totalWeight = 0
		let matchedWeight = 0

		for (const { subject, weight } of preferredSubjects) {
			totalWeight += weight
			if (bookSubjects.includes(subject)) {
				matchedWeight += weight
			}
		}

		// Normalize to 0-60 range
		return totalWeight > 0 ? (matchedWeight / totalWeight) * 60 : 0
	}

	/**
	 * Calculate preference match score (0-20)
	 */
	private calculatePreferenceScore(
		book: SimilarBook,
		preferences: UserPreferences
	): number {
		let score = 0

		// Author preference (0-10)
		if (preferences.preferred_authors.length > 0) {
			const hasPreferredAuthor = book.authors.some((author) =>
				preferences.preferred_authors.includes(author.key)
			)
			if (hasPreferredAuthor) {
				score += 10
			}
		}

		// Excluded author (instant disqualification)
		const hasExcludedAuthor = book.authors.some((author) =>
			preferences.excluded_authors.includes(author.key)
		)
		if (hasExcludedAuthor) {
			return 0
		}

		// Page count constraint (0-5)
		if (book.pages) {
			const meetsMin =
				preferences.page_count_min === null || book.pages >= preferences.page_count_min
			const meetsMax =
				preferences.page_count_max === null || book.pages <= preferences.page_count_max
			if (meetsMin && meetsMax) {
				score += 5
			}
		}

		// Publication year constraint (0-5)
		if (book.publish_date) {
			const year = new Date(book.publish_date).getFullYear()
			const meetsMin =
				preferences.publication_year_min === null ||
				year >= preferences.publication_year_min
			const meetsMax =
				preferences.publication_year_max === null ||
				year <= preferences.publication_year_max
			if (meetsMin && meetsMax) {
				score += 5
			}
		}

		return score
	}

	/**
	 * Apply diversity filter (max 3 books per author)
	 */
	private applyDiversityFilter(scored: ScoredRecommendation[]): ScoredRecommendation[] {
		const authorCounts = new Map<string, number>()
		const diverse: ScoredRecommendation[] = []

		for (const rec of scored) {
			const authorKeys = rec.book.authors.map((a) => a.key).join(',')
			const count = authorCounts.get(authorKeys) || 0

			if (count < 3) {
				diverse.push(rec)
				authorCounts.set(authorKeys, count + 1)
			}
		}

		return diverse
	}

	/**
	 * Generate human-readable reasons
	 */
	private generateReasons(
		book: SimilarBook,
		subjectScore: number,
		preferenceScore: number,
		preferredSubjects: Array<{ subject: string; weight: number }>
	): string[] {
		const reasons: string[] = []

		// Subject matches
		if (subjectScore > 40) {
			const bookSubjects = book.subjects.map((s) => this.normalizeSubject(s))
			const matches = preferredSubjects
				.filter(({ subject }) => bookSubjects.includes(subject))
				.slice(0, 3)
				.map(({ subject }) => subject)

			if (matches.length > 0) {
				reasons.push(`Strong match: ${matches.join(', ')}`)
			}
		}

		// Author match
		if (book.authors.length > 0) {
			reasons.push(`By ${book.authors.map((a) => a.name).join(', ')}`)
		}

		// Subject overlap count
		if (book.subject_match_count > 0) {
			reasons.push(`${book.subject_match_count} shared themes`)
		}

		return reasons
	}

	/**
	 * Normalize subject for matching
	 *
	 * Rules:
	 * - Lowercase
	 * - Remove "Fiction, " prefix
	 * - Remove ", general" suffix
	 * - "Fantasy fiction" → "fantasy"
	 */
	private normalizeSubject(subject: string): string {
		return subject
			.toLowerCase()
			.replace(/^fiction,\s*/, '')
			.replace(/,\s*general$/, '')
			.replace(/\s+fiction$/, '')
			.trim()
	}
}
