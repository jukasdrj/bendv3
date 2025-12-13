import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBookCover, selectBestCoverURL, queueCoverProcessing } from '../../src/services/alexandria-cover-service';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Alexandria Cover Service', () => {
  let env;

  beforeEach(() => {
    env = {
      ALEXANDRIA_CLIENT_ID: 'test-client-id',
      ALEXANDRIA_CLIENT_SECRET: 'test-client-secret',
    };
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('processBookCover', () => {
    const request = {
      work_key: 'OL123W',
      provider_url: 'http://example.com/image.jpg',
      isbn: '9781234567890',
    };

    it('should successfully process a cover and return URLs', async () => {
      const mockResponse = {
        success: true,
        urls: {
          large: 'http://alexandria/large.jpg',
          medium: 'http://alexandria/medium.jpg',
          small: 'http://alexandria/small.jpg',
        },
        metadata: {
          processedAt: new Date().toISOString(),
          originalSize: 1024,
          r2Key: 'test/key',
          sourceUrl: 'http://example.com/image.jpg',
          workKey: 'OL123W',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await processBookCover(request, env);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://alexandria.ooheynerds.com/api/covers/process',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'CF-Access-Client-Id': 'test-client-id',
            'CF-Access-Client-Secret': 'test-client-secret',
          }),
          body: JSON.stringify(request),
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should return placeholder on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Error message',
      });

      // Increase timeout for this test if needed, or rely on internal logic.
      // The internal logic awaits response, if response comes back quickly (as mocked), it shouldn't timeout.
      // The previous timeout was likely due to the retry logic (if 500 triggered retries) and advancing timers incorrectly or not enough.
      // However, the code says:
      // if (!response.ok) return createPlaceholderResponse
      // So it shouldn't retry on 500?
      // Wait, processBookCover calls processBookCoverInternal.
      // processBookCoverInternal returns placeholder on error (response.ok is false).
      // processBookCover then checks result.success.
      // if (!result.success && !result.error?.includes('Domain not allowed')) -> RETRY.
      // The placeholder response has success: false.
      // So it DOES retry on 500.

      // We need to advance timers to make the retry backoff happen.

      const processPromise = processBookCover(request, env);

      // Advance timers to skip all backoff delays
      await vi.advanceTimersByTimeAsync(10000);

      const result = await processPromise;

      expect(result.success).toBe(false);
      expect(result.urls.large).toContain('placehold.co');
      expect(result.error).toBe('Cover processing failed - using placeholder');
    });

    it('should retry on failure with exponential backoff', async () => {
      // Fail first attempt
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Unavailable',
      });

      // Succeed second attempt
      const mockResponse = {
        success: true,
        urls: { large: 'http://alexandria/large.jpg' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const processPromise = processBookCover(request, env);

      // Advance timers to skip the backoff delay
      await vi.advanceTimersByTimeAsync(500);

      const result = await processPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should not retry if error is "Domain not allowed"', async () => {
       const mockResponse = {
        success: false,
        error: 'Domain not allowed: example.com',
        urls: { large: 'placeholder' }
      };

      mockFetch.mockResolvedValue({
        ok: true, // The API returns 200 OK but with success: false for business logic errors like this
        json: async () => mockResponse,
      });

      const result = await processBookCover(request, env);

      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
      expect(result.success).toBe(false);
      expect(result.error).toContain('Domain not allowed');
    });

    it('should handle timeout correctly', async () => {
        // Mock a request that never resolves (or takes too long)
        // We simulate AbortError which is what happens when controller.abort() is called.
        // But we need to make sure the implementation actually times out.

        // The implementation uses setTimeout to call controller.abort().
        // We need to trigger that timeout.

        mockFetch.mockImplementation(() => new Promise((resolve, reject) => {
            // Wait for signal
            // But we can just simulate the rejection that fetch would throw when aborted
        }));

        // We can't easily mock the signal abort triggering the fetch rejection unless we use a real fetch or a sophisticated mock.
        // Easier path: Mock fetch to reject with AbortError when we want to simulate timeout behavior from the *perspective of the catch block*.

        // However, the test is about the timeout logic *inside* processBookCoverInternal.
        // It sets a timeout.

        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';

        // Spy on AbortController
        // const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

        // If we want to verify the timeout logic triggers the abort:
        // We need fetch to pend.
        let rejectFetch;
        mockFetch.mockReturnValue(new Promise((resolve, reject) => {
             rejectFetch = reject;
        }));

        const processPromise = processBookCover(request, env, 0); // 0 retries

        // Advance time to trigger the timeout inside processBookCoverInternal
        vi.advanceTimersByTime(6000);

        // Now we need to manually reject the fetch because our mock fetch is dumb and doesn't know about the signal.
        // In reality, fetch would reject when signal is aborted.
        rejectFetch(abortError);

        const result = await processPromise;

        expect(result.success).toBe(false);
        expect(result.urls.large).toContain('placehold.co');
        // Check logs to see if "Request timeout" was logged if we want to be thorough
    });

    it('should warn if credentials are missing', async () => {
        const noCredsEnv = {};
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, urls: {} })
        });

        await processBookCover(request, noCredsEnv as any);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing ALEXANDRIA_CLIENT_ID'));
    });
  });

  describe('selectBestCoverURL', () => {
    it('should prioritize ISBNdb', () => {
      const providers = {
        isbndb: { image: 'http://isbndb/image.jpg' },
        googleBooks: { volumeInfo: { imageLinks: { thumbnail: 'http://google/thumb.jpg' } } },
      };

      const result = selectBestCoverURL(providers);
      expect(result).toEqual({
        url: 'http://isbndb/image.jpg',
        source: 'isbndb',
        quality: 'high',
      });
    });

    it('should fall back to Google Books zoom=3 if ISBNdb is missing', () => {
      const providers = {
        googleBooks: { volumeInfo: { imageLinks: { thumbnail: 'http://google/thumb.jpg?zoom=1' } } },
      };

      const result = selectBestCoverURL(providers);
      expect(result).toEqual({
        url: 'http://google/thumb.jpg?zoom=3',
        source: 'google-books',
        quality: 'high',
      });
    });

    it('should use Alexandria if available', () => {
        const providers = {
            alexandria: { urls: { large: 'http://alexandria/large.jpg' } }
        };

        const result = selectBestCoverURL(providers);
        expect(result).toEqual({
            url: 'http://alexandria/large.jpg',
            source: 'alexandria',
            quality: 'medium',
        });
    });

    it('should use OpenLibrary cover_i as fallback', () => {
        const providers = {
            openLibrary: { cover_i: 12345 }
        };

        const result = selectBestCoverURL(providers);
        expect(result).toEqual({
            url: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
            source: 'openlibrary',
            quality: 'medium',
        });
    });

    it('should return placeholder if no covers available', () => {
        const providers = {};
        const result = selectBestCoverURL(providers);
        expect(result.quality).toBe('missing');
        expect(result.url).toContain('placehold.co');
    });
  });

  describe('queueCoverProcessing', () => {
    const request = {
      work_key: 'OL123W',
      provider_url: 'http://example.com/image.jpg',
      isbn: '9781234567890',
    };

    it('should queue via service binding if ALEXANDRIA_COVER_QUEUE exists', async () => {
      const mockQueueSend = vi.fn().mockResolvedValue(undefined);
      const envWithBinding = {
        ...env,
        ALEXANDRIA_COVER_QUEUE: {
          send: mockQueueSend,
        },
      };

      const result = await queueCoverProcessing(request, envWithBinding as any, 'high');

      expect(result.queued).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockQueueSend).toHaveBeenCalledWith(
        expect.objectContaining({
          isbn: request.isbn,
          work_key: request.work_key,
          provider_url: request.provider_url,
          priority: 'high',
        })
      );
    });

    it('should fall back to HTTP if service binding fails', async () => {
      const mockQueueSend = vi.fn().mockRejectedValue(new Error('Queue send failed'));
      const envWithBinding = {
        ...env,
        ALEXANDRIA_COVER_QUEUE: {
          send: mockQueueSend,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await queueCoverProcessing(request, envWithBinding as any, 'normal');

      expect(result.queued).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://alexandria.ooheynerds.com/api/covers/queue',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'CF-Access-Client-Id': 'test-client-id',
            'CF-Access-Client-Secret': 'test-client-secret',
          }),
        })
      );
    });

    it('should queue via HTTP if no service binding exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await queueCoverProcessing(request, env as any, 'low');

      expect(result.queued).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://alexandria.ooheynerds.com/api/covers/queue',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ...request, priority: 'low' }),
        })
      );
    });

    it('should return error if HTTP request fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const result = await queueCoverProcessing(request, env as any);

      expect(result.queued).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should return error if network request throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await queueCoverProcessing(request, env as any);

      expect(result.queued).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should warn if credentials are missing', async () => {
      const noCredsEnv = {};
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await queueCoverProcessing(request, noCredsEnv as any);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing ALEXANDRIA_CLIENT_ID'));
    });

    it('should use default priority of "normal" if not specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await queueCoverProcessing(request, env as any);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.priority).toBe('normal');
    });
  });
});
