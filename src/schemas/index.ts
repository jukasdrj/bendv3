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

// Book schemas
export {
  type Author,
  AuthorSchema,
  type Book,
  BookSchema,
  type BookSearchResult,
  BookSearchResultSchema,
  type BoundingBox,
  BoundingBoxSchema,
  type Edition,
  EditionSchema,
  type EnrichmentData,
  EnrichmentDataSchema,
  type Work,
  WorkSchema,
} from './book.js'
// Capabilities endpoint schemas (Phase 1 POC)
export * from './capabilities.js'
// Common schemas
export {
  createErrorResponseSchema,
  createResponseEnvelopeSchema,
  ErrorCodeEnum,
  ErrorDetailsSchema, // Legacy alias
  type ErrorObject,
  ErrorObjectSchema,
  type ErrorResponse,
  ErrorResponseSchema,
  MetadataSchema, // Legacy alias
  ResponseEnvelopeSchema,
  type ResponseMetadata,
  ResponseMetadataSchema,
  type SuccessResponse,
} from './common.js'
// Health endpoint schemas (Sprint 1, Day 5 - OpenAPI Migration)
export {
  type HealthData,
  HealthDataSchema,
  type HealthQuery,
  HealthQuerySchema,
  type HealthResponse,
  type HealthResponseMetadata,
  HealthResponseMetadataSchema,
  HealthResponseSchema,
  type HealthSuccessResponse,
  HealthSuccessResponseSchema,
} from './health.js'
// Job schemas
export {
  type BatchEnrichmentResults,
  BatchEnrichmentResultsSchema,
  type BookshelfScanResults,
  BookshelfScanResultsSchema,
  type CSVImportResults,
  CSVImportResultsSchema,
  type DetectedBook,
  DetectedBookSchema,
  type EnrichedBookResult,
  EnrichedBookResultSchema,
  type JobProgress,
  JobProgressSchema,
  type JobResponse,
  JobResponseSchema,
  type JobStatus,
  JobStatusSchema,
  type ParsedBook,
  ParsedBookSchema,
} from './job.js'
// Search endpoint schemas (Sprint 1, Day 3-4 - OpenAPI Migration)
export {
  type SearchISBNData,
  SearchISBNDataSchema,
  type SearchISBNQuery,
  SearchISBNQuerySchema,
  type SearchISBNResponse,
  SearchISBNResponseSchema,
  type SearchISBNSuccessResponse,
  SearchISBNSuccessResponseSchema,
  type SearchResponseMetadata,
  SearchResponseMetadataSchema,
  type SearchTitleData,
  SearchTitleDataSchema,
  type SearchTitleQuery,
  SearchTitleQuerySchema,
  type SearchTitleResponse,
  SearchTitleResponseSchema,
  type SearchTitleSuccessResponse,
  SearchTitleSuccessResponseSchema,
} from './search.js'
