/**
 * Cache Direct Write Service
 *
 * Writes ISBNdb metadata directly to cache, bypassing expensive external API calls.
 * Used by author expansion harvest to populate cache with ISBNdb-sourced data.
 *
 * Flow:
 * 1. ISBNdb search returns books with full metadata
 * 2. Normalize ISBNdb→Canonical format
 * 3. Write directly to KV cache (24h TTL)
 * 4. Skip Google Books/OpenLibrary calls entirely
 *
 * Benefits:
 * - 100x reduction in external API calls
 * - Faster cache population (no API latency)
 * - Maximizes ISBNdb Premium plan value
 *
 * Issue: #140 - Switch to ISBNdb-Primary Pipeline
 */

import type { Env } from '../types/env.js'
import { normalizeISBNdbToWork, normalizeISBNdbToEdition, normalizeISBNdbToAuthor } from './normalizers/isbndb.js'
import { KVCacheService } from './kv-cache.js'

/**
 * ISBNdb book response format (from ISBNdbAPI.searchByAuthor)
 */
export interface ISBNdbBook {
  isbn: string
  isbn13?: string
  image?: string
  title: string
  title_long?: string
  authors: string[]
  publisher?: string
  date_published?: string
  pages?: number
  binding?: string
  synopsis?: string
  subjects?: string[]
  language?: string
}

/**
 * Cache write result
 */
export interface CacheWriteResult {
  success: boolean
  isbn: string
  cached: boolean // True if already cached, false if newly written
  error?: string
}

/**
 * Write ISBNdb metadata directly to KV cache
 *
 * @param books - ISBNdb book array from searchByAuthor()
 * @param env - Cloudflare environment bindings
 * @param ctx - Execution context for waitUntil
 * @returns Array of write results
 */
export async function writeISBNdbBooksToCache(
  books: ISBNdbBook[],
  env: Env,
  ctx?: ExecutionContext
): Promise<CacheWriteResult[]> {
  const kvCache = new KVCacheService(env, ctx)
  const results: CacheWriteResult[] = []

  for (const book of books) {
    try {
      const isbn = book.isbn13 || book.isbn
      if (!isbn) {
        results.push({
          success: false,
          isbn: 'UNKNOWN',
          cached: false,
          error: 'Missing ISBN'
        })
        continue
      }

      // Check if already cached (avoid unnecessary writes)
      const cacheKey = `book:isbn:${isbn}`
      const existing = await kvCache.get(cacheKey, 'isbn')

      if (existing) {
        results.push({
          success: true,
          isbn,
          cached: true
        })
        continue
      }

      // Normalize ISBNdb→Canonical format
      const work = normalizeISBNdbToWork(book)
      const edition = normalizeISBNdbToEdition(book)
      const authors = (book.authors || []).map(normalizeISBNdbToAuthor)

      // Build canonical response (matches /v1/search/isbn format)
      const canonicalData = {
        work,
        edition,
        authors,
        metadata: {
          source: 'isbndb',
          provider: 'isbndb' as const,
          cached: false,
          timestamp: new Date().toISOString()
        }
      }

      // Write to KV cache (24h TTL)
      await kvCache.set(cacheKey, canonicalData, 'isbn', {
        ttl: 86400 // 24 hours
      })

      results.push({
        success: true,
        isbn,
        cached: false
      })

    } catch (error) {
      const isbn = book.isbn13 || book.isbn || 'UNKNOWN'
      results.push({
        success: false,
        isbn,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

/**
 * Write a single ISBNdb book to cache
 *
 * @param book - ISBNdb book object
 * @param env - Cloudflare environment bindings
 * @param ctx - Execution context for waitUntil
 * @returns Write result
 */
export async function writeSingleISBNdbBookToCache(
  book: ISBNdbBook,
  env: Env,
  ctx?: ExecutionContext
): Promise<CacheWriteResult> {
  const results = await writeISBNdbBooksToCache([book], env, ctx)
  return results[0]
}
