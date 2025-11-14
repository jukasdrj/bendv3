/**
 * MSW Handlers for Google Books API
 *
 * Mocks the Google Books API for testing without hitting real endpoints
 * Prevents rate limiting and ensures deterministic test results
 */

import { http, HttpResponse } from 'msw'

/**
 * Mock response for a successful book search by ISBN
 */
const mockBookResponse = {
  kind: 'books#volumes',
  totalItems: 1,
  items: [
    {
      kind: 'books#volume',
      id: 'zyTCAlFPjgYC',
      etag: 'Qh+xvsGWNR0',
      selfLink: 'https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC',
      volumeInfo: {
        title: 'The Google story',
        authors: ['David A. Vise', 'Mark Malseed'],
        publisher: 'Random House Digital, Inc.',
        publishedDate: '2005-11-15',
        description: 'The definitive, bestselling account of the company that changed the way we work and live...',
        industryIdentifiers: [
          {
            type: 'ISBN_13',
            identifier: '9780739314821'
          },
          {
            type: 'ISBN_10',
            identifier: '0739314823'
          }
        ],
        readingModes: {
          text: false,
          image: true
        },
        pageCount: 207,
        printType: 'BOOK',
        categories: ['Business & Economics'],
        averageRating: 3.5,
        ratingsCount: 136,
        maturityRating: 'NOT_MATURE',
        language: 'en',
        imageLinks: {
          smallThumbnail: 'http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api',
          thumbnail: 'http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api'
        }
      }
    }
  ]
}

/**
 * Mock response for no results found
 */
const mockEmptyResponse = {
  kind: 'books#volumes',
  totalItems: 0
}

/**
 * Google Books API Handlers
 */
export const googleBooksHandlers = [
  // Search by ISBN - success case
  http.get('https://www.googleapis.com/books/v1/volumes', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    // Check for specific test ISBNs
    if (query?.includes('9780739314821') || query?.includes('isbn:9780739314821')) {
      return HttpResponse.json(mockBookResponse)
    }

    // Return empty for unknown ISBNs
    return HttpResponse.json(mockEmptyResponse)
  }),

  // Simulate rate limit error (429)
  http.get('https://www.googleapis.com/books/v1/volumes/rate-limit-test', () => {
    return new HttpResponse(null, {
      status: 429,
      headers: {
        'Retry-After': '60'
      }
    })
  }),

  // Simulate server error (500)
  http.get('https://www.googleapis.com/books/v1/volumes/server-error-test', () => {
    return new HttpResponse(null, { status: 500 })
  }),

  // Simulate network timeout
  http.get('https://www.googleapis.com/books/v1/volumes/timeout-test', async () => {
    await new Promise(resolve => setTimeout(resolve, 30000)) // 30s timeout
    return HttpResponse.json(mockBookResponse)
  })
]

/**
 * Create a custom Google Books response
 * Useful for testing specific scenarios
 */
export function createGoogleBooksResponse(overrides = {}) {
  return {
    ...mockBookResponse,
    items: mockBookResponse.items.map(item => ({
      ...item,
      volumeInfo: {
        ...item.volumeInfo,
        ...overrides
      }
    }))
  }
}

/**
 * Create a custom Google Books handler
 * For one-off test cases that need specific responses
 */
export function createGoogleBooksHandler(isbn, response) {
  return http.get('https://www.googleapis.com/books/v1/volumes', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')

    if (query?.includes(isbn)) {
      return HttpResponse.json(response)
    }

    return HttpResponse.json(mockEmptyResponse)
  })
}
