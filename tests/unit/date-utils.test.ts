/**
 * Unit Tests: Date Utilities
 *
 * Tests for shared date extraction functions
 */

import { describe, it, expect } from 'vitest'
import { extractYear } from '../../src/utils/date-utils.js'

describe('extractYear', () => {
  describe('with numeric input', () => {
    it('should return the number as-is', () => {
      expect(extractYear(1984)).toBe(1984)
      expect(extractYear(2023)).toBe(2023)
    })
  })

  describe('with string input', () => {
    it('should extract year from YYYY format', () => {
      expect(extractYear('1984')).toBe(1984)
      expect(extractYear('2023')).toBe(2023)
    })

    it('should extract year from YYYY-MM format (Google Books)', () => {
      expect(extractYear('1984-06')).toBe(1984)
      expect(extractYear('2023-12')).toBe(2023)
    })

    it('should extract year from YYYY-MM-DD format (ISBNdb)', () => {
      expect(extractYear('1984-06-08')).toBe(1984)
      expect(extractYear('2023-01-15')).toBe(2023)
    })

    it('should extract year from "Month DD, YYYY" format (OpenLibrary)', () => {
      expect(extractYear('Jun 8, 1949')).toBe(1949)
      expect(extractYear('January 15, 2023')).toBe(2023)
      expect(extractYear('December 31, 1999')).toBe(1999)
    })

    it('should extract year from "Month YYYY" format', () => {
      expect(extractYear('June 1949')).toBe(1949)
      expect(extractYear('December 2023')).toBe(2023)
    })

    it('should return undefined for invalid date strings', () => {
      expect(extractYear('invalid')).toBeUndefined()
      expect(extractYear('')).toBeUndefined()
      expect(extractYear('   ')).toBeUndefined()
    })

    it('should return undefined for strings without 4-digit year', () => {
      expect(extractYear('99')).toBeUndefined()
      expect(extractYear('Jun 8, 49')).toBeUndefined()
    })
  })

  describe('with undefined/null input', () => {
    it('should return undefined for undefined input', () => {
      expect(extractYear(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(extractYear('')).toBeUndefined()
    })
  })
})
