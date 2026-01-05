# Alexandria - Ratings Infrastructure Implementation Plan

**Repo:** `~/dev_repos/alex` (Alexandria Worker)
**Created:** December 30, 2025
**Status:** Planning Phase
**Owner:** @jukasdrj

---

## Overview

Add comprehensive book ratings infrastructure to Alexandria as the canonical data lake for all book metadata. Supports both user ratings (community) and critic ratings (editorial) in a "Rotten Tomatoes for books" model.

**Key Principle:** Alexandria = Stateless Data Service (no user context)

---

## Why Ratings Belong in Alexandria

1. **Data Lake Responsibility:** Alexandria already stores 40M+ works, 54M+ editions
2. **Shared Resource:** Multiple clients (BooksTrack, future apps) benefit from centralized ratings
3. **Bulk Data Integration:** OpenLibrary monthly dumps contain millions of ratings
4. **Consistent Source of Truth:** All apps get same rating data
5. **Scalability:** PostgreSQL can handle millions of rating records efficiently

---

## Data Sources

### Primary: OpenLibrary Bulk Dumps

**Monthly Dumps Available:**
- **Ratings dump** (~5MB): `Work Key, Edition Key, Rating, Date`
- **Reading log dump** (~65MB): `Work Key, Edition Key, Shelf, Date`

**Access:**
- Live: https://openlibrary.org/developers/dumps
- Archive: https://archive.org/details/ol_exports

**Update Frequency:** Generated monthly (1st of each month)

**Coverage:** Millions of user-submitted ratings (1-5 stars)

### Secondary: Google Books API (Real-Time)

**Available Data:**
- `averageRating` (user ratings)
- `ratingsCount` (number of ratings)
- Editorial reviews (source: `EDITORIAL`, `WEB_USER`, `GOOGLE_USER`)

**Integration:** Enrichment fallback for works not in OpenLibrary dumps

### Future: iDreamBooks API (Professional Critics)

**Coverage:** NYTimes, Washington Post, Publishers Weekly
**Type:** Professional critic reviews and ratings
**Status:** Optional enhancement (paid API)

---

## PostgreSQL Schema

### Tables to Add

```sql
-- Work ratings (user + critic)
CREATE TABLE work_ratings (
  work_key TEXT PRIMARY KEY,

  -- User ratings (OpenLibrary + Google Books community)
  user_rating DECIMAL(2,1),              -- 1.0-5.0 average
  user_rating_count INTEGER,             -- Number of user ratings
  user_last_updated TIMESTAMP,           -- Last refresh from source

  -- Critic ratings (Google Books editorial, future: iDreamBooks)
  critic_rating DECIMAL(2,1),            -- 1.0-5.0 average (normalized)
  critic_rating_count INTEGER,           -- Number of critic reviews
  critic_last_updated TIMESTAMP,

  -- Composite score (weighted average for recommendations)
  composite_rating DECIMAL(2,1),         -- Weighted average
  composite_count INTEGER,               -- Total ratings considered
  composite_updated TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (work_key) REFERENCES works(key) ON DELETE CASCADE
);

-- Edition ratings (inherits from work + edition-specific ratings)
CREATE TABLE edition_ratings (
  edition_key TEXT PRIMARY KEY,
  work_key TEXT NOT NULL,

  -- Inherited from work (denormalized for query performance)
  user_rating DECIMAL(2,1),
  critic_rating DECIMAL(2,1),
  composite_rating DECIMAL(2,1),

  -- Edition-specific overrides (if different from work)
  edition_specific_rating DECIMAL(2,1),
  edition_specific_count INTEGER,

  last_updated TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (edition_key) REFERENCES editions(key) ON DELETE CASCADE,
  FOREIGN KEY (work_key) REFERENCES works(key) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_work_ratings_user ON work_ratings(user_rating DESC) WHERE user_rating IS NOT NULL;
CREATE INDEX idx_work_ratings_critic ON work_ratings(critic_rating DESC) WHERE critic_rating IS NOT NULL;
CREATE INDEX idx_work_ratings_composite ON work_ratings(composite_rating DESC) WHERE composite_rating IS NOT NULL;
CREATE INDEX idx_work_ratings_updated ON work_ratings(user_last_updated);

CREATE INDEX idx_edition_ratings_composite ON edition_ratings(composite_rating DESC) WHERE composite_rating IS NOT NULL;
CREATE INDEX idx_edition_ratings_work ON edition_ratings(work_key);
```

### Composite Rating Algorithm

**Weighted Average:**
```typescript
function calculateCompositeRating(
  userRating: number | null,
  userCount: number,
  criticRating: number | null,
  criticCount: number
): number {
  // If only one type available, use that
  if (!userRating) return criticRating || 0
  if (!criticRating) return userRating || 0

  // Weighted average: User ratings get 60%, critic ratings get 40%
  // Higher weight on critics if user count is low
  const userWeight = Math.min(userCount / 100, 0.6)
  const criticWeight = 1 - userWeight

  return (userRating * userWeight) + (criticRating * criticWeight)
}
```

---

## Implementation Plan

### Phase 1: Schema & Infrastructure (Week 1)

**Tasks:**

1. **Create migration file:** `migrations/008_add_ratings.sql`
   ```sql
   -- Create work_ratings and edition_ratings tables
   -- Add indexes
   -- Add foreign key constraints
   ```

2. **Test migration locally:**
   ```bash
   psql -h localhost -U postgres -d alexandria < migrations/008_add_ratings.sql
   ```

3. **Deploy to production:**
   ```bash
   # Via Cloudflare Tunnel
   psql -h alexandria-db.ooheynerds.com -U postgres -d alexandria < migrations/008_add_ratings.sql
   ```

**Deliverable:** Empty ratings tables ready for data

---

### Phase 2: Bulk Data Import (Week 1-2)

**Task 1: Download OpenLibrary Dumps**

```bash
# Create data directory
mkdir -p ~/dev_repos/alex/data/ratings

# Download latest ratings dump (~5MB)
cd ~/dev_repos/alex/data/ratings
wget https://openlibrary.org/data/ol_dump_ratings_latest.txt.gz
gunzip ol_dump_ratings_latest.txt.gz

# Download reading log dump (optional, ~65MB)
wget https://openlibrary.org/data/ol_dump_reading-log_latest.txt.gz
gunzip ol_dump_reading-log_latest.txt.gz
```

**Task 2: Create Import Script**

```typescript
// scripts/import-ratings.ts
import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'
import postgres from 'postgres'

interface RatingRecord {
  workKey: string
  editionKey: string | null
  rating: number
  date: string
}

async function importRatings() {
  const sql = postgres(process.env.DATABASE_URL!)

  // Step 1: Parse TSV file
  const ratings: RatingRecord[] = []

  createReadStream('./data/ratings/ol_dump_ratings_latest.txt')
    .pipe(parse({ delimiter: '\t', columns: ['workKey', 'editionKey', 'rating', 'date'] }))
    .on('data', (row) => {
      ratings.push({
        workKey: row.workKey.replace('/works/', ''),
        editionKey: row.editionKey?.replace('/books/', '') || null,
        rating: Number.parseInt(row.rating),
        date: row.date
      })
    })
    .on('end', async () => {
      console.log(`Parsed ${ratings.length} rating records`)

      // Step 2: Aggregate by work
      const workAggregates = new Map<string, { sum: number; count: number }>()

      for (const rating of ratings) {
        const existing = workAggregates.get(rating.workKey) || { sum: 0, count: 0 }
        existing.sum += rating.rating
        existing.count += 1
        workAggregates.set(rating.workKey, existing)
      }

      console.log(`Aggregated ${workAggregates.size} unique works`)

      // Step 3: Insert into PostgreSQL
      const batch: any[] = []

      for (const [workKey, agg] of workAggregates) {
        const avgRating = (agg.sum / agg.count).toFixed(1)
        batch.push({
          work_key: workKey,
          user_rating: avgRating,
          user_rating_count: agg.count,
          user_last_updated: new Date()
        })

        // Batch insert every 10k records
        if (batch.length >= 10000) {
          await sql`
            INSERT INTO work_ratings ${sql(batch, 'work_key', 'user_rating', 'user_rating_count', 'user_last_updated')}
            ON CONFLICT (work_key) DO UPDATE
              SET user_rating = EXCLUDED.user_rating,
                  user_rating_count = EXCLUDED.user_rating_count,
                  user_last_updated = EXCLUDED.user_last_updated
          `
          console.log(`Inserted ${batch.length} records...`)
          batch.length = 0
        }
      }

      // Insert remaining
      if (batch.length > 0) {
        await sql`
          INSERT INTO work_ratings ${sql(batch, 'work_key', 'user_rating', 'user_rating_count', 'user_last_updated')}
          ON CONFLICT (work_key) DO UPDATE
            SET user_rating = EXCLUDED.user_rating,
                user_rating_count = EXCLUDED.user_rating_count,
                user_last_updated = EXCLUDED.user_last_updated
        `
      }

      console.log('Import complete!')
      await sql.end()
    })
}

importRatings().catch(console.error)
```

**Task 3: Run Import**

```bash
cd ~/dev_repos/alex
npm run import:ratings

# Expected output:
# Parsed 5,234,567 rating records
# Aggregated 3,456,789 unique works
# Inserted 3,456,789 records
# Import complete!
```

**Deliverable:** 3M+ works with user ratings in PostgreSQL

---

### Phase 3: RPC Endpoints (Week 2)

**Task 1: Create Ratings Router**

```typescript
// worker/src/routes/ratings.ts
import { Hono } from 'hono'
import type { Env } from '../types/env'

const app = new Hono<{ Bindings: Env }>()

// GET /works/:workKey/ratings
app.get('/works/:workKey/ratings', async (c) => {
  const { workKey } = c.req.param()

  const sql = c.env.HYPERDRIVE
  const result = await sql.query(`
    SELECT
      work_key,
      user_rating,
      user_rating_count,
      critic_rating,
      critic_rating_count,
      composite_rating,
      composite_count,
      user_last_updated,
      critic_last_updated
    FROM work_ratings
    WHERE work_key = $1
  `, [workKey])

  if (result.rows.length === 0) {
    return c.json({
      error: 'No ratings found',
      workKey
    }, 404)
  }

  const rating = result.rows[0]

  return c.json({
    workKey: rating.work_key,
    userRating: rating.user_rating,
    userRatingCount: rating.user_rating_count,
    criticRating: rating.critic_rating,
    criticRatingCount: rating.critic_rating_count,
    compositeRating: rating.composite_rating,
    compositeCount: rating.composite_count,
    lastUpdated: rating.user_last_updated || rating.critic_last_updated,
    source: 'alexandria'
  })
})

// GET /works/top-rated?type=user|critic|composite&limit=100&minCount=50
app.get('/works/top-rated', async (c) => {
  const type = c.req.query('type') || 'composite'
  const limit = Number.parseInt(c.req.query('limit') || '100')
  const minCount = Number.parseInt(c.req.query('minCount') || '50')

  const validTypes = ['user', 'critic', 'composite']
  if (!validTypes.includes(type)) {
    return c.json({ error: 'Invalid type. Must be user, critic, or composite' }, 400)
  }

  const ratingField = `${type}_rating`
  const countField = `${type}_rating_count`

  const sql = c.env.HYPERDRIVE
  const results = await sql.query(`
    SELECT
      w.key,
      w.title,
      w.author_names,
      wr.${ratingField} as rating,
      wr.${countField} as rating_count
    FROM works w
    JOIN work_ratings wr ON w.key = wr.work_key
    WHERE wr.${ratingField} IS NOT NULL
      AND wr.${ratingField} >= 4.0
      AND wr.${countField} >= $1
    ORDER BY wr.${ratingField} DESC, wr.${countField} DESC
    LIMIT $2
  `, [minCount, limit])

  return c.json({
    topRated: results.rows,
    type,
    limit,
    minCount,
    count: results.rows.length
  })
})

// GET /editions/:isbn/ratings
app.get('/editions/:isbn/ratings', async (c) => {
  const { isbn } = c.req.param()

  const sql = c.env.HYPERDRIVE
  const result = await sql.query(`
    SELECT
      er.edition_key,
      er.work_key,
      er.user_rating,
      er.critic_rating,
      er.composite_rating,
      er.edition_specific_rating
    FROM edition_ratings er
    JOIN editions e ON e.key = er.edition_key
    WHERE e.isbn_13 = $1 OR e.isbn_10 = $1
  `, [isbn])

  if (result.rows.length === 0) {
    return c.json({ error: 'No ratings found', isbn }, 404)
  }

  return c.json({
    isbn,
    ...result.rows[0],
    source: 'alexandria'
  })
})

export default app
```

**Task 2: Register Routes**

```typescript
// worker/src/index.ts
import { Hono } from 'hono'
import ratingsRouter from './routes/ratings'

const app = new Hono()

app.route('/ratings', ratingsRouter)
// ... existing routes

export default app
```

**Task 3: Update TypeScript Types**

```typescript
// worker/src/types/ratings.ts
export interface WorkRating {
  workKey: string
  userRating: number | null
  userRatingCount: number | null
  criticRating: number | null
  criticRatingCount: number | null
  compositeRating: number | null
  compositeCount: number | null
  lastUpdated: string
  source: 'alexandria'
}

export interface TopRatedWork {
  key: string
  title: string
  authorNames: string[]
  rating: number
  ratingCount: number
}
```

**Deliverable:** Alexandria RPC endpoints for ratings

---

### Phase 4: Google Books Integration (Week 3)

**Task: Real-Time Enrichment for Missing Ratings**

```typescript
// worker/src/services/ratings-enrichment.ts
import type { Env } from '../types/env'

interface GoogleBooksRating {
  averageRating?: number
  ratingsCount?: number
  reviews?: Array<{
    type: 'EDITORIAL' | 'WEB_USER' | 'GOOGLE_USER'
    rating: number
  }>
}

export async function enrichWorkRatings(
  workKey: string,
  isbn: string | null,
  env: Env
): Promise<void> {
  // Skip if we already have recent ratings
  const existing = await checkExistingRating(workKey, env)
  if (existing && isRecentlyUpdated(existing.userLastUpdated)) {
    return
  }

  // Fetch from Google Books API
  if (!isbn || !env.GOOGLE_BOOKS_API_KEY) return

  const gbData = await fetchGoogleBooksRating(isbn, env.GOOGLE_BOOKS_API_KEY)
  if (!gbData) return

  // Extract user and critic ratings
  const userRating = gbData.averageRating
  const userCount = gbData.ratingsCount

  const editorialReviews = gbData.reviews?.filter(r => r.type === 'EDITORIAL') || []
  const criticRating = editorialReviews.length > 0
    ? editorialReviews.reduce((sum, r) => sum + r.rating, 0) / editorialReviews.length
    : null

  // Calculate composite
  const composite = calculateComposite(userRating, userCount || 0, criticRating, editorialReviews.length)

  // Update database
  await env.HYPERDRIVE.query(`
    INSERT INTO work_ratings (
      work_key,
      user_rating,
      user_rating_count,
      critic_rating,
      critic_rating_count,
      composite_rating,
      composite_count,
      user_last_updated,
      critic_last_updated
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (work_key) DO UPDATE
      SET user_rating = COALESCE(EXCLUDED.user_rating, work_ratings.user_rating),
          user_rating_count = COALESCE(EXCLUDED.user_rating_count, work_ratings.user_rating_count),
          critic_rating = COALESCE(EXCLUDED.critic_rating, work_ratings.critic_rating),
          critic_rating_count = COALESCE(EXCLUDED.critic_rating_count, work_ratings.critic_rating_count),
          composite_rating = EXCLUDED.composite_rating,
          composite_count = EXCLUDED.composite_count,
          user_last_updated = NOW()
  `, [workKey, userRating, userCount, criticRating, editorialReviews.length, composite, (userCount || 0) + editorialReviews.length])
}

async function fetchGoogleBooksRating(isbn: string, apiKey: string): Promise<GoogleBooksRating | null> {
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apiKey}`
  )

  if (!response.ok) return null

  const data = await response.json()
  const volume = data.items?.[0]?.volumeInfo

  return volume ? {
    averageRating: volume.averageRating,
    ratingsCount: volume.ratingsCount
  } : null
}

function calculateComposite(
  userRating: number | null,
  userCount: number,
  criticRating: number | null,
  criticCount: number
): number | null {
  if (!userRating && !criticRating) return null
  if (!userRating) return criticRating
  if (!criticRating) return userRating

  // Weight user ratings more if high count
  const userWeight = Math.min(userCount / 100, 0.6)
  const criticWeight = 1 - userWeight

  return Number(((userRating * userWeight) + (criticRating! * criticWeight)).toFixed(1))
}

function isRecentlyUpdated(lastUpdated: Date | null): boolean {
  if (!lastUpdated) return false
  const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
  return daysSince < 30 // Refresh monthly
}
```

**Deliverable:** Automatic rating enrichment for new books

---

### Phase 5: Monitoring & Maintenance (Week 3-4)

**Task 1: Analytics Logging**

```typescript
// Add to ratings endpoints
app.get('/works/:workKey/ratings', async (c) => {
  const start = Date.now()

  // ... fetch rating logic

  const duration = Date.now() - start

  // Log to Analytics Engine
  c.env.RATINGS_ANALYTICS?.writeDataPoint({
    indexes: [c.req.param('workKey')],
    blobs: ['ratings_fetch'],
    doubles: [duration]
  })

  return c.json(rating)
})
```

**Task 2: Monthly Refresh Cron**

```typescript
// worker/src/cron/refresh-ratings.ts
export async function handleRatingsRefresh(env: Env) {
  console.log('[Cron] Starting monthly ratings refresh')

  // Download latest OpenLibrary dump
  // Run import script
  // Log completion

  console.log('[Cron] Ratings refresh complete')
}
```

**Task 3: Health Endpoint**

```typescript
// GET /ratings/health
app.get('/health', async (c) => {
  const sql = c.env.HYPERDRIVE

  const stats = await sql.query(`
    SELECT
      COUNT(*) as total_works_with_ratings,
      AVG(user_rating)::DECIMAL(2,1) as avg_user_rating,
      AVG(composite_rating)::DECIMAL(2,1) as avg_composite_rating,
      MAX(user_last_updated) as last_updated
    FROM work_ratings
  `)

  return c.json({
    status: 'healthy',
    stats: stats.rows[0]
  })
})
```

**Deliverable:** Production monitoring and maintenance

---

## Testing Strategy

### Unit Tests

```typescript
// worker/tests/ratings.test.ts
import { describe, it, expect } from 'vitest'
import { calculateComposite } from '../src/services/ratings-enrichment'

describe('Ratings - Composite Calculation', () => {
  it('should return user rating when no critic rating', () => {
    expect(calculateComposite(4.5, 100, null, 0)).toBe(4.5)
  })

  it('should return critic rating when no user rating', () => {
    expect(calculateComposite(null, 0, 4.8, 10)).toBe(4.8)
  })

  it('should weight user rating more with high count', () => {
    const result = calculateComposite(4.0, 500, 5.0, 10)
    expect(result).toBeGreaterThan(4.0)
    expect(result).toBeLessThan(5.0)
  })
})
```

### Integration Tests

```bash
# Test RPC endpoints
curl https://alexandria.ooheynerds.com/works/OL45804W/ratings

# Expected:
{
  "workKey": "OL45804W",
  "userRating": 4.6,
  "userRatingCount": 125000,
  "compositeRating": 4.6,
  "source": "alexandria"
}

# Test top-rated
curl "https://alexandria.ooheynerds.com/works/top-rated?type=composite&limit=10"

# Expected:
{
  "topRated": [
    { "key": "OL123W", "title": "...", "rating": 4.9, ... }
  ],
  "type": "composite",
  "count": 10
}
```

---

## Deployment Checklist

- [ ] PostgreSQL schema migration applied
- [ ] OpenLibrary ratings dump imported
- [ ] RPC endpoints tested locally
- [ ] Integration tests passing
- [ ] Deploy to staging (if available)
- [ ] Deploy to production
- [ ] Verify BooksTrack can access ratings via RPC
- [ ] Monitor error rates for 24 hours
- [ ] Document API in Alexandria README

---

## Success Metrics

**Week 1:**
- ✅ 3M+ works with user ratings in PostgreSQL
- ✅ Sub-100ms query performance for work ratings

**Week 2:**
- ✅ RPC endpoints serving ratings
- ✅ Top-rated endpoint returns diverse results

**Week 3:**
- ✅ Google Books enrichment working
- ✅ Zero errors in production logs

**Week 4:**
- ✅ BooksTrack consuming ratings successfully
- ✅ Monthly refresh cron scheduled

---

## Future Enhancements

1. **iDreamBooks Integration** - Professional critic ratings (NYTimes, etc.)
2. **Real-Time OpenLibrary API** - Supplement monthly dumps with live data
3. **Reading Log Analysis** - "Currently reading" trending books
4. **Community Tags** - OpenLibrary's structured review tags
5. **Temporal Analysis** - Rating trends over time

---

## Related Documentation

- [OpenLibrary Data Dumps](https://openlibrary.org/developers/dumps)
- [OpenLibrary API Documentation](https://openlibrary.org/developers/api)
- [Google Books API Reference](https://developers.google.com/books/docs/v1/reference/volumes)
- [BooksTrack Recommendations Plan](./RATINGS_IMPLEMENTATION_PLAN_BOOKSTRACK.md)

---

**Last Updated:** December 30, 2025
**Next Review:** After Phase 1 completion
