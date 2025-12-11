/**
 * Job management schemas for V3 async workflows
 *
 * Supports CSV import, bookshelf scanning, and batch enrichment
 */

import { z } from '@hono/zod-openapi'
import { SuccessResponseSchema } from './response'

/**
 * Job Types
 */
export const JobTypeSchema = z
  .enum(['csv_import', 'bookshelf_scan', 'batch_enrichment'])
  .openapi({
    description: 'Type of background job',
    example: 'csv_import'
  })

export type JobType = z.infer<typeof JobTypeSchema>

/**
 * Job Status
 */
export const JobStatusSchema = z
  .enum(['queued', 'processing', 'completed', 'failed', 'canceled'])
  .openapi({
    description: 'Current job status',
    example: 'processing'
  })

export type JobStatus = z.infer<typeof JobStatusSchema>

/**
 * Job Error Schema
 */
export const JobErrorSchema = z
  .object({
    code: z.string().openapi({
      description: 'Error code',
      example: 'INTERNAL_ERROR'
    }),
    message: z.string().openapi({
      description: 'Human-readable error message',
      example: 'Gemini API rate limit exceeded'
    }),
    retryable: z.boolean().optional().openapi({
      description: 'Whether the job can be retried',
      example: true
    })
  })
  .openapi('JobError')

export type JobError = z.infer<typeof JobErrorSchema>

/**
 * Job Base Schema
 */
export const JobSchema = z
  .object({
    jobId: z.string().uuid().openapi({
      description: 'Unique job identifier',
      example: '550e8400-e29b-41d4-a716-446655440000'
    }),
    type: JobTypeSchema,
    status: JobStatusSchema,
    progress: z.number().min(0).max(1).openapi({
      description: 'Completion progress (0.0 to 1.0)',
      example: 0.65
    }),
    processedCount: z.number().int().min(0).openapi({
      description: 'Number of items processed',
      example: 65
    }),
    totalCount: z.number().int().min(0).openapi({
      description: 'Total items to process',
      example: 100
    }),
    startTime: z.string().datetime().openapi({
      description: 'ISO 8601 start timestamp',
      example: '2025-12-05T10:00:00Z'
    }),
    completedTime: z.string().datetime().optional().openapi({
      description: 'ISO 8601 completion timestamp',
      example: '2025-12-05T10:05:00Z'
    }),
    error: JobErrorSchema.optional()
  })
  .openapi('Job')

export type Job = z.infer<typeof JobSchema>

/**
 * Job Initiation Response Data
 */
export const JobInitDataSchema = z.object({
  jobId: z.string().uuid().openapi({
    description: 'Unique job identifier',
    example: '550e8400-e29b-41d4-a716-446655440000'
  }),
  status: JobStatusSchema,
  streamUrl: z.string().url().openapi({
    description: 'SSE stream endpoint for real-time updates',
    example: 'https://api.oooefam.net/v3/jobs/imports/550e8400-e29b-41d4-a716-446655440000/stream'
  }),
  token: z.string().openapi({
    description: 'Authentication token for SSE stream (valid 1 hour)',
    example: 'a1b2c3d4e5f6...'
  })
})

export type JobInitData = z.infer<typeof JobInitDataSchema>

/**
 * Job Initiation Response
 */
export const JobInitResponseSchema = SuccessResponseSchema(JobInitDataSchema).openapi(
  'JobInitResponse'
)

export type JobInitResponse = z.infer<typeof JobInitResponseSchema>

/**
 * Job Status Response
 */
export const JobStatusResponseSchema = SuccessResponseSchema(JobSchema).openapi('JobStatusResponse')

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>

/**
 * Job Results Response Data
 */
export const JobResultsDataSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  results: z.array(z.unknown()).openapi({
    description: 'Job-specific result data (type depends on job type)'
  })
})

export type JobResultsData = z.infer<typeof JobResultsDataSchema>

/**
 * Job Results Response
 */
export const JobResultsResponseSchema = SuccessResponseSchema(JobResultsDataSchema).openapi(
  'JobResultsResponse'
)

export type JobResultsResponse = z.infer<typeof JobResultsResponseSchema>

/**
 * SSE Event Schemas
 *
 * Server-Sent Event payloads for real-time progress streaming
 */

// Progress event (sent periodically during processing)
export const SSEProgressEventSchema = z
  .object({
    jobId: z.string().uuid(),
    status: JobStatusSchema,
    progress: z.number().min(0).max(1),
    processedCount: z.number().int().min(0),
    totalCount: z.number().int().min(0),
    message: z.string().optional().openapi({
      description: 'Human-readable progress message',
      example: 'Processing photo 1 of 3...'
    }),
    timestamp: z.string().datetime()
  })
  .openapi('SSEProgressEvent')

export type SSEProgressEvent = z.infer<typeof SSEProgressEventSchema>

// Complete event (sent once when job finishes)
export const SSECompleteEventSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.literal('completed'),
    results: z.array(z.unknown()).openapi({
      description: 'Full result data (for iOS persistence)'
    }),
    timestamp: z.string().datetime()
  })
  .openapi('SSECompleteEvent')

export type SSECompleteEvent = z.infer<typeof SSECompleteEventSchema>

// Error event (sent when job fails)
export const SSEErrorEventSchema = z
  .object({
    jobId: z.string().uuid(),
    error: JobErrorSchema,
    timestamp: z.string().datetime()
  })
  .openapi('SSEErrorEvent')

export type SSEErrorEvent = z.infer<typeof SSEErrorEventSchema>

// Ping event (heartbeat to keep connection alive)
export const SSEPingEventSchema = z
  .object({
    timestamp: z.string().datetime()
  })
  .openapi('SSEPingEvent')

export type SSEPingEvent = z.infer<typeof SSEPingEventSchema>
