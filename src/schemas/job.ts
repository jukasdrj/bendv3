/**
 * Job Zod Schemas
 *
 * Schemas for async job management (CSV import, batch enrichment, bookshelf scanning).
 * These define the job initialization, status polling, and results endpoints.
 *
 * @module schemas/job
 */

import { z } from 'zod'
import { BookSchema, EnrichmentDataSchema } from './book.js'
import { ResponseEnvelopeSchema } from './common.js'

// ============================================================================
// JOB INITIALIZATION SCHEMAS
// ============================================================================

/**
 * Job Response Schema
 *
 * Returned when initiating async jobs (CSV import, batch enrichment, bookshelf scan).
 * Includes jobId, auth token, and URLs for status polling and real-time updates.
 */
export const JobResponseSchema = z.object({
  jobId: z.string().uuid(),
  authToken: z.string().uuid(),
  sseUrl: z.string(),
  statusUrl: z.string(),
  websocketUrl: z.string().optional()
}).strict()

// ============================================================================
// JOB STATUS SCHEMAS
// ============================================================================

/**
 * Job Status Schema
 *
 * Current state of an async job.
 */
export const JobStatusSchema = z.enum([
  'initialized',
  'processing',
  'completed',
  'failed',
  'canceled'
])

/**
 * Pipeline Type Schema
 *
 * Type of async processing pipeline.
 */
export const PipelineTypeSchema = z.enum([
  'csv_import',
  'batch_enrichment',
  'ai_scan'
])

/**
 * Job Error Schema
 *
 * Error details for failed jobs.
 */
export const JobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.any()).optional()
}).strict()

/**
 * Job State Schema
 *
 * Current state of an async job, including progress and optional error details.
 * Returned by GET /api/v2/imports/:jobId for status polling and GET /v1/jobs/:jobId/status for unified status.
 *
 * **Fields:**
 * - jobId, status, progress, processedCount, totalCount, pipeline - Core job metadata
 * - startTime - When job started (required)
 * - lastUpdateTime - When job was last updated (V1 legacy endpoint only)
 * - completedTime - When job completed successfully (optional)
 * - failedTime - When job failed (V1 legacy endpoint only)
 * - error - Error details if job failed (optional)
 * - canceled, cancelReason, canceledTime - Cancellation details (V1 legacy endpoint only)
 */
export const JobStateSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  progress: z.number().min(0).max(1), // 0.0 - 1.0
  processedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  pipeline: PipelineTypeSchema.optional(),
  startTime: z.string().datetime(),
  lastUpdateTime: z.string().datetime().optional(),
  completedTime: z.string().datetime().optional(),
  failedTime: z.string().datetime().optional(),
  error: JobErrorSchema.optional(),
  canceled: z.boolean().optional(),
  cancelReason: z.string().optional(),
  canceledTime: z.string().datetime().optional()
}).strict()

/**
 * Job Progress Schema
 *
 * Progress information for ongoing jobs.
 */
export const JobProgressSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  progress: z.number().min(0).max(1), // 0.0 - 1.0
  message: z.string().optional(),
  currentItem: z.number().int().min(0).optional(),
  totalItems: z.number().int().min(0).optional(),
  error: z.string().optional()
}).strict()

// ============================================================================
// CSV IMPORT SCHEMAS
// ============================================================================

/**
 * Parsed Book Schema
 *
 * Book data parsed from CSV file by Gemini AI.
 */
export const ParsedBookSchema = z.object({
  title: z.string(),
  author: z.string(),
  isbn: z.string().optional()
}).strict()

/**
 * CSV Import Results Schema
 *
 * Final results from CSV import job.
 */
export const CSVImportResultsSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  totalRows: z.number().int().min(0),
  booksCreated: z.number().int().min(0),
  enrichmentSucceeded: z.number().int().min(0),
  enrichmentFailed: z.number().int().min(0),
  books: z.array(z.object({
    title: z.string(),
    author: z.string(),
    isbn: z.string().optional(),
    enriched: z.boolean(),
    enrichment: EnrichmentDataSchema.optional()
  })),
  completedAt: z.string().datetime()
}).strict()

// ============================================================================
// BATCH ENRICHMENT SCHEMAS
// ============================================================================

/**
 * Enriched Book Result Schema
 *
 * Result of enriching a single book in a batch operation.
 */
export const EnrichedBookResultSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  isbn: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  enrichment: EnrichmentDataSchema.optional()
}).strict()

/**
 * Batch Enrichment Results Schema
 *
 * Final results from batch enrichment job.
 */
export const BatchEnrichmentResultsSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  totalBooks: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  books: z.array(EnrichedBookResultSchema),
  completedAt: z.string().datetime()
}).strict()

// ============================================================================
// BOOKSHELF SCAN SCHEMAS
// ============================================================================

/**
 * Detected Book Schema
 *
 * Book detected from bookshelf photo by Gemini Vision AI.
 */
export const DetectedBookSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  isbn: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  boundingBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1)
  }).optional(),
  enrichmentStatus: z.enum([
    'pending',
    'success',
    'not_found',
    'error',
    'circuit_open'
  ]).optional(),

  // Flattened edition fields (deprecated)
  coverUrl: z.string().url().optional(),
  publisher: z.string().optional(),
  publicationYear: z.number().int().optional(),

  // Nested enrichment data (current)
  enrichment: EnrichmentDataSchema.optional()
}).strict()

/**
 * Bookshelf Scan Results Schema
 *
 * Final results from bookshelf photo scanning job.
 */
export const BookshelfScanResultsSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  photosProcessed: z.number().int().min(0),
  booksDetected: z.number().int().min(0),
  booksUnique: z.number().int().min(0),
  booksEnriched: z.number().int().min(0),
  books: z.array(DetectedBookSchema),
  completedAt: z.string().datetime()
}).strict()

// ============================================================================
// JOB RESULTS SCHEMAS
// ============================================================================

/**
 * Job Error Detail Schema
 *
 * Represents an individual error that occurred during job processing.
 * Includes row number (for CSV) and ISBN context when available.
 */
export const JobErrorDetailSchema = z.object({
  row: z.number().int().nonnegative().optional(),
  isbn: z.string().optional(),
  error: z.string()
}).strict()

/**
 * Job Results Schema (Pipeline-Agnostic)
 *
 * Unified results format for all job types (CSV import, batch enrichment, bookshelf scan).
 * Returned by GET /api/v2/imports/{jobId}/results.
 *
 * **Important for iOS:**
 * - The `books` array contains FULL canonical book objects
 * - iOS clients MUST parse this array to save books to SwiftData storage
 * - This is the source of truth for persisting imported books
 *
 * **Field Semantics:**
 * - `booksCreated` - Total new books added to user library
 * - `booksUpdated` - Books updated with new metadata (optional, enrichment only)
 * - `duplicatesSkipped` - Books skipped due to duplicate detection (optional)
 * - `enrichmentSucceeded` - Books successfully enriched (optional, enrichment only)
 * - `enrichmentFailed` - Books that failed enrichment (optional, enrichment only)
 * - `errors` - Array of individual import/enrichment failures
 * - `books` - Array of CANONICAL book objects (full metadata from providers)
 */
export const JobResultsSchema = z.object({
  booksCreated: z.number().int().nonnegative(),
  booksUpdated: z.number().int().nonnegative().optional(),
  duplicatesSkipped: z.number().int().nonnegative().optional(),
  enrichmentSucceeded: z.number().int().nonnegative().optional(),
  enrichmentFailed: z.number().int().nonnegative().optional(),
  errors: z.array(JobErrorDetailSchema),
  books: z.array(BookSchema) // Full canonical book objects for iOS SwiftData persistence
}).strict()

/**
 * Job Results Response Envelope
 *
 * Wraps JobResultsSchema in the canonical ResponseEnvelopeSchema
 */
export const JobResultsEnvelopeSchema = ResponseEnvelopeSchema(JobResultsSchema)

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type JobResponse = z.infer<typeof JobResponseSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type PipelineType = z.infer<typeof PipelineTypeSchema>
export type JobError = z.infer<typeof JobErrorSchema>
export type JobState = z.infer<typeof JobStateSchema>
export type JobProgress = z.infer<typeof JobProgressSchema>
export type ParsedBook = z.infer<typeof ParsedBookSchema>
export type CSVImportResults = z.infer<typeof CSVImportResultsSchema>
export type EnrichedBookResult = z.infer<typeof EnrichedBookResultSchema>
export type BatchEnrichmentResults = z.infer<typeof BatchEnrichmentResultsSchema>
export type DetectedBook = z.infer<typeof DetectedBookSchema>
export type BookshelfScanResults = z.infer<typeof BookshelfScanResultsSchema>
export type JobErrorDetail = z.infer<typeof JobErrorDetailSchema>
export type JobResults = z.infer<typeof JobResultsSchema>
