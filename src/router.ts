/**
 * Hono Router - Phase 1 MVP
 *
 * This router coexists with the manual routing in src/index.js
 * Feature flag: ENABLE_HONO_ROUTER (default: false)
 *
 * MVP Routes:
 * - GET /health - Health check (baseline test)
 * - GET /v1/search/isbn - ISBN search (full stack integration test)
 * - GET /metrics - Metrics endpoint (analytics integration test)
 * - GET /ws/progress - WebSocket upgrade (WebSocket routing test)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types/env";
import { handleSearchISBN } from "./handlers/v1/search-isbn";
import { handleSearchTitle } from "./handlers/v1/search-title";
import { handleSearchAdvanced } from "./handlers/v1/search-advanced";
import { handleSearchEditions } from "./handlers/v1/search-editions";
import { handleBatchEnrichment } from "./handlers/batch-enrichment";
import { handleBatchScan } from "./handlers/batch-scan-handler";
import { handleCSVImport } from "./handlers/csv-import";
import { handleMetricsRequest } from "./handlers/metrics-handler";
import { handleCacheMetrics } from "./handlers/cache-metrics.js";
import { handleHarvestDashboard } from "./handlers/harvest-dashboard.js";
import { handleImageProxy } from "./handlers/image-proxy";
import * as bookSearch from "./handlers/book-search.js";
import * as authorSearch from "./handlers/author-search.js";
import { triggerBookImportWorkflow, getWorkflowStatus } from "./handlers/workflow-trigger-handler";
import { getProgressDOStub } from "./utils/durable-object-helpers";
import { analyticsMiddleware } from "./middleware/hono-analytics";
import { checkRateLimit } from "./middleware/rate-limiter";
import { createSuccessResponse, createErrorResponse, ErrorCodes } from "./utils/response-builder";
import { validateApiContract, validateResponse } from "./middleware/api-contract-validator";

// Properly typed Hono app with Bindings and ExecutionContext support
const app = new Hono<{ Bindings: Env; Variables: { executionCtx?: ExecutionContext } }>();

// Helper to safely get ExecutionContext from Hono context
// ExecutionContext is stored in c.executionCtx by Hono's native support
const getCtx = (c: any): ExecutionContext | undefined => c.executionCtx as ExecutionContext | undefined;

// Global analytics middleware (adds X-Router and X-Response-Time headers)
app.use("*", analyticsMiddleware());

// API Contract Validation Middleware (Task 3.3 - Issue #38)
// Note: Response validation via validateApiContract middleware is applied per-route where needed
// validateResponse function available for direct use in handlers

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
      // Allow requests without Origin header (native iOS/Android apps)
      return origin ? allowedOrigins.includes(origin) : true;
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
// MVP Route 1: Health Check (Baseline Test)
// ============================================================================
app.get("/health", (c) => {
  // Note: Health endpoint uses ResponseEnvelope format for consistency (Issue #240)
  const response = new Response(JSON.stringify({
    data: {
      status: "ok",
      worker: "api-worker",
      version: "2.1.0",
      router: "hono",
    },
    metadata: {
      timestamp: new Date().toISOString(),
    },
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Response-Format": "v2.0",
    },
  });

  return response;
});

// ============================================================================
// MVP Route 2: ISBN Search (Full Stack Integration Test)
// ============================================================================
app.get("/v1/search/isbn", async (c) => {
  const isbn = c.req.query("isbn");

  // Validation: ISBN format (10 or 13 digits, hyphens allowed)
  const isbnRegex = /^(?=(?:\D*\d){10}(?:(?:\D*\d){3})?$)[\d-]+$/;

  if (!isbn || !isbnRegex.test(isbn)) {
    return c.json(
      {
        error: {
          code: "INVALID_ISBN",
          message: "A valid ISBN-10 or ISBN-13 is required",
        },
      },
      400,
    );
  }

  return await handleSearchISBN(isbn, c.env, c.req.raw, c.executionCtx);
});

// ============================================================================
// V1 Search API - Additional Routes (Week 1 Migration)
// ============================================================================

// GET /v1/search/title - Search books by title
app.get("/v1/search/title", async (c) => {
  const rawQuery = c.req.query("q");

  // Validation: Limit length to prevent DoS and ensure data quality
  const query = rawQuery?.substring(0, 200);

  if (!query || query.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Query parameter "q" is required (max 200 characters)',
        },
      },
      400,
    );
  }

  return await handleSearchTitle(query, c.env, c.req.raw);
});

// GET /v1/search/advanced - Advanced search by title and/or author
app.get("/v1/search/advanced", async (c) => {
  // Validation: Limit length to prevent DoS (max 200 chars each)
  const title = c.req.query("title")?.substring(0, 200) || "";
  const author = c.req.query("author")?.substring(0, 200) || "";

  if (!title && !author) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message:
            "At least one search parameter required (title or author, max 200 characters each)",
        },
      },
      400,
    );
  }

  return await handleSearchAdvanced(
    title,
    author,
    c.env,
    getCtx(c),
    c.req.raw,
  );
});

// ============================================================================
// Legacy Search API Routes (Deprecated - Sunset March 1, 2026)
// ============================================================================

// GET /search/title - Search books by title (DEPRECATED)
app.get("/search/title", async (c) => {
  const query = c.req.query("q");

  if (!query) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Missing query parameter "q"',
        },
      },
      400,
    );
  }

  const maxResults = parseInt(c.req.query("maxResults") || "20");
  const result = await bookSearch.searchByTitle(
    query,
    { maxResults },
    c.env,
    getCtx(c),
  );

  // Extract cache headers from result
  const cacheHeaders = result._cacheHeaders || {};
  delete result._cacheHeaders;

  const response = c.json(result, 200);

  // Add cache headers
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value as string);
  });

  // Deprecation headers (RFC 8594)
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/title instead. Sunset: March 1, 2026"',
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/title>; rel="alternate"; title="Use /v1/search/title instead"',
  );

  return response;
});

// GET /search/isbn - Search books by ISBN (DEPRECATED)
app.get("/search/isbn", async (c) => {
  const isbn = c.req.query("isbn");

  if (!isbn) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "Missing ISBN parameter",
        },
      },
      400,
    );
  }

  const maxResults = parseInt(c.req.query("maxResults") || "1");
  const result = await bookSearch.searchByISBN(
    isbn,
    { maxResults },
    c.env,
    getCtx(c),
  );

  // Extract cache headers from result
  const cacheHeaders = result._cacheHeaders || {};
  delete result._cacheHeaders;

  const response = c.json(result, 200);

  // Add cache headers
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value as string);
  });

  // Deprecation headers (RFC 8594)
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/isbn instead. Sunset: March 1, 2026"',
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/isbn>; rel="alternate"; title="Use /v1/search/isbn instead"',
  );

  return response;
});

// GET /search/author - Search books by author (DEPRECATED)
app.get("/search/author", async (c) => {
  const authorName = c.req.query("q");

  if (!authorName) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: 'Missing query parameter "q"',
        },
      },
      400,
    );
  }

  // Support both 'limit' (new) and 'maxResults' (iOS compatibility)
  const limitParam = c.req.query("limit") || c.req.query("maxResults") || "50";
  const limit = parseInt(limitParam);
  const offset = parseInt(c.req.query("offset") || "0");
  const sortBy = c.req.query("sortBy") || "publicationYear";

  // Validate parameters
  if (limit < 1 || limit > 100) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: "Limit must be between 1 and 100",
        },
      },
      400,
    );
  }

  if (offset < 0) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: "Offset must be >= 0",
        },
      },
      400,
    );
  }

  const validSortOptions = [
    "publicationYear",
    "publicationYearAsc",
    "title",
    "popularity",
  ];
  if (!validSortOptions.includes(sortBy)) {
    return c.json(
      {
        error: {
          code: "INVALID_PARAM",
          message: `sortBy must be one of: ${validSortOptions.join(", ")}`,
        },
      },
      400,
    );
  }

  const result = await authorSearch.searchByAuthor(
    authorName,
    { limit, offset, sortBy },
    c.env,
    getCtx(c),
  );

  // Extract cache status for headers
  const cacheStatus = result.cached ? "HIT" : "MISS";
  const cacheSource = result.cacheSource || "NONE";

  const response = c.json(result, 200);

  // Add cache and provider headers
  response.headers.set("Cache-Control", "public, max-age=21600"); // 6h cache
  response.headers.set("X-Cache", cacheStatus);
  response.headers.set("X-Cache-Source", cacheSource);
  response.headers.set("X-Provider", result.provider || "openlibrary");

  // Deprecation headers (RFC 8594)
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"',
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"',
  );

  return response;
});

// GET/POST /search/advanced - Advanced multi-field search (DEPRECATED)
app.get("/search/advanced", async (c) => {
  // Support both "title" and "bookTitle" for flexibility
  const bookTitle = c.req.query("title") || c.req.query("bookTitle");
  const authorName = c.req.query("author") || c.req.query("authorName");

  // Validate that at least one search parameter is provided
  if (!bookTitle && !authorName) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "At least one search parameter required (title or author)",
        },
      },
      400,
    );
  }

  // Call handler - returns Response object
  const response = await handleSearchAdvanced(
    bookTitle || "",
    authorName || "",
    c.env,
    getCtx(c),
    c.req.raw,
  );

  // Add deprecation headers to existing response
  response.headers.set("Cache-Control", "public, max-age=21600"); // 6h cache
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
  response.headers.set(
    "Warning",
    '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"',
  );
  response.headers.set(
    "Link",
    '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"',
  );

  return response;
});

// POST /search/advanced - Advanced search (POST version for backward compatibility)
app.post("/search/advanced", async (c) => {
  try {
    const searchParams = await c.req.json();
    // Support both naming conventions: "title"/"bookTitle", "author"/"authorName"
    const bookTitle = searchParams.title || searchParams.bookTitle;
    const authorName = searchParams.author || searchParams.authorName;

    // Validate that at least one search parameter is provided
    if (!bookTitle && !authorName) {
      return c.json(
        {
          error: {
            code: "MISSING_PARAM",
            message: "At least one search parameter required (title or author)",
          },
        },
        400,
      );
    }

    // Call handler - returns Response object
    const response = await handleSearchAdvanced(
      bookTitle || "",
      authorName || "",
      c.env,
      getCtx(c),
      c.req.raw,
    );

    // Add deprecation headers to existing response
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "Sat, 1 Mar 2026 00:00:00 GMT");
    response.headers.set(
      "Warning",
      '299 - "This endpoint is deprecated. Use /v1/search/advanced instead. Sunset: March 1, 2026"',
    );
    response.headers.set(
      "Link",
      '<https://api.oooefam.net/v1/search/advanced>; rel="alternate"; title="Use /v1/search/advanced instead"',
    );

    return response;
  } catch (error) {
    console.error("Advanced search failed:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Advanced search failed: ${(error as Error).message}`,
        },
      },
      500,
    );
  }
});

// ============================================================================
// Batch Endpoints (Week 1 Migration - With Rate Limiting)
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

// POST /v1/enrichment/batch - Canonical batch enrichment endpoint
app.post("/v1/enrichment/batch", rateLimitMiddleware, async (c) => {
  return await handleBatchEnrichment(c.req.raw, c.env, getCtx(c));
});

// POST /api/scan-bookshelf/batch - Batch AI bookshelf scanner
app.post("/api/scan-bookshelf/batch", rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, getCtx(c));
});

// POST /api/import/csv-gemini - Gemini-powered CSV import
app.post("/api/import/csv-gemini", rateLimitMiddleware, async (c) => {
  return await handleCSVImport(c.req.raw, c.env, getCtx(c));
});

// ============================================================================
// Cloudflare Workflows - Book Import Pipeline (Issue #71 - LAUNCH BLOCKER)
// ============================================================================

// POST /v2/import/workflow - Trigger book import workflow
// Creates a new Workflow instance for asynchronous book import
// Returns jobId and WebSocket URL for progress tracking
app.post("/v2/import/workflow", rateLimitMiddleware, async (c) => {
  return await triggerBookImportWorkflow(c.req.raw, c.env);
});

// GET /v2/import/workflow/:workflowId - Get workflow status
// Query the current status of a running workflow
app.get("/v2/import/workflow/:workflowId", async (c) => {
  const workflowId = c.req.param("workflowId");
  return await getWorkflowStatus(c.req.raw, c.env, workflowId);
});

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
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request: jobId and oldToken required",
          },
        },
        400,
      );
    }

    // Get DO stub for this job
    const doStub = getProgressDOStub(jobId, c.env);

    // Refresh token via Durable Object
    const result = await doStub.refreshAuthToken(oldToken);

    if (result.error) {
      return c.json(
        {
          error: {
            code: "AUTH_ERROR",
            message: result.error,
          },
        },
        401,
      );
    }

    // Return new token with expiration
    return c.json({
      jobId,
      token: result.token,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Failed to refresh token: ${(error as Error).message}`,
        },
      },
      500,
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

      // Get DO stub for this job
      const doStub = getProgressDOStub(jobId, c.env);

      // Fetch job state and auth details (includes validation)
      const result = await doStub.getJobStateAndAuth();

      if (!result) {
        return createErrorResponse(
          "Job not found or state not initialized",
          404,
          ErrorCodes.NOT_FOUND,
          { jobId },
          c.req.raw
        );
      }

      const { jobState, authToken, authTokenExpiration } = result;

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
      return c.json(
        {
          error: {
            code: "MISSING_PARAM",
            message: "jobId required",
          },
        },
        400,
      );
    }

    // Call Durable Object to cancel batch
    const doStub = getProgressDOStub(jobId, c.env);
    const result = await doStub.cancelBatch();

    // Return result from DO directly
    return c.json(result);
  } catch (error) {
    console.error("Cancel batch error:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to cancel batch",
        },
      },
      500,
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

// GET /api/cache/stats - Real-time cache performance statistics from CacheMetricsDO
app.get("/api/cache/stats", async (c) => {
  try {
    const id = c.env.CACHE_METRICS_DO.idFromName("cache-metrics-singleton");
    const stub = c.env.CACHE_METRICS_DO.get(id);

    // ✅ RPC MIGRATION: Direct method call (no HTTP overhead)
    const stats = await stub.getStats();
    return c.json(stats);
  } catch (error) {
    console.error("Error fetching cache stats:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error while fetching cache statistics",
        },
      },
      500,
    );
  }
});

// ============================================================================
// MVP Route 4: WebSocket Progress (WebSocket Routing Test)
// ============================================================================
app.get("/ws/progress", async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.query("jobId")?.substring(0, 100);

  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter",
        },
      },
      400,
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
  // See API_CONTRACT.md § 7.5 for complete WebSocket authentication flow

  // Get Durable Object instance for this specific jobId
  const doStub = getProgressDOStub(jobId, c.env);

  // Forward the request to the Durable Object
  // The DO will handle the WebSocket upgrade and lifecycle
  return await doStub.fetch(c.req.raw);
});

// ============================================================================
// Results Retrieval Endpoints (Week 2 Migration)
// ============================================================================

// GET /v1/scan/results/{jobId} - Retrieve AI scan results after WebSocket completion
app.get("/v1/scan/results/:jobId", async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.param("jobId")?.substring(0, 100);

  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter",
        },
      },
      400,
    );
  }

  // Retrieve from KV cache (24-hour TTL)
  const resultsKey = `scan-results:${jobId}`;
  const results = await c.env.KV_CACHE.get(resultsKey, "json");

  if (!results) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          message:
            "Scan results not found or expired. Results are stored for 24 hours after job completion.",
          code: "NOT_FOUND",
          details: {
            jobId,
            resultsKey,
            ttl: "24 hours",
          },
        },
      },
      404,
    );
  }

  return c.json({
    data: results,
    metadata: {
      timestamp: new Date().toISOString(),
      cached: true,
      provider: "kv_cache",
    },
  });
});

// GET /v1/csv/status/{jobId} - Get current CSV import job status (for fallback polling)
app.get("/v1/csv/status/:jobId", async (c) => {
  try {
    const jobId = c.req.param("jobId")?.substring(0, 100);

    if (!jobId || jobId.trim().length === 0) {
      return c.json(
        {
          error: {
            code: "MISSING_PARAM",
            message: "Missing jobId parameter",
          },
        },
        400,
      );
    }

    // Get Durable Object stub for this job
    const doStub = getProgressDOStub(jobId, c.env);

    // Fetch current job state
    const state = await doStub.getJobState();

    if (!state) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Job not found or not initialized",
          },
        },
        404,
      );
    }

    // Return job state in ResponseEnvelope format
    return c.json({
      data: state,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[CSV Status] Error fetching job state:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Failed to fetch job status: ${(error as Error).message}`,
        },
      },
      500,
    );
  }
});

// GET /v1/csv/results/{jobId} - Retrieve CSV import results after WebSocket completion
app.get("/v1/csv/results/:jobId", async (c) => {
  // Validation: Limit jobId length to prevent abuse (UUIDs are 36 chars)
  const jobId = c.req.param("jobId")?.substring(0, 100);

  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter",
        },
      },
      400,
    );
  }

  // Retrieve from KV cache (24-hour TTL)
  const resultsKey = `csv-results:${jobId}`;
  const results = await c.env.KV_CACHE.get(resultsKey, "json");

  if (!results) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          message:
            "CSV import results not found or expired. Results are stored for 24 hours after job completion.",
          code: "NOT_FOUND",
          details: {
            jobId,
            resultsKey,
            ttl: "24 hours",
          },
        },
      },
      404,
    );
  }

  return c.json({
    data: results,
    metadata: {
      timestamp: new Date().toISOString(),
      cached: true,
      provider: "kv_cache",
    },
  });
});

// ============================================================================
// Unified Results Endpoint (API Contract v2.0 - Issue #131)
// ============================================================================

// GET /v1/jobs/{jobId}/status - Unified job status polling endpoint (Issue #21)
// Replaces pipeline-specific status endpoints (/v1/csv/status)
// Supports: csv_import, batch_enrichment, ai_scan pipelines
// Rate limited to 30 req/min per IP to prevent polling abuse
app.get("/v1/jobs/:jobId/status", createRateLimitMiddleware(30), async (c) => {
  try {
    const jobId = c.req.param("jobId")?.substring(0, 100);

    if (!jobId || jobId.trim().length === 0) {
      return createErrorResponse(
        "Missing jobId parameter",
        400,
        ErrorCodes.MISSING_PARAMETER,
        { parameter: "jobId" },
        c.req.raw
      );
    }

    // Get JobStateManagerDO stub for this job
    const doId = c.env.JOB_STATE_MANAGER_DO.idFromName(jobId);
    const doStub = c.env.JOB_STATE_MANAGER_DO.get(doId);

    // Fetch current job state via RPC
    const state = await doStub.getJobState();

    if (!state) {
      return createErrorResponse(
        "Job not found or not initialized",
        404,
        ErrorCodes.NOT_FOUND,
        { jobId },
        c.req.raw
      );
    }

    // Return job state in ResponseEnvelope format
    return createSuccessResponse(
      {
        jobId: state.jobId,
        pipeline: state.pipeline,
        status: state.status,
        progress: state.progress,
        processedCount: state.processedCount,
        totalCount: state.totalCount,
        startTime: state.startTime,
        lastUpdateTime: state.lastUpdateTime,
        // Include completion/failure details if present
        ...(state.completedTime && { completedTime: state.completedTime }),
        ...(state.failedTime && { failedTime: state.failedTime }),
        ...(state.error && { error: state.error }),
        ...(state.canceled && {
          canceled: state.canceled,
          cancelReason: state.cancelReason,
          canceledTime: state.canceledTime
        }),
      },
      {
        source: "job-state-manager-do",
        timestamp: new Date().toISOString(),
      },
      200,
      c.req.raw
    );
  } catch (error) {
    console.error("[Job Status] Error fetching job state:", error);
    return createErrorResponse(
      `Failed to fetch job status: ${(error as Error).message}`,
      500,
      ErrorCodes.INTERNAL_ERROR,
      { jobId: c.req.param("jobId") },
      c.req.raw
    );
  }
});

// GET /v1/jobs/{jobId}/results - Unified results endpoint for all pipelines
// Replaces pipeline-specific endpoints (/v1/csv/results, /v1/scan/results)
// Supports: csv_import, batch_enrichment, ai_scan
app.get("/v1/jobs/:jobId/results", async (c) => {
  const jobId = c.req.param("jobId")?.substring(0, 100);

  if (!jobId || jobId.trim().length === 0) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          code: "MISSING_PARAM",
          message: "Missing jobId parameter",
        },
      },
      400,
    );
  }

  // Try all possible result keys (pipeline-agnostic lookup)
  const resultKeys = [
    `csv-results:${jobId}`,      // csv_import pipeline
    `scan-results:${jobId}`,     // ai_scan pipeline
    `job-results:${jobId}`,      // batch_enrichment pipeline (generic)
  ];

  // Try each key in parallel for fastest lookup
  const lookupPromises = resultKeys.map((key) =>
    c.env.KV_CACHE.get(key, "json").then((result) => ({ key, result }))
  );

  const lookups = await Promise.all(lookupPromises);
  const found = lookups.find((lookup) => lookup.result !== null);

  if (!found) {
    return c.json(
      {
        data: null,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        error: {
          message:
            "Job results not found or expired. Results are stored for 1 hour after job completion.",
          code: "NOT_FOUND",
          details: {
            jobId,
            ttl: "1 hour",
            checkedKeys: resultKeys,
          },
        },
      },
      404,
    );
  }

  return c.json({
    data: found.result,
    metadata: {
      timestamp: new Date().toISOString(),
      cached: true,
      provider: "kv_cache",
      resourceId: found.key,
    },
  });
});

// POST /api/batch-scan - Batch photo scanning (1-5 photos)
app.post("/api/batch-scan", rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, getCtx(c));
});

// POST /api/scan-bookshelf/batch - Batch photo scanning (alias for /api/batch-scan)
app.post("/api/scan-bookshelf/batch", rateLimitMiddleware, async (c) => {
  return await handleBatchScan(c.req.raw, c.env, getCtx(c));
});

// POST /api/scan-bookshelf/cancel - Cancel batch scan job
app.post("/api/scan-bookshelf/cancel", async (c) => {
  try {
    const { jobId } = await c.req.json();

    if (!jobId) {
      return c.json(
        {
          error: {
            code: "MISSING_PARAMETER",
            message: "jobId is required",
          },
        },
        400,
      );
    }

    // Get DO stub and cancel the batch
    const doStub = getProgressDOStub(jobId, c.env);
    await doStub.cancelBatch();

    return c.json({
      data: {
        jobId,
        canceled: true,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Scan Cancel] Error:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      },
      500,
    );
  }
});

// ============================================================================
// Additional V1 API Routes
// ============================================================================

// GET /v1/editions/search - Search for all editions of a work by title and author
app.get("/v1/editions/search", async (c) => {
  const workTitle = c.req.query("workTitle") || c.req.query("title") || "";
  const author = c.req.query("author") || "";
  const limit = parseInt(c.req.query("limit") || "20");

  if (!workTitle || workTitle.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAMETER",
          message: "workTitle query parameter is required",
        },
      },
      400,
    );
  }

  if (!author || author.trim().length === 0) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAMETER",
          message: "author query parameter is required",
        },
      },
      400,
    );
  }

  return await handleSearchEditions(workTitle, author, limit, c.env, getCtx(c), c.req.raw);
});

// GET /images/proxy - Proxy external images through API (CORS, caching)
app.get("/images/proxy", async (c) => {
  const imageUrl = c.req.query("url");

  if (!imageUrl) {
    return c.json(
      {
        error: {
          code: "MISSING_PARAMETER",
          message: "url query parameter is required",
        },
      },
      400,
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
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found: GET /test/error",
        },
      },
      404,
    );
  }

  throw new Error("Test error for onError handler validation");
});

// POST /test/cache-event - Test cache metrics by sending synthetic events
app.post("/test/cache-event", async (c) => {
  // Only available in DEBUG mode
  if (c.env.LOG_LEVEL !== "DEBUG") {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found: POST /test/cache-event",
        },
      },
      404,
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

    return c.json({
      success: true,
      message: "Sent 3 synthetic cache events",
      events: [
        { type: "hit", prefix: "edge" },
        { type: "miss", prefix: "book" },
        { type: "write", prefix: "author" },
      ],
      currentStats: stats,
    });
  } catch (error) {
    console.error("Failed to send test cache events:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to send test cache events",
          details: error.message,
        },
      },
      500,
    );
  }
});

// ============================================================================
// Global 404 Handler
// ============================================================================
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Endpoint not found: ${c.req.method} ${c.req.path}`,
      },
    },
    404,
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

  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        details: c.env.LOG_LEVEL === "DEBUG" ? err.message : undefined,
      },
    },
    500,
  );
});

export default app;
