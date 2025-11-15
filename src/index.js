import { ProgressWebSocketDO } from "./durable-objects/progress-socket.js";
import { RateLimiterDO } from "./durable-objects/rate-limiter.js";
import { WebSocketConnectionDO } from "./durable-objects/websocket-connection.js";
import { JobStateManagerDO } from "./durable-objects/job-state-manager.js";
import * as externalApis from "./services/external-apis.ts";
import * as enrichment from "./services/enrichment.ts";
import * as aiScanner from "./services/ai-scanner.js";
import * as bookSearch from "./handlers/book-search.js";
import * as authorSearch from "./handlers/author-search.js";
import { handleAdvancedSearch } from "./handlers/search-handlers.js";
import { handleBatchScan } from "./handlers/batch-scan-handler.ts";
import { handleCSVImport } from "./handlers/csv-import.ts";
import { handleBatchEnrichment } from "./handlers/batch-enrichment.ts";
import { processAuthorBatch } from "./consumers/author-warming-consumer.js";
import { handleScheduledArchival } from "./handlers/scheduled-archival.js";
import { handleScheduledAlerts } from "./handlers/scheduled-alerts.js";
import { handleScheduledHarvest } from "./handlers/scheduled-harvest.js";
import { handleCacheMetrics } from "./handlers/cache-metrics.js";
import { handleTestMultiEdition } from "./handlers/test-multi-edition.js";
import { handleHarvestDashboard } from "./handlers/harvest-dashboard.js";
import { handleMetricsRequest } from "./handlers/metrics-handler.js";
import { handleSearchTitle } from "./handlers/v1/search-title.js";
import { handleSearchISBN } from "./handlers/v1/search-isbn.js";
import { handleSearchAdvanced } from "./handlers/v1/search-advanced.js";
import { handleSearchEditions } from "./handlers/v1/search-editions.ts";
import { adaptToUnifiedEnvelope } from "./utils/envelope-helpers.ts";
import { handleImageProxy } from "./handlers/image-proxy.js";
import { checkRateLimit } from "./middleware/rate-limiter.js";
import {
  validateRequestSize,
  validateResourceSize,
} from "./middleware/size-validator.js";
import { getCorsHeaders } from "./middleware/cors.js";
import {
  jsonResponse,
  errorResponse,
  acceptedResponse,
  notFoundResponse,
} from "./utils/response-builder.ts";
import { getProgressDOStub } from "./utils/durable-object-helpers.ts";

// Export the Durable Object classes for Cloudflare Workers runtime
export {
  ProgressWebSocketDO,
  RateLimiterDO,
  WebSocketConnectionDO,
  JobStateManagerDO,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Custom domain routing: harvest.oooefam.net root → Dashboard
    if (url.hostname === "harvest.oooefam.net" && url.pathname === "/") {
      return await handleHarvestDashboard(request, env);
    }

    // Handle OPTIONS preflight requests (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    // Route WebSocket connections to the Durable Object
    if (url.pathname === "/ws/progress") {
      const jobId = url.searchParams.get("jobId");
      if (!jobId) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing jobId parameter",
          400,
          null,
        );
      }

      // Get Durable Object instance for this specific jobId
      const doStub = getProgressDOStub(jobId, env);

      // Forward the request to the Durable Object
      return doStub.fetch(request);
    }

    // POST /api/token/refresh - Refresh authentication token for long-running jobs
    if (url.pathname === "/api/token/refresh" && request.method === "POST") {
      // Rate limiting: Prevent abuse of token refresh endpoint
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      try {
        const { jobId, oldToken } = await request.json();

        if (!jobId || !oldToken) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid request: jobId and oldToken required",
            400,
            request,
          );
        }

        // Get DO stub for this job
        const doStub = getProgressDOStub(jobId, env);

        // Refresh token via Durable Object
        const result = await doStub.refreshAuthToken(oldToken);

        if (result.error) {
          return errorResponse("AUTH_ERROR", result.error, 401, request);
        }

        // Return new token
        return jsonResponse(
          {
            jobId,
            token: result.token,
            expiresIn: result.expiresIn,
          },
          200,
          request,
        );
      } catch (error) {
        console.error("Failed to refresh token:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Failed to refresh token: ${error.message}`,
          500,
          request,
        );
      }
    }

    // GET /api/job-state/:jobId - Get current job state for reconnection sync
    if (
      url.pathname.startsWith("/api/job-state/") &&
      request.method === "GET"
    ) {
      try {
        const jobId = url.pathname.split("/").pop();

        if (!jobId) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid request: jobId required",
            400,
            request,
          );
        }

        // Validate Bearer token (REQUIRED for auth)
        const authHeader = request.headers.get("Authorization");
        const providedToken = authHeader?.replace("Bearer ", "");
        if (!providedToken) {
          return errorResponse(
            "AUTH_ERROR",
            "Missing authorization token",
            401,
            request,
          );
        }

        // Get DO stub for this job
        const doStub = getProgressDOStub(jobId, env);

        // Fetch job state and auth details (includes validation)
        const result = await doStub.getJobStateAndAuth();

        if (!result) {
          return notFoundResponse(
            "Job not found or state not initialized",
            request,
          );
        }

        const { jobState, authToken, authTokenExpiration } = result;

        // Validate token
        if (
          !authToken ||
          providedToken !== authToken ||
          Date.now() > authTokenExpiration
        ) {
          return errorResponse(
            "AUTH_ERROR",
            "Invalid or expired token",
            401,
            request,
          );
        }

        // Return job state
        return jsonResponse(jobState, 200, request);
      } catch (error) {
        console.error("Failed to get job state:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Failed to get job state: ${error.message}`,
          500,
          request,
        );
      }
    }

    // ========================================================================
    // Enrichment API Endpoint
    // ========================================================================

    // POST /api/enrichment/start - DEPRECATED: Redirect to /v1/enrichment/batch
    // This endpoint used old workIds format. iOS should migrate to /v1/enrichment/batch with books array.
    // For backward compatibility, we convert workIds to books format (assuming workId = title for now)
    if (url.pathname === "/api/enrichment/start" && request.method === "POST") {
      console.warn(
        "[DEPRECATED] /api/enrichment/start called. iOS should migrate to /v1/enrichment/batch",
      );

      // Rate limiting: Prevent denial-of-wallet attacks
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      try {
        const { jobId, workIds } = await request.json();

        // Validate request
        if (!jobId || !workIds || !Array.isArray(workIds)) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid request: jobId and workIds (array) required",
            400,
            null,
          );
        }

        if (workIds.length === 0) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid request: workIds array cannot be empty",
            400,
            null,
          );
        }

        // Convert workIds to books format (workId is treated as title for backward compat)
        // TODO: iOS should send actual book data via /v1/enrichment/batch instead
        const books = workIds.map((id) => ({ title: String(id) }));

        // Redirect to new batch enrichment handler
        const modifiedRequest = new Request(request, {
          body: JSON.stringify({ books, jobId }),
        });

        return handleBatchEnrichment(modifiedRequest, env, ctx);
      } catch (error) {
        console.error("Failed to start enrichment:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Failed to start enrichment: ${error.message}`,
          500,
          null,
        );
      }
    }

    // POST /api/enrichment/cancel - Cancel an in-flight enrichment job
    if (
      url.pathname === "/api/enrichment/cancel" &&
      request.method === "POST"
    ) {
      try {
        const { jobId } = await request.json();

        // Validate request
        if (!jobId) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid request: jobId required",
            400,
            null,
          );
        }

        // Get DO stub for this job
        const doStub = getProgressDOStub(jobId, env);

        // Call cancelJob() on the Durable Object
        const result = await doStub.cancelJob(
          "Canceled by iOS client during library reset",
        );

        // Return success response
        return jsonResponse(
          {
            jobId,
            status: "canceled",
            message: "Enrichment job canceled successfully",
          },
          200,
          request,
        );
      } catch (error) {
        console.error("Failed to cancel enrichment:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Failed to cancel enrichment: ${error.message}`,
          500,
          null,
        );
      }
    }

    // ========================================================================
    // AI Scanner Endpoint
    // ========================================================================

    // POST /api/scan-bookshelf/batch - Batch AI bookshelf scanner with WebSocket progress
    if (
      url.pathname === "/api/scan-bookshelf/batch" &&
      request.method === "POST"
    ) {
      // Rate limiting: Prevent denial-of-wallet attacks on AI batch endpoint
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      return handleBatchScan(request, env, ctx);
    }

    // POST /api/scan-bookshelf/cancel - Cancel batch processing
    if (
      url.pathname === "/api/scan-bookshelf/cancel" &&
      request.method === "POST"
    ) {
      try {
        const { jobId } = await request.json();

        if (!jobId) {
          return errorResponse("MISSING_PARAM", "jobId required", 400, null);
        }

        // Call Durable Object to cancel batch
        const doStub = getProgressDOStub(jobId, env);
        const result = await doStub.cancelBatch();

        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Cancel batch error:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          "Failed to cancel batch",
          500,
          null,
        );
      }
    }

    // ========================================================================
    // CSV Import Endpoint
    // ========================================================================

    // POST /api/import/csv-gemini - Gemini-powered CSV import with WebSocket progress
    if (
      url.pathname === "/api/import/csv-gemini" &&
      request.method === "POST"
    ) {
      // Rate limiting: Prevent denial-of-wallet attacks on AI CSV import
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      // Size validation: Prevent memory crashes (10MB limit)
      const sizeCheck = validateResourceSize(request, 10, "CSV file");
      if (sizeCheck) return sizeCheck;

      return handleCSVImport(request, env, ctx);
    }

    // POST /api/warming/upload - Cache warming via CSV upload
    if (url.pathname === "/api/warming/upload" && request.method === "POST") {
      const { handleWarmingUpload } = await import(
        "./handlers/warming-upload.js"
      );
      return handleWarmingUpload(request, env, ctx);
    }

    // GET /api/warming/dlq - Monitor dead letter queue
    if (url.pathname === "/api/warming/dlq" && request.method === "GET") {
      const { handleDLQMonitor } = await import("./handlers/dlq-monitor.js");
      return handleDLQMonitor(request, env);
    }

    // Canonical batch enrichment endpoint (POST /v1/enrichment/batch) - iOS migration
    // iOS will migrate to this endpoint via feature flag
    if (url.pathname === "/v1/enrichment/batch" && request.method === "POST") {
      // Rate limiting: Prevent denial-of-wallet attacks
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      return handleBatchEnrichment(request, env, ctx);
    }

    // POST /api/scan-bookshelf - AI bookshelf scanner with WebSocket progress
    if (url.pathname === "/api/scan-bookshelf" && request.method === "POST") {
      // Rate limiting: Prevent denial-of-wallet attacks on AI endpoint
      const rateLimitResponse = await checkRateLimit(request, env);
      if (rateLimitResponse) return rateLimitResponse;

      // Size validation: Prevent memory crashes (5MB limit per photo)
      const sizeCheck = validateResourceSize(request, 5, "image");
      if (sizeCheck) return sizeCheck;

      try {
        // Get or generate jobId
        const jobId = url.searchParams.get("jobId") || crypto.randomUUID();

        // DIAGNOSTIC: Log all incoming headers
        console.log(
          `[Diagnostic Layer 1: Main Router] === Incoming Request Headers for job ${jobId} ===`,
        );
        const aiProviderHeader = request.headers.get("X-AI-Provider");
        console.log(
          `[Diagnostic Layer 1: Main Router] X-AI-Provider header: ${aiProviderHeader ? aiProviderHeader : "NOT FOUND"}`,
        );
        console.log(
          `[Diagnostic Layer 1: Main Router] All headers:`,
          Object.fromEntries(request.headers.entries()),
        );

        // Validate content type
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          return errorResponse(
            "INVALID_REQUEST",
            "Invalid content type: image/* required",
            400,
            null,
          );
        }

        // Read image data
        const imageData = await request.arrayBuffer();

        // Get DO stub for this job
        const doStub = getProgressDOStub(jobId, env);

        // SECURITY: Generate authentication token for WebSocket connection
        const authToken = crypto.randomUUID();
        await doStub.setAuthToken(authToken);

        console.log(`[API] Auth token generated for scan job ${jobId}`);

        // CRITICAL: Wait for WebSocket ready signal before processing
        // This prevents race condition where we send updates before client connects
        console.log(
          `[API] Waiting for WebSocket ready signal for job ${jobId}`,
        );

        const readyResult = await doStub.waitForReady(5000); // 5 second timeout

        if (readyResult.timedOut || readyResult.disconnected) {
          const reason = readyResult.timedOut
            ? "timeout"
            : "WebSocket not connected";
          console.warn(
            `[API] WebSocket ready ${reason} for job ${jobId}, proceeding anyway (client may miss early updates)`,
          );

          // NEW: Log analytics event
          console.log(
            `[Analytics] websocket_ready_timeout - job_id: ${jobId}, reason: ${reason}, client_ip: ${request.headers.get("CF-Connecting-IP")}`,
          );

          // Continue processing - client might be using polling fallback
        } else {
          console.log(
            `[API] ✅ WebSocket ready for job ${jobId}, starting processing`,
          );
        }

        // Schedule AI scan via Durable Object alarm (avoids Worker CPU time limits)
        // Gemini AI processing can take 20-60s, which would exceed default 30s CPU limit
        // Alarm-based processing runs in separate context with 15-minute CPU limit
        const requestHeaders = {
          "X-AI-Provider": request.headers.get("X-AI-Provider"),
          "CF-Connecting-IP": request.headers.get("CF-Connecting-IP"),
        };

        await doStub.scheduleBookshelfScan(imageData, jobId, requestHeaders);
        console.log(
          `[API] Bookshelf scan scheduled via alarm for job ${jobId}`,
        );

        // Define stages metadata for iOS client (used for progress estimation)
        const stages = [
          { name: "Image Quality Analysis", typicalDuration: 3, progress: 0.1 },
          { name: "AI Processing", typicalDuration: 25, progress: 0.5 },
          { name: "Metadata Enrichment", typicalDuration: 12, progress: 1.0 },
        ];

        // Calculate estimated range based on total stage durations
        const totalDuration = stages.reduce(
          (sum, stage) => sum + stage.typicalDuration,
          0,
        );
        const estimatedRange = [
          Math.floor(totalDuration * 0.8),
          Math.ceil(totalDuration * 1.2),
        ];

        // Return 202 Accepted immediately with stages metadata and auth token
        return acceptedResponse(
          {
            jobId,
            token: authToken, // NEW: Token for WebSocket authentication
            status: "started",
            websocketReady: readyResult.success, // NEW: Indicates if WebSocket is ready
            message:
              "AI scan started. Connect to /ws/progress?jobId=" +
              jobId +
              " for real-time updates.",
            stages,
            estimatedRange,
          },
          request,
        );
      } catch (error) {
        console.error("Failed to start AI scan:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Failed to start AI scan: ${error.message}`,
          500,
          null,
        );
      }
    }

    // ========================================================================
    // Cache Metrics Endpoint (Phase 3)
    // ========================================================================

    // GET /api/cache/metrics - Cache performance metrics
    if (url.pathname === "/api/cache/metrics" && request.method === "GET") {
      return handleCacheMetrics(request, env);
    }

    // GET /metrics - Aggregated metrics with Analytics Engine (Phase 4)
    if (url.pathname === "/metrics" && request.method === "GET") {
      return handleMetricsRequest(request, env, ctx);
    }

    // ========================================================================
    // Book Search Endpoints - V1 (Canonical Contracts)
    // ========================================================================

    // GET /v1/search/title - Search books by title (canonical response)
    if (url.pathname === "/v1/search/title" && request.method === "GET") {
      const query = url.searchParams.get("q");
      const response = await handleSearchTitle(query, env);
      return adaptToUnifiedEnvelope(response, true);
    }

    // GET /v1/search/isbn - Search books by ISBN (canonical response)
    if (url.pathname === "/v1/search/isbn" && request.method === "GET") {
      const isbn = url.searchParams.get("isbn");
      const response = await handleSearchISBN(isbn, env);
      return adaptToUnifiedEnvelope(response, true);
    }

    // GET /v1/search/advanced - Advanced search by title and/or author (canonical response)
    if (url.pathname === "/v1/search/advanced" && request.method === "GET") {
      const title = url.searchParams.get("title") || "";
      const author = url.searchParams.get("author") || "";
      const response = await handleSearchAdvanced(title, author, env, ctx);
      return adaptToUnifiedEnvelope(response, true);
    }

    // GET /v1/editions/search - Search for all editions of a specific work
    if (url.pathname === "/v1/editions/search" && request.method === "GET") {
      const workTitle = url.searchParams.get("workTitle") || "";
      const author = url.searchParams.get("author") || "";
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const response = await handleSearchEditions(
        workTitle,
        author,
        limit,
        env,
        ctx,
      );
      return adaptToUnifiedEnvelope(response, useUnifiedEnvelope);
    }

    // ========================================================================
    // Image Proxy Endpoint
    // ========================================================================

    // GET /images/proxy - Proxy and cache book cover images via R2
    if (url.pathname === "/images/proxy" && request.method === "GET") {
      return handleImageProxy(request, env);
    }

    // ========================================================================
    // Book Search Endpoints - Legacy
    // ========================================================================

    // GET /search/title - Search books by title with caching (6h TTL)
    if (url.pathname === "/search/title") {
      const query = url.searchParams.get("q");
      if (!query) {
        return errorResponse(
          "MISSING_PARAM",
          'Missing query parameter "q"',
          400,
          null,
        );
      }

      const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
      const result = await bookSearch.searchByTitle(
        query,
        { maxResults },
        env,
        ctx,
      );

      // Extract cache headers from result
      const cacheHeaders = result._cacheHeaders || {};
      delete result._cacheHeaders; // Don't expose internal field to client

      const response = jsonResponse(result, 200, request);
      // Add cache headers
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // GET /search/isbn - Search books by ISBN with caching (7 day TTL)
    if (url.pathname === "/search/isbn") {
      const isbn = url.searchParams.get("isbn");
      if (!isbn) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing ISBN parameter",
          400,
          null,
        );
      }

      const maxResults = parseInt(url.searchParams.get("maxResults") || "1");
      const result = await bookSearch.searchByISBN(
        isbn,
        { maxResults },
        env,
        ctx,
      );

      // Extract cache headers from result
      const cacheHeaders = result._cacheHeaders || {};
      delete result._cacheHeaders; // Don't expose internal field to client

      const response = jsonResponse(result, 200, request);
      // Add cache headers
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // GET /search/author - Search books by author with pagination (6h cache)
    if (url.pathname === "/search/author") {
      const authorName = url.searchParams.get("q");
      if (!authorName) {
        return errorResponse(
          "MISSING_PARAM",
          'Missing query parameter "q"',
          400,
          null,
        );
      }

      // Support both 'limit' (new) and 'maxResults' (iOS compatibility)
      const limitParam =
        url.searchParams.get("limit") ||
        url.searchParams.get("maxResults") ||
        "50";
      const limit = parseInt(limitParam);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const sortBy = url.searchParams.get("sortBy") || "publicationYear";

      // Validate parameters
      if (limit < 1 || limit > 100) {
        return errorResponse(
          "INVALID_PARAM",
          "Limit must be between 1 and 100",
          400,
          null,
        );
      }

      if (offset < 0) {
        return errorResponse("INVALID_PARAM", "Offset must be >= 0", 400, null);
      }

      const validSortOptions = [
        "publicationYear",
        "publicationYearAsc",
        "title",
        "popularity",
      ];
      if (!validSortOptions.includes(sortBy)) {
        return errorResponse(
          "INVALID_PARAM",
          `sortBy must be one of: ${validSortOptions.join(", ")}`,
          400,
          null,
        );
      }

      const result = await authorSearch.searchByAuthor(
        authorName,
        { limit, offset, sortBy },
        env,
        ctx,
      );

      // Extract cache status for headers
      const cacheStatus = result.cached ? "HIT" : "MISS";
      const cacheSource = result.cacheSource || "NONE";

      const response = jsonResponse(result, 200, request);
      // Add cache and provider headers
      response.headers.set("Cache-Control", "public, max-age=21600"); // 6h cache
      response.headers.set("X-Cache", cacheStatus);
      response.headers.set("X-Cache-Source", cacheSource);
      response.headers.set("X-Provider", result.provider || "openlibrary");
      return response;
    }

    // GET/POST /search/advanced - Advanced multi-field search
    // GET is primary (aligns with /search/title, /search/isbn, enables HTTP caching)
    // POST supported for backward compatibility
    if (url.pathname === "/search/advanced") {
      try {
        let bookTitle, authorName, maxResults;

        if (request.method === "GET") {
          // Query parameters (iOS enrichment, documentation examples, REST standard)
          // Support both "title" and "bookTitle" for flexibility
          bookTitle =
            url.searchParams.get("title") || url.searchParams.get("bookTitle");
          authorName =
            url.searchParams.get("author") ||
            url.searchParams.get("authorName");
          maxResults = parseInt(url.searchParams.get("maxResults") || "20", 10);
        } else if (request.method === "POST") {
          // JSON body (legacy support for existing clients)
          const searchParams = await request.json();
          // Support both naming conventions: "title"/"bookTitle", "author"/"authorName"
          bookTitle = searchParams.title || searchParams.bookTitle;
          authorName = searchParams.author || searchParams.authorName;
          maxResults = searchParams.maxResults || 20;
        } else {
          // Only GET and POST allowed
          return errorResponse(
            "METHOD_NOT_ALLOWED",
            "Use GET with query parameters or POST with JSON body",
            405,
            null,
            { Allow: "GET, POST" },
          );
        }

        // Validate that at least one search parameter is provided
        if (!bookTitle && !authorName) {
          return errorResponse(
            "MISSING_PARAM",
            "At least one search parameter required (title or author)",
            400,
            null,
          );
        }

        // Call handler (works with both GET and POST)
        const result = await handleAdvancedSearch(
          { bookTitle, authorName },
          { maxResults },
          env,
        );

        const response = jsonResponse(result, 200, request);
        // Add cache header for GET requests (like /search/title)
        if (request.method === "GET") {
          response.headers.set("Cache-Control", "public, max-age=21600"); // 6h cache
        }
        return response;
      } catch (error) {
        console.error("Advanced search failed:", error);
        return errorResponse(
          "INTERNAL_ERROR",
          `Advanced search failed: ${error.message}`,
          500,
          null,
        );
      }
    }

    // ========================================================================
    // External API Routes (backward compatibility - temporary during migration)
    // ========================================================================

    // Google Books search
    if (url.pathname === "/external/google-books") {
      const query = url.searchParams.get("q");
      if (!query) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing query parameter",
          400,
          null,
        );
      }

      const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
      const result = await externalApis.searchGoogleBooks(
        query,
        { maxResults },
        env,
      );

      return jsonResponse(result, 200, null);
    }

    // Google Books ISBN search
    if (url.pathname === "/external/google-books-isbn") {
      const isbn = url.searchParams.get("isbn");
      if (!isbn) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing isbn parameter",
          400,
          null,
        );
      }

      const result = await externalApis.searchGoogleBooksByISBN(isbn, env);

      return jsonResponse(result, 200, null);
    }

    // OpenLibrary search
    if (url.pathname === "/external/openlibrary") {
      const query = url.searchParams.get("q");
      if (!query) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing query parameter",
          400,
          null,
        );
      }

      const maxResults = parseInt(url.searchParams.get("maxResults") || "20");
      const result = await externalApis.searchOpenLibrary(
        query,
        { maxResults },
        env,
      );

      return jsonResponse(result, 200, null);
    }

    // OpenLibrary author works
    if (url.pathname === "/external/openlibrary-author") {
      const author = url.searchParams.get("author");
      if (!author) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing author parameter",
          400,
          null,
        );
      }

      const result = await externalApis.getOpenLibraryAuthorWorks(author, env);

      return jsonResponse(result, 200, null);
    }

    // ISBNdb search
    if (url.pathname === "/external/isbndb") {
      const title = url.searchParams.get("title");
      if (!title) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing title parameter",
          400,
          null,
        );
      }

      const author = url.searchParams.get("author") || "";
      const result = await externalApis.searchISBNdb(title, author, env);

      return jsonResponse(result, 200, null);
    }

    // ISBNdb editions for work
    if (url.pathname === "/external/isbndb-editions") {
      const title = url.searchParams.get("title");
      const author = url.searchParams.get("author");

      if (!title || !author) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing title or author parameter",
          400,
          null,
        );
      }

      const result = await externalApis.getISBNdbEditionsForWork(
        title,
        author,
        env,
      );

      return jsonResponse(result, 200, null);
    }

    // ISBNdb book by ISBN
    if (url.pathname === "/external/isbndb-isbn") {
      const isbn = url.searchParams.get("isbn");
      if (!isbn) {
        return errorResponse(
          "MISSING_PARAM",
          "Missing isbn parameter",
          400,
          null,
        );
      }

      const result = await externalApis.getISBNdbBookByISBN(isbn, env);

      return jsonResponse(result, 200, null);
    }

    // ========================================================================
    // Test Endpoints for Durable Object Batch State Management
    // ========================================================================

    // POST /test/do/init-batch - Initialize batch job in Durable Object
    if (url.pathname === "/test/do/init-batch" && request.method === "POST") {
      try {
        const { jobId, totalPhotos, status } = await request.json();
        const doStub = getProgressDOStub(jobId, env);

        const result = await doStub.initBatch({ jobId, totalPhotos, status });

        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Test init-batch failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // GET /test/do/get-state - Get batch state from Durable Object
    if (url.pathname === "/test/do/get-state" && request.method === "GET") {
      try {
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing jobId parameter",
            400,
            null,
          );
        }

        const doStub = getProgressDOStub(jobId, env);

        const state = await doStub.getState();

        if (!state || Object.keys(state).length === 0) {
          return notFoundResponse("Job not found", null);
        }

        return jsonResponse(state, 200, request);
      } catch (error) {
        console.error("Test get-state failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // POST /test/do/update-photo - Update photo status in Durable Object
    if (url.pathname === "/test/do/update-photo" && request.method === "POST") {
      try {
        const {
          jobId,
          photoIndex,
          status,
          booksFound,
          error: photoError,
        } = await request.json();
        const doStub = getProgressDOStub(jobId, env);

        const result = await doStub.updatePhoto({
          photoIndex,
          status,
          booksFound,
          error: photoError,
        });

        if (result.error) {
          return notFoundResponse(result.error, request);
        }
        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Test update-photo failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // POST /test/do/complete-batch - Complete batch in Durable Object
    if (
      url.pathname === "/test/do/complete-batch" &&
      request.method === "POST"
    ) {
      try {
        const { jobId, status, totalBooks, photoResults, books } =
          await request.json();
        const doStub = getProgressDOStub(jobId, env);

        const result = await doStub.completeBatch({
          status,
          totalBooks,
          photoResults,
          books,
        });

        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Test complete-batch failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // GET /test/do/is-canceled - Check if batch is canceled
    if (url.pathname === "/test/do/is-canceled" && request.method === "GET") {
      try {
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          return errorResponse(
            "MISSING_PARAM",
            "Missing jobId parameter",
            400,
            null,
          );
        }

        const doStub = getProgressDOStub(jobId, env);

        const result = await doStub.isBatchCanceled();

        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Test is-canceled failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // POST /test/do/cancel-batch - Cancel batch in Durable Object
    if (url.pathname === "/test/do/cancel-batch" && request.method === "POST") {
      try {
        const { jobId } = await request.json();
        const doStub = getProgressDOStub(jobId, env);

        const result = await doStub.cancelBatch();

        return jsonResponse(result, 200, request);
      } catch (error) {
        console.error("Test cancel-batch failed:", error);
        return errorResponse("INTERNAL_ERROR", error.message, 500, null);
      }
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return jsonResponse(
        {
          status: "ok",
          worker: "api-worker",
          version: "1.0.0",
          endpoints: [
            "GET /search/title?q={query}&maxResults={n} - Title search with caching (6h TTL)",
            "GET /search/isbn?isbn={isbn}&maxResults={n} - ISBN search with caching (7 day TTL)",
            "GET /search/author?q={author}&limit={n}&offset={n}&sortBy={sort} - Author bibliography (6h TTL)",
            "GET /search/advanced?title={title}&author={author} - Advanced search (primary method, 6h cache)",
            "POST /search/advanced - Advanced search (legacy support, JSON body)",
            "POST /api/enrichment/start - Start batch enrichment job",
            "POST /api/enrichment/cancel - Cancel in-flight enrichment job (body: {jobId})",
            "POST /api/scan-bookshelf?jobId={id} - AI bookshelf scanner (upload image with Content-Type: image/*)",
            "POST /api/scan-bookshelf/batch - Batch AI scanner (body: {jobId, images: [{index, data}]})",
            "GET /ws/progress?jobId={id} - WebSocket progress updates",
            "/external/google-books?q={query}&maxResults={n}",
            "/external/google-books-isbn?isbn={isbn}",
            "/external/openlibrary?q={query}&maxResults={n}",
            "/external/openlibrary-author?author={name}",
            "/external/isbndb?title={title}&author={author}",
            "/external/isbndb-editions?title={title}&author={author}",
            "/external/isbndb-isbn?isbn={isbn}",
          ],
        },
        200,
        null,
      );
    }

    // Harvest Dashboard (public, no auth required)
    if (
      url.pathname === "/admin/harvest-dashboard" &&
      request.method === "GET"
    ) {
      return await handleHarvestDashboard(request, env);
    }

    // Test multi-edition discovery (no auth required)
    if (
      url.pathname === "/api/test-multi-edition" &&
      request.method === "GET"
    ) {
      return await handleTestMultiEdition(request, env);
    }

    // Manual ISBNdb harvest trigger (for testing, requires secret header)
    if (url.pathname === "/api/harvest-covers" && request.method === "POST") {
      // Security: Require secret header to prevent unauthorized harvests
      const authHeader = request.headers.get("X-Harvest-Secret");
      if (
        authHeader !== env.HARVEST_SECRET &&
        authHeader !== "test-local-dev"
      ) {
        return errorResponse(
          "UNAUTHORIZED",
          "Invalid or missing X-Harvest-Secret header",
          401,
          null,
        );
      }

      console.log("🌾 Manual ISBNdb harvest triggered");
      const result = await handleScheduledHarvest(env);

      if (result.success) {
        return jsonResponse(
          {
            success: result.success,
            stats: result.stats,
            message: "Harvest completed successfully",
          },
          200,
          null,
        );
      } else {
        return errorResponse(
          "INTERNAL_ERROR",
          `Harvest failed: ${result.error}`,
          500,
          null,
        );
      }
    }

    // Default 404
    return notFoundResponse(
      "The requested endpoint does not exist. Use /health to see available endpoints.",
      null,
    );
  },

  async queue(batch, env, ctx) {
    // Route queue messages to appropriate consumer
    if (batch.queue === "author-warming-queue") {
      await processAuthorBatch(batch, env, ctx);
    } else {
      console.error(`Unknown queue: ${batch.queue}`);
    }
  },

  async scheduled(event, env, ctx) {
    // Route by cron pattern
    if (event.cron === "0 2 * * *") {
      // Daily archival at 2:00 AM UTC
      await handleScheduledArchival(env, ctx);
    } else if (event.cron === "*/15 * * * *") {
      // Alert checks every 15 minutes
      await handleScheduledAlerts(env, ctx);
    } else if (event.cron === "0 3 * * *") {
      // Daily ISBNdb cover harvest at 3:00 AM UTC
      await handleScheduledHarvest(env);
    }
  },
};
