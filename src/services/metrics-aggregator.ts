// src/services/metrics-aggregator.ts

import type { Env } from '../types/env.js'

/**
 * Aggregation time periods
 */
export type AggregationPeriod = '15m' | '1h' | '24h' | '7d'

/**
 * Aggregation window types
 */
export type AggregationWindow = 'minute' | 'hour' | 'day'

/**
 * Metric type categories
 */
export type MetricType = 'cache_hit' | 'cache_miss' | 'latency' | 'error_rate'

/**
 * Cache source types
 */
export type CacheSource = 'edge_hit' | 'kv_hit' | 'r2_rehydrated' | 'api_miss'

/**
 * Analytics query result row
 */
interface AnalyticsResultRow {
  cache_source?: CacheSource
  count?: number
  avg_latency?: number
  p50?: number
  p95?: number
  p99?: number
}

/**
 * Analytics query result
 */
interface AnalyticsQueryResult {
  results: AnalyticsResultRow[]
  _note?: string
  _instructions?: {
    method: string
    endpoint: string
    authentication: string
    sampleQuery: string
  }
}

/**
 * Latency metrics by source
 */
interface LatencyMetrics {
  avg: number
  p50: number
  p95: number
  p99: number
}

/**
 * Hit rate percentages
 */
interface HitRates {
  edge: number
  kv: number
  r2_cold: number
  api: number
  combined: number
}

/**
 * Request volume metrics
 */
interface VolumeMetrics {
  total_requests: number
  edge_hits: number
  kv_hits: number
  r2_rehydrations: number
  api_misses: number
}

/**
 * Aggregated metrics result
 */
export interface AggregatedMetrics {
  _limitation?: string
  _solution?: string
  _graphql_endpoint?: string
  _dataset_name?: string
  timestamp: string
  period: AggregationPeriod
  hitRates: HitRates
  latency: Record<string, LatencyMetrics>
  volume: VolumeMetrics
}

/**
 * Aggregate cache metrics from Analytics Engine
 *
 * NOTE: Analytics Engine in Workers only supports writeDataPoint().
 * Queries must be performed via Cloudflare GraphQL API or Dashboard.
 * This function returns mock/placeholder data with instructions.
 *
 * @param _env - Worker environment (unused, for future GraphQL integration)
 * @param period - Time period ('15m', '1h', '24h', '7d')
 * @returns Aggregated metrics (placeholder until GraphQL implemented)
 */
export async function aggregateMetrics(
  _env: Env,
  period: AggregationPeriod,
): Promise<AggregatedMetrics> {
  // LIMITATION: Analytics Engine Workers binding only supports writeDataPoint()
  // Query capability requires Cloudflare GraphQL API with account token
  // For now, return placeholder data with real query instructions

  const result: AnalyticsQueryResult = {
    results: [],
    _note: 'Analytics Engine queries not available in Workers runtime',
    _instructions: {
      method: 'Cloudflare GraphQL API',
      endpoint: 'https://api.cloudflare.com/client/v4/graphql',
      authentication: 'Bearer token required',
      sampleQuery: `
query {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      analyticsEngineDatasets(filter: { name: "books_api_cache_metrics" }) {
        query(
          filter: { timestamp_geq: $startTime }
          orderBy: [timestamp_DESC]
        ) {
          index1
          double1
          count
        }
      }
    }
  }
}
      `.trim(),
    },
  }

  // Calculate metrics
  let totalRequests = 0
  let edgeHits = 0
  let kvHits = 0
  let r2Rehydrations = 0
  let apiMisses = 0

  const latencyData: Record<string, LatencyMetrics> = {}

  for (const row of result.results || []) {
    const count = row.count || 0
    totalRequests += count

    if (row.cache_source === 'edge_hit') edgeHits = count
    else if (row.cache_source === 'kv_hit') kvHits = count
    else if (row.cache_source === 'r2_rehydrated') r2Rehydrations = count
    else if (row.cache_source === 'api_miss') apiMisses = count

    if (row.cache_source) {
      latencyData[row.cache_source] = {
        avg: row.avg_latency || 0,
        p50: row.p50 || 0,
        p95: row.p95 || 0,
        p99: row.p99 || 0,
      }
    }
  }

  return {
    _limitation: 'Analytics Engine queries not available from Workers runtime',
    _solution: 'Use Cloudflare Dashboard or GraphQL API to query metrics',
    _graphql_endpoint: 'https://api.cloudflare.com/client/v4/graphql',
    _dataset_name: 'books_api_cache_metrics',
    timestamp: new Date().toISOString(),
    period: period,
    hitRates: {
      edge: totalRequests > 0 ? (edgeHits / totalRequests) * 100 : 0,
      kv: totalRequests > 0 ? (kvHits / totalRequests) * 100 : 0,
      r2_cold: totalRequests > 0 ? (r2Rehydrations / totalRequests) * 100 : 0,
      api: totalRequests > 0 ? (apiMisses / totalRequests) * 100 : 0,
      combined: totalRequests > 0 ? ((edgeHits + kvHits) / totalRequests) * 100 : 0,
    },
    latency: latencyData,
    volume: {
      total_requests: totalRequests,
      edge_hits: edgeHits,
      kv_hits: kvHits,
      r2_rehydrations: r2Rehydrations,
      api_misses: apiMisses,
    },
  }
}
