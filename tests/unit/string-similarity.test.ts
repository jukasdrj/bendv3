/**
 * Unit Tests: String Similarity Utilities
 *
 * Tests for Levenshtein distance and string similarity functions
 */

import { describe, it, expect } from 'vitest'
import { levenshteinDistance, stringSimilarity } from '../../src/utils/string-similarity.js'

describe('levenshteinDistance', () => {
  describe('identical strings', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0)
      expect(levenshteinDistance('', '')).toBe(0)
      expect(levenshteinDistance('a', 'a')).toBe(0)
    })
  })

  describe('single character operations', () => {
    it('should return 1 for single character insertion', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1)
      expect(levenshteinDistance('', 'a')).toBe(1)
    })

    it('should return 1 for single character deletion', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1)
      expect(levenshteinDistance('a', '')).toBe(1)
    })

    it('should return 1 for single character substitution', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1)
      expect(levenshteinDistance('cat', 'car')).toBe(1)
    })
  })

  describe('multiple operations', () => {
    it('should return 2 for two character difference', () => {
      expect(levenshteinDistance('cat', 'cars')).toBe(2)
    })

    it('should return 3 for completely different short strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3)
    })

    it('should handle strings of different lengths', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    })
  })

  describe('genre matching examples', () => {
    it('should work with genre name variations', () => {
      // Common genre typos/variations
      expect(levenshteinDistance('science fiction', 'science fiction')).toBe(0)
      expect(levenshteinDistance('scifi', 'sci-fi')).toBe(1)
      expect(levenshteinDistance('fantasy', 'fantasie')).toBe(2) // Addition + substitution
      expect(levenshteinDistance('mystery', 'mystrey')).toBe(2)
    })
  })
})

describe('stringSimilarity', () => {
  describe('identical strings', () => {
    it('should return 1.0 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1)
      expect(stringSimilarity('Science Fiction', 'Science Fiction')).toBe(1)
    })

    it('should return 1.0 for two empty strings', () => {
      expect(stringSimilarity('', '')).toBe(1)
    })
  })

  describe('completely different strings', () => {
    it('should return 0 for completely different strings of same length', () => {
      expect(stringSimilarity('abc', 'xyz')).toBe(0)
    })
  })

  describe('similar strings', () => {
    it('should return high similarity for minor differences', () => {
      const similarity = stringSimilarity('fantasy', 'fantasie')
      expect(similarity).toBeGreaterThan(0.7) // 75% similarity (2 edits in 8 chars)
    })

    it('should return lower similarity for larger differences', () => {
      const similarity = stringSimilarity('hello', 'world')
      expect(similarity).toBeLessThan(0.5)
    })
  })

  describe('title matching examples', () => {
    it('should return expected similarity for reordered words', () => {
      // Levenshtein doesn't handle word reordering well
      // "the martian" vs "martian the" has many character edits
      const similarity = stringSimilarity('the martian', 'martian the')
      expect(similarity).toBeLessThan(0.5) // Words are in different positions
    })

    it('should return low similarity for different titles', () => {
      const similarity = stringSimilarity('harry potter', 'lord of the rings')
      expect(similarity).toBeLessThan(0.5)
    })
  })
})
