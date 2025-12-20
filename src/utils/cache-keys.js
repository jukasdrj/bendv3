// src/utils/cache-keys.js

import { PROMPT_VERSION } from '../prompts/csv-parser-prompt.js'
import { normalizeISBN } from './normalization.js'

/**
 * Generate SHA-256 hash of string using Web Crypto API
 *
 * @param {string} text - Text to hash
 * @returns {Promise<string>} Hexadecimal hash string
 */
async function sha256(text) {
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
 * @param {string} csvText - Raw CSV content
 * @returns {Promise<string>} Cache key in format csv-parse:{hash}:{version}
 */
export async function generateCSVCacheKey(csvText) {
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
 * @param {string} isbn - ISBN string (with or without hyphens/spaces)
 * @returns {string} Cache key in format book:isbn:{normalized}
 */
export function generateISBNCacheKey(isbn) {
  // Use shared normalization utility for consistency
  const normalized = normalizeISBN(isbn)
  return `book:isbn:${normalized}` // Canonical cache key format
}
