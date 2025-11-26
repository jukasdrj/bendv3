import { Context } from 'hono';
import { Env } from '../types/env';
import { CacheMonitor } from '../services/cache-monitor';

/**
 * Cache Dashboard Handler
 *
 * Retrieves real-time and historical cache performance metrics
 * to be displayed on an internal monitoring dashboard.
 */

/**
 * Calculates performance metrics for a given stats object (total or by prefix).
 * @param stats - The cache stats object.
 * @returns
 */
function calculateMetrics(stats: any): { hitRate: number; requests: number } {
  if (!stats) {
    return { hitRate: 0, requests: 0 };
  }
  const requests = stats.hits + stats.misses;
  const hitRate = requests > 0 ? stats.hits / requests : 1.0;
  return { hitRate, requests };
}

/**
 * Handles requests for the cache dashboard.
 * @param c - The Hono context.
 * @returns
 */
export async function handleCacheDashboard(c: Context): Promise<Response> {
  const env = c.env as Env;
  const monitor = new CacheMonitor();

  const [stats, health] = await Promise.all([
    monitor.getStats(env),
    monitor.checkHealth(env),
  ]);

  const overallMetrics = calculateMetrics(stats.total.total);

  const byPrefix: { [key: string]: { hitRate: number; requests: number } } = {};
  for (const prefix in stats.total.prefixes) {
    byPrefix[prefix] = calculateMetrics(stats.total.prefixes[prefix]);
  }

  const rpm = stats.currentMinute.total.reads;

  const dashboardData = {
    overall: {
      hitRate: overallMetrics.hitRate,
      requestsPerMin: rpm,
      avgLatency: null, // Not tracked yet
    },
    byPrefix,
    alerts: health.alerts.map(alert => ({
      ...alert,
      message: `${alert.metric} is ${alert.actual.toFixed(2)}, threshold is ${alert.threshold}`
    }))
  };

  return c.json(dashboardData);
}
