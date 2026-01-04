
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processCSVCore, ProcessCSVCoreOptions, ParsedBook, CSVValidationResult } from '../../../src/utils/jobs/csv-processor-core'
import { ProgressReporter } from '../../../src/utils/jobs/progress-reporter'
import type { Env } from '../../../src/types/env'

describe('CSV Processor Core', () => {
  let mockEnv: Env
  let mockProgressReporter: ProgressReporter
  let mockDeps: ProcessCSVCoreOptions['deps']

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
      } as any,
      GEMINI_API_KEY: 'test-key',
      // D1 database mock
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn(),
            first: vi.fn()
          })
        })
      } as any,
      ENRICHMENT_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined)
      } as any
    } as any

    mockProgressReporter = {
      waitForReady: vi.fn().mockResolvedValue({ connected: true }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      sendError: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProgressReporter

    mockDeps = {
      validateCSV: vi.fn().mockReturnValue({ valid: true }),
      parseCSVWithGemini: vi.fn()
    }
  })

  it('should capture validation errors for missing title or author', async () => {
    // Arrange
    const invalidBooks: ParsedBook[] = [
      { title: 'Valid Book', author: 'Valid Author', isbn: '123' },
      { title: '', author: 'Missing Title', isbn: '456' },
      { title: 'Missing Author', author: '', isbn: '789' },
      { title: '  ', author: 'Whitespace Title', isbn: '000' }, // Treated as missing
    ]

    mockDeps!.parseCSVWithGemini = vi.fn().mockResolvedValue(invalidBooks)

    // Act
    await processCSVCore('csv-content', 'job-123', mockProgressReporter, mockEnv, {
      deps: mockDeps
    })

    // Assert
    // Check if CACHE.put was called with the result containing errors
    const putCalls = (mockEnv.CACHE.put as any).mock.calls
    const resultCall = putCalls.find((call: any[]) => call[0] === 'job-results:job-123')

    expect(resultCall).toBeDefined()
    const resultData = JSON.parse(resultCall[1])

    expect(resultData.errors).toHaveLength(3)

    // Row numbers are index + 2 (assuming header)
    expect(resultData.errors[0]).toMatchObject({
      row: 3,
      message: 'Missing title',
      data: { title: '', author: 'Missing Title' }
    })

    expect(resultData.errors[1]).toMatchObject({
      row: 4,
      message: 'Missing author',
      data: { title: 'Missing Author', author: '' }
    })

    expect(resultData.errors[2]).toMatchObject({
      row: 5,
      message: 'Missing title', // "  " trimmed is empty
    })

    expect(resultData.books).toHaveLength(1)
    expect(resultData.books[0].title).toBe('Valid Book')
  })
})
