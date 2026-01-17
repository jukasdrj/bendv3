import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enrichMultipleBooks } from '../../src/services/enrichment.js'
import * as externalApis from '../../src/services/external-apis.js'

// Mock dependencies
const mockAlexandriaClient = {
  api: {
    search: {
      $get: vi.fn(),
    },
  },
}

vi.mock('../../src/services/alexandria-client.js', () => ({
  createAlexandriaClient: () => mockAlexandriaClient,
}))

// Spy on external APIs
const searchGoogleBooksSpy = vi.spyOn(externalApis, 'searchGoogleBooks')
const searchGoogleBooksByISBNSpy = vi.spyOn(externalApis, 'searchGoogleBooksByISBN')
const searchOpenLibrarySpy = vi.spyOn(externalApis, 'searchOpenLibrary')

describe('enrichMultipleBooks Fallback Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default Google Books mock response
    searchGoogleBooksSpy.mockResolvedValue({
      works: [{
        title: 'Google Book',
        subjectTags: [],
        goodreadsWorkIDs: [],
        amazonASINs: [],
        librarythingIDs: [],
        googleBooksVolumeIDs: [],
        isbndbQuality: 0,
        reviewStatus: 'verified',
        primaryProvider: 'google-books',
        authors: [{ name: 'Google Author', gender: 'Unknown' }]
      }],
      editions: [{
        isbn: '1234567890',
        isbns: ['1234567890'],
        title: 'Google Book',
        format: 'hardcover',
        amazonASINs: [],
        googleBooksVolumeIDs: [],
        librarythingIDs: [],
        isbndbQuality: 0,
      }],
      authors: [{ name: 'Google Author', gender: 'Unknown' }]
    })

    searchOpenLibrarySpy.mockResolvedValue({
      works: [], editions: [], authors: []
    })
  })

  it('should fallback to Google Books when Alexandria returns no results for title/author', async () => {
    // Mock Alexandria returning empty results
    mockAlexandriaClient.api.search.$get.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { results: [] }
      })
    })

    const result = await enrichMultipleBooks(
      { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
      {} as any
    )

    // Verify Alexandria was called
    expect(mockAlexandriaClient.api.search.$get).toHaveBeenCalled()
    
    // Verify fallback to Google Books
    expect(searchGoogleBooksSpy).toHaveBeenCalledWith(
      expect.stringContaining('The Great Gatsby'),
      expect.any(Object),
      expect.any(Object)
    )

    // Verify result contains Google Books data
    expect(result.works.length).toBe(1)
    expect(result.works[0].title).toBe('Google Book')
  })

  it('should fallback to Google Books by ISBN when Alexandria returns no results for ISBN', async () => {
    mockAlexandriaClient.api.search.$get.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { results: [] }
      })
    })
    
     // Mock Google Books ISBN response
    searchGoogleBooksByISBNSpy.mockResolvedValue({
      works: [{title: 'ISBN Book', subjectTags: [], goodreadsWorkIDs: [], amazonASINs: [], librarythingIDs: [], googleBooksVolumeIDs: [], isbndbQuality: 0, reviewStatus: 'verified', primaryProvider: 'google-books', authors: []}],
      editions: [],
      authors: []
    })

    await enrichMultipleBooks(
      { isbn: '9780743273565' },
      {} as any
    )
    
    expect(searchGoogleBooksByISBNSpy).toHaveBeenCalledWith(
      '9780743273565',
      expect.any(Object)
    )
  })
})
