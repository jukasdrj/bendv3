// test/kv-cache.test.js
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { KVCacheService } from '../src/services/kv-cache.js';
import { CacheConfig } from '../src/config/cache.ts';

describe('KVCacheService', () => {
  let service;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CACHE: {
        getWithMetadata: async () => ({ value: null, metadata: null }),
        put: async () => {},
      },
      CACHE_TTL_TITLE: '604800',
      CACHE_TTL_ISBN: '31536000',
      CACHE_TTL_AUTHOR: '604800',
      CACHE_TTL_ENRICHMENT: '15552000',
      CACHE_TTL_COVER: '31536000',
    };
    service = new KVCacheService(mockEnv);
  });

  test('initializes correctly and uses CacheConfig for TTLs', () => {
    // Verify that the service is initialized
    expect(service).toBeInstanceOf(KVCacheService);
    // check that ttls are not hardcoded
    expect(service.ttls).toBeUndefined();
  });

  test('get returns null on cache miss', async () => {
    const result = await service.get('search:title:q=nonexistent', 'title');
    expect(result).toBeNull();
  });

  test('assessDataQuality returns 1.0 for complete data', () => {
    const data = {
      items: [
        {
          volumeInfo: {
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '123' }],
            imageLinks: { thumbnail: 'http://example.com/cover.jpg' },
            description: 'A'.repeat(150)
          }
        }
      ]
    };
    const quality = service.assessDataQuality(data);
    expect(quality).toBe(1.0);
  });

  test('assessDataQuality returns 0.4 for ISBN-only data', () => {
    const data = {
      items: [
        {
          volumeInfo: {
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '123' }]
          }
        }
      ]
    };
    const quality = service.assessDataQuality(data);
    expect(quality).toBe(0.4);
  });

  test('adjustTTLByQuality doubles TTL for high quality (>0.8)', () => {
    const baseTTL = 3600;
    const adjusted = service.adjustTTLByQuality(baseTTL, 0.9);
    expect(adjusted).toBe(7200);
  });

  test('adjustTTLByQuality halves TTL for low quality (<0.4)', () => {
    const baseTTL = 3600;
    const adjusted = service.adjustTTLByQuality(baseTTL, 0.3);
    expect(adjusted).toBe(1800);
  });

  test('set uses smart TTL for high-quality data', async () => {
    const cacheKey = 'search:title:q=test';
    const highQualityData = {
      items: [
        {
          volumeInfo: {
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '123' }],
            imageLinks: { thumbnail: 'http://example.com/cover.jpg' },
            description: 'A'.repeat(150)
          }
        }
      ]
    };

    let capturedTTL;
    mockEnv.CACHE.put = vi.fn(async (key, value, options) => {
      capturedTTL = options.expirationTtl;
    });

    await service.set(cacheKey, highQualityData, 'title');

    const expectedBaseTTL = CacheConfig.getTTL('title', mockEnv);
    expect(capturedTTL).toBe(expectedBaseTTL * 2);
  });
});
