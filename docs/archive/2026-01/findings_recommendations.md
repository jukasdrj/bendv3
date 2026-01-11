# Findings: Book Recommendation System

**Date**: 2026-01-09
**Task**: Implement recommendation system in bendv3
**Status**: Phase 1 - Research

---

## Alexandria Metadata Analysis (Completed)

### Coverage Stats
- **19.5 million works** with subject metadata
- **100% coverage** among works with subjects
- **3.46 subjects per book** on average
- **61,487 enriched editions** with subject arrays

### Genre Distribution
| Genre | Book Count |
|-------|------------|
| Romance | 123,187 |
| Mystery | 61,378 |
| Fantasy | 53,905 |
| Thriller | 38,356 |
| Science Fiction | 37,057 |

### Subject Variations Found
**Romance variations**:
- "Fiction, romance, general" (123K)
- "Romance" (18K)
- "Romance fiction" (5.9K)
- "Romances" (4.5K)

**Fantasy variations**:
- "Fiction, fantasy, general" (54K)
- "Fantasy fiction" (17K)
- "Fantasy" (12K)

**Science Fiction variations**:
- "Fiction, science fiction, general" (37K)
- "Science fiction" (17K)
- "American Science fiction" (5.2K)

### Normalization Strategy
```typescript
function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/^fiction,?\s+/gi, '')   // Remove "Fiction, " prefix
    .replace(/,?\s+general$/gi, '')   // Remove ", general" suffix
    .replace(/\s+fiction$/gi, '')     // Remove " fiction" suffix
    .trim();
}

// Examples:
// "Fiction, romance, general" → "romance"
// "Fantasy fiction" → "fantasy"
// "Science fiction" → "science"
```

---

## bendv3 Architecture Research

### Current State ✅ RESEARCHED
- ✅ **D1 Database**: `bookstrack-library` (binding: DB)
- ✅ **Ratings Already Exist**: `user_library.rating` (1-5 stars)
- ✅ **Weekly Recs Table**: `recommendations` already exists
- ✅ **Alexandria Binding**: Service binding configured (ALEXANDRIA)
- ✅ **Vectorize**: `BOOK_VECTORS` for semantic search

### Existing Schema Discovery

**user_library** (ratings already here!):
```sql
CREATE TABLE user_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,
  status TEXT CHECK(status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),  -- ⭐ Ratings exist!
  notes TEXT,
  ...
);
```

**KEY INSIGHT**: No need to create ratings table, just add preferences!

---

## Subject Querying Strategy

### Option 1: Direct PostgreSQL Access (Alexandria)
bendv3 directly queries Alexandria's PostgreSQL database via Hyperdrive:

**Pros**:
- Direct access to 19.5M works
- Can use complex SQL queries
- Full JSONB query capabilities

**Cons**:
- Tight coupling to Alexandria's database
- Need to manage Hyperdrive connection in bendv3
- Duplicate connection infrastructure

### Option 2: Alexandria API Endpoints (Recommended)
Create helper endpoints in Alexandria that bendv3 calls:

**Endpoints needed**:
```
GET /api/works/subjects?keys=/works/OL123W,/works/OL456W
→ Returns subjects for multiple work keys

GET /api/works/similar?subjects=fantasy,magic&exclude=/works/OL123W&limit=100
→ Returns similar works by subject
```

**Pros**:
- Clean separation of concerns
- Alexandria owns data access logic
- Can cache results in Alexandria
- Easier to optimize queries centrally

**Cons**:
- Extra HTTP roundtrip
- Need to build new Alexandria endpoints

### Decision: Option 2 (Alexandria API)
**Rationale**: Maintains clean architecture, Alexandria remains single source of truth for book data

---

## D1 Schema Design ✅ IMPLEMENTED

### Table: user_library (EXISTING - HAS RATINGS!)

```sql
CREATE TABLE user_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  isbn TEXT NOT NULL,
  status TEXT CHECK(status IN ('to_read', 'reading', 'completed', 'dnf')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),  -- ⭐ USE THIS!
  notes TEXT,
  ...
);
```

**Key insight**: Ratings already exist! Use `user_library.rating` for recommendations.

### Table: user_reading_preferences (NEW - CREATED!)

```sql
CREATE TABLE user_reading_preferences (
  user_id TEXT PRIMARY KEY,
  preferred_subjects TEXT,         -- JSON array: ["fantasy", "magic", "romance"]
  excluded_subjects TEXT,          -- JSON array: ["horror", "erotica"]
  preferred_authors TEXT,          -- JSON array: ["Brandon Sanderson"]
  excluded_authors TEXT,           -- JSON array: []
  mood TEXT,                       -- "epic", "light", "dark", "cozy"
  page_count_min INTEGER,
  page_count_max INTEGER,
  publication_year_min INTEGER,
  publication_year_max INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Rationale**:
- One row per user (PRIMARY KEY on user_id)
- JSON arrays for flexible lists
- Constraints as explicit columns for easy filtering
- Can be NULL (not all users set preferences)

---

## Recommendation Algorithm Design

### Step 1: Fetch User's Rated Books
```sql
SELECT work_key, score, tags
FROM user_book_ratings
WHERE user_id = ?
  AND score >= 3
ORDER BY score DESC, rated_at DESC;
```

### Step 2: Get Subjects from Alexandria
```typescript
const workKeys = ratedBooks.map(r => r.work_key);
const response = await alexandriaClient.getSubjects(workKeys);
// Returns: { work_key: string, subjects: string[] }[]
```

### Step 3: Build Preference Vector
```typescript
interface PreferenceVector {
  subjects: Map<string, number>;  // subject → weight
  topSubjects: string[];          // Top 10 subjects
}

function buildPreferenceVector(ratedBooks, subjects): PreferenceVector {
  const subjectWeights = new Map<string, number>();

  for (const book of ratedBooks) {
    const weight = book.score === 5 ? 2.0 :
                   book.score === 4 ? 1.5 :
                   book.score === 3 ? 1.0 : 0.5;

    const bookSubjects = subjects.find(s => s.work_key === book.work_key);
    for (const subject of bookSubjects.subjects) {
      const normalized = normalizeSubject(subject);
      subjectWeights.set(
        normalized,
        (subjectWeights.get(normalized) || 0) + weight
      );
    }
  }

  const topSubjects = Array.from(subjectWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([subject]) => subject);

  return { subjects: subjectWeights, topSubjects };
}
```

### Step 4: Find Similar Books
```typescript
const candidates = await alexandriaClient.findSimilar({
  subjects: preferences.topSubjects,
  excludeWorkKeys: ratedBooks.map(r => r.work_key),
  limit: 100
});
```

### Step 5: Score Candidates
```typescript
function scoreCandidate(
  candidate: Work,
  preferences: PreferenceVector
): number {
  let score = 0;

  // Subject overlap (60% weight)
  const matchedSubjects = candidate.subjects.filter(s => {
    const normalized = normalizeSubject(s);
    return preferences.topSubjects.includes(normalized);
  });
  const overlapScore = matchedSubjects.length / preferences.topSubjects.length;
  score += overlapScore * 0.60;

  // Weighted subject match (20% weight)
  const weightedScore = candidate.subjects
    .map(s => preferences.subjects.get(normalizeSubject(s)) || 0)
    .reduce((sum, w) => sum + w, 0);
  const maxWeight = Array.from(preferences.subjects.values())
    .reduce((sum, w) => sum + w, 0);
  score += (weightedScore / maxWeight) * 0.20;

  // Diversity bonus (20% weight)
  const hasUniqueSubjects = candidate.subjects.some(s => {
    const normalized = normalizeSubject(s);
    return !preferences.topSubjects.includes(normalized);
  });
  if (hasUniqueSubjects) score += 0.20;

  return Math.min(score, 1.0);
}
```

### Step 6: Generate Explanations
```typescript
function generateReasons(
  candidate: Work,
  preferences: PreferenceVector,
  ratedBooks: RatedBook[]
): string[] {
  const reasons: string[] = [];

  // Genre match
  const matchedSubjects = candidate.subjects
    .filter(s => preferences.topSubjects.includes(normalizeSubject(s)))
    .slice(0, 2);
  if (matchedSubjects.length > 0) {
    reasons.push(`Matches your love of ${matchedSubjects.join(' and ')}`);
  }

  // Similar to highly rated book
  const similarBook = findMostSimilar(candidate, ratedBooks);
  if (similarBook && similarBook.score >= 4) {
    reasons.push(`Similar to ${similarBook.title} (${similarBook.score} stars)`);
  }

  // Popularity signal
  if (candidate.ratings_count > 5000) {
    reasons.push(`Popular with readers (${candidate.ratings_count.toLocaleString()} ratings)`);
  }

  return reasons.slice(0, 3);  // Max 3 reasons
}
```

---

## Cold Start Strategy

For users with <3 ratings, use preferences only:

```typescript
async function getColdStartRecommendations(
  userId: string
): Promise<Recommendation[]> {
  const prefs = await db.getUserPreferences(userId);

  if (!prefs || !prefs.preferred_subjects) {
    // Show onboarding flow
    return [];
  }

  // Get popular books in preferred subjects
  const candidates = await alexandriaClient.findSimilar({
    subjects: JSON.parse(prefs.preferred_subjects),
    minRatings: 1000,  // Only popular books
    limit: 50
  });

  // Score by subject match only
  return candidates
    .map(c => scoreBySubjectMatch(c, prefs))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
```

---

## Performance Considerations

### Expected Bottlenecks
1. **Alexandria API calls**: 2-3 roundtrips per recommendation request
2. **Subject normalization**: Processing 100+ candidates
3. **Scoring algorithm**: O(n*m) where n=candidates, m=subjects

### Mitigation Strategies

**Caching in KV**:
```typescript
// Cache user preference vector for 1 hour
const cacheKey = `prefs:${userId}`;
const cached = await env.KV.get(cacheKey);
if (cached) {
  preferences = JSON.parse(cached);
} else {
  preferences = await buildPreferenceVector(...);
  await env.KV.put(cacheKey, JSON.stringify(preferences), {
    expirationTtl: 3600
  });
}
```

**Batch Alexandria calls**:
```typescript
// Single call for all work subjects instead of per-book
const subjects = await alexandriaClient.getSubjects(workKeys);
// Single call for similar books instead of per-subject
const candidates = await alexandriaClient.findSimilar({
  subjects: topSubjects,
  limit: 100
});
```

**Target Performance**:
- Preference vector build: <100ms
- Alexandria API calls: <1s total
- Scoring: <100ms
- **Total**: <2s end-to-end

---

## Open Questions

### Q1: User Authentication
- How are users identified in bendv3?
- Is there a session/JWT system?
- What's the user_id format?

**Action**: Research bendv3 auth system

### Q2: Alexandria API Design
- Should we create generic subject query endpoints?
- Or specific recommendation-focused endpoints?
- What's the best way to handle JSONB querying?

**Action**: Design Alexandria API contract

### Q3: UI Framework
- Is bendv3 using React, Svelte, or vanilla?
- Where do components live?
- What's the styling approach?

**Action**: Explore bendv3 frontend structure

### Q4: Testing Strategy
- Unit tests for algorithm?
- Integration tests with Alexandria?
- E2E tests for UI?

**Action**: Review bendv3 testing patterns

---

## Next Steps

1. **Research bendv3 structure**:
   - Explore codebase to answer open questions
   - Document findings here

2. **Design Alexandria API**:
   - Propose endpoints in Alexandria repo
   - Get feedback on API contract

3. **Create D1 migrations**:
   - Write SQL for ratings tables
   - Test locally

4. **Prototype algorithm**:
   - Build scoring function
   - Test with sample data

---

## Alexandria API Design (Phase 2 Complete) ✅

### Architectural Patterns Discovered

**Routing Pattern** (Hono + OpenAPI):
- Use `@hono/zod-openapi` with `createRoute()` for type-safe endpoints
- Request-scoped database connections: `c.get('sql')`
- Validation via Zod schemas with `.openapi()` extensions
- Consistent response envelopes: `createSuccessResponse()` / `createErrorResponse()`

**Database Patterns**:
- **Request-scoped connections**: `c.get('sql')` from middleware (postgres-js)
- **Single connection per request**: Hyperdrive handles pooling
- **Parallel queries**: Use `Promise.all([countQuery, dataQuery])`
- **Dynamic thresholds**: Tune based on query characteristics
- **Work memory**: `SET LOCAL work_mem = '256MB'` for expensive operations

**Response Structure**:
```typescript
{
  success: true,
  data: { /* payload */ },
  meta: {
    requestId: string,
    timestamp: ISO-8601,
    latencyMs: number
  }
}
```

**Error Handling**:
- Machine-readable error codes: `ErrorCode.NOT_FOUND`, `ErrorCode.DATABASE_ERROR`
- HTTP status mapping via `ERROR_STATUS_MAP`
- Consistent error envelope structure
- Logger integration for error tracking

**Caching Strategy**:
- KV namespace: `c.env.CACHE`
- Type-specific TTLs: ISBN (24h), Author (1h), Title (1h)
- Cache key format: `combined:v1:{type}:{normalized}:l{limit}:o{offset}`
- Graceful cache failures (log + continue)
- `nocache` query param to bypass

**Query Type Detection**:
- 3-stage cascade: ISBN → Author → Title
- ISBN: Regex pattern matching (<1ms)
- Author: Heuristic filter + DB lookup using `normalize_author_name()` function
- Title: Fuzzy search with GIN trigram indexes (`WHERE title % $1`)
- Confidence levels: high, medium, low

### User Decisions (Phase 2 Clarification)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Identifier format | Both (flexible) | Accept ISBNs or work_keys with auto-detection |
| Missing subjects | Skip silently | Return null, let bendv3 filter out |
| Caching | Long TTL (24h) | Subject data very stable |
| Response format | Full metadata | One-stop response with complete BookResult objects |

### Endpoint Design

**Endpoint 1: Get Subjects for Books**
```
GET /api/recommendations/subjects?ids=9780439064873,/works/OL82563W
```

**Purpose**: Fetch subjects for user's rated books (batch operation)

**Request Schema**:
```typescript
{
  ids: string[],        // ISBNs or work_keys (comma-separated)
  limit?: number        // Max results per ID (default: 1)
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    results: [
      {
        id: "9780439064873",    // Original ID from request
        type: "isbn" | "work",
        work_key: "/works/OL82563W",
        title: "Harry Potter and the Sorcerer's Stone",
        subjects: ["Fantasy", "Magic", "Wizards", ...],
        match_source: "enriched_works" | "works_fallback"
      }
    ],
    total: number,
    missing: string[]    // IDs with no subject data
  },
  meta: { ... }
}
```

**Query Strategy**:
1. Detect ID type (ISBN pattern or work_key format)
2. For ISBNs: `edition_isbns` → `enriched_editions` → join `enriched_works`
3. For work_keys: Query `enriched_works` directly
4. Extract `subject_tags` array from enriched_works
5. Fallback to `works.data->'subjects'` (JSONB) if enriched_works empty

**Cache**: 24 hours (subject data stable)

---

**Endpoint 2: Find Similar Books by Subjects**
```
GET /api/recommendations/similar?subjects=fantasy,magic&exclude=/works/OL82563W&limit=100
```

**Purpose**: Find candidate books matching user's subject preferences

**Request Schema**:
```typescript
{
  subjects: string[],           // Normalized subject tags
  exclude?: string[],           // Work keys to exclude (already rated)
  limit?: number,               // Max results (default: 100)
  min_subject_overlap?: number  // Min matching subjects (default: 1)
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    results: [
      {
        work_key: "/works/OL123W",
        title: "The Name of the Wind",
        isbn: "9780756404079",
        subjects: ["Fantasy", "Magic", "Adventure"],
        subject_match_count: 2,
        authors: [ ... ],
        publish_date: "2007",
        cover_url: "...",
        openlibrary_work: "..."
      }
    ],
    query: {
      subjects: ["fantasy", "magic"],
      excluded_count: 5
    },
    total: number
  },
  meta: { ... }
}
```

**Query Strategy**:
1. Query `enriched_works` WHERE `subject_tags` overlaps with input subjects
2. Join `enriched_editions` for ISBN and metadata
3. Join `enriched_authors` for author data
4. Calculate `subject_match_count` (overlap score)
5. ORDER BY match count DESC, publication_date DESC
6. Apply exclusion list (work_keys to skip)

**PostgreSQL Pattern**:
```sql
SELECT
  w.work_key,
  w.title,
  w.subject_tags,
  e.isbn,
  (SELECT COUNT(*)
   FROM unnest(w.subject_tags) s
   WHERE s = ANY($1::text[])
  ) as subject_match_count
FROM enriched_works w
JOIN enriched_editions e ON e.work_key = w.work_key
LEFT JOIN author_works aw ON w.work_key = aw.work_key
LEFT JOIN enriched_authors a ON aw.author_key = a.author_key
WHERE w.subject_tags && $1::text[]     -- Array overlap operator
  AND w.work_key != ALL($2::text[])    -- Exclusion list
GROUP BY w.work_key, e.isbn
HAVING COUNT(DISTINCT CASE WHEN a.author_key IS NOT NULL THEN 1 END) > 0
ORDER BY subject_match_count DESC
LIMIT $3;
```

**Cache**: 24 hours (results stable for given subject combination)

---

### Performance Optimizations

**Batch Operations**:
- Accept up to 100 IDs per request (aligned with queue batch limits)
- Use `WHERE id = ANY($1::text[])` for efficient batch queries
- Parallel query execution with `Promise.all()`

**Index Requirements**:
- GIN index on `enriched_works.subject_tags` (array overlap queries)
- Existing trigram indexes on titles
- `edition_isbns.isbn` already indexed

**Expected Performance**:
- Subject fetch (10 ISBNs): <50ms
- Similar books (3 subjects, 100 results): <200ms
- Cache hit: <5ms

---

**Last Updated**: 2026-01-09
**Next Phase**: Implement Alexandria API endpoints (Phase 5)
