/**
 * Unit tests for batch enrichment handler
 *
 * Tests that the /api/enrichment/batch endpoint returns the correct
 * response structure expected by iOS EnrichmentAPIClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBatchEnrichment } from '../../src/handlers/batch-enrichment.ts';
import { getProgressDOStub } from '../../src/utils/durable-object-helpers'; // Import the actual function

// Define the mock DO stub instance globally
const mockDOStubInstance = {
  setAuthToken: vi.fn().mockResolvedValue(undefined),
  initializeJobState: vi.fn().mockResolvedValue(undefined),
  updateProgress: vi.fn().mockResolvedValue(undefined),
  complete: vi.fn().mockResolvedValue(undefined),
  sendError: vi.fn().mockResolvedValue(undefined)
};

vi.mock('../../src/utils/durable-object-helpers', () => ({
  getProgressDOStub: vi.fn(() => mockDOStubInstance),
}));

// Mock environment and context
const createMockEnv = () => ({
  PROGRESS_WEBSOCKET_DO: {
    idFromName: vi.fn((name) => `mock-id-${name}`),
    get: vi.fn(() => mockDOStubInstance) // Returns the globally defined instance
  },
  KV_CACHE: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  }
});

const createMockContext = () => ({
  waitUntil: vi.fn()
});

describe('handleBatchEnrichment', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockCtx = createMockContext();

    // Reset all mock implementations (clears mockRejectedValue from previous tests)
    mockDOStubInstance.setAuthToken.mockReset().mockResolvedValue(undefined);
    mockDOStubInstance.initializeJobState.mockReset().mockResolvedValue(undefined);
    mockDOStubInstance.updateProgress.mockReset().mockResolvedValue(undefined);
    mockDOStubInstance.complete.mockReset().mockResolvedValue(undefined);
    mockDOStubInstance.sendError.mockReset().mockResolvedValue(undefined);

    // Clear mocks on mockEnv properties
    mockEnv.PROGRESS_WEBSOCKET_DO.idFromName.mockClear();
    mockEnv.PROGRESS_WEBSOCKET_DO.get.mockClear();

    // Clear the mock for getProgressDOStub itself
    getProgressDOStub.mockClear();
  });

  describe('Response structure validation', () => {
    it('should return correct structure with success, processedCount, and totalCount', async () => {
      const books = [
        { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', isbn: '9780743273565' },
        { title: '1984', author: 'George Orwell', isbn: '9780451524935' },
        { title: 'To Kill a Mockingbird', author: 'Harper Lee', isbn: '9780061120084' }
      ];
      const jobId = 'test-job-123';

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, jobId })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);

      expect(response.status).toBe(202);

      const body = await response.json();

      // Validate envelope structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('metadata');
      expect(body.data).toBeDefined();
      expect(body.metadata).toBeDefined();

      // Validate iOS expected fields in data
      expect(body.data).toHaveProperty('success');
      expect(body.data).toHaveProperty('processedCount');
      expect(body.data).toHaveProperty('totalCount');

      // Validate field values
      expect(body.data.success).toBe(true);
      expect(body.data.processedCount).toBe(0); // Job just started, nothing processed yet
      expect(body.data.totalCount).toBe(3); // Should match books array length

      // Validate metadata
      expect(body.metadata.timestamp).toBeDefined();
      expect(typeof body.metadata.timestamp).toBe('string');
    });

    it('should set totalCount to match books array length', async () => {
      const books = Array.from({ length: 48 }, (_, i) => ({
        title: `Book ${i + 1}`,
        author: `Author ${i + 1}`,
        isbn: null
      }));
      const jobId = 'test-job-csv-import';

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, jobId })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      const body = await response.json();

      expect(body.data.totalCount).toBe(48);
      expect(body.data.processedCount).toBe(0);
      expect(body.data.success).toBe(true);
    });

    it('should handle single book enrichment', async () => {
      const books = [
        { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', isbn: '9780743273565' }
      ];
      const jobId = 'test-single-book';

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, jobId })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      const body = await response.json();

      expect(body.data.totalCount).toBe(1);
      expect(body.data.processedCount).toBe(0);
      expect(body.data.success).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should return 400 for missing books array', async () => {
      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'test-job' })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Invalid books array');
    });

    it('should return 400 for missing jobId', async () => {
      const books = [{ title: 'Test', author: 'Author', isbn: null }];

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Missing jobId');
    });

    it('should return 400 for empty books array', async () => {
      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [], jobId: 'test-job' })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Empty books array');
    });

    it('should return 400 for non-array books', async () => {
      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: 'not-an-array', jobId: 'test-job' })
      });

      const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Invalid books array');
    });

    // ISSUE #113: WebSocket RPC error handling coverage
    describe('WebSocket RPC failures', () => {
      it('should call sendError when complete() RPC fails', async () => {
        const books = [
          { title: 'Test Book', author: 'Test Author', isbn: '1234567890' }
        ];
        const jobId = 'test-job-websocket-fail';

        // Mock Durable Object complete() to throw error (WebSocket closed)
        mockDOStubInstance.complete.mockRejectedValue(new Error('WebSocket connection closed'));

        const request = new Request('http://localhost/api/enrichment/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ books, jobId })
        });

        const response = await handleBatchEnrichment(request, mockEnv, mockCtx);

        // Should still return 202 (background job accepted)
        expect(response.status).toBe(202);

        // Wait for background promise to complete
        const backgroundPromise = mockCtx.waitUntil.mock.calls[0][0];
        await backgroundPromise;

        // Verify complete was attempted
        expect(mockDOStubInstance.complete).toHaveBeenCalled();

        // Verify sendError was called to report the failure
        expect(mockDOStubInstance.sendError).toHaveBeenCalledWith(
          'batch_enrichment',
          expect.objectContaining({
            code: 'E_BATCH_PROCESSING_FAILED',
            message: expect.stringContaining('WebSocket connection closed'),
            retryable: true,
          })
        );
      });

      it('should call sendError when updateProgress() RPC fails', async () => {
        const books = [
          { title: 'Book 1', author: 'Author 1', isbn: '111' }
        ];
        const jobId = 'test-job-progress-fail';

        // Make updateProgress fail
        mockDOStubInstance.updateProgress.mockRejectedValue(new Error('Progress update failed'));

        const request = new Request('http://localhost/api/enrichment/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ books, jobId })
        });

        const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
        expect(response.status).toBe(202);

        // Wait for background processing
        const backgroundPromise = mockCtx.waitUntil.mock.calls[0][0];
        await backgroundPromise;

        // Verify updateProgress was attempted
        expect(mockDOStubInstance.updateProgress).toHaveBeenCalled();

        // Verify sendError was called to report the failure
        expect(mockDOStubInstance.sendError).toHaveBeenCalledWith(
          'batch_enrichment',
          expect.objectContaining({
            code: 'E_BATCH_PROCESSING_FAILED',
            retryable: true,
          })
        );
      });

      it('should attempt both complete() and sendError() in double-fault scenario', async () => {
        const books = [
          { title: 'Test Book', author: 'Test Author', isbn: '1234567890' }
        ];
        const jobId = 'test-job-double-fault';

        // Make complete() fail
        mockDOStubInstance.complete.mockRejectedValue(new Error('Complete failed'));

        // Also make sendError() fail (double-fault!)
        mockDOStubInstance.sendError.mockRejectedValue(new Error('SendError also failed'));

        const request = new Request('http://localhost/api/enrichment/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ books, jobId })
        });

        const response = await handleBatchEnrichment(request, mockEnv, mockCtx);
        expect(response.status).toBe(202);

        // Wait for background processing
        const backgroundPromise = mockCtx.waitUntil.mock.calls[0][0];

        // NOTE: Double-fault currently isn't caught - sendError() throws but is inside
        // ctx.waitUntil() with no outer try-catch. This is documented behavior.
        // In a real double-fault, the error would be logged but job would appear stuck.
        // TODO: Add outer try-catch in processBatchEnrichment to log double-faults
        try {
          await backgroundPromise;
        } catch (error) {
          // May or may not throw depending on promise handling
        }

        // Verify both were attempted
        expect(mockDOStubInstance.complete).toHaveBeenCalled();
        expect(mockDOStubInstance.sendError).toHaveBeenCalled();
      });
    });
  });

  describe('Background processing', () => {
    it('should trigger background processing via ctx.waitUntil', async () => {
      const books = [
        { title: 'Test Book', author: 'Test Author', isbn: '1234567890' }
      ];
      const jobId = 'test-job';

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, jobId })
      });

      await handleBatchEnrichment(request, mockEnv, mockCtx);

      // Verify ctx.waitUntil was called (background processing started)
      expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);
      expect(mockCtx.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('should get Durable Object stub for the jobId', async () => {
      const books = [{ title: 'Test', author: 'Author', isbn: null }];
      const jobId = 'my-unique-job-id';

      const request = new Request('http://localhost/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, jobId })
      });

      await handleBatchEnrichment(request, mockEnv, mockCtx);

      // Verify DO stub was retrieved with correct jobId
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(jobId);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.get).toHaveBeenCalled();
    });
  });
});
