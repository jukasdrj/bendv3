/**
 * D1 Query Wrapper with Automatic Metrics Tracking
 *
 * Wraps D1 database operations to automatically record:
 * - Query type (read vs write)
 * - Latency
 * - Errors
 *
 * Usage:
 * ```typescript
 * import { wrapD1Database } from './utils/d1-wrapper'
 *
 * const db = wrapD1Database(env.DB, env)
 * const result = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(isbn).first()
 * ```
 *
 * @module d1-wrapper
 */

import type { Env } from '../types/env.js'

/**
 * SQL keywords that indicate write operations
 */
const WRITE_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE']

/**
 * Query type classification
 */
type QueryType = 'read' | 'write'

/**
 * Latency performance bucket
 */
type LatencyBucket = 'fast' | 'normal' | 'slow' | 'verySlow'

/**
 * D1 metrics data for individual queries
 */
interface QueryMetrics {
  queryType: QueryType
  latencyMs: number
  latencyBucket: LatencyBucket
  error: boolean
  rowCount?: number
  changes?: number
}

/**
 * D1 metrics data for batch operations
 */
interface BatchMetrics {
  latencyMs: number
  error: boolean
  readCount: number
  writeCount: number
  queryCount: number
}

/**
 * Detect if SQL query is a write operation
 *
 * @param sql - SQL query string
 * @returns True if write operation
 */
function isWriteQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase()
  return WRITE_KEYWORDS.some((keyword) => trimmed.startsWith(keyword))
}

/**
 * Categorize latency into performance buckets
 *
 * @param latencyMs - Query latency in milliseconds
 * @returns Latency bucket classification
 */
function getLatencyBucket(latencyMs: number): LatencyBucket {
  if (latencyMs < 10) return 'fast'
  if (latencyMs < 50) return 'normal'
  if (latencyMs < 200) return 'slow'
  return 'verySlow'
}

/**
 * Record D1 metrics to CacheMetricsDO
 *
 * @param env - Worker environment
 * @param metricsData - Metrics to record
 */
async function recordD1Metrics(env: Env, metricsData: QueryMetrics | BatchMetrics): Promise<void> {
  try {
    // Get or create metrics Durable Object stub
    const id = env.CACHE_METRICS_DO.idFromName('global')
    const stub = env.CACHE_METRICS_DO.get(id)

    // Record metrics via RPC
    await stub.recordD1Metrics(metricsData)
  } catch (error) {
    const err = error as Error
    // CRITICAL: Structured logging for observability degradation
    console.error('[D1 Wrapper] Metrics recording failed - observability degraded', {
      errorId: 'D1_METRICS_FAILED',
      error: err.message,
      metricsType: 'queryType' in metricsData ? metricsData.queryType : 'batch',
      timestamp: new Date().toISOString(),
      // Don't log full metricsData to avoid sensitive data exposure
      hasReadCount: 'readCount' in metricsData,
      hasWriteCount: 'writeCount' in metricsData,
    })

    // Metrics recording failures should not break the application
    // but we need to be aware that observability is degraded
  }
}

/**
 * Wrapped D1 prepared statement interface
 */
export interface WrappedStatement<T = unknown> {
  queryType: QueryType
  bind(...values: unknown[]): WrappedStatement<T>
  first<R = T>(): Promise<R | null>
  all<R = T>(): Promise<D1Result<R>>
  run(): Promise<D1Result>
  raw(): D1PreparedStatement
  getInner(): D1PreparedStatement
}

/**
 * Wrapped D1 database interface
 */
export interface WrappedDatabase {
  prepare<T = unknown>(sql: string): WrappedStatement<T>
  batch(statements: (WrappedStatement | D1PreparedStatement)[]): Promise<D1Result[]>
  raw(): D1Database
}

/**
 * Wrap a D1 prepared statement with metrics tracking
 *
 * @param stmt - D1 prepared statement
 * @param env - Worker environment
 * @param sql - SQL query string
 * @returns Wrapped statement with metrics
 */
function wrapStatement<T = unknown>(
  stmt: D1PreparedStatement,
  env: Env,
  sql: string,
): WrappedStatement<T> {
  const queryType: QueryType = isWriteQuery(sql) ? 'write' : 'read'

  return {
    // Expose queryType for batch processing
    queryType,

    /**
     * Bind parameters to the prepared statement
     *
     * @param values - Parameter values
     * @returns Wrapped statement
     */
    bind(...values: unknown[]): WrappedStatement<T> {
      const boundStmt = stmt.bind(...values)
      return wrapStatement<T>(boundStmt, env, sql)
    },

    /**
     * Execute query and return first row
     *
     * @returns First row or null
     */
    async first<R = T>(): Promise<R | null> {
      const startTime = Date.now()

      try {
        const result = await stmt.first<R>()
        const latencyMs = Date.now() - startTime

        // Record successful query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: false,
        })

        return result
      } catch (err) {
        const latencyMs = Date.now() - startTime

        // Record failed query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: true,
        })

        throw err
      }
    },

    /**
     * Execute query and return all rows
     *
     * @returns Result object with results array
     */
    async all<R = T>(): Promise<D1Result<R>> {
      const startTime = Date.now()

      try {
        const result = await stmt.all<R>()
        const latencyMs = Date.now() - startTime

        // Record successful query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: false,
          rowCount: result.results?.length || 0,
        })

        return result
      } catch (err) {
        const latencyMs = Date.now() - startTime

        // Record failed query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: true,
        })

        throw err
      }
    },

    /**
     * Execute query without returning results (for writes)
     *
     * @returns Execution result
     */
    async run(): Promise<D1Result> {
      const startTime = Date.now()

      try {
        const result = await stmt.run()
        const latencyMs = Date.now() - startTime

        // Record successful query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: false,
          changes: result.meta?.changes || 0,
        })

        return result
      } catch (err) {
        const latencyMs = Date.now() - startTime

        // Record failed query metrics
        await recordD1Metrics(env, {
          queryType,
          latencyMs,
          latencyBucket: getLatencyBucket(latencyMs),
          error: true,
        })

        throw err
      }
    },

    /**
     * Get raw statement for advanced operations
     *
     * @returns Unwrapped D1 statement
     */
    raw(): D1PreparedStatement {
      return stmt
    },

    /**
     * Get the underlying D1 statement safely (avoids conflict with D1's raw() execution method)
     *
     * @returns Unwrapped D1 statement
     */
    getInner(): D1PreparedStatement {
      return stmt
    },
  }
}

/**
 * Wrap a D1 database instance with automatic metrics tracking
 *
 * @param db - D1 database instance (env.DB)
 * @param env - Worker environment
 * @returns Wrapped database with metrics tracking
 *
 * @example
 * ```typescript
 * // In your handler:
 * const db = wrapD1Database(env.DB, env)
 *
 * // Use normally - metrics are automatic:
 * const book = await db.prepare('SELECT * FROM books WHERE isbn = ?')
 *   .bind('9780439708180')
 *   .first()
 * ```
 */
export function wrapD1Database(db: D1Database, env: Env): WrappedDatabase {
  // Skip wrapping if metrics DO not available (testing/local dev)
  if (!env.CACHE_METRICS_DO) {
    console.warn('[D1 Wrapper] CACHE_METRICS_DO not available, skipping metrics')
    return db as unknown as WrappedDatabase
  }

  return {
    /**
     * Prepare a SQL statement with metrics tracking
     *
     * @param sql - SQL query
     * @returns Wrapped prepared statement
     */
    prepare<T = unknown>(sql: string): WrappedStatement<T> {
      const stmt = db.prepare(sql)
      return wrapStatement<T>(stmt, env, sql)
    },

    /**
     * Execute a batch of statements with metrics tracking
     *
     * @param statements - Array of prepared statements (wrapped or raw)
     * @returns Results array
     */
    async batch(statements: (WrappedStatement | D1PreparedStatement)[]): Promise<D1Result[]> {
      const startTime = Date.now()
      let readCount = 0
      let writeCount = 0

      // Unwrap statements and count query types
      const rawStatements = statements.map((stmt) => {
        // Validate statement input
        if (!stmt) {
          console.warn('[D1 Wrapper] Null/undefined statement in batch, skipping')
          return stmt // Let D1 handle the error
        }

        // Check if statement is wrapped (has queryType)
        if ('queryType' in stmt) {
          // Count based on wrapped query type
          if (stmt.queryType === 'write') writeCount++
          else readCount++

          // Unwrap using getInner() if available, or raw() (legacy wrapper)
          if (typeof stmt.getInner === 'function') {
            return stmt.getInner()
          }
          if (typeof stmt.raw === 'function') {
            return stmt.raw()
          }
        }

        // For unwrapped statements, warn about inability to classify properly
        console.warn(
          '[D1 Wrapper] Unknown statement type in batch - cannot determine read/write classification',
          {
            statementKeys: Object.keys(stmt),
            hasRawMethod: typeof (stmt as WrappedStatement).raw === 'function',
            statement: 'D1 native statement (unwrapped)',
          },
        )

        // Count as read for backward compatibility, but log the assumption
        readCount++
        return stmt as D1PreparedStatement
      })

      try {
        const results = await db.batch(rawStatements)
        const latencyMs = Date.now() - startTime

        // Record batch metrics
        await recordD1Metrics(env, {
          latencyMs,
          error: false,
          readCount,
          writeCount,
          queryCount: readCount + writeCount,
        })

        return results
      } catch (err) {
        const error = err as Error
        const latencyMs = Date.now() - startTime

        // Record failed batch metrics
        await recordD1Metrics(env, {
          latencyMs,
          error: true,
          readCount,
          writeCount,
          queryCount: readCount + writeCount,
        })

        // Enhance error context before re-throwing
        const enhancedError = new Error(`D1 batch operation failed: ${error.message}`)
        enhancedError.cause = err
        ;(enhancedError as Error & { batchInfo: unknown }).batchInfo = {
          statementCount: statements.length,
          readCount,
          writeCount,
          latencyMs,
          operation: 'batch',
        }

        throw enhancedError
      }
    },

    /**
     * Get the underlying D1 instance
     *
     * @returns Unwrapped D1 database
     */
    raw(): D1Database {
      return db
    },
  }
}

/**
 * Helper to detect query type from SQL string
 * Exported for testing purposes
 *
 * @param sql - SQL query string
 * @returns Query type classification
 */
export function detectQueryType(sql: string): QueryType {
  return isWriteQuery(sql) ? 'write' : 'read'
}
