// src/utils/cache-keys.ts

import { PROMPT_VERSION } from '../prompts/csv-parser-prompt.js'
import { normalizeISBN } from './normalization.js'

/**
 * Generate SHA-256 hash of string using Web Crypto API
 *
 * @param text - Text to hash
 * @returns Hexadecimal hash string
 */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate cache key for CSV parse results.
 * Format: csv-parse:{hash}:{promptVersion}
 *
 * Cache is automatically invalidated when:
 * - CSV content changes (different hash)
 * - Prompt version changes (parsing logic updated)
 *
 * @param csvText - Raw CSV content
 * @returns Cache key in format csv-parse:{hash}:{version}
 */
export async function generateCSVCacheKey(csvText: string): Promise<string> {
  const hash = await sha256(csvText)
  return `csv-parse:${hash}:${PROMPT_VERSION}`
}

/**
 * Generate cache key for ISBN enrichment data.
 * Format: book:isbn:{normalizedISBN}
 *
 * Uses shared normalizeISBN() for consistent caching across all services.
 * Updated to canonical format (Issue #213, Task 1.8).
 *
 * @param isbn - ISBN string (with or without hyphens/spaces)
 * @returns Cache key in format book:isbn:{normalized}
 */
export function generateISBNCacheKey(isbn: string): string {
  // Use shared normalization utility for consistency
  const normalized = normalizeISBN(isbn)
  return `book:isbn:${normalized}` // Canonical cache key format
}
