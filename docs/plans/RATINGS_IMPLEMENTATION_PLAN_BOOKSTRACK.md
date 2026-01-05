# BooksTrack - Personalized Recommendations Implementation Plan

**Repo:** `~/dev_repos/bendv3` (BooksTrack API Gateway)
**Created:** December 30, 2025
**Status:** Planning Phase
**Owner:** @jukasdrj

---

## Overview

Implement personalized book recommendations leveraging Alexandria's ratings infrastructure. Combines user reading history, genre preferences, and external ratings to generate tailored recommendations.

**Key Principle:** BooksTrack = User State + Orchestration (consumes Alexandria data)

---

## Prerequisites

**Alexandria ratings infrastructure must be deployed first:**
- ✅ PostgreSQL `work_ratings` table populated
- ✅ RPC endpoints available: `/works/:workKey/ratings`, `/works/top-rated`
- ✅ 3M+ works with user ratings

**See:** `RATINGS_IMPLEMENTATION_PLAN_ALEXANDRIA.md`

---

## Architecture Overview

```
User Library (BooksTrack D1)
    ↓
Recommendation Engine (BooksTrack)
    ↓
├─ User Profile Analysis (genres, authors, ratings)
├─ Candidate Generation (Alexandria RPC for ratings)
├─ Scoring Algorithm (personalized score)
└─ Gemini Reason Generation (why recommended?)
    ↓
Personalized Recommendations (cached 24h per user)
```

---

## D1 Schema Changes

### Tables to Add

```sql
-- User profiles (supports multi-user from day 1)
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,

  -- Genre preferences (JSON: weighted scores)
  favorite_genres TEXT,  -- {"sci-fi": 0.9, "fantasy": 0.7, "history": 0.6}
  disliked_genres TEXT,  -- {"romance": -0.5, "self-help": -0.3}

  -- Author preferences (JSON array)
  favorite_authors TEXT,  -- ["Isaac Asimov", "Neil Gaiman", "Brandon Sanderson"]

  -- Reading statistics
  total_books_read INTEGER DEFAULT 0,
  avg_personal_rating DECIMAL(2,1),  -- User's average rating of their library
  books_per_month DECIMAL(3,1),      -- Reading velocity

  -- Recommendation preferences
  min_composite_rating DECIMAL(2,1) DEFAULT 3.5,  -- Minimum external rating threshold
  prefer_highly_rated BOOLEAN DEFAULT true,        -- Weight ratings heavily in scoring
  prefer_recent_releases BOOLEAN DEFAULT false,    -- Bias toward recent publications
  prefer_series BOOLEAN DEFAULT false,             -- Complete series vs standalones

  -- Metadata
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  CHECK (avg_personal_rating >= 1.0 AND avg_personal_rating <= 5.0)
);

-- User interactions (feedback loop for learning)
CREATE TABLE user_interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  work_key TEXT NOT NULL,     -- OpenLibrary work key
  isbn TEXT,                  -- Optional: specific edition

  -- Interaction type
  action TEXT NOT NULL,       -- 'view', 'skip', 'save', 'rate', 'finish', 'abandon'
  personal_rating INTEGER,    -- 1-5 stars (user's own rating)
  CHECK (personal_rating IS NULL OR (personal_rating >= 1 AND personal_rating <= 5)),

  -- Context (where did this interaction happen?)
  source TEXT NOT NULL,       -- 'recommendation', 'search', 'import', 'scan', 'manual'
  recommendation_reason TEXT, -- If from recommendation, why was it recommended?
  recommendation_score REAL,  -- Algorithm's confidence score

  -- Timestamps
  created_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

-- User library cache (denormalized for fast profile analysis)
CREATE TABLE user_library_cache (
  user_id TEXT NOT NULL,
  work_key TEXT NOT NULL,
  isbn TEXT,

  -- Book metadata (cached from Alexandria)
  title TEXT,
  author TEXT,
  genres TEXT,               -- JSON array: ["Fiction", "Sci-Fi"]
  publication_year INTEGER,

  -- User's engagement
  added_at INTEGER DEFAULT (unixepoch()),
  read_status TEXT,          -- 'to-read', 'reading', 'finished'
  personal_rating INTEGER,

  PRIMARY KEY (user_id, work_key),
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_work ON user_interactions(work_key);
CREATE INDEX idx_user_interactions_action ON user_interactions(action);
CREATE INDEX idx_user_interactions_source ON user_interactions(source);

CREATE INDEX idx_user_library_user ON user_library_cache(user_id);
CREATE INDEX idx_user_library_genres ON user_library_cache(genres);
CREATE INDEX idx_user_library_added ON user_library_cache(added_at DESC);
```

### Migration File

```sql
-- migrations/0009_add_personalized_recommendations.sql
-- Applied: TBD

-- User profiles
CREATE TABLE user_profiles ( ... );

-- User interactions
CREATE TABLE user_interactions ( ... );

-- User library cache
CREATE TABLE user_library_cache ( ... );

-- Indexes
CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_work ON user_interactions(work_key);
CREATE INDEX idx_user_interactions_action ON user_interactions(action);
CREATE INDEX idx_user_interactions_source ON user_interactions(source);
CREATE INDEX idx_user_library_user ON user_library_cache(user_id);
CREATE INDEX idx_user_library_genres ON user_library_cache(genres);
CREATE INDEX idx_user_library_added ON user_library_cache(added_at DESC);
```

---

## Implementation Plan

### Phase 1: User Profile Foundation (Week 1)

**Task 1: D1 Schema Migration**

```bash
# Create migration file
cat > migrations/0009_add_personalized_recommendations.sql << 'EOF'
-- See schema above
EOF

# Apply locally
npx wrangler d1 execute bookstrack-library --local --file=migrations/0009_add_personalized_recommendations.sql

# Apply to production
npx wrangler d1 execute bookstrack-library --remote --file=migrations/0009_add_personalized_recommendations.sql
```

**Task 2: Profile Analyzer Service**

```typescript
// src/services/profile-analyzer.ts
import type { Env } from '../types/env'

export interface UserProfile {
  userId: string
  favoriteGenres: Record<string, number>  // genre -> weight (0.0-1.0)
  dislikedGenres: Record<string, number>  // genre -> weight (-1.0-0.0)
  favoriteAuthors: string[]
  totalBooksRead: number
  avgPersonalRating: number
  minCompositeRating: number
}

/**
 * Analyze user's library to extract reading preferences
 */
export async function analyzeUserProfile(userId: string, env: Env): Promise<UserProfile> {
  // Fetch user's library from cache
  const library = await env.DB.prepare(`
    SELECT
      genres,
      author,
      personal_rating
    FROM user_library_cache
    WHERE user_id = ?
  `).bind(userId).all()

  if (!library.results || library.results.length === 0) {
    // Empty library - return default profile
    return createDefaultProfile(userId)
  }

  // Extract genre preferences
  const genreCounts = new Map<string, number>()
  const authorCounts = new Map<string, number>()
  let totalRating = 0
  let ratedCount = 0

  for (const book of library.results) {
    // Parse genres JSON
    const genres = JSON.parse(book.genres || '[]') as string[]
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
    }

    // Track authors
    if (book.author) {
      authorCounts.set(book.author, (authorCounts.get(book.author) || 0) + 1)
    }

    // Average rating
    if (book.personal_rating) {
      totalRating += book.personal_rating
      ratedCount++
    }
  }

  // Calculate genre weights (normalize to 0.0-1.0)
  const maxGenreCount = Math.max(...genreCounts.values())
  const favoriteGenres: Record<string, number> = {}

  for (const [genre, count] of genreCounts) {
    const weight = count / maxGenreCount
    if (weight >= 0.3) {  // Only track genres with >30% representation
      favoriteGenres[genre] = Number(weight.toFixed(2))
    }
  }

  // Top 10 authors
  const favoriteAuthors = Array.from(authorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author]) => author)

  // Check for disliked genres (from skip interactions)
  const dislikedGenres = await analyzeSkippedGenres(userId, env)

  const profile: UserProfile = {
    userId,
    favoriteGenres,
    dislikedGenres,
    favoriteAuthors,
    totalBooksRead: library.results.length,
    avgPersonalRating: ratedCount > 0 ? totalRating / ratedCount : 0,
    minCompositeRating: 3.5  // Default threshold
  }

  // Persist to user_profiles table
  await saveUserProfile(profile, env)

  return profile
}

async function analyzeSkippedGenres(userId: string, env: Env): Promise<Record<string, number>> {
  const skipped = await env.DB.prepare(`
    SELECT
      ulc.genres
    FROM user_interactions ui
    JOIN user_library_cache ulc ON ulc.work_key = ui.work_key AND ulc.user_id = ui.user_id
    WHERE ui.user_id = ?
      AND ui.action = 'skip'
      AND ui.created_at > ?
  `).bind(userId, Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60).all()  // Last 30 days

  const genreCounts = new Map<string, number>()

  for (const row of skipped.results || []) {
    const genres = JSON.parse(row.genres || '[]') as string[]
    for (const genre of genres) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
    }
  }

  // Convert to negative weights
  const disliked: Record<string, number> = {}
  const maxSkips = Math.max(...genreCounts.values(), 1)

  for (const [genre, count] of genreCounts) {
    if (count >= 3) {  // At least 3 skips to count as disliked
      disliked[genre] = -Number((count / maxSkips).toFixed(2))
    }
  }

  return disliked
}

async function saveUserProfile(profile: UserProfile, env: Env): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO user_profiles (
      user_id,
      favorite_genres,
      disliked_genres,
      favorite_authors,
      total_books_read,
      avg_personal_rating,
      min_composite_rating,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT (user_id) DO UPDATE
      SET favorite_genres = EXCLUDED.favorite_genres,
          disliked_genres = EXCLUDED.disliked_genres,
          favorite_authors = EXCLUDED.favorite_authors,
          total_books_read = EXCLUDED.total_books_read,
          avg_personal_rating = EXCLUDED.avg_personal_rating,
          updated_at = unixepoch()
  `).bind(
    profile.userId,
    JSON.stringify(profile.favoriteGenres),
    JSON.stringify(profile.dislikedGenres),
    JSON.stringify(profile.favoriteAuthors),
    profile.totalBooksRead,
    profile.avgPersonalRating,
    profile.minCompositeRating
  ).run()
}

function createDefaultProfile(userId: string): UserProfile {
  return {
    userId,
    favoriteGenres: {},
    dislikedGenres: {},
    favoriteAuthors: [],
    totalBooksRead: 0,
    avgPersonalRating: 0,
    minCompositeRating: 3.5
  }
}
```

**Task 3: Interaction Logging Endpoint**

```typescript
// src/api-v3/interactions.ts
import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from '../types/env'
import type { RequestContext } from '../middleware/request-context'
import { SuccessResponseSchema } from '@bookstrack/schemas'

const InteractionSchema = z.object({
  workKey: z.string().describe('OpenLibrary work key'),
  isbn: z.string().optional().describe('Specific edition ISBN'),
  action: z.enum(['view', 'skip', 'save', 'rate', 'finish', 'abandon']).describe('Interaction type'),
  personalRating: z.number().int().min(1).max(5).optional().describe('User rating (1-5 stars)'),
  source: z.enum(['recommendation', 'search', 'import', 'scan', 'manual']).describe('Where interaction occurred'),
  recommendationReason: z.string().optional().describe('Why it was recommended (if from recommendation)')
})

const logInteractionRoute = createRoute({
  method: 'post',
  path: '/v3/interactions',
  tags: ['User Interactions'],
  summary: 'Log user interaction with a book',
  description: 'Records user actions (view, skip, save, rate) for recommendation learning',
  request: {
    body: {
      content: { 'application/json': { schema: InteractionSchema } }
    }
  },
  responses: {
    200: {
      description: 'Interaction logged successfully',
      content: { 'application/json': { schema: SuccessResponseSchema(z.object({ interactionId: z.string() })) } }
    }
  }
})

export function registerInteractionsRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>
) {
  app.openapi(logInteractionRoute, async (c) => {
    const ctx = c.get('ctx')
    const body = c.req.valid('json')

    // For now, hardcode userId as 'justin'
    // TODO: Extract from authentication token
    const userId = 'justin'

    const interactionId = crypto.randomUUID()

    // Insert interaction
    await c.env.DB.prepare(`
      INSERT INTO user_interactions (
        id,
        user_id,
        work_key,
        isbn,
        action,
        personal_rating,
        source,
        recommendation_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      interactionId,
      userId,
      body.workKey,
      body.isbn || null,
      body.action,
      body.personalRating || null,
      body.source,
      body.recommendationReason || null
    ).run()

    // Trigger profile update (async, non-blocking)
    c.executionCtx.waitUntil(
      updateUserProfileAsync(userId, c.env)
    )

    return c.json({
      success: true,
      data: { interactionId },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId
      }
    })
  })
}

async function updateUserProfileAsync(userId: string, env: Env): Promise<void> {
  try {
    const { analyzeUserProfile } = await import('../services/profile-analyzer')
    await analyzeUserProfile(userId, env)
  } catch (error) {
    console.error('[Interactions] Failed to update profile:', error)
  }
}
```

**Deliverable:** User profile analysis + interaction logging

---

### Phase 2: Recommendation Engine (Week 2)

**Task 1: Candidate Generator**

```typescript
// src/services/recommendation-engine.ts
import type { Env } from '../types/env'
import type { UserProfile } from './profile-analyzer'
import { alexandriaClient } from './alexandria-client'

interface Candidate {
  workKey: string
  title: string
  author: string
  genres: string[]
  compositeRating: number
  ratingCount: number
  publicationYear?: number
}

/**
 * Generate candidate books for recommendation
 */
export async function generateCandidates(profile: UserProfile, env: Env): Promise<Candidate[]> {
  const candidates: Candidate[] = []

  // Strategy 1: Top-rated books from Alexandria (50%)
  const topRated = await alexandriaClient(env).works['top-rated'].$get({
    query: {
      type: 'composite',
      limit: '500',
      minCount: '100'  // At least 100 ratings
    }
  })

  if (topRated.ok) {
    const data = await topRated.json()
    candidates.push(...data.topRated.slice(0, 250))
  }

  // Strategy 2: Books by favorite authors (30%)
  if (profile.favoriteAuthors.length > 0) {
    const authorBooks = await findBooksByAuthors(profile.favoriteAuthors, env)
    candidates.push(...authorBooks.slice(0, 150))
  }

  // Strategy 3: Books in favorite genres (20%)
  const topGenres = Object.entries(profile.favoriteGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre)

  if (topGenres.length > 0) {
    const genreBooks = await findBooksByGenres(topGenres, env)
    candidates.push(...genreBooks.slice(0, 100))
  }

  // Filter out books already in library
  const libraryWorkKeys = await getUserLibraryWorkKeys(profile.userId, env)
  const filtered = candidates.filter(c => !libraryWorkKeys.has(c.workKey))

  // Remove duplicates
  const unique = Array.from(
    new Map(filtered.map(c => [c.workKey, c])).values()
  )

  return unique
}

async function getUserLibraryWorkKeys(userId: string, env: Env): Promise<Set<string>> {
  const result = await env.DB.prepare(`
    SELECT work_key
    FROM user_library_cache
    WHERE user_id = ?
  `).bind(userId).all()

  return new Set((result.results || []).map(r => r.work_key))
}

async function findBooksByAuthors(authors: string[], env: Env): Promise<Candidate[]> {
  // Query Alexandria for books by these authors
  // This would require a new Alexandria endpoint: /authors/:name/works
  // For now, return empty array
  return []
}

async function findBooksByGenres(genres: string[], env: Env): Promise<Candidate[]> {
  // Query Alexandria for books in these genres
  // This would require a new Alexandria endpoint: /genres/:name/works
  // For now, return empty array
  return []
}
```

**Task 2: Scoring Algorithm**

```typescript
// src/services/recommendation-engine.ts (continued)

interface ScoredRecommendation {
  candidate: Candidate
  score: number
  breakdown: {
    ratingScore: number
    genreScore: number
    authorScore: number
    popularityScore: number
    recencyScore: number
  }
  reason: string
}

/**
 * Score and rank candidates based on user profile
 */
export function scoreAndRank(
  candidates: Candidate[],
  profile: UserProfile
): ScoredRecommendation[] {
  const scored = candidates.map(candidate => {
    const breakdown = {
      ratingScore: calculateRatingScore(candidate.compositeRating, candidate.ratingCount),
      genreScore: calculateGenreScore(candidate.genres, profile),
      authorScore: calculateAuthorScore(candidate.author, profile),
      popularityScore: calculatePopularityScore(candidate.ratingCount),
      recencyScore: calculateRecencyScore(candidate.publicationYear, profile)
    }

    const totalScore = Object.values(breakdown).reduce((sum, s) => sum + s, 0)

    return {
      candidate,
      score: totalScore,
      breakdown,
      reason: ''  // Will be filled by Gemini
    }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
}

function calculateRatingScore(rating: number, count: number): number {
  // Base: 0-50 points from rating
  let score = (rating / 5.0) * 50

  // Bonus for high count (credibility)
  if (count > 1000) score += 10
  else if (count > 500) score += 5

  return score
}

function calculateGenreScore(genres: string[], profile: UserProfile): number {
  let score = 0

  for (const genre of genres) {
    // Add points for favorite genres
    if (profile.favoriteGenres[genre]) {
      score += profile.favoriteGenres[genre] * 30
    }

    // Subtract points for disliked genres
    if (profile.dislikedGenres[genre]) {
      score += profile.dislikedGenres[genre] * 20  // Negative weight
    }
  }

  return Math.max(0, score)  // Floor at 0
}

function calculateAuthorScore(author: string, profile: UserProfile): number {
  return profile.favoriteAuthors.includes(author) ? 25 : 0
}

function calculatePopularityScore(count: number): number {
  // Logarithmic scale: more ratings = slightly higher score
  if (count < 50) return 0
  if (count < 100) return 2
  if (count < 500) return 5
  if (count < 1000) return 8
  return 10
}

function calculateRecencyScore(year: number | undefined, profile: UserProfile): number {
  if (!year || !profile.prefer_recent_releases) return 0

  const currentYear = new Date().getFullYear()
  const age = currentYear - year

  if (age <= 1) return 10
  if (age <= 3) return 7
  if (age <= 5) return 4
  return 0
}
```

**Task 3: Gemini Reason Generation**

```typescript
// src/services/recommendation-reasons.ts
import type { Env } from '../types/env'
import type { UserProfile } from './profile-analyzer'
import type { ScoredRecommendation } from './recommendation-engine'

/**
 * Generate personalized "why recommended" reasons using Gemini
 */
export async function generateReasons(
  recommendations: ScoredRecommendation[],
  profile: UserProfile,
  env: Env
): Promise<ScoredRecommendation[]> {
  if (!env.GEMINI_API_KEY) {
    // Fallback to generic reasons
    return recommendations.map(rec => ({
      ...rec,
      reason: generateGenericReason(rec, profile)
    }))
  }

  // Build prompt for Gemini
  const topGenres = Object.entries(profile.favoriteGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g)
    .join(', ')

  const topAuthors = profile.favoriteAuthors.slice(0, 3).join(', ')

  const bookList = recommendations
    .map((rec, i) => `${i + 1}. "${rec.candidate.title}" by ${rec.candidate.author} (${rec.candidate.genres.join(', ')}) - Rating: ${rec.candidate.compositeRating}/5.0`)
    .join('\n')

  const prompt = `You are a personalized book recommendation assistant.

USER PROFILE:
- Favorite genres: ${topGenres}
- Favorite authors: ${topAuthors}
- Books read: ${profile.totalBooksRead}
- Average rating: ${profile.avgPersonalRating}/5.0

RECOMMENDATIONS:
${bookList}

For each book, write a personalized 1-sentence reason why this user would enjoy it. Focus on connecting it to their preferences. Be engaging and specific.

Return as JSON array:
[
  {"bookNumber": 1, "reason": "..."},
  {"bookNumber": 2, "reason": "..."},
  ...
]

Return ONLY the JSON array, no other text.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Failed to parse Gemini response')
    }

    const reasons = JSON.parse(jsonMatch[0]) as Array<{ bookNumber: number; reason: string }>

    // Apply reasons
    return recommendations.map((rec, i) => ({
      ...rec,
      reason: reasons[i]?.reason || generateGenericReason(rec, profile)
    }))
  } catch (error) {
    console.error('[Recommendations] Gemini generation failed:', error)
    return recommendations.map(rec => ({
      ...rec,
      reason: generateGenericReason(rec, profile)
    }))
  }
}

function generateGenericReason(rec: ScoredRecommendation, profile: UserProfile): string {
  const { candidate, breakdown } = rec

  if (breakdown.authorScore > 0) {
    return `By ${candidate.author}, one of your favorite authors`
  }

  if (breakdown.genreScore > 20) {
    const matchingGenre = candidate.genres.find(g => profile.favoriteGenres[g])
    return `Highly rated ${matchingGenre} that matches your reading preferences`
  }

  if (breakdown.ratingScore > 40) {
    return `Exceptional ${candidate.compositeRating}/5.0 rating from ${candidate.ratingCount.toLocaleString()} readers`
  }

  return `Top-rated book that matches your interests`
}
```

**Deliverable:** Full recommendation engine with personalized scoring

---

### Phase 3: API Endpoints (Week 3)

**Task 1: For You Recommendations Endpoint**

```typescript
// src/api-v3/recommendations.ts
import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Env } from '../types/env'
import type { RequestContext } from '../middleware/request-context'
import { SuccessResponseSchema } from '@bookstrack/schemas'
import { analyzeUserProfile } from '../services/profile-analyzer'
import { generateCandidates, scoreAndRank } from '../services/recommendation-engine'
import { generateReasons } from '../services/recommendation-reasons'

const RecommendationItemSchema = z.object({
  workKey: z.string(),
  isbn: z.string().optional(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().url().optional(),
  genres: z.array(z.string()),
  rating: z.number(),
  ratingCount: z.number(),
  reason: z.string(),
  score: z.number()
})

const ForYouRecommendationsSchema = z.object({
  recommendations: z.array(RecommendationItemSchema),
  count: z.number(),
  profile: z.object({
    favoriteGenres: z.record(z.number()),
    favoriteAuthors: z.array(z.string()),
    totalBooksRead: z.number()
  }),
  generatedAt: z.string()
})

const forYouRoute = createRoute({
  method: 'get',
  path: '/v3/recommendations/for-you',
  tags: ['Recommendations'],
  summary: 'Get personalized recommendations',
  description: 'Returns books tailored to user reading history and preferences',
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20)
    })
  },
  responses: {
    200: {
      description: 'Personalized recommendations',
      content: { 'application/json': { schema: SuccessResponseSchema(ForYouRecommendationsSchema) } }
    }
  }
})

export function registerPersonalizedRecommendations(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>
) {
  app.openapi(forYouRoute, async (c) => {
    const ctx = c.get('ctx')
    const { limit } = c.req.valid('query')

    // Hardcoded user for now
    const userId = 'justin'

    // Check cache first
    const cacheKey = `recommendations:for-you:${userId}`
    const cached = await c.env.CACHE.get(cacheKey, 'json')

    if (cached) {
      return c.json({
        success: true,
        data: cached,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          source: 'kv-cache',
          cached: true,
          processingTime: Date.now() - ctx.startTime
        }
      })
    }

    // Step 1: Analyze user profile
    const profile = await analyzeUserProfile(userId, c.env)

    // Step 2: Generate candidates
    const candidates = await generateCandidates(profile, c.env)

    // Step 3: Score and rank
    const scored = scoreAndRank(candidates, profile)

    // Step 4: Generate personalized reasons
    const withReasons = await generateReasons(scored.slice(0, limit), profile, c.env)

    const result = {
      recommendations: withReasons.map(rec => ({
        workKey: rec.candidate.workKey,
        title: rec.candidate.title,
        author: rec.candidate.author,
        genres: rec.candidate.genres,
        rating: rec.candidate.compositeRating,
        ratingCount: rec.candidate.ratingCount,
        reason: rec.reason,
        score: rec.score
      })),
      count: withReasons.length,
      profile: {
        favoriteGenres: profile.favoriteGenres,
        favoriteAuthors: profile.favoriteAuthors,
        totalBooksRead: profile.totalBooksRead
      },
      generatedAt: new Date().toISOString()
    }

    // Cache for 24 hours
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: 24 * 60 * 60
    })

    return c.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        source: 'personalized-engine',
        cached: false,
        processingTime: Date.now() - ctx.startTime
      }
    })
  })
}
```

**Task 2: Update Weekly Recommendations to Use Ratings**

```typescript
// src/cron/recommendations-cron.ts
// Update fetchCandidateBooks to filter by composite_rating

async function fetchCandidateBooks(env: Env): Promise<CandidateBook[]> {
  // Option 1: Fetch from Alexandria top-rated
  const topRated = await alexandriaClient(env).works['top-rated'].$get({
    query: { type: 'composite', limit: '100', minCount: '100' }
  })

  if (topRated.ok) {
    const data = await topRated.json()
    return data.topRated.map(work => ({
      isbn: work.isbn,
      title: work.title,
      author: work.authorNames?.[0] || 'Unknown',
      coverUrl: work.coverUrl,
      categories: work.genres?.join(', '),
      description: work.description
    }))
  }

  // Fallback to existing D1 query
  return fetchFromD1(env)
}
```

**Task 3: Register Routes**

```typescript
// src/api-v3/index.ts
import { registerPersonalizedRecommendations } from './recommendations'
import { registerInteractionsRoutes } from './interactions'

// ... existing imports

export function createV3Router(app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>) {
  // ... existing routes

  registerPersonalizedRecommendations(app)
  registerInteractionsRoutes(app)

  return app
}
```

**Deliverable:** Production-ready personalized recommendations API

---

### Phase 4: Frontend Integration (Week 4)

**iOS App Changes Required:**

```swift
// BooksTrackerPackage/Sources/BooksTrackerFeature/Services/RecommendationsService.swift

actor PersonalizedRecommendationsService {
    func fetchForYou() async throws -> ForYouResponse {
        let url = APIEndpoint.forYouRecommendations.url
        // ... fetch logic
    }
}

// New interaction logging
func logInteraction(workKey: String, action: InteractionAction, rating: Int?) async throws {
    let url = APIEndpoint.logInteraction.url
    let body = InteractionRequest(
        workKey: workKey,
        action: action.rawValue,
        personalRating: rating,
        source: "recommendation"
    )
    // ... POST logic
}
```

**Deliverable:** Full iOS integration

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/recommendation-engine.test.ts
import { describe, it, expect } from 'vitest'
import { scoreAndRank } from '../../src/services/recommendation-engine'

describe('Recommendation Engine - Scoring', () => {
  it('should prioritize books by favorite authors', () => {
    const candidates = [
      { workKey: 'A', author: 'Isaac Asimov', genres: ['Sci-Fi'], compositeRating: 4.0, ratingCount: 500 },
      { workKey: 'B', author: 'Unknown', genres: ['Sci-Fi'], compositeRating: 4.5, ratingCount: 1000 }
    ]

    const profile = {
      userId: 'test',
      favoriteGenres: { 'Sci-Fi': 0.8 },
      dislikedGenres: {},
      favoriteAuthors: ['Isaac Asimov'],
      totalBooksRead: 50,
      avgPersonalRating: 4.2,
      minCompositeRating: 3.5
    }

    const scored = scoreAndRank(candidates, profile)

    expect(scored[0].candidate.workKey).toBe('A')  // Author match wins
  })
})
```

### Integration Tests

```bash
# Test personalized recommendations
curl -X GET "https://api.oooefam.net/v3/recommendations/for-you?limit=5" \
  -H "Authorization: Bearer ..."

# Expected:
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "workKey": "OL123W",
        "title": "Foundation",
        "author": "Isaac Asimov",
        "reason": "By Isaac Asimov, one of your favorite sci-fi authors",
        "score": 87.5
      }
    ],
    "count": 5
  }
}

# Test interaction logging
curl -X POST "https://api.oooefam.net/v3/interactions" \
  -H "Content-Type: application/json" \
  -d '{
    "workKey": "OL123W",
    "action": "save",
    "source": "recommendation",
    "recommendationReason": "..."
  }'
```

---

## Deployment Checklist

- [ ] D1 migrations applied (local + production)
- [ ] Alexandria ratings endpoints accessible
- [ ] Profile analyzer tested with real library data
- [ ] Recommendation engine returns diverse results
- [ ] Gemini API key configured
- [ ] KV cache TTLs set correctly (24h for personalized)
- [ ] OpenAPI spec updated
- [ ] Integration tests passing
- [ ] Deploy to production
- [ ] Monitor error rates for 24h
- [ ] Update GitHub issue #131

---

## Success Metrics

**Week 1:**
- ✅ User profiles auto-generated from library
- ✅ Interaction logging working

**Week 2:**
- ✅ Recommendation engine returns 20 candidates
- ✅ Scoring algorithm weights preferences correctly

**Week 3:**
- ✅ `/v3/recommendations/for-you` endpoint live
- ✅ Gemini reasons generation <2s
- ✅ Cache hit ratio >80%

**Week 4:**
- ✅ iOS app displaying personalized recommendations
- ✅ User can skip/save/rate recommendations
- ✅ Profile updates on interactions

---

## Cost Estimate

**Per-user costs (monthly):**
- Gemini API: ~$2-5 (20 recommendations × ~4 refreshes)
- D1 reads: Negligible (cached heavily)
- KV writes: ~100 writes/month (cache refreshes)
- Alexandria RPC: Free (internal)

**Total: ~$5-10/month for multi-user system**

---

## Future Enhancements

1. **Collaborative Filtering** - "Users like you also enjoyed..."
2. **Time-of-Day Recommendations** - Different suggestions for morning vs evening
3. **Mood-Based Filtering** - "I want something light" vs "challenge me"
4. **Series Completion** - Suggest next book in series
5. **Social Features** - See what friends are reading
6. **A/B Testing** - Compare algorithm variations

---

## Related Documentation

- [Alexandria Ratings Plan](./RATINGS_IMPLEMENTATION_PLAN_ALEXANDRIA.md)
- [GitHub Issue #131](https://github.com/jukasdrj/bendv3/issues/131)
- [V3 API Documentation](/v3/docs)

---

**Last Updated:** December 30, 2025
**Next Review:** After Alexandria Phase 1 completion
