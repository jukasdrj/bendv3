import type { Context } from 'hono'
import type { Env } from '../types/env.js'
import { createErrorResponse, ErrorCodes } from '../utils/http/response-builder'

/**
 * GET /metrics - Comprehensive metrics API endpoint
 *
 * Returns all metric types: cache, WebSocket, D1, API contract, external APIs
 *
 * Query params:
 *  - period: 'minute' | 'hour' | 'day' | 'total' (default: 'hour')
 *  - format: 'json' | 'prometheus' (default: 'json')
 *
 * @param c - Hono context with Bindings and Execution Context
 * @returns Metrics data in requested format
 */

/**
 * WebSocket metrics structure
 */
interface WebSocketMetrics {
  connectionsEstablished?: number
  totalConnectionDuration?: number
  disconnectReasons?: Record<string, number>
}

/**
 * D1 database metrics
 */
interface D1Metrics {
  queryCount?: number
  readQueries?: number
  writeQueries?: number
  errorCount?: number
  totalLatencyMs?: number
  latencyBuckets?: {
    fast?: number
    normal?: number
    slow?: number
    verySlow?: number
  }
}

/**
 * API contract validation metrics
 */
interface ApiContractMetrics {
  totalValidations?: number
  validationFailures?: number
  failuresByEndpoint?: Record<string, number>
  failuresByField?: Record<string, number>
}

/**
 * External API provider metrics
 */
interface ProviderMetrics {
  requestCount?: number
  errorCount?: number
  quotaRemaining?: number
  tokensUsed?: number
}

interface ExternalApiMetrics {
  googleBooks?: ProviderMetrics
  isbndb?: ProviderMetrics
  gemini?: ProviderMetrics
}

/**
 * Cache metrics structure
 */
interface CacheMetricsData {
  total?: {
    reads?: number
    hits?: number
    misses?: number
    writes?: number
    churns?: number
  }
}

/**
 * Aggregated metrics from all subsystems
 */
interface AggregatedMetrics {
  timestamp: string
  period: string
  cache?: CacheMetricsData
  websocket?: WebSocketMetrics
  d1?: D1Metrics
  apiContract?: ApiContractMetrics
  externalApi?: ExternalApiMetrics
}

/**
 * Derived metrics calculated from raw stats
 */
interface DerivedWebSocketMetrics {
  avgConnectionDuration: string
  totalDisconnects: number
  disconnectReasons: Record<string, number>
}

interface DerivedD1Metrics {
  avgLatency: string
  readWriteRatio: string | number
  errorRate: string
  latencyDistribution: Record<string, number>
}

interface FailureEndpoint {
  endpoint: string
  count: number
}

interface DerivedApiContractMetrics {
  failureRate: string
  topFailingEndpoints: FailureEndpoint[]
  topFailingFields: FailureEndpoint[]
}

interface GoogleBooksQuota {
  quotaUsed: number
  quotaRemaining: number
  quotaPercentageUsed: string
  errorRate: string
}

interface DerivedExternalApiMetrics {
  googleBooks: GoogleBooksQuota
  isbndb: GoogleBooksQuota
  gemini: {
    requestCount: number
    tokensUsed: number
    errorRate: string
  }
}

interface DerivedMetrics {
  websocket?: DerivedWebSocketMetrics
  d1?: DerivedD1Metrics
  apiContract?: DerivedApiContractMetrics
  externalApi?: DerivedExternalApiMetrics
  cache?: {
    hitRate: string
    churnRate: string
  }
}

/**
 * Health assessment issue
 */
interface HealthIssue {
  severity: 'warning' | 'error'
  component: string
  message: string
  since: string
}

interface HealthAssessment {
  status: 'healthy' | 'degraded' | 'unhealthy'
  issues: HealthIssue[]
}

/**
 * Complete metrics response with health assessment
 */
interface MetricsResponse extends AggregatedMetrics {
  derived?: DerivedMetrics
  health?: HealthAssessment
}

export async function handleMetricsRequest(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // SECURITY: Validate authentication token
    const auth = c.req.header('Authorization')
    if (!auth || !auth.startsWith('Bearer ')) {
      return createErrorResponse(
        'Missing or invalid Authorization header. Use: Authorization: Bearer <metrics_token>',
        401,
        ErrorCodes.UNAUTHORIZED,
        { endpoint: '/metrics' },
        null,
      )
    }

    const token = auth.substring(7) // Remove "Bearer " prefix
    const expectedToken = c.env.METRICS_API_KEY || 'metrics_default_key'

    if (token !== expectedToken) {
      return createErrorResponse(
        'Invalid metrics API key',
        403,
        ErrorCodes.FORBIDDEN,
        { endpoint: '/metrics' },
        null,
      )
    }

    const url = new URL(c.req.url)
    const period = url.searchParams.get('period') || 'hour'
    const format = url.searchParams.get('format') || 'json'

    // Validate period
    const validPeriods = ['minute', 'hour', 'day', 'total']
    if (!validPeriods.includes(period)) {
      return createErrorResponse(
        `Period must be one of: ${validPeriods.join(', ')}`,
        400,
        ErrorCodes.INVALID_REQUEST,
        { parameter: 'period', provided: period, valid: validPeriods },
        null,
      )
    }

    // Check cache first (5min TTL)
    const cacheKey = `metrics:v2:${period}`
    const cached = await c.env.CACHE.get(cacheKey)
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type':
            format === 'prometheus' ? 'text/plain; version=0.0.4' : 'application/json',
        },
      })
    }

    // Fetch fresh metrics from CacheMetricsDO
    const metrics = await fetchMetricsFromDO(c.env, period)

    // Add derived metrics
    metrics.derived = calculateDerivedMetrics(metrics)

    // Add health assessment
    metrics.health = assessHealth(metrics)

    // Format response
    const body =
      format === 'prometheus' ? formatPrometheus(metrics) : JSON.stringify(metrics, null, 2)

    // Cache for 5 minutes
    c.executionCtx.waitUntil(
      c.env.CACHE.put(cacheKey, body, {
        expirationTtl: 300,
      }),
    )

    return new Response(body, {
      headers: {
        'Content-Type': format === 'prometheus' ? 'text/plain; version=0.0.4' : 'application/json',
      },
    })
  } catch (error) {
    console.error('[Metrics Handler] Error:', error)
    return createErrorResponse(
      'Failed to fetch metrics',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: error instanceof Error ? error.message : String(error) },
      null,
    )
  }
}

/**
 * Fetch metrics from CacheMetricsDO
 * @param env - Worker environment
 * @param period - Time period (minute, hour, day, total)
 * @returns Metrics for the specified period
 */
async function fetchMetricsFromDO(env: Env, period: string): Promise<MetricsResponse> {
  try {
    // Get CacheMetricsDO stub
    const id = env.CACHE_METRICS_DO.idFromName('global')
    const stub = env.CACHE_METRICS_DO.get(id)

    // Fetch all stats
    const allStats = (await (
      stub as unknown as { getStats: () => Promise<Record<string, unknown>> }
    ).getStats()) as Record<string, unknown>

    // Map period name to stats structure
    const periodKey = `current${period.charAt(0).toUpperCase() + period.slice(1)}`

    return {
      timestamp: new Date().toISOString(),
      period: period,

      // Cache metrics
      cache: (allStats[periodKey] as CacheMetricsData) || (allStats.total as CacheMetricsData),

      // WebSocket metrics
      websocket:
        ((allStats.websocket as Record<string, unknown>)?.[periodKey] as WebSocketMetrics) ||
        ((allStats.websocket as Record<string, unknown>)?.total as WebSocketMetrics) ||
        {},

      // D1 metrics
      d1:
        ((allStats.d1 as Record<string, unknown>)?.[periodKey] as D1Metrics) ||
        ((allStats.d1 as Record<string, unknown>)?.total as D1Metrics) ||
        {},

      // API contract metrics
      apiContract:
        ((allStats.apiContract as Record<string, unknown>)?.[periodKey] as ApiContractMetrics) ||
        ((allStats.apiContract as Record<string, unknown>)?.total as ApiContractMetrics) ||
        {},

      // External API metrics
      externalApi:
        ((allStats.externalApi as Record<string, unknown>)?.[periodKey] as ExternalApiMetrics) ||
        ((allStats.externalApi as Record<string, unknown>)?.total as ExternalApiMetrics) ||
        {},
    }
  } catch (error) {
    console.error('[Metrics Handler] Failed to fetch from DO:', error)
    throw new Error(
      `Failed to fetch metrics from Durable Object: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Calculate derived metrics from raw stats
 * @param metrics - Raw metrics object
 * @returns Derived metrics
 */
function calculateDerivedMetrics(metrics: MetricsResponse): DerivedMetrics {
  const derived: DerivedMetrics = {}

  // WebSocket derived metrics
  if (metrics.websocket) {
    const ws = metrics.websocket
    const totalConnections = ws.connectionsEstablished || 0
    const totalDuration = ws.totalConnectionDuration || 0

    derived.websocket = {
      avgConnectionDuration:
        totalConnections > 0 ? `${(totalDuration / totalConnections / 1000).toFixed(2)}s` : '0s',
      totalDisconnects: Object.values(ws.disconnectReasons || {}).reduce((a, b) => a + b, 0),
      disconnectReasons: ws.disconnectReasons || {},
    }
  }

  // D1 derived metrics
  if (metrics.d1) {
    const d1 = metrics.d1
    const totalQueries = d1.queryCount || 0
    const totalLatency = d1.totalLatencyMs || 0

    derived.d1 = {
      avgLatency: totalQueries > 0 ? `${(totalLatency / totalQueries).toFixed(2)}ms` : '0ms',
      readWriteRatio:
        d1.writeQueries && d1.writeQueries > 0
          ? ((d1.readQueries || 0) / d1.writeQueries).toFixed(2)
          : 'N/A',
      errorRate:
        totalQueries > 0 ? `${(((d1.errorCount || 0) / totalQueries) * 100).toFixed(2)}%` : '0%',
      latencyDistribution: d1.latencyBuckets || {},
    }
  }

  // API contract derived metrics
  if (metrics.apiContract) {
    const contract = metrics.apiContract
    const totalValidations = contract.totalValidations || 0

    derived.apiContract = {
      failureRate:
        totalValidations > 0
          ? `${(((contract.validationFailures || 0) / totalValidations) * 100).toFixed(2)}%`
          : '0%',
      topFailingEndpoints: Object.entries(contract.failuresByEndpoint || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([endpoint, count]) => ({ endpoint, count: count as number })),
      topFailingFields: Object.entries(contract.failuresByField || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([field, count]) => ({ endpoint: field, count: count as number })),
    }
  }

  // External API derived metrics
  if (metrics.externalApi) {
    const ext = metrics.externalApi

    derived.externalApi = {
      googleBooks: {
        quotaUsed: ext.googleBooks?.requestCount || 0,
        quotaRemaining: ext.googleBooks?.quotaRemaining || 1000,
        quotaPercentageUsed: ext.googleBooks?.quotaRemaining
          ? `${(((1000 - ext.googleBooks.quotaRemaining) / 1000) * 100).toFixed(1)}%`
          : '0%',
        errorRate:
          ext.googleBooks?.requestCount && ext.googleBooks.requestCount > 0
            ? `${(((ext.googleBooks.errorCount || 0) / ext.googleBooks.requestCount) * 100).toFixed(
                2,
              )}%`
            : '0%',
      },
      isbndb: {
        quotaUsed: ext.isbndb?.requestCount || 0,
        quotaRemaining: ext.isbndb?.quotaRemaining || 5000,
        quotaPercentageUsed: ext.isbndb?.quotaRemaining
          ? `${(((5000 - ext.isbndb.quotaRemaining) / 5000) * 100).toFixed(1)}%`
          : '0%',
        errorRate:
          ext.isbndb?.requestCount && ext.isbndb.requestCount > 0
            ? `${(((ext.isbndb.errorCount || 0) / ext.isbndb.requestCount) * 100).toFixed(2)}%`
            : '0%',
      },
      gemini: {
        requestCount: ext.gemini?.requestCount || 0,
        tokensUsed: ext.gemini?.tokensUsed || 0,
        errorRate:
          ext.gemini?.requestCount && ext.gemini.requestCount > 0
            ? `${(((ext.gemini.errorCount || 0) / ext.gemini.requestCount) * 100).toFixed(2)}%`
            : '0%',
      },
    }
  }

  // Cache derived metrics
  if (metrics.cache) {
    const cache = metrics.cache
    const total = cache.total || {}
    const totalReads = total.reads || 0

    derived.cache = {
      hitRate: totalReads > 0 ? `${(((total.hits || 0) / totalReads) * 100).toFixed(2)}%` : '0%',
      churnRate:
        total.writes && total.writes > 0
          ? `${(((total.churns || 0) / total.writes) * 100).toFixed(2)}%`
          : '0%',
    }
  }

  return derived
}

/**
 * Assess overall system health based on metrics
 * @param metrics - Aggregated metrics
 * @returns Health status and issues
 */
function assessHealth(metrics: MetricsResponse): HealthAssessment {
  const issues: HealthIssue[] = []

  // Check cache health
  if (metrics.cache && metrics.derived?.cache) {
    const hitRate = parseFloat(metrics.derived.cache.hitRate)
    if (hitRate < 90) {
      issues.push({
        severity: 'warning',
        component: 'cache',
        message: `Cache hit rate below target (${hitRate.toFixed(1)}% vs 90% target)`,
        since: metrics.timestamp,
      })
    }
  }

  // Check D1 health
  if (metrics.d1 && metrics.derived?.d1) {
    const errorRate = parseFloat(metrics.derived.d1.errorRate)
    if (errorRate > 5) {
      issues.push({
        severity: 'error',
        component: 'd1',
        message: `D1 error rate elevated (${errorRate.toFixed(1)}% vs 5% threshold)`,
        since: metrics.timestamp,
      })
    }

    const avgLatency = parseFloat(metrics.derived.d1.avgLatency)
    if (avgLatency > 200) {
      issues.push({
        severity: 'warning',
        component: 'd1',
        message: `D1 avg latency high (${avgLatency.toFixed(0)}ms vs 200ms threshold)`,
        since: metrics.timestamp,
      })
    }
  }

  // Check API contract health
  if (metrics.apiContract && metrics.derived?.apiContract) {
    const failureRate = parseFloat(metrics.derived.apiContract.failureRate)
    if (failureRate > 10) {
      issues.push({
        severity: 'error',
        component: 'api_contract',
        message: `API contract failure rate elevated (${failureRate.toFixed(1)}% vs 10% threshold)`,
        since: metrics.timestamp,
      })
    }
  }

  // Check external API quotas
  if (metrics.derived?.externalApi) {
    const gbQuota = parseFloat(metrics.derived.externalApi.googleBooks.quotaPercentageUsed)
    if (gbQuota > 80) {
      issues.push({
        severity: 'warning',
        component: 'external_api',
        message: `Google Books quota ${gbQuota.toFixed(1)}% used (>${80}% threshold)`,
        since: metrics.timestamp,
      })
    }

    const isbnQuota = parseFloat(metrics.derived.externalApi.isbndb.quotaPercentageUsed)
    if (isbnQuota > 80) {
      issues.push({
        severity: 'warning',
        component: 'external_api',
        message: `ISBNdb quota ${isbnQuota.toFixed(1)}% used (>${80}% threshold)`,
        since: metrics.timestamp,
      })
    }
  }

  // Check WebSocket health
  if (metrics.websocket && metrics.derived?.websocket) {
    const totalDisconnects = metrics.derived.websocket.totalDisconnects
    const errorDisconnects = metrics.websocket.disconnectReasons?.error || 0

    if (totalDisconnects > 0 && errorDisconnects / totalDisconnects > 0.2) {
      issues.push({
        severity: 'warning',
        component: 'websocket',
        message: `High WebSocket error disconnect rate (${((errorDisconnects / totalDisconnects) * 100).toFixed(1)}% vs 20% threshold)`,
        since: metrics.timestamp,
      })
    }
  }

  return {
    status:
      issues.length === 0
        ? 'healthy'
        : issues.some((i) => i.severity === 'error')
          ? 'unhealthy'
          : 'degraded',
    issues: issues,
  }
}

/**
 * Format metrics for Prometheus scraping
 * @param metrics - Aggregated metrics
 * @returns Prometheus-formatted metrics
 */
function formatPrometheus(metrics: MetricsResponse): string {
  const lines: string[] = []

  // Cache metrics
  if (metrics.cache?.total) {
    const cache = metrics.cache.total
    lines.push('# HELP cache_operations_total Total cache operations by type')
    lines.push('# TYPE cache_operations_total counter')
    lines.push(`cache_operations_total{type="hits"} ${cache.hits || 0}`)
    lines.push(`cache_operations_total{type="misses"} ${cache.misses || 0}`)
    lines.push(`cache_operations_total{type="reads"} ${cache.reads || 0}`)
    lines.push(`cache_operations_total{type="writes"} ${cache.writes || 0}`)
    lines.push(`cache_operations_total{type="churns"} ${cache.churns || 0}`)
    lines.push('')
  }

  // D1 metrics
  if (metrics.d1) {
    const d1 = metrics.d1
    lines.push('# HELP d1_queries_total Total D1 queries by type')
    lines.push('# TYPE d1_queries_total counter')
    lines.push(`d1_queries_total{type="read"} ${d1.readQueries || 0}`)
    lines.push(`d1_queries_total{type="write"} ${d1.writeQueries || 0}`)
    lines.push(`d1_queries_total{type="error"} ${d1.errorCount || 0}`)
    lines.push('')

    lines.push('# HELP d1_query_latency_bucket D1 query latency distribution')
    lines.push('# TYPE d1_query_latency_bucket counter')
    if (d1.latencyBuckets) {
      lines.push(`d1_query_latency_bucket{le="10"} ${d1.latencyBuckets.fast || 0}`)
      lines.push(`d1_query_latency_bucket{le="50"} ${d1.latencyBuckets.normal || 0}`)
      lines.push(`d1_query_latency_bucket{le="200"} ${d1.latencyBuckets.slow || 0}`)
      lines.push(`d1_query_latency_bucket{le="+Inf"} ${d1.latencyBuckets.verySlow || 0}`)
    }
    lines.push('')
  }

  // WebSocket metrics
  if (metrics.websocket) {
    const ws = metrics.websocket
    lines.push('# HELP websocket_connections_total Total WebSocket connections established')
    lines.push('# TYPE websocket_connections_total counter')
    lines.push(`websocket_connections_total ${ws.connectionsEstablished || 0}`)
    lines.push('')

    lines.push('# HELP websocket_disconnects_total WebSocket disconnects by reason')
    lines.push('# TYPE websocket_disconnects_total counter')
    if (ws.disconnectReasons) {
      for (const [reason, count] of Object.entries(ws.disconnectReasons)) {
        lines.push(`websocket_disconnects_total{reason="${reason}"} ${count}`)
      }
    }
    lines.push('')
  }

  // API contract metrics
  if (metrics.apiContract) {
    const contract = metrics.apiContract
    lines.push('# HELP api_contract_validations_total Total API contract validations')
    lines.push('# TYPE api_contract_validations_total counter')
    lines.push(
      `api_contract_validations_total{result="success"} ${(contract.totalValidations || 0) - (contract.validationFailures || 0)}`,
    )
    lines.push(
      `api_contract_validations_total{result="failure"} ${contract.validationFailures || 0}`,
    )
    lines.push('')
  }

  // External API metrics
  if (metrics.externalApi) {
    const ext = metrics.externalApi

    lines.push('# HELP external_api_requests_total External API requests by provider')
    lines.push('# TYPE external_api_requests_total counter')
    if (ext.googleBooks) {
      lines.push(
        `external_api_requests_total{provider="google_books"} ${ext.googleBooks.requestCount || 0}`,
      )
    }
    if (ext.isbndb) {
      lines.push(`external_api_requests_total{provider="isbndb"} ${ext.isbndb.requestCount || 0}`)
    }
    if (ext.gemini) {
      lines.push(`external_api_requests_total{provider="gemini"} ${ext.gemini.requestCount || 0}`)
    }
    lines.push('')

    lines.push('# HELP external_api_quota_remaining API quota remaining by provider')
    lines.push('# TYPE external_api_quota_remaining gauge')
    if (ext.googleBooks) {
      lines.push(
        `external_api_quota_remaining{provider="google_books"} ${ext.googleBooks.quotaRemaining || 0}`,
      )
    }
    if (ext.isbndb) {
      lines.push(
        `external_api_quota_remaining{provider="isbndb"} ${ext.isbndb.quotaRemaining || 0}`,
      )
    }
    lines.push('')
  }

  // System health
  if (metrics.health) {
    lines.push('# HELP system_health System health status (1=healthy, 0.5=degraded, 0=unhealthy)')
    lines.push('# TYPE system_health gauge')
    const healthValue =
      metrics.health.status === 'healthy' ? 1 : metrics.health.status === 'degraded' ? 0.5 : 0
    lines.push(`system_health ${healthValue}`)
  }

  return lines.join('\n')
}
