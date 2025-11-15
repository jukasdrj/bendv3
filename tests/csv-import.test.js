// test/csv-import.test.js
import { describe, test, expect, vi } from 'vitest';
import { handleCSVImport, processCSVImport } from '../src/handlers/csv-import.js';

describe('CSV Import Handler', () => {
  test('POST /api/import/csv-gemini returns jobId', async () => {
    const formData = new FormData();
    formData.append('file', new File(['Title,Author\nBook1,Author1'], 'test.csv'));

    const request = new Request('http://localhost/api/import/csv-gemini', {
      method: 'POST',
      body: formData
    });

    const mockEnv = {
      PROGRESS_WEBSOCKET_DO: {
        idFromName: vi.fn(() => 'do-id'),
        get: vi.fn(() => ({
          setAuthToken: vi.fn().mockResolvedValue(undefined),
          initializeJobState: vi.fn().mockResolvedValue(undefined),
          scheduleCSVProcessing: vi.fn().mockResolvedValue(undefined),
          ready: vi.fn().mockResolvedValue(undefined),
          updateProgress: vi.fn().mockResolvedValue(undefined),
          complete: vi.fn().mockResolvedValue(undefined),
          fail: vi.fn().mockResolvedValue(undefined)
        }))
      },
      ctx: { waitUntil: vi.fn() }
    };

    const response = await handleCSVImport(request, mockEnv);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.data).toBeDefined();
    expect(body.data.jobId).toBeDefined();
    expect(body.metadata).toBeDefined();
    expect(body.metadata.timestamp).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  test('rejects files larger than 10MB', async () => {
    const largeContent = 'x'.repeat(11 * 1024 * 1024);
    const formData = new FormData();
    formData.append('file', new File([largeContent], 'large.csv'));

    const request = new Request('http://localhost/api/import/csv-gemini', {
      method: 'POST',
      body: formData
    });

    const response = await handleCSVImport(request, {});
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.data).toBeNull();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain('too large');
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(body.metadata.timestamp).toBeDefined();
  });
});
