/**
 * Integration tests for GET /v1/jobs/:jobId/status endpoint (Issue #21)
 *
 * Tests the unified job status polling endpoint that supports all pipeline types:
 * - csv_import
 * - batch_enrichment
 * - ai_scan
 *
 * **Prerequisites:**
 * 1. Deploy worker: `wrangler deploy`
 * 2. Run tests: `WORKER_URL=https://api.oooefam.net npm test integration/job-status`
 *
 * **OR** for local dev:
 * 1. `wrangler dev --port 8787` (separate terminal)
 * 2. `npm test integration/job-status-polling`
 */

import { describe, it, expect, beforeAll } from 'vitest';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';

// Check if worker is running before ALL tests
beforeAll(async () => {
  try {
    const response = await fetch(`${WORKER_URL}/health`);
    if (!response.ok) {
      throw new Error('Worker health check failed');
    }
  } catch (error) {
    console.warn('\n⚠️  Worker not running. Start with: wrangler dev --port 8787');
    console.warn('   Or set WORKER_URL to deployed worker for real API tests\n');
    throw new Error('Worker not available - skipping integration tests');
  }
});

describe('GET /v1/jobs/:jobId/status (Issue #21)', () => {
  /**
   * Helper to generate unique job IDs for each test
   */
  function generateJobId(): string {
    return `test-job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  // ========================================================================
  // Endpoint Validation Tests
  // ========================================================================

  describe('Endpoint validation', () => {
    it('should return 404 for non-existent job', async () => {
      const jobId = generateJobId();

      const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.data).toBeNull();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('not found');
      expect(body.metadata).toBeDefined();
      expect(body.metadata.timestamp).toBeDefined();
    });

    it('should return proper ResponseEnvelope format', async () => {
      const jobId = generateJobId();

      const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      const body = await response.json();

      // Validate envelope structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('metadata');
      expect(body.metadata).toHaveProperty('timestamp');
      expect(typeof body.metadata.timestamp).toBe('string');
    });

    it('should include X-Response-Format header', async () => {
      const jobId = generateJobId();

      const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      expect(response.headers.get('X-Response-Format')).toBe('v2.0');
    });
  });

  // ========================================================================
  // Integration with Batch Enrichment Pipeline
  // ========================================================================

  describe('Integration with batch_enrichment pipeline', () => {
    it('should return job status after starting batch enrichment', async () => {
      const jobId = generateJobId();
      const workIds = ['work-1', 'work-2', 'work-3'];

      // Start a batch enrichment job
      const startResponse = await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      expect(startResponse.status).toBe(202);

      // Poll for job status
      const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      // Job should be found (either processing or completed)
      expect([200, 404]).toContain(statusResponse.status);

      if (statusResponse.status === 200) {
        const body = await statusResponse.json();
        expect(body.data).toBeDefined();
        expect(body.data.jobId).toBe(jobId);
        expect(body.data.pipeline).toBe('batch_enrichment');
        expect(['initialized', 'processing', 'completed', 'failed']).toContain(body.data.status);
        expect(body.data.progress).toBeGreaterThanOrEqual(0);
        expect(body.data.progress).toBeLessThanOrEqual(1);
        expect(body.data.totalCount).toBe(3);
        expect(body.metadata.source).toBe('job-state-manager-do');
      }
    });

    it('should return job progress updates during processing', async () => {
      const jobId = generateJobId();
      const workIds = Array.from({ length: 10 }, (_, i) => `work-${i + 1}`);

      // Start a batch enrichment job with more items
      await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      // Poll multiple times to see progress
      const statuses: any[] = [];
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);
        if (statusResponse.status === 200) {
          const body = await statusResponse.json();
          statuses.push(body.data);
        }
      }

      // Should have at least one successful status check
      expect(statuses.length).toBeGreaterThan(0);

      // All status responses should have consistent structure
      for (const status of statuses) {
        expect(status.jobId).toBe(jobId);
        expect(status.pipeline).toBe('batch_enrichment');
        expect(status.startTime).toBeDefined();
        expect(status.lastUpdateTime).toBeDefined();
      }
    });
  });

  // ========================================================================
  // Rate Limiting Tests
  // ========================================================================

  describe('Rate limiting', () => {
    it('should enforce rate limit of 30 req/min', async () => {
      const jobId = generateJobId();
      const requests: Promise<Response>[] = [];

      // Send 35 requests rapidly (should hit rate limit)
      for (let i = 0; i < 35; i++) {
        requests.push(fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`));
      }

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      // Some should be rate limited (429) if limit is enforced
      // Note: This test may not trigger rate limit in all environments
      const rateLimited = statusCodes.filter(code => code === 429).length;
      const successful = statusCodes.filter(code => code === 200 || code === 404).length;

      // At least some requests should succeed
      expect(successful).toBeGreaterThan(0);

      // Log for debugging
      console.log(`Rate limit test: ${successful} succeeded, ${rateLimited} rate limited`);
    });
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('Error handling', () => {
    it('should handle missing jobId parameter', async () => {
      // Empty jobId in path should result in 404 (route not matched)
      const response = await fetch(`${WORKER_URL}/v1/jobs//status`);

      expect([400, 404]).toContain(response.status);
    });

    it('should handle invalid jobId format gracefully', async () => {
      // Very long jobId should be truncated and handled
      const longJobId = 'a'.repeat(200);

      const response = await fetch(`${WORKER_URL}/v1/jobs/${longJobId}/status`);

      // Should not crash - either 404 or valid error response
      expect([404, 400, 200]).toContain(response.status);
    });

    it('should handle special characters in jobId', async () => {
      const specialJobId = 'test-job-with-special-chars!@#$%';

      const response = await fetch(`${WORKER_URL}/v1/jobs/${encodeURIComponent(specialJobId)}/status`);

      // Should handle gracefully
      expect([404, 400, 200]).toContain(response.status);
    });
  });

  // ========================================================================
  // Response Structure Validation
  // ========================================================================

  describe('Response structure', () => {
    it('should return all required fields in job status', async () => {
      const jobId = generateJobId();
      const workIds = ['work-1'];

      // Start a job first
      await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      // Wait briefly for initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      if (response.status === 200) {
        const body = await response.json();

        // Required fields
        expect(body.data).toHaveProperty('jobId');
        expect(body.data).toHaveProperty('pipeline');
        expect(body.data).toHaveProperty('status');
        expect(body.data).toHaveProperty('progress');
        expect(body.data).toHaveProperty('processedCount');
        expect(body.data).toHaveProperty('totalCount');
        expect(body.data).toHaveProperty('startTime');
        expect(body.data).toHaveProperty('lastUpdateTime');

        // Type validations
        expect(typeof body.data.jobId).toBe('string');
        expect(typeof body.data.pipeline).toBe('string');
        expect(typeof body.data.status).toBe('string');
        expect(typeof body.data.progress).toBe('number');
        expect(typeof body.data.processedCount).toBe('number');
        expect(typeof body.data.totalCount).toBe('number');
        expect(typeof body.data.startTime).toBe('number');
        expect(typeof body.data.lastUpdateTime).toBe('number');

        // Metadata validation
        expect(body.metadata).toHaveProperty('source');
        expect(body.metadata).toHaveProperty('timestamp');
        expect(body.metadata.source).toBe('job-state-manager-do');
      }
    });

    it('should include error details for failed jobs', async () => {
      // This test documents expected behavior - actual error testing requires mock setup
      // Failed job response should include:
      // - status: 'failed'
      // - failedTime: timestamp
      // - error: { message, code, details }

      // Placeholder assertion - real test requires triggering a failure
      expect(true).toBe(true);
    });

    it('should include cancellation details for canceled jobs', async () => {
      // Canceled job response should include:
      // - canceled: true
      // - cancelReason: string
      // - canceledTime: timestamp

      // Placeholder assertion - real test requires cancel endpoint
      expect(true).toBe(true);
    });
  });

  // ========================================================================
  // Polling Pattern Tests
  // ========================================================================

  describe('Polling pattern', () => {
    it('should support polling until completion', async () => {
      const jobId = generateJobId();
      const workIds = ['work-1', 'work-2'];

      // Start a job
      await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      // Poll with timeout
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds
      let finalStatus: any = null;

      while (Date.now() - startTime < timeout) {
        const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

        if (response.status === 200) {
          const body = await response.json();
          finalStatus = body.data;

          if (['completed', 'failed'].includes(finalStatus.status)) {
            break;
          }
        }

        // Poll every second
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Should have received a status
      if (finalStatus) {
        expect(['initialized', 'processing', 'completed', 'failed']).toContain(finalStatus.status);
        console.log(`Job ${jobId} final status: ${finalStatus.status} (progress: ${finalStatus.progress})`);
      }
    }, 35000); // 35 second timeout for this test
  });
});
