# Hono Implementation Templates - Ready-to-Use Code

**Related:** HONO_MIGRATION_PLAN.md, HONO_COEXISTENCE_PATTERNS.md
**Status:** Planning Phase (Copy-Paste Ready)
**Created:** November 16, 2025

---

## Overview

This document provides **ready-to-use code templates** for the Hono migration. Each template can be **copied directly** into the appropriate file during implementation.

---

## Template 1: Complete `src/router.ts`

**File:** `src/router.ts` (new file)

```typescript
import { Hono } from 'hono'
import type { Env } from './types'

// ========================================================================
// V1 Search Handlers
// ========================================================================
import { handleSearchTitle } from './handlers/v1/search-title.js'
import { handleSearchISBN } from './handlers/v1/search-isbn.js'
import { handleSearchAdvanced } from './handlers/v1/search-advanced.js'
import { handleSearchEditions } from './handlers/v1/search-editions.ts'

// ========================================================================
// Results Handlers
// ========================================================================
import { handleScanResults } from './handlers/v1/scan-results.ts'
import { handleCSVResults } from './handlers/v1/csv-results.ts'

// ========================================================================
// Batch Processing Handlers
// ========================================================================
import { handleBatchEnrichment } from './handlers/batch-enrichment.ts'
import { handleBatchScan } from './handlers/batch-scan-handler.ts'
import { handleCSVImport } from './handlers/csv-import.ts'

// ========================================================================
// Utility Handlers
// ========================================================================
import { handleImageProxy } from './handlers/image-proxy.ts'
import { handleWarmingUpload } from './handlers/warming-upload.js'
import { handleDLQMonitor } from './handlers/dlq-monitor.js'
import { handleCacheMetrics } from './handlers/cache-metrics.js'
import { handleMetricsRequest } from './handlers/metrics-handler.js'

// ========================================================================
// Middleware
// ========================================================================
import { checkRateLimit } from './middleware/rate-limiter.js'

// ========================================================================
// Initialize Hono App
// ========================================================================
const app = new Hono<{ Bindings: Env }>()

// ========================================================================
// Rate Limiting Middleware
// ========================================================================
const rateLimitMiddleware = async (c, next) => {
  const rateLimitResponse = await checkRateLimit(c.req.raw, c.env)
  if (rateLimitResponse) return rateLimitResponse
  await next()
}

// ========================================================================
// V1 Search Routes (Canonical API)
// ========================================================================

app.get('/v1/search/title', async (c) => {
  const query = c.req.query('q')
  return handleSearchTitle(query, c.env, c.req.raw)
})

app.get('/v1/search/isbn', async (c) => {
  const isbn = c.req.query('isbn')
  return handleSearchISBN(isbn, c.env, c.req.raw)
})

app.get('/v1/search/advanced', async (c) => {
  const title = c.req.query('title') || ''
  const author = c.req.query('author') || ''
  return handleSearchAdvanced(title, author, c.env, c.executionCtx, c.req.raw)
})

app.get('/v1/editions/search', async (c) => {
  const workTitle = c.req.query('workTitle') || ''
  const author = c.req.query('author') || ''
  const limit = parseInt(c.req.query('limit') || '20')
  return handleSearchEditions(workTitle, author, limit, c.env, c.executionCtx, c.req.raw)
})

// ========================================================================
// Results Retrieval Routes
// ========================================================================

app.get('/v1/scan/results/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  return handleScanResults(jobId, c.env, c.req.raw)
})

app.get('/v1/csv/results/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  return handleCSVResults(jobId, c.env, c.req.raw)
})

// ========================================================================
// Enrichment Routes (Rate-Limited)
// ========================================================================

app.post('/v1/enrichment/batch', rateLimitMiddleware, async (c) => {
  return handleBatchEnrichment(c.req.raw, c.env, c.executionCtx)
})

// Deprecated endpoint (backward compatibility)
app.post('/api/enrichment/start', rateLimitMiddleware, async (c) => {
  console.warn('[DEPRECATED] /api/enrichment/start called. iOS should migrate to /v1/enrichment/batch')
  
  const { workIds, jobId } = await c.req.json()
  
  // Convert old format to new format
  const books = workIds.map(id => ({ title: String(id) }))
  const modifiedRequest = new Request(c.req.raw, {
    body: JSON.stringify({ books, jobId })
  })
  
  const response = await handleBatchEnrichment(modifiedRequest, c.env, c.executionCtx)
  
  // Add deprecation headers (RFC 8594)
  response.headers.set('Deprecation', 'true')
  response.headers.set('Sunset', 'Sat, 1 Mar 2026 00:00:00 GMT')
  response.headers.set('Warning', '299 - "Use /v1/enrichment/batch instead. Sunset: March 1, 2026"')
  response.headers.set('Link', '<https://api.oooefam.net/v1/enrichment/batch>; rel="alternate"')
  
  return response
})

// ========================================================================
// AI Scanner Routes (Rate-Limited)
// ========================================================================

app.post('/api/scan-bookshelf/batch', rateLimitMiddleware, async (c) => {
  return handleBatchScan(c.req.raw, c.env, c.executionCtx)
})

app.post('/api/import/csv-gemini', rateLimitMiddleware, async (c) => {
  return handleCSVImport(c.req.raw, c.env, c.executionCtx)
})

// ========================================================================
// Cache Warming Routes
// ========================================================================

app.post('/api/warming/upload', async (c) => {
  return handleWarmingUpload(c.req.raw, c.env, c.executionCtx)
})

app.get('/api/warming/dlq', async (c) => {
  return handleDLQMonitor(c.req.raw, c.env)
})

// ========================================================================
// Monitoring & Metrics Routes
// ========================================================================

app.get('/api/cache/metrics', async (c) => {
  return handleCacheMetrics(c.req.raw, c.env)
})

app.get('/metrics', async (c) => {
  return handleMetricsRequest(c.req.raw, c.env)
})

// ========================================================================
// Image Proxy Route
// ========================================================================

app.get('/images/proxy', async (c) => {
  return handleImageProxy(c.req.raw, c.env)
})

// ========================================================================
// Health Check Route
// ========================================================================

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    worker: 'api-worker',
    version: '2.1.0',
    router: 'hono',  // Indicates Hono is active
    timestamp: new Date().toISOString()
  })
})

// ========================================================================
// 404 Not Found Handler
// ========================================================================

app.notFound((c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${c.req.method} ${c.req.path}`
    }
  }, 404)
})

// ========================================================================
// Global Error Handler
// ========================================================================

app.onError((err, c) => {
  console.error('[Hono] Unhandled error:', err)
  
  return c.json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  }, 500)
})

// ========================================================================
// Export Hono App
// ========================================================================

export default app
```

---

## Template 2: Refactored `src/index.js`

**File:** `src/index.js` (modified)

```typescript
import honoRouter from './router.ts'
import { ProgressWebSocketDO } from './durable-objects/progress-socket.js'
import { RateLimiterDO } from './durable-objects/rate-limiter.js'
import { WebSocketConnectionDO } from './durable-objects/websocket-connection.js'
import { JobStateManagerDO } from './durable-objects/job-state-manager.js'
import { handleHarvestDashboard } from './handlers/harvest-dashboard.js'
import { handleScheduledArchival } from './handlers/scheduled-archival.js'
import { handleScheduledAlerts } from './handlers/scheduled-alerts.js'
import { handleScheduledHarvest } from './handlers/scheduled-harvest.js'
import { processAuthorBatch } from './consumers/author-warming-consumer.js'
import { getCorsHeaders } from './middleware/cors.js'
import { getProgressDOStub } from './utils/durable-object-helpers.ts'
import { trackRequestMetrics, addAnalyticsHeaders } from './utils/request-analytics.ts'

// ========================================================================
// Export Durable Object Classes
// ========================================================================
export { ProgressWebSocketDO, RateLimiterDO, WebSocketConnectionDO, JobStateManagerDO }

// ========================================================================
// Main Worker Export
// ========================================================================
export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request, env, ctx) {
    const startTime = Date.now()
    const url = new URL(request.url)
    let cacheStatus = 'MISS'
    let errorCode = null

    try {
      // =====================================================================
      // Custom Domain Routing: harvest.oooefam.net → Dashboard
      // =====================================================================
      if (url.hostname === 'harvest.oooefam.net' && url.pathname === '/') {
        const response = await handleHarvestDashboard(request, env)
        return addAnalyticsHeaders(response, startTime, cacheStatus, errorCode)
      }

      // =====================================================================
      // CORS Preflight Requests
      // =====================================================================
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(request)
        })
      }

      // =====================================================================
      // WebSocket Routing to Durable Object
      // =====================================================================
      if (url.pathname === '/ws/progress') {
        const jobId = url.searchParams.get('jobId')
        if (!jobId) {
          return new Response('Missing jobId parameter', { status: 400 })
        }

        // Get Durable Object stub and forward request
        const doStub = getProgressDOStub(jobId, env)
        return doStub.fetch(request)
      }

      // =====================================================================
      // All Other Routes → Hono Router
      // =====================================================================
      const response = await honoRouter.fetch(request, env, ctx)
      
      // Track metrics
      trackRequestMetrics(
        env,
        url.pathname,
        response.status,
        Date.now() - startTime,
        errorCode,
        cacheStatus
      )
      
      return addAnalyticsHeaders(response, startTime, cacheStatus, errorCode)
      
    } catch (error) {
      console.error('[Worker] Unhandled error:', error)
      errorCode = 'INTERNAL_ERROR'
      
      const response = new Response('Internal server error', { status: 500 })
      
      trackRequestMetrics(
        env,
        url.pathname,
        500,
        Date.now() - startTime,
        errorCode,
        cacheStatus
      )
      
      return addAnalyticsHeaders(response, startTime, cacheStatus, errorCode)
    }
  },

  /**
   * Queue Consumer Handler
   */
  async queue(batch, env, ctx) {
    if (batch.queue === 'author-warming-queue') {
      await processAuthorBatch(batch, env, ctx)
    } else {
      console.error(`[Queue] Unknown queue: ${batch.queue}`)
    }
  },

  /**
   * Scheduled Task Handler (Cron)
   */
  async scheduled(event, env, ctx) {
    if (event.cron === '0 2 * * *') {
      // Daily archival at 2:00 AM UTC
      await handleScheduledArchival(env, ctx)
    } else if (event.cron === '*/15 * * * *') {
      // Alert checks every 15 minutes
      await handleScheduledAlerts(env, ctx)
    } else if (event.cron === '0 3 * * *') {
      // Daily ISBNdb cover harvest at 3:00 AM UTC
      await handleScheduledHarvest(env)
    } else {
      console.warn(`[Scheduled] Unknown cron: ${event.cron}`)
    }
  }
}
```

---

## Template 3: Analytics Helpers

**File:** `src/utils/request-analytics.ts` (new file)

```typescript
import type { Env } from '../types'

/**
 * Track request-level metrics to Analytics Engine
 */
export function trackRequestMetrics(
  env: Env,
  endpoint: string,
  statusCode: number,
  processingTimeMs: number,
  errorCode: string | null = null,
  cacheStatus: 'HIT' | 'MISS' | 'STALE' = 'MISS'
): void {
  if (!env.PERFORMANCE_ANALYTICS) {
    console.warn('[Analytics] PERFORMANCE_ANALYTICS binding not available')
    return
  }
  
  try {
    env.PERFORMANCE_ANALYTICS.writeDataPoint({
      blobs: [
        endpoint,
        errorCode || 'N/A',
        cacheStatus
      ],
      doubles: [
        statusCode,
        processingTimeMs
      ],
      indexes: [
        endpoint  // Index by endpoint for efficient queries
      ]
    })
  } catch (error) {
    console.error('[Analytics] Failed to track metrics:', error)
  }
}

/**
 * Add analytics headers to response
 */
export function addAnalyticsHeaders(
  response: Response,
  startTime: number,
  cacheStatus: 'HIT' | 'MISS' | 'STALE' = 'MISS',
  errorCode: string | null = null
): Response {
  const processingTime = Date.now() - startTime
  const headers = new Headers(response.headers)
  
  // Add timing headers
  headers.set('X-Response-Time', `${processingTime}ms`)
  headers.set('X-Cache-Status', cacheStatus)
  
  // Add error code if present
  if (errorCode) {
    headers.set('X-Error-Code', errorCode)
  }
  
  // Return new response with added headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
```

---

## Template 4: Feature Flag Configuration

**File:** `wrangler.toml` (modified)

```toml
# Add this to your existing wrangler.toml

[vars]
# ... existing vars ...

# Hono Router Feature Flag (Phase 1: Off by default for safety)
ENABLE_HONO_ROUTER = "false"
```

**File:** `.dev.vars` (for local development)

```bash
# Add this to your .dev.vars file (create if it doesn't exist)

# Enable Hono for local testing
ENABLE_HONO_ROUTER=true
```

---

## Template 5: Coexistence Index (Feature Flag Version)

**File:** `src/index.js` (alternative version with feature flag)

```typescript
import honoRouter from './router.ts'
// ... other imports ...

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now()
    const url = new URL(request.url)
    
    // =====================================================================
    // Feature Flag: Toggle between Hono and Manual Routing
    // =====================================================================
    const useHono = env.ENABLE_HONO_ROUTER === 'true'
    
    if (useHono) {
      console.log('[Router] Using Hono routing')
      
      try {
        // Custom domain routing (pre-Hono)
        if (url.hostname === 'harvest.oooefam.net' && url.pathname === '/') {
          return handleHarvestDashboard(request, env)
        }
        
        // CORS preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: getCorsHeaders(request) })
        }
        
        // WebSocket routing
        if (url.pathname === '/ws/progress') {
          const jobId = url.searchParams.get('jobId')
          if (!jobId) return new Response('Missing jobId', { status: 400 })
          return getProgressDOStub(jobId, env).fetch(request)
        }
        
        // All other routes → Hono
        const response = await honoRouter.fetch(request, env, ctx)
        trackRequestMetrics(env, url.pathname, response.status, Date.now() - startTime)
        return addAnalyticsHeaders(response, startTime)
        
      } catch (error) {
        console.error('[Hono] Error:', error)
        return new Response('Internal error', { status: 500 })
      }
    }
    
    // =====================================================================
    // Manual Routing (Existing Logic - UNCHANGED)
    // =====================================================================
    console.log('[Router] Using manual routing')
    
    // ... EXISTING MANUAL ROUTING CODE (UNCHANGED) ...
    // (Keep all your existing if/else routing logic here)
  }
}
```

---

## Template 6: Test File for Hono Router

**File:** `tests/router.test.js` (new file)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev } from 'wrangler'

describe('Hono Router Tests', () => {
  let worker

  beforeAll(async () => {
    // Start worker with Hono enabled
    worker = await unstable_dev('src/index.js', {
      vars: {
        ENABLE_HONO_ROUTER: 'true'
      }
    })
  })

  afterAll(async () => {
    await worker.stop()
  })

  describe('Health Check', () => {
    it('should return status ok with hono router indicator', async () => {
      const resp = await worker.fetch('/health')
      expect(resp.status).toBe(200)
      
      const data = await resp.json()
      expect(data.status).toBe('ok')
      expect(data.router).toBe('hono')
    })
  })

  describe('V1 Search Routes', () => {
    it('should handle /v1/search/title with query parameter', async () => {
      const resp = await worker.fetch('/v1/search/title?q=test')
      expect(resp.status).toBe(200)
    })

    it('should handle /v1/search/isbn with isbn parameter', async () => {
      const resp = await worker.fetch('/v1/search/isbn?isbn=9780140328721')
      expect(resp.status).toBe(200)
    })

    it('should handle /v1/search/advanced with multiple parameters', async () => {
      const resp = await worker.fetch('/v1/search/advanced?title=test&author=test')
      expect(resp.status).toBe(200)
    })
  })

  describe('Path Parameters', () => {
    it('should extract jobId from /v1/scan/results/:jobId', async () => {
      const resp = await worker.fetch('/v1/scan/results/test-job-123')
      expect(resp.status).toBe(200)
    })

    it('should extract jobId from /v1/csv/results/:jobId', async () => {
      const resp = await worker.fetch('/v1/csv/results/test-job-456')
      expect(resp.status).toBe(200)
    })
  })

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const resp = await worker.fetch('/unknown/route')
      expect(resp.status).toBe(404)
      
      const data = await resp.json()
      expect(data.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Deprecation Headers', () => {
    it('should include deprecation headers on /api/enrichment/start', async () => {
      const resp = await worker.fetch('/api/enrichment/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'test', workIds: ['work1'] })
      })
      
      expect(resp.headers.get('Deprecation')).toBe('true')
      expect(resp.headers.get('Sunset')).toContain('2026')
    })
  })
})
```

---

## Template 7: Deployment Scripts

**File:** `scripts/deploy-hono.sh` (new file)

```bash
#!/bin/bash
set -e

echo "🚀 Deploying BooksTrack API Worker with Hono Router"

# Confirm deployment
read -p "Deploy to production with Hono enabled? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Deployment cancelled"
  exit 1
fi

# Deploy with Hono enabled
echo "📦 Deploying with ENABLE_HONO_ROUTER=true..."
wrangler deploy --var ENABLE_HONO_ROUTER:true

echo "✅ Deployment complete!"

# Verify deployment
echo "🔍 Verifying deployment..."
sleep 3
HEALTH=$(curl -s https://api.oooefam.net/health | jq -r '.router')

if [ "$HEALTH" == "hono" ]; then
  echo "✅ Verified: Hono router is active"
else
  echo "⚠️  Warning: Expected 'hono', got '$HEALTH'"
fi

echo "📊 Monitor at: https://dash.cloudflare.com"
```

---

## Template 8: Rollback Script

**File:** `scripts/rollback-hono.sh` (new file)

```bash
#!/bin/bash
set -e

echo "🚨 Emergency Hono Rollback Initiated"

# Disable Hono immediately
wrangler deploy --var ENABLE_HONO_ROUTER:false

echo "✅ Rollback deployed. Verifying..."
sleep 3

# Verify rollback
HEALTH=$(curl -s https://api.oooefam.net/health | jq -r '.router // "manual"')

if [ "$HEALTH" != "hono" ]; then
  echo "✅ Verified: Manual routing restored"
else
  echo "❌ Warning: Hono still active. Check deployment."
  exit 1
fi

echo "✅ Rollback complete and verified."
```

---

## Usage Instructions

### Step 1: Install Hono

```bash
npm install hono
```

### Step 2: Create New Files

1. Create `src/router.ts` using **Template 1**
2. Create `src/utils/request-analytics.ts` using **Template 3**
3. Create `tests/router.test.js` using **Template 6**
4. Create `scripts/deploy-hono.sh` using **Template 7**
5. Create `scripts/rollback-hono.sh` using **Template 8**

### Step 3: Modify Existing Files

1. Update `src/index.js` using **Template 2** or **Template 5**
2. Update `wrangler.toml` using **Template 4**
3. Create `.dev.vars` using **Template 4**

### Step 4: Test Locally

```bash
# Enable Hono locally
echo "ENABLE_HONO_ROUTER=true" >> .dev.vars

# Start dev server
wrangler dev

# Test health endpoint
curl http://localhost:8787/health
# Should return: {"router":"hono"}

# Run tests
npm test
```

### Step 5: Deploy to Production

```bash
# Make deploy script executable
chmod +x scripts/deploy-hono.sh
chmod +x scripts/rollback-hono.sh

# Deploy (Hono disabled by default)
wrangler deploy

# Enable Hono when ready
./scripts/deploy-hono.sh

# If issues arise, rollback
./scripts/rollback-hono.sh
```

---

## Checklist

**Before Implementation:**
- [ ] Read `HONO_MIGRATION_PLAN.md`
- [ ] Understand coexistence patterns
- [ ] Review all templates in this document

**During Implementation:**
- [ ] Install Hono: `npm install hono`
- [ ] Create `src/router.ts` (Template 1)
- [ ] Create `src/utils/request-analytics.ts` (Template 3)
- [ ] Update `src/index.js` (Template 2 or 5)
- [ ] Update `wrangler.toml` (Template 4)
- [ ] Create test file (Template 6)
- [ ] Create deployment scripts (Templates 7 & 8)

**Testing:**
- [ ] Run `npm test` - all tests pass
- [ ] Test locally with `wrangler dev`
- [ ] Verify health endpoint returns `{"router":"hono"}`
- [ ] Test all critical endpoints

**Deployment:**
- [ ] Deploy with Hono disabled (default)
- [ ] Enable Hono via `./scripts/deploy-hono.sh`
- [ ] Monitor error rates and latency
- [ ] Keep rollback script ready

**Post-Deployment:**
- [ ] Monitor Analytics Engine metrics
- [ ] Verify all endpoints working
- [ ] Check error rates <0.5%
- [ ] Remove manual routing code (after validation)

---

**Document Version:** 1.0
**Last Updated:** November 16, 2025
**Status:** Ready for Implementation
