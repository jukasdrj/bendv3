/**
 * Book Import Workflow - Cloudflare Workflows
 *
 * Issue #71 - LAUNCH BLOCKER
 *
 * This workflow replaces the manual state machine in JobStateManagerDO with
 * Cloudflare's native Workflows API for:
 * - Automatic state persistence across Worker restarts
 * - Built-in retries with configurable backoff
 * - Native observability in Cloudflare Dashboard
 * - Simplified error handling
 *
 * Workflow Steps:
 * 1. Validate input (ISBN format)
 * 2. Fetch metadata from book providers (Google Books, OpenLibrary)
 * 3. Upload cover image to R2
 * 4. Save to database (D1 with KV fallback)
 *
 * @see https://developers.cloudflare.com/workflows/
 */

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'

// Import shared types from workflow-events.ts (single source of truth)
import type {
  BookMetadata,
  BookImportResult,
  WorkflowStatus,
} from '../types/workflow-events.js'
import type { IWebSocketConnectionDO } from '../types/durable-objects.js'
import {
  generateBookEmbedding,
  storeEmbedding,
  type BookEmbeddingInput,
} from '../services/embedding-service.js'

// Re-export for consumers that import from this file
export type { BookMetadata, BookImportResult, WorkflowStatus }

// ============================================================================
// Types
// ============================================================================

export interface BookImportInput {
  isbn: string
  jobId: string
  userId?: string
  source: 'google_books' | 'openlibrary' | 'isbndb'
}

// Extended Env type with Workflow binding
interface WorkflowEnv {
  // KV Namespaces
  CACHE: KVNamespace
  CACHE: KVNamespace

  // R2 Buckets
  BOOK_COVERS: R2Bucket

  // D1 Database
  DB?: D1Database

  // Workers AI
  AI?: Ai

  // API Keys
  GOOGLE_BOOKS_API_KEY: string
  ISBNDB_API_KEY?: string

  // Durable Objects
  WEBSOCKET_CONNECTION_DO: DurableObjectNamespace
  JOB_STATE_MANAGER_DO: DurableObjectNamespace

  // Analytics
  AI_ANALYTICS?: AnalyticsEngineDataset
}

// ============================================================================
// Workflow Implementation
// ============================================================================

export class BookImportWorkflow extends WorkflowEntrypoint<WorkflowEnv, BookImportInput> {
  /**
   * Main workflow execution
   *
   * Each step is automatically persisted - if the workflow fails and restarts,
   * it will resume from the last successful step rather than re-executing everything.
   */
  override async run(event: WorkflowEvent<BookImportInput>, step: WorkflowStep): Promise<BookImportResult> {
    const { isbn, jobId, source } = event.payload

    console.log(`[Workflow] Starting book import for ISBN ${isbn}, job ${jobId}`)

    // Step 1: Emit start event
    await this.emitProgress(jobId, 'started', 0, { isbn }, step)

    // Step 2: Validate ISBN
    const validatedIsbn = await step.do('validate-isbn', async () => {
      return this.validateISBN(isbn)
    })

    await this.emitProgress(jobId, 'validating', 10, { validatedIsbn }, step)

    // Step 3: Fetch metadata from provider (with retries)
    await this.emitProgress(jobId, 'fetching_metadata', 20, { source }, step)

    const metadata = await step.do(
      'fetch-metadata',
      {
        retries: {
          limit: 3,
          delay: 1000,
          backoff: 'linear',
        },
        timeout: '30 seconds',
      },
      async () => {
        return await this.fetchMetadata(validatedIsbn, source)
      }
    )

    await this.emitProgress(jobId, 'metadata_fetched', 50, { title: metadata.title }, step)

    // Step 4: Upload cover image to R2 (if available)
    let coverR2Key: string | null = null
    if (metadata.coverUrl) {
      await this.emitProgress(jobId, 'uploading_cover', 60, { coverUrl: metadata.coverUrl }, step)

      coverR2Key = await step.do(
        'upload-cover',
        {
          retries: {
            limit: 3,
            delay: 500,
            backoff: 'exponential',
          },
          timeout: '60 seconds',
        },
        async () => {
          return await this.uploadCoverToR2(metadata.coverUrl!, validatedIsbn)
        }
      )

      await this.emitProgress(jobId, 'cover_uploaded', 70, { coverR2Key }, step)
    }

    // Step 5: Generate embeddings and store in Vectorize (Sprint 3 - Issues #25, #26)
    let hasEmbedding = false
    if (this.env.AI) {
      try {
        await this.emitProgress(jobId, 'generating_embedding', 75, {}, step)

        const embeddingResult = await step.do(
          'generate-embedding',
          {
            retries: {
              limit: 2,
              delay: 2000,
              backoff: 'linear',
            },
            timeout: '30 seconds',
          },
          async () => {
            // Use embedding service for generation
            const bookInput: BookEmbeddingInput = {
              isbn: metadata.isbn,
              title: metadata.title,
              author: metadata.author,
              description: metadata.description,
              categories: metadata.categories,
            }
            return await generateBookEmbedding(bookInput, this.env as any)
          }
        )

        if (embeddingResult) {
          // Store in Vectorize (if configured)
          await step.do('store-embedding', async () => {
            await storeEmbedding(
              embeddingResult,
              {
                isbn: metadata.isbn,
                title: metadata.title,
                author: metadata.author,
                categories: metadata.categories?.join(', '),
              },
              this.env as any
            )
          })
          hasEmbedding = true
        }

        await this.emitProgress(jobId, 'embedding_generated', 80, {
          dimensions: embeddingResult?.dimensions ?? 0,
          storedInVectorize: hasEmbedding,
        }, step)
      } catch (error) {
        // Non-critical: Continue without embeddings
        console.warn('[Workflow] Embedding generation failed (optional):', error)
      }
    }

    // Step 6: Save to database (D1 with KV fallback)
    await this.emitProgress(jobId, 'saving_to_database', 85, {}, step)

    const savedToD1 = await step.do(
      'save-to-database',
      {
        retries: {
          limit: 3,
          delay: 1000,
          backoff: 'exponential',
        },
        timeout: '30 seconds',
      },
      async () => {
        return await this.saveBookData(metadata, coverR2Key)
      }
    )

    // Step 7: Complete
    const result: BookImportResult = {
      success: true,
      isbn: validatedIsbn,
      metadata,
      coverR2Key,
      hasEmbedding,
      savedToD1,
    }

    await this.emitProgress(jobId, 'completed', 100, result as unknown as Record<string, unknown>, step)

    console.log(`[Workflow] Book import completed for ISBN ${validatedIsbn}`)
    return result
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Emit progress event to WebSocket clients via Durable Object
   */
  private async emitProgress(
    jobId: string,
    status: WorkflowStatus,
    progress: number,
    data: Record<string, unknown>,
    step: WorkflowStep
  ): Promise<void> {
    await step.do(`emit-${status}`, async () => {
      try {
        const doId = this.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId)
        const stub = this.env.WEBSOCKET_CONNECTION_DO.get(doId) as unknown as IWebSocketConnectionDO

        // Send progress update via WebSocket DO
        await stub.send({
          type: 'workflow_progress',
          jobId,
          status,
          progress,
          timestamp: new Date().toISOString(),
          data,
        })

        console.log(`[Workflow] Progress: ${status} (${progress}%)`)
      } catch (error) {
        // Don't fail workflow if progress emission fails
        console.warn(`[Workflow] Failed to emit progress: ${error}`)
      }
    })
  }

  /**
   * Validate ISBN format (ISBN-10 or ISBN-13)
   */
  private validateISBN(isbn: string): string {
    // Remove hyphens and spaces
    const cleaned = isbn.replace(/[-\s]/g, '')

    // Check length
    if (!/^\d{10}$|^\d{13}$/.test(cleaned)) {
      throw new Error(`Invalid ISBN format: ${isbn}. Must be 10 or 13 digits.`)
    }

    // Verify checksum for ISBN-13
    if (cleaned.length === 13) {
      let sum = 0
      for (let i = 0; i < 12; i++) {
        const char = cleaned.charAt(i)
        const digit = parseInt(char, 10)
        sum += digit * (i % 2 === 0 ? 1 : 3)
      }
      const checkDigit = (10 - (sum % 10)) % 10
      const lastDigit = parseInt(cleaned.charAt(12), 10)
      if (checkDigit !== lastDigit) {
        console.warn(`[Workflow] ISBN-13 checksum mismatch for ${isbn}`)
        // Don't fail - some sources have bad checksums
      }
    }

    return cleaned
  }

  /**
   * Fetch book metadata from provider
   */
  private async fetchMetadata(isbn: string, source: BookImportInput['source']): Promise<BookMetadata> {
    switch (source) {
      case 'google_books':
        return await this.fetchFromGoogleBooks(isbn)
      case 'openlibrary':
        return await this.fetchFromOpenLibrary(isbn)
      case 'isbndb':
        return await this.fetchFromISBNdb(isbn)
      default:
        throw new Error(`Unknown source: ${source}`)
    }
  }

  /**
   * Fetch from Google Books API
   */
  private async fetchFromGoogleBooks(isbn: string): Promise<BookMetadata> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${this.env.GOOGLE_BOOKS_API_KEY}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BooksTracker/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Google Books API failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      totalItems?: number
      items?: Array<{
        volumeInfo: {
          title?: string
          authors?: string[]
          description?: string
          imageLinks?: { thumbnail?: string; smallThumbnail?: string }
          publishedDate?: string
          publisher?: string
          pageCount?: number
          categories?: string[]
          industryIdentifiers?: Array<{ type: string; identifier: string }>
        }
      }>
    }

    if (!data.items || data.items.length === 0) {
      throw new Error(`No book found for ISBN: ${isbn}`)
    }

    const book = data.items[0]!.volumeInfo

    return {
      isbn,
      title: book.title || 'Unknown Title',
      author: book.authors?.[0] || 'Unknown Author',
      authors: book.authors,
      description: book.description,
      coverUrl: book.imageLinks?.thumbnail?.replace('http://', 'https://'),
      publicationDate: book.publishedDate,
      publisher: book.publisher,
      pageCount: book.pageCount,
      categories: book.categories,
    }
  }

  /**
   * Fetch from OpenLibrary API
   */
  private async fetchFromOpenLibrary(isbn: string): Promise<BookMetadata> {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BooksTracker/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`OpenLibrary API failed: ${response.status}`)
    }

    const data = await response.json() as Record<string, {
      title?: string
      authors?: Array<{ name: string }>
      cover?: { medium?: string; large?: string }
      publish_date?: string
      publishers?: Array<{ name: string }>
      number_of_pages?: number
      subjects?: Array<{ name: string }>
    }>

    const key = `ISBN:${isbn}`
    const book = data[key]

    if (!book) {
      throw new Error(`No book found for ISBN: ${isbn}`)
    }

    return {
      isbn,
      title: book.title || 'Unknown Title',
      author: book.authors?.[0]?.name || 'Unknown Author',
      authors: book.authors?.map(a => a.name),
      coverUrl: book.cover?.large || book.cover?.medium,
      publicationDate: book.publish_date,
      publisher: book.publishers?.[0]?.name,
      pageCount: book.number_of_pages,
      categories: book.subjects?.map(s => s.name),
    }
  }

  /**
   * Fetch from ISBNdb API
   */
  private async fetchFromISBNdb(isbn: string): Promise<BookMetadata> {
    if (!this.env.ISBNDB_API_KEY) {
      throw new Error('ISBNdb API key not configured')
    }

    const url = `https://api2.isbndb.com/book/${isbn}`

    const response = await fetch(url, {
      headers: {
        'Authorization': this.env.ISBNDB_API_KEY,
        'User-Agent': 'BooksTracker/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`ISBNdb API failed: ${response.status}`)
    }

    const data = await response.json() as {
      book?: {
        title?: string
        authors?: string[]
        synopsis?: string
        image?: string
        date_published?: string
        publisher?: string
        pages?: number
        subjects?: string[]
      }
    }

    if (!data.book) {
      throw new Error(`No book found for ISBN: ${isbn}`)
    }

    const book = data.book

    return {
      isbn,
      title: book.title || 'Unknown Title',
      author: book.authors?.[0] || 'Unknown Author',
      authors: book.authors,
      description: book.synopsis,
      coverUrl: book.image,
      publicationDate: book.date_published,
      publisher: book.publisher,
      pageCount: book.pages,
      categories: book.subjects,
    }
  }

  /**
   * Upload cover image to R2
   */
  private async uploadCoverToR2(coverUrl: string, isbn: string): Promise<string> {
    console.log(`[Workflow] Downloading cover from ${coverUrl}`)

    const response = await fetch(coverUrl, {
      headers: {
        'User-Agent': 'BooksTracker/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch cover: ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const imageBuffer = await response.arrayBuffer()

    // Determine file extension
    let extension = 'jpg'
    if (contentType.includes('png')) {
      extension = 'png'
    } else if (contentType.includes('webp')) {
      extension = 'webp'
    }

    const r2Key = `covers/${isbn}.${extension}`

    console.log(`[Workflow] Uploading cover to R2: ${r2Key}`)

    await this.env.BOOK_COVERS.put(r2Key, imageBuffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000', // 1 year cache
      },
      customMetadata: {
        isbn,
        sourceUrl: coverUrl,
        uploadedAt: new Date().toISOString(),
      },
    })

    return r2Key
  }

  /**
   * Generate text embedding for semantic search
   */
  private async generateEmbedding(metadata: BookMetadata): Promise<number[] | null> {
    if (!this.env.AI) {
      console.log('[Workflow] Workers AI not available, skipping embedding')
      return null
    }

    const text = [
      metadata.title,
      `by ${metadata.author}`,
      metadata.description,
      metadata.categories?.join(', '),
    ]
      .filter(Boolean)
      .join('. ')
      .substring(0, 512) // Max 512 chars for embedding

    try {
      const response = await this.env.AI.run('@cf/baai/bge-m3', {
        text: [text],
      }) as { data: number[][] }

      return response.data[0] ?? null
    } catch (error) {
      console.warn('[Workflow] Embedding generation failed:', error)
      return null
    }
  }

  /**
   * Save book data to D1 (with KV fallback)
   */
  private async saveBookData(
    metadata: BookMetadata,
    coverR2Key: string | null
  ): Promise<boolean> {
    if (this.env.DB) {
      // D1 available - use relational storage
      console.log('[Workflow] Saving to D1 database')

      try {
        await this.env.DB.prepare(`
          INSERT INTO books (isbn, title, author, description, cover_r2_key, publication_date, publisher, page_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(isbn) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            description = excluded.description,
            cover_r2_key = excluded.cover_r2_key,
            publication_date = excluded.publication_date,
            publisher = excluded.publisher,
            page_count = excluded.page_count,
            updated_at = CURRENT_TIMESTAMP
        `)
          .bind(
            metadata.isbn,
            metadata.title,
            metadata.author,
            metadata.description || null,
            coverR2Key,
            metadata.publicationDate || null,
            metadata.publisher || null,
            metadata.pageCount || null
          )
          .run()

        return true
      } catch (error) {
        console.error('[Workflow] D1 save failed, falling back to KV:', error)
        // Fall through to KV
      }
    }

    // KV fallback (or D1 not configured)
    console.log('[Workflow] Saving to KV cache (D1 fallback)')

    const bookData = {
      ...metadata,
      coverR2Key,
      savedAt: new Date().toISOString(),
      source: 'workflow',
    }

    await this.env.CACHE.put(
      `book:isbn:${metadata.isbn}`,
      JSON.stringify(bookData),
      { expirationTtl: 86400 * 30 } // 30 days TTL
    )

    return false // Saved to KV, not D1
  }
}
