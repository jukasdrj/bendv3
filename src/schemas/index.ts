/**
 * Zod Schemas - Central Export
 *
 * Re-exports all Zod schemas and types for OpenAPI generation.
 * Import from this module to access all schemas in one place.
 *
 * OpenAPI Migration - Phase 1
 *
 * @module schemas
 */

// Common schemas
export {
  ResponseMetadataSchema,
  MetadataSchema, // Legacy alias
  ResponseEnvelopeSchema,
  createResponseEnvelopeSchema,
  ErrorObjectSchema,
  ErrorDetailsSchema, // Legacy alias
  ErrorResponseSchema,
  createErrorResponseSchema,
  ErrorCodeEnum,
  type ResponseMetadata,
  type ErrorObject,
  type ErrorResponse,
  type SuccessResponse
} from './common.js'

// Book schemas
export {
  BookSchema,
  BoundingBoxSchema,
  WorkSchema,
  EditionSchema,
  AuthorSchema,
  EnrichmentDataSchema,
  BookSearchResultSchema,
  type Book,
  type BoundingBox,
  type Work,
  type Edition,
  type Author,
  type EnrichmentData,
  type BookSearchResult
} from './book.js'

// Job schemas
export {
  JobResponseSchema,
  JobStatusSchema,
  JobProgressSchema,
  ParsedBookSchema,
  CSVImportResultsSchema,
  EnrichedBookResultSchema,
  BatchEnrichmentResultsSchema,
  DetectedBookSchema,
  BookshelfScanResultsSchema,
  type JobResponse,
  type JobStatus,
  type JobProgress,
  type ParsedBook,
  type CSVImportResults,
  type EnrichedBookResult,
  type BatchEnrichmentResults,
  type DetectedBook,
  type BookshelfScanResults
} from './job.js'

// Search endpoint schemas (Sprint 1, Day 3-4 - OpenAPI Migration)
export {
  SearchISBNQuerySchema,
  SearchTitleQuerySchema,
  SearchISBNDataSchema,
  SearchTitleDataSchema,
  SearchResponseMetadataSchema,
  SearchISBNSuccessResponseSchema,
  SearchTitleSuccessResponseSchema,
  SearchISBNResponseSchema,
  SearchTitleResponseSchema,
  type SearchISBNQuery,
  type SearchTitleQuery,
  type SearchISBNData,
  type SearchTitleData,
  type SearchResponseMetadata,
  type SearchISBNSuccessResponse,
  type SearchTitleSuccessResponse,
  type SearchISBNResponse,
  type SearchTitleResponse
} from './search.js'

// Capabilities endpoint schemas (Phase 1 POC)
export * from './capabilities.js'

// Health endpoint schemas (Sprint 1, Day 5 - OpenAPI Migration)
export {
  HealthQuerySchema,
  HealthDataSchema,
  HealthResponseMetadataSchema,
  HealthSuccessResponseSchema,
  HealthResponseSchema,
  type HealthQuery,
  type HealthData,
  type HealthResponseMetadata,
  type HealthSuccessResponse,
  type HealthResponse
} from './health.js'
