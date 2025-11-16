/**
 * E2E Tests: CSV Import Workflow
 *
 * This test suite verifies the entire CSV import workflow, including:
 * - processCSVImportCore function execution
 * - Duration field calculation (Issue #145 fix verification)
 * - WebSocket message delivery
 * - Error handling and recovery
 *
 * See TEST_PLAN.md for complete E2E test strategy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processCSVImportCore } from '../../src/handlers/csv-import.ts'

// Mock dependencies
let mockParseCSVWithGemini = vi.fn()
let mockValidateCSV = vi.fn()

vi.mock('../../src/providers/gemini-csv-provider.js', () => ({
  parseCSVWithGemini: (...args) => mockParseCSVWithGemini(...args),
}))

vi.mock('../../src/utils/csv-validator.js', () => ({
  validateCSV: (...args) => mockValidateCSV(...args),
}))

vi.mock('../../src/prompts/csv-parser-prompt.js', () => ({
  buildCSVParserPrompt: () => 'Mock CSV parser prompt',
  PROMPT_VERSION: 'v1.0.0-test',
}))

vi.mock('../../src/utils/cache-keys.js', () => ({
  generateCSVCacheKey: async () => 'mock-cache-key',
}))

describe('E2E: CSV Import Workflow', () => {
  let mockDoStub
  let mockEnv
  const testJobId = 'test-job-123'

  beforeEach(() => {
    vi.clearAllMocks()

    // Default successful Gemini response
    mockParseCSVWithGemini.mockResolvedValue([
      { title: 'Book 1', author: 'Author 1', isbn: '1234567890' },
      { title: 'Book 2', author: 'Author 2' },
    ])

    // Default successful validation
    mockValidateCSV.mockReturnValue({
      valid: true,
    })

    // Mock Durable Object stub with all required methods
    mockDoStub = {
      waitForReady: vi.fn(async () => ({
        timedOut: false,
        disconnected: false,
      })),
      updateProgress: vi.fn(async () => ({ success: true })),
      complete: vi.fn(async () => ({ success: true })),
      sendError: vi.fn(async () => ({ success: true })),
    }

    // Mock environment
    mockEnv = {
      KV_CACHE: {
        get: vi.fn(async () => null), // Cache miss by default
        put: vi.fn(async () => {}),
      },
      GEMINI_API_KEY: 'test-api-key',
    }
  })

  describe('Successful CSV Import', () => {
    it('should complete the full workflow: CSV upload → parsing → completion', async () => {
      const csvText = 'title,author,isbn\nBook 1,Author 1,1234567890\nBook 2,Author 2,'

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify WebSocket ready signal was awaited
      expect(mockDoStub.waitForReady).toHaveBeenCalledWith(10000)

      // Verify progress updates were sent
      expect(mockDoStub.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.02,
          status: expect.stringContaining('Validating'),
        })
      )

      expect(mockDoStub.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.05,
          status: expect.stringContaining('Gemini'),
        })
      )

      expect(mockDoStub.updateProgress).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          progress: 0.75,
          status: expect.stringContaining('2 books'),
          processedCount: 2,
        })
      )

      // ISSUE #145 FIX VERIFICATION: Verify completion includes duration field
      expect(mockDoStub.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          summary: expect.objectContaining({
            totalProcessed: 2,
            successCount: 2,
            failureCount: 0,
            duration: expect.any(Number), // ✅ This verifies the startTime fix
            resourceId: expect.stringContaining('job-results:'),
          }),
        })
      )

      // Verify duration is a reasonable value (should be < 1000ms for mocked test)
      const completionCall = mockDoStub.complete.mock.calls[0][1]
      expect(completionCall.summary.duration).toBeGreaterThanOrEqual(0)
      expect(completionCall.summary.duration).toBeLessThan(5000) // Generous upper bound
    })

    it('should store full results in KV storage', async () => {
      const csvText = 'title,author\nBook 1,Author 1\nBook 2,Author 2'

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify KV storage was called with results
      const kvPutCall = mockEnv.KV_CACHE.put.mock.calls.find((call) =>
        call[0].startsWith('job-results:')
      )

      expect(kvPutCall).toBeDefined()
      expect(kvPutCall[0]).toBe(`job-results:${testJobId}`)

      const storedResults = JSON.parse(kvPutCall[1])

      // Match the actual mock data (which includes ISBN from beforeEach setup)
      expect(storedResults.books).toHaveLength(2)
      expect(storedResults.books[0].title).toBe('Book 1')
      expect(storedResults.books[0].author).toBe('Author 1')
      expect(storedResults.books[1].title).toBe('Book 2')
      expect(storedResults.books[1].author).toBe('Author 2')
      expect(storedResults.errors).toEqual([])

      // Verify 1-hour TTL
      expect(kvPutCall[2]).toEqual({ expirationTtl: 3600 })
    })
  })

  describe('Invalid Rows', () => {
    it('should handle CSV files with invalid or malformed rows', async () => {
      const csvText = 'title,author\nValid Book,Valid Author\n,Missing Title\nMissing Author,'

      // Gemini returns 3 books, but only 1 is valid
      mockParseCSVWithGemini.mockResolvedValue([
        { title: 'Valid Book', author: 'Valid Author' },
        { author: 'No Title' }, // Missing title
        { title: 'No Author' }, // Missing author
      ])

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify completion includes failure count
      expect(mockDoStub.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          summary: expect.objectContaining({
            totalProcessed: 3,
            successCount: 1,
            failureCount: 2, // 2 books filtered out
          }),
        })
      )
    })
  })

  describe('CSV Size Validation', () => {
    it('should reject invalid CSV during validation', async () => {
      const csvText = 'invalid csv content'

      mockValidateCSV.mockReturnValue({
        valid: false,
        error: 'Missing required columns: title, author',
      })

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify error was sent
      expect(mockDoStub.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          code: 'E_CSV_PROCESSING_FAILED',
          message: expect.stringContaining('Invalid CSV'),
          retryable: true,
        })
      )

      // Verify completion was NOT called
      expect(mockDoStub.complete).not.toHaveBeenCalled()
    })
  })

  describe('Parser Error Recovery', () => {
    it('should handle errors that occur during CSV parsing', async () => {
      const csvText = 'title,author\nTest Book,Test Author'

      mockParseCSVWithGemini.mockRejectedValue(
        new Error('Gemini API rate limit exceeded')
      )

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify error message was sent
      expect(mockDoStub.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          code: 'E_CSV_PROCESSING_FAILED',
          message: 'Gemini API rate limit exceeded',
          retryable: true,
          details: expect.objectContaining({
            fallbackAvailable: true,
          }),
        })
      )
    })
  })

  describe('Empty CSV', () => {
    it('should handle an empty CSV file', async () => {
      const csvText = 'title,author\n' // Only header

      mockParseCSVWithGemini.mockResolvedValue([]) // No books parsed

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify error was sent for empty result
      expect(mockDoStub.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          message: expect.stringContaining('No valid books found'),
        })
      )
    })
  })

  describe('CSV with only a header', () => {
    it('should handle a CSV file with only a header row', async () => {
      const csvText = 'title,author'

      mockParseCSVWithGemini.mockResolvedValue([])

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      expect(mockDoStub.sendError).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          code: 'E_CSV_PROCESSING_FAILED',
          message: expect.stringContaining('No valid books found'),
        })
      )
    })
  })

  describe('Large CSV', () => {
    it('should handle a large CSV file without timing out', async () => {
      // Simulate 100 books
      const largeParsedBooks = Array.from({ length: 100 }, (_, i) => ({
        title: `Book ${i + 1}`,
        author: `Author ${i + 1}`,
      }))

      mockParseCSVWithGemini.mockResolvedValue(largeParsedBooks)

      const csvText = 'title,author\n' + largeParsedBooks.map((b) => `${b.title},${b.author}`).join('\n')

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify completion with all books
      expect(mockDoStub.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          summary: expect.objectContaining({
            totalProcessed: 100,
            successCount: 100,
            failureCount: 0,
          }),
        })
      )
    })
  })

  describe('Progress Updates', () => {
    it('should provide accurate and timely progress updates for each stage', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify all progress stages
      const progressCalls = mockDoStub.updateProgress.mock.calls

      expect(progressCalls).toHaveLength(3) // Validation, Upload, Parsed

      // Stage 1: Validation (2%)
      expect(progressCalls[0][1]).toMatchObject({
        progress: 0.02,
        status: expect.stringContaining('Validating'),
        processedCount: 0,
      })

      // Stage 2: Gemini Upload (5%)
      expect(progressCalls[1][1]).toMatchObject({
        progress: 0.05,
        status: expect.stringContaining('Gemini'),
        processedCount: 0,
      })

      // Stage 3: Parsed (75%)
      // Note: Uses mock data from beforeEach which returns 2 books
      expect(progressCalls[2][1]).toMatchObject({
        progress: 0.75,
        status: expect.stringContaining('books'),
        processedCount: 2,
      })
    })
  })

  describe('Enrichment Failures', () => {
    it('should filter out books with missing required fields', async () => {
      const csvText = 'title,author\nValid,Author\nInvalid,'

      mockParseCSVWithGemini.mockResolvedValue([
        { title: 'Valid', author: 'Author' },
        { title: 'Invalid' }, // Missing author
      ])

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify only valid book is included
      const completionCall = mockDoStub.complete.mock.calls[0][1]
      expect(completionCall.summary.successCount).toBe(1)
      expect(completionCall.summary.failureCount).toBe(1)
    })
  })

  describe('Cancellation', () => {
    it('should handle WebSocket disconnection gracefully', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      mockDoStub.waitForReady.mockResolvedValue({
        timedOut: false,
        disconnected: true, // Client disconnected
      })

      // Should not throw, should continue processing
      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify processing continued despite disconnection
      expect(mockDoStub.complete).toHaveBeenCalled()
    })

    it('should handle ready signal timeout', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      mockDoStub.waitForReady.mockResolvedValue({
        timedOut: true,
        disconnected: false,
      })

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify processing continued despite timeout
      expect(mockDoStub.complete).toHaveBeenCalled()
    })
  })

  describe('KV Cache Integration', () => {
    it('should use cached results if available', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      const cachedBooks = [
        { title: 'Cached Book', author: 'Cached Author' },
      ]

      mockEnv.KV_CACHE.get.mockResolvedValue(cachedBooks)

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify Gemini was NOT called (cache hit)
      expect(mockParseCSVWithGemini).not.toHaveBeenCalled()

      // Verify completion with cached data
      expect(mockDoStub.complete).toHaveBeenCalledWith(
        'csv_import',
        expect.objectContaining({
          summary: expect.objectContaining({
            successCount: 1,
          }),
        })
      )
    })

    it('should cache Gemini results for future use', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      mockEnv.KV_CACHE.get.mockResolvedValue(null) // Cache miss

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      // Verify results were cached (7-day TTL)
      const cachePutCall = mockEnv.KV_CACHE.put.mock.calls.find(
        (call) => call[0] === 'mock-cache-key'
      )

      expect(cachePutCall).toBeDefined()
      expect(cachePutCall[2]).toEqual({ expirationTtl: 604800 }) // 7 days
    })
  })

  describe('Issue #145 Regression Test', () => {
    it('should include duration field in completion payload without crashing', async () => {
      const csvText = 'title,author\nBook 1,Author 1'

      const startTime = Date.now()

      await processCSVImportCore(csvText, testJobId, mockDoStub, mockEnv)

      const endTime = Date.now()

      // Verify completion was called (would crash with "startTime is not defined" before fix)
      expect(mockDoStub.complete).toHaveBeenCalled()

      const completionPayload = mockDoStub.complete.mock.calls[0][1]

      // Verify duration exists and is reasonable
      expect(completionPayload.summary.duration).toBeDefined()
      expect(typeof completionPayload.summary.duration).toBe('number')
      expect(completionPayload.summary.duration).toBeGreaterThanOrEqual(0)
      expect(completionPayload.summary.duration).toBeLessThanOrEqual(endTime - startTime + 500) // +500ms buffer
    })
  })
})
