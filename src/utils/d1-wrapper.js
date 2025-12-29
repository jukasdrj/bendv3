/**
 * D1 Query Wrapper with Automatic Metrics Tracking
 *
 * Wraps D1 database operations to automatically record:
 * - Query type (read vs write)
 * - Latency
 * - Errors
 *
 * Usage:
 * ```javascript
 * import { wrapD1Database } from './utils/d1-wrapper.js'
 *
 * const db = wrapD1Database(env.DB, env)
 * const result = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(isbn).first()
 * ```
 *
 * @module d1-wrapper
 */

/**
 * SQL keywords that indicate write operations
 */
const WRITE_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE']

/**
 * Detect if SQL query is a write operation
 * @param {string} sql - SQL query string
 * @returns {boolean} True if write operation
 */
function isWriteQuery(sql) {
  const trimmed = sql.trim().toUpperCase()
  return WRITE_KEYWORDS.some((keyword) => trimmed.startsWith(keyword))
}

/**
 * Categorize latency into performance buckets
 * @param {number} latencyMs - Query latency in milliseconds
 * @returns {string} Latency bucket (fast, normal, slow, verySlow)
 */
function getLatencyBucket(latencyMs) {
  if (latencyMs < 10) return 'fast'
  if (latencyMs < 50) return 'normal'
  if (latencyMs < 200) return 'slow'
  return 'verySlow'
}

/**
 * Record D1 metrics to CacheMetricsDO
 * @param {Object} env - Worker environment
 * @param {Object} metricsData - Metrics to record
 */
async function recordD1Metrics(env, metricsData) {
  try {
    // Get or create metrics Durable Object stub
    const id = env.CACHE_METRICS_DO.idFromName('global')
    const stub = env.CACHE_METRICS_DO.get(id)

    // Record metrics via RPC
    await stub.recordD1Metrics(metricsData)
  } catch (error) {
    // CRITICAL: Structured logging for observability degradation
    console.error('[D1 Wrapper] Metrics recording failed - observability degraded', {
      errorId: 'D1_METRICS_FAILED',
      error: error.message,
      metricsType: metricsData.queryType || 'batch',
      timestamp: new Date().toISOString(),
      // Don't log full metricsData to avoid sensitive data exposure
      hasReadCount: typeof metricsData.readCount !== 'undefined',
      hasWriteCount: typeof metricsData.writeCount !== 'undefined',
    })

    // Metrics recording failures should not break the application
    // but we need to be aware that observability is degraded
  }
}

/**
 * Wrap a D1 prepared statement with metrics tracking
 * @param {Object} stmt - D1 prepared statement
 * @param {Object} env - Worker environment
 * @param {string} sql - SQL query string
 * @returns {Object} Wrapped statement with metrics
 */
function wrapStatement(stmt, env, sql) {
  const queryType = isWriteQuery(sql) ? 'write' : 'read'

  return {
    // Expose queryType for batch processing
    queryType,

    /**
     * Bind parameters to the prepared statement
     * @param {...any} values - Parameter values
     * @returns {Object} Wrapped statement
     */
    bind(...values) {
      const boundStmt = stmt.bind(...values)
      return wrapStatement(boundStmt, env, sql)
    },

    /**
     * Execute query and return first row
     * @returns {Promise<Object>} First row or null
     */
    async first() {
      const startTime = Date.now()
      let _error = null

      try {
        const result = await stmt.first()
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
        _error = err
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
     * @returns {Promise<Object>} Result object with results array
     */
    async all() {
      const startTime = Date.now()
      let _error = null

      try {
        const result = await stmt.all()
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
        _error = err
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
     * @returns {Promise<Object>} Execution result
     */
    async run() {
      const startTime = Date.now()
      let _error = null

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
        _error = err
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
     * @returns {Object} Unwrapped D1 statement
     */
    raw() {
      return stmt
    },

    /**
     * Get the underlying D1 statement safely (avoids conflict with D1's raw() execution method)
     * @returns {Object} Unwrapped D1 statement
     */
    getInner() {
      return stmt
    },
  }
}

/**
 * Wrap a D1 database instance with automatic metrics tracking
 *
 * @param {Object} db - D1 database instance (env.DB)
 * @param {Object} env - Worker environment
 * @returns {Object} Wrapped database with metrics tracking
 *
 * @example
 * ```javascript
 * // In your handler:
 * const db = wrapD1Database(env.DB, env)
 *
 * // Use normally - metrics are automatic:
 * const book = await db.prepare('SELECT * FROM books WHERE isbn = ?')
 *   .bind('9780439708180')
 *   .first()
 * ```
 */
export function wrapD1Database(db, env) {
  // Skip wrapping if metrics DO not available (testing/local dev)
  if (!env.CACHE_METRICS_DO) {
    console.warn('[D1 Wrapper] CACHE_METRICS_DO not available, skipping metrics')
    return db
  }

  return {
    /**
     * Prepare a SQL statement with metrics tracking
     * @param {string} sql - SQL query
     * @returns {Object} Wrapped prepared statement
     */
    prepare(sql) {
      const stmt = db.prepare(sql)
      return wrapStatement(stmt, env, sql)
    },

    /**
     * Execute a batch of statements with metrics tracking
     * @param {Array} statements - Array of prepared statements (wrapped or raw)
     * @returns {Promise<Array>} Results array
     */
    async batch(statements) {
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
        if (stmt.queryType) {
          // Count based on wrapped query type
          if (stmt.queryType === 'write') writeCount++
          else readCount++

          // Unwrap using getInner() if available, or raw() (legacy wrapper)
          if (stmt.getInner && typeof stmt.getInner === 'function') {
            return stmt.getInner()
          }
          if (stmt.raw && typeof stmt.raw === 'function') {
            return stmt.raw()
          }
        }

        // For unwrapped statements, warn about inability to classify properly
        console.warn(
          '[D1 Wrapper] Unknown statement type in batch - cannot determine read/write classification',
          {
            statementKeys: Object.keys(stmt),
            hasRawMethod: typeof stmt.raw === 'function',
            statement: 'D1 native statement (unwrapped)',
          },
        )

        // Count as read for backward compatibility, but log the assumption
        readCount++
        return stmt
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
        const enhancedError = new Error(`D1 batch operation failed: ${err.message}`)
        enhancedError.cause = err
        enhancedError.batchInfo = {
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
     * @returns {Object} Unwrapped D1 database
     */
    raw() {
      return db
    },
  }
}

/**
 * Helper to detect query type from SQL string
 * Exported for testing purposes
 *
 * @param {string} sql - SQL query string
 * @returns {string} 'read' or 'write'
 */
export function detectQueryType(sql) {
  return isWriteQuery(sql) ? 'write' : 'read'
}
