/**
 * Author Discovery Service
 *
 * Discovers popular authors from multiple sources and prioritizes them
 * for bibliography expansion and cover harvesting.
 *
 * Data Sources:
 * 1. Curated ISBN list (extract authors from bestsellers)
 * 2. Analytics Engine (popular author searches)
 * 3. User libraries (most owned authors) - Phase 2
 */

/**
 * Extract authors from curated ISBN list
 * This is a quick implementation using the inline list from scheduled-harvest.js
 * In production, this would fetch from GitHub CSV and extract authors from book metadata
 *
 * @returns {Promise<Array<{name: string, frequency: number, source: string}>>}
 */
export async function extractCuratedAuthors() {
  // Top contemporary authors from testImages/csv-expansion (2015-2025 bestsellers)
  // This list is derived from the 478-ISBN curated collection
  // In a full implementation, we'd:
  // 1. Fetch the CSV from GitHub
  // 2. Look up each ISBN in Google Books/OpenLibrary
  // 3. Extract author names
  // 4. Aggregate by frequency
  //
  // For now, we'll use a manually curated list of known popular authors
  const curatedAuthors = [
    // Top 50 Contemporary Bestselling Authors (2015-2025)
    "Stephen King",
    "J.K. Rowling",
    "James Patterson",
    "Nora Roberts",
    "Dan Brown",
    "John Grisham",
    "David Baldacci",
    "Lee Child",
    "Janet Evanovich",
    "Michael Connelly",
    "Harlan Coben",
    "Danielle Steel",
    "Nicholas Sparks",
    "Suzanne Collins",
    "Veronica Roth",
    "Cassandra Clare",
    "Rick Riordan",
    "Jeff Kinney",
    "Dav Pilkey",
    "R.L. Stine",
    "Gillian Flynn",
    "Paula Hawkins",
    "Celeste Ng",
    "Liane Moriarty",
    "Kristin Hannah",
    "Colleen Hoover",
    "Taylor Jenkins Reid",
    "Fredrik Backman",
    "Jojo Moyes",
    "Emily Henry",
    "Brandon Sanderson",
    "George R.R. Martin",
    "Patrick Rothfuss",
    "Sarah J. Maas",
    "Leigh Bardugo",
    "Andy Weir",
    "Blake Crouch",
    "Pierce Brown",
    "Joe Abercrombie",
    "Mark Lawrence",
    "Michelle Obama",
    "Malcolm Gladwell",
    "Yuval Noah Harari",
    "Ta-Nehisi Coates",
    "Brené Brown",
    "James Clear",
    "Matthew Walker",
    "Michael Pollan",
    "Bill Bryson",
    "Mary Roach",
  ];

  return curatedAuthors.map((name, idx) => ({
    name,
    frequency: curatedAuthors.length - idx, // Higher index = higher priority
    source: "curated",
    priority: 1,
  }));
}

/**
 * Get popular authors from Analytics Engine
 * Queries author search logs to find trending authors
 *
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Array<{name: string, frequency: number, source: string}>>}
 */
export async function getAnalyticsAuthors(env) {
  try {
    // Check required env vars
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      console.warn(
        "CF_ACCOUNT_ID or CF_API_TOKEN not configured - skipping Analytics authors",
      );
      return [];
    }

    // Query Analytics Engine for author searches in last 30 days
    const query = `
      SELECT blob1 as author_name, COUNT(*) as search_count
      FROM books_api_provider_performance
      WHERE timestamp > NOW() - INTERVAL '30' DAY
        AND index1 = 'google-books-author'
        AND blob2 = 'author_search'
      GROUP BY author_name
      ORDER BY search_count DESC
      LIMIT 100
    `;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: query,
      },
    );

    if (!response.ok) {
      console.warn(`Analytics Engine query failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const authors =
      data.data?.map((row) => ({
        name: row.author_name,
        frequency: row.search_count,
        source: "analytics",
        priority: 2,
      })) || [];

    console.log(`Found ${authors.length} popular authors from Analytics Engine`);
    return authors;
  } catch (error) {
    console.error("Analytics authors fetch failed:", error);
    return [];
  }
}

/**
 * Get user library authors (Phase 2 - requires CloudKit sync)
 *
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Array<{name: string, frequency: number, source: string}>>}
 */
export async function getUserLibraryAuthors(env) {
  // TODO: Implement once CloudKit → D1 sync is active
  // Query: SELECT author_name, COUNT(DISTINCT user_id) as owner_count
  //        FROM user_books
  //        GROUP BY author_name
  //        ORDER BY owner_count DESC
  return [];
}

/**
 * Discover popular authors from all sources
 *
 * @param {Object} env - Worker environment bindings
 * @param {Object} options - Discovery options
 * @param {number} options.maxAuthors - Max authors to return (default: 100)
 * @returns {Promise<Array<{name: string, frequency: number, sources: string[], priority: number}>>}
 */
export async function discoverPopularAuthors(env, options = {}) {
  const { maxAuthors = 100 } = options;

  console.log("📚 Discovering popular authors from all sources...");

  // Collect from all sources
  const [curatedAuthors, analyticsAuthors, userLibraryAuthors] =
    await Promise.all([
      extractCuratedAuthors(),
      getAnalyticsAuthors(env),
      getUserLibraryAuthors(env),
    ]);

  console.log(`   Curated: ${curatedAuthors.length} authors`);
  console.log(`   Analytics: ${analyticsAuthors.length} authors`);
  console.log(`   User Libraries: ${userLibraryAuthors.length} authors`);

  // Aggregate and deduplicate
  const authorMap = new Map();

  const addAuthors = (authors) => {
    authors.forEach((author) => {
      const existing = authorMap.get(author.name);
      if (existing) {
        existing.frequency += author.frequency;
        existing.sources.push(author.source);
        existing.priority = Math.min(existing.priority, author.priority); // Lower number = higher priority
      } else {
        authorMap.set(author.name, {
          name: author.name,
          frequency: author.frequency,
          sources: [author.source],
          priority: author.priority,
        });
      }
    });
  };

  addAuthors(curatedAuthors);
  addAuthors(analyticsAuthors);
  addAuthors(userLibraryAuthors);

  // Sort by priority (lower = better), then frequency
  const sortedAuthors = Array.from(authorMap.values()).sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.frequency - a.frequency;
  });

  const topAuthors = sortedAuthors.slice(0, maxAuthors);

  console.log(``);
  console.log(`✅ Discovered ${topAuthors.length} unique popular authors`);
  console.log(`   Priority 1 (curated): ${topAuthors.filter((a) => a.priority === 1).length}`);
  console.log(`   Priority 2 (analytics): ${topAuthors.filter((a) => a.priority === 2).length}`);
  console.log(`   Priority 3 (user library): ${topAuthors.filter((a) => a.priority === 3).length}`);

  return topAuthors;
}
