/**
 * BookRecord Builder Utility
 *
 * Centralizes the logic for transforming enrichment results into BookRecord objects.
 * This ensures consistency across different code paths (webhooks, book service, batch operations).
 *
 * Used by:
 * - src/api-v3/webhooks/alexandria.ts - Webhook enrichment updates
 * - src/services/book-service.ts - findBookByISBN and batchEnrichBooks
 */

import type { AuthorDTO, EditionDTO, WorkDTO } from '../types/canonical'
import type { BookRecord } from '../types/database'

/**
 * Enrichment result structure matching the output of enrichMultipleBooks
 */
export interface EnrichmentResult {
  works: WorkDTO[]
  editions?: EditionDTO[]
  authors?: AuthorDTO[]
}

/**
 * Cover URLs in multiple sizes (from Alexandria or provider)
 */
export interface CoverURLs {
  small: string | null
  medium: string | null
  large: string | null
}

/**
 * Build a complete BookRecord from enrichment data
 *
 * @param isbn - Normalized ISBN (10 or 13 digits)
 * @param externalResult - Enrichment result with works, editions, authors
 * @param coverURLs - Cover URLs in multiple sizes (defaults to work/edition cover if not provided)
 * @returns Complete BookRecord ready for repository.save()
 *
 * @example
 * ```typescript
 * const bookRecord = buildBookRecordFromEnrichment(
 *   '9780439708180',
 *   externalResult,
 *   {
 *     small: 'https://covers.alexandria.com/small/12345.jpg',
 *     medium: 'https://covers.alexandria.com/medium/12345.jpg',
 *     large: 'https://covers.alexandria.com/large/12345.jpg',
 *   }
 * )
 * await bookRepo.save(bookRecord)
 * ```
 */
export function buildBookRecordFromEnrichment(
  isbn: string,
  externalResult: EnrichmentResult,
  coverURLs?: CoverURLs,
): BookRecord {
  const work = externalResult.works[0]
  if (!work) {
    throw new Error('EnrichmentResult must contain at least one work')
  }

  const edition = externalResult.editions?.[0]

  // Use provided cover URLs, or fall back to work/edition cover URLs
  const finalCoverURLs: CoverURLs = coverURLs || {
    small: work.coverImageURL || edition?.coverImageURL || null,
    medium: work.coverImageURL || edition?.coverImageURL || null,
    large: work.coverImageURL || edition?.coverImageURL || null,
  }

  const now = Math.floor(Date.now() / 1000)

  return {
    isbn,
    title: work.title || 'Unknown',
    subtitle: null, // WorkDTO does not support subtitle
    description: work.description || null,
    publisher: edition?.publisher || null,
    publicationDate: edition?.publicationDate || null,
    language: edition?.language || 'en',
    pageCount: edition?.pageCount || null,
    coverSmallUrl: finalCoverURLs.small,
    coverMediumUrl: finalCoverURLs.medium,
    coverLargeUrl: finalCoverURLs.large,
    canonicalMetadata: {
      works: externalResult.works,
      editions: externalResult.editions || [],
      authors: externalResult.authors || [],
    },
    providerMetadata: null, // Could store raw provider responses here
    createdAt: now,
    updatedAt: now,
  }
}
