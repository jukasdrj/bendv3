// test/book-search-integration.test.js
import { describe, test, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index.js'

describe('Book Search V3 API - Title Search', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null }))
      },
      CACHE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      },
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      }
    }
    mockCtx = {
      waitUntil: vi.fn((promise) => promise)
    }

    // Mock fetch for external APIs
    global.fetch = vi.fn()
  })

  test('searches books by title via V3 endpoint', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ volumeInfo: { title: 'Hamlet', authors: ['William Shakespeare'] } }]
    }), {
      headers: { 'Content-Type': 'application/json' }
    }))

    const request = new Request(
      'http://localhost/v3/books/search?q=hamlet&type=title',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.results).toBeDefined()
    expect(Array.isArray(body.data.results)).toBe(true)
  })

  test('caches search results with appropriate TTL', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ volumeInfo: { title: 'Hamlet' } }]
    }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/search?q=hamlet',
      { method: 'GET' }
    )

    await worker.fetch(request, mockEnv, mockCtx)

    expect(mockEnv.CACHE.put).toHaveBeenCalled()
  })

  test('returns cached results on subsequent requests', async () => {
    const cachedData = JSON.stringify({
      success: true,
      data: { results: [{ title: 'Hamlet' }] }
    })

    mockEnv.CACHE.get.mockResolvedValueOnce(cachedData)

    const request = new Request(
      'http://localhost/v3/books/search?q=hamlet',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })
})

describe('Book Search V3 API - ISBN Search', () => {
  let mockEnv
  let mockCtx

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null }))
      },
      CACHE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      },
      PERFORMANCE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      }
    }
    mockCtx = {
      waitUntil: vi.fn((promise) => promise)
    }

    global.fetch = vi.fn()
  })

  test('searches books by ISBN via V3 endpoint', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ volumeInfo: { industryIdentifiers: [{ identifier: '9780743273565' }] } }]
    }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/9780743273565',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })

  test('returns cached book data for ISBN', async () => {
    const cachedBook = JSON.stringify({
      success: true,
      data: { isbn: '9780743273565', title: 'Test Book' }
    })

    mockEnv.CACHE.get.mockResolvedValueOnce(cachedBook)

    const request = new Request(
      'http://localhost/v3/books/9780743273565',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })
})
