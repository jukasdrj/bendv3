/**
 * OpenAPI Route Definitions: /v1/jobs endpoint
 *
 * Sprint 2, Day 12-13 - OpenAPI Fast Track Migration
 * Day 12: GET /v1/jobs/{jobId}/status - Unified job status polling (LEGACY)
 * Day 13: GET /v1/scan/results/{jobId} - Retrieve AI scan results (LEGACY)
 *         GET /v1/csv/results/{jobId} - Retrieve CSV import results (LEGACY)
 *         GET /v1/csv/status/{jobId} - CSV import status polling (DEPRECATED)
 *
 * @deprecated All V1 job endpoints are deprecated and will be removed March 1, 2026.
 * Migrate to V2 API:
 * - /v1/jobs/{jobId}/status → /api/v2/imports/{jobId}
 * - /v1/scan/results/{jobId} → /api/v2/scans/{jobId}/results
 * - /v1/csv/results/{jobId} → /api/v2/imports/{jobId}/results
 * - /v1/csv/status/{jobId} → /api/v2/imports/{jobId}
 *
 * @see {@link /docs/V1_SUNSET_PLAN.md}
 * @sunset 2026-03-01
 */

import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { JobStateSchema, JobResultsSchema, JobResultsEnvelopeSchema } from '../../schemas/job'
import { ResponseEnvelopeSchema, ErrorResponseSchema } from '../../schemas/common'

/**
 * Job State Response Envelope
 *
 * Wraps JobStateSchema in the canonical ResponseEnvelopeSchema for V1 legacy endpoint
 */
const JobStateResponseSchema = ResponseEnvelopeSchema(JobStateSchema)

/**
 * GET /v1/jobs/{jobId}/status - Unified Job Status Endpoint (LEGACY)
 *
 * Poll the status of an asynchronous job across all pipeline types (csv_import, batch_enrichment, ai_scan).
 * This is the unified legacy endpoint that returns complete job metadata including cancellation details.
 *
 * **LEGACY NOTICE:**
 * This endpoint is provided for backward compatibility with existing integrations.
 * New integrations should use GET /api/v2/imports/{jobId} instead, which provides
 * a more focused v2 API contract.
 *
 * **Data Flow:**
 * 1. Extract jobId from URL path
 * 2. Validate jobId as UUID format
 * 3. Get JobStateManagerDO stub
 * 4. Fetch current job state via RPC
 * 5. Return job state with all metadata fields
 *
 * **Supported Pipeline Types:**
 * - `csv_import` - CSV file import with Gemini parsing
 * - `batch_enrichment` - OpenLibrary work ID enrichment
 * - `ai_scan` - Bookshelf photo scanning with Gemini Vision
 *
 * **Response Fields:**
 * - `jobId` - UUID identifier for the job
 * - `status` - Current state (initialized|processing|completed|failed|canceled)
 * - `progress` - Decimal progress (0.0-1.0)
 * - `processedCount` - Number of items processed so far
 * - `totalCount` - Total items to process
 * - `pipeline` - Pipeline type (csv_import, batch_enrichment, ai_scan)
 * - `startTime` - ISO8601 timestamp when job started (required)
 * - `lastUpdateTime` - ISO8601 timestamp of last progress update (optional)
 * - `completedTime` - ISO8601 timestamp when job completed (optional)
 * - `failedTime` - ISO8601 timestamp when job failed (optional)
 * - `error` - Error details if job failed (optional)
 * - `canceled` - Boolean indicating if job was canceled (optional)
 * - `cancelReason` - Reason for cancellation (optional)
 * - `canceledTime` - ISO8601 timestamp when job was canceled (optional)
 *
 * **Progress Interpretation:**
 * - progress: 0.0 = not started
 * - progress: 0.5 = 50% complete
 * - progress: 1.0 = completed
 *
 * **Polling Strategy:**
 * Poll this endpoint every 1-2 seconds until status is "completed" or "failed".
 * This endpoint is rate-limited to 30 req/min for polling clients.
 *
 * **Rate Limit:** 30 requests/minute per IP
 *
 * **Response Format:**
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "jobId": "550e8400-e29b-41d4-a716-446655440000",
 *     "status": "processing",
 *     "progress": 0.67,
 *     "totalCount": 100,
 *     "processedCount": 67,
 *     "pipeline": "csv_import",
 *     "startTime": "2025-11-28T10:00:00Z",
 *     "lastUpdateTime": "2025-11-28T10:03:00Z",
 *     "completedTime": "2025-11-28T10:05:00Z",
 *     "failedTime": "2025-11-28T10:04:30Z",
 *     "error": {
 *       "code": "E_CSV_PARSE_FAILED",
 *       "message": "Invalid CSV format",
 *       "retryable": false
 *     },
 *     "canceled": true,
 *     "cancelReason": "User canceled via DELETE /v1/jobs/{jobId}",
 *     "canceledTime": "2025-11-28T10:03:15Z"
 *   },
 *   "metadata": {
 *     "timestamp": "2025-11-28T12:00:00.000Z",
 *     "source": "job-state-manager-do"
 *   }
 * }
 * ```
 */
export const getJobStatusRoute = createRoute({
  method: 'get',
  path: '/v1/jobs/{jobId}/status',
  tags: ['Jobs', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Get unified job status - Use /api/v2/imports/{jobId} instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V2 API instead: \`GET /api/v2/imports/{jobId}\`
>
> **Migration:**
> - V1: \`GET /v1/jobs/{jobId}/status\`
> - V2: \`GET /api/v2/imports/{jobId}\`

Poll job status for all pipeline types (CSV import, batch enrichment, bookshelf scanning).
This is the unified legacy endpoint returning complete job metadata.

**LEGACY ENDPOINT:** New integrations should use \`GET /api/v2/imports/{jobId}\` instead.

**Supported Pipeline Types:**
- \`csv_import\` - CSV file import with Gemini AI
- \`batch_enrichment\` - OpenLibrary enrichment operations
- \`ai_scan\` - Bookshelf photo scanning with vision detection

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the job

**Response Fields:**
- \`status\` - Current state: \`initialized\`, \`processing\`, \`completed\`, \`failed\`, \`canceled\`
- \`progress\` - Decimal from 0.0 to 1.0 (0% to 100%)
- \`processedCount\` - Number of items processed so far
- \`totalCount\` - Total items to process
- \`pipeline\` - Type of pipeline: \`csv_import\`, \`batch_enrichment\`, \`ai_scan\`
- \`startTime\` - ISO8601 timestamp when job started
- \`lastUpdateTime\` - ISO8601 timestamp of last progress update (optional)
- \`completedTime\` - ISO8601 timestamp when job completed (optional)
- \`failedTime\` - ISO8601 timestamp when job failed (optional)
- \`error\` - Error details if status is \`failed\` (optional, with code and message)
- \`canceled\` - Boolean indicating if job was canceled (optional)
- \`cancelReason\` - Reason for cancellation (optional)
- \`canceledTime\` - ISO8601 timestamp when job was canceled (optional)

**Polling Strategy:**
\`\`\`javascript
// Poll every 1-2 seconds until status is "completed" or "failed"
const pollStatus = async (jobId) => {
  const response = await fetch(\`/v1/jobs/\${jobId}/status\`)
  const { data } = await response.json()

  if (data.status === 'completed' || data.status === 'failed') {
    return data
  }

  // Continue polling...
  await new Promise(r => setTimeout(r, 1000))
  return pollStatus(jobId)
}
\`\`\`

**Cancellation Handling:**
If a job was canceled, the response will include \`canceled\`, \`cancelReason\`, and \`canceledTime\` fields:
\`\`\`json
{
  "status": "canceled",
  "canceled": true,
  "cancelReason": "User canceled via DELETE /v1/jobs/{jobId}",
  "canceledTime": "2025-11-28T10:03:15Z"
}
\`\`\`

**Rate Limit:** 30 requests/minute per IP (suitable for polling)
  `,
  request: {
    params: z.object({
      jobId: z.string().uuid('Invalid jobId format. Expected UUID string')
    }).strict()
  },
  responses: {
    200: {
      description: 'Job state retrieved successfully',
      content: {
        'application/json': {
          schema: JobStateResponseSchema,
          example: {
            data: {
              jobId: '550e8400-e29b-41d4-a716-446655440000',
              status: 'processing',
              progress: 0.67,
              totalCount: 100,
              processedCount: 67,
              pipeline: 'csv_import',
              startTime: '2025-11-28T10:00:00Z',
              lastUpdateTime: '2025-11-28T10:03:00Z'
            },
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
              source: 'job-state-manager-do'
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string'
            }
          }
        }
      }
    },
    404: {
      description: 'Job not found or not initialized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'NOT_FOUND',
              message: 'Job not found or not initialized',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000'
              }
            }
          }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Maximum 30 requests per minute.',
              retryable: true,
              retryAfterMs: 2000
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request'
            }
          }
        }
      }
    }
  }
})

/**
 * GET /v1/scan/results/{jobId} - Retrieve AI Scan Results (LEGACY)
 *
 * Fetch completed bookshelf scan results after WebSocket completion.
 * Returns detected books with enrichment data for iOS SwiftData persistence.
 *
 * **LEGACY NOTICE:**
 * This endpoint is provided for backward compatibility. Results are stored
 * for 24 hours after job completion (longer than generic job results' 1-hour TTL).
 * New integrations should use GET /api/v2/imports/{jobId}/results instead.
 *
 * **Data Flow:**
 * 1. Extract jobId from URL path
 * 2. Validate jobId as UUID format
 * 3. Retrieve from KV cache using key: `scan-results:{jobId}`
 * 4. Return results or 404 if expired/not found
 *
 * **iOS Integration:**
 * The `books` array contains FULL canonical book objects with all metadata fields
 * (ISBN, title, authors, publisher, description, etc.). iOS clients MUST parse this
 * array to save books to local SwiftData storage for offline access.
 *
 * **Response Fields:**
 * - `booksCreated` - Total new books added to user library
 * - `booksUpdated` - Books updated with new metadata (optional)
 * - `duplicatesSkipped` - Books skipped due to duplicate detection (optional)
 * - `enrichmentSucceeded` - Books successfully enriched (optional)
 * - `enrichmentFailed` - Books that failed enrichment (optional)
 * - `errors` - Array of individual detection/enrichment failures
 * - `books` - Array of canonical book objects for SwiftData persistence
 *
 * **Result Storage:**
 * - Cached in KV for 24 hours after job completion
 * - Longer TTL than generic job results (1 hour)
 * - Expires automatically after TTL
 *
 * **Response Format:**
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "booksCreated": 25,
 *     "booksUpdated": 0,
 *     "duplicatesSkipped": 3,
 *     "enrichmentSucceeded": 22,
 *     "enrichmentFailed": 3,
 *     "errors": [
 *       {"isbn": "invalid-isbn", "error": "ISBN validation failed"}
 *     ],
 *     "books": [
 *       {
 *         "isbn": "9780439708180",
 *         "title": "Harry Potter and the Sorcerer's Stone",
 *         "authors": ["J.K. Rowling"],
 *         "publisher": "Scholastic",
 *         "publishedDate": "1998-09-01",
 *         "description": "...",
 *         "pageCount": 320,
 *         "categories": ["Fiction", "Fantasy"],
 *         "language": "en",
 *         "coverUrl": "https://..."
 *       }
 *     ]
 *   },
 *   "metadata": {
 *     "cached": true,
 *     "provider": "kv_cache"
 *   }
 * }
 * ```
 */
export const getScanResultsRoute = createRoute({
  method: 'get',
  path: '/v1/scan/results/{jobId}',
  tags: ['Jobs', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Get AI scan results - Use /api/v2/scans/{jobId}/results instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V2 API instead: \`GET /api/v2/scans/{jobId}/results\`
>
> **Migration:**
> - V1: \`GET /v1/scan/results/{jobId}\`
> - V2: \`GET /api/v2/scans/{jobId}/results\`

Retrieve AI bookshelf scan results after WebSocket completion.
Results include detected books with enrichment data.

**LEGACY ENDPOINT:** New integrations should use \`GET /api/v2/scans/{jobId}/results\` instead.

**Result Storage:**
- Results cached in KV for 24 hours after job completion
- Longer TTL than generic job results (1 hour)
- Expires automatically after TTL

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the scan job

**Response Fields:**
- \`booksCreated\` - Total new books added to user library
- \`booksUpdated\` - Books updated with new metadata (optional)
- \`duplicatesSkipped\` - Books skipped due to duplicate detection (optional)
- \`enrichmentSucceeded\` - Books successfully enriched (optional)
- \`enrichmentFailed\` - Books that failed enrichment (optional)
- \`errors\` - Array of individual detection/enrichment failures
- \`books\` - Array of CANONICAL book objects (full metadata from providers)

**iOS Clients (IMPORTANT):**
The \`books\` array contains complete book metadata needed for SwiftData persistence.
Parse this array and save all book objects to local storage for offline access.

**Performance:**
- Single KV lookup
- P95 latency: <50ms (from KV cache)

**Error Scenarios:**
- 400: Invalid jobId format (not a valid UUID)
- 404: Scan results not found or expired (checked 24 hours after completion)
  `,
  request: {
    params: z.object({
      jobId: z.string().uuid('Invalid jobId format. Expected UUID string')
    }).strict()
  },
  responses: {
    200: {
      description: 'Scan results retrieved successfully',
      content: {
        'application/json': {
          schema: JobResultsEnvelopeSchema,
          example: {
            data: {
              booksCreated: 25,
              booksUpdated: 0,
              duplicatesSkipped: 3,
              enrichmentSucceeded: 22,
              enrichmentFailed: 3,
              errors: [
                { isbn: 'invalid-isbn', error: 'ISBN validation failed' }
              ],
              books: [
                {
                  isbn: '9780439708180',
                  isbn13: '9780439708180',
                  title: "Harry Potter and the Sorcerer's Stone",
                  authors: ['J.K. Rowling'],
                  publisher: 'Scholastic',
                  publishedDate: '1998-09-01',
                  description: 'A young wizard discovers his magical powers...',
                  pageCount: 320,
                  categories: ['Fiction', 'Fantasy'],
                  language: 'en',
                  coverUrl: 'https://...'
                }
              ]
            },
            metadata: {
              cached: true,
              provider: 'kv_cache'
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string'
            }
          }
        }
      }
    },
    404: {
      description: 'Scan results not found or expired',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'NOT_FOUND',
              message: 'Scan results not found or expired. Results are stored for 24 hours after job completion.',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000',
                resultsKey: 'scan-results:550e8400-e29b-41d4-a716-446655440000',
                ttl: '24 hours'
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request'
            }
          }
        }
      }
    }
  }
})

/**
 * GET /v1/csv/results/{jobId} - Retrieve CSV Import Results (LEGACY)
 *
 * Fetch completed CSV import results after WebSocket completion.
 * Returns imported books with enrichment data for iOS SwiftData persistence.
 *
 * **LEGACY NOTICE:**
 * This endpoint is provided for backward compatibility. Results are stored
 * for 24 hours after job completion (longer than generic job results' 1-hour TTL).
 * New integrations should use GET /api/v2/imports/{jobId}/results instead.
 *
 * **Data Flow:**
 * 1. Extract jobId from URL path
 * 2. Validate jobId as UUID format
 * 3. Retrieve from KV cache using key: `csv-results:{jobId}`
 * 4. Return results or 404 if expired/not found
 *
 * **iOS Integration:**
 * The `books` array contains FULL canonical book objects with all metadata fields
 * (ISBN, title, authors, publisher, description, etc.). iOS clients MUST parse this
 * array to save books to local SwiftData storage for offline access.
 *
 * **Response Fields:**
 * - `booksCreated` - Total new books added to user library
 * - `booksUpdated` - Books updated with new metadata (optional)
 * - `duplicatesSkipped` - Books skipped due to duplicate detection (optional)
 * - `enrichmentSucceeded` - Books successfully enriched (optional)
 * - `enrichmentFailed` - Books that failed enrichment (optional)
 * - `errors` - Array of individual import/enrichment failures
 * - `books` - Array of canonical book objects for SwiftData persistence
 *
 * **Result Storage:**
 * - Cached in KV for 24 hours after job completion
 * - Longer TTL than generic job results (1 hour)
 * - Expires automatically after TTL
 *
 * **Response Format:**
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "booksCreated": 145,
 *     "booksUpdated": 0,
 *     "duplicatesSkipped": 5,
 *     "enrichmentSucceeded": 140,
 *     "enrichmentFailed": 5,
 *     "errors": [
 *       {"row": 15, "isbn": "1234567890", "error": "Invalid ISBN"}
 *     ],
 *     "books": [
 *       {
 *         "isbn": "9780439708180",
 *         "title": "Harry Potter and the Sorcerer's Stone",
 *         "authors": ["J.K. Rowling"],
 *         "publisher": "Scholastic",
 *         "publishedDate": "1998-09-01",
 *         "description": "...",
 *         "pageCount": 320,
 *         "categories": ["Fiction", "Fantasy"],
 *         "language": "en",
 *         "coverUrl": "https://..."
 *       }
 *     ]
 *   },
 *   "metadata": {
 *     "cached": true,
 *     "provider": "kv_cache"
 *   }
 * }
 * ```
 */
export const getCSVResultsRoute = createRoute({
  method: 'get',
  path: '/v1/csv/results/{jobId}',
  tags: ['Jobs', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Get CSV import results - Use /api/v2/imports/{jobId}/results instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V2 API instead: \`GET /api/v2/imports/{jobId}/results\`
>
> **Migration:**
> - V1: \`GET /v1/csv/results/{jobId}\`
> - V2: \`GET /api/v2/imports/{jobId}/results\`

Retrieve CSV import results after WebSocket completion.
Results include imported books with enrichment data.

**LEGACY ENDPOINT:** New integrations should use \`GET /api/v2/imports/{jobId}/results\` instead.

**Result Storage:**
- Results cached in KV for 24 hours after job completion
- Longer TTL than generic job results (1 hour)
- Expires automatically after TTL

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the CSV import job

**Response Fields:**
- \`booksCreated\` - Total new books added to user library
- \`booksUpdated\` - Books updated with new metadata (optional)
- \`duplicatesSkipped\` - Books skipped due to duplicate detection (optional)
- \`enrichmentSucceeded\` - Books successfully enriched (optional)
- \`enrichmentFailed\` - Books that failed enrichment (optional)
- \`errors\` - Array of individual import/enrichment failures
- \`books\` - Array of CANONICAL book objects (full metadata from providers)

**iOS Clients (IMPORTANT):**
The \`books\` array contains complete book metadata needed for SwiftData persistence.
Parse this array and save all book objects to local storage for offline access.

**Performance:**
- Single KV lookup
- P95 latency: <50ms (from KV cache)

**Error Scenarios:**
- 400: Invalid jobId format (not a valid UUID)
- 404: CSV results not found or expired (checked 24 hours after completion)
  `,
  request: {
    params: z.object({
      jobId: z.string().uuid('Invalid jobId format. Expected UUID string')
    }).strict()
  },
  responses: {
    200: {
      description: 'CSV results retrieved successfully',
      content: {
        'application/json': {
          schema: JobResultsEnvelopeSchema,
          example: {
            data: {
              booksCreated: 145,
              booksUpdated: 0,
              duplicatesSkipped: 5,
              enrichmentSucceeded: 140,
              enrichmentFailed: 5,
              errors: [
                { row: 15, isbn: '1234567890', error: 'Invalid ISBN' }
              ],
              books: [
                {
                  isbn: '9780439708180',
                  isbn13: '9780439708180',
                  title: "Harry Potter and the Sorcerer's Stone",
                  authors: ['J.K. Rowling'],
                  publisher: 'Scholastic',
                  publishedDate: '1998-09-01',
                  description: 'A young wizard discovers his magical powers...',
                  pageCount: 320,
                  categories: ['Fiction', 'Fantasy'],
                  language: 'en',
                  coverUrl: 'https://...'
                }
              ]
            },
            metadata: {
              cached: true,
              provider: 'kv_cache'
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string'
            }
          }
        }
      }
    },
    404: {
      description: 'CSV results not found or expired',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'NOT_FOUND',
              message: 'CSV import results not found or expired. Results are stored for 24 hours after job completion.',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000',
                resultsKey: 'csv-results:550e8400-e29b-41d4-a716-446655440000',
                ttl: '24 hours'
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request'
            }
          }
        }
      }
    }
  }
})

/**
 * GET /v1/csv/status/{jobId} - CSV Import Status Polling (DEPRECATED)
 *
 * Poll the status of a CSV import job with progress tracking.
 *
 * **DEPRECATED NOTICE:**
 * This endpoint is superseded by GET /v1/jobs/{jobId}/status (unified endpoint).
 * New integrations should use GET /api/v2/imports/{jobId} instead, which provides
 * a more focused v2 API contract with improved error handling.
 *
 * **Legacy Support:**
 * This endpoint is provided for backward compatibility with existing CSV-specific integrations.
 * It uses the legacy ProgressDO (getProgressDOStub) instead of the unified JobStateManagerDO.
 *
 * **Data Flow:**
 * 1. Extract jobId from URL path
 * 2. Validate jobId as UUID format
 * 3. Get legacy ProgressDO stub via getProgressDOStub helper
 * 4. Fetch current job state via RPC call
 * 5. Return job state with metadata from durable-object source
 *
 * **Pipeline Type:**
 * This endpoint exclusively handles CSV import jobs (pipeline: "csv_import").
 *
 * **Response Fields:**
 * - `jobId` - UUID identifier for the CSV import job
 * - `status` - Current state (initialized|processing|completed|failed|canceled)
 * - `progress` - Decimal progress (0.0-1.0)
 * - `processedCount` - Number of rows processed so far
 * - `totalCount` - Total rows to process
 * - `pipeline` - Always "csv_import" for this endpoint
 * - `startTime` - ISO8601 timestamp when job started (required)
 * - `lastUpdateTime` - ISO8601 timestamp of last progress update (optional)
 * - `completedTime` - ISO8601 timestamp when job completed (optional)
 * - `failedTime` - ISO8601 timestamp when job failed (optional)
 * - `error` - Error details if job failed (optional)
 * - `canceled` - Boolean indicating if job was canceled (optional)
 * - `cancelReason` - Reason for cancellation (optional)
 * - `canceledTime` - ISO8601 timestamp when job was canceled (optional)
 *
 * **Polling Strategy:**
 * Poll this endpoint every 1-2 seconds until status is "completed" or "failed".
 * This endpoint is rate-limited to 30 req/min for polling clients.
 *
 * **Rate Limit:** 30 requests/minute per IP (suitable for polling clients)
 *
 * **Migration Path:**
 * 1. **Immediate:** Use GET /v1/jobs/{jobId}/status instead (unified for all pipeline types)
 * 2. **Recommended:** Use GET /api/v2/imports/{jobId} for new integrations (v2 API)
 *
 * **Response Format:**
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "jobId": "550e8400-e29b-41d4-a716-446655440000",
 *     "status": "processing",
 *     "progress": 0.45,
 *     "totalCount": 150,
 *     "processedCount": 68,
 *     "pipeline": "csv_import",
 *     "startTime": "2025-11-28T10:00:00Z",
 *     "lastUpdateTime": "2025-11-28T10:03:00Z"
 *   },
 *   "metadata": {
 *     "timestamp": "2025-11-28T12:00:00.000Z",
 *     "source": "durable-object"
 *   }
 * }
 * ```
 */
export const getCSVStatusRoute = createRoute({
  method: 'get',
  path: '/v1/csv/status/{jobId}',
  tags: ['Jobs', 'Deprecated'],
  deprecated: true,
  summary: '[DEPRECATED] Get CSV import status - Use /api/v2/imports/{jobId} instead',
  description: `
> ⚠️ **DEPRECATED**: This endpoint will be removed on **March 1, 2026**.
> Use the V2 API instead: \`GET /api/v2/imports/{jobId}\`
>
> **Migration:**
> - V1: \`GET /v1/csv/status/{jobId}\`
> - V2: \`GET /api/v2/imports/{jobId}\`

Poll CSV import job status with progress tracking.

**DEPRECATED:** This endpoint is superseded by \`GET /v1/jobs/{jobId}/status\`.
New integrations should use \`GET /api/v2/imports/{jobId}\` instead.

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the CSV import job

**Response Fields:**
- \`status\` - Current state: \`initialized\`, \`processing\`, \`completed\`, \`failed\`, \`canceled\`
- \`progress\` - Decimal from 0.0 to 1.0 (0% to 100%)
- \`processedCount\` - Number of CSV rows processed so far
- \`totalCount\` - Total CSV rows to process
- \`pipeline\` - Always \`csv_import\` for this endpoint
- \`startTime\` - ISO8601 timestamp when job started
- \`lastUpdateTime\` - ISO8601 timestamp of last progress update (optional)
- \`completedTime\` - ISO8601 timestamp when job completed (optional)
- \`failedTime\` - ISO8601 timestamp when job failed (optional)
- \`error\` - Error details if status is \`failed\` (optional)
- \`canceled\` - Boolean indicating if job was canceled (optional)
- \`cancelReason\` - Reason for cancellation (optional)
- \`canceledTime\` - ISO8601 timestamp when job was canceled (optional)

**Polling Strategy:**
Poll every 1-2 seconds until status is "completed" or "failed".

**Rate Limit:** 30 requests/minute per IP

**Migration Path:**
1. Use \`GET /v1/jobs/{jobId}/status\` (unified for all pipeline types)
2. Use \`GET /api/v2/imports/{jobId}\` (recommended for new integrations)
  `,
  request: {
    params: z.object({
      jobId: z.string().uuid('Invalid jobId format. Expected UUID string')
    }).strict()
  },
  responses: {
    200: {
      description: 'CSV import job status retrieved successfully',
      content: {
        'application/json': {
          schema: JobStateResponseSchema,
          example: {
            data: {
              jobId: '550e8400-e29b-41d4-a716-446655440000',
              status: 'processing',
              progress: 0.45,
              totalCount: 150,
              processedCount: 68,
              pipeline: 'csv_import',
              startTime: '2025-11-28T10:00:00Z',
              lastUpdateTime: '2025-11-28T10:03:00Z'
            },
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
              source: 'durable-object'
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string'
            }
          }
        }
      }
    },
    404: {
      description: 'CSV import job not found or not initialized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'NOT_FOUND',
              message: 'Job not found or not initialized',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000'
              }
            }
          }
        }
      }
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Maximum 30 requests per minute.',
              retryable: true,
              retryAfterMs: 2000
            }
          }
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z'
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Failed to fetch job status: connection timeout'
            }
          }
        }
      }
    }
  }
})
