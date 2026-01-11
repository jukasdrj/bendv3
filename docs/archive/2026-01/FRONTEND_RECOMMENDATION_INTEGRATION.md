# Frontend Integration Guide: Recommendation System

**Target Audience**: Frontend developers working on bookstrack-web (Next.js/React)
**Purpose**: Integrate personalized book recommendations into the UI
**Status**: bendv3 API v3.4.0 ready, endpoints deployed

---

## Overview

The recommendation system provides personalized book suggestions based on:
- User reading preferences (genres, mood, constraints)
- User ratings (books rated 4-5 stars)
- Content-based filtering using Alexandria's subject metadata

**Architecture**:
```
User → Frontend → bendv3 API → Alexandria (via service binding)
                    ↓
                D1 Database (preferences + ratings)
```

---

## API Endpoints

### 1. GET `/api/recommendations`

Get personalized recommendations for the current user.

**Request**:
```typescript
GET /api/recommendations?limit=10&exclude=9780439064873,9780439136358

Headers:
  x-user-id: {user_id}  // TODO: Replace with actual auth token
```

**Query Parameters**:
- `limit` (optional): Number of recommendations (default: 10, max: 50)
- `exclude` (optional): Comma-separated ISBNs to exclude (e.g., already in library)

**Response**:
```typescript
{
  success: true,
  data: {
    recommendations: [
      {
        book: {
          work_key: "/works/OL82563W",
          title: "Harry Potter and the Philosopher's Stone",
          isbn: "9780439064873",
          subjects: ["fantasy", "magic", "wizards"],
          subject_match_count: 3,
          authors: [
            {
              name: "J.K. Rowling",
              key: "/authors/OL23919A",
              openlibrary: "https://openlibrary.org/authors/OL23919A"
            }
          ],
          publish_date: "1998-09-01",
          publishers: "Scholastic",
          pages: 309,
          cover_url: "https://alexandria.ooheynerds.com/covers/9780439064873/large",
          cover_source: "r2",
          openlibrary_work: "https://openlibrary.org/works/OL82563W",
          openlibrary_edition: "https://openlibrary.org/books/OL26331930M"
        },
        score: 85.5,
        reasons: [
          "Strong match: fantasy, magic, wizards",
          "By J.K. Rowling",
          "3 shared themes"
        ]
      },
      // ... more recommendations
    ],
    total: 10,
    strategy: "preference_based" | "cold_start"
  }
}
```

**Error Response**:
```typescript
{
  success: false,
  error: "Cannot generate recommendations: No ratings or preferences found"
}
```

---

### 2. GET `/api/recommendations/debug`

Same as above but includes scoring breakdown and debug information.

**Additional Fields in Response**:
```typescript
{
  success: true,
  data: {
    recommendations: [
      {
        book: { /* ... */ },
        score: 85.5,
        reasons: [ /* ... */ ],
        breakdown: {
          subject_match: 51.0,    // 0-60 points
          preference_match: 15.0, // 0-20 points
          diversity_bonus: 0.0    // 0-20 points
        }
      }
    ],
    total: 10,
    strategy: "preference_based",
    debug: {
      user_subjects: ["fantasy", "magic", "mystery"],
      preference_subjects: ["fantasy", "science fiction"],
      candidate_count: 87
    }
  }
}
```

---

## TypeScript Types

If bendv3 publishes an npm package with types (recommended), import directly:

```typescript
// Future: Once bendv3-client is published
import type {
  RecommendationResponse,
  ScoredRecommendation,
  RecommendationStrategy
} from '@ooheynerds/bendv3-client'
```

**Manual Types** (until npm package exists):

```typescript
// types/recommendations.ts

import type { SimilarBook } from 'alexandria-worker'

export interface ScoredRecommendation {
  book: SimilarBook
  score: number
  reasons: string[]
  breakdown?: {
    subject_match: number
    preference_match: number
    diversity_bonus: number
  }
}

export type RecommendationStrategy = 'preference_based' | 'cold_start'

export interface RecommendationResponse {
  success: boolean
  data: {
    recommendations: ScoredRecommendation[]
    total: number
    strategy: RecommendationStrategy
    debug?: {
      user_subjects: string[]
      preference_subjects: string[]
      candidate_count: number
    }
  }
}

export interface RecommendationError {
  success: false
  error: string
}
```

---

## Frontend Implementation

### Step 1: API Client Setup

Create a recommendations API client:

```typescript
// lib/api/recommendations.ts

import type {
  RecommendationResponse,
  RecommendationError
} from '@/types/recommendations'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.oooefam.net'

export interface GetRecommendationsOptions {
  limit?: number
  exclude?: string[] // ISBNs to exclude
}

export async function getRecommendations(
  options: GetRecommendationsOptions = {}
): Promise<RecommendationResponse> {
  const { limit = 10, exclude = [] } = options

  const params = new URLSearchParams({
    limit: limit.toString(),
  })

  if (exclude.length > 0) {
    params.set('exclude', exclude.join(','))
  }

  const response = await fetch(`${API_BASE_URL}/api/recommendations?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add actual auth token
      'x-user-id': 'current-user-id',
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const error: RecommendationError = await response.json()
    throw new Error(error.error || 'Failed to fetch recommendations')
  }

  return response.json()
}

export async function getRecommendationsDebug(
  options: GetRecommendationsOptions = {}
): Promise<RecommendationResponse> {
  const { limit = 10, exclude = [] } = options

  const params = new URLSearchParams({
    limit: limit.toString(),
  })

  if (exclude.length > 0) {
    params.set('exclude', exclude.join(','))
  }

  const response = await fetch(
    `${API_BASE_URL}/api/recommendations/debug?${params}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'current-user-id',
      },
      credentials: 'include',
    }
  )

  if (!response.ok) {
    const error: RecommendationError = await response.json()
    throw new Error(error.error || 'Failed to fetch recommendations')
  }

  return response.json()
}
```

---

### Step 2: React Hook (for Next.js App Router)

```typescript
// hooks/useRecommendations.ts

import { useQuery } from '@tanstack/react-query'
import { getRecommendations, type GetRecommendationsOptions } from '@/lib/api/recommendations'

export function useRecommendations(options: GetRecommendationsOptions = {}) {
  return useQuery({
    queryKey: ['recommendations', options],
    queryFn: () => getRecommendations(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
  })
}
```

---

### Step 3: Recommendation Card Component

```tsx
// components/RecommendationCard.tsx

import type { ScoredRecommendation } from '@/types/recommendations'
import Image from 'next/image'
import Link from 'next/link'

interface RecommendationCardProps {
  recommendation: ScoredRecommendation
  onAddToLibrary?: (isbn: string) => void
}

export function RecommendationCard({
  recommendation,
  onAddToLibrary,
}: RecommendationCardProps) {
  const { book, score, reasons } = recommendation

  return (
    <div className="flex gap-4 p-4 border rounded-lg hover:shadow-md transition-shadow">
      {/* Cover Image */}
      <div className="flex-shrink-0 w-24 h-36 relative">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={book.title}
            fill
            className="object-cover rounded"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
            <span className="text-gray-400 text-xs">No cover</span>
          </div>
        )}
      </div>

      {/* Book Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/books/${book.isbn || book.work_key}`}
          className="font-semibold text-lg hover:text-blue-600 line-clamp-2"
        >
          {book.title}
        </Link>

        {book.authors.length > 0 && (
          <p className="text-sm text-gray-600 mt-1">
            by {book.authors.map((a) => a.name).join(', ')}
          </p>
        )}

        {/* Match Score */}
        <div className="flex items-center gap-2 mt-2">
          <div className="text-sm font-medium text-green-600">
            {Math.round(score)}% match
          </div>
          <div className="h-2 flex-1 max-w-[100px] bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Reasons */}
        {reasons.length > 0 && (
          <div className="mt-2 space-y-1">
            {reasons.map((reason, idx) => (
              <p key={idx} className="text-xs text-gray-500 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                {reason}
              </p>
            ))}
          </div>
        )}

        {/* Action Button */}
        {onAddToLibrary && book.isbn && (
          <button
            onClick={() => onAddToLibrary(book.isbn!)}
            className="mt-3 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add to Library
          </button>
        )}
      </div>
    </div>
  )
}
```

---

### Step 4: Recommendations Page

```tsx
// app/recommendations/page.tsx

'use client'

import { useState } from 'react'
import { useRecommendations } from '@/hooks/useRecommendations'
import { RecommendationCard } from '@/components/RecommendationCard'

export default function RecommendationsPage() {
  const [limit] = useState(10)
  const [excludedIsbns, setExcludedIsbns] = useState<string[]>([])

  const { data, isLoading, error } = useRecommendations({
    limit,
    exclude: excludedIsbns,
  })

  const handleAddToLibrary = async (isbn: string) => {
    // TODO: Implement add to library
    console.log('Add to library:', isbn)

    // Exclude from future recommendations
    setExcludedIsbns([...excludedIsbns, isbn])
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Your Recommendations</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Your Recommendations</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            {error instanceof Error ? error.message : 'Failed to load recommendations'}
          </p>
          {error instanceof Error && error.message.includes('No ratings or preferences') && (
            <p className="text-sm text-red-600 mt-2">
              To get recommendations, please rate some books or set your reading preferences.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!data?.success || !data.data.recommendations.length) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Your Recommendations</h1>
        <div className="bg-gray-50 border rounded-lg p-8 text-center">
          <p className="text-gray-600">No recommendations available yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Rate some books or set your preferences to get started!
          </p>
        </div>
      </div>
    )
  }

  const { recommendations, strategy } = data.data

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Your Recommendations</h1>
        {strategy === 'cold_start' && (
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Based on your preferences
          </span>
        )}
      </div>

      <div className="space-y-4">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.book.work_key}
            recommendation={rec}
            onAddToLibrary={handleAddToLibrary}
          />
        ))}
      </div>

      {recommendations.length < data.data.total && (
        <div className="mt-8 text-center">
          <button
            onClick={() => {/* TODO: Load more */}}
            className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Prerequisites

Before integrating recommendations, ensure these features are implemented:

### 1. User Preferences Management

Users need to set preferences (required for cold start):

```typescript
// API endpoint: PATCH /api/users/me/preferences
interface UserPreferences {
  preferred_subjects: string[]    // e.g., ["fantasy", "mystery"]
  excluded_subjects: string[]     // e.g., ["horror"]
  preferred_authors: string[]     // e.g., ["/authors/OL23919A"]
  excluded_authors: string[]      // e.g., ["/authors/OL456A"]
  mood?: 'light' | 'dark' | 'epic' | 'cozy' | 'thrilling'
  page_count_min?: number
  page_count_max?: number
  publication_year_min?: number
  publication_year_max?: number
}
```

**UI Component Needed**: Preferences form (genre picker, mood selector, constraints)

### 2. Book Rating System

Users need to rate books (4-5 stars enable preference-based recommendations):

```typescript
// API endpoint: POST /api/users/me/ratings
interface BookRating {
  isbn: string
  title: string
  rating: 1 | 2 | 3 | 4 | 5
}
```

**UI Component Needed**: Star rating widget on book detail pages

### 3. Authentication

Replace `x-user-id` header with actual auth token from your auth system.

---

## Onboarding Flow

Recommended user experience for new users:

### Step 1: Welcome Screen
```
"Welcome to BooksTrack! Let's personalize your reading experience."
[Continue] button
```

### Step 2: Genre Selection
```
"What genres do you enjoy?" (multi-select)
☐ Fantasy
☐ Mystery
☐ Science Fiction
☐ Romance
☐ Thriller
... (show 10-15 popular genres)
```

### Step 3: Mood Selection (Optional)
```
"What's your reading mood?"
○ Light & Fun
○ Dark & Intense
○ Epic Adventures
○ Cozy & Comforting
○ Thrilling & Suspenseful
```

### Step 4: Constraints (Optional)
```
"Any preferences?"
- Page count: [100] to [500] pages
- Published after: [2010]
```

### Step 5: Initial Recommendations
```
"Here are some books you might enjoy!"
[Show 5-10 recommendations]
[Rate each to improve future suggestions]
```

---

## Testing Checklist

Before deploying to production:

### 1. Cold Start Scenario
- [ ] New user with NO ratings
- [ ] User sets preferences only
- [ ] Verify recommendations appear
- [ ] Verify `strategy: "cold_start"` in response

### 2. Preference-Based Scenario
- [ ] User rates 5+ books (4-5 stars)
- [ ] User has preferences set
- [ ] Verify recommendations improve over time
- [ ] Verify `strategy: "preference_based"` in response

### 3. Exclusions
- [ ] Add book to library
- [ ] Verify it's excluded from future recommendations
- [ ] Verify `exclude` query param works

### 4. Error Handling
- [ ] Test with user who has no preferences or ratings
- [ ] Verify friendly error message
- [ ] Prompt user to set preferences or rate books

### 5. Performance
- [ ] Measure API response time (<3s target)
- [ ] Test with slow network conditions
- [ ] Verify loading states display properly

---

## Analytics (Optional)

Track recommendation engagement:

```typescript
// Track when user views recommendations
analytics.track('Recommendations Viewed', {
  count: data.data.total,
  strategy: data.data.strategy,
})

// Track when user adds recommended book
analytics.track('Recommendation Accepted', {
  isbn: book.isbn,
  score: recommendation.score,
  reasons: recommendation.reasons,
})

// Track when user ignores recommendation
analytics.track('Recommendation Dismissed', {
  isbn: book.isbn,
  score: recommendation.score,
})
```

---

## Troubleshooting

### "Cannot generate recommendations: No ratings or preferences found"

**Cause**: User hasn't rated any books or set preferences.

**Fix**:
1. Show onboarding flow to collect preferences
2. Prompt user to rate books in their library
3. Display helpful message with call-to-action

### Empty recommendations array

**Cause**: No books match user's preferences in Alexandria database.

**Fix**:
1. Relax constraints (increase subject overlap tolerance)
2. Expand preferred subjects list
3. Check if Alexandria has books in preferred genres

### Slow response times (>3s)

**Cause**: Complex scoring or large candidate set.

**Fix**:
1. Reduce `limit` parameter
2. Check bendv3 logs for bottlenecks
3. Ensure Alexandria service binding is configured (not external URL)

---

## Future Enhancements

### Phase 2 Features (Not Yet Implemented)
- Semantic search: "Books like X but with more adventure"
- Trending books: Popular recent releases
- Social recommendations: "Books your friends loved"
- Import ratings from Goodreads
- Reading goals integration

### API Improvements
- Pagination for large result sets
- Filtering by publication date, page count
- "More like this" endpoint (single book similarity)
- Weekly recommendation digest (pre-generated)

---

## Questions?

- **bendv3 API docs**: `/v3/docs` (Swagger UI)
- **Alexandria types**: `npm install alexandria-worker@2.4.0`
- **GitHub Issues**: https://github.com/jukasdrj/bookstrack-web/issues

---

**Version**: 1.0.0
**Last Updated**: 2026-01-09
**Authors**: Alexandria & bendv3 teams
