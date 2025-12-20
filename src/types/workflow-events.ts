/**
 * Workflow Event Types
 *
 * Issue #71 - LAUNCH BLOCKER
 *
 * Type definitions for workflow progress events sent via WebSocket.
 * Used by both the BookImportWorkflow and WebSocketConnectionDO.
 */

/**
 * Workflow status values
 *
 * These represent the different stages of book import workflow execution.
 */
export type WorkflowStatus =
  | 'started' // Workflow instance created
  | 'validating' // ISBN validation in progress
  | 'fetching_metadata' // Fetching from book providers
  | 'metadata_fetched' // Metadata successfully retrieved
  | 'uploading_cover' // Downloading and uploading cover to R2
  | 'cover_uploaded' // Cover successfully uploaded
  | 'generating_embedding' // Generating text embeddings (optional)
  | 'embedding_generated' // Embeddings created
  | 'saving_to_database' // Saving to D1/KV
  | 'completed' // Workflow finished successfully
  | 'failed' // Workflow failed with error

/**
 * Progress event sent from Workflow to WebSocket clients
 */
export interface WorkflowProgressEvent {
  /** Unique job identifier */
  jobId: string

  /** Current workflow status */
  status: WorkflowStatus

  /** Progress percentage (0-100) */
  progress: number

  /** ISO 8601 timestamp */
  timestamp: string

  /** Additional status-specific data */
  data: WorkflowProgressData
}

/**
 * Status-specific data payloads
 */
export interface WorkflowProgressData {
  /** ISBN being processed */
  isbn?: string

  /** Validated ISBN after cleaning */
  validatedIsbn?: string

  /** Data source being queried */
  source?: 'google_books' | 'openlibrary' | 'isbndb'

  /** Book title (after metadata fetch) */
  title?: string

  /** Book author (after metadata fetch) */
  author?: string

  /** Full metadata object */
  metadata?: BookMetadata

  /** Cover image URL from provider */
  coverUrl?: string

  /** R2 storage key for uploaded cover */
  coverR2Key?: string

  /** Embedding dimensions */
  dimensions?: number

  /** Whether book was saved to D1 (true) or KV fallback (false) */
  savedToD1?: boolean

  /** Error message if status is 'failed' */
  error?: string

  /** Error code if status is 'failed' */
  errorCode?: string

  /** Full completion result */
  result?: BookImportResult
}

/**
 * Book metadata from provider APIs
 */
export interface BookMetadata {
  isbn: string
  title: string
  author: string
  authors?: string[]
  description?: string
  coverUrl?: string
  publicationDate?: string
  publisher?: string
  pageCount?: number
  categories?: string[]
}

/**
 * Final workflow result
 */
export interface BookImportResult {
  success: boolean
  isbn: string
  metadata: BookMetadata
  coverR2Key: string | null
  hasEmbedding: boolean
  savedToD1: boolean
}

/**
 * WebSocket message format for workflow progress
 *
 * This is the exact format sent to connected WebSocket clients.
 */
export interface WorkflowWebSocketMessage {
  /** Message type identifier */
  type: 'workflow_progress'

  /** Job identifier */
  jobId: string

  /** Current workflow status */
  status: WorkflowStatus

  /** Progress percentage (0-100) */
  progress: number

  /** ISO 8601 timestamp */
  timestamp: string

  /** Status-specific data */
  data: WorkflowProgressData
}

/**
 * Type guard to check if a message is a workflow progress event
 */
export function isWorkflowProgressMessage(msg: unknown): msg is WorkflowWebSocketMessage {
  if (!msg || typeof msg !== 'object') return false

  const candidate = msg as Record<string, unknown>

  return (
    candidate.type === 'workflow_progress' &&
    typeof candidate.jobId === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.progress === 'number' &&
    typeof candidate.timestamp === 'string'
  )
}
