import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchGoogleBooks, searchOpenLibrary } from '../../src/services/external-apis.ts';

describe('Cache Key Optimization (#76)', () => {
  let mockEnv;
  let mockCtx;
  let mockCache;
  let cacheGetSpy;
  let cachePutSpy;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock cache operations
    cacheGetSpy = vi.fn().mockResolvedValue({ value: null, metadata: null });
    cachePutSpy = vi.fn().mockResolvedValue(undefined);

    mockCache = {
      get: vi.fn().mockResolvedValue(null), // Circuit breaker uses this
      put: cachePutSpy,
      getWithMetadata: cacheGetSpy, // Cache service uses this
    };

    mockEnv = {
      CACHE: mockCache,
      CACHE: mockCache,
      GOOGLE_BOOKS_API_KEY: 'test-key',
      CACHE_HOT_TTL: '7200',
      CACHE_COLD_TTL: '1209600',
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          recordEvent: vi.fn().mockResolvedValue(undefined),
        }),
      },
    };

    mockCtx = {
      waitUntil: vi.fn((promise) => promise),
    };

    // Mock fetch for external API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalItems: 40,
        items: Array.from({ length: 40 }, (_, i) => ({
          id: `book-${i}`,
          volumeInfo: {
            title: `Test Book ${i}`,
            authors: ['Test Author'],
            publishedDate: '2024',
            industryIdentifiers: [{ type: 'ISBN_13', identifier: `978000000000${i}` }],
          },
        })),
      }),
    });
  });

  describe('Google Books Search', () => {
    it('should use query-only cache key (no maxResults)', async () => {
      const query = 'harry potter';

      await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify cache key does NOT include maxResults
      // getCached calls getWithMetadata(key, 'json')
      expect(cacheGetSpy).toHaveBeenCalledWith('search:harry potter', 'json');
      expect(cacheGetSpy).not.toHaveBeenCalledWith(expect.stringContaining(':10'), expect.anything());
      expect(cacheGetSpy).not.toHaveBeenCalledWith(expect.stringContaining('max'), expect.anything());
    });

    it('should fetch 40 results on cache miss regardless of requested maxResults', async () => {
      const query = 'harry potter';

      await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify API was called with maxResults=40
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('maxResults=40'),
        expect.any(Object)
      );
    });

    it('should cache full 40 results', async () => {
      const query = 'harry potter';

      await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify cache.put was called
      expect(cachePutSpy).toHaveBeenCalled();

      // setCached wraps data as { data: value, cachedAt: timestamp, ttl: ttl }
      const cachedWrapper = JSON.parse(cachePutSpy.mock.calls[0][1]);
      expect(cachedWrapper.data.works).toHaveLength(40);
    });

    it('should filter results to requested maxResults before returning', async () => {
      const query = 'harry potter';

      const result = await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify returned result has only 10 items
      expect(result.works).toHaveLength(10);
    });

    it('should return different result counts from same cache entry', async () => {
      const query = 'harry potter';

      // First request: 10 results
      const result1 = await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);
      expect(result1.works).toHaveLength(10);

      // Mock cache hit for second request - getCached expects { data, cachedAt, ttl } format
      const cachedWrapper = cachePutSpy.mock.calls[cachePutSpy.mock.calls.length - 1][1];
      const parsedCache = JSON.parse(cachedWrapper);
      cacheGetSpy.mockResolvedValueOnce({ value: parsedCache, metadata: {} });

      // Second request: 20 results (should hit cache)
      const result2 = await searchGoogleBooks(query, { maxResults: 20 }, mockEnv, mockCtx);
      expect(result2.works).toHaveLength(20);

      // Verify cache was only written once on first request (one for data, one for circuit breaker state)
      const dataCacheWrites = cachePutSpy.mock.calls.filter(call =>
        !call[0].startsWith('circuit:')
      );
      expect(dataCacheWrites).toHaveLength(1);
    });

    it('should improve cache hit rate by sharing cache entries', async () => {
      const query = 'harry potter';

      // Simulate multiple requests with different maxResults
      await searchGoogleBooks(query, { maxResults: 5 }, mockEnv, mockCtx);

      // Mock cache hit for subsequent requests - use new cache format
      const cachedWrapper = cachePutSpy.mock.calls[cachePutSpy.mock.calls.length - 1][1];
      const parsedCache = JSON.parse(cachedWrapper);
      cacheGetSpy.mockResolvedValue({ value: parsedCache, metadata: {} });

      await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);
      await searchGoogleBooks(query, { maxResults: 15 }, mockEnv, mockCtx);
      await searchGoogleBooks(query, { maxResults: 20 }, mockEnv, mockCtx);

      // Verify only one data cache write (filter out circuit breaker writes)
      const dataCacheWrites = cachePutSpy.mock.calls.filter(call =>
        !call[0].startsWith('circuit:')
      );
      expect(dataCacheWrites).toHaveLength(1);

      // Verify multiple cache reads (4 total requests)
      expect(cacheGetSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('OpenLibrary Search', () => {
    it('should use query-only cache key (no maxResults)', async () => {
      const query = 'lord of the rings';

      // Mock OpenLibrary response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          numFound: 40,
          docs: Array.from({ length: 40 }, (_, i) => ({
            key: `/works/OL${i}W`,
            title: `Test Book ${i}`,
            author_name: ['Test Author'],
            first_publish_year: 2024,
          })),
        }),
      });

      await searchOpenLibrary(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify cache key does NOT include maxResults (includes 'ol:' prefix)
      // getCached calls getWithMetadata(key, 'json')
      expect(cacheGetSpy).toHaveBeenCalledWith('ol:search:lord of the rings', 'json');
      expect(cacheGetSpy).not.toHaveBeenCalledWith(expect.stringContaining(':10'), expect.anything());
    });

    it('should cache full 40 results for OpenLibrary', async () => {
      const query = 'lord of the rings';

      // Mock OpenLibrary response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          numFound: 40,
          docs: Array.from({ length: 40 }, (_, i) => ({
            key: `/works/OL${i}W`,
            title: `Test Book ${i}`,
            author_name: ['Test Author'],
            first_publish_year: 2024,
          })),
        }),
      });

      await searchOpenLibrary(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Verify API was called with limit=40
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=40'),
        expect.any(Object)
      );

      // Verify cached data has all 40 results
      // setCached wraps data as { data: value, cachedAt: timestamp, ttl: ttl }
      expect(cachePutSpy).toHaveBeenCalled();
      const cachedWrapper = JSON.parse(cachePutSpy.mock.calls[0][1]);
      expect(cachedWrapper.data.works).toHaveLength(40);
    });
  });

  describe('Edge Cases', () => {
    it('should handle results fewer than maxResults gracefully', async () => {
      // Mock API returning only 5 results
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 5,
          items: Array.from({ length: 5 }, (_, i) => ({
            id: `book-${i}`,
            volumeInfo: {
              title: `Test Book ${i}`,
              authors: ['Test Author'],
            },
          })),
        }),
      });

      const result = await searchGoogleBooks('rare book', { maxResults: 20 }, mockEnv, mockCtx);

      // Should return all 5 results (not try to slice to 20)
      expect(result.works).toHaveLength(5);
    });

    it('should handle maxResults larger than cached results', async () => {
      const query = 'test query';

      // First request caches 40 results
      await searchGoogleBooks(query, { maxResults: 10 }, mockEnv, mockCtx);

      // Mock cache hit
      const cachedData = JSON.parse(cachePutSpy.mock.calls[0][1]);
      cacheGetSpy.mockResolvedValueOnce(JSON.stringify(cachedData));

      // Request 50 results (more than cached 40)
      const result = await searchGoogleBooks(query, { maxResults: 50 }, mockEnv, mockCtx);

      // Should return all 40 cached results (not try to slice to 50)
      expect(result.works).toHaveLength(40);
    });
  });
});
