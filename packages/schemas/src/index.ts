/**
 * @bookstrack/schemas - Shared Zod schemas for BooksTrack API
 *
 * Contract-first API design with runtime validation and TypeScript types.
 * Implements RFC 9457 Problem Details for error responses.
 *
 * @packageDocumentation
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

// Error handling (RFC 9457)
export {
  createProblemDetails,
  ERROR_STATUS_MAP,
  ERROR_TITLE_MAP,
  RETRYABLE_ERRORS,
  type ProblemDetailsOptions
} from './errors'

// Response envelopes and metadata
export {
  DataSourceSchema,
  RateLimitSchema,
  ResponseMetadataSchema,
  LinkSchema,
  SuccessResponseSchema,
  ErrorCodeSchema,
  FieldErrorSchema,
  ErrorResponseSchema,
  type DataSource,
  type RateLimit,
  type ResponseMetadata,
  type Link,
  type ErrorCode,
  type FieldError,
  type ErrorResponse,
  type SuccessResponse
} from './response'

// Book domain
export {
  ProviderSchema,
  BookSchema,
  ISBNSchema,
  type Provider,
  type Book,
  type ISBN
} from './book'

// Search endpoint
export {
  SearchModeSchema,
  PaginationStyleSchema,
  SearchRequestSchema,
  OffsetPaginationSchema,
  CursorPaginationSchema,
  PaginationSchema,
  SearchResultDataSchema,
  SearchResponseSchema,
  type SearchMode,
  type PaginationStyle,
  type SearchRequest,
  type OffsetPagination,
  type CursorPagination,
  type Pagination,
  type SearchResultData,
  type SearchResponse
} from './search'

// Enrich endpoint
export {
  EnrichRequestSchema,
  EnrichedBookSchema,
  EnrichResultDataSchema,
  EnrichResponseSchema,
  type EnrichRequest,
  type EnrichedBook,
  type EnrichResultData,
  type EnrichResponse
} from './enrich'

// Jobs (async workflows)
export {
  JobTypeSchema,
  JobStatusSchema,
  JobErrorSchema,
  JobSchema,
  JobInitDataSchema,
  JobInitResponseSchema,
  JobStatusResponseSchema,
  JobResultsDataSchema,
  JobResultsResponseSchema,
  SSEProgressEventSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
  SSEPingEventSchema,
  type JobType,
  type JobStatus,
  type JobError,
  type Job,
  type JobInitData,
  type JobInitResponse,
  type JobStatusResponse,
  type JobResultsData,
  type JobResultsResponse,
  type SSEProgressEvent,
  type SSECompleteEvent,
  type SSEErrorEvent,
  type SSEPingEvent
} from './jobs'
