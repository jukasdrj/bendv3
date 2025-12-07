/**
 * Hono Router - Main Application Router
 *
 * Primary HTTP router for BooksTrack backend API
 * Uses OpenAPIHono for automatic OpenAPI spec generation
 *
 * Active API Versions:
 * - V3 API - Native Hono OpenAPI (current, production)
 * - V2 API - REMOVED March 2026 (sunset completed)
 * - V1 API - REMOVED December 2025
 *
 * Core Routes:
 * - GET /health - Health check
 * - GET /metrics - Prometheus metrics
 * - GET /ws/progress - WebSocket progress tracking
 * - GET /v3/* - V3 API endpoints (see src/api-v3/)
 *
 * Documentation:
 * - GET /v3/docs - V3 Swagger UI
 * - GET /v3/openapi.json - V3 OpenAPI spec
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import type { Env } from "./types/env";
import { handleMetricsRequest } from "./handlers/metrics-handler";
import { handleCacheMetrics } from "./handlers/cache-metrics.js";
import { handleHarvestDashboard } from "./handlers/harvest-dashboard.js";
import { handleImageProxy } from "./handlers/image-proxy";
import { triggerBookImportWorkflow, getWorkflowStatus } from "./handlers/workflow-trigger-handler";
import { handleSimilarBooks, handleSemanticSearch } from "./handlers/semantic-search-handler";
import { getProgressDOStub } from "./utils/durable-object-helpers";
import { analyticsMiddleware } from "./middleware/hono-analytics";
import { healthRoute } from "./openapi/routes/health";
import { openAPIConfig } from "./openapi/config";
import { checkRateLimit } from "./middleware/rate-limiter";
import { createSuccessResponse, createErrorResponse, ErrorCodes } from "./utils/response-builder";
import { validateApiContract } from "./middleware/api-contract-validator";

// OpenAPI-enabled Hono app with Bindings and ExecutionContext support
// Using OpenAPIHono for automatic OpenAPI spec generation (Phase 1.4 POC)
const app = new OpenAPIHono<{ Bindings: Env; Variables: { executionCtx?: ExecutionContext } }>();

// Helper to safely get ExecutionContext from Hono context
// ExecutionContext is stored in c.executionCtx by Hono's native support
const getCtx = (c: any): ExecutionContext | undefined => c.executionCtx as ExecutionContext | undefined;

// Global analytics middleware (adds X-Router and X-Response-Time headers)
app.use("*", analyticsMiddleware());

// API Contract Validation Middleware (Sprint 1, Day 1-2 - OpenAPI Migration)
// Validates ResponseEnvelope format compliance on API routes
// Start in monitoring mode (strict: false) - logs violations but doesn't reject
// TODO: Enable strict mode (strict: true) after Sprint 3 when all endpoints migrated
app.use("/api/*", validateApiContract({ strict: false, logFailures: true }));

// Global CORS middleware (secure with iOS compatibility)
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow specific origins for web clients
      const allowedOrigins = [
        "https://bookstrack.oooefam.net", // Production web app
        "https://harvest.oooefam.net", // Harvest dashboard
        "capacitor://localhost", // iOS app (Capacitor)
        "http://localhost:3000", // Local dev (web)
        "http://localhost:8787", // Local dev (wrangler)
      ];
      // Return the origin string if allowed, null if not
      // Hono CORS expects: origin string (allow), null/false (block)
      // Bug fix #72: Was returning boolean which became literal "true" header
      if (!origin) {
        return "*"; // No Origin header = native app, allow all
      }
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Sec-WebSocket-Protocol",
      "Sec-WebSocket-Version",
      "Upgrade",
      "Connection",
    ],
    exposeHeaders: ["X-Router", "X-Response-Time"],
    maxAge: 86400, // 24 hours
  }),
);

// ============================================================================
// MVP Route 1: Health Check (OpenAPI Migration - Sprint 1, Day 5)
// ============================================================================
// MIGRATED TO OPENAPI: Sprint 1, Day 5 - Simple health check endpoint
// Uses Zod schemas for automatic validation and OpenAPI spec generation
app.openapi(healthRoute, (c) => {
  // Query params are validated by Zod schema (HealthQuerySchema)
  // No query parameters needed for health check

  return c.json({
    data: {
      status: "ok",
      worker: "api-worker",
      version: "2.1.0",
      router: "hono",
    },
    metadata: {
      timestamp: new Date().toISOString(),
    },
  }, 200);
});

// ============================================================================
// V1 API Routes Removed (Issue #205 - V1 Sunset March 1, 2026)
// ============================================================================
// The following V1 routes have been removed:
// - GET /v1/search/isbn (replaced by GET /v3/books/:isbn)
// - GET /v1/search/title (replaced by GET /v3/books/search?q=title)
// See docs/archive/v1-api-2026-03/README.md for migration guide

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

// Rate limiting middleware for Hono
const rateLimitMiddleware = async (c, next) => {
  const rateLimitResponse = await checkRateLimit(c.req.raw, c.env);
  if (rateLimitResponse) return rateLimitResponse;
  return await next();
};

// Rate limiting middleware with custom limit
const createRateLimitMiddleware = (maxRequests) => {
  return async (c, next) => {
    const rateLimitResponse = await checkRateLimit(c.req.raw, c.env, maxRequests);
    if (rateLimitResponse) return rateLimitResponse;
    return await next();
  };
};

// ============================================================================
// P1 WebSocket Reconnection Routes (Issue #238)
// ============================================================================
// These routes were missing from Hono router, breaking WebSocket reconnection
// for users with ENABLE_HONO_ROUTER=true (default). Matches manual router
// behavior exactly (src/index.js lines 133-430).

// POST /api/token/refresh - Refresh WebSocket authentication token
// Rate limited to prevent abuse
// Matches manual router: lines 133-180
app.post("/api/token/refresh", rateLimitMiddleware, async (c) => {
  try {
    const { jobId, oldToken } = await c.req.json();

    if (!jobId || !oldToken) {
      return createErrorResponse(
        "Invalid request: jobId and oldToken required",
        400,
        ErrorCodes.INVALID_REQUEST,
        { required: ["jobId", "oldToken"] },
        c.req.raw
      );
    }

    // Feature flag: Use refactored architecture or legacy monolithic DO
    const useRefactoredDOs = c.env.ENABLE_REFACTORED_DOS === "true";

    let result;
    if (useRefactoredDOs) {
      // NEW ARCHITECTURE: Use WEBSOCKET_CONNECTION_DO for auth token management
      const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
      const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);
      result = await wsDoStub.refreshAuthToken(oldToken);
    } else {
      // LEGACY ARCHITECTURE: Use getProgressDOStub()
      const doStub = getProgressDOStub(jobId, c.env);
      result = await doStub.refreshAuthToken(oldToken);
    }

    if (result.error) {
      return createErrorResponse(
        result.error,
        401,
        ErrorCodes.UNAUTHORIZED,
        { jobId },
        c.req.raw
      );
    }

    // Return new token with expiration - use ResponseEnvelope format
    return createSuccessResponse(
      {
        jobId,
        token: result.token,
        expiresIn: result.expiresIn,
      },
      { source: "durable-object" },
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return createErrorResponse(
      `Failed to refresh token: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      undefined,
      c.req.raw
    );
  }
});

// GET /api/job-state/:jobId - Get current job state for WebSocket reconnection
// CRITICAL: Requires Bearer token auth, validates against DO state
// Rate limited to 30 req/min per IP to prevent polling abuse (Issue #9)
// Matches manual router: lines 182-251
app.get(
  "/api/job-state/:jobId",
  createRateLimitMiddleware(30),
  async (c) => {
    try {
      const jobId = c.req.param("jobId");

      if (!jobId) {
        return createErrorResponse(
          "Invalid request: jobId required",
          400,
          ErrorCodes.INVALID_REQUEST,
          { jobId },
          c.req.raw
        );
      }

      // Validate Bearer token (REQUIRED for auth)
      const authHeader = c.req.header("Authorization");
      const providedToken = authHeader?.replace("Bearer ", "");
      if (!providedToken) {
        return createErrorResponse(
          "Missing authorization token",
          401,
          ErrorCodes.UNAUTHORIZED,
          { endpoint: "/api/job-state/:jobId" },
          c.req.raw
        );
      }

      // Feature flag: Use refactored architecture or legacy monolithic DO
      // Explicit string comparison for clarity and safety
      const useRefactoredDOs = c.env.ENABLE_REFACTORED_DOS === "true";

      let jobState: any;
      let authToken: string;
      let authTokenExpiration: number;

      if (useRefactoredDOs) {
        // NEW ARCHITECTURE: Query JOB_STATE_MANAGER_DO and WEBSOCKET_CONNECTION_DO separately
        const stateDoId = c.env.JOB_STATE_MANAGER_DO.idFromName(jobId);
        const stateDoStub = c.env.JOB_STATE_MANAGER_DO.get(stateDoId);

        const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
        const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

        // Fetch job state and auth details separately
        jobState = await stateDoStub.getJobState();
        const authResult = await wsDoStub.getAuthToken();

        if (!jobState) {
          return createErrorResponse(
            "Job not found or state not initialized",
            404,
            ErrorCodes.NOT_FOUND,
            { jobId },
            c.req.raw
          );
        }

        if (!authResult) {
          return createErrorResponse(
            "Job authentication not found",
            404,
            ErrorCodes.NOT_FOUND,
            { jobId },
            c.req.raw
          );
        }

        authToken = authResult.token;
        authTokenExpiration = authResult.expiresAt;
      } else {
        // LEGACY ARCHITECTURE: Use getProgressDOStub() which returns PROGRESS_WEBSOCKET_DO
        const doStub = getProgressDOStub(jobId, c.env);

        // Fetch job state and auth details (combined in legacy DO)
        const result = await (doStub as any).getJobStateAndAuth();

        if (!result) {
          return createErrorResponse(
            "Job not found or state not initialized",
            404,
            ErrorCodes.NOT_FOUND,
            { jobId },
            c.req.raw
          );
        }

        jobState = result.jobState;
        authToken = result.authToken;
        authTokenExpiration = result.authTokenExpiration;
      }

      // Validate token matches and is not expired
      if (
        !authToken ||
        providedToken !== authToken ||
        Date.now() > authTokenExpiration
      ) {
        return createErrorResponse(
          "Invalid or expired token",
          401,
          ErrorCodes.UNAUTHORIZED,
          { jobId, tokenExpired: Date.now() > authTokenExpiration },
          c.req.raw
        );
      }

      // Return job state with ResponseEnvelope format
      return createSuccessResponse(
        jobState,
        {
          source: "durable-object",
          timestamp: new Date().toISOString()
        },
        200,
        c.req.raw
      );
    } catch (error) {
      console.error("Failed to get job state:", error);
      return createErrorResponse(
        `Failed to get job state: ${(error as Error).message}`,
        500,
        ErrorCodes.INTERNAL_ERROR,
        { jobId: c.req.param("jobId") },
        c.req.raw
      );
    }
  }
);

// POST /api/scan-bookshelf/cancel - Cancel bookshelf scanning job
// Matches manual router: lines 404-429
app.post("/api/scan-bookshelf/cancel", async (c) => {
  try {
    const { jobId } = await c.req.json();

    if (!jobId) {
      return createErrorResponse(
        "jobId required",
        400,
        ErrorCodes.MISSING_PARAMETER,
        { parameter: "jobId" },
        c.req.raw
      );
    }

    // Feature flag: Use refactored architecture or legacy monolithic DO
    const useRefactoredDOs = c.env.ENABLE_REFACTORED_DOS === "true";

    let result;
    if (useRefactoredDOs) {
      // NEW ARCHITECTURE: Use JOB_STATE_MANAGER_DO for cancellation
      const stateDoId = c.env.JOB_STATE_MANAGER_DO.idFromName(jobId);
      const stateDoStub = c.env.JOB_STATE_MANAGER_DO.get(stateDoId);
      result = await stateDoStub.cancelJob("User canceled bookshelf scan");
    } else {
      // LEGACY ARCHITECTURE: Use getProgressDOStub()
      const doStub = getProgressDOStub(jobId, c.env);
      result = await doStub.cancelBatch();
    }

    // Return result from DO in ResponseEnvelope format
    return createSuccessResponse(
      result,
      { source: "durable-object" },
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("Cancel batch error:", error);
    return createErrorResponse(
      "Failed to cancel batch",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    );
  }
});

// ============================================================================
// MVP Route 3: Metrics (Analytics Integration Test)
// ============================================================================
app.get("/metrics", async (c) => {
  return await handleMetricsRequest(c.req.raw, c.env, getCtx(c));
});

// GET /api/cache/metrics - Cache performance metrics
app.get("/api/cache/metrics", async (c) => {
  return await handleCacheMetrics(c.req.raw, c.env);
});

// GET /admin/harvest-dashboard - ISBNdb harvest dashboard
app.get("/admin/harvest-dashboard", async (c) => {
  return await handleHarvestDashboard(c.req.raw, c.env);
});

// POST /admin/trigger-harvest - Manually trigger author expansion harvest (for testing)
app.post("/admin/trigger-harvest", async (c) => {
  try {
    console.log("[Admin] Manual harvest trigger requested");
    const { executeAuthorExpansionHarvest } = await import('./handlers/author-expansion-harvest.js');

    // Get parameters from query string or use defaults
    const authorCount = parseInt(c.req.query("authors") || "10");
    const booksPerAuthor = parseInt(c.req.query("books") || "50");

    console.log(`[Admin] Starting harvest: ${authorCount} authors, ${booksPerAuthor} books each`);

    // Execute harvest (async - don't wait for completion)
    c.executionCtx.waitUntil(
      executeAuthorExpansionHarvest(c.env, authorCount, booksPerAuthor)
        .then(result => {
          console.log("[Admin] Harvest completed:", result);
        })
        .catch(error => {
          console.error("[Admin] Harvest failed:", error);
        })
    );

    return createSuccessResponse(
      { message: "Harvest started in background", authorCount, booksPerAuthor },
      { source: "admin-trigger" },
      202,
      c.req.raw
    );
  } catch (error) {
    console.error("[Admin] Harvest trigger failed:", error);
    return createErrorResponse(
      "Failed to trigger harvest",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    );
  }
});

// GET /api/cache/stats - Real-time cache performance statistics from CacheMetricsDO
app.get("/api/cache/stats", async (c) => {
  try {
    const id = c.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = c.env.CACHE_METRICS_DO.get(id);

    // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
    const stats = await stub.getStats();
    return createSuccessResponse(
      stats,
      { source: "cache-metrics-do" },
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("Error fetching cache stats:", error);
    return createErrorResponse(
      "Internal server error while fetching cache statistics",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    );
  }
});

// ============================================================================
// Cache Dashboard & Monitoring (Issue #99)
// ============================================================================

// GET /api/cache/dashboard - Full cache dashboard with health, alerts, and stats
app.get("/api/cache/dashboard", async (c) => {
  const { handleCacheDashboard } = await import("./handlers/cache-dashboard");
  return await handleCacheDashboard(c);
});

// GET /api/cache/health - Cache health check only (lightweight)
app.get("/api/cache/health", async (c) => {
  const { handleCacheHealth } = await import("./handlers/cache-dashboard");
  return await handleCacheHealth(c);
});

// GET /api/cache/alerts - Alert history with optional limit parameter
app.get("/api/cache/alerts", async (c) => {
  const { handleCacheAlerts } = await import("./handlers/cache-dashboard");
  return await handleCacheAlerts(c);
});

// ============================================================================
// MVP Route 4: WebSocket Progress (WebSocket Routing Test)
// ============================================================================
app.get("/ws/progress", async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.query("jobId")?.substring(0, 100);

  if (!jobId || jobId.trim().length === 0) {
    return createErrorResponse(
      "Missing jobId parameter",
      400,
      ErrorCodes.MISSING_PARAMETER,
      { parameter: "jobId" },
      c.req.raw
    );
  }

  // SECURITY FIX (Issue #163): Token authentication now uses WebSocket Subprotocol
  // NEW METHOD (secure): Token passed via Sec-WebSocket-Protocol header
  //   Example: new WebSocket(url, ['bookstrack-auth.TOKEN_HERE'])
  //
  // OLD METHOD (deprecated): Token via URL query param (backward compatible)
  //   Example: wss://api.oooefam.net/ws/progress?jobId=xxx&token=yyy
  //   ⚠️ WARNING: Leaks tokens in logs, browser history, and network traffic
  //
  // Token validation happens in the Durable Object (progress-socket.js:133-178)
  // This maintains parity with manual router and follows Workers architecture:
  // - Router: validates required params and routes to correct DO
  // - DO: handles authentication, session management, and business logic
  //
  // See docs/openapi.yaml for WebSocket authentication specifications

  // Feature flag: Use refactored architecture or legacy monolithic DO
  const useRefactoredDOs = c.env.ENABLE_REFACTORED_DOS === "true";

  if (useRefactoredDOs) {
    // NEW ARCHITECTURE: Use WEBSOCKET_CONNECTION_DO for WebSocket upgrades
    const wsDoId = c.env.WEBSOCKET_CONNECTION_DO.idFromName(jobId);
    const wsDoStub = c.env.WEBSOCKET_CONNECTION_DO.get(wsDoId);

    // Forward the request to the WebSocket DO
    // The DO will handle authentication, upgrade, and lifecycle
    return await wsDoStub.fetch(c.req.raw);
  } else {
    // LEGACY ARCHITECTURE: Use getProgressDOStub()
    const doStub = getProgressDOStub(jobId, c.env);
    return await doStub.fetch(c.req.raw);
  }
});

// ============================================================================
// V1 Results/Job Status Routes Removed (Issue #205 - V1 Sunset March 1, 2026)
// ============================================================================
// The following V1 routes have been removed:
// - GET /v1/scan/results/{jobId} (replaced by GET /v3/jobs/scans/:jobId/results)
// - GET /v1/csv/status/{jobId} (replaced by GET /v3/jobs/imports/:jobId)
// - GET /v1/csv/results/{jobId} (replaced by GET /v3/jobs/imports/:jobId/results)
// - GET /v1/jobs/{jobId}/status (replaced by GET /v3/jobs/{type}/:jobId)
// See docs/archive/v1-api-2026-03/README.md for migration guide

// DELETE /v1/jobs/{jobId} - REMOVED (Issue #205 - V1 Sunset March 1, 2026)
// Replaced by DELETE /api/v2/jobs/:jobId/cancel

// GET /v1/jobs/{jobId}/results - REMOVED (Issue #205 - V1 Sunset March 1, 2026)
// Replaced by GET /v3/jobs/{type}/:jobId/results


// ============================================================================
// V1 Additional Routes Removed (Issue #205 - V1 Sunset March 1, 2026)
// ============================================================================
// GET /v1/editions/search - REMOVED (replaced by V3 work editions API)

// GET /images/proxy - Proxy external images through API (CORS, caching)
app.get("/images/proxy", async (c) => {
  const imageUrl = c.req.query("url");

  if (!imageUrl) {
    return createErrorResponse(
      "url query parameter is required",
      400,
      ErrorCodes.MISSING_PARAMETER,
      { parameter: "url" },
      c.req.raw
    );
  }

  return await handleImageProxy(imageUrl, c.env);
});

// ============================================================================
// Test Route (DEBUG mode only - for testing error handler)
// ============================================================================
app.get("/test/error", (c) => {
  // Only available in DEBUG mode for testing onError handler
  if (c.env.LOG_LEVEL !== "DEBUG") {
    return createErrorResponse(
      "Endpoint not found: GET /test/error",
      404,
      ErrorCodes.NOT_FOUND,
      undefined,
      c.req.raw
    );
  }

  throw new Error("Test error for onError handler validation");
});

// POST /test/cache-event - Test cache metrics by sending synthetic events
app.post("/test/cache-event", async (c) => {
  // Only available in DEBUG mode
  if (c.env.LOG_LEVEL !== "DEBUG") {
    return createErrorResponse(
      "Endpoint not found: POST /test/cache-event",
      404,
      ErrorCodes.NOT_FOUND,
      undefined,
      c.req.raw
    );
  }

  try {
    // Send 3 test events to CacheMetricsDO
    const id = c.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = c.env.CACHE_METRICS_DO.get(id);

    const timestamp = Date.now();

    // ✅ RPC MIGRATION: Direct method calls (no HTTP overhead)

    // Event 1: Edge cache hit
    await stub.recordEvent({
      type: "hit",
      prefix: "edge",
      key: "test:edge:hit",
      timestamp,
    });

    // Event 2: KV cache miss
    await stub.recordEvent({
      type: "miss",
      prefix: "book",
      key: "book:isbn:test123",
      timestamp,
    });

    // Event 3: KV cache write
    await stub.recordEvent({
      type: "write",
      prefix: "author",
      key: "author:search:testauthor",
      timestamp,
    });

    // Get current stats
    const stats = await stub.getStats();

    return createSuccessResponse(
      {
        message: "Sent 3 synthetic cache events",
        events: [
          { type: "hit", prefix: "edge" },
          { type: "miss", prefix: "book" },
          { type: "write", prefix: "author" },
        ],
        currentStats: stats,
      },
      {},
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("Failed to send test cache events:", error);
    return createErrorResponse(
      "Failed to send test cache events",
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    );
  }
});

// ============================================================================
// Admin Route: Trigger Recommendations Cron
// ============================================================================
app.post("/admin/trigger-recommendations", async (c) => {
  try {
    const { handleRecommendationsCron } = await import("./cron/recommendations-cron");
    await handleRecommendationsCron(c.env);

    return createSuccessResponse(
      {
        message: "Weekly recommendations cron triggered successfully",
        timestamp: new Date().toISOString(),
      },
      { source: "manual-trigger" },
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("Failed to trigger recommendations cron:", error);
    return createErrorResponse(
      `Failed to trigger recommendations cron: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { details: (error as Error).message },
      c.req.raw
    );
  }
});

// ============================================================================
// V2 API Routes Removed (Issue #206 - V2 Sunset March 7, 2026)
// ============================================================================
// All V2 endpoints have been removed after the sunset grace period.
// The following routes were migrated to V3:
// - GET /api/v2/search → Use V3 search endpoints
// - POST /api/v2/books/enrich → Use V3 enrichment endpoints
// - POST /api/v2/imports → Use V3 import jobs API
// - DELETE /api/v2/jobs/:jobId/cancel → Use V3 job cancellation
// See docs/archive/v2-openapi-2026-03.yaml for historical V2 API documentation

// ============================================================================
// Global 404 Handler
// ============================================================================
app.notFound((c) => {
  return createErrorResponse(
    `Endpoint not found: ${c.req.method} ${c.req.path}`,
    404,
    ErrorCodes.NOT_FOUND,
    { method: c.req.method, path: c.req.path },
    c.req.raw
  );
});

// ============================================================================
// Testing and Verification Routes
// ============================================================================

// GET /test/rpc-latency - Measure RPC performance (Issue #10)
app.get('/test/rpc-latency', async (c) => {
  try {
    const iterationsParam = c.req.query('iterations') || '100'
    const iterations = parseInt(iterationsParam)

    // Validation
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) {
      return c.json(
        createErrorResponse(
          ErrorCodes.INVALID_REQUEST,
          'iterations must be an integer between 1 and 10000',
          400,
        ),
        400,
      )
    }

    // Get LatencyTestDO stub
    const latencyTestId = c.env.LATENCY_TEST_DO.idFromName('default')
    const latencyTestStub = c.env.LATENCY_TEST_DO.get(latencyTestId)

    // Measure RPC latency
    const result = await latencyTestStub.measureLatency(iterations)

    // Return in ResponseEnvelope format
    return c.json(
      createSuccessResponse(result, {
        testType: 'native-rpc',
        purpose: 'Verify DO-to-DO RPC performance (Issue #10)',
        timestamp: new Date().toISOString(),
      }),
      200,
    )
  } catch (error) {
    console.error('[RPC Latency Test] Error:', error)
    return c.json(
      createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to measure RPC latency: ' + error.message,
        500,
      ),
      500,
    )
  }
})

// ============================================================================
// Global Error Handler
// ============================================================================
app.onError((err, c) => {
  console.error("[Hono] Unhandled error:", err);

  // Log to Analytics Engine asynchronously (doesn't block response)
  // Enhanced error handling: ensure writeDataPoint exists and returns a Promise
  if (
    c.env.PERFORMANCE_ANALYTICS &&
    typeof c.env.PERFORMANCE_ANALYTICS.writeDataPoint === "function"
  ) {
    try {
      // Call writeDataPoint and check if it returns a value
      const dataPointResult = c.env.PERFORMANCE_ANALYTICS.writeDataPoint({
        blobs: ["router_error", err.message, c.req.path, c.req.method],
        doubles: [1], // Error count
        indexes: ["hono"], // Router type
      });

      // BUGFIX: Only proceed if writeDataPoint returned a valid value
      if (dataPointResult) {
        // Wrap in Promise.resolve() to guarantee a Promise for .catch()
        const dataPointPromise = Promise.resolve(dataPointResult);

        // ExecutionContext may not be available in Hono context, skip if not present
        const ctx = getCtx(c);
        if (ctx) {
          ctx.waitUntil(
            dataPointPromise.catch((analyticsErr) => {
              console.error(
                "[Hono] Failed to log error to Analytics Engine:",
                analyticsErr,
              );
              // Note: Simple retry omitted to avoid exceeding Workers execution limits
              // Analytics failures are logged but not retried to maintain performance
            }),
          );
        }
      }
    } catch (syncError) {
      // Catch synchronous errors during writeDataPoint invocation
      console.error(
        "[Hono] Synchronous error when attempting to log to Analytics Engine:",
        syncError,
      );
      // Log sync errors via waitUntil to ensure they're captured
      const ctx = getCtx(c);
      if (ctx) {
        ctx.waitUntil(
          Promise.resolve().then(() => {
            console.warn("[Hono] Analytics sync error captured in error handler");
          }),
        );
      }
    }
  } else {
    // Warn if Analytics binding is missing or misconfigured
    console.warn(
      "[Hono] PERFORMANCE_ANALYTICS binding missing or invalid - error metrics will not be logged",
    );
  }

  return createErrorResponse(
    "An unexpected error occurred",
    500,
    ErrorCodes.INTERNAL_ERROR,
    c.env.LOG_LEVEL === "DEBUG" ? { details: err.message } : undefined,
    c.req.raw
  );
});

// ============================================================================
// OpenAPI Documentation Endpoints (Phase 1.4 POC)
// ============================================================================

// GET /doc - Swagger UI
app.get(
  "/doc",
  swaggerUI({
    url: "/doc/openapi.json",
  })
);

// GET /doc/openapi.json - OpenAPI JSON spec
// Use the simple app.doc() method with our configuration
app.doc("/doc/openapi.json", openAPIConfig);

console.log("[OpenAPI] Registered /doc/openapi.json endpoint");

// ============================================================================
// V3 API - Native @hono/zod-openapi (December 2025 - iOS Migration)
// ============================================================================
// Mount the v3 API using native @hono/zod-openapi for:
// - Full zod@4 compatibility (no version conflicts)
// - Direct OpenAPI route definitions with createRoute()
// - Separate OpenAPI documentation at /v3/docs
// - Type-safe request/response handling
// - Integration with existing service layer (Alexandria, DOs, etc.)
import { createV3Router } from "./api-v3/index";
import openapiSpec from "./api-v3/openapi-static.json";

try {
  const v3Router = createV3Router();
  app.route("/", v3Router);

  // Serve static OpenAPI spec (workaround for OpenAPIHono sub-router limitation)
  // The .doc() method and .getOpenAPIDocument() don't work when mounted with app.route()
  app.get("/v3/openapi.json", (c) => {
    return c.json(openapiSpec, 200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    });
  });

  console.log("[V3 API] Successfully mounted native @hono/zod-openapi routes");
  console.log("[V3 API] Static OpenAPI spec available at /v3/openapi.json");
} catch (error) {
  console.error("[V3 API] Failed to mount v3 routes:", error);
  // Don't crash the worker - v1/v2 routes should still work
}

export default app;
