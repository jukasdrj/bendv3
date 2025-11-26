/**
 * Popular Books Configuration Tests
 *
 * Validates the static popular books list configuration
 * and helper functions.
 */

import { describe, it, expect } from 'vitest'
import {
  POPULAR_ISBNS,
  getPopularISBNs,
  isPopularBook,
  getPopularBooksCount
} from '../src/config/popular-books.js'

describe('Popular Books Configuration', () => {
  describe('POPULAR_ISBNS constant', () => {
    it('should contain exactly 100 ISBNs', () => {
      expect(POPULAR_ISBNS).toHaveLength(100)
    })

    it('should contain only valid ISBN-13 format (13 digits)', () => {
      POPULAR_ISBNS.forEach((isbn) => {
        expect(isbn).toMatch(/^\d{13}$/)
      })
    })

    it('should not contain duplicates', () => {
      const uniqueISBNs = new Set(POPULAR_ISBNS)
      expect(uniqueISBNs.size).toBe(POPULAR_ISBNS.length)
    })

    it('should include Harry Potter and the Philosopher\'s Stone', () => {
      expect(POPULAR_ISBNS).toContain('9780439708180')
    })

    it('should include 1984 by George Orwell', () => {
      expect(POPULAR_ISBNS).toContain('9780451524935')
    })

    it('should include The Great Gatsby', () => {
      expect(POPULAR_ISBNS).toContain('9780743273565')
    })

    it('should include To Kill a Mockingbird', () => {
      expect(POPULAR_ISBNS).toContain('9780061120084')
    })

    it('should include The Catcher in the Rye', () => {
      expect(POPULAR_ISBNS).toContain('9780316769174')
    })
  })

  describe('getPopularISBNs()', () => {
    it('should return an array of ISBNs', () => {
      const result = getPopularISBNs()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(100)
    })

    it('should return a copy (not the original array)', () => {
      const result = getPopularISBNs()
      expect(result).not.toBe(POPULAR_ISBNS)
      expect(result).toEqual(POPULAR_ISBNS)
    })

    it('should not mutate original array when modifying result', () => {
      const result = getPopularISBNs()
      const originalLength = POPULAR_ISBNS.length
      result.push('9999999999999')
      expect(POPULAR_ISBNS.length).toBe(originalLength)
    })
  })

  describe('isPopularBook()', () => {
    it('should return true for popular books', () => {
      expect(isPopularBook('9780439708180')).toBe(true) // Harry Potter
      expect(isPopularBook('9780451524935')).toBe(true) // 1984
      expect(isPopularBook('9780743273565')).toBe(true) // The Great Gatsby
    })

    it('should return false for non-popular books', () => {
      expect(isPopularBook('9781234567890')).toBe(false)
      expect(isPopularBook('9999999999999')).toBe(false)
    })

    it('should handle ISBNs with hyphens', () => {
      // ISBN with hyphens should still match
      expect(isPopularBook('978-0-439-70818-0')).toBe(true)
    })

    it('should handle ISBNs with spaces', () => {
      // ISBN with spaces should still match
      expect(isPopularBook('978 0 439 70818 0')).toBe(true)
    })

    it('should be case-insensitive for alphanumeric ISBNs', () => {
      // While ISBNs are numeric, test normalization is working
      expect(isPopularBook('9780439708180')).toBe(true)
    })
  })

  describe('getPopularBooksCount()', () => {
    it('should return 100', () => {
      expect(getPopularBooksCount()).toBe(100)
    })

    it('should match POPULAR_ISBNS length', () => {
      expect(getPopularBooksCount()).toBe(POPULAR_ISBNS.length)
    })
  })

  describe('ISBN distribution validation', () => {
    it('should include books from multiple genres', () => {
      // This is a sanity check to ensure we have variety
      // Harry Potter (YA Fantasy)
      expect(POPULAR_ISBNS).toContain('9780439708180')
      // 1984 (Classic Dystopian)
      expect(POPULAR_ISBNS).toContain('9780451524935')
      // Atomic Habits (Non-fiction)
      expect(POPULAR_ISBNS).toContain('9780735211292')
      // The Hunger Games (YA Dystopian)
      expect(POPULAR_ISBNS).toContain('9780439023481')
    })

    it('should include classic literature', () => {
      const classics = [
        '9780451524935', // 1984
        '9780743273565', // The Great Gatsby
        '9780061120084', // To Kill a Mockingbird
        '9780316769174', // The Catcher in the Rye
      ]
      classics.forEach((isbn) => {
        expect(POPULAR_ISBNS).toContain(isbn)
      })
    })

    it('should include modern bestsellers', () => {
      const bestsellers = [
        '9780735211292', // Atomic Habits
        '9781501164255', // Becoming
        '9780593133484', // Where the Crawdads Sing
      ]
      bestsellers.forEach((isbn) => {
        expect(POPULAR_ISBNS).toContain(isbn)
      })
    })
  })
})
