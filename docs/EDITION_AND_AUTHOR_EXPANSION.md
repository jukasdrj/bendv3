# Edition Discovery & Author Bibliography Expansion Guide

**Last Updated:** November 28, 2025
**Status:** ✅ Fully Implemented (Awaiting Scheduled Integration)

---

## 🎯 Overview

BooksTrack has TWO powerful enrichment systems to expand your cache beyond single ISBN lookups:

### **1. Edition Discovery** (`src/services/edition-discovery.js`)
- **What it does:** Finds multiple editions of the SAME work (hardcover, paperback, illustrated, etc.)
- **When it runs:** NOT automatically yet - manual trigger only
- **Example:** You have "Harry Potter and the Sorcerer's Stone" paperback → discovers 40 different editions

### **2. Author Bibliography Expansion** (`src/services/author-bibliography-expansion.js`)
- **What it does:** Finds ALL works by an author, then discovers multiple editions for each work
- **When it runs:** NOT automatically yet - manual trigger only
- **Example:** You search "Stephen King" → discovers 500 works → finds 3 best editions per work → 1500 ISBNs cached

---

## 📅 When Do These Run?

### Current Status (November 28, 2025):

**❌ NOT Running Automatically Yet**

The services are fully implemented and tested, but not yet integrated into the scheduled harvest cron job. You can trigger them manually (see below).

### Planned Automatic Schedule:

According to `docs/AUTHOR_HARVEST_SYSTEM.md`, these will be integrated into the **daily 3 AM UTC cron job** with intelligent cache depth checking:

**Planned Flow:**
```
Daily 3 AM UTC Cron
  ↓
1. Discover top 100 popular authors (from curated lists + analytics)
  ↓
2. Analyze cache depth for each author (% of works already cached)
  ↓
3. Prioritize authors with <50% coverage (skip well-covered authors)
  ↓
4. For each prioritized author:
   - Fetch bibliography from OpenLibrary (up to 500 works)
   - Filter by publication year (1990+)
   - Discover 2-3 best editions per work via Google Books
   - Add ISBNs to harvest queue
  ↓
5. Harvest covers from ISBNdb (up to 5000 ISBNs/day quota)
  ↓
6. Warm cache via production API
```

**See Deployment Checklist Below** for how to enable this.

---

## 🛠️ How to Manually Trigger

### Option 1: Manual Author Expansion Script (Recommended)

I've created a script for you that triggers the full author expansion flow with real-time progress monitoring:

```bash
# Basic usage (defaults: 20 works, 3 editions/work, 2000+ publication year)
node scripts/trigger-author-expansion.js "Stephen King"

# Advanced usage with custom options
node scripts/trigger-author-expansion.js "Brandon Sanderson" --max-works=30 --editions=5

# Filter by publication year
node scripts/trigger-author-expansion.js "Colleen Hoover" --year=2010

# Target production API (default: local dev)
node scripts/trigger-author-expansion.js "Neil Gaiman" --production
```

**What This Script Does:**

1. **Step 1:** Fetches author's complete bibliography from OpenLibrary
2. **Step 2:** Discovers 2-5 best editions per work via Google Books API
3. **Step 3:** Warms production cache via `/v1/search/isbn?lenient=true`
4. **Progress Monitoring:** Real-time output showing works processed, editions found, cache hits

**Example Output:**
```
📚 BooksTrack Author Bibliography Expansion
============================================================

Author: Stephen King
API: http://localhost:8787
Max Works: 20
Editions per Work: 3
Min Publication Year: 2000

🔍 Step 1: Fetching author bibliography from OpenLibrary...
   ✓ Found OpenLibrary author: Stephen King (/authors/OL2162284A)
   ✓ Discovered 500 works
   ✓ Filtered to 20 works (2000+, limited to 20)

🔎 Step 2: Discovering 3 editions per work...

   [1/20] ✓ The Institute (2019): 3 editions (scores: 40, 30, 20)
   [2/20] ✓ 11/22/63 (2011): 3 editions (scores: 40, 30, 20)
   [3/20] ✓ The Outsider (2018): 3 editions (scores: 40, 30, 20)
   ...

✅ Edition Discovery Complete:
   Works processed: 20
   Editions discovered: 55
   Unique ISBNs: 55
   Skipped: 0
   Avg editions/work: 2.8

🔥 Step 3: Warming production cache with 55 ISBNs...

   [10/55] ✓ 8 new | 💾 2 cached | ❌ 0 failed
   [20/55] ✓ 15 new | 💾 5 cached | ❌ 0 failed
   ...

✅ Cache Warming Complete:
   Newly cached: 50
   Already cached: 5
   Failed: 0

============================================================
🎉 Author Bibliography Expansion Complete!

📊 Summary for: Stephen King
   Works discovered: 20
   Editions found: 55
   Newly cached: 50
   Already cached: 5
   Failed: 0
   Duration: 18.3s

📖 Top 5 Works with Most Editions:
   1. "The Stand" (2012): 5 editions
   2. "It" (2017): 4 editions
   3. "The Shining" (2013): 3 editions
   4. "11/22/63" (2011): 3 editions
   5. "Doctor Sleep" (2013): 3 editions

============================================================
```

---

### Option 2: Test Edition Discovery Endpoint

Quick test of edition discovery for specific books:

```bash
# Test local dev server
curl "http://localhost:8787/api/test-multi-edition?count=5" | jq

# Test production
curl "https://api.oooefam.net/api/test-multi-edition?count=5" | jq
```

**What This Does:**
- Tests edition discovery for 5 pre-configured books
- Shows how many editions are found per work
- Returns detailed scores and metadata

**Example Response:**
```json
{
  "success": true,
  "summary": {
    "worksProcessed": 5,
    "totalEditions": 12,
    "avgEditionsPerWork": 2.4
  },
  "results": [
    {
      "seedISBN": "9780008479599",
      "title": "The Midnight Library",
      "authors": ["Matt Haig"],
      "editionsFound": 3,
      "editions": [
        {
          "isbn": "9780525559474",
          "title": "The Midnight Library",
          "score": 65,
          "publisher": "Viking",
          "publishedDate": "2020-09-29"
        }
      ]
    }
  ]
}
```

---

### Option 3: Direct Service Integration

If you want to integrate these services into your own code:

```javascript
// Edition Discovery - Find multiple editions of ONE work
import { getTopEditions } from './services/edition-discovery.js'

const editions = await getTopEditions(
  {
    title: "The Midnight Library",
    authors: ["Matt Haig"]
  },
  env,
  3  // Get top 3 editions
)

// Returns:
// [
//   { isbn: "9780525559474", title: "...", score: 65, imageUrl: "..." },
//   { isbn: "9780008479599", title: "...", score: 45, imageUrl: "..." },
//   { isbn: "9781786892737", title: "...", score: 30, imageUrl: "..." }
// ]
```

```javascript
// Author Bibliography Expansion - Expand ENTIRE author catalog
import { expandAuthorBibliography } from './services/author-bibliography-expansion.js'

const result = await expandAuthorBibliography(
  "Stephen King",
  env,
  {
    maxWorks: 50,              // Process top 50 works
    editionsPerWork: 3,        // Find 3 editions per work
    minPublicationYear: 1990   // Filter works (1990+)
  }
)

// Returns:
// {
//   success: true,
//   author: "Stephen King",
//   stats: {
//     worksDiscovered: 500,
//     worksProcessed: 50,
//     editionsDiscovered: 75,
//     isbnsHarvested: 75
//   },
//   isbns: ["9781234567890", "9780987654321", ...]
// }
```

---

## 🚀 How to Enable Automatic Author Expansion

Currently, these services are NOT integrated into the scheduled harvest. To enable them:

### Deployment Checklist (from `docs/AUTHOR_HARVEST_SYSTEM.md`):

- [ ] **Create missing services:**
  - [ ] `src/services/author-discovery.js` (discovers popular authors from curated lists + analytics)
  - [ ] `src/services/author-cache-analyzer.js` (analyzes cache depth to avoid redundant harvesting)

- [ ] **Update scheduled harvest:**
  - [ ] Modify `src/handlers/scheduled-harvest.js` to integrate author expansion flow
  - [ ] Add intelligent cache depth checking (skip authors with >50% coverage)
  - [ ] Allocate ISBNdb quota (5000/day) across prioritized authors

- [ ] **Test locally:**
  ```bash
  npm run dev
  # Manually trigger cron in separate terminal:
  curl -X POST "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
  ```

- [ ] **Deploy to production:**
  ```bash
  npm run deploy
  ```

- [ ] **Monitor first run:**
  ```bash
  npx wrangler tail
  # Wait for 3 AM UTC next day and watch logs
  ```

### Expected Impact After Deployment:

**Before (Current System):**
- Random 350 works harvested daily
- 700-1050 ISBNs/day (limited by old ISBNdb quota)
- Scattered coverage, many author gaps

**After (Author-Driven System):**
- 50 authors × 100 ISBNs each = 5000 ISBNs/day
- Complete author bibliographies (not random works)
- **4.8x improvement** in daily harvest volume
- Zero wasted quota (smart cache depth checking)
- Better user experience (complete author pages)

---

## 📊 Edition Scoring Algorithm

The edition discovery service uses a sophisticated scoring system to rank editions (0-100 points):

### Image Quality (40 points max):
- Extra Large image: 40 points
- Large image: 30 points
- Medium image: 20 points
- Thumbnail only: 10 points

### Edition Type (30 points max):
- Illustrated edition: 30 points
- First edition: 25 points
- Collector's edition: 25 points
- Anniversary edition: 20 points

### Binding Type (15 points max):
- Hardcover: 15 points
- Paperback: 10 points

### Publication Date Recency (10 points max):
- Last 5 years: 10 points
- Last 15 years: 5 points

### Page Count (5 points max):
- Has page count data: 5 points

**Example:**
```
Illustrated hardcover edition with extra-large cover (2020):
  40 (image) + 30 (illustrated) + 15 (hardcover) + 10 (recent) + 5 (pages) = 100 points

Standard paperback with medium cover (2005):
  20 (image) + 0 (no special type) + 10 (paperback) + 0 (older) + 5 (pages) = 35 points
```

---

## 🔍 How It Works Internally

### Edition Discovery Flow:

```
Input: { title: "Harry Potter", authors: ["J.K. Rowling"] }
  ↓
1. Build Google Books query: intitle:"Harry Potter" inauthor:"J.K. Rowling"
  ↓
2. Fetch up to 40 results from Google Books API
  ↓
3. Extract ISBNs and metadata for each result
  ↓
4. Score each edition (0-100 points based on quality indicators)
  ↓
5. Sort by score (highest first)
  ↓
6. Return top N editions (default: 3)
```

### Author Bibliography Expansion Flow:

```
Input: "Stephen King"
  ↓
1. Search OpenLibrary for author → Get author key (/authors/OL2162284A)
  ↓
2. Fetch all works → Returns 500 works
  ↓
3. Filter by publication year (e.g., 1990+) → 150 works remain
  ↓
4. Sort by recency (newest first) → Prioritize recent works
  ↓
5. Take top N works (e.g., 20)
  ↓
6. For each work:
   - Discover 2-3 best editions via Google Books API
   - Rate limit: 10 req/sec (100ms delay)
   - Extract ISBNs
  ↓
7. Deduplicate ISBNs → Return unique list
```

---

## 📈 Performance Metrics (Tested)

### Edition Discovery:
- **Latency:** 500-800ms per work (Google Books API call)
- **Throughput:** 1-2 works/sec
- **Success Rate:** ~60% (not all works have ISBNs)
- **Average Editions/Work:** 1.5-2.5 (limited by ISBN availability)

### Author Bibliography Expansion:
- **Stephen King Test Results:**
  - 500 works discovered from OpenLibrary
  - 20 works processed (1990+ filter, limited to 20)
  - 23 unique ISBNs harvested (avg 1.15 editions/work)
  - Duration: 6.4 seconds
  - Throughput: 4 ISBNs/sec

### Full Author Expansion (50 works):
- **Estimated Time:** ~30 seconds (at 10 req/sec rate limit)
- **Expected ISBNs:** 75-125 (assuming 1.5-2.5 editions/work)
- **API Quota Usage:** 50 Google Books API calls

---

## ⚠️ Important Notes

### Rate Limiting:
- **Google Books API:** No official limit, but use 10 req/sec to be respectful
- **OpenLibrary API:** No official limit, but use 5 req/sec to be respectful
- **Your Production API:** 5 req/sec during cache warming (scripts use 200ms delay)

### API Quota Costs:
- **Google Books:** Free (no quota tracking in BooksTrack)
- **OpenLibrary:** Free (public API)
- **ISBNdb:** 5000 requests/day (Premium plan)
  - Edition discovery doesn't use ISBNdb (uses Google Books)
  - Author expansion doesn't use ISBNdb directly (harvests afterward)

### Data Quality:
- **Not all works have ISBNs:** Success rate ~60% (anthologies, collections often lack ISBNs)
- **Edition variety is limited:** Average 1.5 editions/work (not all have 3-5 editions)
- **OpenLibrary is comprehensive:** 500+ works for major authors
- **Publication year filtering is critical:** Old editions often have no ISBNs

---

## 🎓 Example Use Cases

### Use Case 1: "I want all Stephen King books in my cache"

```bash
node scripts/trigger-author-expansion.js "Stephen King" --max-works=50 --production
```

**Result:**
- Fetches 500 works from OpenLibrary
- Processes top 50 recent works
- Discovers ~75 unique ISBNs
- Warms production cache
- Duration: ~45 seconds

### Use Case 2: "I want only recent Colleen Hoover books (2015+)"

```bash
node scripts/trigger-author-expansion.js "Colleen Hoover" --year=2015 --editions=5 --production
```

**Result:**
- Filters to works published 2015+
- Discovers up to 5 editions per work
- Focuses on high-quality illustrated editions
- Ideal for popular contemporary authors

### Use Case 3: "I want to test edition discovery locally"

```bash
# Start dev server
npm run dev

# In another terminal:
curl "http://localhost:8787/api/test-multi-edition?count=5" | jq
```

**Result:**
- Tests 5 pre-configured bestsellers
- Shows how many editions exist per work
- No production API calls

---

## 📞 Troubleshooting

### "No works found for author"
- Check author name spelling
- Try variations: "Stephen King" vs "King, Stephen"
- Verify author exists in OpenLibrary: https://openlibrary.org/search/authors.json?q=Stephen+King

### "No ISBNs discovered"
- Try increasing `--max-works` (more works = more chances to find ISBNs)
- Try adjusting `--year` filter (older books may lack ISBN data)
- Check Google Books API status: https://www.googleapis.com/books/v1/volumes?q=test

### "Script fails with 'fetch is not defined'"
- Make sure you're using Node.js 18+ (fetch is built-in)
- Check: `node --version`

### "Production API returns 429 (rate limit)"
- Reduce concurrent requests in script (currently 5 req/sec)
- Wait a few minutes and retry
- Check rate limit: `curl -I https://api.oooefam.net/v1/search/isbn?isbn=9780439708180`

---

## 🔗 Related Documentation

- **`docs/AUTHOR_HARVEST_SYSTEM.md`** - Full architecture and deployment plan
- **`src/services/edition-discovery.js`** - Edition discovery implementation
- **`src/services/author-bibliography-expansion.js`** - Author expansion implementation
- **`src/handlers/test-multi-edition.js`** - Test endpoint for edition discovery
- **`scripts/trigger-author-expansion.js`** - Manual trigger script (this guide)

---

## 📝 Next Steps

1. **Try the manual script:**
   ```bash
   node scripts/trigger-author-expansion.js "Stephen King"
   ```

2. **Test locally:**
   ```bash
   npm run dev
   curl "http://localhost:8787/api/test-multi-edition?count=5" | jq
   ```

3. **Review deployment plan:**
   See `docs/AUTHOR_HARVEST_SYSTEM.md` for full integration guide

4. **Enable automatic expansion:**
   Complete the deployment checklist above to integrate into daily 3 AM cron

---

**Questions?** Check the related documentation or review the source code in `src/services/`.

**Want to contribute?** See `docs/AUTHOR_HARVEST_SYSTEM.md` for deployment instructions.
