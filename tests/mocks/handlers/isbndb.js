/**
 * MSW Handlers for ISBNdb API
 *
 * Mocks the ISBNdb API for testing without hitting real endpoints
 * Prevents rate limiting and ensures deterministic test results
 */

import { http, HttpResponse } from 'msw'

/**
 * Mock response for a successful book lookup by ISBN
 */
const mockBookResponse = {
  book: {
    title: 'Harry Potter and the Philosopher\'s Stone',
    title_long: 'Harry Potter and the Philosopher\'s Stone',
    isbn: '9780439708180',
    isbn13: '9780439708180',
    dewey_decimal: '823.914',
    binding: 'Paperback',
    publisher: 'Scholastic',
    language: 'en',
    date_published: '1998-09-01',
    edition: '1st',
    pages: 320,
    dimensions: 'Height: 7.75 Inches, Length: 5.25 Inches, Weight: 0.62 Pounds, Width: 1.0 Inches',
    overview: 'Harry Potter has never been the star of a Quidditch team...',
    image: 'https://images.isbndb.com/covers/08/18/9780439708180.jpg',
    msrp: '8.99',
    excerpt: 'Chapter One: The Boy Who Lived...',
    synopsys: 'Harry Potter has never been the star of a Quidditch team...',
    authors: ['J.K. Rowling'],
    subjects: ['Fiction', 'Fantasy', 'Magic'],
    reviews: [],
    prices: [
      {
        condition: 'New',
        merchant: 'Amazon',
        merchant_logo: 'https://images.isbndb.com/merchants/amazon.png',
        merchant_logo_offset: {
          x: '0',
          y: '0'
        },
        shipping: 'Free',
        price: '8.99',
        total: '8.99',
        link: 'https://www.amazon.com/dp/0439708184'
      }
    ],
    related: {
      type: 'isbn'
    }
  }
}

/**
 * Mock response for no results found
 */
const mockNotFoundResponse = {
  errorMessage: 'Book not found'
}

/**
 * ISBNdb API Handlers
 */
export const isbndbHandlers = [
  // Get book by ISBN - success case
  http.get('https://api2.isbndb.com/book/:isbn', ({ params }) => {
    const { isbn } = params

    // Check for specific test ISBNs
    if (isbn === '9780439708180' || isbn === '0439708184') {
      return HttpResponse.json(mockBookResponse, {
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '4999',
          'X-RateLimit-Reset': '1640000000'
        }
      })
    }

    // Return not found for unknown ISBNs
    return new HttpResponse(JSON.stringify(mockNotFoundResponse), {
      status: 404,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  // Search books by title
  http.get('https://api2.isbndb.com/books/:title', ({ params }) => {
    const { title } = params

    if (title.toLowerCase().includes('harry potter')) {
      return HttpResponse.json({
        books: [mockBookResponse.book],
        total: 1
      })
    }

    return HttpResponse.json({
      books: [],
      total: 0
    })
  }),

  // Simulate rate limit error (429)
  http.get('https://api2.isbndb.com/book/rate-limit-test', () => {
    return new HttpResponse(JSON.stringify({
      errorMessage: 'Rate limit exceeded'
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '3600',
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1640003600'
      }
    })
  }),

  // Simulate unauthorized error (401)
  http.get('https://api2.isbndb.com/book/unauthorized-test', () => {
    return new HttpResponse(JSON.stringify({
      errorMessage: 'Invalid API key'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  // Simulate server error (500)
  http.get('https://api2.isbndb.com/book/server-error-test', () => {
    return new HttpResponse(JSON.stringify({
      errorMessage: 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  })
]

/**
 * Create a custom ISBNdb book response
 * Useful for testing specific scenarios
 */
export function createIsbndbResponse(overrides = {}) {
  return {
    book: {
      ...mockBookResponse.book,
      ...overrides
    }
  }
}

/**
 * Create a custom ISBNdb handler
 * For one-off test cases that need specific responses
 */
export function createIsbndbHandler(isbn, response) {
  return http.get('https://api2.isbndb.com/book/:isbn', ({ params }) => {
    if (params.isbn === isbn) {
      return HttpResponse.json(response)
    }

    return new HttpResponse(JSON.stringify(mockNotFoundResponse), {
      status: 404
    })
  })
}
