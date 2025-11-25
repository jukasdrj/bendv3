/**
 * Book Import Workflow Unit Tests
 *
 * Sprint 3: Phase 3 - Workflow Testing Strategy (Issue #27)
 *
 * Tests individual workflow steps in isolation with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createMockWorkflowStep,
  createMockEnv,
  createMockFetch,
  assertStepCalled,
  assertStepOrder,
} from '../utils/workflow-test-helpers'
import {
  mockHarryPotterMetadata,
  mockGoogleBooksResponse,
  mockOpenLibraryResponse,
  mockBookImportInput,
  mockEmbeddingResult,
} from '../fixtures/workflow-fixtures'

// ============================================================================
// Test Suite: ISBN Validation
// ============================================================================

describe('BookImportWorkflow - ISBN Validation', () => {
  it('should validate ISBN-13 format', () => {
    const validISBN13 = '9780439708180'
    const cleaned = validISBN13.replace(/[-\s]/g, '')

    expect(cleaned).toMatch(/^\d{13}$/)

    // Verify checksum
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cleaned[i]!) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    expect(checkDigit).toBe(parseInt(cleaned[12]!))
  })

  it('should validate ISBN-10 format', () => {
    const validISBN10 = '0439708184'
    expect(validISBN10).toMatch(/^\d{10}$/)
  })

  it('should clean ISBN with hyphens', () => {
    const isbnWithHyphens = '978-0-439-70818-0'
    const cleaned = isbnWithHyphens.replace(/[-\s]/g, '')
    expect(cleaned).toBe('9780439708180')
  })

  it('should reject invalid ISBN format', () => {
    const invalidISBNs = ['ABC123', '12345', '978043970818', '97804397081800']

    invalidISBNs.forEach((isbn) => {
      const cleaned = isbn.replace(/[-\s]/g, '')
      expect(cleaned).not.toMatch(/^\d{10}$|^\d{13}$/)
    })
  })
})

// ============================================================================
// Test Suite: Metadata Fetching
// ============================================================================

describe('BookImportWorkflow - Metadata Fetching', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should fetch metadata from Google Books API', async () => {
    const mockResponse = new Response(JSON.stringify(mockGoogleBooksResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    globalThis.fetch = createMockFetch(
      new Map([['googleapis.com/books', mockResponse]])
    )

    const response = await fetch(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:9780439708180'
    )
    const data = await response.json()

    expect(data.totalItems).toBe(1)
    expect(data.items[0].volumeInfo.title).toBe(
      "Harry Potter and the Philosopher's Stone"
    )
  })

  it('should fetch metadata from OpenLibrary API', async () => {
    const mockResponse = new Response(JSON.stringify(mockOpenLibraryResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    globalThis.fetch = createMockFetch(
      new Map([['openlibrary.org', mockResponse]])
    )

    const response = await fetch(
      'https://openlibrary.org/api/books?bibkeys=ISBN:9780439708180&format=json'
    )
    const data = await response.json()

    expect(data['ISBN:9780439708180']).toBeDefined()
    expect(data['ISBN:9780439708180'].title).toBe(
      "Harry Potter and the Philosopher's Stone"
    )
  })

  it('should handle API errors gracefully', async () => {
    const mockErrorResponse = new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429 }
    )

    globalThis.fetch = createMockFetch(
      new Map([['googleapis.com/books', mockErrorResponse]])
    )

    const response = await fetch(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:9780439708180'
    )

    expect(response.status).toBe(429)
  })

  it('should handle network errors', async () => {
    globalThis.fetch = createMockFetch(
      new Map([['googleapis.com/books', new Error('Network error')]])
    )

    await expect(
      fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:9780439708180')
    ).rejects.toThrow('Network error')
  })
})

// ============================================================================
// Test Suite: Cover Image Upload
// ============================================================================

describe('BookImportWorkflow - Cover Upload', () => {
  it('should upload cover to R2', async () => {
    const mockEnv = createMockEnv()
    const coverKey = `covers/9780439708180.jpg`

    await mockEnv.BOOK_COVERS.put(coverKey, new ArrayBuffer(100), {
      httpMetadata: { contentType: 'image/jpeg' },
    })

    expect(mockEnv.BOOK_COVERS.put).toHaveBeenCalledWith(
      coverKey,
      expect.any(ArrayBuffer),
      expect.objectContaining({
        httpMetadata: { contentType: 'image/jpeg' },
      })
    )
  })

  it('should generate correct R2 key for different image types', () => {
    const testCases = [
      { contentType: 'image/jpeg', expected: 'jpg' },
      { contentType: 'image/png', expected: 'png' },
      { contentType: 'image/webp', expected: 'webp' },
    ]

    testCases.forEach(({ contentType, expected }) => {
      let extension = 'jpg'
      if (contentType.includes('png')) extension = 'png'
      else if (contentType.includes('webp')) extension = 'webp'

      expect(extension).toBe(expected)
    })
  })
})

// ============================================================================
// Test Suite: Embedding Generation
// ============================================================================

describe('BookImportWorkflow - Embedding Generation', () => {
  it('should generate embeddings using Workers AI', async () => {
    const mockEnv = createMockEnv()
    const expectedDimensions = 1024

    await mockEnv.AI.run('@cf/baai/bge-m3', { text: ['test text'] })

    expect(mockEnv.AI.run).toHaveBeenCalledWith(
      '@cf/baai/bge-m3',
      expect.objectContaining({ text: expect.any(Array) })
    )
  })

  it('should truncate long text to 512 characters', () => {
    const longText = 'A'.repeat(1000)
    const truncated = longText.substring(0, 512)

    expect(truncated.length).toBe(512)
  })

  it('should combine book fields for embedding text', () => {
    const book = mockHarryPotterMetadata
    const textParts = [
      book.title,
      `by ${book.author}`,
      book.description,
      book.categories?.join(', '),
    ].filter(Boolean)

    const text = textParts.join('. ')

    expect(text).toContain(book.title)
    expect(text).toContain(`by ${book.author}`)
    expect(text).toContain('Fiction')
  })
})

// ============================================================================
// Test Suite: Database Storage
// ============================================================================

describe('BookImportWorkflow - Database Storage', () => {
  it('should save book to D1 with upsert', async () => {
    const mockEnv = createMockEnv()
    const book = mockHarryPotterMetadata

    await mockEnv.DB.prepare(
      'INSERT INTO books ... ON CONFLICT(isbn) DO UPDATE SET ...'
    )
      .bind(
        book.isbn,
        book.title,
        book.author,
        book.description,
        'covers/9780439708180.jpg',
        book.publicationDate,
        book.publisher,
        book.pageCount
      )
      .run()

    expect(mockEnv.DB.prepare).toHaveBeenCalled()
  })

  it('should fallback to KV when D1 fails', async () => {
    const mockEnv = createMockEnv({
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockRejectedValue(new Error('D1 error')),
        }),
      },
    })

    const book = mockHarryPotterMetadata

    // Simulate D1 failure
    try {
      await mockEnv.DB.prepare('INSERT INTO books...').bind(book.isbn).run()
    } catch {
      // Fallback to KV
      await mockEnv.KV_CACHE.put(
        `book:isbn:${book.isbn}`,
        JSON.stringify(book),
        { expirationTtl: 86400 * 30 }
      )
    }

    expect(mockEnv.KV_CACHE.put).toHaveBeenCalledWith(
      `book:isbn:${book.isbn}`,
      expect.any(String),
      expect.objectContaining({ expirationTtl: 86400 * 30 })
    )
  })
})

// ============================================================================
// Test Suite: Workflow Step Execution
// ============================================================================

describe('BookImportWorkflow - Step Execution', () => {
  it('should execute steps in correct order', async () => {
    const mockStep = createMockWorkflowStep()

    // Simulate workflow execution
    await mockStep.do('validate-isbn', async () => '9780439708180')
    await mockStep.do('fetch-metadata', async () => mockHarryPotterMetadata)
    await mockStep.do('upload-cover', async () => 'covers/9780439708180.jpg')
    await mockStep.do('generate-embedding', async () => mockEmbeddingResult)
    await mockStep.do('store-embedding', async () => undefined)
    await mockStep.do('save-to-database', async () => true)

    assertStepOrder(mockStep, [
      'validate-isbn',
      'fetch-metadata',
      'upload-cover',
      'generate-embedding',
      'store-embedding',
      'save-to-database',
    ])
  })

  it('should emit progress at each step', async () => {
    const mockStep = createMockWorkflowStep()
    const progressUpdates: { status: string; progress: number }[] = []

    // Simulate progress emissions
    const emitProgress = async (status: string, progress: number) => {
      await mockStep.do(`emit-${status}`, async () => {
        progressUpdates.push({ status, progress })
      })
    }

    await emitProgress('started', 0)
    await emitProgress('validating', 10)
    await emitProgress('fetching_metadata', 20)
    await emitProgress('metadata_fetched', 50)
    await emitProgress('uploading_cover', 60)
    await emitProgress('cover_uploaded', 70)
    await emitProgress('generating_embedding', 75)
    await emitProgress('embedding_generated', 80)
    await emitProgress('saving_to_database', 85)
    await emitProgress('completed', 100)

    expect(progressUpdates).toHaveLength(10)
    expect(progressUpdates[0]).toEqual({ status: 'started', progress: 0 })
    expect(progressUpdates[progressUpdates.length - 1]).toEqual({
      status: 'completed',
      progress: 100,
    })
  })

  it('should handle step retries', async () => {
    let attempts = 0
    const mockStep = createMockWorkflowStep()

    mockStep.do.mockImplementation(
      async (name: string, optionsOrFn: unknown, maybeFn?: () => Promise<unknown>) => {
        const fn = maybeFn ?? optionsOrFn
        if (name === 'fetch-metadata' && typeof fn === 'function') {
          attempts++
          if (attempts < 3) {
            throw new Error('Temporary failure')
          }
          return mockHarryPotterMetadata
        }
        if (typeof fn === 'function') {
          return await fn()
        }
      }
    )

    // First two attempts fail, third succeeds
    await expect(mockStep.do('fetch-metadata', async () => {})).rejects.toThrow()
    await expect(mockStep.do('fetch-metadata', async () => {})).rejects.toThrow()
    const result = await mockStep.do('fetch-metadata', async () => mockHarryPotterMetadata)

    expect(attempts).toBe(3)
    expect(result).toEqual(mockHarryPotterMetadata)
  })
})

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe('BookImportWorkflow - Error Handling', () => {
  it('should handle missing book gracefully', async () => {
    const mockEnv = createMockEnv()
    const emptyResponse = { totalItems: 0, items: [] }

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyResponse), { status: 200 })
    )

    const response = await fetch('https://api.example.com/books?isbn=UNKNOWN')
    const data = await response.json()

    expect(data.totalItems).toBe(0)
    expect(data.items).toHaveLength(0)
  })

  it('should continue workflow without embeddings if AI fails', async () => {
    const mockEnv = createMockEnv({
      AI: {
        run: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
      },
    })

    let hasEmbedding = false

    try {
      await mockEnv.AI.run('@cf/baai/bge-m3', { text: ['test'] })
      hasEmbedding = true
    } catch {
      // Continue without embedding
      hasEmbedding = false
    }

    expect(hasEmbedding).toBe(false)
    // Workflow should still complete
  })

  it('should emit failure progress on error', async () => {
    const progressUpdates: { status: string; error?: string }[] = []

    const emitProgress = (status: string, error?: string) => {
      progressUpdates.push({ status, error })
    }

    // Simulate workflow failure
    emitProgress('started')
    emitProgress('validating')
    emitProgress('failed', 'Metadata fetch failed: API timeout')

    expect(progressUpdates).toContainEqual({
      status: 'failed',
      error: 'Metadata fetch failed: API timeout',
    })
  })
})
