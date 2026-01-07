// test/author-search.test.js
import { describe, test, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index.js'

describe('Author Search V3 API', () => {
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

    // Mock global fetch for external APIs
    global.fetch = vi.fn()
  })

  test('should search for author via V3 search endpoint', async () => {
    // Mock OpenLibrary API responses
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        docs: [{ key: '/authors/OL23919A', name: 'Neil Gaiman' }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entries: [
          { title: 'American Gods', first_publish_year: 2001, key: '/works/OL45804W' },
          { title: 'Coraline', first_publish_year: 2002, key: '/works/OL45805W' }
        ]
      }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/search?q=Neil+Gaiman&type=author',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(Array.isArray(body.data.results)).toBe(true)
  })

  test('should handle pagination with limit and offset', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      docs: [{ key: '/authors/OL2162284A', name: 'Stephen King' }]
    }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/search?q=Stephen+King&type=author&limit=20&offset=0',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.pagination).toBeDefined()
  })

  test('should cache search results', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      docs: [{ key: '/authors/OL23919A', name: 'Neil Gaiman' }]
    }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/search?q=Neil+Gaiman&type=author',
      { method: 'GET' }
    )

    await worker.fetch(request, mockEnv, mockCtx)

    // Verify cache put was called
    expect(mockEnv.CACHE.put).toHaveBeenCalled()
  })

  test('should return 404 for non-existent author', async () => {
    global.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      docs: []
    }), { status: 200 }))

    const request = new Request(
      'http://localhost/v3/books/search?q=NonexistentAuthorXYZ',
      { method: 'GET' }
    )

    const response = await worker.fetch(request, mockEnv, mockCtx)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
  })
})
