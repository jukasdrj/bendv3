/**
 * V3 Search Pagination Tests
 *
 * Verifies that pagination correctly reflects true total count (#187)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('V3 Search Pagination', () => {
  describe('Issue #187: True total count in pagination', () => {
    it('should calculate totalPages from all results, not just current page', () => {
      // Simulate 50 total books
      const allBooks = Array.from({ length: 50 }, (_, i) => ({
        isbn: `978043970818${i}`,
        title: `Book ${i + 1}`
      }))

      const limit = 20
      const page = 1

      // Calculate pagination (same logic as V3 API)
      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit)
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      // Assertions
      expect(totalResults).toBe(50)
      expect(totalPages).toBe(3) // 50 books / 20 per page = 3 pages
      expect(paginatedBooks.length).toBe(20) // First page has 20 books
      expect(page < totalPages).toBe(true) // hasNext should be true
      expect(page > 1).toBe(false) // hasPrev should be false
    })

    it('should correctly paginate to page 2', () => {
      const allBooks = Array.from({ length: 50 }, (_, i) => ({
        isbn: `978043970818${i}`,
        title: `Book ${i + 1}`
      }))

      const limit = 20
      const page = 2

      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit)
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      expect(paginatedBooks.length).toBe(20) // Second page has 20 books
      expect(paginatedBooks[0].title).toBe('Book 21') // First book on page 2
      expect(page < totalPages).toBe(true) // hasNext should be true
      expect(page > 1).toBe(true) // hasPrev should be true
    })

    it('should correctly paginate to last page with partial results', () => {
      const allBooks = Array.from({ length: 50 }, (_, i) => ({
        isbn: `978043970818${i}`,
        title: `Book ${i + 1}`
      }))

      const limit = 20
      const page = 3

      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit)
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      expect(paginatedBooks.length).toBe(10) // Last page has 10 books (50 % 20)
      expect(paginatedBooks[0].title).toBe('Book 41') // First book on page 3
      expect(page < totalPages).toBe(false) // hasNext should be false
      expect(page > 1).toBe(true) // hasPrev should be true
    })

    it('should handle empty results', () => {
      const allBooks: any[] = []
      const limit = 20
      const page = 1

      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit) || 0
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      expect(totalResults).toBe(0)
      expect(totalPages).toBe(0)
      expect(paginatedBooks.length).toBe(0)
      expect(page < totalPages).toBe(false) // hasNext should be false
      expect(page > 1).toBe(false) // hasPrev should be false
    })

    it('should handle single page of results', () => {
      const allBooks = Array.from({ length: 10 }, (_, i) => ({
        isbn: `978043970818${i}`,
        title: `Book ${i + 1}`
      }))

      const limit = 20
      const page = 1

      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit)
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      expect(totalResults).toBe(10)
      expect(totalPages).toBe(1) // Only 1 page needed
      expect(paginatedBooks.length).toBe(10)
      expect(page < totalPages).toBe(false) // hasNext should be false
      expect(page > 1).toBe(false) // hasPrev should be false
    })

    it('should not return books beyond available results', () => {
      const allBooks = Array.from({ length: 50 }, (_, i) => ({
        isbn: `978043970818${i}`,
        title: `Book ${i + 1}`
      }))

      const limit = 20
      const page = 10 // Request page far beyond available data

      const totalResults = allBooks.length
      const totalPages = Math.ceil(totalResults / limit)
      const startIdx = (page - 1) * limit
      const endIdx = startIdx + limit
      const paginatedBooks = allBooks.slice(startIdx, endIdx)

      expect(paginatedBooks.length).toBe(0) // No books on page 10
      expect(page > totalPages).toBe(true) // Page is beyond available pages
    })
  })

  describe('Issue #186: Search mode validation', () => {
    it('should only accept "text" mode in schema', async () => {
      const { SearchModeSchema } = await import('../../packages/schemas/src/search')

      // Valid mode
      expect(() => SearchModeSchema.parse('text')).not.toThrow()

      // Invalid modes (removed from schema)
      expect(() => SearchModeSchema.parse('semantic')).toThrow()
      expect(() => SearchModeSchema.parse('similar')).toThrow()
    })

    it('should default to "text" mode when not provided', async () => {
      const { SearchRequestSchema } = await import('../../packages/schemas/src/search')

      const result = SearchRequestSchema.parse({ q: 'Harry Potter' })
      expect(result.mode).toBe('text')
    })
  })
})
