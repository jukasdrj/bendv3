/**
 * Edition Discovery Service
 *
 * Discovers all available editions of a Work using Google Books API.
 * Scores editions based on quality indicators and returns top candidates
 * for cover image harvesting.
 */

import type { Env } from '../types/env'

/**
 * Google Books volume image links
 */
interface ImageLinks {
  extraLarge?: string
  large?: string
  medium?: string
  thumbnail?: string
}

/**
 * Google Books volume industry identifiers
 */
interface IndustryIdentifier {
  type: 'ISBN_10' | 'ISBN_13'
  identifier: string
}

/**
 * Google Books volume information
 */
interface VolumeInfo {
  title: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  pageCount?: number
  description?: string
  imageLinks?: ImageLinks
  industryIdentifiers?: IndustryIdentifier[]
  printType?: string
}

/**
 * Google Books API item
 */
interface GoogleBooksItem {
  volumeInfo: VolumeInfo
}

/**
 * Google Books API response
 */
interface GoogleBooksResponse {
  items?: GoogleBooksItem[]
}

/**
 * Work metadata for edition discovery
 */
interface WorkMetadata {
  title: string
  authors: string[]
}

/**
 * Score breakdown for debugging
 */
interface ScoreBreakdown {
  hasExtraLargeImage: boolean
  hasLargeImage: boolean
  hasMediumImage: boolean
  isIllustrated: boolean
  isFirstEdition: boolean
  binding: string | undefined
  publicationYear: string | undefined
}

/**
 * Discovered edition with score
 */
interface Edition {
  isbn: string | undefined
  title: string
  subtitle?: string
  authors: string[]
  publisher?: string
  publishedDate?: string
  pageCount?: number
  imageLinks?: ImageLinks
  description?: string
  score: number
  _scoreBreakdown: ScoreBreakdown
}

/**
 * Top edition metadata for harvesting
 */
export interface TopEdition {
  isbn: string
  title: string
  score: number
  imageUrl?: string
  publisher?: string
  publishedDate?: string
}

/**
 * Score an edition based on quality indicators
 * @param volumeInfo - Google Books volume metadata
 * @returns Score from 0-100
 */
function scoreEdition(volumeInfo: VolumeInfo): number {
  let score = 0

  // Image quality (40 points max)
  if (volumeInfo.imageLinks?.extraLarge) {
    score += 40
  } else if (volumeInfo.imageLinks?.large) {
    score += 30
  } else if (volumeInfo.imageLinks?.medium) {
    score += 20
  } else if (volumeInfo.imageLinks?.thumbnail) {
    score += 10
  }

  // Edition type (30 points max)
  const description = (volumeInfo.description || '').toLowerCase()
  const title = (volumeInfo.title || '').toLowerCase()

  if (description.includes('illustrated') || title.includes('illustrated')) {
    score += 30
  } else if (description.includes('first edition') || title.includes('first edition')) {
    score += 25
  } else if (description.includes('collector') || title.includes('collector')) {
    score += 25
  } else if (description.includes('anniversary') || title.includes('anniversary')) {
    score += 20
  }

  // Binding type (15 points max)
  if (volumeInfo.printType === 'BOOK') {
    if (title.includes('hardcover') || description.includes('hardcover')) {
      score += 15
    } else if (title.includes('paperback') || description.includes('paperback')) {
      score += 10
    }
  }

  // Publication date recency (10 points max)
  if (volumeInfo.publishedDate) {
    const year = parseInt(volumeInfo.publishedDate.substring(0, 4), 10)
    const currentYear = new Date().getFullYear()
    const age = currentYear - year

    if (age <= 5) {
      score += 10 // Recent editions often have better covers
    } else if (age <= 15) {
      score += 5
    }
  }

  // Page count (5 points max)
  if (volumeInfo.pageCount && volumeInfo.pageCount > 0) {
    score += 5
  }

  return score
}

/**
 * Discover all editions of a Work using Google Books API
 * @param workMetadata - Basic work metadata
 * @param _env - Worker environment bindings
 * @returns Array of edition objects with scores
 */
export async function discoverEditions(workMetadata: WorkMetadata, _env: Env): Promise<Edition[]> {
  const { title, authors } = workMetadata

  if (!title || !authors || authors.length === 0) {
    console.warn('Missing title or authors for edition discovery')
    return []
  }

  try {
    // Build Google Books search query
    // Format: intitle:"Exact Title" inauthor:"Author Name"
    const titleQuery = `intitle:"${title.replace(/"/g, '')}"`
    const authorQuery = authors.map((a) => `inauthor:"${a.replace(/"/g, '')}"`).join(' ')
    const query = `${titleQuery} ${authorQuery}`

    // Query Google Books API
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', '40') // Max allowed by Google Books
    url.searchParams.set('printType', 'books') // Exclude magazines
    url.searchParams.set('orderBy', 'relevance')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    let response: Response
    try {
      response = await fetch(url.toString(), { signal: controller.signal })
      clearTimeout(timeout)
    } catch (err) {
      clearTimeout(timeout)
      if ((err as Error).name === 'AbortError') {
        console.error('Google Books API request timed out after 10 seconds')
        return []
      }
      throw err
    }

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`)
      return []
    }

    const data = (await response.json()) as GoogleBooksResponse

    if (!data.items || data.items.length === 0) {
      console.log(`No editions found for: ${title}`)
      return []
    }

    // Score each edition
    const editions = data.items
      .map((item) => {
        const volumeInfo = item.volumeInfo
        const score = scoreEdition(volumeInfo)

        // Extract ISBN-13 (prefer over ISBN-10)
        const identifiers = volumeInfo.industryIdentifiers || []
        const isbn13 = identifiers.find((id) => id.type === 'ISBN_13')
        const isbn10 = identifiers.find((id) => id.type === 'ISBN_10')
        const isbn = isbn13?.identifier || isbn10?.identifier

        return {
          isbn,
          title: volumeInfo.title,
          subtitle: volumeInfo.subtitle,
          authors: volumeInfo.authors || [],
          publisher: volumeInfo.publisher,
          publishedDate: volumeInfo.publishedDate,
          pageCount: volumeInfo.pageCount,
          imageLinks: volumeInfo.imageLinks,
          description: volumeInfo.description,
          score,
          // Debug info
          _scoreBreakdown: {
            hasExtraLargeImage: !!volumeInfo.imageLinks?.extraLarge,
            hasLargeImage: !!volumeInfo.imageLinks?.large,
            hasMediumImage: !!volumeInfo.imageLinks?.medium,
            isIllustrated: (volumeInfo.description || volumeInfo.title || '')
              .toLowerCase()
              .includes('illustrated'),
            isFirstEdition: (volumeInfo.description || volumeInfo.title || '')
              .toLowerCase()
              .includes('first edition'),
            binding: volumeInfo.printType,
            publicationYear: volumeInfo.publishedDate?.substring(0, 4),
          },
        }
      })
      .filter((edition): edition is Edition => !!edition.isbn) // Only keep editions with ISBNs
      .sort((a, b) => b.score - a.score) // Sort by score descending

    console.log(
      `Discovered ${editions.length} editions for "${title}" (top score: ${editions[0]?.score || 0})`,
    )

    return editions
  } catch (error) {
    console.error('Edition discovery error:', error)
    return []
  }
}

/**
 * Get top N editions for a Work
 * @param workMetadata - Basic work metadata
 * @param env - Worker environment bindings
 * @param limit - Max editions to return (default: 3)
 * @returns Top N edition ISBNs with metadata
 */
export async function getTopEditions(
  workMetadata: WorkMetadata,
  env: Env,
  limit = 3,
): Promise<TopEdition[]> {
  const allEditions = await discoverEditions(workMetadata, env)

  if (allEditions.length === 0) {
    return []
  }

  const topEditions = allEditions.slice(0, limit)

  // Log edition selection for debugging
  console.log(`Selected top ${topEditions.length} editions for "${workMetadata.title}":`)
  topEditions.forEach((ed, idx) => {
    console.log(
      `  ${idx + 1}. ISBN: ${ed.isbn}, Score: ${ed.score}, Publisher: ${ed.publisher || 'Unknown'}`,
    )
  })

  return topEditions.map((ed) => ({
    isbn: ed.isbn!,
    title: ed.title,
    score: ed.score,
    imageUrl: ed.imageLinks?.large || ed.imageLinks?.medium || ed.imageLinks?.thumbnail,
    publisher: ed.publisher,
    publishedDate: ed.publishedDate,
  }))
}
