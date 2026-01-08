/**
 * Unit tests for BookRecord Builder
 *
 * Tests the shared transformation logic that converts enrichment results
 * into BookRecord objects for storage.
 */

import { describe, expect, it } from 'vitest'
import type { AuthorDTO, EditionDTO, WorkDTO } from '../../src/types/canonical'
import type { EnrichmentResult } from '../../src/utils/book-record-builder'
import { buildBookRecordFromEnrichment } from '../../src/utils/book-record-builder'

describe('buildBookRecordFromEnrichment', () => {
  const mockWork: WorkDTO = {
    title: 'Harry Potter and the Sorcerer\'s Stone',
    subjectTags: ['fantasy', 'magic'],
    originalLanguage: 'en',
    firstPublicationYear: 1997,
    description: 'A young wizard discovers his magical heritage.',
    coverImageURL: 'https://example.com/cover.jpg',
    synthetic: false,
    primaryProvider: 'alexandria',
    openLibraryWorkID: '/works/OL82563W',
    goodreadsWorkIDs: ['1234567'],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [],
    isbndbQuality: 85,
    reviewStatus: 'published',
  }

  const mockEdition: EditionDTO = {
    isbn: '9780439708180',
    isbns: ['9780439708180', '0439708184'],
    title: 'Harry Potter and the Sorcerer\'s Stone',
    publisher: 'Scholastic',
    publicationDate: '1998-09-01',
    pageCount: 309,
    format: 'Paperback',
    language: 'en',
    primaryProvider: 'alexandria',
    amazonASINs: [],
    googleBooksVolumeIDs: [],
    librarythingIDs: [],
    isbndbQuality: 85,
  }

  const mockAuthor: AuthorDTO = {
    name: 'J.K. Rowling',
    gender: 'female',
    culturalRegion: 'western',
    birthYear: 1965,
    openLibraryID: '/authors/OL23919A',
  }

  const mockEnrichmentResult: EnrichmentResult = {
    works: [mockWork],
    editions: [mockEdition],
    authors: [mockAuthor],
  }

  it('should build complete BookRecord with all fields', () => {
    const isbn = '9780439708180'
    const coverURLs = {
      small: 'https://covers.alexandria.com/small/12345.jpg',
      medium: 'https://covers.alexandria.com/medium/12345.jpg',
      large: 'https://covers.alexandria.com/large/12345.jpg',
    }

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult, coverURLs)

    expect(result.isbn).toBe(isbn)
    expect(result.title).toBe(mockWork.title)
    expect(result.subtitle).toBeNull()
    expect(result.description).toBe(mockWork.description)
    expect(result.publisher).toBe(mockEdition.publisher)
    expect(result.publicationDate).toBe(mockEdition.publicationDate)
    expect(result.language).toBe(mockEdition.language)
    expect(result.pageCount).toBe(mockEdition.pageCount)
    expect(result.coverSmallUrl).toBe(coverURLs.small)
    expect(result.coverMediumUrl).toBe(coverURLs.medium)
    expect(result.coverLargeUrl).toBe(coverURLs.large)
    expect(result.canonicalMetadata).toEqual({
      works: mockEnrichmentResult.works,
      editions: mockEnrichmentResult.editions,
      authors: mockEnrichmentResult.authors,
    })
    expect(result.providerMetadata).toBeNull()
    expect(result.createdAt).toBeGreaterThan(0)
    expect(result.updatedAt).toBeGreaterThan(0)
    expect(result.createdAt).toBe(result.updatedAt)
  })

  it('should use work cover URL when coverURLs not provided', () => {
    const isbn = '9780439708180'

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult)

    expect(result.coverSmallUrl).toBe(mockWork.coverImageURL)
    expect(result.coverMediumUrl).toBe(mockWork.coverImageURL)
    expect(result.coverLargeUrl).toBe(mockWork.coverImageURL)
  })

  it('should fall back to edition cover URL when work has no cover', () => {
    const isbn = '9780439708180'
    const workWithoutCover: WorkDTO = {
      ...mockWork,
      coverImageURL: undefined,
    }
    const editionWithCover: EditionDTO = {
      ...mockEdition,
      coverImageURL: 'https://example.com/edition-cover.jpg',
    }

    const enrichmentResult: EnrichmentResult = {
      works: [workWithoutCover],
      editions: [editionWithCover],
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.coverSmallUrl).toBe(editionWithCover.coverImageURL)
    expect(result.coverMediumUrl).toBe(editionWithCover.coverImageURL)
    expect(result.coverLargeUrl).toBe(editionWithCover.coverImageURL)
  })

  it('should handle missing cover URLs gracefully', () => {
    const isbn = '9780439708180'
    const workWithoutCover: WorkDTO = {
      ...mockWork,
      coverImageURL: undefined,
    }
    const editionWithoutCover: EditionDTO = {
      ...mockEdition,
      coverImageURL: undefined,
    }

    const enrichmentResult: EnrichmentResult = {
      works: [workWithoutCover],
      editions: [editionWithoutCover],
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.coverSmallUrl).toBeNull()
    expect(result.coverMediumUrl).toBeNull()
    expect(result.coverLargeUrl).toBeNull()
  })

  it('should handle missing edition data', () => {
    const isbn = '9780439708180'
    const enrichmentResult: EnrichmentResult = {
      works: [mockWork],
      editions: undefined,
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.publisher).toBeNull()
    expect(result.publicationDate).toBeNull()
    expect(result.language).toBe('en') // Default
    expect(result.pageCount).toBeNull()
    expect(result.canonicalMetadata.editions).toEqual([])
  })

  it('should handle missing authors data', () => {
    const isbn = '9780439708180'
    const enrichmentResult: EnrichmentResult = {
      works: [mockWork],
      editions: [mockEdition],
      authors: undefined,
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.canonicalMetadata.authors).toEqual([])
  })

  it('should default title to "Unknown" when work title is missing', () => {
    const isbn = '9780439708180'
    const workWithoutTitle: WorkDTO = {
      ...mockWork,
      title: '',
    }

    const enrichmentResult: EnrichmentResult = {
      works: [workWithoutTitle],
      editions: [mockEdition],
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.title).toBe('Unknown')
  })

  it('should handle missing work description gracefully', () => {
    const isbn = '9780439708180'
    const workWithoutDescription: WorkDTO = {
      ...mockWork,
      description: undefined,
    }

    const enrichmentResult: EnrichmentResult = {
      works: [workWithoutDescription],
      editions: [mockEdition],
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.description).toBeNull()
  })

  it('should handle empty edition fields gracefully', () => {
    const isbn = '9780439708180'
    const sparseEdition: EditionDTO = {
      isbn: '9780439708180',
      isbns: ['9780439708180'],
      format: 'Paperback',
      amazonASINs: [],
      googleBooksVolumeIDs: [],
      librarythingIDs: [],
      isbndbQuality: 0,
    }

    const enrichmentResult: EnrichmentResult = {
      works: [mockWork],
      editions: [sparseEdition],
      authors: [mockAuthor],
    }

    const result = buildBookRecordFromEnrichment(isbn, enrichmentResult)

    expect(result.publisher).toBeNull()
    expect(result.publicationDate).toBeNull()
    expect(result.language).toBe('en')
    expect(result.pageCount).toBeNull()
  })

  it('should throw error when enrichment result has no works', () => {
    const isbn = '9780439708180'
    const emptyEnrichmentResult: EnrichmentResult = {
      works: [],
      editions: [],
      authors: [],
    }

    expect(() => {
      buildBookRecordFromEnrichment(isbn, emptyEnrichmentResult)
    }).toThrow('EnrichmentResult must contain at least one work')
  })

  it('should use provided cover URLs over work/edition URLs', () => {
    const isbn = '9780439708180'
    const alexandriaCoverURLs = {
      small: 'https://covers.alexandria.com/small/12345.jpg',
      medium: 'https://covers.alexandria.com/medium/12345.jpg',
      large: 'https://covers.alexandria.com/large/12345.jpg',
    }

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult, alexandriaCoverURLs)

    // Should use Alexandria URLs, not work/edition URLs
    expect(result.coverSmallUrl).toBe(alexandriaCoverURLs.small)
    expect(result.coverMediumUrl).toBe(alexandriaCoverURLs.medium)
    expect(result.coverLargeUrl).toBe(alexandriaCoverURLs.large)
    expect(result.coverSmallUrl).not.toBe(mockWork.coverImageURL)
  })

  it('should handle partial cover URL sets', () => {
    const isbn = '9780439708180'
    const partialCoverURLs = {
      small: 'https://covers.alexandria.com/small/12345.jpg',
      medium: null,
      large: 'https://covers.alexandria.com/large/12345.jpg',
    }

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult, partialCoverURLs)

    expect(result.coverSmallUrl).toBe(partialCoverURLs.small)
    expect(result.coverMediumUrl).toBeNull()
    expect(result.coverLargeUrl).toBe(partialCoverURLs.large)
  })

  it('should set subtitle to null (not supported in WorkDTO)', () => {
    const isbn = '9780439708180'

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult)

    expect(result.subtitle).toBeNull()
  })

  it('should set providerMetadata to null', () => {
    const isbn = '9780439708180'

    const result = buildBookRecordFromEnrichment(isbn, mockEnrichmentResult)

    expect(result.providerMetadata).toBeNull()
  })

  it('should handle real-world Alexandria webhook data', () => {
    const isbn = '9781250301697'
    const webhookEnrichmentResult: EnrichmentResult = {
      works: [
        {
          title: 'The Midnight Library',
          subjectTags: ['Fiction', 'Philosophy'],
          originalLanguage: 'en',
          firstPublicationYear: 2020,
          description: 'A dazzling novel about all the choices that go into a life well lived.',
          coverImageURL: 'https://covers.alexandria.com/works/OL20893680W/large.jpg',
          synthetic: false,
          primaryProvider: 'alexandria',
          openLibraryWorkID: '/works/OL20893680W',
          goodreadsWorkIDs: ['52578297'],
          amazonASINs: [],
          librarythingIDs: [],
          googleBooksVolumeIDs: [],
          isbndbQuality: 90,
          reviewStatus: 'published',
        },
      ],
      editions: [
        {
          isbn: '9781250301697',
          isbns: ['9781250301697', '1250301696'],
          title: 'The Midnight Library',
          publisher: 'Viking',
          publicationDate: '2020-08-13',
          pageCount: 304,
          format: 'Hardcover',
          language: 'en',
          primaryProvider: 'alexandria',
          amazonASINs: [],
          googleBooksVolumeIDs: [],
          librarythingIDs: [],
          isbndbQuality: 90,
        },
      ],
      authors: [
        {
          name: 'Matt Haig',
          gender: 'male',
          culturalRegion: 'western',
          birthYear: 1975,
          openLibraryID: '/authors/OL1518569A',
        },
      ],
    }

    const result = buildBookRecordFromEnrichment(isbn, webhookEnrichmentResult)

    expect(result.isbn).toBe(isbn)
    expect(result.title).toBe('The Midnight Library')
    expect(result.description).toContain('dazzling novel')
    expect(result.publisher).toBe('Viking')
    expect(result.publicationDate).toBe('2020-08-13')
    expect(result.pageCount).toBe(304)
    expect(result.language).toBe('en')
    expect(result.canonicalMetadata.works).toHaveLength(1)
    expect(result.canonicalMetadata.editions).toHaveLength(1)
    expect(result.canonicalMetadata.authors).toHaveLength(1)
  })
})
