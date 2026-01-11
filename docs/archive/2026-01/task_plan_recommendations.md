# Task Plan: Book Recommendation System in bendv3

**Goal**: Implement personalized book recommendations using Alexandria's subject metadata with D1 storage, content-based filtering algorithm, and UI components.

**Context**:
- Alexandria validation confirmed excellent subject coverage (19.5M works, 3.46 subjects/book)
- Genre tags well-structured: Romance (123K), Mystery (61K), Fantasy (54K), Thriller (38K), Sci-Fi (37K)
- Solo dev project for wife's library system
- Phase 1 focus: Genre/subject matching with foundation for future semantic search

**Success Criteria**:
- [ ] Users can rate books (1-5 stars) in D1
- [ ] Users can set reading preferences (genres, mood)
- [ ] Recommendation algorithm generates 10 personalized suggestions
- [ ] Recommendations display with match scores and explanations
- [ ] System works with 3+ rated books (cold start handled)
- [ ] Response time <3s end-to-end

---

## Phase 1: Database Schema (D1)
**Status**: pending
**Estimated effort**: 2-3 hours

### Tasks
- [ ] Design `user_book_ratings` table schema
- [ ] Design `user_reading_preferences` table schema
- [ ] Create migration file in D1 migrations
- [ ] Add indexes for performance (user_id, isbn)
- [ ] Test migrations in local dev
- [ ] Document schema decisions in findings_recommendations.md

### Deliverables
- `migrations/XXXX_create_ratings_tables.sql`
- Schema documented in findings

### Acceptance Criteria
- Tables created successfully in D1
- Can insert/query ratings via d1 CLI
- Indexes improve query performance

---

## Phase 2: API Endpoints (Hono Routes)
**Status**: pending
**Estimated effort**: 3-4 hours

### Tasks
- [ ] Create Zod schemas for validation (`schemas/recommendation.ts`)
- [ ] Implement POST `/api/users/me/ratings` (create/update rating)
- [ ] Implement GET `/api/users/me/ratings` (fetch user's ratings)
- [ ] Implement PATCH `/api/users/me/preferences` (update preferences)
- [ ] Implement GET `/api/users/me/recommendations` (get recommendations)
- [ ] Add error handling and validation
- [ ] Test endpoints with curl/Postman

### Deliverables
- `src/routes/ratings.ts`
- `src/routes/recommendations.ts`
- `src/schemas/recommendation.ts`

### Acceptance Criteria
- All endpoints return correct status codes
- Validation rejects invalid input
- Errors return helpful messages

---

## Phase 3: Recommendation Algorithm
**Status**: pending
**Estimated effort**: 4-5 hours

### Tasks
- [ ] Create `services/recommendation.ts` module
- [ ] Implement `buildPreferenceVector()` - Extract subjects from rated books
- [ ] Implement `queryCandidates()` - Query Alexandria for similar books
- [ ] Implement `scoreCandidate()` - Multi-factor scoring algorithm
- [ ] Implement `normalizeSubject()` - Handle genre variations
- [ ] Implement `generateReasons()` - Create human-readable explanations
- [ ] Add diversity filter (max 3 books per author)
- [ ] Handle cold start (users with <3 ratings)
- [ ] Unit tests for scoring logic

### Algorithm Details
**Subject Normalization**:
- Lowercase all subjects
- "Fiction, romance, general" → "romance"
- "Fantasy fiction" → "fantasy"

**Scoring Weights**:
- Subject overlap: 60%
- Weighted subject match: 20%
- Diversity bonus: 20%

**Cold Start Strategy**:
- Use onboarding preferences (favorite genres)
- Return popular books in preferred genres

### Deliverables
- `src/services/recommendation.ts`
- `src/lib/subject-utils.ts` (normalization)
- `src/services/recommendation.test.ts` (unit tests)

### Acceptance Criteria
- Algorithm returns 10 recommendations
- Recommendations match user preferences
- Explanations are clear and accurate
- Cold start works for new users

---

## Phase 4: Alexandria Integration
**Status**: pending
**Estimated effort**: 2-3 hours

### Tasks
- [ ] Design data fetch strategy (batch vs individual)
- [ ] Implement Alexandria client (`lib/alexandria-client.ts`)
- [ ] Fetch subjects for rated books from Alexandria works table
- [ ] Fetch candidate books with subject matching
- [ ] Handle Alexandria API errors gracefully
- [ ] Add caching if needed (KV)
- [ ] Test with real Alexandria data

### Alexandria Queries Needed
```sql
-- Get subjects for rated books
SELECT key, data->>'title' as title, data->'subjects' as subjects
FROM works
WHERE key = ANY($1);

-- Find similar books
SELECT key, data->>'title' as title, data->'subjects' as subjects
FROM works
WHERE data->'subjects' ?| $1  -- Array of subjects
  AND key != ALL($2)           -- Exclude rated books
LIMIT 100;
```

### Deliverables
- `src/lib/alexandria-client.ts`
- Error handling for Alexandria downtime

### Acceptance Criteria
- Can fetch subjects from Alexandria
- Can query similar books by subject
- Handles timeouts and errors
- Response time <2s for Alexandria calls

---

## Phase 5: UI Components (React/Svelte)
**Status**: pending
**Estimated effort**: 4-5 hours

### Tasks
- [ ] Create star rating component
- [ ] Create preferences form component
- [ ] Create recommendations display component
- [ ] Create onboarding flow for new users
- [ ] Add loading states
- [ ] Add error states
- [ ] Wire up to API endpoints
- [ ] Test in browser

### Components Needed
1. **StarRating** - 5-star input for rating books
2. **PreferencesForm** - Genre selection, mood picker
3. **RecommendationCard** - Book display with match score
4. **OnboardingFlow** - Genre selection for new users

### Deliverables
- `src/components/StarRating.tsx`
- `src/components/PreferencesForm.tsx`
- `src/components/RecommendationCard.tsx`
- `src/components/Onboarding.tsx`

### Acceptance Criteria
- UI is responsive and accessible
- Loading states show while fetching
- Errors display helpful messages
- Works on mobile and desktop

---

## Phase 6: Integration Testing
**Status**: pending
**Estimated effort**: 2-3 hours

### Tasks
- [ ] End-to-end test: Rate books → Get recommendations
- [ ] Test cold start flow (new user)
- [ ] Test with different preference combinations
- [ ] Test error handling (Alexandria down, no matches)
- [ ] Performance testing (measure response times)
- [ ] Fix any bugs discovered

### Test Scenarios
1. **Happy path**: User rates 5 books, gets 10 recommendations
2. **Cold start**: New user with only preferences, no ratings
3. **Edge case**: User rated 100 books (performance)
4. **Error case**: Alexandria timeout, fallback behavior

### Deliverables
- Test results documented in progress_recommendations.md
- Bug fixes committed

### Acceptance Criteria
- All test scenarios pass
- Response time <3s for recommendations
- No crashes or errors in UI

---

## Phase 7: Deployment & Monitoring
**Status**: pending
**Estimated effort**: 1-2 hours

### Tasks
- [ ] Deploy D1 migrations to production
- [ ] Deploy bendv3 to production
- [ ] Verify Alexandria connectivity in production
- [ ] Test end-to-end in production
- [ ] Add analytics tracking (optional)
- [ ] Document for user (your wife!)

### Deliverables
- Production deployment successful
- User documentation (how to use)

### Acceptance Criteria
- System works in production
- No errors in logs
- User can rate books and see recommendations

---

## Future Enhancements (Phase 2+)
**Status**: future
**Not in current scope**

### Phase 2: Semantic Search
- Use Gemini/Claude for semantic similarity
- "Books like X but with more adventure"
- Embedding-based matching

### Phase 3: Advanced Features
- Reading goals tracking
- Import ratings from Goodreads
- "Books my friends rated highly" (if multi-user)
- Trending books via web scraping

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Subject normalization inconsistent | Poor recommendations | Medium | Test with real data, iterate on rules |
| Alexandria query performance slow | UX degraded | Medium | Add GIN index on subjects, caching |
| Cold start recommendations poor | New users disappointed | High | Curate "popular in genre" fallback |
| D1 query limits hit | System unavailable | Low | Monitor usage, optimize queries |

---

## Current Phase: Phase 1 (Database Schema)
**Next action**: Research bendv3's current D1 schema and design ratings tables

---

## Errors Encountered
_Track all errors here per 3-strike protocol_

| Error | Phase | Attempt | Resolution |
|-------|-------|---------|------------|
| - | - | - | - |

---

## Files Created
_Track all files created during implementation_

| File | Purpose | Status |
|------|---------|--------|
| task_plan_recommendations.md | Master plan | Created |
| findings_recommendations.md | Research & decisions | Pending |
| progress_recommendations.md | Session log | Pending |

---

## Decision Log

### Decision 1: D1 vs KV for Storage
- **Decision**: Use D1 (SQLite)
- **Rationale**: Relational data (ratings linked to users), better for queries
- **Alternatives**: KV would work but harder to query/join

### Decision 2: Algorithm Location
- **Decision**: Recommendation logic lives in bendv3
- **Rationale**: Solo dev, simpler to keep with UI, can iterate faster
- **Alternatives**: Could be in Alexandria but adds coordination overhead

### Decision 3: Subject Normalization Strategy
- **Decision**: Lowercase + remove "Fiction, " prefix + remove ", general" suffix
- **Rationale**: Handles most common variations, simple rules
- **Alternatives**: Could use fuzzy matching but adds complexity

---

**Last Updated**: 2026-01-09
**Status**: Phase 1 starting
**Created by**: planning-with-files skill
