/**
 * Date Utilities
 *
 * Shared date extraction functions used across normalizers and services.
 * Created to consolidate duplicated extractYear implementations.
 */

/**
 * Extract year from various date string formats.
 *
 * Supports formats from multiple providers:
 * - Google Books: "1949", "1949-06", "1949-06-08"
 * - ISBNdb: "2020", "2020-01", "2020-01-15"
 * - OpenLibrary: "1949", "Jun 8, 1949", "June 1949"
 *
 * @param dateString - Date string in various formats, or a number representing a year
 * @returns The extracted year as a number, or undefined if extraction fails
 */
export function extractYear(dateString?: string | number): number | undefined {
  if (!dateString) return undefined

  // Handle numeric year directly
  if (typeof dateString === 'number') return dateString

  // Extract 4-digit year from string (matches first occurrence)
  const match = dateString.match(/\b(\d{4})\b/)
  return match ? parseInt(match[1], 10) : undefined
}
