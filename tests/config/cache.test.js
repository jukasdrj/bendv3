// tests/config/cache.test.js
import { describe, test, expect, beforeEach } from 'vitest';
import { CacheConfig, DEFAULT_CACHE_TTL } from '../../src/config/cache.js';

describe('CacheConfig', () => {
  describe('DEFAULT_CACHE_TTL', () => {
    test('should have correct default values', () => {
      expect(DEFAULT_CACHE_TTL.isbn).toBe(365 * 24 * 60 * 60); // 365 days
      expect(DEFAULT_CACHE_TTL.title).toBe(7 * 24 * 60 * 60); // 7 days
      expect(DEFAULT_CACHE_TTL.author).toBe(7 * 24 * 60 * 60); // 7 days
      expect(DEFAULT_CACHE_TTL.enrichment).toBe(180 * 24 * 60 * 60); // 180 days
      expect(DEFAULT_CACHE_TTL.cover).toBe(365 * 24 * 60 * 60); // 365 days
      expect(DEFAULT_CACHE_TTL.hot).toBe(2 * 60 * 60); // 2 hours
      expect(DEFAULT_CACHE_TTL.cold).toBe(14 * 24 * 60 * 60); // 14 days
    });
  });

  describe('getTTL', () => {
    test('should return default value when no env provided', () => {
      expect(CacheConfig.getTTL('isbn')).toBe(365 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('title')).toBe(7 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('author')).toBe(7 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('enrichment')).toBe(180 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('cover')).toBe(365 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('hot')).toBe(2 * 60 * 60);
      expect(CacheConfig.getTTL('cold')).toBe(14 * 24 * 60 * 60);
    });

    test('should return default value when env is empty object', () => {
      const env = {};
      expect(CacheConfig.getTTL('isbn', env)).toBe(365 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('title', env)).toBe(7 * 24 * 60 * 60);
    });

    test('should use environment variable when provided', () => {
      const env = {
        CACHE_TTL_ISBN: '1000',
        CACHE_TTL_TITLE: '2000',
      };
      expect(CacheConfig.getTTL('isbn', env)).toBe(1000);
      expect(CacheConfig.getTTL('title', env)).toBe(2000);
    });

    test('should fall back to default for invalid env values', () => {
      const env = {
        CACHE_TTL_ISBN: 'invalid',
        CACHE_TTL_TITLE: '-100',
      };
      expect(CacheConfig.getTTL('isbn', env)).toBe(365 * 24 * 60 * 60);
      expect(CacheConfig.getTTL('title', env)).toBe(7 * 24 * 60 * 60);
    });

    test('should return title TTL for unknown types', () => {
      expect(CacheConfig.getTTL('unknown')).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('getAllTTLs', () => {
    test('should return all default TTLs when no env provided', () => {
      const ttls = CacheConfig.getAllTTLs();
      expect(ttls.isbn).toBe(365 * 24 * 60 * 60);
      expect(ttls.title).toBe(7 * 24 * 60 * 60);
      expect(ttls.author).toBe(7 * 24 * 60 * 60);
      expect(ttls.enrichment).toBe(180 * 24 * 60 * 60);
      expect(ttls.cover).toBe(365 * 24 * 60 * 60);
      expect(ttls.hot).toBe(2 * 60 * 60);
      expect(ttls.cold).toBe(14 * 24 * 60 * 60);
    });

    test('should use environment variables when provided', () => {
      const env = {
        CACHE_TTL_ISBN: '5000',
        CACHE_TTL_TITLE: '6000',
      };
      const ttls = CacheConfig.getAllTTLs(env);
      expect(ttls.isbn).toBe(5000);
      expect(ttls.title).toBe(6000);
      expect(ttls.author).toBe(7 * 24 * 60 * 60); // Default
    });
  });

  describe('getHotTTL', () => {
    test('should return default hot TTL when no env provided', () => {
      expect(CacheConfig.getHotTTL()).toBe(2 * 60 * 60);
    });

    test('should use CACHE_HOT_TTL for backward compatibility', () => {
      const env = {
        CACHE_HOT_TTL: '3600',
      };
      expect(CacheConfig.getHotTTL(env)).toBe(3600);
    });

    test('should use CACHE_TTL_HOT when CACHE_HOT_TTL not present', () => {
      const env = {
        CACHE_TTL_HOT: '5000',
      };
      expect(CacheConfig.getHotTTL(env)).toBe(5000);
    });

    test('should prefer CACHE_HOT_TTL over CACHE_TTL_HOT', () => {
      const env = {
        CACHE_HOT_TTL: '3600',
        CACHE_TTL_HOT: '5000',
      };
      expect(CacheConfig.getHotTTL(env)).toBe(3600);
    });
  });

  describe('getColdTTL', () => {
    test('should return default cold TTL when no env provided', () => {
      expect(CacheConfig.getColdTTL()).toBe(14 * 24 * 60 * 60);
    });

    test('should use CACHE_COLD_TTL for backward compatibility', () => {
      const env = {
        CACHE_COLD_TTL: '86400',
      };
      expect(CacheConfig.getColdTTL(env)).toBe(86400);
    });

    test('should use CACHE_TTL_COLD when CACHE_COLD_TTL not present', () => {
      const env = {
        CACHE_TTL_COLD: '100000',
      };
      expect(CacheConfig.getColdTTL(env)).toBe(100000);
    });

    test('should prefer CACHE_COLD_TTL over CACHE_TTL_COLD', () => {
      const env = {
        CACHE_COLD_TTL: '86400',
        CACHE_TTL_COLD: '100000',
      };
      expect(CacheConfig.getColdTTL(env)).toBe(86400);
    });
  });
});
