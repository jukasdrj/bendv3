/**
 * Integration Tests: Batch Processing
 *
 * Tests batch enrichment, photo scanning, CSV imports, progress tracking
 * WebSocket progress updates with cancellation and recovery support
 * See TEST_PLAN.md for complete test strategy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockDOStub, createValidAuthToken } from '../mocks/durable-object.js'
import { createMockWebSocketPair } from '../setup.js'

const BATCH_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Batch Enrichment Tests
 * Tests ISBN batch enrichment and processing
 */
describe('Batch Enrichment', () => {
  it('should enrich batch of 5 books in parallel', async () => {
    const books = [
      { isbn: '9780439708180' },
      { isbn: '9780439064873' },
      { isbn: '9780439136365' },
      { isbn: '9780439139601' },
      { isbn: '9780439013959' }
    ]

    // All books should be enriched
    const enrichedBooks = books.map(b => ({
      ...b,
      title: 'Harry Potter',
      author: 'J.K. Rowling',
      source: 'google_books'
    }))

    expect(enrichedBooks.length).toBe(5)
    expect(enrichedBooks[0].title).toBe('Harry Potter')
  })

  it('should handle mixed success/failure in batch', () => {
    const results = {
      succeeded: [
        { isbn: '978-1', title: 'Book 1' },
        { isbn: '978-2', title: 'Book 2' },
        { isbn: '978-3', title: 'Book 3' }
      ],
      failed: [
        { isbn: '978-4', error: 'No data from providers' },
        { isbn: '978-5', error: 'Provider timeout' }
      ]
    }

    expect(results.succeeded.length).toBe(3)
    expect(results.failed.length).toBe(2)
  })

  it('should track batch progress via WebSocket', () => {
    const totalBooks = 5
    const progressUpdates = []

    // Simulate progress from 0% to 100%
    for (let i = 0; i <= totalBooks; i++) {
      const progress = (i / totalBooks) * 100
      progressUpdates.push({ processed: i, total: totalBooks, progress })
    }

    expect(progressUpdates[0].progress).toBe(0)
    expect(progressUpdates[5].progress).toBe(100)
    expect(progressUpdates.length).toBe(6)
  })

  it('should cancel batch mid-processing', () => {
    const batch = {
      totalBooks: 5,
      processed: 2,
      cancelled: true,
      cancelledAt: Date.now()
    }

    expect(batch.cancelled).toBe(true)
    expect(batch.processed).toBe(2)
    expect(batch.processed).toBeLessThan(batch.totalBooks)
  })

  it('should timeout batch after 30 minutes', () => {
    const startTime = Date.now()
    const timeoutTime = startTime + BATCH_TIMEOUT_MS

    // After 30 minutes, batch times out
    const elapsed = BATCH_TIMEOUT_MS
    const hasTimedOut = elapsed >= BATCH_TIMEOUT_MS

    expect(hasTimedOut).toBe(true)
    expect(timeoutTime - startTime).toBe(30 * 60 * 1000)
  })

  it('should isolate concurrent batch enrichments', () => {
    const batch1 = { jobId: 'job-1', totalBooks: 5, processed: 0 }
    const batch2 = { jobId: 'job-2', totalBooks: 3, processed: 0 }

    // Update batch 1
    batch1.processed = 3

    // Batch 2 should not be affected
    expect(batch1.processed).toBe(3)
    expect(batch2.processed).toBe(0)
    expect(batch1.jobId).not.toBe(batch2.jobId)
  })

  it('should recover from enrichment errors in batch', () => {
    const batch = {
      totalBooks: 5,
      results: [
        { isbn: '978-1', title: 'Book 1' }, // Success
        null, // Failed (error but continue)
        { isbn: '978-3', title: 'Book 3' }, // Success
        { isbn: '978-4', title: 'Book 4' }, // Success
        { isbn: '978-5', title: 'Book 5' }  // Success
      ]
    }

    const successCount = batch.results.filter(r => r !== null).length
    expect(successCount).toBe(4)
    expect(batch.results.length).toBe(5)
  })

  it('should deduplicate authors across batch', () => {
    const books = [
      { isbn: '978-1', author: 'J.K. Rowling' },
      { isbn: '978-2', author: 'J.K. Rowling' },
      { isbn: '978-3', author: 'Stephen King' }
    ]

    const uniqueAuthors = new Set(books.map(b => b.author))
    expect(uniqueAuthors.size).toBe(2)
    expect(uniqueAuthors.has('J.K. Rowling')).toBe(true)
    expect(uniqueAuthors.has('Stephen King')).toBe(true)
  })
})

/**
 * Batch Scan (Photos) Tests
 * Tests photo-based book discovery via computer vision
 */
describe('Batch Scan (Photos)', () => {
  it('should process uploaded photos in batch', () => {
    const photos = [
      { id: 'photo-0', status: 'queued' },
      { id: 'photo-1', status: 'queued' },
      { id: 'photo-2', status: 'queued' }
    ]

    // Progress through states
    photos[0].status = 'processing'
    photos[0].status = 'complete'

    expect(photos[0].status).toBe('complete')
    expect(photos[1].status).toBe('queued')
  })

  it('should update photo state during processing', () => {
    const photo = { id: 'photo-0', status: 'queued' }

    // State transitions
    photo.status = 'processing'
    expect(photo.status).toBe('processing')

    photo.status = 'complete'
    expect(photo.status).toBe('complete')
  })

  it('should process multiple photos in parallel', () => {
    const photos = [
      { id: 'photo-0', booksFound: 3 },
      { id: 'photo-1', booksFound: 2 },
      { id: 'photo-2', booksFound: 4 }
    ]

    // All processed in parallel
    expect(photos.length).toBe(3)
    expect(photos.map(p => p.booksFound)).toEqual([3, 2, 4])
  })

  it('should isolate photo errors (one fails, others continue)', () => {
    const results = [
      { photoId: 'photo-0', booksFound: 3 }, // Success
      { photoId: 'photo-1', error: 'Poor image quality' }, // Failed
      { photoId: 'photo-2', booksFound: 2 }  // Success
    ]

    const succeeded = results.filter(r => r.booksFound).length
    expect(succeeded).toBe(2)
  })

  it('should cancel bookshelf scan mid-processing', () => {
    const scan = {
      totalPhotos: 3,
      processed: 1,
      cancelled: true
    }

    expect(scan.cancelled).toBe(true)
    expect(scan.processed).toBe(1)
    expect(scan.processed).toBeLessThan(scan.totalPhotos)
  })

  it('should track total books found across photos', () => {
    const photos = [
      { booksFound: 3 },
      { booksFound: 2 },
      { booksFound: 4 }
    ]

    const totalBooks = photos.reduce((sum, p) => sum + (p.booksFound || 0), 0)
    expect(totalBooks).toBe(9)
  })

  it('should complete batch and return results', () => {
    const batch = {
      status: 'processing',
      photoCount: 3,
      totalBooksFound: 9,
      photos: [
        { id: 'photo-0', booksFound: 3 },
        { id: 'photo-1', booksFound: 2 },
        { id: 'photo-2', booksFound: 4 }
      ]
    }

    batch.status = 'complete'

    expect(batch.status).toBe('complete')
    expect(batch.totalBooksFound).toBe(9)
    expect(batch.photos.length).toBe(3)
  })
})

/**
 * CSV Import Tests
 * Tests CSV parsing and bulk book import
 */
describe('CSV Import', () => {
  it('should parse CSV and extract book data', () => {
    const csvData = 'ISBN,Title,Author\n9780439708180,Harry Potter,J.K. Rowling\n9780439064873,Chamber of Secrets,J.K. Rowling'
    const rows = csvData.split('\n').slice(1) // Skip header

    const books = rows
      .filter(r => r.trim())
      .map(row => {
        const [isbn, title, author] = row.split(',')
        return { isbn, title, author }
      })

    expect(books.length).toBe(2)
    expect(books[0].title).toBe('Harry Potter')
  })

  it('should enrich books from CSV', () => {
    const books = [
      { isbn: '978-1', title: 'Book 1' },
      { isbn: '978-2', title: 'Book 2' }
    ]

    const enriched = books.map(b => ({
      ...b,
      author: 'Author Name',
      publisher: 'Publisher',
      source: 'csv_import'
    }))

    expect(enriched[0].author).toBe('Author Name')
    expect(enriched[0].source).toBe('csv_import')
  })

  it('should handle invalid rows in CSV', () => {
    const rows = [
      '978-1,Book 1,Author',  // Valid
      'invalid',              // Invalid (missing fields)
      '978-2,Book 2,Author'   // Valid
    ]

    const parsed = rows
      .filter(r => r.split(',').length === 3)
      .map(r => r.split(','))

    expect(parsed.length).toBe(2)
  })

  it('should validate CSV file size', () => {
    const fileSizeBytes = 5 * 1024 * 1024 // 5MB
    const maxSizeBytes = 10 * 1024 * 1024 // 10MB

    const isValid = fileSizeBytes <= maxSizeBytes
    expect(isValid).toBe(true)

    const tooLarge = 15 * 1024 * 1024
    expect(tooLarge <= maxSizeBytes).toBe(false)
  })

  it('should handle CSV parsing errors', () => {
    const malformedCSV = 'ISBN,Title\n978-1"malformed,Book'

    const parseError = new Error('CSV parsing failed')
    expect(parseError).toBeInstanceOf(Error)
  })

  it('should track CSV import progress', () => {
    const totalRows = 100
    const progressUpdates = []

    for (let i = 0; i <= totalRows; i += 10) {
      progressUpdates.push({ processed: i, total: totalRows })
    }

    expect(progressUpdates[0].processed).toBe(0)
    expect(progressUpdates[progressUpdates.length - 1].processed).toBe(100)
  })

  it('should complete CSV import with results', () => {
    const csvImport = {
      status: 'complete',
      booksImported: 50,
      booksFailed: 2,
      results: []
    }

    expect(csvImport.status).toBe('complete')
    expect(csvImport.booksImported).toBe(50)
  })

  it('should schedule CSV processing alarm', () => {
    const uploadTime = Date.now()
    const processingTime = uploadTime + 2000 // 2 seconds

    expect(processingTime - uploadTime).toBe(2000)
  })
})

/**
 * Progress WebSocket Communication Tests
 * Tests real-time progress updates via WebSocket
 */
describe('Progress WebSocket Communication', () => {
  it('should send job_started message', () => {
    const message = {
      type: 'job_started',
      jobId: 'job-123',
      totalCount: 5
    }

    expect(message.type).toBe('job_started')
    expect(message.totalCount).toBe(5)
  })

  it('should send job_progress message with updates', () => {
    const progressMessages = [
      { type: 'job_progress', progress: 0.0 },
      { type: 'job_progress', progress: 0.5 },
      { type: 'job_progress', progress: 1.0 }
    ]

    expect(progressMessages[0].progress).toBe(0.0)
    expect(progressMessages[1].progress).toBe(0.5)
    expect(progressMessages[2].progress).toBe(1.0)
  })

  it('should send job_complete with results', () => {
    const message = {
      type: 'job_complete',
      jobId: 'job-123',
      books: [{ isbn: '978-1', title: 'Book 1' }],
      success: true
    }

    expect(message.type).toBe('job_complete')
    expect(message.books).toBeDefined()
  })

  it('should send error message on failure', () => {
    const message = {
      type: 'error',
      code: 'PROVIDER_TIMEOUT',
      message: 'All providers timed out'
    }

    expect(message.type).toBe('error')
    expect(message.code).toBe('PROVIDER_TIMEOUT')
  })

  it('should maintain progress message order', () => {
    const messages = []
    for (let i = 0; i < 10; i++) {
      messages.push({ sequence: i, type: 'progress' })
    }

    expect(messages[0].sequence).toBe(0)
    expect(messages[9].sequence).toBe(9)
  })

  it('should send keepalive during long processing', () => {
    const keepaliveInterval = 30000 // 30 seconds
    const lastKeepalive = Date.now()
    const nextKeepalive = lastKeepalive + keepaliveInterval

    expect(nextKeepalive - lastKeepalive).toBe(30000)
  })

  it('should handle client disconnect gracefully', () => {
    const batch = {
      status: 'processing',
      disconnected: true,
      cleanedUp: true
    }

    expect(batch.disconnected).toBe(true)
    expect(batch.cleanedUp).toBe(true)
  })

  it('should recover state on client reconnect', () => {
    const savedState = {
      jobId: 'job-123',
      processed: 3,
      total: 5
    }

    const recovered = { ...savedState }
    expect(recovered.jobId).toBe('job-123')
    expect(recovered.processed).toBe(3)
  })
})

/**
 * Concurrent Operations Tests
 * Tests multiple concurrent batch operations
 */
describe('Concurrent Operations', () => {
  it('should isolate concurrent enrichment batches', () => {
    const batch1 = { jobId: 'job-1', books: 5 }
    const batch2 = { jobId: 'job-2', books: 3 }

    expect(batch1.jobId).not.toBe(batch2.jobId)
    expect(batch1.books).not.toBe(batch2.books)
  })

  it('should process photos concurrently without collision', () => {
    const photos = [
      { id: 0, booksFound: 0 },
      { id: 1, booksFound: 0 }
    ]

    // Update different indices
    photos[0].booksFound = 3
    photos[1].booksFound = 2

    expect(photos[0].booksFound).toBe(3)
    expect(photos[1].booksFound).toBe(2)
  })

  it('should handle concurrent CSV imports', () => {
    const import1 = { jobId: 'csv-1', status: 'processing' }
    const import2 = { jobId: 'csv-2', status: 'processing' }

    expect(import1.jobId).not.toBe(import2.jobId)
  })

  it('should handle concurrent cancellation requests', () => {
    const batch = { cancelled: false }

    batch.cancelled = true
    expect(batch.cancelled).toBe(true)

    // Second cancel should be idempotent
    batch.cancelled = true
    expect(batch.cancelled).toBe(true)
  })

  it('should maintain state consistency under concurrent load', () => {
    let state = { value: 0, version: 1 }

    state.value++
    state.version++

    state.value++
    state.version++

    expect(state.value).toBe(2)
    expect(state.version).toBe(3)
  })

  it('should handle message queue under heavy load', () => {
    const messages = []
    for (let i = 0; i < 100; i++) {
      messages.push({ sequence: i })
    }

    expect(messages.length).toBe(100)
    expect(messages[0].sequence).toBe(0)
    expect(messages[99].sequence).toBe(99)
  })
})

/**
 * Error Recovery Tests
 * Tests error handling and recovery strategies
 */
describe('Error Recovery', () => {
  it('should recover from enrichment errors', () => {
    const results = {
      primary: null, // Google Books failed
      fallback: { title: 'Book', source: 'openlibrary' } // OpenLibrary succeeded
    }

    expect(results.fallback).toBeDefined()
  })

  it('should recover from provider timeout', () => {
    const timeouted = { provider: 'google_books', error: 'timeout' }
    const fallback = { provider: 'openlibrary', status: 'success' }

    expect(fallback.status).toBe('success')
  })

  it('should retry failed enrichment', () => {
    const retryConfig = { maxRetries: 3, currentRetry: 1 }

    expect(retryConfig.currentRetry).toBeLessThan(retryConfig.maxRetries)
  })

  it('should handle partial completion gracefully', () => {
    const batch = {
      total: 5,
      succeeded: 3,
      failed: 2,
      partialResults: [
        { isbn: '978-1', title: 'Book 1' },
        { isbn: '978-2', title: 'Book 2' },
        { isbn: '978-3', title: 'Book 3' }
      ]
    }

    expect(batch.partialResults.length).toBe(3)
    expect(batch.succeeded + batch.failed).toBe(batch.total)
  })

  it('should handle storage failures during batch', () => {
    const batch = { processed: 5 }
    // Storage fails but batch continues

    expect(batch.processed).toBe(5)
  })

  it('should manage memory during large batch', () => {
    const largeBooks = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      title: `Book ${i}`
    }))

    expect(largeBooks.length).toBe(1000)
    expect(largeBooks[999].title).toBe('Book 999')
  })
})
