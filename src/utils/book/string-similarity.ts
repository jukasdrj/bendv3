/**
 * String Similarity Utilities
 *
 * Shared string comparison functions used for fuzzy matching.
 * Created to consolidate duplicated levenshteinDistance implementations.
 */

/**
 * Calculate Levenshtein distance between two strings.
 *
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to transform one string
 * into another.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns The edit distance as a non-negative integer
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // deletion
        matrix[i]![j - 1]! + 1, // insertion
        matrix[i - 1]![j - 1]! + cost, // substitution
      )
    }
  }

  return matrix[len1]![len2]!
}

/**
 * Calculate similarity ratio between two strings using Levenshtein distance.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity ratio between 0 (completely different) and 1 (identical)
 */
export function stringSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1 // Both strings are empty

  const distance = levenshteinDistance(str1, str2)
  return 1 - distance / maxLen
}
