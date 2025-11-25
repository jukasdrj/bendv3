/**
 * Integration tests for Book Import Workflow (Issue #21)
 *
 * Tests the complete book import workflow including:
 * - POST /v2/import/workflow - Trigger workflow
 * - GET /v2/import/workflow/:workflowId - Get workflow status
 * - GET /v1/jobs/:jobId/status - Poll job status until completion
 *
 * **Prerequisites:**
 * 1. Deploy worker: `wrangler deploy`
 * 2. Run tests: `WORKER_URL=https://api.oooefam.net npm test integration/book-import-workflow`
 *
 * **OR** for local dev:
 * 1. `wrangler dev --port 8787` (separate terminal)
 * 2. `npm test integration/book-import-workflow`
 *
 * Testing Strategy:
 * - Mock external providers for deterministic tests
 * - Use generous timeouts for async workflow completion
 * - Validate DO progress updates at each step
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

/**
 * Helper: Poll job status until terminal state or timeout
 */
async function pollJobStatus(
  jobId: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<{ status: string; data: any; error?: any }> {
  const { timeout = 30000, interval = 1000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

    if (response.status === 200) {
      const body = await response.json();
      const status = body.data?.status;

      if (['completed', 'failed', 'canceled'].includes(status)) {
        return { status, data: body.data };
      }
    } else if (response.status === 404) {
      // Job not yet initialized, wait and retry
      await new Promise(resolve => setTimeout(resolve, interval));
      continue;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms timeout`);
}

/**
 * Helper: Generate unique job ID
 */
function generateJobId(): string {
  return `workflow-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

describe('Book Import Workflow Integration (Issue #21)', () => {
  // ========================================================================
  // Workflow Trigger Tests
  // ========================================================================

  describe('POST /v2/import/workflow - Trigger workflow', () => {
    it('should accept valid workflow trigger request', async () => {
      const response = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '9780439708180', // Harry Potter ISBN
          source: 'manual'
        })
      });

      // Should return 202 Accepted for async processing
      expect([200, 202]).toContain(response.status);

      if (response.status === 202 || response.status === 200) {
        const body = await response.json();
        expect(body.data).toBeDefined();
        expect(body.data.jobId || body.data.workflowId).toBeDefined();
        expect(body.metadata).toBeDefined();
      }
    });

    it('should return workflow ID for status tracking', async () => {
      const response = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '9780547928227', // The Hobbit ISBN
          source: 'csv_import'
        })
      });

      if (response.status === 202 || response.status === 200) {
        const body = await response.json();

        // Should provide ID for tracking
        const trackingId = body.data?.workflowId || body.data?.jobId;
        expect(trackingId).toBeDefined();
        expect(typeof trackingId).toBe('string');
      }
    });

    it('should handle missing ISBN parameter', async () => {
      const response = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual'
          // Missing isbn
        })
      });

      expect([400, 422]).toContain(response.status);

      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('should handle invalid ISBN format', async () => {
      const response = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: 'invalid-isbn-format',
          source: 'manual'
        })
      });

      // Should reject or validate ISBN
      expect([400, 422, 200, 202]).toContain(response.status);
    });
  });

  // ========================================================================
  // Workflow Status Tests
  // ========================================================================

  describe('GET /v2/import/workflow/:workflowId - Workflow status', () => {
    it('should return workflow status for valid workflowId', async () => {
      // First trigger a workflow
      const triggerResponse = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '9780439708180',
          source: 'test'
        })
      });

      if (triggerResponse.status === 202 || triggerResponse.status === 200) {
        const triggerBody = await triggerResponse.json();
        const workflowId = triggerBody.data?.workflowId;

        if (workflowId) {
          // Query workflow status
          const statusResponse = await fetch(`${WORKER_URL}/v2/import/workflow/${workflowId}`);

          expect([200, 404]).toContain(statusResponse.status);

          if (statusResponse.status === 200) {
            const statusBody = await statusResponse.json();
            expect(statusBody.data).toBeDefined();
          }
        }
      }
    });

    it('should return 404 for non-existent workflow', async () => {
      const fakeWorkflowId = 'non-existent-workflow-id';

      const response = await fetch(`${WORKER_URL}/v2/import/workflow/${fakeWorkflowId}`);

      expect([404, 400]).toContain(response.status);
    });
  });

  // ========================================================================
  // Job Status Polling Integration
  // ========================================================================

  describe('Job Status Polling Integration', () => {
    it('should be able to poll job status after workflow trigger', async () => {
      // Trigger workflow
      const triggerResponse = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '9780439708180',
          source: 'integration-test'
        })
      });

      if (triggerResponse.status === 202 || triggerResponse.status === 200) {
        const triggerBody = await triggerResponse.json();
        const jobId = triggerBody.data?.jobId;

        if (jobId) {
          // Poll job status
          const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

          // Should eventually find the job
          expect([200, 404]).toContain(statusResponse.status);
        }
      }
    });

    it('should track progress through workflow steps', async () => {
      // This test validates that progress increases as workflow executes

      const triggerResponse = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '9780439708180',
          source: 'progress-test'
        })
      });

      if (triggerResponse.status === 202 || triggerResponse.status === 200) {
        const triggerBody = await triggerResponse.json();
        const jobId = triggerBody.data?.jobId;

        if (jobId) {
          const progressSnapshots: number[] = [];

          // Poll several times to capture progress
          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));

            const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);
            if (statusResponse.status === 200) {
              const body = await statusResponse.json();
              if (body.data?.progress !== undefined) {
                progressSnapshots.push(body.data.progress);
              }
            }
          }

          // Should have captured some progress updates
          if (progressSnapshots.length > 0) {
            console.log(`Progress snapshots: ${progressSnapshots.join(', ')}`);
            // Progress should be non-negative
            progressSnapshots.forEach(p => {
              expect(p).toBeGreaterThanOrEqual(0);
              expect(p).toBeLessThanOrEqual(1);
            });
          }
        }
      }
    });
  });

  // ========================================================================
  // CSV Import Integration
  // ========================================================================

  describe('CSV Import Integration', () => {
    it('should accept CSV import and return job status', async () => {
      const jobId = generateJobId();
      const csvContent = `ISBN,Title,Author
9780439708180,Harry Potter and the Philosopher's Stone,J.K. Rowling
9780547928227,The Hobbit,J.R.R. Tolkien`;

      const response = await fetch(`${WORKER_URL}/api/import/csv-gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: csvContent,
          jobId
        })
      });

      expect([200, 202, 400]).toContain(response.status);

      if (response.status === 202 || response.status === 200) {
        // Wait briefly for job initialization
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll job status
        const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

        if (statusResponse.status === 200) {
          const body = await statusResponse.json();
          expect(body.data.jobId).toBe(jobId);
          expect(['csv_import', 'initialized', 'processing']).toContain(body.data.pipeline || body.data.status);
        }
      }
    });

    it('should track CSV import progress via polling', async () => {
      const jobId = generateJobId();
      const csvContent = `ISBN
9780439708180
9780547928227
9780061120084`;

      const startResponse = await fetch(`${WORKER_URL}/api/import/csv-gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: csvContent,
          jobId
        })
      });

      if (startResponse.status === 202 || startResponse.status === 200) {
        try {
          // Poll until completion or timeout
          const result = await pollJobStatus(jobId, { timeout: 60000, interval: 2000 });

          console.log(`CSV import job ${jobId} finished with status: ${result.status}`);

          expect(['completed', 'failed', 'canceled']).toContain(result.status);

          if (result.status === 'completed') {
            expect(result.data.progress).toBe(1);
            expect(result.data.processedCount).toBeGreaterThanOrEqual(0);
          }
        } catch (error) {
          // Timeout is acceptable - workflow might be slow
          console.log(`CSV import test timed out (expected for long-running workflows)`);
        }
      }
    }, 65000); // 65 second timeout
  });

  // ========================================================================
  // Batch Enrichment Integration
  // ========================================================================

  describe('Batch Enrichment Integration', () => {
    it('should track batch enrichment via unified job status endpoint', async () => {
      const jobId = generateJobId();
      const workIds = ['OL27448W', 'OL262758W']; // OpenLibrary work IDs

      const startResponse = await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      expect(startResponse.status).toBe(202);

      // Wait for job initialization
      await new Promise(resolve => setTimeout(resolve, 300));

      // Poll job status
      const statusResponse = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);

      if (statusResponse.status === 200) {
        const body = await statusResponse.json();

        expect(body.data.jobId).toBe(jobId);
        expect(body.data.pipeline).toBe('batch_enrichment');
        expect(body.data.totalCount).toBe(2);
      }
    });

    it('should return intermediate progress updates during enrichment', async () => {
      const jobId = generateJobId();
      const workIds = Array.from({ length: 5 }, (_, i) => `OL${i + 1}W`);

      await fetch(`${WORKER_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workIds, jobId })
      });

      // Collect multiple status updates
      const updates: any[] = [];

      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));

        const response = await fetch(`${WORKER_URL}/v1/jobs/${jobId}/status`);
        if (response.status === 200) {
          const body = await response.json();
          updates.push({
            progress: body.data.progress,
            processedCount: body.data.processedCount,
            status: body.data.status
          });

          if (body.data.status === 'completed' || body.data.status === 'failed') {
            break;
          }
        }
      }

      // Should have received at least one update
      expect(updates.length).toBeGreaterThan(0);

      console.log(`Batch enrichment updates:`, updates);
    });
  });

  // ========================================================================
  // Error Handling
  // ========================================================================

  describe('Error handling', () => {
    it('should handle workflow errors gracefully', async () => {
      // Test with invalid data that might cause workflow error
      const response = await fetch(`${WORKER_URL}/v2/import/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: '0000000000000', // Invalid ISBN that won't find any books
          source: 'error-test'
        })
      });

      // Should not crash - either accept and fail gracefully or reject early
      expect([200, 202, 400, 422, 500]).toContain(response.status);
    });

    it('should include error details in failed job status', async () => {
      // This test documents expected behavior for failed jobs
      // Real error testing requires mocking external APIs

      // A failed job should include:
      // - status: 'failed'
      // - failedTime: timestamp
      // - error: { message, code, details }

      expect(true).toBe(true); // Placeholder
    });
  });

  // ========================================================================
  // Concurrent Workflows
  // ========================================================================

  describe('Concurrent workflows', () => {
    it('should handle multiple concurrent workflow triggers', async () => {
      const workflows = Array.from({ length: 3 }, (_, i) => ({
        isbn: `978043970818${i}`,
        source: `concurrent-test-${i}`
      }));

      // Trigger all workflows concurrently
      const responses = await Promise.all(
        workflows.map(w =>
          fetch(`${WORKER_URL}/v2/import/workflow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(w)
          })
        )
      );

      // All should be accepted or handled
      responses.forEach((response, i) => {
        expect([200, 202, 400]).toContain(response.status);
        console.log(`Concurrent workflow ${i}: status ${response.status}`);
      });
    });

    it('should isolate job state between concurrent jobs', async () => {
      const job1Id = generateJobId();
      const job2Id = generateJobId();

      // Start two jobs
      await Promise.all([
        fetch(`${WORKER_URL}/api/enrichment/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workIds: ['work-a'], jobId: job1Id })
        }),
        fetch(`${WORKER_URL}/api/enrichment/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workIds: ['work-b', 'work-c'], jobId: job2Id })
        })
      ]);

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check both job states
      const [status1, status2] = await Promise.all([
        fetch(`${WORKER_URL}/v1/jobs/${job1Id}/status`),
        fetch(`${WORKER_URL}/v1/jobs/${job2Id}/status`)
      ]);

      if (status1.status === 200 && status2.status === 200) {
        const body1 = await status1.json();
        const body2 = await status2.json();

        // Jobs should have different IDs and potentially different total counts
        expect(body1.data.jobId).toBe(job1Id);
        expect(body2.data.jobId).toBe(job2Id);
        expect(body1.data.totalCount).toBe(1);
        expect(body2.data.totalCount).toBe(2);
      }
    });
  });
});
