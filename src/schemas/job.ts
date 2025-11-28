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
// TYPE EXPORTS
// ============================================================================

export type JobResponse = z.infer<typeof JobResponseSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type JobProgress = z.infer<typeof JobProgressSchema>
export type ParsedBook = z.infer<typeof ParsedBookSchema>
export type CSVImportResults = z.infer<typeof CSVImportResultsSchema>
export type EnrichedBookResult = z.infer<typeof EnrichedBookResultSchema>
export type BatchEnrichmentResults = z.infer<typeof BatchEnrichmentResultsSchema>
export type DetectedBook = z.infer<typeof DetectedBookSchema>
export type BookshelfScanResults = z.infer<typeof BookshelfScanResultsSchema>
