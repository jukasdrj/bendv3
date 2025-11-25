/**
 * BookRepository - Smart Router for KV → D1 Migration (Sprint 2)
 *
 * Handles dual-write and gradual read shift from KV to D1:
 * - Phase 1-2: Dual-write to KV + D1 (ENABLE_D1_WRITES feature flag)
 * - Phase 3-4: Gradual read shift (D1_READ_PERCENTAGE 0-100)
 * - Future: D1 primary, KV as cache layer
 *
 * Architecture:
 * - KV Cache: Fast read-through cache (TTL 24h)
 * - D1 Database: Source of truth (relational queries)
 * - Fallback strategy: Try primary source → Fallback to secondary
 */

import type { BookRecord, AuthorRecord, BookAuthorRelation } from '../types/database.js'

export class BookRepository {
  private env: any
  private kvCacheTTL = 86400 // 24 hours

  constructor(env: any) {
    this.env = env
  }

  /**
   * Smart Router: Try D1 → Fallback to KV (or vice versa based on D1_READ_PERCENTAGE)
   *
   * @param isbn - Normalized ISBN (10 or 13 digits)
   * @returns BookRecord or null if not found in both sources
   */
  async findByISBN(isbn: string): Promise<BookRecord | null> {
    const readPercentage = parseInt(this.env.D1_READ_PERCENTAGE || '0')
    const shouldReadFromD1 = this.shouldRouteToD1(isbn, readPercentage)

    console.log(`[BookRepository] findByISBN(${isbn}): D1_READ_PERCENTAGE=${readPercentage}, routing to ${shouldReadFromD1 ? 'D1' : 'KV'}`)

    if (shouldReadFromD1) {
      // D1-first strategy
      const d1Book = await this.findInD1(isbn)
      if (d1Book) {
        console.log(`[BookRepository] ✅ D1 hit for ${isbn}`)
        return d1Book
      }
      console.log(`[BookRepository] D1 miss, fallback to KV for ${isbn}`)
      return await this.findInKV(isbn)
    } else {
      // KV-first strategy (default)
      const kvBook = await this.findInKV(isbn)
      if (kvBook) {
        console.log(`[BookRepository] ✅ KV hit for ${isbn}`)
        return kvBook
      }
      console.log(`[BookRepository] KV miss, fallback to D1 for ${isbn}`)
      return await this.findInD1(isbn)
    }
  }

  /**
   * Dual-Write: Always KV + Conditionally D1 (with validation)
   *
   * Day 6: Added data consistency validation between KV and D1 writes
   *
   * @param book - BookRecord with all metadata
   * @throws Never throws - D1 write failures are logged but don't fail the request
   */
  async save(book: BookRecord): Promise<void> {
    const startTime = Date.now()

    // Step 1: Always write to KV (fast cache)
    await this.saveToKV(book)
    const kvWriteTime = Date.now() - startTime
    console.log(`[BookRepository] ✅ Saved to KV: ${book.isbn} (${kvWriteTime}ms)`)

    // Step 2: Conditionally write to D1 (dual-write phase)
    if (this.env.ENABLE_D1_WRITES === 'true') {
      const d1StartTime = Date.now()

      try {
        await this.saveToD1(book)
        const d1WriteTime = Date.now() - d1StartTime

        console.log(`[BookRepository] ✅ Dual-write to D1: ${book.isbn} (${d1WriteTime}ms)`)

        // Day 6: Emit metrics for monitoring
        this.emitDualWriteMetrics({
          isbn: book.isbn,
          kvWriteTime,
          d1WriteTime,
          success: true,
        })

        // Day 6: Optional validation - verify D1 write (only in dev/testing)
        if (this.env.VALIDATE_DUAL_WRITES === 'true') {
          await this.validateDualWrite(book.isbn, book)
        }
      } catch (error) {
        const d1WriteTime = Date.now() - d1StartTime
        console.error(`[BookRepository] ❌ D1 write failed for ${book.isbn} (${d1WriteTime}ms):`, error)

        // Emit failure metrics
        this.emitDualWriteMetrics({
          isbn: book.isbn,
          kvWriteTime,
          d1WriteTime,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })

        // Don't fail request - eventual consistency OK
      }
    }
  }

  /**
   * Day 6: Validate that D1 write matches KV write (optional, for testing)
   *
   * Reads back from D1 and compares critical fields with original book record.
   * Only enabled when VALIDATE_DUAL_WRITES=true (dev/testing environments).
   *
   * @private
   */
  private async validateDualWrite(isbn: string, originalBook: BookRecord): Promise<void> {
    try {
      const d1Book = await this.findInD1(isbn)

      if (!d1Book) {
        console.warn(`[BookRepository] ⚠️  Validation failed: ${isbn} not found in D1 after write`)
        return
      }

      // Compare critical fields
      const mismatches: string[] = []

      if (d1Book.title !== originalBook.title) {
        mismatches.push(`title: "${originalBook.title}" vs "${d1Book.title}"`)
      }

      if (d1Book.publisher !== originalBook.publisher) {
        mismatches.push(`publisher: "${originalBook.publisher}" vs "${d1Book.publisher}"`)
      }

      if (d1Book.language !== originalBook.language) {
        mismatches.push(`language: "${originalBook.language}" vs "${d1Book.language}"`)
      }

      if (mismatches.length > 0) {
        console.warn(`[BookRepository] ⚠️  Validation mismatches for ${isbn}:`, mismatches.join(', '))
      } else {
        console.log(`[BookRepository] ✅ Validation passed for ${isbn}`)
      }
    } catch (error) {
      console.error(`[BookRepository] ❌ Validation error for ${isbn}:`, error)
    }
  }

  /**
   * Day 6: Emit dual-write metrics for monitoring dashboard
   *
   * Metrics tracked:
   * - KV write latency
   * - D1 write latency
   * - Success/failure rate
   * - Error messages
   *
   * @private
   */
  private emitDualWriteMetrics(metrics: {
    isbn: string
    kvWriteTime: number
    d1WriteTime: number
    success: boolean
    errorMessage?: string
  }): void {
    // Emit to console for Cloudflare Logs
    console.log('[BookRepository:Metrics]', JSON.stringify({
      metric: 'dual_write',
      isbn: metrics.isbn,
      kv_write_ms: metrics.kvWriteTime,
      d1_write_ms: metrics.d1WriteTime,
      success: metrics.success,
      error: metrics.errorMessage || null,
      timestamp: new Date().toISOString(),
    }))

    // Future: Emit to analytics service (e.g., Cloudflare Analytics Engine)
    // this.env.ANALYTICS?.writeDataPoint({
    //   blobs: ['dual_write', metrics.isbn],
    //   doubles: [metrics.kvWriteTime, metrics.d1WriteTime],
    //   indexes: [metrics.success ? 'success' : 'failure'],
    // })
  }

  /**
   * Find book in KV cache
   * @private
   */
  private async findInKV(isbn: string): Promise<BookRecord | null> {
    const cacheKey = `book:isbn:${isbn}`
    const cached = await this.env.KV_CACHE.get(cacheKey, 'json')

    if (!cached) return null

    return {
      isbn: cached.isbn,
      title: cached.title,
      subtitle: cached.subtitle || null,
      description: cached.description || null,
      publisher: cached.publisher || null,
      publicationDate: cached.publicationDate || null,
      language: cached.language || null,
      pageCount: cached.pageCount || null,
      coverSmallUrl: cached.coverSmallUrl || null,
      coverMediumUrl: cached.coverMediumUrl || null,
      coverLargeUrl: cached.coverLargeUrl || null,
      canonicalMetadata: cached, // Full canonical book object
      providerMetadata: cached.providerMetadata || null,
      createdAt: cached.createdAt || Date.now(),
      updatedAt: cached.updatedAt || Date.now(),
    }
  }

  /**
   * Find book in D1 database
   * @private
   */
  private async findInD1(isbn: string): Promise<BookRecord | null> {
    try {
      const result = await this.env.DB.prepare(
        'SELECT * FROM books WHERE isbn = ?'
      ).bind(isbn).first()

      if (!result) return null

      // Parse JSON metadata
      const canonicalMetadata = JSON.parse(result.canonical_metadata)
      const providerMetadata = result.provider_metadata
        ? JSON.parse(result.provider_metadata)
        : null

      return {
        isbn: result.isbn,
        title: result.title,
        subtitle: result.subtitle,
        description: result.description,
        publisher: result.publisher,
        publicationDate: result.publication_date,
        language: result.language,
        pageCount: result.page_count,
        coverSmallUrl: result.cover_small_url,
        coverMediumUrl: result.cover_medium_url,
        coverLargeUrl: result.cover_large_url,
        canonicalMetadata,
        providerMetadata,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      }
    } catch (error) {
      console.error(`[BookRepository] D1 query failed for ${isbn}:`, error)
      return null
    }
  }

  /**
   * Save book to KV cache
   * @private
   */
  private async saveToKV(book: BookRecord): Promise<void> {
    const cacheKey = `book:isbn:${book.isbn}`

    // Store full canonical metadata in KV (backward compatible)
    await this.env.KV_CACHE.put(
      cacheKey,
      JSON.stringify(book.canonicalMetadata),
      { expirationTtl: this.kvCacheTTL }
    )
  }

  /**
   * Save book to D1 database with UPSERT (INSERT OR REPLACE)
   *
   * Note: updated_at is auto-set by database trigger (trg_books_updated_at) on UPDATE
   * No need to manually set updated_at in ON CONFLICT clause
   *
   * @private
   */
  private async saveToD1(book: BookRecord): Promise<void> {
    const now = Math.floor(Date.now() / 1000) // Unix epoch in seconds (for created_at only)

    // Upsert book record (INSERT OR REPLACE)
    await this.env.DB.prepare(`
      INSERT INTO books (
        isbn, title, subtitle, description, publisher, publication_date, language, page_count,
        cover_small_url, cover_medium_url, cover_large_url,
        canonical_metadata, provider_metadata,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isbn) DO UPDATE SET
        title = excluded.title,
        subtitle = excluded.subtitle,
        description = excluded.description,
        publisher = excluded.publisher,
        publication_date = excluded.publication_date,
        language = excluded.language,
        page_count = excluded.page_count,
        cover_small_url = excluded.cover_small_url,
        cover_medium_url = excluded.cover_medium_url,
        cover_large_url = excluded.cover_large_url,
        canonical_metadata = excluded.canonical_metadata,
        provider_metadata = excluded.provider_metadata
    `).bind(
      book.isbn,
      book.title,
      book.subtitle,
      book.description,
      book.publisher,
      book.publicationDate,
      book.language,
      book.pageCount,
      book.coverSmallUrl,
      book.coverMediumUrl,
      book.coverLargeUrl,
      JSON.stringify(book.canonicalMetadata),
      book.providerMetadata ? JSON.stringify(book.providerMetadata) : null,
      now, // created_at (only used on INSERT)
      now  // updated_at (set on INSERT, then auto-updated by trigger on UPDATE)
    ).run()

    // Extract and save authors
    if (book.canonicalMetadata.authors && book.canonicalMetadata.authors.length > 0) {
      await this.saveAuthors(book.isbn, book.canonicalMetadata.authors)
    }
  }

  /**
   * Save authors and create book-author relationships
   * @private
   */
  private async saveAuthors(isbn: string, authors: any[]): Promise<void> {
    for (let i = 0; i < authors.length; i++) {
      const author = authors[i]
      const authorName = author.name || author
      const authorRole = author.role || 'author'

      if (!authorName || authorName.trim() === '') continue

      // Normalize name for fuzzy matching
      const normalizedName = this.normalizeAuthorName(authorName)

      // Extract cultural diversity fields (Issue #197)
      const nativeName = author.nativeName || null
      const romanizedName = author.romanizedName || null

      // Upsert author (ignore duplicates due to UNIQUE constraint)
      const authorResult = await this.env.DB.prepare(`
        INSERT INTO authors (name, normalized_name, role, native_name, romanized_name)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(normalized_name, role) DO UPDATE SET
          name = excluded.name,
          native_name = COALESCE(excluded.native_name, authors.native_name),
          romanized_name = COALESCE(excluded.romanized_name, authors.romanized_name)
        RETURNING id
      `).bind(
        authorName,
        normalizedName,
        authorRole,
        nativeName,
        romanizedName
      ).first()

      const authorId = authorResult?.id

      if (!authorId) {
        console.warn(`[BookRepository] Failed to get author ID for ${authorName}`)
        continue
      }

      // Create book-author relationship (ignore duplicates)
      await this.env.DB.prepare(`
        INSERT OR IGNORE INTO book_authors (isbn, author_id, author_order)
        VALUES (?, ?, ?)
      `).bind(isbn, authorId, i).run()
    }
  }

  /**
   * Normalize author name for fuzzy matching
   * @private
   */
  private normalizeAuthorName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ')
  }

  /**
   * Deterministic routing: Same ISBN always gets same decision
   * Uses FNV-1a hash for consistent ISBN → percentage mapping
   *
   * @private
   * @param isbn - ISBN to hash
   * @param percentage - Read percentage (0-100)
   * @returns true if should route to D1
   */
  private shouldRouteToD1(isbn: string, percentage: number): boolean {
    if (percentage === 0) return false
    if (percentage === 100) return true

    const hash = this.hashString(isbn)
    return (hash % 100) < percentage
  }

  /**
   * FNV-1a hash function (fast, deterministic)
   * @private
   */
  private hashString(str: string): number {
    let hash = 2166136261 // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 16777619) // FNV prime
    }
    return Math.abs(hash)
  }

  /**
   * Complex query: Find all books by author (D1-only)
   * Only works when D1_READ_PERCENTAGE > 0
   *
   * @param authorName - Author name (fuzzy match)
   * @param limit - Max results (default 50)
   * @returns Array of BookRecords
   */
  async findByAuthor(authorName: string, limit = 50): Promise<BookRecord[]> {
    const normalizedName = this.normalizeAuthorName(authorName)

    try {
      const results = await this.env.DB.prepare(`
        SELECT b.*
        FROM books b
        JOIN book_authors ba ON b.isbn = ba.isbn
        JOIN authors a ON ba.author_id = a.id
        WHERE a.normalized_name LIKE ?
        ORDER BY b.publication_date DESC
        LIMIT ?
      `).bind(`%${normalizedName}%`, limit).all()

      return results.results.map((row: any) => ({
        isbn: row.isbn,
        title: row.title,
        subtitle: row.subtitle,
        description: row.description,
        publisher: row.publisher,
        publicationDate: row.publication_date,
        language: row.language,
        pageCount: row.page_count,
        coverSmallUrl: row.cover_small_url,
        coverMediumUrl: row.cover_medium_url,
        coverLargeUrl: row.cover_large_url,
        canonicalMetadata: JSON.parse(row.canonical_metadata),
        providerMetadata: row.provider_metadata
          ? JSON.parse(row.provider_metadata)
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    } catch (error) {
      console.error(`[BookRepository] findByAuthor failed for ${authorName}:`, error)
      return []
    }
  }

  /**
   * Complex query: Find all 5-star books added in a year (D1-only)
   * Example use case: "All my favorite books from 2024"
   *
   * @param userId - User ID
   * @param rating - Minimum rating (1-5)
   * @param year - Year (2024)
   * @param limit - Max results (default 100)
   * @returns Array of BookRecords with user library metadata
   */
  async findUserBooksByRatingAndYear(
    userId: string,
    rating: number,
    year: number,
    limit = 100
  ): Promise<Array<BookRecord & { rating: number; addedAt: number }>> {
    const yearStart = new Date(year, 0, 1).getTime() / 1000 // Unix epoch
    const yearEnd = new Date(year + 1, 0, 1).getTime() / 1000

    try {
      const results = await this.env.DB.prepare(`
        SELECT b.*, ul.rating, ul.added_at
        FROM user_library ul
        JOIN books b ON ul.isbn = b.isbn
        WHERE ul.user_id = ?
          AND ul.rating >= ?
          AND ul.added_at >= ?
          AND ul.added_at < ?
        ORDER BY ul.added_at DESC
        LIMIT ?
      `).bind(userId, rating, yearStart, yearEnd, limit).all()

      return results.results.map((row: any) => ({
        isbn: row.isbn,
        title: row.title,
        subtitle: row.subtitle,
        description: row.description,
        publisher: row.publisher,
        publicationDate: row.publication_date,
        language: row.language,
        pageCount: row.page_count,
        coverSmallUrl: row.cover_small_url,
        coverMediumUrl: row.cover_medium_url,
        coverLargeUrl: row.cover_large_url,
        canonicalMetadata: JSON.parse(row.canonical_metadata),
        providerMetadata: row.provider_metadata
          ? JSON.parse(row.provider_metadata)
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rating: row.rating,
        addedAt: row.added_at,
      }))
    } catch (error) {
      console.error(`[BookRepository] findUserBooksByRatingAndYear failed:`, error)
      return []
    }
  }
}
