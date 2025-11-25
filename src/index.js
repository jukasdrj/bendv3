/**
 * BooksTrack API Worker - Main Entry Point
 *
 * This file serves as the main entry point for the Cloudflare Worker.
 * All routing is handled by the Hono router in src/router.ts.
 *
 * HISTORY:
 * - Nov 21, 2025: Manual router removed (Issue #243)
 * - Archived manual router code: docs/archive/manual-router-legacy-2025-11-21.js
 * - Now uses Hono router exclusively for all HTTP routing
 */

import { ProgressWebSocketDO } from "./durable-objects/progress-socket.js";
import { ProgressWebSocketDO_Hibernation } from "./durable-objects/progress-socket-hibernation.js";
import { RateLimiterDO } from "./durable-objects/rate-limiter.js";
import { WebSocketConnectionDO } from "./durable-objects/websocket-connection.js";
import { JobStateManagerDO } from "./durable-objects/job-state-manager.js";
import { CacheMetricsDO } from "./durable-objects/cache-metrics.js";
import { LatencyTestDO } from "./durable-objects/latency-test-do.js";
// Cloudflare Workflows (Issue #71 - LAUNCH BLOCKER)
import { BookImportWorkflow } from "./workflows/import-book.ts";
import honoRouter from "./router.ts";
import { processAuthorBatch } from "./consumers/author-warming-consumer.js";
import { handleScheduledArchival } from "./handlers/scheduled-archival.js";
import { handleScheduledAlerts } from "./handlers/scheduled-alerts.js";
import { handleScheduledHarvest } from "./handlers/scheduled-harvest.js";
import { handleRecommendationsCron } from "./cron/recommendations-cron.ts";
import { handleScheduledCacheWarming } from "./handlers/scheduled-cache-warming.js";

// Export Durable Object classes for Cloudflare Workers runtime
export {
  ProgressWebSocketDO,
  ProgressWebSocketDO_Hibernation,
  RateLimiterDO,
  WebSocketConnectionDO,
  JobStateManagerDO,
  CacheMetricsDO,
  LatencyTestDO,
};

// Export Workflow classes for Cloudflare Workflows runtime (Issue #71)
export { BookImportWorkflow };

/**
 * Main fetch handler - routes all HTTP requests to Hono router
 */
export default {
  async fetch(request, env, ctx) {
    console.log(`[Worker] Routing request via Hono: ${request.method} ${new URL(request.url).pathname}`);
    return honoRouter.fetch(request, env, ctx);
  },

  /**
   * Scheduled handler - executes cron jobs defined in wrangler.jsonc
   */
  async scheduled(event, env, ctx) {
    const cronName = event.cron;
    console.log(`[Cron] Executing scheduled job: ${cronName}`);

    try {
      switch (cronName) {
        case "0 2 * * *": // Daily at 2 AM UTC
          console.log("[Cron] Running daily archival job");
          await handleScheduledArchival(env, ctx);
          break;

        case "*/15 * * * *": // Every 15 minutes
          console.log("[Cron] Running alert monitoring job");
          await handleScheduledAlerts(env, ctx);
          break;

        case "0 3 * * *": // Daily at 3 AM UTC
          console.log("[Cron] Running daily cover harvest job");
          await handleScheduledHarvest(env, ctx);
          break;

        case "0 0 * * 0": // Sunday at midnight UTC
          console.log("[Cron] Running weekly recommendations generation job");
          await handleRecommendationsCron(env);
          break;

        case "0 * * * *": // Every hour at :00
          console.log("[Cron] Running hourly cache warming job");
          await handleScheduledCacheWarming(env, ctx);
          break;

        default:
          console.warn(`[Cron] Unknown cron schedule: ${cronName}`);
      }
    } catch (error) {
      console.error(`[Cron] Error in scheduled job ${cronName}:`, error);
      // Cron errors are logged but not retried automatically
      // Workers will retry failed cron jobs per Cloudflare's retry policy
    }
  },

  /**
   * Queue consumer handler - processes author warming queue messages
   */
  async queue(batch, env, ctx) {
    console.log(`[Queue] Processing ${batch.messages.length} author warming messages`);

    try {
      await processAuthorBatch(batch, env, ctx);
    } catch (error) {
      console.error("[Queue] Error processing author warming batch:", error);
      // Queue consumer errors are logged
      // Workers will retry failed messages per queue configuration
    }
  },
};
