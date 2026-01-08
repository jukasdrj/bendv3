// test/csv-import.test.js
import { describe, test, expect, vi } from 'vitest'
import worker from '../src/index.js'

describe('CSV Import V3 API', () => {
  test('POST /v3/jobs/imports returns jobId in V3 format', async () => {
    const formData = new FormData()
    formData.append('file', new File(['Title,Author\nBook1,Author1'], 'test.csv'))

    const request = new Request('http://localhost/v3/jobs/imports', {
      method: 'POST',
      body: formData
    })

    const mockEnv = {
      CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null }))
      },
      BOOK_IMPORT_WORKFLOW: {
        create: vi.fn(async () => ({ id: 'job-123' }))
      },
      JOB_STATE_MANAGER_DO: {
        idFromName: vi.fn(() => 'do-id'),
        get: vi.fn(() => ({
          initializeJobState: vi.fn().mockResolvedValue(undefined),
          setAuthToken: vi.fn().mockResolvedValue(undefined)
        }))
      },
      PERFORMANCE_ANALYTICS: { writeDataPoint: vi.fn(async () => {}) }
    }

    const mockCtx = { waitUntil: vi.fn() }

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data.jobId).toBeDefined()
    expect(body.metadata).toBeDefined()
    expect(body.metadata.timestamp).toBeDefined()
  })

  test('rejects files larger than 10MB', async () => {
    const largeContent = 'x'.repeat(11 * 1024 * 1024)
    const formData = new FormData()
    formData.append('file', new File([largeContent], 'large.csv'))

    const request = new Request('http://localhost/v3/jobs/imports', {
      method: 'POST',
      body: formData
    })

    const mockEnv = {
      CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {})
      },
      PERFORMANCE_ANALYTICS: { writeDataPoint: vi.fn(async () => {}) }
    }

    const mockCtx = { waitUntil: vi.fn() }

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
    expect(body.error.message).toContain('too large')
  })
})
