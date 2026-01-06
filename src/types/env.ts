/**
 * Cloudflare Workers Environment Bindings
 * These types match the bindings defined in wrangler.toml
 */

// Workflow types (Cloudflare Workflows API)
interface WorkflowInstance {
  id: string
}

interface WorkflowStatus {
  status: 'queued' | 'running' | 'paused' | 'complete' | 'errored' | 'terminated' | 'unknown'
  output?: unknown
  error?: string
}

interface WorkflowHandle {
  status(): Promise<WorkflowStatus>
  pause(): Promise<void>
  resume(): Promise<void>
  terminate(): Promise<void>
}

export interface WorkflowBinding<T = unknown> {
  create(options: { params: T }): Promise<WorkflowInstance>
  get(id: string): Promise<WorkflowHandle>
}

export interface Env {
  // Feature Flags
  ENABLE_ALEXANDRIA_RPC?: string // Sprint 1: Hono RPC migration (default: false)

  // Workflow Feature Flags (Issue #71)
  WORKFLOW_ROLLOUT_PERCENT?: string
  ENABLE_WORKFLOW_IMPORT?: string

  // Cache Configuration
  CACHE_HOT_TTL?: string // Optional: defaults to 7200 (2h)
  CACHE_COLD_TTL?: string // Optional: defaults to 1209600 (14d)
  MAX_RESULTS_DEFAULT: string
  RATE_LIMIT_MS: string
  CONCURRENCY_LIMIT: string
  AGGRESSIVE_CACHING: string

  // V3 API Configuration
  V3_MAX_SEARCH_RESULTS?: string // Default: 100
  V3_ENRICH_STREAMING_THRESHOLD?: string // Default: 50
  V3_ENRICH_CONCURRENCY?: string // Default: 50

  // Content-specific Cache TTLs (all optional, see src/config/cache-ttl.js for defaults)
  CACHE_TTL_ISBN?: string // Default: 31536000 (365 days)
  CACHE_TTL_TITLE?: string // Default: 604800 (7 days)
  CACHE_TTL_AUTHOR?: string // Default: 604800 (7 days)
  CACHE_TTL_ENRICHMENT?: string // Default: 15552000 (180 days)
  CACHE_TTL_COVER?: string // Default: 31536000 (365 days)

  // Cache Alert Thresholds (configurable)
  CACHE_ALERT_HIT_RATE_THRESHOLD_CRITICAL?: string
  CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING?: string
  CACHE_ALERT_HOT_CACHE_THRESHOLD_CRITICAL?: string
  CACHE_ALERT_HOT_CACHE_THRESHOLD_WARNING?: string
  CACHE_ALERT_DROP_THRESHOLD_CRITICAL?: string
  CACHE_ALERT_DROP_THRESHOLD_WARNING?: string

  // Logging Configuration
  LOG_LEVEL: string
  ENABLE_PERFORMANCE_LOGGING: string
  ENABLE_CACHE_ANALYTICS: string
  ENABLE_PROVIDER_METRICS: string
  ENABLE_RATE_LIMIT_TRACKING: string
  STRUCTURED_LOGGING: string

  // External API Configuration
  OPENLIBRARY_BASE_URL: string
  USER_AGENT: string

  // AI Configuration
  AI_PROVIDER: string
  MAX_IMAGE_SIZE_MB: string
  REQUEST_TIMEOUT_MS: string
  CONFIDENCE_THRESHOLD: string
  MAX_SCAN_FILE_SIZE: string

  // KV Namespaces
  CACHE: KVNamespace
  RECOMMENDATIONS_CACHE?: KVNamespace // Sprint 3: Weekly recommendations

  // Secrets (from Secrets Store)
  GOOGLE_BOOKS_API_KEY: string
  ISBNDB_API_KEY: string
  GEMINI_API_KEY: string

  // Worker Secrets (via wrangler secret put)
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string

  // Alexandria Integration (Worker Secrets)
  ALEXANDRIA_CLIENT_ID?: string
  ALEXANDRIA_CLIENT_SECRET?: string
  ALEXANDRIA_BASE_URL?: string // Fallback URL for local dev without service bindings
  ALEXANDRIA_WEBHOOK_SECRET?: string

  // Service Bindings (Hono RPC)
  ALEXANDRIA?: Fetcher // Service binding for sub-millisecond RPC to Alexandria worker

  // Alerting Configuration (secrets - use wrangler secret put)
  MAILGUN_API_KEY?: string
  MAILGUN_DOMAIN?: string
  SLACK_WEBHOOK_URL?: string
  ALERT_FROM_EMAIL?: string
  ALERT_TO_EMAIL?: string
  METRICS_API_KEY?: string // API key for /metrics endpoint

  // R2 Buckets
  BOOKSHELF_IMAGES: R2Bucket // User-uploaded bookshelf photos
  BOOK_COVERS: R2Bucket // User-facing CDN cache (separate from Alexandria canonical)

  // Workers AI Binding
  AI: Ai

  // Durable Objects
  PROGRESS_WEBSOCKET_DO: DurableObjectNamespace
  RATE_LIMITER_DO: DurableObjectNamespace<import('../durable-objects/rate-limiter').RateLimiterDO>
  WEBSOCKET_CONNECTION_DO: DurableObjectNamespace
  JOB_STATE_MANAGER_DO: DurableObjectNamespace<import('../durable-objects/job-state-manager').JobStateManagerDO>
  CACHE_METRICS_DO: DurableObjectNamespace<import('../durable-objects/cache-metrics').CacheMetricsDO>
  LATENCY_TEST_DO: DurableObjectNamespace<import('../durable-objects/latency-test-do').LatencyTestDO>

  // Analytics Engine Datasets
  PERFORMANCE_ANALYTICS: AnalyticsEngineDataset
  CACHE_ANALYTICS: AnalyticsEngineDataset
  ANALYTICS_ENGINE: AnalyticsEngineDataset
  AI_ANALYTICS: AnalyticsEngineDataset
  SAMPLING_ANALYTICS: AnalyticsEngineDataset

  // Queues
  AUTHOR_WARMING_QUEUE: Queue
  ENRICHMENT_QUEUE?: Queue // Sprint 3: Async enrichment with vectorization

  // Cloudflare Workflows (Issue #71 - LAUNCH BLOCKER)
  BOOK_IMPORT_WORKFLOW?: WorkflowBinding<import('../workflows/import-book').BookImportInput>

  // D1 Database
  DB?: D1Database

  // Vectorize Index (Sprint 3 - Semantic Search)
  BOOK_VECTORS?: VectorizeIndex
}
