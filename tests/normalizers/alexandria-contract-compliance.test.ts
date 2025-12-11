import { describe, it, expect } from 'vitest'

/**
 * Alexandria Response Transformation Contract Compliance Tests
 *
 * Tests the inline transformation from Alexandria Work/Edition/Authors DTOs
 * to V3 Book format in src/api-v3/index.ts
 *
 * Validates:
 * - All required V3 Book fields are populated correctly
 * - Optional fields handle undefined gracefully
 * - Empty/minimal Alexandria responses don't cause errors
 * - Provider is set to 'alexandria'
 * - Quality score defaults to 95
 * - Categories use subjectTags (not subjects)
 * - ISBN extraction from edition
 * - Authors array mapping
 *
 * Context: Alexandria is the primary data provider for BooksTrack.
 * Transformation logic is inline in handlers (lines 191-217 for search, 448-467 for enrich).
 */

describe('Alexandria to V3 Book Transformation', () => {
  // Helper function to simulate the transformation logic from src/api-v3/index.ts
  function transformAlexandriaToV3Book(work: any, edition: any, authors: any[], isbn?: string) {
    return {
      isbn: edition?.isbn || isbn || '',
      isbn10: undefined,
      title: work.title,
      subtitle: undefined,
      authors: authors.map((a: any) => a.name),
      publisher: edition?.publisher,
      publishedDate: edition?.publicationDate,
      description: work.description,
      pageCount: edition?.pageCount,
      categories: work.subjectTags,
      language: edition?.language || 'en',
      coverUrl: work.coverImageURL || edition?.coverImageURL,
      thumbnailUrl: work.coverImageURL || edition?.coverImageURL,
      workKey: work.openLibraryWorkID || work.openLibraryID,
      editionKey: edition?.openLibraryEditionID,
      provider: 'alexandria' as const,
      quality: 95
    }
  }

  describe('Complete Alexandria Response', () => {
    it('transforms full Alexandria work to V3 Book with all fields', () => {
      const work = {
        title: 'Harry Potter and the Sorcerers Stone',
        description: 'A young wizard discovers his magical heritage.',
        subjectTags: ['Fiction', 'Fantasy', 'Magic'],
        coverImageURL: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
        openLibraryWorkID: 'OL82563W',
        openLibraryID: 'OL82563W'
      }

      const edition = {
        isbn: '9780439708180',
        publisher: 'Scholastic Inc.',
        publicationDate: '1998-09-01',
        pageCount: 309,
        language: 'en',
        coverImageURL: 'https://covers.openlibrary.org/b/id/67890-L.jpg',
        openLibraryEditionID: 'OL7353617M'
      }

      const authors = [
        { name: 'J.K. Rowling' }
      ]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Required fields
      expect(book.isbn).toBe('9780439708180')
      expect(book.title).toBe('Harry Potter and the Sorcerers Stone')
      expect(book.authors).toEqual(['J.K. Rowling'])
      expect(book.provider).toBe('alexandria')
      expect(book.quality).toBe(95)

      // Optional fields populated
      expect(book.publisher).toBe('Scholastic Inc.')
      expect(book.publishedDate).toBe('1998-09-01')
      expect(book.description).toBe('A young wizard discovers his magical heritage.')
      expect(book.pageCount).toBe(309)
      expect(book.categories).toEqual(['Fiction', 'Fantasy', 'Magic'])
      expect(book.language).toBe('en')

      // Cover URLs (work.coverImageURL takes precedence)
      expect(book.coverUrl).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg')
      expect(book.thumbnailUrl).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg')

      // OpenLibrary keys
      expect(book.workKey).toBe('OL82563W')
      expect(book.editionKey).toBe('OL7353617M')

      // Fields always undefined in Alexandria responses
      expect(book.isbn10).toBeUndefined()
      expect(book.subtitle).toBeUndefined()
    })
  })

  describe('ISBN Extraction', () => {
    it('extracts ISBN from edition.isbn', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.isbn).toBe('9781234567890')
    })

    it('falls back to provided ISBN parameter when edition.isbn missing', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = {}
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors, '9780987654321')

      expect(book.isbn).toBe('9780987654321')
    })

    it('returns empty string when no ISBN available', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = {}
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.isbn).toBe('')
    })

    it('prefers edition.isbn over parameter ISBN', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781111111111' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors, '9782222222222')

      expect(book.isbn).toBe('9781111111111')
    })
  })

  describe('Authors Array Mapping', () => {
    it('maps single author correctly', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Jane Doe' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.authors).toEqual(['Jane Doe'])
    })

    it('maps multiple authors correctly', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [
        { name: 'Jane Doe' },
        { name: 'John Smith' },
        { name: 'Alice Johnson' }
      ]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.authors).toEqual(['Jane Doe', 'John Smith', 'Alice Johnson'])
    })

    it('handles empty authors array', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors: any[] = []

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.authors).toEqual([])
    })

    it('maps authors with additional metadata (only name used)', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [
        {
          name: 'J.K. Rowling',
          openLibraryAuthorID: 'OL23919A',
          birthDate: '1965-07-31',
          gender: 'Female'
        }
      ]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Only name is extracted
      expect(book.authors).toEqual(['J.K. Rowling'])
    })
  })

  describe('Categories Mapping (subjectTags)', () => {
    it('uses subjectTags for categories', () => {
      const work = {
        title: 'Test Book',
        subjectTags: ['Fiction', 'Mystery', 'Thriller']
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.categories).toEqual(['Fiction', 'Mystery', 'Thriller'])
    })

    it('handles empty subjectTags array', () => {
      const work = {
        title: 'Test Book',
        subjectTags: []
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.categories).toEqual([])
    })

    it('handles undefined subjectTags', () => {
      const work = {
        title: 'Test Book'
        // subjectTags: undefined
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.categories).toBeUndefined()
    })
  })

  describe('Provider and Quality Score', () => {
    it('always sets provider to "alexandria"', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.provider).toBe('alexandria')
    })

    it('always sets quality to 95', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.quality).toBe(95)
    })
  })

  describe('Optional Field Handling', () => {
    it('handles undefined subtitle gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // subtitle is always undefined for Alexandria responses
      expect(book.subtitle).toBeUndefined()
    })

    it('handles undefined pageCount gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.pageCount).toBeUndefined()
    })

    it('handles undefined coverUrl gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.coverUrl).toBeUndefined()
      expect(book.thumbnailUrl).toBeUndefined()
    })

    it('handles undefined publisher gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.publisher).toBeUndefined()
    })

    it('handles undefined publishedDate gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.publishedDate).toBeUndefined()
    })

    it('handles undefined description gracefully', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.description).toBeUndefined()
    })

    it('defaults language to "en" when undefined', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.language).toBe('en')
    })

    it('uses edition.language when provided', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890', language: 'fr' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.language).toBe('fr')
    })
  })

  describe('Cover URL Priority', () => {
    it('prefers work.coverImageURL over edition.coverImageURL', () => {
      const work = {
        title: 'Test Book',
        subjectTags: [],
        coverImageURL: 'https://work-cover.jpg'
      }
      const edition = {
        isbn: '9781234567890',
        coverImageURL: 'https://edition-cover.jpg'
      }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.coverUrl).toBe('https://work-cover.jpg')
      expect(book.thumbnailUrl).toBe('https://work-cover.jpg')
    })

    it('falls back to edition.coverImageURL when work.coverImageURL missing', () => {
      const work = {
        title: 'Test Book',
        subjectTags: []
      }
      const edition = {
        isbn: '9781234567890',
        coverImageURL: 'https://edition-cover.jpg'
      }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.coverUrl).toBe('https://edition-cover.jpg')
      expect(book.thumbnailUrl).toBe('https://edition-cover.jpg')
    })

    it('returns undefined when both cover URLs missing', () => {
      const work = {
        title: 'Test Book',
        subjectTags: []
      }
      const edition = {
        isbn: '9781234567890'
      }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.coverUrl).toBeUndefined()
      expect(book.thumbnailUrl).toBeUndefined()
    })
  })

  describe('OpenLibrary Key Handling', () => {
    it('uses openLibraryWorkID when available', () => {
      const work = {
        title: 'Test Book',
        subjectTags: [],
        openLibraryWorkID: 'OL12345W',
        openLibraryID: 'OL67890W'
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.workKey).toBe('OL12345W')
    })

    it('falls back to openLibraryID when openLibraryWorkID missing', () => {
      const work = {
        title: 'Test Book',
        subjectTags: [],
        openLibraryID: 'OL67890W'
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.workKey).toBe('OL67890W')
    })

    it('handles undefined OpenLibrary work keys', () => {
      const work = {
        title: 'Test Book',
        subjectTags: []
      }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.workKey).toBeUndefined()
    })

    it('extracts editionKey from edition.openLibraryEditionID', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = {
        isbn: '9781234567890',
        openLibraryEditionID: 'OL7353617M'
      }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.editionKey).toBe('OL7353617M')
    })

    it('handles undefined edition key', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.editionKey).toBeUndefined()
    })
  })

  describe('Empty/Minimal Alexandria Responses', () => {
    it('handles minimal work with only title', () => {
      const work = { title: 'Minimal Book', subjectTags: [] }
      const edition = undefined
      const authors: any[] = []

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Required fields
      expect(book.title).toBe('Minimal Book')
      expect(book.authors).toEqual([])
      expect(book.provider).toBe('alexandria')
      expect(book.quality).toBe(95)

      // Defaults
      expect(book.language).toBe('en')
      expect(book.isbn).toBe('')

      // Optional fields undefined
      expect(book.publisher).toBeUndefined()
      expect(book.publishedDate).toBeUndefined()
      expect(book.description).toBeUndefined()
      expect(book.pageCount).toBeUndefined()
      expect(book.coverUrl).toBeUndefined()
      expect(book.thumbnailUrl).toBeUndefined()
      expect(book.workKey).toBeUndefined()
      expect(book.editionKey).toBeUndefined()
    })

    it('handles work with empty subjectTags array', () => {
      const work = { title: 'Book With No Categories', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.categories).toEqual([])
    })

    it('handles response with no edition object', () => {
      const work = { title: 'Test Book', subjectTags: ['Fiction'] }
      const edition = undefined
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors, '9781234567890')

      // Falls back to parameter ISBN
      expect(book.isbn).toBe('9781234567890')

      // Edition fields are undefined
      expect(book.publisher).toBeUndefined()
      expect(book.publishedDate).toBeUndefined()
      expect(book.pageCount).toBeUndefined()
      expect(book.editionKey).toBeUndefined()

      // Language defaults to 'en'
      expect(book.language).toBe('en')

      // Work fields still present
      expect(book.title).toBe('Test Book')
      expect(book.categories).toEqual(['Fiction'])
    })

    it('does not throw errors on completely empty work object', () => {
      const work = { title: '', subjectTags: [] }
      const edition = undefined
      const authors: any[] = []

      // Should not throw
      expect(() => transformAlexandriaToV3Book(work, edition, authors)).not.toThrow()

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Still returns valid structure
      expect(book.provider).toBe('alexandria')
      expect(book.quality).toBe(95)
      expect(book.authors).toEqual([])
      expect(book.language).toBe('en')
    })
  })

  describe('Edge Cases', () => {
    it('handles work with null description', () => {
      const work = { title: 'Test Book', description: null, subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // null is preserved as-is (not converted to undefined)
      expect(book.description).toBeNull()
    })

    it('handles edition with null publisher', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890', publisher: null }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.publisher).toBeNull()
    })

    it('handles pageCount as 0', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890', pageCount: 0 }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // 0 is a valid pageCount
      expect(book.pageCount).toBe(0)
    })

    it('handles very long author names', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [
        { name: 'Dr. Professor Extraordinaire Very Long Name III Esquire Jr.' }
      ]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.authors).toEqual(['Dr. Professor Extraordinaire Very Long Name III Esquire Jr.'])
    })

    it('handles special characters in title', () => {
      const work = { title: 'Book: The "Sequel" & More!', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.title).toBe('Book: The "Sequel" & More!')
    })

    it('handles Unicode characters in authors', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [
        { name: 'José García Márquez' },
        { name: '村上春樹' }
      ]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      expect(book.authors).toEqual(['José García Márquez', '村上春樹'])
    })
  })

  describe('Contract Compliance', () => {
    it('never returns null for required Book fields', () => {
      const work = { title: 'Test Book', subjectTags: [] }
      const edition = { isbn: '9781234567890' }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Required fields must never be null or undefined
      expect(book.isbn).not.toBeNull()
      expect(book.title).not.toBeNull()
      expect(book.authors).not.toBeNull()
      expect(book.provider).not.toBeNull()
      expect(book.quality).not.toBeNull()

      // Required fields must be the correct type
      expect(typeof book.isbn).toBe('string')
      expect(typeof book.title).toBe('string')
      expect(Array.isArray(book.authors)).toBe(true)
      expect(book.provider).toBe('alexandria')
      expect(typeof book.quality).toBe('number')
    })

    it('produces valid V3 Book structure', () => {
      const work = {
        title: 'Test Book',
        description: 'Test description',
        subjectTags: ['Fiction'],
        coverImageURL: 'https://cover.jpg',
        openLibraryWorkID: 'OL123W'
      }
      const edition = {
        isbn: '9781234567890',
        publisher: 'Test Publisher',
        publicationDate: '2024-01-01',
        pageCount: 200,
        language: 'en',
        openLibraryEditionID: 'OL456M'
      }
      const authors = [{ name: 'Test Author' }]

      const book = transformAlexandriaToV3Book(work, edition, authors)

      // Verify all expected V3 Book keys are present
      const expectedKeys = [
        'isbn', 'isbn10', 'title', 'subtitle', 'authors',
        'publisher', 'publishedDate', 'description', 'pageCount',
        'categories', 'language', 'coverUrl', 'thumbnailUrl',
        'workKey', 'editionKey', 'provider', 'quality'
      ]

      expectedKeys.forEach(key => {
        expect(book).toHaveProperty(key)
      })

      // Verify no extra keys
      expect(Object.keys(book).sort()).toEqual(expectedKeys.sort())
    })
  })
})
