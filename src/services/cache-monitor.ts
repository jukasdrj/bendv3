import { Env } from '../types/env';
import { Alert } from '../types/cache-monitor';
import { ICacheMetricsDO } from '../types/durable-objects';

/**
 * Cache Health Monitoring Service
 *
 * This service checks the health of the cache by analyzing metrics from CacheMetricsDO.
 * It generates alerts based on predefined thresholds for hit rates and other key metrics.
 */
export class CacheMonitor {
  /**
   * Retrieves the current cache statistics from the CacheMetricsDO.
   * @param env - The worker environment.
   * @returns The cache statistics object.
   */
  async getStats(env: Env): Promise<any> {
    const id = env.CACHE_METRICS_DO.idFromName("global");
    const stub = env.CACHE_METRICS_DO.get(id) as unknown as ICacheMetricsDO;
    const stats = await stub.getStats();
    return stats;
  }

  /**
   * Retrieves the previous cache health check results for trend analysis.
   * @param env - The worker environment.
   * @returns The previous health statistics.
   */
  async getPreviousStats(env: Env): Promise<any> {
    const previousHealth = await env.CACHE.get("cache-health:latest");
    return previousHealth ? JSON.parse(previousHealth) : null;
  }

  /**
   * Checks the overall health of the cache and generates alerts if thresholds are breached.
   * @param env - The worker environment.
   * @returns A health status object.
   */
  async checkHealth(env: Env): Promise<{ healthy: boolean; alerts: Alert[] }> {
    const stats = await this.getStats(env);
    const alerts: Alert[] = [];

    const totalRequests = stats.total.total.hits + stats.total.total.misses;
    const hitRate = totalRequests > 0 ? (stats.total.total.hits / totalRequests) : 1.0;

    const thresholds = {
      hitRate: {
        critical: parseFloat(env.CACHE_ALERT_HIT_RATE_THRESHOLD_CRITICAL || '0.65'),
        warning: parseFloat(env.CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING || '0.70'),
      },
      hotCache: {
        critical: parseFloat(env.CACHE_ALERT_HOT_CACHE_THRESHOLD_CRITICAL || '0.80'),
        warning: parseFloat(env.CACHE_ALERT_HOT_CACHE_THRESHOLD_WARNING || '0.85'),
      },
      drop: {
        critical: parseFloat(env.CACHE_ALERT_DROP_THRESHOLD_CRITICAL || '0.15'),
        warning: parseFloat(env.CACHE_ALERT_DROP_THRESHOLD_WARNING || '0.10'),
      },
    };

    // Alert 1: Overall hit rate
    if (hitRate < thresholds.hitRate.critical) {
      alerts.push({
        severity: 'critical',
        metric: 'overall_hit_rate',
        threshold: thresholds.hitRate.critical,
        actual: hitRate,
        action: 'Review cache TTL configuration'
      });
    } else if (hitRate < thresholds.hitRate.warning) {
      alerts.push({
        severity: 'warning',
        metric: 'overall_hit_rate',
        threshold: thresholds.hitRate.warning,
        actual: hitRate,
        action: 'Review cache TTL configuration'
      });
    }

    const hotCacheRequests = stats.total.total.reads;
    const hotHitRate = hotCacheRequests > 0 ? (stats.total.total.ttl_effective_hits / hotCacheRequests) : 1.0;

    // Alert 2: Hot cache effectiveness
    if (hotHitRate < thresholds.hotCache.critical) {
      alerts.push({
        severity: 'critical',
        metric: 'hot_cache_hit_rate',
        threshold: thresholds.hotCache.critical,
        actual: hotHitRate,
        action: 'Consider increasing hot TTL'
      });
    } else if (hotHitRate < thresholds.hotCache.warning) {
      alerts.push({
        severity: 'warning',
        metric: 'hot_cache_hit_rate',
        threshold: thresholds.hotCache.warning,
        actual: hotHitRate,
        action: 'Consider increasing hot TTL'
      });
    }

    // Alert 3: Sudden drop
    const prev = await this.getPreviousStats(env);
    if (prev && prev.hitRate) {
        const drop = (prev.hitRate - hitRate) / prev.hitRate;
        if (drop > thresholds.drop.critical) {
            alerts.push({
                severity: 'critical',
                metric: 'hit_rate_drop',
                change: (drop * 100).toFixed(1) + '%',
                threshold: thresholds.drop.critical,
                actual: drop,
                action: 'Investigate recent deployment or traffic pattern change'
            });
        } else if (drop > thresholds.drop.warning) {
            alerts.push({
                severity: 'warning',
                metric: 'hit_rate_drop',
                change: (drop * 100).toFixed(1) + '%',
                threshold: thresholds.drop.warning,
                actual: drop,
                action: 'Investigate recent deployment or traffic pattern change'
            });
        }
    }

    return { healthy: alerts.length === 0, alerts };
  }
}
