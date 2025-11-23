/**
 * BookRepository Integration Examples (Sprint 2 - Day 2-3)
 *
 * Demonstrates how to integrate the new BookRepository into existing handlers
 * for gradual KV → D1 migration.
 *
 * MIGRATION STRATEGY:
 * Phase 1-2: Dual-write (save to both KV + D1)
 * Phase 3: Gradual read shift (KV → D1 based on D1_READ_PERCENTAGE)
 * Phase 4: D1 primary, KV cache-only
 */

import { BookRepository } from '../../src/repositories/book-repository'
import type { BookRecord } from '../../src/types/database'

/**
 * Example 1: Simple ISBN Search Handler Integration
 *
 * Before: Direct KV cache access
 * After: Use BookRepository for smart routing
 */
export async function exampleISBNSearchHandler(isbn: string, env: any) {
  const bookRepo = new BookRepository(env)

  // 1. Try repository (smart router based on feature flags)
  let book = await bookRepo.findByISBN(isbn)

  if (book) {
    console.log(`[ISBN Search] ✅ Cache hit for ${isbn}`)
    return {
      success: true,
      data: book.canonicalMetadata,
      metadata: {
        cached: true,
        provider: book.canonicalMetadata.provider || 'cache',
      },
    }
  }

  // 2. Cache miss: Fetch from external provider
  console.log(`[ISBN Search] Cache miss, fetching from provider for ${isbn}`)
  const providerBook = await fetchFromProvider(isbn, env)

  if (!providerBook) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Book not found' },
    }
  }

  // 3. Save to repository (dual-write if ENABLE_D1_WRITES=true)
  const bookRecord: BookRecord = {
    isbn: providerBook.isbn,
    title: providerBook.title,
    subtitle: providerBook.subtitle || null,
    description: providerBook.description || null,
    publisher: providerBook.publisher || null,
    publicationDate: providerBook.publicationDate || null,
    language: providerBook.language || 'en',
    pageCount: providerBook.pageCount || null,
    coverSmallUrl: providerBook.coverSmallUrl || null,
    coverMediumUrl: providerBook.coverMediumUrl || null,
    coverLargeUrl: providerBook.coverLargeUrl || null,
    canonicalMetadata: providerBook, // Full canonical book object
    providerMetadata: null,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  }

  await bookRepo.save(bookRecord)

  return {
    success: true,
    data: providerBook,
    metadata: {
      cached: false,
      provider: providerBook.provider || 'external',
    },
  }
}

/**
 * Example 2: Complex Query - Find All Books by Author (D1-only)
 *
 * This query is only possible with D1 (relational database).
 * Falls back gracefully if D1_READ_PERCENTAGE=0.
 */
export async function exampleAuthorBooksHandler(authorName: string, env: any) {
  const bookRepo = new BookRepository(env)

  // D1-only query (requires normalized author table)
  const books = await bookRepo.findByAuthor(authorName, 50)

  if (books.length === 0) {
    console.log(`[Author Search] No books found for ${authorName}`)
    return {
      success: true,
      data: [],
      metadata: {
        resultCount: 0,
        note: 'D1 required for author queries. Enable D1_READ_PERCENTAGE > 0.',
      },
    }
  }

  console.log(`[Author Search] Found ${books.length} books for ${authorName}`)
  return {
    success: true,
    data: books.map((book) => book.canonicalMetadata),
    metadata: {
      resultCount: books.length,
      source: 'd1',
    },
  }
}

/**
 * Example 3: User Library Query - All 5-Star Books from 2024
 *
 * Complex query demonstrating D1's power for user-specific data.
 */
export async function exampleUserFavoriteBooks(userId: string, year: number, env: any) {
  const bookRepo = new BookRepository(env)

  // D1-only query (requires user_library table + JOIN)
  const favoriteBooks = await bookRepo.findUserBooksByRatingAndYear(
    userId,
    5, // 5-star rating
    year,
    100 // max 100 results
  )

  console.log(`[User Library] Found ${favoriteBooks.length} 5-star books for ${userId} in ${year}`)

  return {
    success: true,
    data: favoriteBooks.map((book) => ({
      ...book.canonicalMetadata,
      userRating: book.rating,
      addedAt: book.addedAt,
    })),
    metadata: {
      resultCount: favoriteBooks.length,
      query: { userId, rating: 5, year },
    },
  }
}

/**
 * Example 4: Batch Import with Dual-Write
 *
 * Import multiple books and ensure both KV + D1 are updated.
 */
export async function exampleBatchImport(books: any[], env: any) {
  const bookRepo = new BookRepository(env)

  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const book of books) {
    try {
      const bookRecord: BookRecord = {
        isbn: book.isbn,
        title: book.title,
        subtitle: book.subtitle || null,
        description: book.description || null,
        publisher: book.publisher || null,
        publicationDate: book.publicationDate || null,
        language: book.language || 'en',
        pageCount: book.pageCount || null,
        coverSmallUrl: book.coverSmallUrl || null,
        coverMediumUrl: book.coverMediumUrl || null,
        coverLargeUrl: book.coverLargeUrl || null,
        canonicalMetadata: book,
        providerMetadata: null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      }

      await bookRepo.save(bookRecord)
      results.successful++
    } catch (error: any) {
      console.error(`[Batch Import] Failed to save ${book.isbn}:`, error)
      results.failed++
      results.errors.push(`${book.isbn}: ${error.message}`)
    }
  }

  console.log(`[Batch Import] Complete: ${results.successful} successful, ${results.failed} failed`)
  return {
    success: true,
    data: results,
  }
}

/**
 * Example 5: Feature Flag Rollout Strategy
 *
 * Shows how to progressively enable D1 reads and writes.
 */
export function exampleFeatureFlagRollout() {
  return `
# Sprint 2 Feature Flag Rollout

## Phase 1: KV-Only (Baseline)
wrangler.jsonc:
  ENABLE_D1_WRITES: "false"
  D1_READ_PERCENTAGE: "0"

Result: No change from Sprint 1 (KV-only, backward compatible)

## Phase 2: Dual-Write (Days 4-5)
wrangler.jsonc:
  ENABLE_D1_WRITES: "true"  ← Enable D1 writes
  D1_READ_PERCENTAGE: "0"

Result: All new books written to both KV + D1

## Phase 3: Gradual Read Shift (Days 9-10)
wrangler.jsonc:
  ENABLE_D1_WRITES: "true"
  D1_READ_PERCENTAGE: "1"   ← Canary: 1% reads from D1

Monitor for 2 hours, then increase:
  D1_READ_PERCENTAGE: "10"  ← 10% reads from D1
  D1_READ_PERCENTAGE: "50"  ← 50% reads from D1
  D1_READ_PERCENTAGE: "100" ← All reads from D1

## Phase 4: D1 Primary, KV Cache (Future)
wrangler.jsonc:
  ENABLE_D1_WRITES: "false" ← Stop dual-write (D1 only)
  D1_READ_PERCENTAGE: "100"

Result: D1 is source of truth, KV becomes read-through cache
`
}

/**
 * Mock function: Fetch from external provider
 * (Replace with actual provider logic)
 */
async function fetchFromProvider(isbn: string, env: any): Promise<any> {
  // TODO: Replace with actual Google Books / OpenLibrary / ISBNdb logic
  console.log(`[Provider] Fetching ${isbn} from external API`)
  return null
}
