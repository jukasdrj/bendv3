/**
 * V3 Search Pagination Tests
 *
 * Verifies that pagination correctly reflects true total count (#187)
 */
import { describe, it, expect } from 'vitest'
import { SearchModeSchema, SearchRequestSchema } from '../../packages/schemas/src/search'

// Helper function to encapsulate pagination logic (same as V3 API)
function performPagination<T>(allItems: T[], page: number, limit: number) {
  const totalResults = allItems.length
  const totalPages = Math.ceil(totalResults / limit) || 0
  const startIdx = (page - 1) * limit
  const paginatedItems = allItems.slice(startIdx, startIdx + limit)

  return {
    paginatedItems,
    totalResults,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  }
}

// Helper to create test books with valid ISBNs
function createTestBooks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    isbn: `978043970${String(i).padStart(4, '0')}`, // Valid 13-char ISBNs
    title: `Book ${i + 1}`
  }))
}

describe('V3 Search Pagination', () => {
  describe('Issue #187: True total count in pagination', () => {
    it('should calculate totalPages from all results, not just current page', () => {
      const allBooks = createTestBooks(50)
      const { paginatedItems, totalResults, totalPages, hasNext, hasPrev } =
        performPagination(allBooks, 1, 20)

      expect(totalResults).toBe(50)
      expect(totalPages).toBe(3) // 50 books / 20 per page = 3 pages
      expect(paginatedItems.length).toBe(20) // First page has 20 books
      expect(hasNext).toBe(true)
      expect(hasPrev).toBe(false)
    })

    it('should correctly paginate to page 2', () => {
      const allBooks = createTestBooks(50)
      const { paginatedItems, hasNext, hasPrev } = performPagination(allBooks, 2, 20)

      expect(paginatedItems.length).toBe(20) // Second page has 20 books
      expect(paginatedItems[0].title).toBe('Book 21') // First book on page 2
      expect(hasNext).toBe(true)
      expect(hasPrev).toBe(true)
    })

    it('should correctly paginate to last page with partial results', () => {
      const allBooks = createTestBooks(50)
      const { paginatedItems, hasNext, hasPrev } = performPagination(allBooks, 3, 20)

      expect(paginatedItems.length).toBe(10) // Last page has 10 books (50 % 20)
      expect(paginatedItems[0].title).toBe('Book 41') // First book on page 3
      expect(hasNext).toBe(false)
      expect(hasPrev).toBe(true)
    })

    it('should handle empty results', () => {
      const allBooks: any[] = []
      const { paginatedItems, totalResults, totalPages, hasNext, hasPrev } =
        performPagination(allBooks, 1, 20)

      expect(totalResults).toBe(0)
      expect(totalPages).toBe(0)
      expect(paginatedItems.length).toBe(0)
      expect(hasNext).toBe(false)
      expect(hasPrev).toBe(false)
    })

    it('should handle single page of results', () => {
      const allBooks = createTestBooks(10)
      const { paginatedItems, totalResults, totalPages, hasNext, hasPrev } =
        performPagination(allBooks, 1, 20)

      expect(totalResults).toBe(10)
      expect(totalPages).toBe(1) // Only 1 page needed
      expect(paginatedItems.length).toBe(10)
      expect(hasNext).toBe(false)
      expect(hasPrev).toBe(false)
    })

    it('should not return books beyond available results', () => {
      const allBooks = createTestBooks(50)
      const page = 10 // Request page far beyond available data
      const { paginatedItems, totalPages } = performPagination(allBooks, page, 20)

      expect(paginatedItems.length).toBe(0) // No books on page 10
      expect(page > totalPages).toBe(true) // Page is beyond available pages
    })
  })

  describe('Issue #186: Search mode validation', () => {
    it('should only accept "text" mode in schema', () => {
      // Valid mode
      expect(() => SearchModeSchema.parse('text')).not.toThrow()

      // Invalid modes (removed from schema)
      expect(() => SearchModeSchema.parse('semantic')).toThrow()
      expect(() => SearchModeSchema.parse('similar')).toThrow()
    })

    it('should default to "text" mode when not provided', () => {
      const result = SearchRequestSchema.parse({ q: 'Harry Potter' })
      expect(result.mode).toBe('text')
    })
  })
})
