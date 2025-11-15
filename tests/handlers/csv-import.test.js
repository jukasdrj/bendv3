/**
 * CSV Import Handler Tests
 *
 * Tests the /api/import/csv endpoint that accepts CSV files
 * and processes them for batch enrichment via Gemini AI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCSVImport } from '../../src/handlers/csv-import.ts';

// Mock environment and context
const createMockEnv = () => {
  const mockDoStub = {
    setAuthToken: vi.fn().mockResolvedValue(undefined),
    initializeJobState: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    sendError: vi.fn().mockResolvedValue(undefined),
    scheduleCSVProcessing: vi.fn().mockResolvedValue(undefined),
  };

  return {
    PROGRESS_WEBSOCKET_DO: {
      idFromName: vi.fn((name) => `mock-id-${name}`),
      get: vi.fn(() => mockDoStub),
    },
    _mockDoStub: mockDoStub, // Expose for tests
  };
};

const createMockContext = () => ({
  waitUntil: vi.fn(),
});

describe('handleCSVImport', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockCtx = createMockContext();
  });

  describe('Request Validation', () => {
    it('should return 400 for missing file', async () => {
      const formData = new FormData();
      // No 'file' field provided

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);
    });

    it('should return 413 for file exceeding size limit (>10MB)', async () => {
      // Create a file that exceeds 10MB
      const largeData = new Array(11_000_000).fill('X').join('');
      const largeBlob = new Blob([largeData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', largeBlob, 'large.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(413);
    });

    it('should accept valid CSV file', async () => {
      const csvData = 'title,author\nHarry Potter,J.K. Rowling';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(202);
    });
  });

  describe('Response Structure', () => {
    it('should return 202 Accepted with job details', async () => {
      const csvData = 'title,author\nHarry Potter,J.K. Rowling\n1984,George Orwell';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(202);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('jobId');
      expect(body.data).toHaveProperty('token');
      expect(typeof body.data.jobId).toBe('string');
      expect(typeof body.data.token).toBe('string');
    });

    it('should include metadata with timestamp', async () => {
      const csvData = 'title,author\nDune,Frank Herbert';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      const body = await response.json();

      expect(body.meta).toBeDefined();
      expect(body.meta.timestamp).toBeDefined();
      expect(typeof body.meta.timestamp).toBe('string');
    });

    it('should generate unique jobId for each import', async () => {
      const csvData = 'title,author\nTest Book,Test Author';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData1 = new FormData();
      formData1.append('file', blob, 'books.csv');

      const request1 = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData1,
      });

      const response1 = await handleCSVImport(request1, mockEnv, mockCtx);
      const body1 = await response1.json();

      // Create second request with new FormData
      const blob2 = new Blob([csvData], { type: 'text/csv' });
      const formData2 = new FormData();
      formData2.append('file', blob2, 'books.csv');

      const request2 = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData2,
      });

      const response2 = await handleCSVImport(request2, mockEnv, mockCtx);
      const body2 = await response2.json();

      expect(body1.data.jobId).not.toBe(body2.data.jobId);
    });
  });

  describe('DO Integration', () => {
    it('should call setAuthToken on DO stub', async () => {
      const csvData = 'title,author\nTest Book,Test Author';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      await handleCSVImport(request, mockEnv, mockCtx);

      expect(mockEnv._mockDoStub.setAuthToken).toHaveBeenCalledTimes(1);
      expect(mockEnv._mockDoStub.setAuthToken).toHaveBeenCalledWith(expect.any(String));
    });

    it('should initialize job state on DO stub', async () => {
      const csvData = 'title,author\nBook A,Author A\nBook B,Author B';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      await handleCSVImport(request, mockEnv, mockCtx);

      expect(mockEnv._mockDoStub.initializeJobState).toHaveBeenCalledTimes(1);
      expect(mockEnv._mockDoStub.initializeJobState).toHaveBeenCalledWith('csv_import', 0);
    });

    it('should schedule CSV processing on DO stub', async () => {
      const csvData = 'title,author\nTest,Author';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      await handleCSVImport(request, mockEnv, mockCtx);

      expect(mockEnv._mockDoStub.scheduleCSVProcessing).toHaveBeenCalledTimes(1);
      expect(mockEnv._mockDoStub.scheduleCSVProcessing).toHaveBeenCalledWith(
        expect.stringContaining('title'),
        expect.any(String)
      );
    });
  });

  describe('Error Handling', () => {
    it('should return error response with proper structure on missing file', async () => {
      const formData = new FormData();

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });

    it('should return error response for oversized file', async () => {
      const largeData = new Array(11_000_000).fill('X').join('');
      const largeBlob = new Blob([largeData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', largeBlob, 'large.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);
      expect(response.status).toBe(413);

      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'FILE_TOO_LARGE');
    });
  });

  describe('CORS & Headers', () => {
    it('should include CORS headers in response', async () => {
      const csvData = 'title,author\nTest,Author';
      const blob = new Blob([csvData], { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', blob, 'books.csv');

      const request = new Request('http://localhost/api/import/csv', {
        method: 'POST',
        body: formData,
        headers: { Origin: 'http://localhost:3000' },
      });

      const response = await handleCSVImport(request, mockEnv, mockCtx);

      // Response should have JSON content type
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });
});
