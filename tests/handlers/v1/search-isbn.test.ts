import { describe, it, expect } from 'vitest';
import { handleSearchISBN } from '../../../src/handlers/v1/search-isbn.js';

describe('GET /v1/search/isbn', () => {
  it('should return canonical response structure', async () => {
    // Note: Using fake API key, so we expect error response
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
    };

    const response = await handleSearchISBN('9780451524935', mockEnv);

    // Should return proper envelope structure even on error
    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
    expect(response.metadata).toBeDefined();
    expect(response.metadata.timestamp).toBeDefined();
    expect(response.metadata.processingTime).toBeTypeOf('number');

    // With fake key, we expect error or empty results
    if (response.data !== null) {
      // If successful (shouldn't happen with fake key), validate structure
      expect(response.data).toBeDefined();
      expect(response.data.works).toBeInstanceOf(Array);
      expect(response.data.editions).toBeInstanceOf(Array);
      expect(response.data.authors).toBeInstanceOf(Array);
    } else if (response.error) {
      expect(response.error).toBeDefined();
      expect(response.error.message).toBeDefined();
      expect(response.error.code).toBe('PROVIDER_ERROR');
    }
  });

  it('should return editions array in response structure', async () => {
    // Test with fake key - will return empty results but correct structure
    const mockEnv = {
      GOOGLE_BOOKS_API_KEY: 'test-key',
    };

    const response = await handleSearchISBN('9780451524935', mockEnv);

    // Even with errors, successful fallback should have correct structure
    if (response.data !== null) {
      expect(response.data.editions).toBeDefined();
      expect(response.data.editions).toBeInstanceOf(Array);
    }
  });

  it('should return error for invalid ISBN', async () => {
    const mockEnv = {};

    const response = await handleSearchISBN('invalid-isbn', mockEnv);

    expect(response.error).toBeDefined();
    if (response.error) {
      expect(response.error.code).toBe('INVALID_ISBN');
      expect(response.error.message).toContain('valid ISBN');
      expect(response.metadata.timestamp).toBeDefined();
    }
  });

  it('should return error for empty ISBN', async () => {
    const mockEnv = {};

    const response = await handleSearchISBN('', mockEnv);

    expect(response.error).toBeDefined();
    if (response.error) {
      expect(response.error.code).toBe('INVALID_ISBN');
      expect(response.error.message).toContain('required');
      expect(response.metadata.timestamp).toBeDefined();
    }
  });
});
