/**
 * Unit tests for V3 job management schemas
 *
 * Tests Zod validation for all job-related schemas
 */

import { describe, it, expect } from 'vitest'
import {
  JobTypeSchema,
  JobStatusSchema,
  JobErrorSchema,
  JobSchema,
  JobInitResponseSchema,
  JobStatusResponseSchema,
  SSEProgressEventSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
  SSEPingEventSchema,
  type Job,
  type JobError
} from '../../src/api-v3/jobs/schema'

describe('V3 Jobs Schema Validation', () => {
  describe('JobTypeSchema', () => {
    it('should validate csv_import', () => {
      const result = JobTypeSchema.safeParse('csv_import')
      expect(result.success).toBe(true)
    })

    it('should validate bookshelf_scan', () => {
      const result = JobTypeSchema.safeParse('bookshelf_scan')
      expect(result.success).toBe(true)
    })

    it('should validate batch_enrichment', () => {
      const result = JobTypeSchema.safeParse('batch_enrichment')
      expect(result.success).toBe(true)
    })

    it('should reject invalid job type', () => {
      const result = JobTypeSchema.safeParse('invalid_type')
      expect(result.success).toBe(false)
    })
  })

  describe('JobStatusSchema', () => {
    it('should validate queued', () => {
      const result = JobStatusSchema.safeParse('queued')
      expect(result.success).toBe(true)
    })

    it('should validate processing', () => {
      const result = JobStatusSchema.safeParse('processing')
      expect(result.success).toBe(true)
    })

    it('should validate completed', () => {
      const result = JobStatusSchema.safeParse('completed')
      expect(result.success).toBe(true)
    })

    it('should validate failed', () => {
      const result = JobStatusSchema.safeParse('failed')
      expect(result.success).toBe(true)
    })

    it('should validate canceled', () => {
      const result = JobStatusSchema.safeParse('canceled')
      expect(result.success).toBe(true)
    })

    it('should reject invalid status', () => {
      const result = JobStatusSchema.safeParse('invalid_status')
      expect(result.success).toBe(false)
    })
  })

  describe('JobErrorSchema', () => {
    it('should validate error with required fields', () => {
      const error: JobError = {
        code: 'INTERNAL_ERROR',
        message: 'Gemini API rate limit exceeded'
      }
      const result = JobErrorSchema.safeParse(error)
      expect(result.success).toBe(true)
    })

    it('should validate error with retryable flag', () => {
      const error: JobError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryable: true
      }
      const result = JobErrorSchema.safeParse(error)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.retryable).toBe(true)
      }
    })

    it('should reject error missing code', () => {
      const error = {
        message: 'Error message'
      }
      const result = JobErrorSchema.safeParse(error)
      expect(result.success).toBe(false)
    })

    it('should reject error missing message', () => {
      const error = {
        code: 'INTERNAL_ERROR'
      }
      const result = JobErrorSchema.safeParse(error)
      expect(result.success).toBe(false)
    })
  })

  describe('JobSchema', () => {
    const validJob: Job = {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'csv_import',
      status: 'processing',
      progress: 0.65,
      processedCount: 65,
      totalCount: 100,
      startTime: '2025-12-05T10:00:00Z'
    }

    it('should validate complete job object', () => {
      const result = JobSchema.safeParse(validJob)
      expect(result.success).toBe(true)
    })

    it('should validate job with completedTime', () => {
      const job = {
        ...validJob,
        status: 'completed',
        progress: 1.0,
        processedCount: 100,
        completedTime: '2025-12-05T10:05:00Z'
      }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.completedTime).toBe('2025-12-05T10:05:00Z')
      }
    })

    it('should validate job with error', () => {
      const job = {
        ...validJob,
        status: 'failed',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Processing failed',
          retryable: true
        }
      }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.error).toBeDefined()
        expect(result.data.error?.code).toBe('INTERNAL_ERROR')
      }
    })

    it('should reject invalid jobId format', () => {
      const job = { ...validJob, jobId: 'not-a-uuid' }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should reject progress < 0', () => {
      const job = { ...validJob, progress: -0.1 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should reject progress > 1', () => {
      const job = { ...validJob, progress: 1.1 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should reject negative processedCount', () => {
      const job = { ...validJob, processedCount: -1 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should reject negative totalCount', () => {
      const job = { ...validJob, totalCount: -1 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should reject invalid ISO 8601 timestamp', () => {
      const job = { ...validJob, startTime: '2025-12-05 10:00:00' } // Missing 'T'
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(false)
    })

    it('should allow progress 0.0', () => {
      const job = { ...validJob, progress: 0.0, processedCount: 0 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)
    })

    it('should allow progress 1.0', () => {
      const job = { ...validJob, progress: 1.0, processedCount: 100 }
      const result = JobSchema.safeParse(job)
      expect(result.success).toBe(true)
    })
  })

  describe('JobInitResponseSchema', () => {
    it('should validate job initiation response', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          streamUrl: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream',
          token: 'a1b2c3d4e5f6'
        },
        metadata: {
          timestamp: '2025-12-05T10:00:00Z'
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })

    it('should reject response without streamUrl', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          token: 'a1b2c3d4e5f6'
        },
        metadata: {
          timestamp: '2025-12-05T10:00:00Z'
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject response without token', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'queued',
          streamUrl: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream'
        },
        metadata: {
          timestamp: '2025-12-05T10:00:00Z'
        }
      }
      const result = JobInitResponseSchema.safeParse(response)
      expect(result.success).toBe(false)
    })
  })

  describe('JobStatusResponseSchema', () => {
    it('should validate job status response', () => {
      const response = {
        success: true,
        data: {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'csv_import',
          status: 'processing',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100,
          startTime: '2025-12-05T10:00:00Z'
        },
        metadata: {
          timestamp: '2025-12-05T10:02:30Z'
        }
      }
      const result = JobStatusResponseSchema.safeParse(response)
      expect(result.success).toBe(true)
    })
  })

  describe('SSE Event Schemas', () => {
    describe('SSEProgressEventSchema', () => {
      it('should validate progress event', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'processing',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100,
          timestamp: '2025-12-05T10:00:00Z'
        }
        const result = SSEProgressEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })

      it('should reject progress event without timestamp', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'processing',
          progress: 0.5,
          processedCount: 50,
          totalCount: 100
        }
        const result = SSEProgressEventSchema.safeParse(event)
        expect(result.success).toBe(false)
      })
    })

    describe('SSECompleteEventSchema', () => {
      it('should validate complete event with results', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'completed' as const,
          results: [{ isbn: '9780439708180', title: 'Harry Potter' }],
          timestamp: '2025-12-05T10:05:00Z'
        }
        const result = SSECompleteEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })

      it('should validate complete event with empty results', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'completed' as const,
          results: [],
          timestamp: '2025-12-05T10:05:00Z'
        }
        const result = SSECompleteEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })

      it('should reject complete event with non-completed status', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'processing',
          results: [],
          timestamp: '2025-12-05T10:05:00Z'
        }
        const result = SSECompleteEventSchema.safeParse(event)
        expect(result.success).toBe(false)
      })
    })

    describe('SSEErrorEventSchema', () => {
      it('should validate error event', () => {
        const event = {
          jobId: '550e8400-e29b-41d4-a716-446655440000',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Processing failed',
            retryable: true
          },
          timestamp: '2025-12-05T10:05:00Z'
        }
        const result = SSEErrorEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })
    })

    describe('SSEPingEventSchema', () => {
      it('should validate ping event', () => {
        const event = {
          timestamp: '2025-12-05T10:00:00Z'
        }
        const result = SSEPingEventSchema.safeParse(event)
        expect(result.success).toBe(true)
      })

      it('should reject ping event without timestamp', () => {
        const event = {}
        const result = SSEPingEventSchema.safeParse(event)
        expect(result.success).toBe(false)
      })
    })
  })
})
