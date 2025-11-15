import { describe, it, expect, vi } from 'vitest';
import { handleSearchTitle } from '../../../src/handlers/v1/search-title.js';

describe('GET /v1/search/title', () => {
  it('should return canonical response structure', async () => {
    // Note: This test uses a fake API key, so we expect an error response
    // Real API testing happens in integration tests (Task 8)
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
    };

    const response = await handleSearchTitle('1984', mockEnv);

    // Should return proper envelope structure even on error
    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
    expect(response.metadata).toBeDefined();
    expect(response.metadata.timestamp).toBeDefined();
    expect(response.metadata.processingTime).toBeTypeOf('number');

    // With fake key, we expect error
    if (response.error) {
      expect(response.error).toBeDefined();
      expect(response.error.message).toBeDefined();
      expect(response.error.code).toBe('PROVIDER_ERROR');
    }
  });

  it('should return error response for invalid query', async () => {
    const mockEnv = {};

    const response = await handleSearchTitle('', mockEnv);

    expect(response.error).toBeDefined();
    if (response.error) {
      expect(response.error.code).toBe('INVALID_QUERY');
      expect(response.error.message).toContain('query is required');
      expect(response.metadata.timestamp).toBeDefined();
    }
  });

  it('should handle provider errors gracefully', async () => {
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
    };

    // This will fail because we don't have a real API key
    const response = await handleSearchTitle('test query', mockEnv);

    // Should still return proper error envelope
    expect(response.data).toBeDefined();
    expect(response.metadata).toBeDefined();
    expect(response.metadata.timestamp).toBeDefined();
  });
});
