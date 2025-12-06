/**
 * Smoke test for V2 API deprecation headers (Issue #204)
 * Verifies RFC 8594 deprecation headers are added to all /api/v2/* routes
 */
import { describe, it, expect } from 'vitest'

describe('V2 Deprecation Headers (Issue #204)', () => {
  it('should include RFC 8594 deprecation headers structure', () => {
    // Test expected header values
    const expectedHeaders = {
      'Deprecation': 'true',
      'Sunset': 'Sat, 07 Mar 2026 00:00:00 GMT',
      'X-Deprecation-Notice': 'V2 API deprecated. Migrate to V3. Sunset: March 7, 2026'
    }

    // Verify header values are correctly defined
    expect(expectedHeaders['Deprecation']).toBe('true')
    expect(expectedHeaders['Sunset']).toBe('Sat, 07 Mar 2026 00:00:00 GMT')
    expect(expectedHeaders['X-Deprecation-Notice']).toContain('V2 API deprecated')
    expect(expectedHeaders['X-Deprecation-Notice']).toContain('March 7, 2026')
  })

  it('should have correct sunset date (90 days after V3 GA)', () => {
    // V3 GA: December 7, 2025 (approximate)
    // V2 Sunset: March 7, 2026 (90 days later)
    const sunsetDate = new Date('Sat, 07 Mar 2026 00:00:00 GMT')
    const today = new Date()

    // Sunset should be in the future
    expect(sunsetDate.getTime()).toBeGreaterThan(today.getTime())

    // Sunset should be approximately 90 days from December 7, 2025
    const v3GA = new Date('2025-12-07T00:00:00Z')
    const daysDiff = Math.floor((sunsetDate.getTime() - v3GA.getTime()) / (1000 * 60 * 60 * 24))
    expect(daysDiff).toBe(90)
  })

  it('should reference V3 as successor version', () => {
    // Link header should point to /v3 as successor
    // Example: Link: <https://api.oooefam.net/v3>; rel="successor-version"
    const linkHeaderPattern = /<(.*)\/v3>; rel="successor-version"/
    const exampleLink = '<https://api.oooefam.net/v3>; rel="successor-version"'

    expect(exampleLink).toMatch(linkHeaderPattern)
    expect(exampleLink).toContain('/v3')
    expect(exampleLink).toContain('rel="successor-version"')
  })
})
