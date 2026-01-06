/**
 * Author Cache Depth Analyzer
 *
 * Analyzes KV cache to determine which authors already have comprehensive
 * cover coverage. This prevents redundant harvesting and prioritizes authors
 * with gaps in their coverage.
 *
 * Cache Structure:
 * - KV key: cover:{isbn}
 * - KV value: {isbn, title, authors[], harvestedAt, ...}
 *
 * Analysis:
 * - Extract all authors from cached covers
 * - Count covers per author
 * - Calculate coverage depth (% of bibliography cached)
 */

import type { Env } from '../types/env.js'

/**
 * Author cache depth analysis result
 */
interface AuthorCacheAnalysis {
  author: string
  cachedCovers: number
  coverKeys: string[]
  estimatedCoverage: number
  needsExpansion: boolean
}

/**
 * Author prioritization data
 */
interface AuthorPriority {
  name: string
  cachedCovers: number
  estimatedCoverage: number
  priority: number
}

/**
 * Prioritization options
 */
interface PrioritizationOptions {
  coverageThreshold?: number
  maxAuthors?: number
}

/**
 * Cached cover data structure
 */
interface CachedCoverData {
  isbn?: string
  title?: string
  authors?: string[]
  harvestedAt?: number
}

/**
 * Analyze author cache depth
 * @param authorName - Author to analyze
 * @param env - Worker environment bindings
 * @returns Promise resolving to cache analysis result
 */
export async function analyzeAuthorCacheDepth(
  authorName: string,
  env: Env,
): Promise<AuthorCacheAnalysis> {
  try {
    // List all cover keys from KV (prefix: cover:)
    const allCovers = await env.CACHE.list({ prefix: 'cover:' })

    if (!allCovers || !allCovers.keys || allCovers.keys.length === 0) {
      console.log(`No covers in cache yet`)
      return {
        author: authorName,
        cachedCovers: 0,
        coverKeys: [],
        estimatedCoverage: 0,
        needsExpansion: true,
      }
    }

    // Sample covers to find author matches
    // (We can't efficiently query by author, so we sample covers)
    const sampleSize = Math.min(100, allCovers.keys.length)
    const sampleKeys = allCovers.keys.slice(0, sampleSize)

    const authorCovers: string[] = []

    // Check each sampled cover for author match
    for (const key of sampleKeys) {
      const coverData = await env.CACHE.get(key.name)
      if (!coverData) continue

      try {
        const cover = JSON.parse(coverData) as CachedCoverData
        const authors = cover.authors || []

        // Check if this author matches (case-insensitive partial match)
        const authorMatch = authors.some(
          (a) =>
            a.toLowerCase().includes(authorName.toLowerCase()) ||
            authorName.toLowerCase().includes(a.toLowerCase()),
        )

        if (authorMatch) {
          authorCovers.push(key.name)
        }
      } catch (_error) {
        // Ignore parse errors
      }
    }

    // Extrapolate to full cache
    const totalCovers = allCovers.keys.length
    const extrapolatedAuthorCovers = Math.round((authorCovers.length / sampleSize) * totalCovers)

    // Estimate coverage (assume typical author has 50-100 works)
    const typicalAuthorWorks = 75
    const estimatedCoverage = Math.min(100, (extrapolatedAuthorCovers / typicalAuthorWorks) * 100)

    const needsExpansion = estimatedCoverage < 50 // Less than 50% coverage

    console.log(
      `Cache depth for ${authorName}: ${extrapolatedAuthorCovers} covers (~${estimatedCoverage.toFixed(0)}% estimated coverage)`,
    )

    return {
      author: authorName,
      cachedCovers: extrapolatedAuthorCovers,
      coverKeys: authorCovers,
      estimatedCoverage: Math.round(estimatedCoverage),
      needsExpansion,
    }
  } catch (error) {
    console.error(`Cache depth analysis failed for ${authorName}:`, error)
    return {
      author: authorName,
      cachedCovers: 0,
      coverKeys: [],
      estimatedCoverage: 0,
      needsExpansion: true, // Default to needing expansion on error
    }
  }
}

/**
 * Get authors with low cache coverage (prioritization)
 * @param authorNames - List of authors to check
 * @param env - Worker environment bindings
 * @param coverageThreshold - Min coverage % to skip (default: 50)
 * @returns Promise resolving to authors needing expansion, sorted by coverage
 */
export async function getAuthorsNeedingExpansion(
  authorNames: string[],
  env: Env,
  coverageThreshold = 50,
): Promise<AuthorPriority[]> {
  const analyses: AuthorCacheAnalysis[] = []

  console.log(
    `Analyzing cache depth for ${authorNames.length} authors (threshold: ${coverageThreshold}%)...`,
  )

  for (const authorName of authorNames) {
    const analysis = await analyzeAuthorCacheDepth(authorName, env)
    analyses.push(analysis)
  }

  // Filter and sort
  const needingExpansion = analyses
    .filter((a) => a.estimatedCoverage < coverageThreshold)
    .sort((a, b) => a.estimatedCoverage - b.estimatedCoverage) // Lowest coverage first

  console.log(``)
  console.log(`📊 Cache Coverage Summary (${authorNames.length} authors analyzed):`)
  console.log(
    `   ✅ Sufficient coverage (≥${coverageThreshold}%): ${authorNames.length - needingExpansion.length} authors`,
  )
  console.log(`   ⚠️  Needs expansion (<${coverageThreshold}%): ${needingExpansion.length} authors`)
  console.log(``)

  if (needingExpansion.length > 0) {
    console.log(`Top 10 authors needing expansion:`)
    needingExpansion.slice(0, 10).forEach((a, idx) => {
      console.log(
        `   ${idx + 1}. ${a.author}: ${a.cachedCovers} covers (${a.estimatedCoverage}% coverage)`,
      )
    })
    console.log(``)
  }

  return needingExpansion.map((a) => ({
    name: a.author,
    cachedCovers: a.cachedCovers,
    estimatedCoverage: a.estimatedCoverage,
    priority: 100 - a.estimatedCoverage, // Lower coverage = higher priority
  }))
}

/**
 * Smart author prioritization with cache depth awareness
 * @param candidateAuthors - All candidate authors
 * @param env - Worker environment bindings
 * @param options - Prioritization options
 * @returns Promise resolving to prioritized author list with coverage data
 */
export async function prioritizeAuthorsForHarvest(
  candidateAuthors: string[],
  env: Env,
  options: PrioritizationOptions = {},
): Promise<AuthorPriority[]> {
  const { coverageThreshold = 50, maxAuthors = 50 } = options

  // Step 1: Analyze cache depth for all candidates
  const authorsNeedingExpansion = await getAuthorsNeedingExpansion(
    candidateAuthors,
    env,
    coverageThreshold,
  )

  // Step 2: Take top N authors by priority (lowest coverage first)
  const prioritized = authorsNeedingExpansion
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxAuthors)

  console.log(`✅ Prioritized ${prioritized.length} authors for harvest`)
  console.log(
    `   Coverage range: ${prioritized[prioritized.length - 1]?.estimatedCoverage || 0}% - ${prioritized[0]?.estimatedCoverage || 0}%`,
  )

  return prioritized
}
