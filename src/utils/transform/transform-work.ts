/**
 * Work to Google Books format transformation utility
 * Single source of truth for converting normalized Work objects to Google Books volumeInfo format
 *
 * Canonical field mapping:
 * - categories: uses work.subjects (more stable than edition.genres)
 * - authors: handles multiple format variations (string, object, array)
 * - authorsDetailed: includes cultural diversity fields (culturalRegion, nationality, etc.)
 * - covers: prefers edition.coverImageURL with placeholder fallback
 */

import { generateSearchLinks, getPlaceholderCover } from './book-metadata.js'

/**
 * Author information (various formats)
 */
interface AuthorInput {
  name?: string
  gender?: string
  culturalRegion?: string
  nationality?: string
  birthYear?: number
  deathYear?: number
  openLibraryID?: string
  isbndbID?: string
  googleBooksID?: string
  goodreadsID?: string
  bookCount?: number
}

/**
 * Detailed author object with cultural diversity fields
 */
interface AuthorDetailed {
  name: string
  gender: string
  culturalRegion?: string
  nationality?: string
  birthYear?: number
  deathYear?: number
  openLibraryID?: string
  isbndbID?: string
  googleBooksID?: string
  goodreadsID?: string
  bookCount?: number
}

/**
 * Edition information
 */
interface Edition {
  isbn10?: string
  isbn13?: string
  coverImageURL?: string
  publisher?: string
  publicationDate?: string
  pageCount?: number
  description?: string
  authors?: (string | AuthorInput)[]
}

/**
 * Work object from provider
 */
interface Work {
  id?: string
  openLibraryWorkKey?: string
  title: string
  subtitle?: string
  authors?: (string | AuthorInput)[]
  subjects?: string[]
  description?: string
  firstPublicationYear?: number
  editions?: Edition[]
}

/**
 * Industry identifier
 */
interface IndustryIdentifier {
  type: 'ISBN_10' | 'ISBN_13'
  identifier: string
}

/**
 * Image links
 */
interface ImageLinks {
  thumbnail: string
  smallThumbnail: string
}

/**
 * Volume info (Google Books format)
 */
interface VolumeInfo {
  title: string
  subtitle?: string
  authors: string[]
  authorsDetailed?: AuthorDetailed[]
  publisher?: string
  publishedDate?: string
  description?: string
  industryIdentifiers: IndustryIdentifier[]
  pageCount?: number
  categories: string[]
  imageLinks: ImageLinks
}

/**
 * Search links for HATEOAS
 */
interface SearchLinks {
  googleBooks?: string
  openLibrary?: string
  amazon?: string
}

/**
 * Google Books volume format
 */
export interface GoogleBooksVolume {
  kind: 'books#volume'
  id: string
  volumeInfo: VolumeInfo
  searchLinks: SearchLinks
}

/**
 * Transform a normalized Work object to Google Books format
 *
 * @param work - Normalized work object from provider
 * @returns Book object in Google Books format with volumeInfo
 */
export function transformWorkToGoogleFormat(work: Work): GoogleBooksVolume {
  // Get primary edition (first one with most metadata)
  const primaryEdition = work.editions && work.editions.length > 0 ? work.editions[0] : null

  // Extract and normalize authors from work or fall back to edition
  const { authors, authorsDetailed } = extractAuthors(work, primaryEdition)

  // Build industry identifiers from primary edition
  const industryIdentifiers = buildIndustryIdentifiers(primaryEdition)

  // Get cover image URL with placeholder fallback
  const coverImageURL = primaryEdition?.coverImageURL || getPlaceholderCover()

  // Build volumeInfo object with canonical field mapping
  const volumeInfo: VolumeInfo = {
    title: work.title,
    subtitle: work.subtitle,
    authors: authors,
    authorsDetailed: authorsDetailed.length > 0 ? authorsDetailed : undefined,
    publisher: primaryEdition?.publisher,
    publishedDate: work.firstPublicationYear
      ? work.firstPublicationYear.toString()
      : primaryEdition?.publicationDate,
    description: work.description || primaryEdition?.description,
    industryIdentifiers: industryIdentifiers,
    pageCount: primaryEdition?.pageCount,
    categories: work.subjects || [], // CANONICAL: use work.subjects
    imageLinks: {
      thumbnail: coverImageURL,
      smallThumbnail: coverImageURL,
    },
  }

  // Generate volume ID with fallback hierarchy
  const volumeId =
    work.id ||
    work.openLibraryWorkKey ||
    `synthetic-${work.title.replace(/\s+/g, '-').toLowerCase()}`

  // Extract ISBN for search links (prefer ISBN-13)
  const isbn = primaryEdition?.isbn13 || primaryEdition?.isbn10 || null

  // Generate HATEOAS search links
  const searchLinks = generateSearchLinks(
    isbn,
    work.title,
    authors[0], // Primary author
    volumeId,
  )

  return {
    kind: 'books#volume',
    id: volumeId,
    volumeInfo: volumeInfo,
    searchLinks: searchLinks,
  }
}

/**
 * Extract and normalize authors from work or edition
 * Handles multiple author format variations (string, object, array)
 *
 * @param work - Work object
 * @param primaryEdition - Primary edition object (fallback)
 * @returns Object with authors array and detailed authors
 */
function extractAuthors(
  work: Work,
  primaryEdition: Edition | null,
): { authors: string[]; authorsDetailed: AuthorDetailed[] } {
  let authors: string[] = []
  let authorsDetailed: AuthorDetailed[] = []

  // Try work.authors first (preferred source)
  if (work.authors) {
    if (Array.isArray(work.authors)) {
      authors = work.authors.map((a) => {
        if (typeof a === 'string') return a
        if (typeof a === 'object' && a !== null && a.name) return a.name
        return String(a)
      })

      // Preserve full AuthorDTO objects for cultural diversity fields
      authorsDetailed = work.authors
        .filter((a): a is AuthorInput => typeof a === 'object' && a !== null)
        .map((a) => buildAuthorDetails(a))
    } else if (typeof work.authors === 'string') {
      authors = [work.authors]
      authorsDetailed = [{ name: work.authors, gender: 'Unknown' }]
    }
  }

  // Fallback to edition.authors if work has no authors
  if (authors.length === 0 && primaryEdition?.authors) {
    authors = Array.isArray(primaryEdition.authors)
      ? primaryEdition.authors.map((a) => {
          if (typeof a === 'string') return a
          if (typeof a === 'object' && a !== null && a.name) return a.name
          return String(a)
        })
      : [String(primaryEdition.authors)]

    // Also try to preserve detailed author info from edition
    if (Array.isArray(primaryEdition.authors)) {
      authorsDetailed = primaryEdition.authors
        .filter((a): a is AuthorInput => typeof a === 'object' && a !== null)
        .map((a) => buildAuthorDetails(a))
    }
  }

  return { authors, authorsDetailed }
}

/**
 * Build detailed author object with cultural diversity fields
 *
 * @param author - Author object
 * @returns Detailed author with optional cultural fields
 */
function buildAuthorDetails(author: AuthorInput): AuthorDetailed {
  return {
    name: author.name || 'Unknown',
    gender: author.gender || 'Unknown',
    ...(author.culturalRegion && { culturalRegion: author.culturalRegion }),
    ...(author.nationality && { nationality: author.nationality }),
    ...(author.birthYear && { birthYear: author.birthYear }),
    ...(author.deathYear && { deathYear: author.deathYear }),
    ...(author.openLibraryID && { openLibraryID: author.openLibraryID }),
    ...(author.isbndbID && { isbndbID: author.isbndbID }),
    ...(author.googleBooksID && { googleBooksID: author.googleBooksID }),
    ...(author.goodreadsID && { goodreadsID: author.goodreadsID }),
    ...(author.bookCount && { bookCount: author.bookCount }),
  }
}

/**
 * Build industry identifiers from edition
 *
 * @param primaryEdition - Edition object
 * @returns Array of ISBN identifiers
 */
function buildIndustryIdentifiers(primaryEdition: Edition | null): IndustryIdentifier[] {
  const identifiers: IndustryIdentifier[] = []

  if (primaryEdition?.isbn13) {
    identifiers.push({
      type: 'ISBN_13',
      identifier: primaryEdition.isbn13,
    })
  }

  if (primaryEdition?.isbn10) {
    identifiers.push({
      type: 'ISBN_10',
      identifier: primaryEdition.isbn10,
    })
  }

  return identifiers
}
