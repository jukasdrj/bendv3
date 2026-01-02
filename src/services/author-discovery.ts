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

import type { Env } from '../types/env'

/**
 * Author metadata from a single source
 */
interface AuthorSource {
  name: string
  frequency: number
  source: 'curated' | 'analytics' | 'user_library'
  priority: number
}

/**
 * Aggregated author with multiple sources
 */
interface AggregatedAuthor {
  name: string
  frequency: number
  sources: string[]
  priority: number
}

/**
 * Analytics Engine query result row
 */
interface AnalyticsRow {
  author_name: string
  search_count: number
}

/**
 * Analytics Engine response structure
 */
interface AnalyticsResponse {
  data?: AnalyticsRow[]
}

/**
 * Discovery options
 */
interface DiscoveryOptions {
  maxAuthors?: number
}

/**
 * Extract authors from curated ISBN list
 * This is a quick implementation using the inline list from scheduled-harvest.js
 * In production, this would fetch from GitHub CSV and extract authors from book metadata
 *
 * @returns Array of curated authors with frequency and priority
 */
export async function extractCuratedAuthors(): Promise<AuthorSource[]> {
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
    'Stephen King',
    'J.K. Rowling',
    'James Patterson',
    'Nora Roberts',
    'Dan Brown',
    'John Grisham',
    'David Baldacci',
    'Lee Child',
    'Janet Evanovich',
    'Michael Connelly',
    'Harlan Coben',
    'Danielle Steel',
    'Nicholas Sparks',
    'Suzanne Collins',
    'Veronica Roth',
    'Cassandra Clare',
    'Rick Riordan',
    'Jeff Kinney',
    'Dav Pilkey',
    'R.L. Stine',
    'Gillian Flynn',
    'Paula Hawkins',
    'Celeste Ng',
    'Liane Moriarty',
    'Kristin Hannah',
    'Colleen Hoover',
    'Taylor Jenkins Reid',
    'Fredrik Backman',
    'Jojo Moyes',
    'Emily Henry',
    'Brandon Sanderson',
    'George R.R. Martin',
    'Patrick Rothfuss',
    'Sarah J. Maas',
    'Leigh Bardugo',
    'Andy Weir',
    'Blake Crouch',
    'Pierce Brown',
    'Joe Abercrombie',
    'Mark Lawrence',
    'Michelle Obama',
    'Malcolm Gladwell',
    'Yuval Noah Harari',
    'Ta-Nehisi Coates',
    'Brené Brown',
    'James Clear',
    'Matthew Walker',
    'Michael Pollan',
    'Bill Bryson',
    'Mary Roach',
  ]

  return curatedAuthors.map((name, idx) => ({
    name,
    frequency: curatedAuthors.length - idx, // Higher index = higher priority
    source: 'curated' as const,
    priority: 1,
  }))
}

/**
 * Get popular authors from Analytics Engine
 * Queries author search logs to find trending authors
 *
 * @param env - Worker environment bindings
 * @returns Array of authors from Analytics Engine
 */
export async function getAnalyticsAuthors(env: Env): Promise<AuthorSource[]> {
  try {
    // Check required env vars
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      console.warn('CF_ACCOUNT_ID or CF_API_TOKEN not configured - skipping Analytics authors')
      return []
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
    `

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    let response: Response
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.CF_API_TOKEN}`,
            'Content-Type': 'text/plain',
          },
          body: query,
          signal: controller.signal,
        },
      )
      clearTimeout(timeout)
    } catch (err) {
      clearTimeout(timeout)
      if ((err as Error).name === 'AbortError') {
        console.warn('Analytics Engine request timed out after 10 seconds')
        return []
      }
      throw err
    }

    if (!response.ok) {
      console.warn(`Analytics Engine query failed: ${response.status}`)
      return []
    }

    const data = (await response.json()) as AnalyticsResponse
    const authors =
      data.data?.map((row) => ({
        name: row.author_name,
        frequency: row.search_count,
        source: 'analytics' as const,
        priority: 2,
      })) || []

    console.log(`Found ${authors.length} popular authors from Analytics Engine`)
    return authors
  } catch (error) {
    console.error('Analytics authors fetch failed:', error)
    return []
  }
}

/**
 * Get user library authors (Phase 2 - requires CloudKit sync)
 *
 * @param _env - Worker environment bindings
 * @returns Array of authors from user libraries (currently empty)
 */
export async function getUserLibraryAuthors(_env: Env): Promise<AuthorSource[]> {
  // TODO: Implement once CloudKit → D1 sync is active
  // Query: SELECT author_name, COUNT(DISTINCT user_id) as owner_count
  //        FROM user_books
  //        GROUP BY author_name
  //        ORDER BY owner_count DESC
  return []
}

/**
 * Discover popular authors from all sources
 *
 * @param env - Worker environment bindings
 * @param options - Discovery options
 * @returns Array of aggregated authors with sources and priority
 */
export async function discoverPopularAuthors(
  env: Env,
  options: DiscoveryOptions = {},
): Promise<AggregatedAuthor[]> {
  const { maxAuthors = 100 } = options

  console.log('📚 Discovering popular authors from all sources...')

  // Collect from all sources
  const [curatedAuthors, analyticsAuthors, userLibraryAuthors] = await Promise.all([
    extractCuratedAuthors(),
    getAnalyticsAuthors(env),
    getUserLibraryAuthors(env),
  ])

  console.log(`   Curated: ${curatedAuthors.length} authors`)
  console.log(`   Analytics: ${analyticsAuthors.length} authors`)
  console.log(`   User Libraries: ${userLibraryAuthors.length} authors`)

  // Aggregate and deduplicate
  const authorMap = new Map<string, AggregatedAuthor>()

  const addAuthors = (authors: AuthorSource[]) => {
    authors.forEach((author) => {
      const existing = authorMap.get(author.name)
      if (existing) {
        existing.frequency += author.frequency
        existing.sources.push(author.source)
        existing.priority = Math.min(existing.priority, author.priority) // Lower number = higher priority
      } else {
        authorMap.set(author.name, {
          name: author.name,
          frequency: author.frequency,
          sources: [author.source],
          priority: author.priority,
        })
      }
    })
  }

  addAuthors(curatedAuthors)
  addAuthors(analyticsAuthors)
  addAuthors(userLibraryAuthors)

  // Sort by priority (lower = better), then frequency
  const sortedAuthors = Array.from(authorMap.values()).sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return b.frequency - a.frequency
  })

  const topAuthors = sortedAuthors.slice(0, maxAuthors)

  console.log(``)
  console.log(`✅ Discovered ${topAuthors.length} unique popular authors`)
  console.log(`   Priority 1 (curated): ${topAuthors.filter((a) => a.priority === 1).length}`)
  console.log(`   Priority 2 (analytics): ${topAuthors.filter((a) => a.priority === 2).length}`)
  console.log(`   Priority 3 (user library): ${topAuthors.filter((a) => a.priority === 3).length}`)

  return topAuthors
}
