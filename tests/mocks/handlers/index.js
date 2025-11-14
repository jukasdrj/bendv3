/**
 * MSW Handlers - Central Export
 *
 * Aggregates all MSW mock handlers for external APIs
 * Used by tests/setup.js to initialize the MSW server
 */

import { googleBooksHandlers } from './google-books.js'
import { isbndbHandlers } from './isbndb.js'
import { geminiHandlers } from './gemini.js'

/**
 * All MSW handlers combined
 * Import this in your test setup to mock all external APIs
 */
export const handlers = [
  ...googleBooksHandlers,
  ...isbndbHandlers,
  ...geminiHandlers
]

/**
 * Export individual handler sets for selective mocking
 */
export {
  googleBooksHandlers,
  isbndbHandlers,
  geminiHandlers
}

/**
 * Export factory functions for custom responses
 */
export {
  createGoogleBooksResponse,
  createGoogleBooksHandler
} from './google-books.js'

export {
  createIsbndbResponse,
  createIsbndbHandler
} from './isbndb.js'

export {
  createGeminiResponse,
  createGeminiHandler
} from './gemini.js'
