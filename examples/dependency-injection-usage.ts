/**
 * Dependency Injection Usage Examples
 *
 * Shows how to use the new dependency injection system in different scenarios
 */

import type { Env } from '../src/types/env'
import { createServiceContainer, ServiceId, createMockServiceContainer } from '../src/services/service-container'
import { InjectableBookService } from '../src/services/book-service-injectable'

// ========================================================================================
// PRODUCTION USAGE
// ========================================================================================

/**
 * Example: Using the injectable service in a route handler
 */
export async function handleBookSearchRoute(request: Request, env: Env, ctx: ExecutionContext) {
  // Create service container with all dependencies
  const container = createServiceContainer(env)

  // Get the book service
  const bookService = InjectableBookService.fromContainer(container)

  // Use the service (same API as before)
  const isbn = new URL(request.url).searchParams.get('isbn')
  if (!isbn) {
    return new Response('Missing ISBN', { status: 400 })
  }

  const result = await bookService.findBookByISBN(isbn, ctx)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * Example: Backward compatibility - using the original function API
 */
export async function handleBookSearchLegacy(request: Request, env: Env, ctx: ExecutionContext) {
  // This still works exactly as before - no changes needed
  const { findBookByISBN } = await import('../src/services/book-service-injectable')

  const isbn = new URL(request.url).searchParams.get('isbn')
  if (!isbn) {
    return new Response('Missing ISBN', { status: 400 })
  }

  const result = await findBookByISBN(isbn, env, ctx)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// ========================================================================================
// TESTING USAGE
// ========================================================================================

/**
 * Example: Easy testing with dependency injection
 */
export function createTestableBookService(overrides: any = {}) {
  // Create mock container
  const container = createMockServiceContainer()

  // Override specific services if needed
  if (overrides.bookRepository) {
    container.register(ServiceId.BookRepository, overrides.bookRepository)
  }
  if (overrides.enrichmentService) {
    container.register(ServiceId.EnrichmentService, overrides.enrichmentService)
  }

  // Return the service ready for testing
  return InjectableBookService.fromContainer(container)
}

/**
 * Example test scenario: Testing cache hit
 */
export async function testCacheHit() {
  // Arrange
  const mockData = {
    isbn: '9780439708180',
    canonicalMetadata: {
      works: [{ id: '1', title: 'Harry Potter' }],
      editions: [],
      authors: []
    }
  }

  const mockRepository = {
    findByISBN: jest.fn().mockResolvedValue(mockData),
    save: jest.fn(),
    findByTitle: jest.fn(),
    findByAuthor: jest.fn()
  }

  const bookService = createTestableBookService({
    bookRepository: mockRepository
  })

  // Act
  const result = await bookService.findBookByISBN('9780439708180')

  // Assert
  console.log('Cache hit result:', result.cached) // true
  console.log('Repository was called:', mockRepository.findByISBN.mock.calls.length) // 1
}

/**
 * Example test scenario: Testing external API fallback
 */
export async function testExternalApiFallback() {
  // Arrange
  const mockRepository = {
    findByISBN: jest.fn().mockResolvedValue(null), // Cache miss
    save: jest.fn(),
    findByTitle: jest.fn(),
    findByAuthor: jest.fn()
  }

  const mockEnrichmentService = {
    enrichMultipleBooks: jest.fn().mockResolvedValue({
      works: [{ id: '1', title: 'Harry Potter' }],
      editions: [],
      authors: []
    })
  }

  const bookService = createTestableBookService({
    bookRepository: mockRepository,
    enrichmentService: mockEnrichmentService
  })

  // Act
  const result = await bookService.findBookByISBN('9780439708180')

  // Assert
  console.log('External API result:', result.cached) // false
  console.log('Enrichment was called:', mockEnrichmentService.enrichMultipleBooks.mock.calls.length) // 1
}

// ========================================================================================
// ADVANCED USAGE
// ========================================================================================

/**
 * Example: Custom service registration
 */
export function createCustomServiceContainer(env: Env) {
  const container = createServiceContainer(env)

  // Register a custom analytics service
  container.register('Analytics', (container) => ({
    track: (event: string, data: any) => {
      console.log(`[Analytics] ${event}:`, data)
    }
  }))

  // Override the enrichment service with a custom implementation
  container.register(ServiceId.EnrichmentService, (container) => ({
    enrichMultipleBooks: async (request: any, env: Env, options: any, ctx?: ExecutionContext) => {
      // Custom enrichment logic
      const analytics = container.resolve('Analytics')
      analytics.track('enrichment_request', { request, options })

      // Delegate to original implementation
      const { enrichMultipleBooks } = require('../src/services/enrichment')
      return enrichMultipleBooks(request, env, options, ctx)
    }
  }))

  return container
}

/**
 * Example: Using custom container in production
 */
export async function handleBookSearchWithAnalytics(request: Request, env: Env, ctx: ExecutionContext) {
  const container = createCustomServiceContainer(env)
  const bookService = InjectableBookService.fromContainer(container)
  const analytics = container.resolve('Analytics')

  const isbn = new URL(request.url).searchParams.get('isbn')
  if (!isbn) {
    return new Response('Missing ISBN', { status: 400 })
  }

  // Track the search
  analytics.track('book_search', { isbn })

  const result = await bookService.findBookByISBN(isbn, ctx)

  // Track the result
  analytics.track('book_search_result', { isbn, cached: result.cached, source: result.source })

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// ========================================================================================
// PERFORMANCE COMPARISON
// ========================================================================================

/**
 * Example: Performance comparison between old and new systems
 */
export async function performanceComparison(env: Env) {
  const isbn = '9780439708180'

  // Old system (direct imports)
  const start1 = Date.now()
  const { findBookByISBN: oldFindBook } = await import('../src/services/book-service')
  await oldFindBook(isbn, env)
  const oldTime = Date.now() - start1

  // New system (dependency injection)
  const start2 = Date.now()
  const container = createServiceContainer(env)
  const bookService = InjectableBookService.fromContainer(container)
  await bookService.findBookByISBN(isbn)
  const newTime = Date.now() - start2

  console.log('Performance Comparison:')
  console.log(`Old system: ${oldTime}ms`)
  console.log(`New system: ${newTime}ms`)
  console.log(`Difference: ${newTime - oldTime}ms`)
}

// ========================================================================================
// MIGRATION HELPERS
// ========================================================================================

/**
 * Helper: Gradual migration wrapper
 * Allows testing new system alongside old system
 */
export function createMigrationWrapper(env: Env, useNewSystem = false) {
  if (useNewSystem) {
    const container = createServiceContainer(env)
    const bookService = InjectableBookService.fromContainer(container)
    return {
      findBookByISBN: (isbn: string, ctx?: ExecutionContext) =>
        bookService.findBookByISBN(isbn, ctx),
      findBooksByTitle: (title: string, options: any, ctx?: ExecutionContext) =>
        bookService.findBooksByTitle(title, options, ctx),
      findBooksByAuthor: (author: string, options: any, ctx?: ExecutionContext) =>
        bookService.findBooksByAuthor(author, options, ctx)
    }
  } else {
    // Use old system
    const oldService = require('../src/services/book-service')
    return {
      findBookByISBN: (isbn: string, ctx?: ExecutionContext) =>
        oldService.findBookByISBN(isbn, env, ctx),
      findBooksByTitle: (title: string, options: any, ctx?: ExecutionContext) =>
        oldService.findBooksByTitle(title, env, options, ctx),
      findBooksByAuthor: (author: string, options: any, ctx?: ExecutionContext) =>
        oldService.findBooksByAuthor(author, env, options, ctx)
    }
  }
}

/**
 * Example: A/B testing the migration
 */
export async function abTestMigration(request: Request, env: Env, ctx: ExecutionContext) {
  // Use new system for 50% of requests
  const useNewSystem = Math.random() > 0.5
  const bookService = createMigrationWrapper(env, useNewSystem)

  const isbn = new URL(request.url).searchParams.get('isbn')
  if (!isbn) {
    return new Response('Missing ISBN', { status: 400 })
  }

  const result = await bookService.findBookByISBN(isbn, ctx)

  // Add metadata about which system was used
  const response = {
    ...result,
    metadata: {
      ...result.metadata,
      systemUsed: useNewSystem ? 'injectable' : 'legacy'
    }
  }

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  })
}