# Monitoring Dashboard Configuration

**Purpose:** Guide for setting up Cloudflare Analytics dashboards for BooksTrack API v2.0  
**Audience:** DevOps Team, Platform Engineers  
**Updated:** November 15, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Analytics Engine Setup](#analytics-engine-setup)
3. [GraphQL Queries](#graphql-queries)
4. [Dashboard Layout](#dashboard-layout)
5. [Key Metrics](#key-metrics)
6. [Alert Integration](#alert-integration)

---

## Overview

The BooksTrack API tracks request metrics using Cloudflare Analytics Engine, providing real-time insights into:

- **Request volume** by endpoint
- **Error rates** by endpoint and error code
- **Response times** (P50, P95, P99)
- **Cache performance** (hit rate, miss rate)
- **External API performance** (provider latency)

### Analytics Bindings

From `wrangler.toml`:

```toml
[[analytics_engine_datasets]]
binding = "PERFORMANCE_ANALYTICS"
dataset = "books_api_performance"

[[analytics_engine_datasets]]
binding = "CACHE_ANALYTICS"
dataset = "books_api_cache_metrics"

[[analytics_engine_datasets]]
binding = "PROVIDER_ANALYTICS"
dataset = "books_api_provider_performance"
```

### Tracked Data Points

**PERFORMANCE_ANALYTICS Schema:**
- `blobs[0]`: Endpoint path (e.g., "/v1/search/title")
- `blobs[1]`: Error code (e.g., "INVALID_ISBN" or "N/A")
- `blobs[2]`: Cache status ("HIT", "MISS", "BYPASS")
- `doubles[0]`: HTTP status code
- `doubles[1]`: Processing time (ms)
- `indexes[0]`: Endpoint (for efficient filtering)

---

## Analytics Engine Setup

### Access Analytics via API

**Endpoint:**
```
https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql
```

**Authentication:**
```bash
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM books_api_performance LIMIT 10"}'
```

### GraphQL API (Recommended)

Cloudflare also provides a GraphQL API for analytics:

**Endpoint:**
```
https://api.cloudflare.com/client/v4/graphql
```

**Authentication:** Same Bearer token as REST API

---

## GraphQL Queries

### 1. Request Volume by Endpoint (Last 24 Hours)

```graphql
query RequestVolumeByEndpoint($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        nodes {
          blob1: blob1 # endpoint
          count: sum(count)
        }
        orderBy: [count_DESC]
      }
    }
  }
}
```

**Variables:**
```json
{
  "accountTag": "YOUR_ACCOUNT_ID",
  "datetimeStart": "2025-11-14T00:00:00Z",
  "datetimeEnd": "2025-11-15T00:00:00Z"
}
```

### 2. Error Rate by Endpoint

```graphql
query ErrorRateByEndpoint($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        nodes {
          endpoint: blob1
          errorCode: blob2
          statusCode: double1
          totalRequests: sum(count)
        }
        filter: { statusCode_gte: 400 }
        orderBy: [totalRequests_DESC]
      }
    }
  }
}
```

### 3. Response Time Percentiles

```graphql
query ResponseTimePercentiles($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        nodes {
          endpoint: blob1
          p50: quantile(double2, 0.5)  # 50th percentile (median)
          p95: quantile(double2, 0.95) # 95th percentile
          p99: quantile(double2, 0.99) # 99th percentile
          avg: avg(double2)
        }
        groupBy: [blob1]
      }
    }
  }
}
```

### 4. Cache Hit Rate

```graphql
query CacheHitRate($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        nodes {
          endpoint: blob1
          cacheStatus: blob3
          requests: sum(count)
        }
        groupBy: [blob1, blob3]
      }
    }
  }
}
```

**Calculate hit rate:**
```javascript
const hitRate = (cacheHits / (cacheHits + cacheMisses)) * 100;
```

### 5. 4xx vs 5xx Errors

```graphql
query ErrorBreakdown($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        client_errors: nodes {
          count: sum(count)
          filter: { statusCode_gte: 400, statusCode_lt: 500 }
        }
        server_errors: nodes {
          count: sum(count)
          filter: { statusCode_gte: 500 }
        }
      }
    }
  }
}
```

### 6. Top Error Codes

```graphql
query TopErrorCodes($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { dataset: "books_api_performance" }) {
        nodes {
          errorCode: blob2
          endpoint: blob1
          count: sum(count)
        }
        filter: { blob2_ne: "N/A" }
        orderBy: [count_DESC]
        limit: 10
      }
    }
  }
}
```

---

## Dashboard Layout

### Recommended Dashboard Sections

#### 1. Overview Panel

**Metrics:**
- Total requests (last 24h)
- Error rate (%)
- Average response time (ms)
- Cache hit rate (%)

**Visualization:** Single-stat cards

#### 2. Endpoint Performance

**Metrics:**
- Requests per endpoint (bar chart)
- Response time by endpoint (line chart)
- Error rate by endpoint (table)

**Visualization:** Mixed (bar + line + table)

#### 3. Error Analysis

**Metrics:**
- 4xx vs 5xx errors (pie chart)
- Top error codes (bar chart)
- Error trends over time (line chart)

**Visualization:** Error-focused charts

#### 4. Performance Trends

**Metrics:**
- Response time percentiles (P50, P95, P99) over time
- Request volume over time
- Cache performance over time

**Visualization:** Time-series line charts

#### 5. Cache Performance

**Metrics:**
- Cache hit rate by endpoint
- Cache status distribution (HIT vs MISS vs BYPASS)
- Cache effectiveness over time

**Visualization:** Bar chart + line chart

---

## Key Metrics

### 1. Request Volume

**Metric:** Total requests per hour/day  
**Query:** `SELECT COUNT(*) FROM books_api_performance WHERE timestamp > NOW() - INTERVAL 24 HOUR`  
**Target:** Baseline for capacity planning  
**Alert Threshold:** >10,000 requests/hour (capacity warning)

### 2. Error Rate

**Metric:** (Total Errors / Total Requests) × 100  
**Query:** `SELECT (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 FROM books_api_performance`  
**Target:** <5% overall error rate  
**Alert Threshold:** >10% (critical), >5% (warning)

### 3. Response Time (P95)

**Metric:** 95th percentile response time  
**Query:** `SELECT QUANTILE(double2, 0.95) FROM books_api_performance`  
**Target:** <500ms  
**Alert Threshold:** >2000ms (critical), >1000ms (warning)

### 4. Cache Hit Rate

**Metric:** (Cache Hits / Total Requests) × 100  
**Query:** `SELECT (SUM(CASE WHEN blob3 = 'HIT' THEN 1 ELSE 0 END) / COUNT(*)) * 100 FROM books_api_performance`  
**Target:** >70%  
**Alert Threshold:** <50% (warning)

### 5. 5xx Error Rate

**Metric:** (5xx Errors / Total Requests) × 100  
**Query:** `SELECT (SUM(CASE WHEN double1 >= 500 THEN 1 ELSE 0 END) / COUNT(*)) * 100 FROM books_api_performance`  
**Target:** <1%  
**Alert Threshold:** >5% (critical), >2% (warning)

---

## Alert Integration

### Cloudflare Workers Analytics API

Use Workers to query Analytics Engine and trigger alerts:

```javascript
// workers/alert-monitor.js
export default {
  async scheduled(event, env, ctx) {
    // Query Analytics Engine
    const errorRate = await getErrorRate(env);
    
    if (errorRate > 10) {
      await sendAlert(env, 'CRITICAL', `Error rate at ${errorRate}%`);
    } else if (errorRate > 5) {
      await sendAlert(env, 'WARNING', `Error rate at ${errorRate}%`);
    }
  }
};

async function getErrorRate(env) {
  const query = `
    SELECT 
      (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as error_rate
    FROM books_api_performance
    WHERE timestamp > NOW() - INTERVAL 15 MINUTE
  `;
  
  const result = await env.ANALYTICS.query(query);
  return result.rows[0].error_rate;
}
```

### External Monitoring (PagerDuty, Datadog, etc.)

Forward metrics to external monitoring services:

```javascript
// Forward to Datadog
async function forwardToDatadog(metrics, env) {
  await fetch('https://api.datadoghq.com/api/v1/series', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': env.DATADOG_API_KEY
    },
    body: JSON.stringify({
      series: [
        {
          metric: 'bookstrack.error_rate',
          points: [[Date.now() / 1000, metrics.errorRate]],
          type: 'gauge',
          tags: ['env:production', 'service:bookstrack-api']
        }
      ]
    })
  });
}
```

---

## Example Dashboard Implementation

### Using Grafana

**Data Source:** Cloudflare Analytics Engine (via SQL API)

**Dashboard Panels:**

1. **Requests per Second**
   - Query: `SELECT timestamp, COUNT(*) FROM books_api_performance GROUP BY timestamp`
   - Visualization: Time series

2. **Error Rate**
   - Query: `SELECT timestamp, (SUM(CASE WHEN double1 >= 400 THEN 1 ELSE 0 END) / COUNT(*)) * 100 FROM books_api_performance GROUP BY timestamp`
   - Visualization: Time series with alert threshold line

3. **Response Time Percentiles**
   - Query: `SELECT timestamp, QUANTILE(double2, 0.5) as p50, QUANTILE(double2, 0.95) as p95, QUANTILE(double2, 0.99) as p99 FROM books_api_performance GROUP BY timestamp`
   - Visualization: Multi-line time series

4. **Top Endpoints by Volume**
   - Query: `SELECT blob1 as endpoint, COUNT(*) as requests FROM books_api_performance GROUP BY blob1 ORDER BY requests DESC LIMIT 10`
   - Visualization: Bar chart

### Using Cloudflare Dashboard

Navigate to: **Cloudflare Dashboard → Workers & Pages → api-worker → Metrics**

Built-in metrics available:
- Requests
- Errors
- Duration (P50, P95, P99)
- CPU Time

For custom Analytics Engine metrics, use **GraphQL API + custom dashboard**.

---

## Accessing Data via CLI

### Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### Query Analytics

```bash
# View recent error rates
wrangler analytics query \
  --dataset books_api_performance \
  --query "SELECT blob2 as error_code, COUNT(*) as count FROM books_api_performance WHERE blob2 != 'N/A' GROUP BY blob2 ORDER BY count DESC LIMIT 10"
```

---

## Best Practices

1. **Retention:** Analytics Engine data retained for 30 days (free tier) or 90 days (paid)
2. **Sampling:** For high-volume endpoints, consider sampling (track 1 in 10 requests)
3. **Cardinality:** Limit unique values in `blobs` to avoid storage explosion
4. **Real-time:** Analytics have ~1 minute delay; use for trends, not real-time debugging
5. **Cost:** Analytics Engine is free up to 10M events/month

---

## Troubleshooting

### Issue: No data in Analytics Engine

**Check:**
1. Verify `PERFORMANCE_ANALYTICS` binding exists in `wrangler.toml`
2. Check deployment logs for analytics write errors
3. Confirm dataset name matches exactly

**Solution:**
```bash
# List datasets
wrangler analytics list

# Test write
wrangler analytics write --dataset books_api_performance \
  --blob1 "/test" --blob2 "N/A" --blob3 "MISS" \
  --double1 200 --double2 150
```

### Issue: GraphQL query returns empty

**Check:**
1. Verify time range includes recent data
2. Check account tag is correct
3. Confirm dataset name spelling

**Solution:** Use SQL API for debugging:
```bash
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d '{"query": "SELECT COUNT(*) FROM books_api_performance"}'
```

---

## Resources

- **Cloudflare Analytics Engine Docs:** https://developers.cloudflare.com/analytics/analytics-engine/
- **GraphQL API Docs:** https://developers.cloudflare.com/analytics/graphql-api/
- **Wrangler Analytics:** https://developers.cloudflare.com/workers/wrangler/commands/#analytics

---

**Document Version:** 1.0  
**Last Updated:** November 15, 2025  
**Maintainer:** DevOps Team
