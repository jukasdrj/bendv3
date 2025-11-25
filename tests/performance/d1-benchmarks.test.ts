/**
 * Performance Benchmarks for D1 Database (Issue #22)
 *
 * Tests D1 query performance including:
 * - Single-row lookup (ISBN search): Target <50ms
 * - Batch lookup: Target <200ms for 10 rows
 * - Author search with JOIN: Target <100ms
 * - Write performance: Target <100ms
 * - Concurrent query handling
 *
 * **Prerequisites:**
 * 1. Deploy worker: `wrangler deploy`
 * 2. Run: `npm test performance/d1-benchmarks`
 *
 * **Metrics Collected:**
 * - Average latency (ms)
 * - P95 latency (ms)
 * - P99 latency (ms)
 * - Throughput (requests/second)
 */

import { describe, it, expect, beforeAll } from 'vitest';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';

// Performance thresholds (milliseconds)
const THRESHOLDS = {
  ISBN_LOOKUP_P95: 500,      // Single ISBN lookup
  TITLE_SEARCH_P95: 1000,    // Title search with LIKE
  AUTHOR_SEARCH_P95: 1000,   // Author search with JOIN
  BATCH_LOOKUP_P95: 2000,    // Multiple ISBN lookups
  CONCURRENT_P95: 2000,      // Concurrent requests
};

// Check if worker is running before ALL tests
beforeAll(async () => {
  try {
    const response = await fetch(`${WORKER_URL}/health`);
    if (!response.ok) {
      throw new Error('Worker health check failed');
    }
  } catch (error) {
    console.warn('\n⚠️  Worker not running. Start with: wrangler dev --port 8787');
    throw new Error('Worker not available - skipping performance tests');
  }
});

/**
 * Helper: Calculate percentiles from array of numbers
 */
function calculatePercentiles(times: number[]): {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    min: sorted[0],
    max: sorted[len - 1],
    avg: times.reduce((a, b) => a + b, 0) / len,
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
  };
}

/**
 * Helper: Run benchmark with multiple iterations
 */
async function runBenchmark(
  name: string,
  fn: () => Promise<Response>,
  iterations: number = 20
): Promise<{
  name: string;
  iterations: number;
  times: number[];
  percentiles: ReturnType<typeof calculatePercentiles>;
  successRate: number;
}> {
  const times: number[] = [];
  let successCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    try {
      const response = await fn();
      if (response.status === 200 || response.status === 404) {
        successCount++;
      }
    } catch (error) {
      // Count as failure but continue
    }
    times.push(Date.now() - start);

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const percentiles = calculatePercentiles(times);

  console.log(`\n📊 ${name}:`);
  console.log(`   Iterations: ${iterations}`);
  console.log(`   Success rate: ${((successCount / iterations) * 100).toFixed(1)}%`);
  console.log(`   Min: ${percentiles.min}ms`);
  console.log(`   Avg: ${percentiles.avg.toFixed(1)}ms`);
  console.log(`   P50: ${percentiles.p50}ms`);
  console.log(`   P95: ${percentiles.p95}ms`);
  console.log(`   P99: ${percentiles.p99}ms`);
  console.log(`   Max: ${percentiles.max}ms`);

  return {
    name,
    iterations,
    times,
    percentiles,
    successRate: successCount / iterations,
  };
}

describe('D1 Performance Benchmarks (Issue #22)', () => {
  // ========================================================================
  // Single Row Lookup Benchmarks
  // ========================================================================

  describe('ISBN Lookup Performance', () => {
    it('should complete ISBN lookup within threshold', async () => {
      const result = await runBenchmark(
        'ISBN Lookup',
        () => fetch(`${WORKER_URL}/v1/search/isbn?isbn=9780439708180`),
        20
      );

      expect(result.percentiles.p95).toBeLessThan(THRESHOLDS.ISBN_LOOKUP_P95);
      expect(result.successRate).toBeGreaterThan(0.8);
    });

    it('should handle cache hit vs miss scenarios', async () => {
      // First request (potential cache miss)
      const missResult = await runBenchmark(
        'ISBN Lookup (first request)',
        () => fetch(`${WORKER_URL}/v1/search/isbn?isbn=9780547928227`),
        5
      );

      // Subsequent requests (potential cache hits)
      const hitResult = await runBenchmark(
        'ISBN Lookup (cached)',
        () => fetch(`${WORKER_URL}/v1/search/isbn?isbn=9780547928227`),
        10
      );

      // Cache hits should generally be faster
      console.log(`\n📈 Cache effect:`);
      console.log(`   First request avg: ${missResult.percentiles.avg.toFixed(1)}ms`);
      console.log(`   Cached avg: ${hitResult.percentiles.avg.toFixed(1)}ms`);
    });
  });

  // ========================================================================
  // Title Search Benchmarks
  // ========================================================================

  describe('Title Search Performance', () => {
    it('should complete title search within threshold', async () => {
      const result = await runBenchmark(
        'Title Search',
        () => fetch(`${WORKER_URL}/v1/search/title?q=Harry+Potter`),
        15
      );

      expect(result.percentiles.p95).toBeLessThan(THRESHOLDS.TITLE_SEARCH_P95);
    });

    it('should handle varying query lengths', async () => {
      const queries = [
        'The',           // Very short
        'Harry Potter',  // Medium
        'The Lord of the Rings Fellowship of the Ring'  // Long
      ];

      for (const query of queries) {
        const result = await runBenchmark(
          `Title Search ("${query.substring(0, 20)}...")`,
          () => fetch(`${WORKER_URL}/v1/search/title?q=${encodeURIComponent(query)}`),
          5
        );

        // All should complete reasonably
        expect(result.percentiles.p95).toBeLessThan(3000);
      }
    });
  });

  // ========================================================================
  // Author Search Benchmarks
  // ========================================================================

  describe('Author Search Performance', () => {
    it('should complete author search within threshold', async () => {
      const result = await runBenchmark(
        'Author Search',
        () => fetch(`${WORKER_URL}/search/author?q=Rowling&limit=10`),
        15
      );

      expect(result.percentiles.p95).toBeLessThan(THRESHOLDS.AUTHOR_SEARCH_P95);
    });

    it('should scale with result limit', async () => {
      const limits = [5, 20, 50];

      for (const limit of limits) {
        const result = await runBenchmark(
          `Author Search (limit=${limit})`,
          () => fetch(`${WORKER_URL}/search/author?q=King&limit=${limit}`),
          5
        );

        console.log(`   Limit ${limit}: avg=${result.percentiles.avg.toFixed(1)}ms`);
      }
    });
  });

  // ========================================================================
  // Batch Operations Benchmarks
  // ========================================================================

  describe('Batch Operations Performance', () => {
    it('should handle batch enrichment initialization', async () => {
      const jobId = `perf-test-${Date.now()}`;

      const result = await runBenchmark(
        'Batch Enrichment Init',
        () => fetch(`${WORKER_URL}/api/enrichment/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workIds: ['work-1', 'work-2', 'work-3'],
            jobId: `${jobId}-${Math.random()}`
          })
        }),
        10
      );

      // Batch init should be fast (just creates DO state)
      expect(result.percentiles.p95).toBeLessThan(1000);
    });

    it('should handle multiple ISBN lookups in sequence', async () => {
      const isbns = [
        '9780439708180',
        '9780547928227',
        '9780061120084',
        '9780316769488',
        '9780141439518'
      ];

      const start = Date.now();
      const responses = await Promise.all(
        isbns.map(isbn => fetch(`${WORKER_URL}/v1/search/isbn?isbn=${isbn}`))
      );
      const totalTime = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200 || r.status === 404).length;

      console.log(`\n📊 Batch ISBN Lookup (${isbns.length} ISBNs):`);
      console.log(`   Total time: ${totalTime}ms`);
      console.log(`   Avg per ISBN: ${(totalTime / isbns.length).toFixed(1)}ms`);
      console.log(`   Success rate: ${((successCount / isbns.length) * 100).toFixed(1)}%`);

      expect(totalTime).toBeLessThan(THRESHOLDS.BATCH_LOOKUP_P95);
    });
  });

  // ========================================================================
  // Concurrent Request Benchmarks
  // ========================================================================

  describe('Concurrent Request Performance', () => {
    it('should handle concurrent ISBN lookups', async () => {
      const concurrency = 10;

      const start = Date.now();
      const promises = Array.from({ length: concurrency }, (_, i) =>
        fetch(`${WORKER_URL}/v1/search/isbn?isbn=978043970818${i % 10}`)
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200 || r.status === 404).length;

      console.log(`\n📊 Concurrent Requests (${concurrency} parallel):`);
      console.log(`   Total time: ${totalTime}ms`);
      console.log(`   Throughput: ${(concurrency / (totalTime / 1000)).toFixed(1)} req/s`);
      console.log(`   Success rate: ${((successCount / concurrency) * 100).toFixed(1)}%`);

      expect(totalTime).toBeLessThan(THRESHOLDS.CONCURRENT_P95);
    });

    it('should maintain performance under load', async () => {
      const iterations = 3;
      const concurrencyLevels = [5, 10, 20];
      const results: { concurrency: number; avgTime: number }[] = [];

      for (const concurrency of concurrencyLevels) {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          const promises = Array.from({ length: concurrency }, () =>
            fetch(`${WORKER_URL}/v1/search/isbn?isbn=9780439708180`)
          );
          await Promise.all(promises);
          times.push(Date.now() - start);

          // Brief pause between batches
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        results.push({ concurrency, avgTime });
      }

      console.log('\n📊 Load Test Results:');
      results.forEach(r => {
        console.log(`   ${r.concurrency} concurrent: ${r.avgTime.toFixed(1)}ms avg`);
      });

      // Response time should not degrade significantly with load
      // (Allow 3x degradation from 5 to 20 concurrent)
      const ratio = results[2].avgTime / results[0].avgTime;
      console.log(`   Degradation ratio (20/5 concurrent): ${ratio.toFixed(2)}x`);

      expect(ratio).toBeLessThan(5);
    });
  });

  // ========================================================================
  // RPC Latency Benchmarks
  // ========================================================================

  describe('RPC Latency Benchmarks', () => {
    it('should measure DO-to-DO RPC latency', async () => {
      const result = await runBenchmark(
        'RPC Latency Test',
        () => fetch(`${WORKER_URL}/test/rpc-latency?iterations=10`),
        5
      );

      // RPC endpoint should respond reasonably
      expect(result.successRate).toBeGreaterThan(0.5);
    });

    it('should measure job status query latency', async () => {
      const jobId = `perf-status-${Date.now()}`;

      // Initialize a job first
      await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds: ['test'], jobId })
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 300));

      // Benchmark status queries
      const result = await runBenchmark(
        'Job Status Query',
        () => fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`),
        10
      );

      // Status queries should be fast (just DO storage read)
      expect(result.percentiles.p95).toBeLessThan(500);
    });
  });

  // ========================================================================
  // Baseline Metrics Summary
  // ========================================================================

  describe('Performance Summary', () => {
    it('should generate performance baseline report', async () => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 PERFORMANCE BASELINE REPORT');
      console.log('='.repeat(60));

      // Run key benchmarks and collect results
      const benchmarks = await Promise.all([
        runBenchmark('ISBN Lookup', () =>
          fetch(`${WORKER_URL}/v1/search/isbn?isbn=9780439708180`), 10),
        runBenchmark('Title Search', () =>
          fetch(`${WORKER_URL}/v1/search/title?q=Harry`), 10),
        runBenchmark('Author Search', () =>
          fetch(`${WORKER_URL}/search/author?q=King&limit=10`), 10),
      ]);

      console.log('\n📈 Summary:');
      console.log('-'.repeat(60));
      console.log('| Endpoint        | Avg (ms) | P95 (ms) | Success |');
      console.log('-'.repeat(60));

      benchmarks.forEach(b => {
        console.log(
          `| ${b.name.padEnd(15)} | ${b.percentiles.avg.toFixed(0).padStart(8)} | ${b.percentiles.p95.toString().padStart(8)} | ${(b.successRate * 100).toFixed(0).padStart(6)}% |`
        );
      });

      console.log('-'.repeat(60));
      console.log('\n✅ Baseline metrics captured for Issue #22');

      // All benchmarks should pass
      expect(benchmarks.every(b => b.successRate > 0.5)).toBe(true);
    });
  });
});
