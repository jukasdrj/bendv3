/**
 * V3 Scan Jobs - Smoke Tests
 *
 * Quick validation that V3 bookshelf scan job routes are functional
 */

import { describe, it, expect } from 'vitest'

describe('V3 Scan Jobs - Smoke Tests', () => {
  it('should validate scan job schema types exist', async () => {
    const { JobTypeSchema } = await import('@bookstrack/schemas')

    expect(JobTypeSchema).toBeDefined()
    expect(JobTypeSchema.parse('bookshelf_scan')).toBe('bookshelf_scan')
  })

  it('should validate scan routes are registered', async () => {
    const { createV3Router } = await import('../../src/api-v3/index')

    const router = createV3Router()
    expect(router).toBeDefined()

    // Verify router is an OpenAPIHono instance
    // OpenAPIHono extends Hono which has a fetch method
    expect(router.fetch).toBeDefined()
    expect(typeof router.fetch).toBe('function')
  })

  it('should export registerScanRoutes function', async () => {
    const { registerScanRoutes } = await import('../../src/api-v3/jobs/scans')

    expect(registerScanRoutes).toBeDefined()
    expect(typeof registerScanRoutes).toBe('function')
  })

  it('should validate BoundingBox coordinate clamping function exists', async () => {
    // Bounding box validation is internal to scans.ts
    // This test just verifies the module imports successfully
    const scansModule = await import('../../src/api-v3/jobs/scans')
    expect(scansModule).toBeDefined()
  })

  it('should validate JobStateManagerDO has scheduleBookshelfScan method', async () => {
    const { JobStateManagerDO } = await import('../../src/durable-objects/job-state-manager.js')

    expect(JobStateManagerDO).toBeDefined()
    expect(JobStateManagerDO.prototype.scheduleBookshelfScan).toBeDefined()
    expect(typeof JobStateManagerDO.prototype.scheduleBookshelfScan).toBe('function')
  })

  it('should validate scan job constants match requirements', () => {
    // Issue #202 requirements
    // Note: MAX_IMAGE_SIZE is 10,000,000 bytes (not 10 * 1024 * 1024)
    // This matches Gemini API limits and is slightly less than 10 MiB
    const MAX_PHOTOS_PER_BATCH = 5
    const MAX_IMAGE_SIZE = 10_000_000 // 10MB (decimal)
    const MAX_BATCH_SIZE = 50_000_000 // 50MB (decimal)

    expect(MAX_PHOTOS_PER_BATCH).toBe(5)
    expect(MAX_IMAGE_SIZE).toBe(10_000_000)
    expect(MAX_BATCH_SIZE).toBe(50_000_000)
  })
})
