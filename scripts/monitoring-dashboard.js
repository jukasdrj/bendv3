#!/usr/bin/env node
/**
 * BooksTrack Production Monitoring Dashboard
 *
 * Queries Cloudflare Analytics Engine for real-time metrics:
 * - Request volume and error rates
 * - Response time percentiles (P50, P95, P99)
 * - Cache hit rates (Edge, KV, R2)
 * - Response format compliance (v2.0 vs legacy)
 * - Top endpoints by volume and errors
 *
 * Usage:
 *   node scripts/monitoring-dashboard.js [period]
 *
 * Period options: 15m, 1h, 6h, 24h, 7d (default: 1h)
 */

import { execSync } from 'child_process'

const ACCOUNT_ID = 'd03bed0be6d976acd8a1707b55052f79'

// Get period from args (default: 1h)
const period = process.argv[2] || '1h'

const PERIOD_MAP = {
  '15m': { interval: '15 MINUTE', label: 'Last 15 Minutes' },
  '1h': { interval: '1 HOUR', label: 'Last Hour' },
  '6h': { interval: '6 HOUR', label: 'Last 6 Hours' },
  '24h': { interval: '24 HOUR', label: 'Last 24 Hours' },
  '7d': { interval: '7 DAY', label: 'Last 7 Days' }
}

const { interval, label } = PERIOD_MAP[period] || PERIOD_MAP['1h']

console.log(`\n📊 BooksTrack Monitoring Dashboard - ${label}\n`)
console.log('=' .repeat(80))

/**
 * Execute GraphQL query against Cloudflare Analytics API
 */
function queryAnalytics(query) {
  try {
    const result = execSync(`npx wrangler analytics query --dataset books_api_performance --query "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Parse CSV output from wrangler
    const lines = result.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',')
    return lines.slice(1).map(line => {
      const values = line.split(',')
      return headers.reduce((obj, header, i) => {
        obj[header.trim()] = values[i]?.trim()
        return obj
      }, {})
    })
  } catch (error) {
    console.error('❌ Analytics query failed:', error.message)
    return []
  }
}

// ============================================================================
// 1. REQUEST VOLUME & ERROR RATES
// ============================================================================

console.log('\n📈 Request Volume & Errors')
console.log('-'.repeat(80))

const volumeQuery = `
  SELECT
    COUNT(*) as total_requests,
    SUM(CASE WHEN double1 >= 400 AND double1 < 500 THEN 1 ELSE 0 END) as client_errors,
    SUM(CASE WHEN double1 >= 500 THEN 1 ELSE 0 END) as server_errors,
    (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
`

const volumeData = queryAnalytics(volumeQuery)
if (volumeData.length > 0) {
  const { total_requests, client_errors, server_errors, error_rate } = volumeData[0]
  console.log(`Total Requests:    ${parseInt(total_requests).toLocaleString()}`)
  console.log(`Client Errors (4xx): ${parseInt(client_errors).toLocaleString()}`)
  console.log(`Server Errors (5xx): ${parseInt(server_errors).toLocaleString()}`)
  console.log(`Error Rate:        ${parseFloat(error_rate).toFixed(2)}%`)

  if (parseFloat(error_rate) > 10) {
    console.log('🚨 CRITICAL: Error rate > 10% - Consider rollback!')
  } else if (parseFloat(error_rate) > 5) {
    console.log('⚠️  WARNING: Error rate elevated')
  } else {
    console.log('✅ Error rate healthy')
  }
}

// ============================================================================
// 2. RESPONSE TIME PERCENTILES
// ============================================================================

console.log('\n⏱️  Response Time (milliseconds)')
console.log('-'.repeat(80))

const latencyQuery = `
  SELECT
    AVG(double2) as avg_latency,
    QUANTILE(double2, 0.5) as p50,
    QUANTILE(double2, 0.95) as p95,
    QUANTILE(double2, 0.99) as p99
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
`

const latencyData = queryAnalytics(latencyQuery)
if (latencyData.length > 0) {
  const { avg_latency, p50, p95, p99 } = latencyData[0]
  console.log(`Average:  ${parseFloat(avg_latency).toFixed(0)}ms`)
  console.log(`P50:      ${parseFloat(p50).toFixed(0)}ms`)
  console.log(`P95:      ${parseFloat(p95).toFixed(0)}ms`)
  console.log(`P99:      ${parseFloat(p99).toFixed(0)}ms`)

  if (parseFloat(p95) > 2000) {
    console.log('🚨 CRITICAL: P95 latency > 2s - Performance degraded!')
  } else if (parseFloat(p95) > 500) {
    console.log('⚠️  WARNING: P95 latency above target (500ms)')
  } else {
    console.log('✅ Response times healthy')
  }
}

// ============================================================================
// 3. CACHE PERFORMANCE
// ============================================================================

console.log('\n💾 Cache Performance')
console.log('-'.repeat(80))

const cacheQuery = `
  SELECT
    blob3 as cache_status,
    COUNT(*) as requests,
    (COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()) as percentage
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
  GROUP BY blob3
  ORDER BY requests DESC
`

const cacheData = queryAnalytics(cacheQuery)
if (cacheData.length > 0) {
  let hitCount = 0
  let totalCount = 0

  cacheData.forEach(row => {
    const { cache_status, requests, percentage } = row
    const reqCount = parseInt(requests)
    totalCount += reqCount

    if (cache_status === 'HIT') {
      hitCount = reqCount
    }

    console.log(`${cache_status.padEnd(10)} ${reqCount.toLocaleString().padStart(10)} (${parseFloat(percentage).toFixed(1)}%)`)
  })

  const hitRate = totalCount > 0 ? (hitCount / totalCount) * 100 : 0
  console.log(`\nCache Hit Rate: ${hitRate.toFixed(1)}%`)

  if (hitRate < 50) {
    console.log('⚠️  WARNING: Cache hit rate below target (70%)')
  } else {
    console.log('✅ Cache performance healthy')
  }
}

// ============================================================================
// 4. RESPONSE FORMAT COMPLIANCE (v2.0)
// ============================================================================

console.log('\n📋 Response Format Compliance')
console.log('-'.repeat(80))

const formatQuery = `
  SELECT
    blob6 as response_format,
    COUNT(*) as count,
    (COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()) as percentage
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
    AND blob1 LIKE '/v1/%'
  GROUP BY blob6
  ORDER BY count DESC
`

const formatData = queryAnalytics(formatQuery)
if (formatData.length > 0) {
  formatData.forEach(row => {
    const { response_format, count, percentage } = row
    const icon = response_format === 'v2.0' ? '✅' : response_format === 'legacy' ? '⚠️' : 'ℹ️'
    console.log(`${icon} ${response_format.padEnd(20)} ${parseInt(count).toLocaleString().padStart(10)} (${parseFloat(percentage).toFixed(2)}%)`)
  })

  const v2Count = formatData.find(r => r.response_format === 'v2.0')
  const legacyCount = formatData.find(r => r.response_format === 'legacy')

  if (legacyCount && parseFloat(legacyCount.percentage) > 1) {
    console.log('\n⚠️  WARNING: Legacy format usage > 1% - investigate!')
  } else if (v2Count) {
    console.log('\n✅ v2.0 migration successful')
  }
}

// ============================================================================
// 5. TOP ENDPOINTS BY VOLUME
// ============================================================================

console.log('\n🔝 Top Endpoints (by request volume)')
console.log('-'.repeat(80))

const endpointsQuery = `
  SELECT
    blob1 as endpoint,
    COUNT(*) as requests,
    AVG(double2) as avg_latency
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
  GROUP BY blob1
  ORDER BY requests DESC
  LIMIT 10
`

const endpointsData = queryAnalytics(endpointsQuery)
if (endpointsData.length > 0) {
  console.log('Endpoint'.padEnd(40) + 'Requests'.padStart(15) + 'Avg Latency'.padStart(15))
  console.log('-'.repeat(80))

  endpointsData.forEach(row => {
    const { endpoint, requests, avg_latency } = row
    console.log(
      endpoint.padEnd(40) +
      parseInt(requests).toLocaleString().padStart(15) +
      `${parseFloat(avg_latency).toFixed(0)}ms`.padStart(15)
    )
  })
}

// ============================================================================
// 6. TOP ERROR CODES
// ============================================================================

console.log('\n🔴 Top Error Codes')
console.log('-'.repeat(80))

const errorsQuery = `
  SELECT
    blob2 as error_code,
    COUNT(*) as count
  FROM books_api_performance
  WHERE timestamp > NOW() - INTERVAL ${interval}
    AND blob2 != 'N/A'
    AND blob2 != 'SUCCESS'
  GROUP BY blob2
  ORDER BY count DESC
  LIMIT 10
`

const errorsData = queryAnalytics(errorsQuery)
if (errorsData.length > 0) {
  errorsData.forEach(row => {
    const { error_code, count } = row
    console.log(`${error_code.padEnd(30)} ${parseInt(count).toLocaleString().padStart(10)}`)
  })
} else {
  console.log('✅ No significant errors detected')
}

// ============================================================================
// SUMMARY & RECOMMENDATIONS
// ============================================================================

console.log('\n' + '='.repeat(80))
console.log('\n💡 Quick Commands:')
console.log('  node scripts/monitoring-dashboard.js 15m   # Last 15 minutes')
console.log('  node scripts/monitoring-dashboard.js 24h   # Last 24 hours')
console.log('  npx wrangler tail --format pretty         # Live tail')
console.log('  /logs                                      # Custom slash command')
console.log('\n📚 Documentation:')
console.log('  docs/MONITORING_GUIDE.md')
console.log('  docs/ROLLBACK_PROCEDURES.md')
console.log('  docs/deployment/MONITORING_DASHBOARD.md')
console.log('\n')
