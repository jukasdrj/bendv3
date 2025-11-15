# Analytics Dashboard - Monitoring Queries

This document provides GraphQL queries for accessing API performance metrics via Cloudflare Analytics Engine.

## Overview

The analytics tracking middleware (Issue #108) writes performance data to four Analytics Engine datasets:

- `books_api_performance` - Request metrics (response time, status codes, errors)
- `books_api_cache_metrics` - Cache hit/miss rates
- `books_api_provider_performance` - External API provider metrics
- `bookshelf_ai_performance` - AI scanner performance

## Custom Response Headers

All API responses include the following headers for debugging:

- `X-Response-Time` - Processing time in milliseconds (e.g., `45ms`)
- `X-Cache-Status` - Cache status (`HIT`, `MISS`, `BYPASS`, `NONE`)
- `X-Error-Code` - Error code for failed requests (e.g., `RATE_LIMIT_EXCEEDED`)

## GraphQL Queries

### 1. Request Performance by Endpoint

```graphql
query RequestPerformance($accountTag: String!, $filter: AccountAnalyticsEngineFilter) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(
        filter: { name: "books_api_performance" }
      ) {
        dimensions(
          limit: 100
          orderBy: [count_DESC]
          filter: $filter
        ) {
          blob1  # Endpoint path
          blob2  # HTTP status code
          blob3  # Error code or SUCCESS
          count
          avg: avgDouble1  # Average response time
          max: maxDouble1  # Max response time
          min: minDouble1  # Min response time
        }
      }
    }
  }
}
```

**Variables:**
```json
{
  "accountTag": "YOUR_ACCOUNT_ID",
  "filter": {
    "datetime_geq": "2025-01-10T00:00:00Z",
    "datetime_leq": "2025-01-11T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "data": {
    "viewer": {
      "accounts": [
        {
          "analyticsEngineDatasets": [
            {
              "dimensions": [
                {
                  "blob1": "/v1/search/isbn",
                  "blob2": "200",
                  "blob3": "SUCCESS",
                  "count": 1523,
                  "avg": 42.5,
                  "max": 250,
                  "min": 18
                },
                {
                  "blob1": "/v1/search/title",
                  "blob2": "200",
                  "blob3": "SUCCESS",
                  "count": 892,
                  "avg": 78.3,
                  "max": 450,
                  "min": 25
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

### 2. Error Rate by Endpoint

```graphql
query ErrorRates($accountTag: String!, $filter: AccountAnalyticsEngineFilter) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        dimensions(
          limit: 50
          orderBy: [count_DESC]
          filter: $filter
        ) {
          blob1  # Endpoint
          blob3  # Error code
          count
        }
      }
    }
  }
}
```

Filter for errors only by adding to variables:
```json
{
  "filter": {
    "datetime_geq": "2025-01-10T00:00:00Z",
    "blob3_neq": "SUCCESS"
  }
}
```

### 3. Response Time Percentiles

```graphql
query ResponseTimePercentiles($accountTag: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        quantiles: dimensions(
          limit: 1
          orderBy: [count_DESC]
        ) {
          p50: quantileDouble1_50  # P50 (median)
          p75: quantileDouble1_75  # P75
          p95: quantileDouble1_95  # P95
          p99: quantileDouble1_99  # P99
          count
        }
      }
    }
  }
}
```

### 4. Traffic by Geographic Region

```graphql
query TrafficByRegion($accountTag: String!, $filter: AccountAnalyticsEngineFilter) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        dimensions(
          limit: 100
          orderBy: [count_DESC]
          filter: $filter
        ) {
          blob5  # Cloudflare datacenter (colo)
          count
          avg: avgDouble1  # Avg response time
        }
      }
    }
  }
}
```

### 5. Requests Over Time (Time Series)

```graphql
query RequestsTimeSeries($accountTag: String!, $filter: AccountAnalyticsEngineFilter) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        series: dimensions(
          limit: 1000
          orderBy: [datetime_ASC]
          filter: $filter
        ) {
          datetime
          count
          avg: avgDouble1
        }
      }
    }
  }
}
```

### 6. Top Slow Endpoints (P95 > 500ms)

```graphql
query SlowEndpoints($accountTag: String!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        dimensions(
          limit: 20
          orderBy: [quantileDouble1_95_DESC]
        ) {
          blob1  # Endpoint
          count
          p95: quantileDouble1_95
          avg: avgDouble1
        }
      }
    }
  }
}
```

## Data Point Schema

### Performance Analytics Data Point

```typescript
{
  blobs: [
    endpoint,      // blob1: URL path (e.g., "/v1/search/isbn")
    statusCode,    // blob2: HTTP status code (e.g., "200")
    errorCode,     // blob3: Error code or "SUCCESS"
    clientIP,      // blob4: Client IP address
    datacenter     // blob5: Cloudflare datacenter (e.g., "SJC")
  ],
  doubles: [
    processingTime // double1: Response time in milliseconds
  ],
  indexes: [
    endpoint       // index1: Indexed endpoint for fast queries
  ]
}
```

## Dashboard Setup

### Recommended Panels

1. **Request Volume** - Time series of total requests
2. **Response Time (P95)** - P95 response time over time
3. **Error Rate** - Percentage of requests with errors
4. **Top Endpoints** - Most frequently called endpoints
5. **Slowest Endpoints** - Endpoints with highest P95 latency
6. **Geographic Distribution** - Requests by datacenter

### Alert Thresholds

- **P95 Response Time** > 1000ms - High latency warning
- **Error Rate** > 5% - Error rate warning
- **Error Rate** > 10% - Critical alert
- **Request Volume** < 10 req/min - Traffic drop alert

## Accessing Analytics

### Via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account
3. Navigate to **Analytics & Logs** > **Analytics Engine**
4. Select dataset: `books_api_performance`
5. Use the GraphQL explorer to run queries

### Via API (cURL)

```bash
curl -X POST https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { viewer { accounts(filter: { accountTag: \"YOUR_ACCOUNT_ID\" }) { analyticsEngineDatasets(filter: { name: \"books_api_performance\" }) { dimensions(limit: 10) { blob1 count } } } } }"
  }'
```

### Via Grafana

1. Install Cloudflare Analytics Engine data source plugin
2. Configure with API token and account ID
3. Create dashboard using GraphQL queries above
4. Set refresh interval (e.g., 1 minute for real-time monitoring)

## Cost Optimization

Analytics Engine pricing:
- **First 10M writes/month**: Free
- **Additional writes**: $0.25 per million writes

With ~1000 requests/day, annual cost: **$0** (within free tier)

To further reduce writes:
- Skip analytics for `/health` endpoint ✅ (already implemented)
- Skip analytics for static assets ✅ (already implemented)
- Sample high-volume endpoints ✅ (implemented in Issue #110)

---

## Privacy & GDPR Compliance

### Data Collection

**Personal Data Processing:**
- **IP Addresses:** Anonymized automatically (last octet zeroed for IPv4, last 80 bits zeroed for IPv6)
  - Example: `192.168.1.100` → `192.168.1.0`
  - Purpose: Geographic traffic analysis, not user identification
- **Request Paths:** Collected (contains no PII)
- **Error Codes:** Collected (contains no PII)
- **Datacenter Location:** Collected (Cloudflare colo, no PII)
- **Response Times:** Collected (performance metrics, no PII)

**No Collection Of:**
- ❌ User-identifiable information
- ❌ Authentication tokens or session IDs
- ❌ Request bodies or query parameters
- ❌ Cookies or tracking identifiers
- ❌ User agent strings

### Legal Basis (GDPR Article 6)

Analytics processing is based on **Legitimate Interest** (Article 6(1)(f)):
- **Purpose:** Service improvement and performance monitoring
- **Necessity:** Required for API reliability and capacity planning
- **Balancing Test:** Minimal data collection with anonymization safeguards

### User Rights

#### Right to Opt-Out
Users can opt out of analytics via:

**Method 1: DNT Header (Do Not Track)**
```bash
curl -H "DNT: 1" https://api.oooefam.net/v1/search/isbn?isbn=9780439708180
# Analytics will be skipped, but custom headers still added
```

**Method 2: X-Skip-Analytics Header (Internal Tools)**
```bash
curl -H "X-Skip-Analytics: true" https://api.oooefam.net/v1/search/isbn?isbn=9780439708180
# Complete analytics bypass including data writes
```

**Method 3: Disable via Environment Variable**
Set `ENABLE_PERFORMANCE_LOGGING=false` in `wrangler.toml` (global opt-out)

#### Right to Access
Users can query their analytics data via GraphQL:
```graphql
query MyTraffic($accountTag: String!, $filter: AccountAnalyticsEngineFilter) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analyticsEngineDatasets(filter: { name: "books_api_performance" }) {
        dimensions(
          limit: 100
          filter: {
            blob4: "192.168.1.0"  # Your anonymized IP
            datetime_geq: "2025-01-10T00:00:00Z"
          }
        ) {
          blob1  # Endpoint
          count
          avg: avgDouble1  # Avg response time
        }
      }
    }
  }
}
```

#### Right to Erasure
- **Automated Deletion:** All analytics data auto-deleted after **90 days** (Cloudflare Analytics Engine retention policy)
- **Manual Deletion:** Contact `support@oooefam.net` for immediate data deletion requests
- **Scope:** Deletion applies to all anonymized IP data matching the user's IP subnet

#### Right to Data Portability
Users can export their analytics data:
1. Query Analytics Engine via GraphQL (see "Right to Access" above)
2. Export results as JSON via Cloudflare API
3. Contact `support@oooefam.net` for bulk export assistance

### Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|------------------|-----------------|
| Anonymized IP | 90 days | Automatic (Cloudflare retention policy) |
| Request paths | 90 days | Automatic |
| Response times | 90 days | Automatic |
| Error codes | 90 days | Automatic |
| Datacenter location | 90 days | Automatic |

**No Long-Term Storage:** Analytics data is not exported or archived beyond Cloudflare Analytics Engine.

### Data Processors

**Cloudflare Analytics Engine:**
- **Role:** Data processor
- **Location:** EU and US data centers (EU data stays in EU)
- **Certification:** ISO 27001, SOC 2 Type II, GDPR-compliant
- **DPA:** Cloudflare Data Processing Addendum applies

### Compliance Measures

✅ **Data Minimization** - Only essential metrics collected
✅ **Anonymization** - IP addresses anonymized at collection
✅ **Purpose Limitation** - Data used only for performance monitoring
✅ **Storage Limitation** - 90-day automatic deletion
✅ **Security** - TLS encryption in transit, encrypted at rest
✅ **Opt-Out** - DNT header and custom header support
✅ **Transparency** - Public documentation of data practices

### Privacy Policy Disclosure

**Recommended Privacy Policy Language:**
```
Performance Analytics

We collect anonymized analytics data to monitor API performance and
reliability. This includes anonymized IP addresses (last octet removed),
request paths, response times, and error codes. Data is retained for 90
days and automatically deleted. You can opt out by sending a "DNT: 1"
header with your API requests.

Data is processed by Cloudflare Analytics Engine under their Data
Processing Addendum. For data deletion requests, contact
support@oooefam.net.
```

### GDPR Contact

**Data Controller:** BooksTrack API
**Contact:** support@oooefam.net
**DPO (if applicable):** Not required (no high-risk processing)

---

## Testing Analytics

### Local Development

Analytics Engine writes are **disabled** during `npx wrangler dev` unless using `remote = true` for the binding. To test locally:

1. Uncomment `remote = true` in `wrangler.toml` for `PERFORMANCE_ANALYTICS`
2. Run `npx wrangler dev`
3. Make API requests
4. Check Cloudflare dashboard for data points (may take 1-2 minutes to appear)

### Production Testing

```bash
# Make a request
curl -v https://api.oooefam.net/v1/search/isbn?isbn=9780439708180

# Check response headers
# Should include:
# X-Response-Time: 42ms
# X-Cache-Status: HIT
# (no X-Error-Code for successful requests)
```

Wait 2-3 minutes for Analytics Engine to process, then query via GraphQL.

## Troubleshooting

### No data appearing in Analytics Engine

1. Verify `ENABLE_PERFORMANCE_LOGGING` is not set to `"false"`
2. Check that `PERFORMANCE_ANALYTICS` binding exists in `wrangler.toml`
3. Verify requests are not to `/health` or `/test/` paths (skipped by design)
4. Wait 2-3 minutes for data to appear (Analytics Engine has ingestion delay)

### Headers not appearing in responses

1. Check that error responses use `errorResponse()` or `createErrorResponse()` (not raw `new Response()`)
2. Verify `trackAnalytics()` is called on the response
3. Check that response is not being cloned/modified after analytics tracking

### High Analytics Engine costs

1. Verify `/health` endpoint is skipped ✅
2. Add sampling for high-volume endpoints (e.g., track 10% of `/health` requests)
3. Reduce retention period in Analytics Engine settings

---

**Related:**
- Issue #108 - Analytics tracking implementation
- Issue #110 - Production readiness improvements (GDPR, sampling, safety)
- PR #111 - Analytics tracking pull request
- PR #95 - Analytics tracking mention (missing implementation)
- `src/middleware/analytics-tracker.js` - Implementation
- `wrangler.toml` - Analytics Engine bindings
