/**
 * OpenAPI Route Definitions: /api/v2/imports endpoint
 *
 * Sprint 2, Day 11 - OpenAPI Fast Track Migration
 * Endpoint: POST /api/v2/imports - Create CSV/photo import job
 */

import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { ErrorResponseSchema, ResponseEnvelopeSchema } from '../../schemas/common'
import { JobResponseSchema, JobResultsEnvelopeSchema, JobStateSchema } from '../../schemas/job'

/**
 * CSV/Photo Import Request Body Schema
 *
 * Accepts multipart/form-data with a single file field.
 * File can be:
 * - CSV file for book imports (max 8MB)
 * - Image files for bookshelf scanning
 *
 * Note: Multipart/form-data validation is handled by the handler,
 * not by Zod. This schema is for OpenAPI documentation only.
 */
const _ImportRequestSchema = z.object({}).strict()

/**
 * Job Creation Response Envelope
 *
 * Wraps JobResponseSchema in the canonical ResponseEnvelopeSchema
 */
const ImportJobCreationResponseSchema = ResponseEnvelopeSchema(JobResponseSchema)

/**
 * POST /api/v2/imports - Create CSV/Photo Import Job
 *
 * Initiates an asynchronous import job for CSV files or bookshelf photos.
 * Returns a jobId and authentication token for progress tracking via SSE.
 *
 * **Data Flow:**
 * 1. Validate file (format, size)
 * 2. Generate jobId and authToken
 * 3. Schedule async processing via Durable Object alarm
 * 4. Return job initialization response with SSE URL
 *
 * **Processing Details:**
 * - CSV files: Parsed by Gemini AI, books extracted and enriched
 * - Photo files: Analyzed by Gemini Vision, books detected from shelf
 * - Max file size: 8MB (fits 2M token context window)
 * - Processing time: 20-60 seconds typical
 *
 * **Progress Tracking:**
 * - SSE endpoint: `GET /api/v2/imports/{jobId}/stream`
 * - Status polling: `GET /api/v2/imports/{jobId}`
 * - WebSocket support: Deprecated, use SSE instead
 *
 * **Response Format:**
 * ```json
 * {
 *   "data": {
 *     "jobId": "import_abc123",
 *     "authToken": "uuid-token",
 *     "sseUrl": "/api/v2/imports/import_abc123/stream",
 *     "statusUrl": "/api/v2/imports/import_abc123"
 *   },
 *   "metadata": {
 *     "timestamp": "2025-11-28T12:00:00.000Z"
 *   }
 * }
 * ```
 */
export const createImportJobRoute = createRoute({
  method: 'post',
  path: '/api/v2/imports',
  tags: ['Jobs'],
  summary: 'Create CSV/photo import job',
  description: `
Initiate an asynchronous import job for CSV files or bookshelf photos.

**Supported File Types:**
- CSV files: Comma-separated book metadata (Title, Author, ISBN, etc.)
- Image files: Bookshelf photos for book detection via Gemini Vision

**CSV Format:**
- Required columns: \`Title\`, \`Author\`
- Optional: \`ISBN\`, \`Publisher\`, \`Year\`, \`Pages\`
- Max file size: 8MB (2M token limit for Gemini)

**Processing:**
1. File validation (format, size)
2. Async processing via Durable Object
3. Gemini AI parsing (CSV) or vision (photos)
4. Real-time progress via SSE stream

**Response Fields:**
- \`jobId\` - Unique job identifier for tracking
- \`authToken\` - Security token for WebSocket/SSE authentication
- \`sseUrl\` - Server-Sent Events stream for real-time updates (recommended)
- \`statusUrl\` - REST endpoint for status polling

**Progress Tracking:**
\`\`\`bash
# SSE stream (real-time, recommended)
curl -N https://api.oooefam.net/api/v2/imports/import_abc123/stream

# Status polling (HTTP fallback)
curl https://api.oooefam.net/api/v2/imports/import_abc123
\`\`\`

**Rate Limits:**
- 5 requests/minute per IP
- Concurrent jobs: Limited by Durable Object capacity

**Examples:**

\`\`\`bash
# CSV import
curl -X POST https://api.oooefam.net/api/v2/imports \\
  -F "file=@books.csv"

# Photo import
curl -X POST https://api.oooefam.net/api/v2/imports \\
  -F "file=@bookshelf.jpg"
\`\`\`

**Request Format:**
- Content-Type: multipart/form-data
- Field: \`file\` (required) - CSV or image file, max 8MB
  `,
  responses: {
    202: {
      description: 'Import job created successfully',
      content: {
        'application/json': {
          schema: ImportJobCreationResponseSchema,
          example: {
            data: {
              jobId: 'import_abc123def456',
              authToken: '550e8400-e29b-41d4-a716-446655440000',
              sseUrl: '/api/v2/imports/import_abc123def456/stream',
              statusUrl: '/api/v2/imports/import_abc123def456',
            },
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
          },
        },
      },
    },
    400: {
      description: 'Invalid request - missing or invalid file',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'MISSING_PARAMETER',
              message: "No file provided. Expected 'file' field",
              details: {
                suggestion: 'Ensure multipart/form-data request includes file field',
              },
            },
          },
        },
      },
    },
    413: {
      description: 'File too large',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'CSV file too large (max 8MB to fit 2M token limit)',
              details: {
                suggestion:
                  'Try splitting your CSV into smaller files or removing unnecessary columns',
              },
            },
          },
        },
      },
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Maximum 5 requests per minute.',
              retryable: true,
              retryAfterMs: 60000,
            },
          },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request',
            },
          },
        },
      },
    },
  },
})

/**
 * Job State Response Envelope
 *
 * Wraps JobStateSchema in the canonical ResponseEnvelopeSchema
 */
const JobStateResponseSchema = ResponseEnvelopeSchema(JobStateSchema)

/**
 * GET /api/v2/imports/{jobId} - Get Import Job Status
 *
 * Poll the status of an asynchronous import job.
 * Returns current progress, status, and optional error details.
 *
 * **Data Flow:**
 * 1. Extract jobId from URL path
 * 2. Validate jobId as UUID format
 * 3. Get JobStateManagerDO stub
 * 4. Fetch current job state via RPC
 * 5. Return job state with progress metrics
 *
 * **Response Fields:**
 * - `jobId` - UUID identifier for the job
 * - `status` - Current state (initialized|processing|completed|failed|canceled)
 * - `progress` - Decimal progress (0.0-1.0)
 * - `processedCount` - Number of items processed so far
 * - `totalCount` - Total items to process
 * - `pipeline` - Pipeline type (csv_import, batch_enrichment, ai_scan)
 * - `startTime` - ISO8601 timestamp when job started
 * - `completedTime` - ISO8601 timestamp when job completed (optional)
 * - `error` - Error details if job failed (optional)
 *
 * **Progress Interpretation:**
 * - progress: 0.0 = not started
 * - progress: 0.5 = 50% complete
 * - progress: 1.0 = completed
 *
 * **Recommended Usage:**
 * Prefer SSE stream (GET /api/v2/imports/{jobId}/stream) for real-time updates.
 * Use this endpoint as fallback for HTTP polling clients.
 *
 * **Rate Limit:** 30 requests/minute per IP
 *
 * **Response Format:**
 * ```json
 * {
 *   "data": {
 *     "jobId": "import_abc123",
 *     "status": "processing",
 *     "progress": 0.67,
 *     "totalCount": 150,
 *     "processedCount": 100,
 *     "pipeline": "csv_import",
 *     "startTime": "2025-11-28T10:00:00Z",
 *     "completedTime": "2025-11-28T10:05:00Z",
 *     "error": {
 *       "code": "E_CSV_PARSE_FAILED",
 *       "message": "Invalid CSV format at row 31",
 *       "retryable": false,
 *       "details": { "row": 31 }
 *     }
 *   },
 *   "metadata": {
 *     "timestamp": "2025-11-28T12:00:00.000Z",
 *     "source": "job-state-manager-do"
 *   }
 * }
 * ```
 */
export const getImportJobStatusRoute = createRoute({
  method: 'get',
  path: '/api/v2/imports/{jobId}',
  tags: ['Jobs'],
  summary: 'Get import job status',
  description: `
Poll job status for CSV/photo import. Use for HTTP-based polling as fallback.

**Preferred Alternative:** Use SSE stream (\`GET /api/v2/imports/{jobId}/stream\`) for real-time push updates.

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the import job

**Response Fields:**
- \`status\` - Current state: \`initialized\`, \`processing\`, \`completed\`, \`failed\`, \`canceled\`
- \`progress\` - Decimal from 0.0 to 1.0 (0% to 100%)
- \`processedCount\` - Number of items processed so far
- \`totalCount\` - Total items to process
- \`pipeline\` - Type of pipeline: \`csv_import\`, \`batch_enrichment\`, \`ai_scan\`
- \`startTime\` - ISO8601 timestamp when job started
- \`completedTime\` - ISO8601 timestamp when job completed (only for completed/failed)
- \`error\` - Error details if status is \`failed\` (optional, with code and message)

**Polling Strategy:**
\`\`\`javascript
// Poll every 1-2 seconds until status is "completed" or "failed"
const pollStatus = async (jobId) => {
  const response = await fetch(\`/api/v2/imports/\${jobId}\`)
  const { data } = await response.json()

  if (data.status === 'completed' || data.status === 'failed') {
    return data
  }

  // Continue polling...
  await new Promise(r => setTimeout(r, 1000))
  return pollStatus(jobId)
}
\`\`\`

**Rate Limit:** 30 requests/minute per IP (suitable for polling)
  `,
  request: {
    params: z
      .object({
        jobId: z.string().uuid('Invalid jobId format. Expected UUID string'),
      })
      .strict(),
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
              totalCount: 150,
              processedCount: 100,
              pipeline: 'csv_import',
              startTime: '2025-11-28T10:00:00Z',
            },
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
              source: 'job-state-manager-do',
            },
          },
        },
      },
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string',
            },
          },
        },
      },
    },
    404: {
      description: 'Job not found or not initialized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'NOT_FOUND',
              message: 'Import job not found or not initialized',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000',
              },
            },
          },
        },
      },
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Maximum 30 requests per minute.',
              retryable: true,
              retryAfterMs: 2000,
            },
          },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request',
            },
          },
        },
      },
    },
  },
})

/**
 * GET /api/v2/imports/{jobId}/results - Get Import Job Results
 *
 * Retrieve completed job results for CSV/photo imports. Results stored for 1 hour after job completion.
 * Returns full canonical book objects for iOS SwiftData persistence.
 *
 * **Pipeline-Agnostic Design:**
 * Works transparently for all job types:
 * - `csv_import` - CSV file import results
 * - `ai_scan` - Bookshelf photo scanning results
 * - `batch_enrichment` - Batch enrichment job results
 *
 * **Lookup Strategy:**
 * Uses parallel KV lookup across 3 possible keys for optimal performance:
 * - `csv-results:{jobId}`
 * - `scan-results:{jobId}`
 * - `job-results:{jobId}`
 *
 * **iOS Integration:**
 * The `books` array contains FULL canonical book objects with all metadata fields
 * (ISBN, title, authors, publisher, description, etc.). iOS clients MUST parse this
 * array to save books to local SwiftData storage for offline access.
 *
 * **Response Fields:**
 * - `booksCreated` - Total new books added to user library
 * - `booksUpdated` - Books updated with new metadata (optional, enrichment only)
 * - `duplicatesSkipped` - Books skipped due to duplicate detection (optional)
 * - `enrichmentSucceeded` - Books successfully enriched (optional, enrichment only)
 * - `enrichmentFailed` - Books that failed enrichment (optional, enrichment only)
 * - `errors` - Array of individual book failures (row number, ISBN, error message)
 * - `books` - Array of canonical book objects for SwiftData persistence
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
 *         "isbn13": "9780439708180",
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
 *     "ttl": "1 hour"
 *   }
 * }
 * ```
 */
export const getImportJobResultsRoute = createRoute({
  method: 'get',
  path: '/api/v2/imports/{jobId}/results',
  tags: ['Jobs'],
  summary: 'Get import job results',
  description: `
Retrieve completed job results for CSV/photo imports. Results stored for 1 hour after job completion.

**Supported Job Types:**
- \`csv_import\` - CSV file import with Gemini parsing
- \`ai_scan\` - Bookshelf photo scanning with vision detection
- \`batch_enrichment\` - OpenLibrary enrichment operations

**Results Format:**
Returns the results from the completed job, including:
- Import/enrichment statistics (created, updated, failed counts)
- Array of individual errors with row and ISBN context
- Full canonical book objects for all successfully imported books

**iOS Clients (IMPORTANT):**
The \`books\` array contains complete book metadata needed for SwiftData persistence.
Parse this array and save all book objects to local storage for offline access.

**Path Parameters:**
- \`jobId\` (UUID) - Unique identifier for the import job

**Result Storage:**
- Results cached in KV for 1 hour after job completion
- Expires automatically after TTL
- Pipeline-agnostic (works for all job types via parallel key lookup)

**Performance:**
- Parallel KV lookup across 3 possible keys
- P95 latency: <50ms (from KV cache)

**Error Scenarios:**
- 400: Invalid jobId format (not a valid UUID)
- 404: Job results not found or expired (checked 1 hour after completion)
  `,
  request: {
    params: z
      .object({
        jobId: z.string().uuid('Invalid jobId format. Expected UUID string'),
      })
      .strict(),
  },
  responses: {
    200: {
      description: 'Job results retrieved successfully',
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
              errors: [{ row: 15, isbn: '1234567890', error: 'Invalid ISBN' }],
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
                  coverUrl: 'https://...',
                },
              ],
            },
            metadata: {
              cached: true,
              ttl: '1 hour',
            },
          },
        },
      },
    },
    400: {
      description: 'Invalid jobId format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid jobId format. Expected UUID string',
            },
          },
        },
      },
    },
    404: {
      description: 'Job results not found or expired',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'NOT_FOUND',
              message:
                'Job results not found or expired. Results are stored for 1 hour after job completion.',
              details: {
                jobId: '550e8400-e29b-41d4-a716-446655440000',
                ttl: '1 hour',
                checkedKeys: [
                  'csv-results:550e8400-e29b-41d4-a716-446655440000',
                  'scan-results:550e8400-e29b-41d4-a716-446655440000',
                  'job-results:550e8400-e29b-41d4-a716-446655440000',
                ],
              },
            },
          },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            data: null,
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred while processing the request',
            },
          },
        },
      },
    },
  },
})
