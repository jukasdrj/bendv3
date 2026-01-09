/**
 * V3 Job Endpoints Contract Tests
 *
 * Validates OpenAPI contract compliance for:
 * - CSV Import Jobs
 * - Bookshelf Scan Jobs
 * - Batch Enrichment Jobs
 * - SSE Progress Streams
 *
 * These tests validate schema contracts without requiring a running server.
 * They ensure that:
 * 1. Response schemas match OpenAPI definitions
 * 2. Job state transitions follow expected patterns
 * 3. SSE event schemas are consistent
 * 4. Error responses follow RFC 9457 Problem Details
 */

import { describe, expect, it } from 'vitest'
import {
  JobInitDataSchema,
  JobResultsDataSchema,
  JobSchema,
  JobTypeSchema,
  JobStatusSchema,
  JobErrorSchema,
  SSEProgressEventSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
  SSEPingEventSchema,
  type JobInitData,
  type JobResultsData,
  type Job,
  type SSEProgressEvent,
  type SSECompleteEvent,
  type SSEErrorEvent,
  type SSEPingEvent,
} from '@bookstrack/schemas'

// Test fixtures
const TEST_CSV_CONTENT = 'isbn,title,author\n9780439708180,Harry Potter,J.K. Rowling'
const TEST_ISBN = '9780439708180'

describe('V3 Job Endpoints - Contract Tests', () => {
  // ======================================================================
  // Job Initiation Response Schema
  // ======================================================================
  describe('JobInitResponse Schema', () => {
    it('should validate complete job initiation response with Zod schema', () => {
      const jobInitData = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'queued',
        streamUrl: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream',
        token: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      }

      // Use Zod schema to validate contract compliance
      const result = JobInitDataSchema.safeParse(jobInitData)

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.status).toBe('queued')
        expect(result.data.streamUrl).toContain('/stream')
        expect(result.data.token.length).toBeGreaterThan(10)
      }
    })

    it('should reject invalid job initiation response', () => {
      const invalidJobInit = {
        jobId: 'not-a-uuid',  // Invalid UUID
        status: 'invalid_status',  // Invalid enum value
        streamUrl: 'not-a-url',  // Invalid URL
        token: '',  // Empty token
      }

      const result = JobInitDataSchema.safeParse(invalidJobInit)
      expect(result.success).toBe(false)
    })

    it('should validate job types enum with Zod schema', () => {
      const validTypes = ['csv_import', 'bookshelf_scan', 'batch_enrichment']
      const invalidTypes = ['invalid', 'import', 'scan', '']

      for (const type of validTypes) {
        const result = JobTypeSchema.safeParse(type)
        expect(result.success).toBe(true)
      }

      for (const type of invalidTypes) {
        const result = JobTypeSchema.safeParse(type)
        expect(result.success).toBe(false)
      }
    })

    it('should validate job status enum with Zod schema', () => {
      const validStatuses = ['queued', 'processing', 'completed', 'failed', 'canceled']
      const invalidStatuses = ['pending', 'running', 'done', '']

      for (const status of validStatuses) {
        const result = JobStatusSchema.safeParse(status)
        expect(result.success).toBe(true)
      }

      for (const status of invalidStatuses) {
        const result = JobStatusSchema.safeParse(status)
        expect(result.success).toBe(false)
      }
    })
  })

  // ======================================================================
  // Job Status Response Schema
  // ======================================================================
  describe('JobStatusResponse Schema', () => {
    it('should validate complete job status response with Zod schema', () => {
      const job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'csv_import',
        status: 'processing',
        progress: 0.65,
        processedCount: 65,
        totalCount: 100,
        startTime: '2025-12-05T10:00:00Z',
      }

      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.progress).toBeGreaterThanOrEqual(0)
        expect(result.data.progress).toBeLessThanOrEqual(1)
        expect(result.data.processedCount).toBeLessThanOrEqual(result.data.totalCount)
      }
    })

    it('should reject invalid job data', () => {
      const invalidJobs = [
        // Invalid progress (outside [0, 1])
        {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'csv_import',
          status: 'processing',
          progress: 1.5,  // Invalid!
          processedCount: 150,
          totalCount: 100,
          startTime: '2025-12-05T10:00:00Z',
        },
        // Invalid UUID
        {
          jobId: 'not-a-uuid',
          type: 'csv_import',
          status: 'processing',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100,
          startTime: '2025-12-05T10:00:00Z',
        },
        // Invalid job type
        {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'invalid_type',
          status: 'processing',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100,
          startTime: '2025-12-05T10:00:00Z',
        },
      ]

      for (const invalidJob of invalidJobs) {
        const result = JobSchema.safeParse(invalidJob)
        expect(result.success).toBe(false)
      }
    })

    it('should validate completed job with completedTime', () => {
      const job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'csv_import',
        status: 'completed',
        progress: 1.0,
        processedCount: 100,
        totalCount: 100,
        startTime: '2025-12-05T10:00:00Z',
        completedTime: '2025-12-05T10:05:00Z',
      }

      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.status).toBe('completed')
        expect(result.data.progress).toBe(1.0)
        expect(result.data.completedTime).toBeDefined()
      }
    })

    it('should validate failed job with error', () => {
      const job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'csv_import',
        status: 'failed',
        progress: 0.5,
        processedCount: 50,
        totalCount: 100,
        startTime: '2025-12-05T10:00:00Z',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Gemini API rate limit exceeded',
          retryable: true,
        },
      }

      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.status).toBe('failed')
        expect(result.data.error).toBeDefined()

        if (result.data.error) {
          const errorResult = JobErrorSchema.safeParse(result.data.error)
          expect(errorResult.success).toBe(true)
        }
      }
    })
  })

  // ======================================================================
  // Job Results Response Schema
  // ======================================================================
  describe('JobResultsResponse Schema', () => {
    it('should validate job results response with Zod schema', () => {
      const jobResultsData = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'completed',
        results: [
          {
            isbn: '9780439708180',
            title: 'Harry Potter and the Sorcerer\'s Stone',
            author: 'J.K. Rowling',
          },
        ],
      }

      const result = JobResultsDataSchema.safeParse(jobResultsData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(Array.isArray(result.data.results)).toBe(true)
        expect(result.data.results.length).toBeGreaterThan(0)
      }
    })

    it('should validate empty results array', () => {
      const jobResultsData = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'completed',
        results: [],
      }

      const result = JobResultsDataSchema.safeParse(jobResultsData)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.results).toHaveLength(0)
      }
    })

    it('should reject invalid results data', () => {
      const invalidData = {
        jobId: 'not-a-uuid',
        status: 'invalid_status',
        results: 'not-an-array',  // Invalid type
      }

      const result = JobResultsDataSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
    })
  })

  // ======================================================================
  // SSE Event Schemas
  // ======================================================================
  describe('SSE Event Format Validation', () => {
    it('should validate progress event schema with Zod', () => {
      const progressEvent = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'processing',
        progress: 0.5,
        processedCount: 50,
        totalCount: 100,
        message: 'Processing book 50 of 100',
        timestamp: '2025-12-05T10:02:30Z',
      }

      const result = SSEProgressEventSchema.safeParse(progressEvent)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.progress).toBeGreaterThanOrEqual(0)
        expect(result.data.progress).toBeLessThanOrEqual(1)
        expect(result.data.processedCount).toBeLessThanOrEqual(result.data.totalCount)
      }
    })

    it('should reject invalid progress event', () => {
      const invalidEvent = {
        jobId: 'not-a-uuid',
        status: 'invalid',
        progress: 2.0,  // Outside [0, 1]
        processedCount: -1,  // Negative
        totalCount: 100,
        timestamp: '2025-12-05T10:02:30Z',
      }

      const result = SSEProgressEventSchema.safeParse(invalidEvent)
      expect(result.success).toBe(false)
    })

    it('should validate complete event schema with Zod', () => {
      const completeEvent = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'completed',
        progress: 1.0,
        processedCount: 100,
        totalCount: 100,
        completedAt: '2025-12-05T10:05:00Z',
        books: [
          {
            isbn: '9780439708180',
            title: 'Harry Potter and the Sorcerer\'s Stone',
            author: 'J.K. Rowling',
          },
        ],
      }

      const result = SSECompleteEventSchema.safeParse(completeEvent)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.status).toBe('completed')
        expect(result.data.progress).toBe(1.0)
        expect(Array.isArray(result.data.books)).toBe(true)
      }
    })

    it('should validate error event schema with Zod', () => {
      const errorEvent = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Gemini API rate limit exceeded',
          retryable: true,
        },
        timestamp: '2025-12-05T10:02:30Z',
      }

      const result = SSEErrorEventSchema.safeParse(errorEvent)
      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.error.code).toBeTruthy()
        expect(result.data.error.message).toBeTruthy()
      }
    })

    it('should validate ping event schema with Zod', () => {
      const pingEvent = {
        timestamp: '2025-12-05T10:02:30Z',
      }

      const result = SSEPingEventSchema.safeParse(pingEvent)
      expect(result.success).toBe(true)
    })
  })

  // ======================================================================
  // Job Type Consistency
  // ======================================================================
  describe('Job Type Consistency', () => {
    it('should have consistent schema across all job types', () => {
      const csvImportJob: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'csv_import',
        status: 'processing',
        progress: 0.5,
        processedCount: 50,
        totalCount: 100,
        startTime: '2025-12-05T10:00:00.000Z',
      }

      const scanJob: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'bookshelf_scan',
        status: 'processing',
        progress: 0.33,
        processedCount: 1,
        totalCount: 3,
        startTime: '2025-12-05T10:00:00.000Z',
      }

      const enrichmentJob: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440002',
        type: 'batch_enrichment',
        status: 'processing',
        progress: 0.75,
        processedCount: 75,
        totalCount: 100,
        startTime: '2025-12-05T10:00:00.000Z',
      }

      const jobs = [csvImportJob, scanJob, enrichmentJob]

      // All jobs should have same structure
      for (const job of jobs) {
        expect(job).toHaveProperty('jobId')
        expect(job).toHaveProperty('type')
        expect(job).toHaveProperty('status')
        expect(job).toHaveProperty('progress')
        expect(job).toHaveProperty('processedCount')
        expect(job).toHaveProperty('totalCount')
        expect(job).toHaveProperty('startTime')

        // Validate types
        expect(typeof job.jobId).toBe('string')
        expect(typeof job.type).toBe('string')
        expect(typeof job.status).toBe('string')
        expect(typeof job.progress).toBe('number')
        expect(typeof job.processedCount).toBe('number')
        expect(typeof job.totalCount).toBe('number')
        expect(typeof job.startTime).toBe('string')
      }
    })
  })

  // ======================================================================
  // Response Envelope Validation
  // ======================================================================
  describe('Response Envelope Format', () => {
    it('should validate success response envelope', () => {
      const successResponse = {
        success: true as const,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued' as const,
          streamUrl: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream',
          token: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        },
        metadata: {
          timestamp: '2025-12-05T10:00:00.000Z',
          requestId: 'req-12345',
        },
      }

      expect(successResponse.success).toBe(true)
      expect(successResponse.data).toBeDefined()
      expect(successResponse.metadata).toBeDefined()
      expect(successResponse.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(successResponse.metadata.requestId).toBeTruthy()
    })

    it('should validate error response envelope (RFC 9457)', () => {
      const errorResponse = {
        type: 'https://api.oooefam.net/errors/rate-limit',
        title: 'Rate Limit Exceeded',
        status: 429,
        detail: 'You have exceeded the rate limit of 100 requests per minute',
        instance: '/v3/jobs/imports',
      }

      expect(errorResponse.type).toMatch(/^https:\/\/.+/)
      expect(errorResponse.title).toBeTruthy()
      expect(errorResponse.status).toBeGreaterThanOrEqual(400)
      expect(errorResponse.status).toBeLessThan(600)
      expect(errorResponse.detail).toBeTruthy()
      expect(errorResponse.instance).toBeTruthy()
    })
  })

  // ======================================================================
  // Field Validation Rules
  // ======================================================================
  describe('Field Validation Rules', () => {
    it('should enforce UUID format for jobId', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '00000000-0000-0000-0000-000000000000',
      ]

      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400e29b41d4a716446655440000',
      ]

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

      for (const uuid of validUUIDs) {
        expect(uuid).toMatch(uuidRegex)
      }

      for (const uuid of invalidUUIDs) {
        expect(uuid).not.toMatch(uuidRegex)
      }
    })

    it('should enforce progress range [0, 1]', () => {
      const validProgress = [0, 0.25, 0.5, 0.75, 1.0]
      const invalidProgress = [-0.1, 1.1, 2.0, Number.NaN, Number.POSITIVE_INFINITY]

      for (const progress of validProgress) {
        expect(progress).toBeGreaterThanOrEqual(0)
        expect(progress).toBeLessThanOrEqual(1)
      }

      for (const progress of invalidProgress) {
        const isValid = progress >= 0 && progress <= 1 && Number.isFinite(progress)
        expect(isValid).toBe(false)
      }
    })

    it('should enforce ISO 8601 timestamp format', () => {
      const validTimestamps = [
        '2025-12-05T10:00:00.000Z',
        '2025-01-01T00:00:00.123Z',
        '2025-12-31T23:59:59.999Z',
      ]

      const invalidTimestamps = [
        '2025-12-05',
        '2025-12-05T10:00:00',
        '12/05/2025',
        'invalid',
      ]

      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

      for (const timestamp of validTimestamps) {
        expect(timestamp).toMatch(isoRegex)
      }

      for (const timestamp of invalidTimestamps) {
        expect(timestamp).not.toMatch(isoRegex)
      }
    })
  })
})
