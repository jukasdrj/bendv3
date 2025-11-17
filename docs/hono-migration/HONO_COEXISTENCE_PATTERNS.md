# Hono Coexistence Patterns - Implementation Examples

**Related:** HONO_MIGRATION_PLAN.md
**Status:** Planning Phase
**Created:** November 16, 2025

---

## Overview

This document provides **concrete implementation examples** for running Hono and manual routing side-by-side during the migration period.

---

## Pattern 1: Simple Feature Flag Toggle

### Implementation

**wrangler.toml:**
```toml
[vars]
ENABLE_HONO_ROUTER = "false"  # Default: off for safety
```

**src/index.js:**
```typescript
import honoRouter from './router.ts'

export default {
  async fetch(request, env, ctx) {
    // Simple toggle
    if (env.ENABLE_HONO_ROUTER === 'true') {
      return honoRouter.fetch(request, env, ctx)
    }
    
    // Existing manual routing (unchanged)
    const url = new URL(request.url)
    // ... existing code ...
  }
}
```

### Deployment

```bash
# Test locally with Hono
echo "ENABLE_HONO_ROUTER=true" >> .dev.vars
wrangler dev

# Deploy to production (Hono off)
wrangler deploy

# Enable Hono in production
wrangler deploy --var ENABLE_HONO_ROUTER:true

# Instant rollback if needed
wrangler deploy --var ENABLE_HONO_ROUTER:false
```

---

## Pattern 2: Per-Route Migration

### Implementation

**src/index.js:**
```typescript
import honoRouter from './router.ts'

const HONO_MIGRATED_ROUTES = new Set([
  '/health',
  '/v1/search/title',
  '/v1/search/isbn',
  '/v1/scan/results',  // Path prefix - matches /v1/scan/results/:jobId
])

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // Check if this route is migrated to Hono
    const isMigrated = Array.from(HONO_MIGRATED_ROUTES).some(route => {
      return url.pathname === route || url.pathname.startsWith(route + '/')
    })
    
    if (isMigrated) {
      console.log(`[Router] Using Hono for ${url.pathname}`)
      return honoRouter.fetch(request, env, ctx)
    }
    
    // Fallback to manual routing for non-migrated routes
    console.log(`[Router] Using manual routing for ${url.pathname}`)
    const startTime = Date.now()
    
    // ... existing manual routing logic ...
  }
}
```

### Gradual Rollout

```javascript
// Week 1: Migrate simple GET routes
const HONO_MIGRATED_ROUTES = new Set([
  '/health',
  '/v1/search/title',
  '/v1/search/isbn',
])

// Week 2: Add search routes
const HONO_MIGRATED_ROUTES = new Set([
  '/health',
  '/v1/search/title',
  '/v1/search/isbn',
  '/v1/search/advanced',
  '/v1/editions/search',
])

// Week 3: Add rate-limited routes
const HONO_MIGRATED_ROUTES = new Set([
  // ... previous routes
  '/v1/enrichment/batch',
  '/api/scan-bookshelf/batch',
])

// Week 4: All routes migrated → Remove manual routing
```

---

## Pattern 3: A/B Testing with Traffic Splitting

### Implementation

**src/index.js:**
```typescript
import honoRouter from './router.ts'

function shouldUseHono(request, env) {
  // Method 1: Percentage-based (10% of traffic)
  const percentage = env.HONO_TRAFFIC_PERCENTAGE || 0
  const random = Math.random() * 100
  if (random < percentage) {
    return true
  }
  
  // Method 2: Header-based (for testing)
  if (request.headers.get('X-Use-Hono') === 'true') {
    return true
  }
  
  // Method 3: IP-based (internal testing)
  const ip = request.headers.get('CF-Connecting-IP')
  if (env.HONO_TEST_IPS?.includes(ip)) {
    return true
  }
  
  return false
}

export default {
  async fetch(request, env, ctx) {
    if (shouldUseHono(request, env)) {
      const response = await honoRouter.fetch(request, env, ctx)
      response.headers.set('X-Router', 'hono')
      return response
    }
    
    // Manual routing
    const response = await manualRouting(request, env, ctx)
    response.headers.set('X-Router', 'manual')
    return response
  }
}
```

**wrangler.toml:**
```toml
[vars]
HONO_TRAFFIC_PERCENTAGE = "10"  # Start with 10%
HONO_TEST_IPS = "203.0.113.1,203.0.113.2"  # Internal IPs for testing
```

### Gradual Rollout

```bash
# Week 1: 10% traffic
wrangler deploy --var HONO_TRAFFIC_PERCENTAGE:10

# Week 2: 25% traffic (monitor metrics)
wrangler deploy --var HONO_TRAFFIC_PERCENTAGE:25

# Week 3: 50% traffic
wrangler deploy --var HONO_TRAFFIC_PERCENTAGE:50

# Week 4: 100% traffic
wrangler deploy --var HONO_TRAFFIC_PERCENTAGE:100

# Week 5: Remove manual routing code
```

---

## Pattern 4: Analytics Comparison

### Implementation

**src/index.js:**
```typescript
import honoRouter from './router.ts'
import { trackRequestMetrics } from './utils/request-analytics.ts'

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now()
    const url = new URL(request.url)
    const useHono = env.ENABLE_HONO_ROUTER === 'true'
    
    let response
    
    if (useHono) {
      response = await honoRouter.fetch(request, env, ctx)
      
      // Track Hono metrics
      trackRequestMetrics(env, url.pathname, response.status, Date.now() - startTime, null, 'MISS', 'hono')
    } else {
      // Manual routing
      response = await manualRouting(request, env, ctx)
      
      // Track manual metrics
      trackRequestMetrics(env, url.pathname, response.status, Date.now() - startTime, null, 'MISS', 'manual')
    }
    
    return response
  }
}
```

**Update Analytics Helper:**
```typescript
// src/utils/request-analytics.ts
export function trackRequestMetrics(
  env: Env,
  endpoint: string,
  statusCode: number,
  processingTimeMs: number,
  errorCode: string | null = null,
  cacheStatus: 'HIT' | 'MISS' | 'STALE' = 'MISS',
  router: 'hono' | 'manual' = 'manual'  // NEW FIELD
): void {
  if (!env.PERFORMANCE_ANALYTICS) return
  
  try {
    env.PERFORMANCE_ANALYTICS.writeDataPoint({
      blobs: [endpoint, errorCode || 'N/A', cacheStatus, router],  // Include router
      doubles: [statusCode, processingTimeMs],
      indexes: [endpoint, router]  // Index by router for queries
    })
  } catch (error) {
    console.error('[Analytics] Failed to track:', error)
  }
}
```

### Analytics Queries

```sql
-- Compare Hono vs Manual routing performance
SELECT
  router,
  AVG(processing_time_ms) as avg_latency,
  QUANTILE(processing_time_ms, 0.95) as p95_latency,
  QUANTILE(processing_time_ms, 0.99) as p99_latency,
  COUNT(*) as request_count,
  SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) / COUNT(*) as error_rate
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY router
ORDER BY router

-- Per-endpoint comparison
SELECT
  endpoint,
  router,
  AVG(processing_time_ms) as avg_latency,
  COUNT(*) as requests
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY endpoint, router
ORDER BY endpoint, router
```

---

## Pattern 5: Canary Testing with Cloudflare Workers

### Implementation

**Use Cloudflare's Route-Based Targeting:**

```toml
# wrangler.toml - Production environment
name = "api-worker-production"
routes = [
  { pattern = "api.oooefam.net/*", zone_name = "oooefam.net" }
]

[vars]
ENABLE_HONO_ROUTER = "false"

# wrangler-canary.toml - Canary environment
name = "api-worker-canary"
routes = [
  # No routes - only accessible via workers.dev URL
]

[vars]
ENABLE_HONO_ROUTER = "true"
```

**Deployment:**
```bash
# Deploy production (manual routing)
wrangler deploy

# Deploy canary (Hono routing)
wrangler deploy --config wrangler-canary.toml

# Test canary
curl https://api-worker-canary.<subdomain>.workers.dev/v1/search/title?q=test

# If successful, promote canary to production
wrangler deploy --var ENABLE_HONO_ROUTER:true
```

---

## Pattern 6: Emergency Rollback Script

### Implementation

**scripts/rollback-hono.sh:**
```bash
#!/bin/bash
set -e

echo "🚨 Emergency Hono Rollback Initiated"

# Disable Hono router immediately
wrangler deploy --var ENABLE_HONO_ROUTER:false

echo "✅ Rollback complete. Manual routing restored."

# Verify
echo "🔍 Verifying rollback..."
HEALTH=$(curl -s https://api.oooefam.net/health | jq -r '.router')

if [ "$HEALTH" != "hono" ]; then
  echo "✅ Verified: Manual routing active"
else
  echo "❌ Warning: Hono still active. Check deployment."
  exit 1
fi

# Send alert
echo "📧 Sending alert to team..."
# (Integrate with your alerting system)

echo "✅ Rollback verified and team notified."
```

**Usage:**
```bash
chmod +x scripts/rollback-hono.sh
./scripts/rollback-hono.sh
```

---

## Pattern 7: Testing Both Routers Simultaneously

### Implementation

**tests/router-comparison.test.js:**
```typescript
import { describe, it, expect } from 'vitest'
import manualRouter from '../src/index.js'
import honoRouter from '../src/router.ts'

const testCases = [
  { path: '/v1/search/title?q=test', method: 'GET', expectedStatus: 200 },
  { path: '/v1/search/isbn?isbn=9780140328721', method: 'GET', expectedStatus: 200 },
  { path: '/v1/scan/results/job-123', method: 'GET', expectedStatus: 200 },
  { path: '/health', method: 'GET', expectedStatus: 200 },
]

describe('Router Parity Tests', () => {
  testCases.forEach(({ path, method, expectedStatus }) => {
    it(`${method} ${path} should return same status in both routers`, async () => {
      const env = getMiniflareBindings()
      const request = new Request(`https://api.oooefam.net${path}`, { method })
      
      // Test manual router
      const manualResponse = await manualRouter.fetch(request, env)
      
      // Test Hono router
      const honoResponse = await honoRouter.fetch(request, env)
      
      // Should return same status code
      expect(honoResponse.status).toBe(manualResponse.status)
      expect(honoResponse.status).toBe(expectedStatus)
      
      // Should return same content-type
      expect(honoResponse.headers.get('content-type')).toBe(
        manualResponse.headers.get('content-type')
      )
    })
  })
})
```

---

## Pattern 8: Monitoring Dashboard

### Implementation

**Create Cloudflare Dashboard for Hono Migration:**

```sql
-- Hono vs Manual Error Rate
SELECT
  router,
  SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) / COUNT(*) * 100 as error_rate_percent
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY router

-- Latency Distribution
SELECT
  router,
  QUANTILE(processing_time_ms, 0.50) as p50,
  QUANTILE(processing_time_ms, 0.95) as p95,
  QUANTILE(processing_time_ms, 0.99) as p99
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY router

-- Request Volume
SELECT
  router,
  COUNT(*) as total_requests
FROM performance_analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY router
```

**Alert Rules:**
```javascript
// Alert if Hono error rate > Manual + 2%
if (honoErrorRate > manualErrorRate + 2) {
  sendAlert('Hono error rate elevated')
  triggerRollback()
}

// Alert if Hono P95 latency > Manual + 50ms
if (honoP95 > manualP95 + 50) {
  sendAlert('Hono latency elevated')
}
```

---

## Pattern 9: Feature Flag with Environment Variables

### Implementation

**.dev.vars (Local Development):**
```bash
ENABLE_HONO_ROUTER=true
HONO_TRAFFIC_PERCENTAGE=100
```

**wrangler.toml (Staging):**
```toml
[env.staging]
vars = { ENABLE_HONO_ROUTER = "true" }
```

**wrangler.toml (Production):**
```toml
[env.production]
vars = { ENABLE_HONO_ROUTER = "false" }  # Start conservative
```

**Deployment:**
```bash
# Local: Hono enabled
wrangler dev

# Staging: Hono enabled
wrangler deploy --env staging

# Production: Hono disabled (initially)
wrangler deploy --env production

# Production: Enable Hono after validation
wrangler deploy --env production --var ENABLE_HONO_ROUTER:true
```

---

## Pattern 10: Hybrid Routing (Complex Routes Stay Manual)

### Implementation

**src/index.js:**
```typescript
import honoRouter from './router.ts'

// Routes that stay in manual routing (complex logic)
const MANUAL_ONLY_ROUTES = [
  '/api/scan-bookshelf',  // Complex inline logic with DO interaction
  '/api/token/refresh',   // Complex auth logic
  '/api/job-state',       // Complex validation
]

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // Special cases: WebSocket, custom domain
    if (url.pathname === '/ws/progress') {
      // ... WebSocket logic (manual)
    }
    
    if (url.hostname === 'harvest.oooefam.net') {
      // ... Custom domain logic (manual)
    }
    
    // Check if route should stay manual
    const isManualOnly = MANUAL_ONLY_ROUTES.some(route =>
      url.pathname.startsWith(route)
    )
    
    if (isManualOnly) {
      // Complex route - keep manual
      return manualRouting(request, env, ctx)
    }
    
    // All other routes → Hono
    return honoRouter.fetch(request, env, ctx)
  }
}
```

**Benefits:**
- ✅ Migrate simple routes first (low risk)
- ✅ Complex routes migrate later (after validation)
- ✅ Best of both worlds during transition

---

## Recommended Approach

**Our Recommendation: Pattern 1 + Pattern 2 + Pattern 4**

1. **Pattern 1:** Simple feature flag for quick toggle
2. **Pattern 2:** Per-route migration for incremental rollout
3. **Pattern 4:** Analytics comparison for validation

**Rationale:**
- Start simple (Pattern 1) for quick testing
- Add granularity (Pattern 2) for risk mitigation
- Add monitoring (Pattern 4) for confidence

**Timeline:**
- **Week 1:** Pattern 1 (feature flag) + Local testing
- **Week 2:** Pattern 2 (per-route) + 10% production traffic
- **Week 3:** Pattern 4 (analytics) + 50% production traffic
- **Week 4:** 100% traffic + Validate metrics
- **Week 5:** Remove manual routing code

---

## Conclusion

These patterns enable **zero-risk migration** from manual to Hono routing:

✅ **Instant rollback** via feature flags  
✅ **Gradual rollout** via per-route migration  
✅ **A/B testing** via traffic splitting  
✅ **Monitoring** via analytics comparison  
✅ **Hybrid approach** for complex routes  

Choose the pattern(s) that best fit your risk tolerance and deployment constraints.

---

**Document Version:** 1.0
**Last Updated:** November 16, 2025
