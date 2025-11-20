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
 * Transform a normalized Work object to Google Books format
 * @param {Object} work - Normalized work object from provider
 * @param {Array} work.authors - Author objects with name and metadata
 * @param {string} work.title - Book title
 * @param {string} work.subtitle - Book subtitle
 * @param {Array} work.subjects - Subject categories (canonical source)
 * @param {string} work.description - Book description
 * @param {string} work.firstPublicationYear - Year of first publication
 * @param {Array} work.editions - Edition objects with ISBN and publication details
 * @param {string} work.id - Work ID
 * @param {string} work.openLibraryWorkKey - OpenLibrary work key
 * @returns {Object} Book object in Google Books format with volumeInfo
 */
export function transformWorkToGoogleFormat(work) {
  // Get primary edition (first one with most metadata)
  const primaryEdition =
    work.editions && work.editions.length > 0 ? work.editions[0] : null

  // Extract and normalize authors from work or fall back to edition
  const { authors, authorsDetailed } = extractAuthors(work, primaryEdition)

  // Build industry identifiers from primary edition
  const industryIdentifiers = buildIndustryIdentifiers(primaryEdition)

  // Get cover image URL with placeholder fallback
  const coverImageURL = primaryEdition?.coverImageURL || getPlaceholderCover()

  // Build volumeInfo object with canonical field mapping
  const volumeInfo = {
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
 * @param {Object} work - Work object
 * @param {Object} primaryEdition - Primary edition object (fallback)
 * @returns {Object} { authors: string[], authorsDetailed: Object[] }
 */
function extractAuthors(work, primaryEdition) {
  let authors = []
  let authorsDetailed = []

  // Try work.authors first (preferred source)
  if (work.authors) {
    if (Array.isArray(work.authors)) {
      authors = work.authors.map((a) => {
        if (typeof a === 'string') return a
        if (a && a.name) return a.name
        return String(a)
      })

      // Preserve full AuthorDTO objects for cultural diversity fields
      authorsDetailed = work.authors
        .filter((a) => typeof a === 'object' && a !== null)
        .map((a) => buildAuthorDetails(a))
    } else if (typeof work.authors === 'string') {
      authors = [work.authors]
      authorsDetailed = [{ name: work.authors, gender: 'Unknown' }]
    }
  }

  // Fallback to edition.authors if work has no authors
  if (authors.length === 0 && primaryEdition?.authors) {
    authors = Array.isArray(primaryEdition.authors)
      ? primaryEdition.authors.map((a) =>
          typeof a === 'string' ? a : a.name || String(a),
        )
      : [String(primaryEdition.authors)]

    // Also try to preserve detailed author info from edition
    if (Array.isArray(primaryEdition.authors)) {
      authorsDetailed = primaryEdition.authors
        .filter((a) => typeof a === 'object' && a !== null)
        .map((a) => buildAuthorDetails(a))
    }
  }

  return { authors, authorsDetailed }
}

/**
 * Build detailed author object with cultural diversity fields
 * @param {Object} author - Author object
 * @returns {Object} Detailed author with optional cultural fields
 */
function buildAuthorDetails(author) {
  return {
    name: author.name,
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
 * @param {Object} primaryEdition - Edition object
 * @returns {Array} Array of ISBN identifiers
 */
function buildIndustryIdentifiers(primaryEdition) {
  const identifiers = []

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
