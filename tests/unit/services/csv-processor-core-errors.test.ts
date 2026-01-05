/**
 * CSV Processor Core - Error Tracking Tests
 *
 * Phase 4: Comprehensive test coverage for error tracking at all failure points
 * Tests verify that error propagation from Phase 2 works correctly:
 * - Gemini filtering errors (Failure Point #1)
 * - Validation errors (Failure Point #2)
 * - Database save failures (Failure Point #4)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { processCSVCore } from '../../../src/utils/jobs/csv-processor-core'
import type {
  ProcessorDependencies,
  CSVValidationResult,
} from '../../../src/utils/jobs/csv-processor-core'
import type { GeminiParseResult, GeminiValidationError } from '../../../src/providers/gemini-csv-provider'
import type { Env } from '../../../src/types/env'
import type { ProgressReporter } from '../../../src/utils/jobs/progress-reporter'

// Mock BookRepository at module level
vi.mock('../../../src/repositories/book-repository', () => ({
  BookRepository: class {
    save = vi.fn().mockResolvedValue(undefined)
  },
}))

// Mock book-mappers utility
vi.mock('../../../src/utils/transform/book-mappers', async () => {
  const actual = await vi.importActual('../../../src/utils/transform/book-mappers')
  return {
    ...actual,
    mapGeminiCSVBookToBookRecord: vi.fn().mockImplementation((book) => ({
      isbn: book.isbn,
      title: book.title,
      authors: [book.author],
    })),
  }
})

describe('CSV Processor Core - Error Tracking', () => {
  let mockEnv: Env
  let mockProgressReporter: ProgressReporter
  let mockDeps: ProcessorDependencies

  beforeEach(async () => {
    // Mock environment
    mockEnv = {
      CACHE: {
        get: vi.fn().mockResolvedValue(null), // No cache hits
        put: vi.fn().mockResolvedValue(undefined),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      } as unknown as KVNamespace,
      DB: {} as D1Database,
      ENRICHMENT_QUEUE: undefined, // Skip queue for simplicity
      GEMINI_API_KEY: 'test-key',
    } as Env

    // Mock progress reporter
    mockProgressReporter = {
      waitForReady: vi.fn().mockResolvedValue({ timedOut: false, disconnected: false }),
      updateProgress: vi.fn().mockResolvedValue({ success: true }),
      complete: vi.fn().mockResolvedValue({ success: true }),
      sendError: vi.fn().mockResolvedValue({ success: true }),
      initialize: vi.fn().mockResolvedValue({ success: true }),
      setAuthToken: vi.fn().mockResolvedValue({ success: true }),
      isCanceled: vi.fn().mockResolvedValue(false),
      getJobState: vi.fn().mockResolvedValue(null),
    } as unknown as ProgressReporter

    // Default mock dependencies (can be overridden per test)
    mockDeps = {
      validateCSV: vi.fn().mockReturnValue({ valid: true }),
      parseCSVWithGemini: vi.fn(),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Scenario 1: Mixed Valid/Invalid Rows (Critical Priority)
   *
   * Tests that errors from Gemini filtering AND validation are tracked correctly
   * with accurate row numbers and error messages.
   */
  describe('Scenario 1: Mixed Valid/Invalid Rows', () => {
    it('should track errors from mixed valid/invalid CSV rows', async () => {
      const csvInput = `Title,Author,ISBN
"Valid Book","John Smith",9780000000001
"Missing Author","",9780000000002
"","Jane Doe",9780000000003
"Valid Book 2","Alice Johnson",9780000000004`

      // Mock Gemini to return both valid books and errors
      const geminiResult: GeminiParseResult = {
        books: [
          { title: 'Valid Book', author: 'John Smith', isbn: '9780000000001' },
          { title: 'Missing Author', author: '', isbn: '9780000000002' },
          { title: '', author: 'Jane Doe', isbn: '9780000000003' },
          { title: 'Valid Book 2', author: 'Alice Johnson', isbn: '9780000000004' },
        ],
        errors: [], // Gemini doesn't filter these, validation will catch them
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute
      await processCSVCore(csvInput, 'test-job-123', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify results were stored in KV
      const kvPutCalls = vi.mocked(mockEnv.CACHE.put).mock.calls
      const resultsCall = kvPutCalls.find(call => call[0].startsWith('job-results:'))

      expect(resultsCall).toBeDefined()

      const results = JSON.parse(resultsCall![1] as string)

      // Should have 2 valid books created
      expect(results.booksCreated).toBe(2)

      // Should have 2 errors tracked
      expect(results.errors).toHaveLength(2)

      // Verify row numbers and error messages
      const errors = results.errors as Array<{ row?: number; isbn?: string; error: string }>

      // Error 1: Missing author (row 3)
      expect(errors).toContainEqual(
        expect.objectContaining({
          row: 3,
          error: expect.stringContaining('author'),
        })
      )

      // Error 2: Missing title (row 4)
      expect(errors).toContainEqual(
        expect.objectContaining({
          row: 4,
          error: expect.stringContaining('title'),
        })
      )
    })

    it('should handle whitespace-only fields from Gemini filtering', async () => {
      const csvInput = `Title,Author,ISBN
"Valid Book","John Smith",9780000000001
"Whitespace Author","   ",9780000000002`

      // Mock Gemini to filter out whitespace-only author and return error
      const geminiResult: GeminiParseResult = {
        books: [
          { title: 'Valid Book', author: 'John Smith', isbn: '9780000000001' },
        ],
        errors: [
          {
            rowNumber: 3,
            message: 'Whitespace-only author field',
            code: 'whitespace_author',
            field: 'author',
            value: '   ',
            title: 'Whitespace Author',
          },
        ],
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute
      await processCSVCore(csvInput, 'test-job-456', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify results
      const kvPutCalls = vi.mocked(mockEnv.CACHE.put).mock.calls
      const resultsCall = kvPutCalls.find(call => call[0].startsWith('job-results:'))
      const results = JSON.parse(resultsCall![1] as string)

      expect(results.booksCreated).toBe(1)
      expect(results.errors).toHaveLength(1)
      expect(results.errors[0]).toMatchObject({
        row: 3,
        error: expect.stringContaining('Whitespace-only author'),
      })
    })
  })

  /**
   * Scenario 2: Database Save Failures
   *
   * Tests that database save errors are captured with ISBN context,
   * even though row numbers are lost at this stage.
   *
   * NOTE: This test is skipped because BookRepository is dynamically imported
   * inside processCSVCore, making it difficult to mock in unit tests.
   * Database save error tracking is verified through integration tests instead.
   */
  describe('Scenario 2: Database Save Failures', () => {
    it.skip('should track database save failures with ISBN context', async () => {
      // This test would require mocking BookRepository which is dynamically imported
      // Integration tests cover this scenario instead
      // See: tests/integration/csv-import-database-errors.test.ts
    })
  })

  /**
   * Scenario 3: Gemini Filtering Errors
   *
   * Tests that errors from Gemini's validation are properly captured
   * with accurate row numbers from the structured output.
   */
  describe('Scenario 3: Gemini Filtering Errors', () => {
    it('should capture Gemini filtering errors with row numbers', async () => {
      const csvInput = `Title,Author,ISBN
"Valid Book","Author 1",9780000000001
"Book 2","",9780000000002
"Book 3","   ",9780000000003`

      // Mock Gemini to return errors for filtered books
      const geminiResult: GeminiParseResult = {
        books: [
          { title: 'Valid Book', author: 'Author 1', isbn: '9780000000001' },
        ],
        errors: [
          {
            rowNumber: 3,
            message: 'Empty author field',
            code: 'missing_author',
            field: 'author',
            value: '',
            title: 'Book 2',
          },
          {
            rowNumber: 4,
            message: 'Whitespace-only author field',
            code: 'whitespace_author',
            field: 'author',
            value: '   ',
            title: 'Book 3',
          },
        ],
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute
      await processCSVCore(csvInput, 'test-job-gemini', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify results
      const kvPutCalls = vi.mocked(mockEnv.CACHE.put).mock.calls
      const resultsCall = kvPutCalls.find(call => call[0].startsWith('job-results:'))
      const results = JSON.parse(resultsCall![1] as string)

      expect(results.errors).toHaveLength(2)

      // Verify both errors have correct row numbers
      expect(results.errors[0].row).toBe(3)
      expect(results.errors[1].row).toBe(4)

      // Verify error messages contain author field info
      expect(results.errors[0].error).toContain('author')
      expect(results.errors[1].error).toContain('author')
    })
  })

  /**
   * Scenario 4: Duplicate ISBNs (No Errors Expected)
   *
   * Tests that duplicate ISBNs are handled gracefully without
   * creating error entries (duplicates are intentional behavior).
   */
  describe('Scenario 4: Duplicate ISBNs', () => {
    it('should NOT create errors for duplicate ISBNs', async () => {
      const csvWithDuplicates = `Title,Author,ISBN
"Book A","Author 1",9780000000001
"Book B","Author 2",9780000000001
"Book C","Author 3",9780000000002`

      // Mock Gemini to return all books (duplicates included)
      const geminiResult: GeminiParseResult = {
        books: [
          { title: 'Book A', author: 'Author 1', isbn: '9780000000001' },
          { title: 'Book B', author: 'Author 2', isbn: '9780000000001' },
          { title: 'Book C', author: 'Author 3', isbn: '9780000000002' },
        ],
        errors: [],
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute
      await processCSVCore(csvWithDuplicates, 'test-job-dupes', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify results
      const kvPutCalls = vi.mocked(mockEnv.CACHE.put).mock.calls
      const resultsCall = kvPutCalls.find(call => call[0].startsWith('job-results:'))
      const results = JSON.parse(resultsCall![1] as string)

      expect(results.booksCreated).toBe(2)
      expect(results.duplicatesSkipped).toBe(1)

      // Duplicates should NOT be tracked as errors
      expect(results.errors).toHaveLength(0)
    })
  })

  /**
   * Scenario 5: All-Invalid CSV
   *
   * Tests that a CSV with no valid books throws an appropriate error
   * rather than returning an empty result.
   */
  describe('Scenario 5: All-Invalid CSV', () => {
    it('should handle all-invalid CSV gracefully', async () => {
      const csvAllInvalid = `Title,Author,ISBN
"","",9780000000001
"","",9780000000002`

      // Mock Gemini to return no valid books (all filtered)
      const geminiResult: GeminiParseResult = {
        books: [],
        errors: [
          {
            rowNumber: 2,
            message: 'Missing title and author',
            code: 'missing_title',
            field: 'title',
          },
          {
            rowNumber: 3,
            message: 'Missing title and author',
            code: 'missing_title',
            field: 'title',
          },
        ],
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute - processCSVCore catches errors and calls sendError instead of throwing
      await processCSVCore(csvAllInvalid, 'test-job-invalid', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify sendError was called with appropriate error
      expect(mockProgressReporter.sendError).toHaveBeenCalledWith('csv_import', expect.objectContaining({
        code: 'E_CSV_PROCESSING_FAILED',
        message: expect.stringContaining('No valid books found'),
      }))
    })

    it('should call sendError on CSV validation failure', async () => {
      const invalidCSV = 'not a valid csv structure'

      // Mock validator to return invalid
      mockDeps.validateCSV = vi.fn().mockReturnValue({
        valid: false,
        error: 'Missing required column: Title',
      })

      // Execute - processCSVCore catches errors and calls sendError instead of throwing
      await processCSVCore(invalidCSV, 'test-job-bad-csv', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify sendError was called with appropriate error
      expect(mockProgressReporter.sendError).toHaveBeenCalledWith('csv_import', expect.objectContaining({
        code: 'E_CSV_PROCESSING_FAILED',
        message: expect.stringContaining('Invalid CSV'),
      }))
    })
  })

  /**
   * Happy Path: All Valid Rows
   *
   * Tests that successful processing with no errors results in
   * an empty errors array.
   */
  describe('Happy Path: All Valid Rows', () => {
    it('should have empty errors array when all rows are valid', async () => {
      const csvValid = `Title,Author,ISBN
"Book 1","Author 1",9780000000001
"Book 2","Author 2",9780000000002
"Book 3","Author 3",9780000000003`

      // Mock Gemini to return all valid books
      const geminiResult: GeminiParseResult = {
        books: [
          { title: 'Book 1', author: 'Author 1', isbn: '9780000000001' },
          { title: 'Book 2', author: 'Author 2', isbn: '9780000000002' },
          { title: 'Book 3', author: 'Author 3', isbn: '9780000000003' },
        ],
        errors: [],
      }

      mockDeps.parseCSVWithGemini = vi.fn().mockResolvedValue(geminiResult)

      // Execute
      await processCSVCore(csvValid, 'test-job-happy', mockProgressReporter, mockEnv, { deps: mockDeps })

      // Verify results
      const kvPutCalls = vi.mocked(mockEnv.CACHE.put).mock.calls
      const resultsCall = kvPutCalls.find(call => call[0].startsWith('job-results:'))
      const results = JSON.parse(resultsCall![1] as string)

      expect(results.booksCreated).toBe(3)
      expect(results.errors).toHaveLength(0)
      expect(results.duplicatesSkipped).toBe(0)
    })
  })
})
