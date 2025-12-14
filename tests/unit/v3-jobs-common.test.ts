/**
 * Unit tests for V3 job common utilities
 *
 * Tests auth token generation, URL building, and HATEOAS link creation
 */

import { describe, it, expect } from 'vitest'
import {
  generateAuthToken,
  validateTokenFormat,
  parseLastEventId,
  buildStreamUrl,
  createJobLinks
} from '../../src/api-v3/jobs/common'

describe('V3 Jobs Common Utilities', () => {
  describe('generateAuthToken', () => {
    it('should generate 64-character hex token', () => {
      const token = generateAuthToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(token.length).toBe(64)
    })

    it('should generate unique tokens', () => {
      const token1 = generateAuthToken()
      const token2 = generateAuthToken()
      expect(token1).not.toBe(token2)
    })

    it('should only use lowercase hex characters', () => {
      const token = generateAuthToken()
      expect(token).toMatch(/^[0-9a-f]+$/)
      expect(token).not.toMatch(/[A-F]/)
    })

    it('should generate cryptographically random tokens', () => {
      // Generate 10 tokens and ensure they're all different
      const tokens = Array.from({ length: 10 }, () => generateAuthToken())
      const uniqueTokens = new Set(tokens)
      expect(uniqueTokens.size).toBe(10)
    })
  })

  describe('validateTokenFormat', () => {
    it('should validate 64-character hex token', () => {
      const token = 'a'.repeat(64)
      expect(validateTokenFormat(token)).toBe(true)
    })

    it('should validate mixed hex characters', () => {
      const token = '0123456789abcdef'.repeat(4)
      expect(validateTokenFormat(token)).toBe(true)
    })

    it('should reject undefined token', () => {
      expect(validateTokenFormat(undefined)).toBe(false)
    })

    it('should reject empty string', () => {
      expect(validateTokenFormat('')).toBe(false)
    })

    it('should reject token that is too short', () => {
      const token = 'a'.repeat(63)
      expect(validateTokenFormat(token)).toBe(false)
    })

    it('should reject token that is too long', () => {
      const token = 'a'.repeat(65)
      expect(validateTokenFormat(token)).toBe(false)
    })

    it('should reject token with invalid characters', () => {
      const token = 'g'.repeat(64) // 'g' is not a hex character
      expect(validateTokenFormat(token)).toBe(false)
    })

    it('should reject token with uppercase hex characters', () => {
      const token = 'A'.repeat(64)
      expect(validateTokenFormat(token)).toBe(false)
    })

    it('should reject token with special characters', () => {
      const token = 'a'.repeat(63) + '-'
      expect(validateTokenFormat(token)).toBe(false)
    })
  })

  describe('parseLastEventId', () => {
    it('should parse valid numeric event ID', () => {
      expect(parseLastEventId('42')).toBe(42)
    })

    it('should parse zero', () => {
      expect(parseLastEventId('0')).toBe(0)
    })

    it('should parse large numbers', () => {
      expect(parseLastEventId('999999')).toBe(999999)
    })

    it('should return null for undefined', () => {
      expect(parseLastEventId(undefined)).toBe(null)
    })

    it('should return null for empty string', () => {
      expect(parseLastEventId('')).toBe(null)
    })

    it('should return null for non-numeric string', () => {
      expect(parseLastEventId('abc')).toBe(null)
    })

    it('should parse decimal numbers as integers (parseInt behavior)', () => {
      // parseInt('42.5') returns 42 (stops at decimal point)
      expect(parseLastEventId('42.5')).toBe(42)
    })

    it('should parse negative numbers', () => {
      expect(parseLastEventId('-42')).toBe(-42)
    })
  })

  describe('buildStreamUrl', () => {
    it('should build stream URL from base URL', () => {
      const baseUrl = 'https://api.oooefam.net/v3/jobs/imports'
      const streamUrl = buildStreamUrl(baseUrl, 'imports', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toBe(
        'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream'
      )
    })

    it('should build stream URL for scan job', () => {
      const baseUrl = 'https://api.oooefam.net/v3/jobs/scans'
      const streamUrl = buildStreamUrl(baseUrl, 'scans', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toBe(
        'https://api.oooefam.net/v3/jobs/scans/550e8400-e29b-41d4-a716-446655440000/stream'
      )
    })

    it('should build stream URL for enrichment job', () => {
      const baseUrl = 'https://api.oooefam.net/v3/jobs/enrichment'
      const streamUrl = buildStreamUrl(baseUrl, 'enrichment', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toBe(
        'https://api.oooefam.net/v3/jobs/enrichment/550e8400-e29b-41d4-a716-446655440000/stream'
      )
    })

    it('should preserve host from base URL', () => {
      const baseUrl = 'https://localhost:8787/v3/jobs/imports'
      const streamUrl = buildStreamUrl(baseUrl, 'imports', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toContain('localhost:8787')
    })

    it('should always use https protocol', () => {
      const baseUrl = 'http://api.oooefam.net/v3/jobs/imports'
      const streamUrl = buildStreamUrl(baseUrl, 'imports', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toMatch(/^https:\/\//)
    })

    it('should handle base URL with query params', () => {
      const baseUrl = 'https://api.oooefam.net/v3/jobs/imports?foo=bar'
      const streamUrl = buildStreamUrl(baseUrl, 'imports', '550e8400-e29b-41d4-a716-446655440000')
      expect(streamUrl).toBe(
        'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream'
      )
    })
  })

  describe('createJobLinks', () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000'
    const streamUrl = `https://api.oooefam.net/v3/jobs/imports/${jobId}/stream`

    it('should create HATEOAS links for import job', () => {
      const links = createJobLinks('imports', jobId, streamUrl)

      expect(links.self).toEqual({
        href: `https://api.oooefam.net/v3/jobs/imports/${jobId}`,
        rel: 'self',
        method: 'GET'
      })

      expect(links.stream).toEqual({
        href: streamUrl,
        rel: 'related',
        method: 'GET'
      })

      expect(links.cancel).toEqual({
        href: `https://api.oooefam.net/v3/jobs/imports/${jobId}`,
        rel: 'related',
        method: 'DELETE'
      })
    })

    it('should create HATEOAS links for scan job', () => {
      const scanStreamUrl = `https://api.oooefam.net/v3/jobs/scans/${jobId}/stream`
      const links = createJobLinks('scans', jobId, scanStreamUrl)

      expect(links.self.href).toBe(`https://api.oooefam.net/v3/jobs/scans/${jobId}`)
      expect(links.stream.href).toBe(scanStreamUrl)
      expect(links.cancel.href).toBe(`https://api.oooefam.net/v3/jobs/scans/${jobId}`)
    })

    it('should create HATEOAS links for enrichment job', () => {
      const enrichmentStreamUrl = `https://api.oooefam.net/v3/jobs/enrichment/${jobId}/stream`
      const links = createJobLinks('enrichment', jobId, enrichmentStreamUrl)

      expect(links.self.href).toBe(`https://api.oooefam.net/v3/jobs/enrichment/${jobId}`)
      expect(links.stream.href).toBe(enrichmentStreamUrl)
      expect(links.cancel.href).toBe(`https://api.oooefam.net/v3/jobs/enrichment/${jobId}`)
    })

    it('should use related rel for stream link', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.stream.rel).toBe('related')
    })

    it('should use GET method for self link', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.self.method).toBe('GET')
    })

    it('should use GET method for stream link', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.stream.method).toBe('GET')
    })

    it('should use DELETE method for cancel link', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.cancel.method).toBe('DELETE')
    })

    it('should use self relation for self link', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.self.rel).toBe('self')
    })

    it('should use related relation for stream and cancel links', () => {
      const links = createJobLinks('imports', jobId, streamUrl)
      expect(links.stream.rel).toBe('related')
      expect(links.cancel.rel).toBe('related')
    })
  })
})
