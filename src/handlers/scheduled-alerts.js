import { aggregateMetrics } from "../services/metrics-aggregator.js";
import {
  checkAlertThresholds,
  shouldSendAlert,
  markAlertSent,
} from "../services/alert-monitor.js";
import { CacheMonitor } from "../services/cache-monitor.js";
import { sendAlert } from "../services/alerting.js";

/**
 * Runs the cache health check.
 * @param {Object} env
 * @param {ExecutionContext} ctx
 */
async function runCacheHealthCheck(env, ctx) {
  console.log("[Cache Monitor] Running cache health check...");
  const monitor = new CacheMonitor();
  const health = await monitor.checkHealth(env);

  if (!health.healthy) {
    console.log(`[Cache Monitor] ⚠️ Generated ${health.alerts.length} cache alerts.`);
    await sendAlert(env, health.alerts);
  } else {
    console.log("[Cache Monitor] ✅ Cache is healthy.");
  }

  // Store metrics for trend analysis
  const stats = await monitor.getStats(env);
  const totalRequests = stats.total.total.hits + stats.total.total.misses;
  const hitRate = totalRequests > 0 ? (stats.total.total.hits / totalRequests) : 1.0;

  const healthData = {
    timestamp: Date.now(),
    hitRate: hitRate,
    healthy: health.healthy,
    alerts: health.alerts,
  };
  const healthJson = JSON.stringify(healthData);

  ctx.waitUntil(env.CACHE.put(`cache-health:${healthData.timestamp}`, healthJson, { expirationTtl: 604800 })); // 7 days
  ctx.waitUntil(env.CACHE.put('cache-health:latest', healthJson));
  console.log("[Cache Monitor] Stored latest health check for trend analysis.");
}

/**
 * Runs the general system alert check.
 * @param {Object} env
 * @param {ExecutionContext} ctx
 */
async function runGeneralAlertCheck(env, ctx) {
  console.log("[Alert Monitor] Running general alert check...");

  const metrics = await aggregateMetrics(env, "15m");
  const alerts = checkAlertThresholds(metrics);

  if (alerts.length === 0) {
    console.log("[Alert Monitor] ✅ No alerts triggered - system healthy");
    return;
  }

  console.log(
    `[Alert Monitor] ⚠️  Generated ${alerts.length} alerts:`,
    alerts.map((a) => a.type),
  );

  const shouldSend = await shouldSendAlert(alerts, env);
  if (!shouldSend) {
    console.log(
      "[Alert Monitor] Alert suppressed (duplicate within 4h window)",
    );
    return;
  }

  console.log("[Alert Monitor] 🚨 NEW ALERTS DETECTED:");
  alerts.forEach((alert) => {
    console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
    console.log(
      `    Current: ${alert.value.toFixed(1)} | Threshold: ${alert.threshold}`,
    );
  });

  console.log("[Alert Monitor] Recent metrics (15min):");
  console.log(
    `  Hit Rate: ${metrics.hitRates.combined.toFixed(1)}% (Edge: ${metrics.hitRates.edge.toFixed(1)}%, KV: ${metrics.hitRates.kv.toFixed(1)}%)`,
  );
  console.log(`  Volume: ${metrics.volume.total_requests} requests`);

  await markAlertSent(alerts, env);

  console.log("[Alert Monitor] Alert logged and marked as sent");
}

/**
 * Scheduled handler for all alert monitoring.
 * @param {Object} env - Worker environment
 * @param {ExecutionContext} ctx - Execution context
 */
export async function handleScheduledAlerts(env, ctx) {
  try {
    // Run checks in parallel
    await Promise.all([
      runCacheHealthCheck(env, ctx).catch(e => console.error("[Cache Monitor] Check failed:", e)),
      runGeneralAlertCheck(env, ctx).catch(e => console.error("[Alert Monitor] Check failed:", e)),
    ]);
  } catch (error) {
    // This top-level catch is for unforeseen errors in Promise.all itself.
    console.error("[Scheduled Alerts] Top-level handler failed:", error);
  }
}
