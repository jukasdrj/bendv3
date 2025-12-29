/**
 * Service Container - Dependency Injection for BooksTrack Services
 *
 * Implements the service container pattern to manage dependencies and improve testability.
 * Services register themselves with their dependencies, allowing for easy mocking in tests.
 */

import type { Env } from '../types/env'

// ========================================================================================
// SERVICE INTERFACES
// ========================================================================================

export interface IBookRepository {
  findByISBN(isbn: string): Promise<any>
  save(book: any): Promise<void>
  findByTitle(title: string, options?: any): Promise<any[]>
  findByAuthor(author: string, options?: any): Promise<any[]>
}

export interface IEnrichmentService {
  enrichMultipleBooks(request: any, env: Env, options?: any, ctx?: ExecutionContext): Promise<any>
}

export interface ICoverService {
  processBookCover(task: any, env: Env, retries?: number): Promise<any>
  queueCoverProcessing(task: any, env: Env): Promise<void>
}

export interface ICircuitBreaker {
  execute<T>(providerId: string, operation: () => Promise<T>): Promise<T>
  isOpen(providerId: string): Promise<boolean>
}

export interface IDeduplicationService {
  deduplicate<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T>
}

// ========================================================================================
// SERVICE CONTAINER
// ========================================================================================

type ServiceFactory<T = any> = (container: ServiceContainer) => T
type ServiceInstance<T = any> = T | ServiceFactory<T>

export class ServiceContainer {
  private services = new Map<string, ServiceInstance>()
  private singletons = new Map<string, any>()
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  /**
   * Register a service with the container
   *
   * @param name - Service identifier
   * @param factory - Service factory function or instance
   * @param singleton - Whether to cache the instance (default: true)
   */
  register<T>(name: string, factory: ServiceFactory<T> | T, singleton = true): this {
    this.services.set(name, factory)
    if (!singleton) {
      this.singletons.delete(name) // Ensure it's not cached
    }
    return this
  }

  /**
   * Resolve a service from the container
   *
   * @param name - Service identifier
   * @returns Service instance
   */
  resolve<T>(name: string): T {
    // Check if we have a cached singleton
    if (this.singletons.has(name)) {
      return this.singletons.get(name)
    }

    // Get the service factory
    const serviceFactory = this.services.get(name)
    if (!serviceFactory) {
      throw new Error(`Service '${name}' not registered`)
    }

    // Create the service instance
    let instance: T
    if (typeof serviceFactory === 'function') {
      instance = serviceFactory(this)
    } else {
      instance = serviceFactory
    }

    // Cache as singleton if not explicitly disabled
    this.singletons.set(name, instance)
    return instance
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Get the environment bindings
   */
  getEnv(): Env {
    return this.env
  }

  /**
   * Clear all cached singletons (useful for testing)
   */
  clearCache(): void {
    this.singletons.clear()
  }
}

// ========================================================================================
// SERVICE IDENTIFIERS
// ========================================================================================

export const ServiceId = {
  BookRepository: 'BookRepository',
  EnrichmentService: 'EnrichmentService',
  CoverService: 'CoverService',
  CircuitBreaker: 'CircuitBreaker',
  DeduplicationService: 'DeduplicationService',
  BookService: 'BookService',
} as const

// ========================================================================================
// CONTAINER FACTORY
// ========================================================================================

/**
 * Create and configure the service container with all dependencies
 */
export function createServiceContainer(env: Env): ServiceContainer {
  const container = new ServiceContainer(env)

  // Register core services
  container.register(ServiceId.BookRepository, (container) => {
    const { BookRepository } = require('../repositories/book-repository')
    return new BookRepository(container.getEnv())
  })

  container.register(ServiceId.EnrichmentService, (container) => {
    // Import the enrichment function as a service wrapper
    return {
      enrichMultipleBooks: require('./enrichment').enrichMultipleBooks
    }
  })

  container.register(ServiceId.CoverService, (container) => {
    const coverService = require('./alexandria-cover-service')
    return {
      processBookCover: coverService.processBookCover,
      queueCoverProcessing: coverService.queueCoverProcessing,
    }
  })

  container.register(ServiceId.CircuitBreaker, (container) => {
    const { withCircuitBreaker } = require('./circuit-breaker')
    return {
      execute: withCircuitBreaker,
    }
  })

  container.register(ServiceId.DeduplicationService, (container) => {
    const { deduplicate } = require('./request-deduplication')
    return {
      deduplicate,
    }
  })

  return container
}

// ========================================================================================
// UTILITY FUNCTIONS
// ========================================================================================

/**
 * Create a mock service container for testing
 */
export function createMockServiceContainer(env: Partial<Env> = {}): ServiceContainer {
  const mockEnv = {
    CACHE: {} as KVNamespace,
    DB: {} as D1Database,
    ...env
  } as Env

  const container = new ServiceContainer(mockEnv)

  // Register mock services for testing
  container.register(ServiceId.BookRepository, () => ({
    findByISBN: jest.fn(),
    save: jest.fn(),
    findByTitle: jest.fn(),
    findByAuthor: jest.fn(),
  }))

  container.register(ServiceId.EnrichmentService, () => ({
    enrichMultipleBooks: jest.fn(),
  }))

  container.register(ServiceId.CoverService, () => ({
    processBookCover: jest.fn(),
    queueCoverProcessing: jest.fn(),
  }))

  container.register(ServiceId.DeduplicationService, () => ({
    deduplicate: jest.fn((key, fn) => fn()), // Default passthrough
  }))

  return container
}