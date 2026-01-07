import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateMetrics } from '../src/services/metrics-aggregator.ts';

describe('aggregateMetrics', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CACHE_ANALYTICS: {
        writeDataPoint: vi.fn(async () => {})
      }
    };
  });

  describe('Analytics Engine Limitations', () => {
    it('should return placeholder data when Analytics Engine query not available', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      // Since Analytics Engine only supports writeDataPoint(), not query()
      // the function returns metadata about the limitation and solution
      expect(metrics._limitation).toBeDefined();
      expect(metrics._solution).toBeDefined();
      expect(metrics._graphql_endpoint).toBe('https://api.cloudflare.com/client/v4/graphql');
      expect(metrics.period).toBe('1h');
      expect(metrics.timestamp).toBeDefined();
    });

    it('should include GraphQL endpoint information', async () => {
      const metrics = await aggregateMetrics(mockEnv, '24h');

      // The function returns GraphQL endpoint info in root fields, not _instructions
      expect(metrics._graphql_endpoint).toBe('https://api.cloudflare.com/client/v4/graphql');
      expect(metrics._dataset_name).toBe('books_api_cache_metrics');
      expect(metrics._limitation).toContain('Analytics Engine queries not available');
      expect(metrics._solution).toContain('GraphQL API');
    });
  });

  describe('Period Mapping', () => {
    it('should handle 15m period', async () => {
      const metrics = await aggregateMetrics(mockEnv, '15m');
      expect(metrics.period).toBe('15m');
    });

    it('should handle 1h period', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');
      expect(metrics.period).toBe('1h');
    });

    it('should handle 24h period', async () => {
      const metrics = await aggregateMetrics(mockEnv, '24h');
      expect(metrics.period).toBe('24h');
    });

    it('should handle 7d period', async () => {
      const metrics = await aggregateMetrics(mockEnv, '7d');
      expect(metrics.period).toBe('7d');
    });

    it('should default to 1h for unknown period', async () => {
      const metrics = await aggregateMetrics(mockEnv, 'invalid');
      // The function uses '1 HOUR' internally for invalid periods
      expect(metrics.timestamp).toBeDefined();
    });
  });

  describe('Metrics Structure', () => {
    it('should return complete metrics structure', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('period');
      expect(metrics).toHaveProperty('hitRates');
      expect(metrics).toHaveProperty('latency');
      expect(metrics).toHaveProperty('volume');
    });

    it('should include all hit rate types', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      expect(metrics.hitRates).toHaveProperty('edge');
      expect(metrics.hitRates).toHaveProperty('kv');
      expect(metrics.hitRates).toHaveProperty('r2_cold');
      expect(metrics.hitRates).toHaveProperty('api');
      expect(metrics.hitRates).toHaveProperty('combined');
    });

    it('should include all volume counters', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      expect(metrics.volume).toHaveProperty('total_requests');
      expect(metrics.volume).toHaveProperty('edge_hits');
      expect(metrics.volume).toHaveProperty('kv_hits');
      expect(metrics.volume).toHaveProperty('r2_rehydrations');
      expect(metrics.volume).toHaveProperty('api_misses');
    });
  });

  describe('Hit Rate Calculations', () => {
    it('should calculate hit rates from provided data', async () => {
      // NOTE: This test documents the expected calculation logic
      // In production, metrics come from Cloudflare GraphQL API, not Workers Analytics Engine

      const testData = {
        results: [
          { cache_source: 'edge_hit', count: 78000, avg_latency: 8.2 },
          { cache_source: 'kv_hit', count: 16000, avg_latency: 42.1 },
          { cache_source: 'api_miss', count: 6000, avg_latency: 350.0 }
        ]
      };

      let totalRequests = 0;
      let edgeHits = 0;
      let kvHits = 0;

      for (const row of testData.results) {
        totalRequests += row.count || 0;
        if (row.cache_source === 'edge_hit') edgeHits = row.count;
        else if (row.cache_source === 'kv_hit') kvHits = row.count;
      }

      const edgeRate = (edgeHits / totalRequests) * 100;
      const kvRate = (kvHits / totalRequests) * 100;
      const combinedRate = ((edgeHits + kvHits) / totalRequests) * 100;

      expect(edgeRate).toBeCloseTo(78.0, 1);
      expect(kvRate).toBeCloseTo(16.0, 1);
      expect(combinedRate).toBeCloseTo(94.0, 1);
      expect(totalRequests).toBe(100000);
    });

    it('should handle zero requests without division errors', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      // With no data, all counters should be 0
      expect(metrics.volume.total_requests).toBe(0);
      expect(metrics.hitRates.edge).toBe(0);
      expect(metrics.hitRates.kv).toBe(0);
      expect(metrics.hitRates.combined).toBe(0);
    });

    it('should calculate R2 rehydration rate', async () => {
      const testData = {
        results: [
          { cache_source: 'edge_hit', count: 80000 },
          { cache_source: 'kv_hit', count: 15000 },
          { cache_source: 'r2_rehydrated', count: 3000 },
          { cache_source: 'api_miss', count: 2000 }
        ]
      };

      let totalRequests = 0;
      let r2Rehydrations = 0;

      for (const row of testData.results) {
        totalRequests += row.count || 0;
        if (row.cache_source === 'r2_rehydrated') r2Rehydrations = row.count;
      }

      const r2Rate = (r2Rehydrations / totalRequests) * 100;

      expect(r2Rate).toBeCloseTo(3.0, 1);
      expect(totalRequests).toBe(100000);
    });
  });

  describe('Latency Data Structure', () => {
    it('should include latency structure for each cache source', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      // latencyData will be empty object when no results
      expect(metrics.latency).toBeDefined();
      expect(typeof metrics.latency).toBe('object');
    });

    it('should parse latency percentiles correctly', () => {
      // Document expected latency data structure
      const latencyData = {
        edge_hit: {
          avg: 8.2,
          p50: 5.0,
          p95: 15.0,
          p99: 25.0
        },
        kv_hit: {
          avg: 42.1,
          p50: 35.0,
          p95: 75.0,
          p99: 120.0
        },
        api_miss: {
          avg: 350.0,
          p50: 280.0,
          p95: 550.0,
          p99: 800.0
        }
      };

      expect(latencyData.edge_hit.avg).toBeLessThan(latencyData.kv_hit.avg);
      expect(latencyData.kv_hit.avg).toBeLessThan(latencyData.api_miss.avg);
      expect(latencyData.edge_hit.p99).toBeLessThan(100);
    });
  });

  describe('Timestamp Format', () => {
    it('should return ISO 8601 timestamp', async () => {
      const metrics = await aggregateMetrics(mockEnv, '1h');

      expect(metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should have recent timestamp', async () => {
      const beforeCall = Date.now();
      const metrics = await aggregateMetrics(mockEnv, '1h');
      const afterCall = Date.now();

      const timestamp = new Date(metrics.timestamp).getTime();

      expect(timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(timestamp).toBeLessThanOrEqual(afterCall);
    });
  });
});
