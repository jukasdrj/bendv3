/**
 * Alert thresholds and monitoring utilities
 *
 * Provides functions for checking metrics against alert thresholds,
 * deduplicating alerts, and tracking alert send status.
 */

import type { Env } from '../types/env'

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'warning'

/**
 * Alert type categories
 */
export type AlertType =
  | 'miss_rate'
  | 'edge_hit_rate'
  | 'p99_latency'
  | 'contract_violations'
  | 'websocket_disconnect_rate'
  | 'd1_p95_latency'
  | 'error_rate'

/**
 * Alert object structure
 */
export interface Alert {
  severity: AlertSeverity
  type: AlertType
  value: number
  threshold: number
  message: string
}

/**
 * Metrics for alert checking
 */
export interface MetricsForAlerts {
  hitRates: {
    combined: number
    edge: number
    kv: number
  }
  latency?: {
    edge_hit?: { p99: number }
    kv_hit?: { p99: number }
  }
  contractViolations?: number
  websocketDisconnectRate?: number
  d1Latency?: { p95: number }
  errorRate?: number
}

/**
 * Alert thresholds configuration
 */
const ALERT_THRESHOLDS = {
  critical: {
    miss_rate: 15, // > 15% miss rate
    p99_latency: 500, // > 500ms P99
    error_rate: 5, // > 5% errors
    contract_violations: 5, // > 5 violations in 5 minutes
    websocket_disconnect_rate: 10, // > 10% disconnect rate
  },
  warning: {
    miss_rate: 10, // > 10% miss rate
    p95_latency: 100, // > 100ms P95
    d1_p95_latency: 100, // > 100ms D1 P95 for 5 minutes
    edge_hit_rate: 75, // < 75% edge hits
    kv_storage: 1000, // > 1GB KV storage
  },
} as const

/**
 * Check metrics against alert thresholds
 *
 * Evaluates aggregated metrics against configured thresholds
 * for critical and warning levels. Returns array of triggered alerts.
 *
 * @param metrics - Aggregated metrics object
 * @returns Array of triggered alerts
 */
export function checkAlertThresholds(metrics: MetricsForAlerts): Alert[] {
  const alerts: Alert[] = []

  // Critical: High miss rate
  const missRate = 100 - metrics.hitRates.combined
  if (missRate > ALERT_THRESHOLDS.critical.miss_rate) {
    alerts.push({
      severity: 'critical',
      type: 'miss_rate',
      value: missRate,
      threshold: ALERT_THRESHOLDS.critical.miss_rate,
      message: `Cache miss rate critically high: ${missRate.toFixed(1)}%`,
    })
  } else if (missRate > ALERT_THRESHOLDS.warning.miss_rate) {
    alerts.push({
      severity: 'warning',
      type: 'miss_rate',
      value: missRate,
      threshold: ALERT_THRESHOLDS.warning.miss_rate,
      message: `Cache miss rate elevated: ${missRate.toFixed(1)}%`,
    })
  }

  // Warning: Low edge hit rate
  if (metrics.hitRates.edge < ALERT_THRESHOLDS.warning.edge_hit_rate) {
    alerts.push({
      severity: 'warning',
      type: 'edge_hit_rate',
      value: metrics.hitRates.edge,
      threshold: ALERT_THRESHOLDS.warning.edge_hit_rate,
      message: `Edge hit rate below target: ${metrics.hitRates.edge.toFixed(1)}%`,
    })
  }

  // Critical: High P99 latency
  const p99 = metrics.latency?.edge_hit?.p99 || metrics.latency?.kv_hit?.p99 || 0
  if (p99 > ALERT_THRESHOLDS.critical.p99_latency) {
    alerts.push({
      severity: 'critical',
      type: 'p99_latency',
      value: p99,
      threshold: ALERT_THRESHOLDS.critical.p99_latency,
      message: `P99 latency critically high: ${p99.toFixed(0)}ms`,
    })
  }

  // Critical: API contract violations
  const contractViolations = metrics.contractViolations || 0
  if (contractViolations > ALERT_THRESHOLDS.critical.contract_violations) {
    alerts.push({
      severity: 'critical',
      type: 'contract_violations',
      value: contractViolations,
      threshold: ALERT_THRESHOLDS.critical.contract_violations,
      message: `API contract violations detected: ${contractViolations} in 5 minutes`,
    })
  }

  // Critical: High WebSocket disconnect rate
  const wsDisconnectRate = metrics.websocketDisconnectRate || 0
  if (wsDisconnectRate > ALERT_THRESHOLDS.critical.websocket_disconnect_rate) {
    alerts.push({
      severity: 'critical',
      type: 'websocket_disconnect_rate',
      value: wsDisconnectRate,
      threshold: ALERT_THRESHOLDS.critical.websocket_disconnect_rate,
      message: `WebSocket disconnect rate critically high: ${wsDisconnectRate.toFixed(1)}%`,
    })
  }

  // Warning: D1 latency P95
  const d1P95 = metrics.d1Latency?.p95 || 0
  if (d1P95 > ALERT_THRESHOLDS.warning.d1_p95_latency) {
    alerts.push({
      severity: 'warning',
      type: 'd1_p95_latency',
      value: d1P95,
      threshold: ALERT_THRESHOLDS.warning.d1_p95_latency,
      message: `D1 P95 latency elevated for 5+ minutes: ${d1P95.toFixed(0)}ms`,
    })
  }

  // Critical: High error rate
  const errorRate = metrics.errorRate || 0
  if (errorRate > ALERT_THRESHOLDS.critical.error_rate) {
    alerts.push({
      severity: 'critical',
      type: 'error_rate',
      value: errorRate,
      threshold: ALERT_THRESHOLDS.critical.error_rate,
      message: `Error rate critically high: ${errorRate.toFixed(1)}% on endpoints`,
    })
  }

  return alerts
}

/**
 * Check if alert should be sent (deduplication)
 *
 * Verifies whether an alert has been sent recently to avoid
 * duplicate notifications. Uses 4-hour deduplication window.
 *
 * @param alerts - Alerts to check
 * @param env - Worker environment with CACHE binding
 * @returns True if alert should be sent (not a recent duplicate)
 */
export async function shouldSendAlert(alerts: Alert[], env: Env): Promise<boolean> {
  if (alerts.length === 0) return false

  // Generate alert key from alert types
  const alertKey = alerts
    .map((a) => a.type)
    .sort()
    .join(':')
  const cacheKey = `alert:${alertKey}`

  // Check last alert time
  const lastAlert = await env.CACHE.get(cacheKey)
  if (lastAlert) {
    const timeSince = Date.now() - parseInt(lastAlert, 10)
    const fourHours = 4 * 60 * 60 * 1000

    if (timeSince < fourHours) {
      console.log(`Skipping duplicate alert (sent ${Math.floor(timeSince / 1000 / 60)}min ago)`)
      return false
    }
  }

  return true
}

/**
 * Mark alert as sent
 *
 * Records current timestamp in KV to enable deduplication
 * checking. Uses 4-hour TTL to prevent stale entries.
 *
 * @param alerts - Alerts that were sent
 * @param env - Worker environment with CACHE binding
 */
export async function markAlertSent(alerts: Alert[], env: Env): Promise<void> {
  const alertKey = alerts
    .map((a) => a.type)
    .sort()
    .join(':')
  const cacheKey = `alert:${alertKey}`

  await env.CACHE.put(cacheKey, Date.now().toString(), {
    expirationTtl: 4 * 60 * 60, // 4 hours
  })
}
