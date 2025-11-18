/**
 * Cloudflare Workers Environment Bindings
 * These types match the bindings defined in wrangler.toml
 */

export interface Env {
  // Feature Flags
  ENABLE_HONO_ROUTER?: string
  ENABLE_UNIFIED_ENVELOPE?: string
  ENABLE_REFACTORED_DOS?: string

  // Cache Configuration
  CACHE_HOT_TTL: string
  CACHE_COLD_TTL: string
  MAX_RESULTS_DEFAULT: string
  RATE_LIMIT_MS: string
  CONCURRENCY_LIMIT: string
  AGGRESSIVE_CACHING: string

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
  KV_CACHE: KVNamespace

  // Secrets (from Secrets Store)
  GOOGLE_BOOKS_API_KEY: string
  ISBNDB_API_KEY: string
  GEMINI_API_KEY: string

  // Worker Secrets (via wrangler secret put)
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string

  // R2 Buckets
  API_CACHE_COLD: R2Bucket
  LIBRARY_DATA: R2Bucket
  BOOKSHELF_IMAGES: R2Bucket
  BOOK_COVERS: R2Bucket

  // Workers AI Binding
  AI: Ai

  // Durable Objects
  PROGRESS_WEBSOCKET_DO: DurableObjectNamespace
  RATE_LIMITER_DO: DurableObjectNamespace
  WEBSOCKET_CONNECTION_DO: DurableObjectNamespace
  JOB_STATE_MANAGER_DO: DurableObjectNamespace

  // Analytics Engine Datasets
  PERFORMANCE_ANALYTICS: AnalyticsEngineDataset
  CACHE_ANALYTICS: AnalyticsEngineDataset
  ANALYTICS_ENGINE: AnalyticsEngineDataset
  AI_ANALYTICS: AnalyticsEngineDataset
  SAMPLING_ANALYTICS: AnalyticsEngineDataset

  // Queues
  AUTHOR_WARMING_QUEUE: Queue
}
